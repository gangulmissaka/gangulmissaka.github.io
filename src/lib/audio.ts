// Procedural sound engine (Web Audio API) — every sound is synthesised, no audio files.
//
//   master ─┬─ car bus      engine, tyres on grass / dirt / wood, skids, wind, boost whine
//           ├─ sfx bus      impacts (wood, metal, pins, stone, houses, foliage, landings), horn, chimes
//           └─ ambience bus breeze, birds, pond water
//
// The game loop calls `update()` every frame with the vehicle state; one-shots are fired
// from collisions and UI events.

export type Surface = 'grass' | 'dirt' | 'wood' | 'water' | 'air';
export type ImpactKind = 'wood' | 'metal' | 'pin' | 'stone' | 'house' | 'foliage' | 'ground';

export interface DriveState {
  engineOn: boolean;
  speed: number; // m/s, absolute
  throttle: number; // -1..1
  braking: boolean;
  boost: boolean;
  surface: Surface;
  skid: number; // 0..1
  /** Distance (m) and stereo pan (-1..1) of the pond, for the water ambience. */
  pondDistance: number;
  pondPan: number;
}

declare global {
  interface Window {
    __worldAudioCtx?: AudioContext;
  }
}

// When this module is re-evaluated (hot reload / remount), shut down the previous audio
// context so a stale engine can never keep humming or hissing in the background.
if (typeof window !== 'undefined' && window.__worldAudioCtx) {
  void window.__worldAudioCtx.close().catch(() => {});
  window.__worldAudioCtx = undefined;
}

const GEAR_TOP = [7, 13, 20, 28, 40]; // m/s at which each gear tops out
/**
 * Master level of every vehicle sound (engine, tyres, wind, skids, water). The car bus skips the
 * master compressor (which used to squash any volume change on a constantly loud engine), so
 * this value is exactly what you hear.
 */
const CAR_VOLUME = 0.45;
/** Extra trim on the engine voices themselves. */
const ENGINE_TRIM = 0.6;
const IDLE_RPM = 650;
const MAX_RPM = 4300;

const rand = (a: number, b: number) => a + Math.random() * (b - a);
const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

class AudioEngine {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private carBus!: GainNode;
  /** Output for the car bus, after the compressor (follows mute / duck like the master). */
  private carMaster!: GainNode;
  private sfxBus!: GainNode;
  private ambBus!: GainNode;
  private echo!: GainNode; // short slap-back for chimes / horn
  private muted = false;

  private white!: AudioBuffer;
  private brown!: AudioBuffer;
  private gravel!: AudioBuffer;

  // engine
  private engOsc: OscillatorNode[] = [];
  private engFilter!: BiquadFilterNode;
  private engGain!: GainNode;
  private engNoiseFilter!: BiquadFilterNode;
  private engNoiseGain!: GainNode;
  private whineOsc!: OscillatorNode;
  private whineGain!: GainNode;
  private running = false;
  private cranking = false;
  private flareUntil = 0;
  private rpm = 0;
  private gear = 0;

  // tyre / surface layers
  private grassGain!: GainNode;
  private grassFilter!: BiquadFilterNode;
  private dirtGain!: GainNode;
  private gravelSrc!: AudioBufferSourceNode;
  private gravelGain!: GainNode;
  private woodGain!: GainNode;
  private windGain!: GainNode;
  private skidGain!: GainNode;
  private skidFilter!: BiquadFilterNode;
  private lastSurface: Surface = 'grass';
  private plankAcc = 0;

  // ambience
  private pondGain!: GainNode;
  private waterGain!: GainNode;
  private waterFilter!: BiquadFilterNode;
  private pondPan!: StereoPannerNode;
  private pondFilter!: BiquadFilterNode;
  private nextBird = 0;
  private ambienceOn = false;

  /** Must be called from a user gesture (click / key press) before anything is audible. */
  unlock() {
    if (typeof window === 'undefined') return;
    if (!this.ctx) this.build();
    if (this.ctx && this.ctx.state === 'suspended') void this.ctx.resume();
  }

  get ready() {
    return !!this.ctx && this.ctx.state === 'running';
  }

