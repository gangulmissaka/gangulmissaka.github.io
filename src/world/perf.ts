/**
 * Adaptive quality: pick a sensible starting tier from the device, then keep watching the real frame time
 * and trade resolution / effects for smoothness (and win them back when there is headroom).
 * Nothing in the world is removed on a weak device: the same scene is drawn, just with cheaper versions
 * of the expensive effects.
 */

export type Tier = 0 | 1 | 2; // 0 = low, 1 = medium, 2 = high
export type QualityMode = 'auto' | 'low' | 'medium' | 'high';
export const QUALITY_MODES: QualityMode[] = ['auto', 'low', 'medium', 'high'];
export const TIER_NAMES = ['low', 'medium', 'high'] as const;

export interface TierSettings {
  /** Highest / lowest render resolution (device pixels per CSS pixel) the governor may use. */
  maxPixelRatio: (dpr: number) => number;
  minPixelRatio: number;
  /** 'full' = 4x MSAA + bloom, 'lite' = 2x MSAA + half-res bloom, 'off' = render straight to screen. */
  post: 'full' | 'lite' | 'off';
  shadows: boolean;
  shadowMapSize: number;
  /** Re-render the shadow map every n-th frame (it follows the car, so 2 is invisible in practice). */
  shadowEvery: number;
  grass: number; // fraction of grass blades
  physicsStep: number;
  physicsMaxSub: number;
  hudInterval: number; // seconds between React HUD refreshes
  lowDetailAnim: boolean;
}

export const TIERS: Record<Tier, TierSettings> = {
  0: {
    maxPixelRatio: (d) => Math.min(d, 0.9),
    minPixelRatio: 0.5,
    post: 'off',
    shadows: false,
    shadowMapSize: 1024,
    shadowEvery: 1,
    grass: 0.3,
    physicsStep: 1 / 75,
    physicsMaxSub: 4,
    hudInterval: 0.2,
    lowDetailAnim: true,
  },
  1: {
    maxPixelRatio: (d) => Math.min(d, 1.15),
    minPixelRatio: 0.7,
    post: 'lite',
    shadows: true,
    shadowMapSize: 1024,
    shadowEvery: 2,
    grass: 0.6,
    physicsStep: 1 / 90,
    physicsMaxSub: 6,
    hudInterval: 0.12,
    lowDetailAnim: false,
  },
  2: {
    maxPixelRatio: (d) => Math.min(d, 1.5),
    minPixelRatio: 0.9,
    post: 'full',
    shadows: true,
    shadowMapSize: 2048,
    shadowEvery: 1,
    grass: 1,
    physicsStep: 1 / 120,
    physicsMaxSub: 10,
    hudInterval: 0.08,
    lowDetailAnim: false,
  },
};

const SAVED_KEY = 'world-quality-mode';

export function readSavedMode(): QualityMode {
  try {
    const q = new URLSearchParams(window.location.search).get('q');
    if (q === 'low' || q === 'medium' || q === 'high' || q === 'auto') return q;
    const s = window.localStorage.getItem(SAVED_KEY);
    if (s === 'low' || s === 'medium' || s === 'high' || s === 'auto') return s;
  } catch {
    /* storage can be blocked */
  }
  return 'auto';
}

export function saveMode(m: QualityMode) {
  try {
    window.localStorage.setItem(SAVED_KEY, m);
  } catch {
    /* ignore */
  }
}

export function modeToTier(m: QualityMode): Tier | null {
  return m === 'low' ? 0 : m === 'medium' ? 1 : m === 'high' ? 2 : null;
}

/** Best guess at how strong this device is, before a single frame has been drawn. */
export function detectStartTier(): Tier {
  let tier: Tier = 2;
  const nav = navigator as Navigator & { deviceMemory?: number };
  const cores = nav.hardwareConcurrency || 4;
  const mem = nav.deviceMemory || 8;
  const touch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
  const small = Math.min(window.screen.width, window.screen.height) < 900;
  const dpr = window.devicePixelRatio || 1;

  let gpu = '';
  try {
    const c = document.createElement('canvas');
    const gl = (c.getContext('webgl2') || c.getContext('webgl')) as WebGLRenderingContext | null;
    const ext = gl?.getExtension('WEBGL_debug_renderer_info');
    if (gl && ext) gpu = String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) || '').toLowerCase();
    gl?.getExtension('WEBGL_lose_context')?.loseContext();
  } catch {
    /* fall through to the heuristics below */
  }

  if (/swiftshader|llvmpipe|software|basic render|softpipe|microsoft basic/.test(gpu)) return 0;
  if (/mali-4|mali-t|adreno \(tm\) ?[2-4]\d\d|powervr|videocore|vivante|intel.*(gma|hd graphics [2-5]\d{2}\b)/.test(gpu)) return 0;
  if (/intel|uhd|iris|mali|adreno|apple gpu/.test(gpu)) tier = 1;
  if (/nvidia|geforce|rtx|gtx|radeon rx|radeon pro/.test(gpu) && !/mx\d|gt ?[1-7]\d\d\b/.test(gpu)) tier = 2;

  if (mem <= 2 || cores <= 2) tier = 0;
  else if (mem <= 4 || cores <= 4) tier = Math.min(tier, 1) as Tier;
  if (touch && small) tier = Math.min(tier, 1) as Tier; // phones: start safe, the governor can promote
  if (dpr >= 2.5 && touch) tier = Math.min(tier, 1) as Tier;
  return tier;
}