  toggleMute() {
    this.muted = !this.muted;
    if (this.ctx) {
      this.master.gain.setTargetAtTime(this.muted ? 0 : 0.9, this.ctx.currentTime, 0.05);
      this.carMaster.gain.setTargetAtTime(this.muted ? 0 : 0.9, this.ctx.currentTime, 0.05);
    }
    return this.muted;
  }

  isEngineRunning() {
    return this.running || this.cranking;
  }

  /**
   * Lower the whole mix to `level` (0.06 while a video plays, ~0.3 under the radio), or pass
   * null to bring it back.
   */
  duck(level: number | null) {
    if (!this.ctx) return;
    const v = this.muted ? 0 : level ?? 0.9;
    this.master.gain.setTargetAtTime(v, this.ctx.currentTime, 0.25);
    this.carMaster.gain.setTargetAtTime(v, this.ctx.currentTime, 0.25);
  }

  /** Crackle of static while the radio dial moves between stations. Bypasses the duck. */
  radioStatic(dur = 0.45) {
    const ctx = this.ctx;
    if (!ctx || this.muted) return;
    const t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.white;
    const bp = this.filter('bandpass', 1700, 0.6);
    const hp = this.filter('highpass', 380);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.16, t + 0.02);
    // warble, like a dial sweeping through half-tuned stations
    for (let k = 1; k < 6; k++) g.gain.setValueAtTime(0.06 + Math.random() * 0.12, t + (k / 6) * dur * 0.9);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(bp);
    bp.connect(hp);
    hp.connect(g);
    g.connect(ctx.destination);
    src.start(t, Math.random() * (this.white.duration - dur - 0.1));
    src.stop(t + dur + 0.05);
    // a faint heterodyne whistle
    this.tone(2600, 1400, 'sine', dur * 0.8, 0.012, 0, t, 0, false, ctx.destination);
  }

  /** Immediately silence the vehicle sounds (used when the scene unmounts). */
  silence() {
    if (!this.ctx) return;
    this.running = false;
    this.cranking = false;
    this.carBus.gain.setTargetAtTime(0, this.ctx.currentTime, 0.02);
  }

  // ── Graph construction ───────────────────────────────────────────
  private build() {
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (window.__worldAudioCtx) void window.__worldAudioCtx.close().catch(() => {});
    const ctx = new AC();
    this.ctx = ctx;
    window.__worldAudioCtx = ctx;

    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -16;
    comp.knee.value = 12;
    comp.ratio.value = 4;
    comp.attack.value = 0.004;
    comp.release.value = 0.2;
    comp.connect(ctx.destination);
    this.master = ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.9;
    this.master.connect(comp);

    this.carMaster = this.gain(this.muted ? 0 : 0.9, ctx.destination);
    this.carBus = this.gain(CAR_VOLUME, this.carMaster);
    this.sfxBus = this.gain(1, this.master);
    this.ambBus = this.gain(0.8, this.master);

    // slap-back echo (gives chimes and the horn some air)
    const delay = ctx.createDelay(1);
    delay.delayTime.value = 0.16;
    const fb = this.gain(0.28, null);
    const damp = ctx.createBiquadFilter();
    damp.type = 'lowpass';
    damp.frequency.value = 2400;
    this.echo = this.gain(0.35, null);
    this.echo.connect(delay);
    delay.connect(damp);
    damp.connect(fb);
    fb.connect(delay);
    damp.connect(this.sfxBus);

    this.white = this.noiseBuffer('white');
    this.brown = this.noiseBuffer('brown');
    this.gravel = this.noiseBuffer('gravel');

    this.buildEngine();
    this.buildSurfaces();
    this.buildAmbience();
  }

  private gain(v: number, to: AudioNode | AudioParam | null) {
    const g = this.ctx!.createGain();
    g.gain.value = v;
    if (to instanceof AudioParam) g.connect(to);
    else if (to) g.connect(to);
    return g;
  }

  private filter(type: BiquadFilterType, freq: number, q = 0.7) {
    const f = this.ctx!.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    return f;
  }

  private loop(buffer: AudioBuffer, rate = 1) {
    const s = this.ctx!.createBufferSource();
    s.buffer = buffer;
    s.loop = true;
    s.playbackRate.value = rate;
    s.start(this.ctx!.currentTime + Math.random() * 0.1, Math.random() * buffer.duration);
    return s;
  }

  private noiseBuffer(kind: 'white' | 'brown' | 'gravel') {
    const ctx = this.ctx!;
    const len = ctx.sampleRate * 3;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1;
      if (kind === 'white') d[i] = w;
      else if (kind === 'brown') {
        last = (last + 0.02 * w) / 1.02;
        d[i] = last * 3.5;
      } else {
        // gravel: sparse crackles of varying size over a faint hiss
        d[i] = w * 0.04;
        if (Math.random() < 0.0016) {
          const amp = rand(0.3, 1);
          const n = Math.floor(rand(30, 220));
          for (let k = 0; k < n && i + k < len; k++) d[i + k] += (Math.random() * 2 - 1) * amp * Math.exp(-k / (n / 4));
        }
      }
    }
    return buf;
  }

  private buildEngine() {
    const ctx = this.ctx!;
    this.engGain = this.gain(0, this.carBus);
    this.engFilter = this.filter('lowpass', 400, 1.1);
    const shaper = ctx.createWaveShaper();
    const curve = new Float32Array(1024);
    for (let i = 0; i < curve.length; i++) {
      const x = (i / (curve.length - 1)) * 2 - 1;
      curve[i] = Math.tanh(x * 2.4);
    }
    shaper.curve = curve;
    shaper.connect(this.engFilter);
    this.engFilter.connect(this.engGain);
    // fundamental (firing frequency), sub-harmonic and an upper partial
    const specs: [OscillatorType, number, number][] = [
      ['sawtooth', 1, 0.5],
      ['square', 0.5, 0.35],
      ['sawtooth', 2.01, 0.12],
    ];
    this.engOsc = specs.map(([type, , g]) => {
      const o = ctx.createOscillator();
      o.type = type;
      o.frequency.value = 40;
      o.connect(this.gain(g, shaper));
      o.start();
      return o;
    });
    // mechanical / exhaust breath
    this.engNoiseFilter = this.filter('bandpass', 300, 1.6);
    this.engNoiseGain = this.gain(0, this.engGain);
    this.loop(this.brown).connect(this.engNoiseFilter);
    this.engNoiseFilter.connect(this.engNoiseGain);
    // supercharger whine for boost
    this.whineGain = this.gain(0, this.carBus);
    this.whineOsc = ctx.createOscillator();
    this.whineOsc.type = 'sine';
    this.whineOsc.frequency.value = 900;
    this.whineOsc.connect(this.whineGain);
    this.whineOsc.start();
  }

  private buildSurfaces() {
    const white = this.loop(this.white);
    const brown = this.loop(this.brown, 0.9);

    // Grass: soft high swish, amplitude wobbles like blades brushing the tyres.
    this.grassFilter = this.filter('bandpass', 2600, 0.6);
    this.grassGain = this.gain(0, this.carBus);
    const grassHp = this.filter('highpass', 900);
    white.connect(grassHp);
    grassHp.connect(this.grassFilter);
    this.grassFilter.connect(this.grassGain);

    // Dirt: low rolling rumble + gravel crackle whose rate follows speed.
    this.dirtGain = this.gain(0, this.carBus);
    const dirtLp = this.filter('lowpass', 520, 0.9);
    brown.connect(dirtLp);
    dirtLp.connect(this.dirtGain);
    this.gravelGain = this.gain(0, this.carBus);
    this.gravelSrc = this.loop(this.gravel);
    const gravelBp = this.filter('bandpass', 2200, 0.5);
    this.gravelSrc.connect(gravelBp);
    gravelBp.connect(this.gravelGain);

    // Wooden ramp: hollow boomy drone (planks clack separately).
    this.woodGain = this.gain(0, this.carBus);
    const woodBp = this.filter('bandpass', 210, 3);
    brown.connect(woodBp);
    woodBp.connect(this.woodGain);

    // Water: sloshing wash around the tyres while driving through the pond.
    this.waterGain = this.gain(0, this.carBus);
    this.waterFilter = this.filter('bandpass', 700, 0.8);
    brown.connect(this.waterFilter);
    const waterHiss = this.filter('bandpass', 2400, 1.2);
    white.connect(waterHiss);
    waterHiss.connect(this.gain(0.35, this.waterGain));
    this.waterFilter.connect(this.waterGain);

    // Wind past the car at speed.
    this.windGain = this.gain(0, this.carBus);
    const windBp = this.filter('bandpass', 700, 0.4);
    white.connect(windBp);
    windBp.connect(this.windGain);

    // Tyre skid / scrub.
    this.skidGain = this.gain(0, this.carBus);
    this.skidFilter = this.filter('bandpass', 1000, 1.8);
    white.connect(this.skidFilter);
    this.skidFilter.connect(this.skidGain);
  }

  private buildAmbience() {
    // No constant noise beds (they read as hiss when everything else is quiet) — the
    // ambience is birdsong plus the pond, which is only audible right beside it.
    // Pond: water gently lapping at the bank, positioned by the game loop.
    this.pondPan = this.ctx!.createStereoPanner();
    this.pondPan.connect(this.ambBus);
    this.pondGain = this.gain(0, this.pondPan);
    this.pondFilter = this.filter('bandpass', 900, 1.2);
    this.loop(this.brown, 0.9).connect(this.pondFilter);
    this.pondFilter.connect(this.pondGain);
    this.ambBus.gain.value = 0;
  }

  startAmbience() {
    this.unlock();
    if (!this.ctx || this.ambienceOn) return;
    this.ambienceOn = true;
    this.ambBus.gain.setTargetAtTime(0.8, this.ctx.currentTime, 1.2);
    this.nextBird = this.ctx.currentTime + rand(1, 3);
  }

  // ── Engine life-cycle ────────────────────────────────────────────
  startEngine() {
    this.unlock();
    const ctx = this.ctx;
    if (!ctx || this.running || this.cranking) return;
    this.cranking = true;
    const t = ctx.currentTime;
    // starter motor: rhythmic chugs
    for (let i = 0; i < 7; i++) {
      const at = t + i * 0.12;
      this.burst(this.brown, 'lowpass', 380, 1, 0.09, 0.28, 0, at);
      this.tone(78, 62, 'sawtooth', 0.08, 0.06, 0, at, 500);
    }
    this.tone(1200, 900, 'square', 0.05, 0.02, 0, t, 3000); // solenoid click
    window.setTimeout(() => {
      this.cranking = false;
      this.running = true;
      this.flareUntil = ctx.currentTime + 0.55; // catch and rev
    }, 820);
  }

  stopEngine() {
    if (!this.ctx) return;
    this.running = false;
    this.cranking = false;
    const t = this.ctx.currentTime;
    this.tone(55, 30, 'sine', 0.35, 0.25, 0, t + 0.7); // engine settling clunk
    this.tone(900, 700, 'square', 0.04, 0.02, 0, t + 0.9, 2500); // key-off click
  }

  // ── Per-frame update ─────────────────────────────────────────────
  update(dt: number, s: DriveState) {
    const ctx = this.ctx;
    if (!ctx) return;
    const now = ctx.currentTime;
    const set = (p: AudioParam, v: number, tc = 0.06) => p.setTargetAtTime(v, now, tc);
    const speedN = clamp01(s.speed / 26);
    // Tyre/road layers only exist while actually rolling (no residual hiss at a standstill).
    const moving = s.surface !== 'air' && s.speed > 0.5;
    // Hard gate: engine off and car stopped → the whole car bus goes silent.
    const parked = !s.engineOn && !this.cranking && s.speed < 0.3 && this.rpm < 30;
    set(this.carBus.gain, parked ? 0 : CAR_VOLUME, parked ? 0.12 : 0.04);

    // Gearbox → rpm
    let gear = GEAR_TOP.findIndex((top) => s.speed < top * 0.96);
    if (gear < 0) gear = GEAR_TOP.length - 1;
    if (gear !== this.gear && s.engineOn && this.running && gear > this.gear) {
      this.tone(160, 110, 'sine', 0.06, 0.05, 0, now, 600); // shift thunk
    }
    this.gear = gear;
    const lower = gear === 0 ? 0 : GEAR_TOP[gear - 1] * 0.6;
    const frac = clamp01((s.speed - lower) / (GEAR_TOP[gear] - lower));
    let targetRpm = IDLE_RPM + frac * (MAX_RPM - IDLE_RPM) * 0.92;
    if (s.speed < 1 && s.throttle > 0) targetRpm = 2400; // revving in place
    if (s.surface === 'air' && s.throttle > 0) targetRpm = MAX_RPM; // wheels spin free mid-air
    if (now < this.flareUntil) targetRpm = 2300;
    const on = this.running && s.engineOn;
    if (!on) targetRpm = this.cranking ? 260 : 0;
    this.rpm += (targetRpm - this.rpm) * Math.min(1, dt * (on ? 9 : 2.2));

    const rpmN = clamp01((this.rpm - IDLE_RPM) / (MAX_RPM - IDLE_RPM));
    const load = on ? clamp01(Math.max(0, s.throttle) * 0.9 + (s.boost ? 0.3 : 0)) : 0;
    const fire = Math.max(8, (this.rpm / 60) * 4) * rand(0.995, 1.005); // V8 firing frequency
    this.engOsc[0].frequency.setTargetAtTime(fire, now, 0.03);
    this.engOsc[1].frequency.setTargetAtTime(fire * 0.5 * 1.004, now, 0.03);
    this.engOsc[2].frequency.setTargetAtTime(fire * 2.01, now, 0.03);
    set(this.engFilter.frequency, 220 + rpmN * 900 + load * 1300, 0.05);
    const engLevel = (on || this.cranking ? 0.13 + load * 0.11 + rpmN * 0.07 : this.rpm > 40 ? 0.1 * (this.rpm / IDLE_RPM) : 0) * ENGINE_TRIM;
    set(this.engGain.gain, engLevel, on ? 0.05 : 0.25);
    set(this.engNoiseFilter.frequency, 180 + fire * 2.5, 0.05);
    set(this.engNoiseGain.gain, on ? (0.12 + load * 0.25) * ENGINE_TRIM : 0, 0.08);
    set(this.whineOsc.frequency, 900 + rpmN * 1600, 0.05);
    set(this.whineGain.gain, on && s.boost ? (0.02 + rpmN * 0.025) * ENGINE_TRIM : 0, 0.15);

    // Surfaces
    const onGrass = moving && s.surface === 'grass';
    const onDirt = moving && s.surface === 'dirt';
    const onWood = moving && s.surface === 'wood';
    set(this.grassGain.gain, onGrass ? 0.16 * Math.pow(speedN, 0.7) * rand(0.8, 1.2) : 0, 0.08);
    set(this.grassFilter.frequency, 2000 + speedN * 1800 + rand(-300, 300), 0.05);
    set(this.dirtGain.gain, onDirt ? 0.32 * Math.pow(speedN, 0.8) : onGrass ? 0.08 * speedN : 0, 0.08);
    set(this.gravelGain.gain, onDirt ? 0.42 * Math.pow(speedN, 0.6) : onGrass ? 0.05 * speedN : 0, 0.08);
    set(this.gravelSrc.playbackRate, 0.45 + speedN * 1.3, 0.1);
    set(this.woodGain.gain, onWood ? 0.5 * Math.pow(speedN, 0.6) : 0, 0.05);
    set(this.windGain.gain, moving ? 0.12 * speedN * speedN : 0, 0.2);
    const inWater = moving && s.surface === 'water';
    set(this.waterGain.gain, inWater ? 0.5 * Math.pow(speedN, 0.5) * rand(0.6, 1.3) : 0, 0.06);
    set(this.waterFilter.frequency, 450 + speedN * 700 + rand(-150, 150), 0.04);
    const skidF = s.surface === 'dirt' ? 1100 : s.surface === 'wood' ? 1700 : 650;
    set(this.skidFilter.frequency, skidF + rand(-120, 120), 0.04);
    set(this.skidGain.gain, moving ? clamp01(s.skid) * (s.surface === 'grass' ? 0.12 : 0.22) : 0, 0.05);

    // Wooden planks clack as the wheels roll over them.
    if (onWood && s.speed > 1) {
      this.plankAcc += s.speed * dt;
      while (this.plankAcc > 0.55) {
        this.plankAcc -= 0.55;
        this.burst(this.white, 'bandpass', rand(500, 800), 4, 0.035, 0.12 * (0.5 + speedN), 0, now + rand(0, 0.02));
      }
    }
    // A soft bump when crossing from grass onto the road and back.
    if (moving && this.lastSurface !== s.surface && s.speed > 4 && this.lastSurface !== 'air') {
      this.tone(70, 50, 'sine', 0.12, 0.08 + speedN * 0.08, 0, now);
    }
    this.lastSurface = s.surface;

    // Pond ambience
    const pond = clamp01(1 - s.pondDistance / 18);
    set(this.pondGain.gain, 0.09 * pond * pond * (0.6 + 0.4 * Math.sin(now * 0.9) * Math.sin(now * 1.7)), 0.25);
    set(this.pondPan.pan, Math.max(-1, Math.min(1, s.pondPan)), 0.1);
    set(this.pondFilter.frequency, rand(600, 1100), 0.15); // lapping

    // Birds
    if (this.ambienceOn && now > this.nextBird) {
      this.nextBird = now + rand(2.5, 8);
      this.bird();
    }
  }

  // ── One-shots ────────────────────────────────────────────────────
  /** strength 0..1; pan -1..1; level scales with distance from the camera. */
  impact(kind: ImpactKind, strength: number, pan = 0, level = 1) {
    const ctx = this.ctx;
    if (!ctx) return;
    const s = clamp01(strength);
    const g = (0.12 + 0.55 * s) * level;
    const t = ctx.currentTime;
    switch (kind) {
      case 'wood': // crates: hollow knock
        this.burst(this.white, 'bandpass', rand(700, 1100), 2.5, 0.06, g * 0.9, pan, t);
        this.tone(rand(150, 190), 120, 'triangle', 0.2, g * 0.8, pan, t, 900);
        this.tone(rand(320, 360), 300, 'sine', 0.1, g * 0.3, pan, t);
        if (s > 0.5) this.burst(this.white, 'highpass', 3000, 0.7, 0.12, g * 0.25, pan, t + 0.02); // splinter
        break;
      case 'metal': // oil drums: inharmonic ringing clang
        this.burst(this.white, 'highpass', 2500, 0.7, 0.03, g * 0.6, pan, t);
        [190, 507, 913, 1418, 2077].forEach((f, i) =>
          this.tone(f * rand(0.97, 1.03), f * 0.99, 'sine', 1.1 - i * 0.18, (g * 0.5) / (i + 1), pan, t),
        );
        this.tone(95, 70, 'sine', 0.3, g * 0.5, pan, t);
        break;
      case 'pin': // bowling pins: bright wooden tock
        this.burst(this.white, 'bandpass', rand(1400, 2000), 3, 0.035, g * 0.8, pan, t);
        this.tone(rand(560, 680), 520, 'triangle', 0.1, g * 0.6, pan, t);
        this.tone(rand(1150, 1300), 1100, 'sine', 0.07, g * 0.25, pan, t);
        break;
      case 'stone': // statues, plinths
        this.tone(85, 52, 'sine', 0.3, g * 0.9, pan, t);
        this.burst(this.brown, 'lowpass', 700, 0.8, 0.16, g * 0.9, pan, t);
        this.burst(this.white, 'bandpass', 2600, 1.2, 0.09, g * 0.35, pan, t + 0.01); // grit
        this.carCrunch(s, pan, t, level);
        break;
      case 'house': // wooden buildings, the fuel pump, the mast
        this.tone(68, 42, 'sine', 0.4, g, pan, t);
        this.burst(this.brown, 'lowpass', 320, 0.8, 0.28, g, pan, t);
        this.tone(rand(170, 210), 140, 'triangle', 0.25, g * 0.35, pan, t + 0.03, 700);
        this.carCrunch(s, pan, t, level);
        break;
      case 'foliage': // the forest edge
        this.tone(60, 40, 'sine', 0.3, g * 0.7, pan, t);
        this.burst(this.white, 'highpass', 2200, 0.5, 0.75, g * 0.45, pan, t, 0.4); // branches rustling
        for (let i = 0; i < 3 + Math.floor(s * 4); i++) {
          this.burst(this.white, 'highpass', 4000, 1, 0.012, g * 0.5, pan + rand(-0.3, 0.3), t + rand(0.02, 0.4)); // twigs
        }
        break;
      case 'ground': // landing after a jump
        this.tone(62, 38, 'sine', 0.32, g, pan, t);
        this.burst(this.brown, 'lowpass', 450, 0.8, 0.22, g * 0.9, pan, t);
        this.burst(this.gravel, 'bandpass', 2000, 0.6, 0.3, g * 0.5, pan, t);
        this.tone(rand(780, 900), 620, 'sine', 0.14, g * 0.08, pan, t + 0.05); // spring squeak
        break;
    }
  }

  /** Water splash: the car ploughing into the pond, or a koi leaping (strength 0..1). */
  splash(strength: number, pan = 0, level = 1) {
    const ctx = this.ctx;
    if (!ctx) return;
    const s = clamp01(strength);
    const g = (0.08 + 0.5 * s) * level;
    const t = ctx.currentTime;
    this.burst(this.white, 'bandpass', rand(900, 1400), 0.8, 0.25 + s * 0.5, g * 0.9, pan, t, 0.01);
    this.burst(this.brown, 'lowpass', 500, 0.7, 0.2 + s * 0.4, g * 0.8, pan, t);
    this.tone(rand(90, 120), 55, 'sine', 0.25, g * 0.6 * s, pan, t);
    // droplets falling back
    for (let i = 0; i < 3 + Math.floor(s * 8); i++) {
      const f = rand(900, 2400);
      this.tone(f, f * 1.6, 'sine', 0.05, g * 0.12, pan + rand(-0.3, 0.3), t + 0.12 + rand(0, 0.5 + s * 0.4));
    }
  }

  /** Camera shutter for photo mode. */
  shutter() {
    this.unlock();
    const ctx = this.ctx;
    if (!ctx) return;
    const t = ctx.currentTime;
    this.burst(this.white, 'highpass', 3000, 0.7, 0.03, 0.25, 0, t);
    this.burst(this.white, 'bandpass', 1800, 2, 0.04, 0.2, 0, t + 0.07);
    this.tone(2400, 1800, 'square', 0.02, 0.04, 0, t + 0.07);
  }

  /** Sheet-metal crunch layered on hard hits against solid objects. */
  private carCrunch(s: number, pan: number, t: number, level: number) {
    if (s < 0.35) return;
    const g = (0.1 + 0.35 * s) * level;
    this.burst(this.white, 'bandpass', 3200, 1, 0.14, g * 0.6, pan, t);
    [310, 742, 1260].forEach((f, i) => this.tone(f * rand(0.95, 1.05), f * 0.92, 'triangle', 0.3 - i * 0.07, g * 0.25, pan, t));
  }

  /** 1930s "a-ooga" klaxon. */
  horn() {
    this.unlock();
    const ctx = this.ctx;
    if (!ctx) return;
    const t = ctx.currentTime;
    const out = this.gain(0, this.sfxBus);
    out.connect(this.echo);
    const bp = this.filter('bandpass', 900, 2.5);
    const shaper = ctx.createWaveShaper();
    const curve = new Float32Array(256);
    for (let i = 0; i < 256; i++) curve[i] = Math.tanh(((i / 255) * 2 - 1) * 3);
    shaper.curve = curve;
    shaper.connect(bp);
    bp.connect(out);
    [1, 1.5].forEach((mul, i) => {
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.setValueAtTime(240 * mul, t);
      o.frequency.exponentialRampToValueAtTime(520 * mul, t + 0.28);
      o.frequency.setValueAtTime(520 * mul, t + 0.55);
      o.frequency.exponentialRampToValueAtTime(470 * mul, t + 0.8);
      o.connect(this.gain(i === 0 ? 0.5 : 0.25, shaper));
      o.start(t);
      o.stop(t + 0.85);
    });
    out.gain.setValueAtTime(0, t);
    out.gain.linearRampToValueAtTime(0.22, t + 0.04);
    out.gain.setValueAtTime(0.22, t + 0.72);
    out.gain.exponentialRampToValueAtTime(0.001, t + 0.85);
  }

  /** Relic pickup: rising arpeggio with an echo tail. */
  pickup() {
    const ctx = this.ctx;
    if (!ctx) return;
    const t = ctx.currentTime;
    [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => {
      this.tone(f, f, 'sine', 0.45, 0.08, 0, t + i * 0.07, 0, true);
      this.tone(f * 2, f * 2, 'triangle', 0.25, 0.02, 0, t + i * 0.07, 0, true);
    });
  }

  /** Gentle two-note ding when arriving at a project / contact ring. */
  arrive() {
    const ctx = this.ctx;
    if (!ctx) return;
    const t = ctx.currentTime;
    this.tone(880, 880, 'sine', 0.5, 0.05, 0, t, 0, true);
    this.tone(1318.5, 1318.5, 'sine', 0.6, 0.045, 0, t + 0.09, 0, true);
  }

  /** Soft UI click for buttons and modals. */
  click() {
    const ctx = this.ctx;
    if (!ctx) return;
    this.tone(1900, 1300, 'sine', 0.035, 0.04, 0, ctx.currentTime);
  }

  /** Suspension spring + air as the car hops. */
  jump() {
    const ctx = this.ctx;
    if (!ctx) return;
    const t = ctx.currentTime;
    this.tone(90, 160, 'sine', 0.18, 0.18, 0, t);
    this.tone(420, 760, 'triangle', 0.12, 0.04, 0, t + 0.02);
    this.burst(this.white, 'bandpass', 900, 0.8, 0.25, 0.06, 0, t);
  }

  /** Achievement unlocked: bright little fanfare. */
  achievement() {
    const ctx = this.ctx;
    if (!ctx) return;
    const t = ctx.currentTime;
    [659.25, 783.99, 987.77, 1318.5].forEach((f, i) => this.tone(f, f, 'triangle', 0.4, 0.06, 0, t + i * 0.09, 0, true));
    this.tone(1975.5, 1975.5, 'sine', 0.8, 0.03, 0, t + 0.36, 0, true);
  }

  /** Air rush when boost kicks in. */
  boostWhoosh() {
    const ctx = this.ctx;
    if (!ctx) return;
    const t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.white;
    const bp = this.filter('bandpass', 400, 1.2);
    bp.frequency.setValueAtTime(400, t);
    bp.frequency.exponentialRampToValueAtTime(2600, t + 0.45);
    const g = this.gain(0, this.carBus);
    g.gain.linearRampToValueAtTime(0.12, t + 0.1);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.6);
    src.connect(bp);
    bp.connect(g);
    src.start(t, Math.random());
    src.stop(t + 0.65);
  }

  private bird() {
    const ctx = this.ctx!;
    const t = ctx.currentTime;
    const pan = rand(-0.9, 0.9);
    const base = rand(2600, 4200);
    const notes = 2 + Math.floor(Math.random() * 5);
    for (let i = 0; i < notes; i++) {
      const at = t + i * rand(0.07, 0.14);
      const f = base * rand(0.85, 1.2);
      this.tone(f, f * rand(1.1, 1.5), 'sine', rand(0.05, 0.1), rand(0.012, 0.028), pan, at, 0, false, this.ambBus);
    }
  }

  // ── Primitives ───────────────────────────────────────────────────
  private tone(
    f0: number,
    f1: number,
    type: OscillatorType,
    dur: number,
    level: number,
    pan: number,
    at: number,
    lowpass = 0,
    echo = false,
    bus: AudioNode = this.sfxBus,
  ) {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f0, at);
    if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), at + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, level), at + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    let node: AudioNode = o;
    if (lowpass) {
      const lp = this.filter('lowpass', lowpass);
      o.connect(lp);
      node = lp;
    }
    node.connect(g);
    const p = ctx.createStereoPanner();
    p.pan.value = Math.max(-1, Math.min(1, pan));
    g.connect(p);
    p.connect(bus);
    if (echo) p.connect(this.echo);
    o.start(at);
    o.stop(at + dur + 0.05);
  }

  private burst(
    buffer: AudioBuffer,
    type: BiquadFilterType,
    freq: number,
    q: number,
    dur: number,
    level: number,
    pan: number,
    at: number,
    attack = 0.003,
  ) {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const f = this.filter(type, freq, q);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, level), at + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    const p = ctx.createStereoPanner();
    p.pan.value = Math.max(-1, Math.min(1, pan));
    src.connect(f);
    f.connect(g);
    g.connect(p);
    p.connect(this.sfxBus);
    src.start(at, Math.random() * (buffer.duration - dur - 0.1));
    src.stop(at + dur + 0.05);
  }
}

export const sound = new AudioEngine();