export interface GovernorState {
  tier: Tier;
  pixelRatio: number;
}

/**
 * Watches frame times. Slow: lower the resolution first (cheapest, least visible), then drop a tier.
 * Fast for a long while: raise the resolution, then (if that tier hasn't already failed) try the next tier.
 */
export function createGovernor(opts: {
  startTier: Tier;
  dpr: number;
  onChange: (s: GovernorState) => void;
}) {
  const { dpr, onChange } = opts;
  let tier = opts.startTier;
  let pr = TIERS[tier].maxPixelRatio(dpr);
  let enabled = true;
  const failed = new Set<Tier>(); // tiers that proved too slow on this device
  let sinceChange = 0; // seconds
  let winTime = 0;
  let winFrames = 0;
  let slowWins = 0;
  let fastWins = 0;
  let avgMs = 16.7;

  const emit = () => onChange({ tier, pixelRatio: pr });
  const quant = (v: number) => Math.round(v * 20) / 20;

  return {
    get tier() {
      return tier;
    },
    get pixelRatio() {
      return pr;
    },
    get avgMs() {
      return avgMs;
    },
    get enabled() {
      return enabled;
    },
    /** Manual mode: fixed tier, full resolution for it. Auto mode: resume watching from the current tier. */
    setMode(mode: QualityMode) {
      const fixed = modeToTier(mode);
      enabled = fixed === null;
      if (fixed !== null) {
        tier = fixed;
        pr = TIERS[tier].maxPixelRatio(dpr);
      } else {
        failed.clear();
      }
      sinceChange = 0;
      winTime = winFrames = slowWins = fastWins = 0;
      emit();
    },
    /** Call once per frame with the real (unclamped) frame time in seconds. */
    frame(rawDt: number) {
      if (rawDt > 2.5) {
        // tab switch / one-off stall: not representative (a genuinely slow device is 0.1 - 2 s per frame)
        winTime = winFrames = 0;
        return;
      }
      sinceChange += rawDt;
      winTime += rawDt;
      winFrames++;
      if (winTime < 1) return;
      avgMs = (winTime / winFrames) * 1000;
      winTime = winFrames = 0;
      if (!enabled || sinceChange < 3) return; // warm-up after load / after a change

      const t = TIERS[tier];
      if (avgMs > 23) {
        fastWins = 0;
        slowWins++;
        // react quickly when it is really bad
        if (slowWins >= (avgMs > 40 ? 1 : 2)) {
          slowWins = 0;
          const step = avgMs > 40 ? 0.25 : 0.12;
          if (pr > t.minPixelRatio + 0.01) {
            pr = quant(Math.max(t.minPixelRatio, pr - step));
          } else if (tier > 0) {
            failed.add(tier);
            tier = (tier - 1) as Tier;
            pr = TIERS[tier].maxPixelRatio(dpr);
          } else return;
          sinceChange = 0;
          emit();
        }
      } else if (avgMs < 15.5) {
        slowWins = 0;
        fastWins++;
        if (fastWins >= 6) {
          fastWins = 0;
          const max = t.maxPixelRatio(dpr);
          if (pr < max - 0.01) {
            pr = quant(Math.min(max, pr + 0.1));
          } else if (tier < 2 && !failed.has((tier + 1) as Tier)) {
            tier = (tier + 1) as Tier;
            pr = TIERS[tier].minPixelRatio + 0.15;
            pr = Math.min(pr, TIERS[tier].maxPixelRatio(dpr));
          } else return;
          sinceChange = 0;
          emit();
        }
      } else {
        slowWins = 0;
        fastWins = 0;
      }
    },
  };
}
