import { MAIN_SITE_URL } from '@/lib/basePath';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { sound, type Surface } from '@/lib/audio';
import {
  ADDITIONAL_SKILLS, APPROACH, EDUCATION, INTERESTS, PORTFOLIO_PROJECTS, POSTS, SITE, SKILL_GROUPS,
  type ProjectItem,
} from '@/data/portfolioData';
import { MODEL_CREDITS, bakeTopDown, loadModels } from '@/world/assets';
import { createComposer, createEnvironment, createRenderer, FOG_COLOR, TIMES_OF_DAY, type TimeOfDay } from '@/world/environment';
import {
  QUALITY_MODES, TIERS, TIER_NAMES, createGovernor, detectStartTier, modeToTier, readSavedMode, saveMode,
  type GovernorState, type QualityMode,
} from '@/world/perf';
import {
  createForestRing, createGrass, createGround, createRoads, makeNoiseTexture, makeRoadDistance, sampleRoads,
} from '@/world/terrain';
import {
  BODY_KIND, canvasTexture, createCollectibles, createPhysics, createPlayground, createStations, placeLandmarks, type DynamicProp,
} from '@/world/props';
import { createContent, type Interactive } from '@/world/content';
import { CAR, createCar } from '@/world/car';
import { ACHIEVEMENTS, loadUnlocked, saveUnlocked } from '@/world/achievements';
import { createShowcase } from '@/world/showcase';
import { createGrassField } from '@/world/grass';
import { createAmbient } from '@/world/ambient';
import { createPond } from '@/world/pond';
import { createSculptures } from '@/world/sculptures';
import { createDancers } from '@/world/dancers';
import RadioSet from '@/components/RadioSet';
import { CONTACT_POINT, createDriver, createRoadGraph, type P2 } from '@/world/autopilot';
import {
  ABOUT_SPOT, APPROACH_SPOTS, CAMERA_HALF, CONTACT_SPOT, CRATE_STACK, NAME_TITLE, PLAY_HALF, POND,
  POSTS_SPOT, PROJECT_SPOTS, RAMPS, SKILL_SHOWCASES, SPAWN, STUNT_RING, pondEdge,
} from '@/world/layout';

type CameraMode = 'follow' | 'chase' | 'overview';
const CAMERA_MODES: CameraMode[] = ['follow', 'chase', 'overview'];
const CAMERA_LABEL: Record<CameraMode, string> = { follow: 'Follow', chase: 'Chase', overview: 'Overview' };

type Panel = 'about' | 'posts' | 'map' | 'achievements' | 'controls' | 'options' | 'resume' | 'radio' | null;

const TIME_LABEL: Record<TimeOfDay, string> = { day: 'Day', sunset: 'Sunset', night: 'Night' };

/** Places the autopilot can drive to (map "Take me there" + the guided tour). */
type Destination = { key: string; title: string; group: string; color: string; at: P2; text: string; open: boolean };
const DESTINATIONS: Destination[] = [
  {
    key: 'about', title: 'About me', group: 'About', color: '#f2b45a', open: true,
    at: { x: ABOUT_SPOT.ringX, z: ABOUT_SPOT.ringZ },
    text: `Hi, I'm ${SITE.ownerName}, a ${SITE.role.toLowerCase()} at ${SITE.university}. This board has my story, my education and how I like to work.`,
  },
  {
    key: 'posts', title: 'Notice board', group: 'About', color: '#9db8f0', open: true,
    at: { x: POSTS_SPOT.ringX, z: POSTS_SPOT.ringZ },
    text: 'The topics I have been writing about and sharing on LinkedIn lately.',
  },
  {
    key: 'approach', title: 'How I build', group: 'About', color: '#e8c27a', open: false,
    at: { x: APPROACH_SPOTS[0][0], z: APPROACH_SPOTS[0][1] + 4 },
    text: `${APPROACH.intro} Drive past the four standing stones to read each step.`,
  },
  ...PORTFOLIO_PROJECTS.slice(0, PROJECT_SPOTS.length).map((p, i): Destination => ({
    key: `project-${i}`, title: p.title, group: 'Projects', color: p.color, open: true,
    at: { x: PROJECT_SPOTS[i].x, z: PROJECT_SPOTS[i].z },
    text: p.tagline + (PROJECT_SPOTS[i].landmark === 'pond' ? ' (And yes, you can drive into the pond.)' : ''),
  })),
  ...SKILL_GROUPS.slice(0, SKILL_SHOWCASES.length).map((g, i): Destination => ({
    key: `skill-${i}`, title: g.name, group: 'Skills', color: g.color, open: true,
    at: { x: SKILL_SHOWCASES[i].ring[0], z: SKILL_SHOWCASES[i].ring[1] },
    text: `${SKILL_SHOWCASES[i].name}: ${SKILL_SHOWCASES[i].why} Press E to see the skills come alive.`,
  })),
  {
    key: 'contact', title: 'Contact', group: 'Contact', color: '#f2b45a', open: false,
    at: CONTACT_POINT,
    text: 'The tiles here open my email, GitHub, LinkedIn and website. Drive onto one and press E. Thanks for taking the tour!',
  },
];
const destOf = (key: string) => DESTINATIONS.find((d) => d.key === key)!;
const TOUR_ORDER = ['about', 'skill-3', 'posts', 'approach', 'project-4', 'project-0', 'skill-0', 'skill-2', 'skill-1', 'project-1', 'project-5', 'project-3', 'project-2', 'contact']
  .filter((k) => DESTINATIONS.some((d) => d.key === k));
/** Seconds a tour stop stays up before moving on by itself. */
const TOUR_WAIT = 14;
type Prompt = { text: string; accent: string; action?: string; warning?: boolean } | null;
type Card = { kind: 'approach'; index: number } | null;
/** What pressing E would open right now. */
type Target =
  | { kind: 'project'; project: ProjectItem }
  | { kind: 'item'; item: Interactive }
  | { kind: 'skill'; index: number }
  | null;

export default function CyberWorld() {
  const mountRef = useRef<HTMLDivElement>(null);
  const minimapRef = useRef<HTMLCanvasElement>(null);
  const mapRef = useRef<HTMLCanvasElement>(null);

  const [progress, setProgress] = useState(0);
  const [phase, setPhase] = useState<'loading' | 'building' | 'ready' | 'error'>('loading');
  const [started, setStarted] = useState(false);
  const [welcome, setWelcome] = useState(false);
  const [speedKmh, setSpeedKmh] = useState(0);
  const [boostPct, setBoostPct] = useState(100);
  const [collected, setCollected] = useState(0);
  const [totalCollectibles, setTotalCollectibles] = useState(8);
  const [cameraMode, setCameraMode] = useState<CameraMode>('follow');
  const [engineOn, setEngineOn] = useState(true);
  const [muted, setMuted] = useState(false);
  const [qualityMode, setQualityModeState] = useState<QualityMode>('auto');
  const [activeTier, setActiveTier] = useState(2);
  const [prompt, setPrompt] = useState<Prompt>(null);
  const [card, setCard] = useState<Card>(null);
  const [showcase, setShowcase] = useState<number | null>(null);
  const [openProject, setOpenProject] = useState<ProjectItem | null>(null);
  const [panel, setPanel] = useState<Panel>(null);
  const [radioPlaying, setRadioPlaying] = useState(false);
  const [toast, setToast] = useState<{ text: string; badge?: string } | null>(null);
  const [unlocked, setUnlocked] = useState<string[]>([]);
  const [timeOfDay, setTimeOfDayState] = useState<TimeOfDay>('day');
  const [photo, setPhoto] = useState(false);
  const [shot, setShot] = useState(0);
  const [tour, setTour] = useState<{ index: number; arrived: boolean } | null>(null);
  const [autoDest, setAutoDest] = useState<string | null>(null);
  const [mobile, setMobile] = useState(false);
  const [carMenu, setCarMenu] = useState(false);
  const [stick, setStick] = useState({ x: 0, y: 0, active: false });
  const stickRef = useRef<HTMLDivElement>(null);
  const stickPointer = useRef<number | null>(null);
  const mapClick = useRef<(u: number, v: number) => void>(() => {});

  // Mutable state read by the render loop (avoids re-rendering React every frame).
  const live = useRef({
    started: false,
    mobile: false,
    engineOn: true,
    cameraMode: 'follow' as CameraMode,
    keys: { forward: false, backward: false, left: false, right: false, brake: false, boost: false },
    touch: { throttle: 0, steer: 0, brake: false, boost: false },
    boost: 100,
    speedKmh: 0,
    target: null as Target,
    respawn: false,
    stuck: false,
    resetObjects: false,
    jump: false,
    paused: false,
    yaw: 0,
    yawTarget: 0,
    qualityMode: 'auto' as QualityMode,
    qualityDirty: true,
    unlocked: new Set<string>(),
    honks: 0,
    openedProjects: new Set<string>(),
    /** Index of the skill showcase being presented, or -1 while driving. */
    showcase: -1,
    timeOfDay: 'day' as TimeOfDay,
    photo: false,
    /** The radio is playing a song (the dancers dance). */
    radioOn: false,
    capture: false,
    pitch: 0.4,
    photoDist: 11,
    /** Autopilot request (a new object = a new route). */
    auto: null as null | { dest: P2; tour: boolean },
    autoCancel: false,
    tourIndex: -1,
    tourArrived: false,
    tourWait: 0,
  });

  // ── Toasts & achievements ────────────────────────────────────────
  const toastTimer = useRef<ReturnType<typeof setTimeout>>();
  const flash = useCallback((text: string, badge?: string, ms = 2600) => {
    setToast({ text, badge });
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), ms);
  }, []);

  const unlock = useCallback(
    (id: string) => {
      const set = live.current.unlocked;
      if (set.has(id)) return;
      const a = ACHIEVEMENTS.find((x) => x.id === id);
      if (!a) return;
      set.add(id);
      saveUnlocked(set);
      setUnlocked([...set]);
      sound.achievement();
      flash(a.title, `${a.icon} Achievement`, 3400);
    },
    [flash],
  );

  // Phones/tablets: touch UI + a 3rd-person camera behind the car. `?mobile` forces it for desktop testing.
  useEffect(() => {
    const isTouch = window.matchMedia('(pointer: coarse)').matches || navigator.maxTouchPoints > 0;
    const m = (isTouch && Math.min(window.innerWidth, window.innerHeight) < 900) || new URLSearchParams(window.location.search).has('mobile');
    live.current.mobile = m;
    setMobile(m);
    if (m) {
      live.current.cameraMode = 'chase';
      setCameraMode('chase');
    }
  }, []);

  useEffect(() => {
    const set = loadUnlocked();
    live.current.unlocked = set;
    setUnlocked([...set]);
  }, []);

  // ── Actions ─────────────────────────────────────────────────────
  const toggleEngine = useCallback(() => {
    const on = !live.current.engineOn;
    live.current.engineOn = on;
    setEngineOn(on);
    if (on) sound.startEngine();
    else sound.stopEngine();
    flash(on ? 'Engine started' : 'Engine off — press F to start');
  }, [flash]);

  const cycleCamera = useCallback(() => {
    const next = CAMERA_MODES[(CAMERA_MODES.indexOf(live.current.cameraMode) + 1) % CAMERA_MODES.length];
    live.current.cameraMode = next;
    setCameraMode(next);
    sound.click();
  }, []);

  const setCamera = useCallback((mode: CameraMode) => {
    live.current.cameraMode = mode;
    setCameraMode(mode);
    sound.click();
  }, []);

  const toggleMute = useCallback(() => setMuted(sound.toggleMute()), []);

  const setQuality = useCallback((m: QualityMode) => {
    live.current.qualityMode = m;
    live.current.qualityDirty = true;
    setQualityModeState(m);
    saveMode(m);
  }, []);

  const openPanel = useCallback((p: Panel) => {
    sound.click();
    setPanel((cur) => (cur === p ? null : p));
  }, []);

  const honk = useCallback(() => {
    sound.horn();
    live.current.honks += 1;
    if (live.current.honks >= 5) unlock('honk');
  }, [unlock]);

  const openLink = useCallback(
    (url: string) => {
      unlock('contact');
      if (url.startsWith('mailto:')) window.location.href = url;
      else window.open(url, '_blank', 'noopener,noreferrer');
    },
    [unlock],
  );

  const showProject = useCallback(
    (p: ProjectItem) => {
      sound.click();
      setOpenProject(p);
      const opened = live.current.openedProjects;
      opened.add(p.id);
      if (opened.size >= PORTFOLIO_PROJECTS.length) unlock('all-projects');
    },
    [unlock],
  );

  const enterShowcase = useCallback((i: number) => {
    const n = SKILL_SHOWCASES.length;
    const idx = ((i % n) + n) % n;
    const k = live.current.keys;
    k.forward = k.backward = k.left = k.right = k.brake = k.boost = false;
    live.current.showcase = idx;
    setShowcase(idx);
    setWelcome(false);
  }, []);

  const exitShowcase = useCallback(() => {
    live.current.showcase = -1;
    setShowcase(null);
    sound.click();
  }, []);

  const interact = useCallback(() => {
    const t = live.current.target;
    if (!t) return;
    if (t.kind === 'project') showProject(t.project);
    else if (t.kind === 'skill') enterShowcase(t.index);
    else if (t.item.kind === 'about') {
      openPanel('about');
      unlock('about');
    } else if (t.item.kind === 'posts') {
      openPanel('posts');
      unlock('posts');
    } else if (t.item.kind === 'contact' && t.item.url) {
      sound.click();
      openLink(t.item.url);
    }
  }, [enterShowcase, openLink, openPanel, showProject, unlock]);

  const start = useCallback(() => {
    live.current.started = true;
    setStarted(true);
    setWelcome(true);
    sound.unlock();
    sound.startAmbience();
    sound.startEngine();
  }, []);

  // ── Time of day ──
  const setTimeOfDay = useCallback((t: TimeOfDay) => {
    live.current.timeOfDay = t;
    setTimeOfDayState(t);
    sound.click();
  }, []);
  const cycleTime = useCallback(() => {
    const next = TIMES_OF_DAY[(TIMES_OF_DAY.indexOf(live.current.timeOfDay) + 1) % TIMES_OF_DAY.length];
    setTimeOfDay(next);
    flash(next === 'day' ? 'Day' : next === 'sunset' ? 'Golden hour' : 'Night falls · headlights on', next === 'night' ? '🌙' : next === 'sunset' ? '🌇' : '☀️');
  }, [flash, setTimeOfDay]);

  // ── Photo mode ──
  const togglePhoto = useCallback(() => {
    const on = !live.current.photo;
    if (on && live.current.showcase >= 0) return;
    live.current.photo = on;
    setPhoto(on);
    setWelcome(false);
    if (on) setPanel(null);
    sound.click();
  }, []);
  const takePhoto = useCallback(() => {
    live.current.capture = true;
  }, []);
  /** Turn the freshly rendered frame into a framed postcard and download it. */
  const capture = useCallback(
    (src: HTMLCanvasElement) => {
      const W = src.width;
      const H = src.height;
      const c = document.createElement('canvas');
      c.width = W;
      c.height = H;
      const ctx = c.getContext('2d');
      if (!ctx) return;
      ctx.drawImage(src, 0, 0);
      const k = Math.max(W, H) / 1600;
      const g = ctx.createLinearGradient(0, H * 0.62, 0, H);
      g.addColorStop(0, 'rgba(0,0,0,0)');
      g.addColorStop(1, 'rgba(0,0,0,0.62)');
      ctx.fillStyle = g;
      ctx.fillRect(0, H * 0.62, W, H * 0.38);
      ctx.strokeStyle = 'rgba(255,255,255,0.8)';
      ctx.lineWidth = 2 * k;
      ctx.strokeRect(22 * k, 22 * k, W - 44 * k, H - 44 * k);
      ctx.fillStyle = '#f5f2ec';
      ctx.font = `750 ${46 * k}px Inter, system-ui, sans-serif`;
      ctx.fillText(SITE.ownerName, 58 * k, H - 100 * k);
      ctx.font = `500 ${20 * k}px Inter, system-ui, sans-serif`;
      ctx.fillStyle = 'rgba(245,242,236,0.82)';
      ctx.fillText(`${SITE.role} · ${SITE.university}`, 58 * k, H - 64 * k);
      ctx.textAlign = 'right';
      ctx.fillStyle = '#f2b45a';
      ctx.font = `600 ${16 * k}px "JetBrains Mono", ui-monospace, monospace`;
      ctx.fillText(`Greetings from the valley · ${new Date().toLocaleDateString()}`, W - 58 * k, H - 64 * k);
      c.toBlob((blob) => {
        if (!blob) return;
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `gangul-missaka-postcard-${Date.now()}.png`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 5000);
      }, 'image/png');
      sound.shutter();
      setShot((n) => n + 1);
      unlock('photo');
      flash('Postcard saved to your downloads', '📸 Photo');
    },
    [flash, unlock],
  );

  // ── Autopilot + guided tour ──
  const goTo = useCallback((key: string) => {
    const d = destOf(key);
    const L = live.current;
    L.tourIndex = -1;
    L.auto = { dest: d.at, tour: false };
    setTour(null);
    setAutoDest(d.title);
    setPanel(null);
    setWelcome(false);
    sound.click();
  }, []);
  const startTour = useCallback(() => {
    const L = live.current;
    if (L.showcase >= 0) return;
    L.tourIndex = 0;
    L.tourArrived = false;
    L.auto = { dest: destOf(TOUR_ORDER[0]).at, tour: true };
    setTour({ index: 0, arrived: false });
    setAutoDest(null);
    setPanel(null);
    setWelcome(false);
    sound.click();
  }, []);
  const stopAuto = useCallback(
    (msg?: string) => {
      const L = live.current;
      L.auto = null;
      L.autoCancel = true;
      L.tourIndex = -1;
      setTour(null);
      setAutoDest(null);
      if (msg) flash(msg);
    },
    [flash],
  );
  const tourNext = useCallback(() => {
    const L = live.current;
    if (L.tourIndex < 0) return;
    const n = L.tourIndex + 1;
    if (n >= TOUR_ORDER.length) {
      L.tourIndex = -1;
      L.auto = null;
      setTour(null);
      unlock('tour');
      flash('Tour complete. The valley is yours: enjoy the drive!', '🧭 Tour');
      return;
    }
    L.tourIndex = n;
    L.tourArrived = false;
    L.auto = { dest: destOf(TOUR_ORDER[n]).at, tour: true };
    setTour({ index: n, arrived: false });
    sound.click();
  }, [flash, unlock]);
  const tourArrived = useCallback((index: number) => {
    setTour({ index, arrived: true });
  }, []);
  const autoArrived = useCallback(() => {
    setAutoDest((cur) => {
      if (cur) flash(`Arrived · ${cur}`);
      return null;
    });
  }, [flash]);

  // Pause driving input while a panel is open.
  useEffect(() => {
    live.current.paused = !!openProject || (!!panel && panel !== 'map') || showcase !== null || photo;
  }, [openProject, panel, showcase, photo]);

  useEffect(() => {
    live.current.radioOn = radioPlaying;
  }, [radioPlaying]);

  // Quiet the world while a project video can play, and lower it under the radio.
  useEffect(() => {
    sound.duck(openProject?.video ? 0.06 : radioPlaying ? 0.3 : null);
  }, [openProject, radioPlaying]);

  // Callbacks used inside the long-lived loop, kept current via refs.
  const allActions = {
    toggleEngine, cycleCamera, interact, honk, unlock, flash, openPanel, toggleMute, start, enterShowcase, exitShowcase,
    cycleTime, togglePhoto, takePhoto, capture, goTo, startTour, stopAuto, tourNext, tourArrived, autoArrived,
  };
  const actions = useRef(allActions);
  actions.current = allActions;

  // ── Scene bootstrap + render loop ───────────────────────────────
  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;
    let disposed = false;
    let raf = 0;

    const renderer = createRenderer(container);
    const scene = new THREE.Scene();
    scene.background = FOG_COLOR.clone();
    const camera = new THREE.PerspectiveCamera(50, container.clientWidth / container.clientHeight, 0.1, 900);
    camera.position.set(60, 70, 120);
    camera.lookAt(0, 0, 0);
    const env = createEnvironment(scene, renderer);
    const post = createComposer(renderer, scene, camera);
    const physics = createPhysics();

    // Adaptive quality: start from what the device looks capable of, then follow the measured frame time.
    const savedMode = readSavedMode();
    live.current.qualityMode = savedMode;
    setQualityModeState(savedMode);
    let pendingGov: GovernorState | null = null;
    const gov = createGovernor({
      startTier: detectStartTier(),
      dpr: window.devicePixelRatio || 1,
      onChange: (s) => {
        pendingGov = s;
      },
    });
    gov.setMode(savedMode); // also queues the first state

    const onResize = () => {
      const w = container.clientWidth;
      const h = container.clientHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
      post.setSize(w, h);
    };
    window.addEventListener('resize', onResize);

    // ── Input ──
    const setKey = (e: KeyboardEvent, down: boolean) => {
      const k = live.current.keys;
      if ((e.target as HTMLElement)?.closest?.('input, textarea')) return;
      if (live.current.photo) {
        // Photo mode: orbit with Q / drag, Space / Enter captures, N changes the light, P / Esc exits.
        if (!down || e.repeat) return;
        const S = actions.current;
        if (e.code === 'KeyP' || e.code === 'Escape') S.togglePhoto();
        else if (e.code === 'Space' || e.code === 'Enter') {
          e.preventDefault();
          S.takePhoto();
        } else if (e.code === 'KeyN') S.cycleTime();
        else if (e.code === 'KeyQ') live.current.yawTarget += Math.PI / 4;
        return;
      }
      const driveKey = ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code);
      if (down && driveKey && live.current.showcase < 0 && (live.current.auto || live.current.tourIndex >= 0)) {
        actions.current.stopAuto('Autopilot off · you have the wheel');
      }
      if (live.current.showcase >= 0) {
        // While presenting skills: ←/→ switch statue, E / Enter / Esc return to driving.
        if (!down || e.repeat) return;
        const S = actions.current;
        if (e.code === 'ArrowLeft' || e.code === 'KeyA') S.enterShowcase(live.current.showcase - 1);
        else if (e.code === 'ArrowRight' || e.code === 'KeyD') S.enterShowcase(live.current.showcase + 1);
        else if (e.code === 'KeyE' || e.code === 'Enter' || e.code === 'Escape' || e.code === 'Space') S.exitShowcase();
        if (e.code === 'Space') e.preventDefault();
        return;
      }
      switch (e.code) {
        case 'KeyW': case 'ArrowUp': k.forward = down; break;
        case 'KeyS': case 'ArrowDown': k.backward = down; break;
        case 'KeyA': case 'ArrowLeft': k.left = down; break;
        case 'KeyD': case 'ArrowRight': k.right = down; break;
        case 'KeyB': case 'ControlLeft': case 'ControlRight': k.brake = down; break;
        case 'ShiftLeft': case 'ShiftRight': k.boost = down; if (down && live.current.engineOn && !e.repeat) sound.boostWhoosh(); break;
        case 'Space': e.preventDefault(); break;
        default: break;
      }
      if (!down || e.repeat) return;
      const A = actions.current;
      if (!live.current.started) {
        if (e.code === 'Enter' || e.code === 'Space') A.start();
        return;
      }
      switch (e.code) {
        case 'Space': live.current.jump = true; break;
        case 'KeyF': A.toggleEngine(); break;
        case 'KeyR': live.current.respawn = true; break;
        case 'KeyH': A.honk(); break;
        case 'KeyC': A.cycleCamera(); break;
        case 'KeyM': A.openPanel('map'); break;
        case 'KeyL': A.toggleMute(); break;
        case 'KeyE': case 'Enter': A.interact(); break;
        case 'KeyQ': live.current.yawTarget += Math.PI / 4; break;
        case 'KeyN': A.cycleTime(); break;
        case 'KeyP': A.togglePhoto(); break;
        case 'KeyT': A.startTour(); break;
        default: break;
      }
    };
    const onKeyDown = (e: KeyboardEvent) => setKey(e, true);
    const onKeyUp = (e: KeyboardEvent) => setKey(e, false);
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);

    // Drag to orbit the camera around the car (pitch stays locked so the view never leaves the world).
    let dragging = false;
    let lastX = 0;
    let lastY = 0;
    const onPointerDown = (e: PointerEvent) => {
      if (e.pointerType === 'touch' && !live.current.photo) return;
      dragging = true;
      lastX = e.clientX;
      lastY = e.clientY;
    };
    const onPointerMove = (e: PointerEvent) => {
      if (!dragging) return;
      live.current.yawTarget -= (e.clientX - lastX) * 0.006;
      if (live.current.photo) live.current.pitch = THREE.MathUtils.clamp(live.current.pitch + (e.clientY - lastY) * 0.004, 0.06, 1.35);
      lastX = e.clientX;
      lastY = e.clientY;
    };
    const onWheel = (e: WheelEvent) => {
      if (!live.current.photo) return;
      e.preventDefault();
      live.current.photoDist = THREE.MathUtils.clamp(live.current.photoDist * Math.exp(e.deltaY * 0.0012), 3.5, 45);
    };
    renderer.domElement.addEventListener('wheel', onWheel, { passive: false });
    const onPointerUp = () => (dragging = false);
    renderer.domElement.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);

    // ── Load + build the world ──
    loadModels((p) => !disposed && setProgress(p))
      .then(async (models) => {
        if (disposed) return;
        setPhase('building');
        await document.fonts?.ready;
        await new Promise((r) => requestAnimationFrame(r));

        // Ground textures baked from the photo-scans: the muddy two-track and the chamois lawn.
        const road = bakeTopDown(renderer, models.road, [0.14, 0.05, 0.86, 0.95], 512, 1024, true);
        const lawn = bakeTopDown(renderer, models.chamois, [0.73, 0.72, 0.93, 0.93], 1024, 1024);
        const noise = makeNoiseTexture(256);

        const ground = createGround(scene, lawn.texture, noise);
        const roadPaths = sampleRoads();
        const roadDistance = makeRoadDistance(roadPaths);
        createRoads(scene, roadPaths, road.texture, road.worldLength / road.worldWidth);
        const grass = createGrass(scene, models.grass, roadDistance);
        const grassField = createGrassField(scene, roadPaths, noise);
        const ambient = createAmbient(scene, roadDistance);
        ambient.setPixelRatio(renderer.getPixelRatio());
        const pond = createPond(scene, physics, noise);
        pond.setPixelRatio(renderer.getPixelRatio());
        const graph = createRoadGraph(roadPaths);
        const driver = createDriver();
        const forest = createForestRing(scene, models.forest);
        const { placed: landmarks, showcaseModels } = placeLandmarks(scene, physics, models);
        const sculptures = createSculptures(scene, physics);
        const dancers = createDancers(scene, physics);
        landmarks.push(...sculptures.placed);
        const playground = createPlayground(scene, physics);
        const stations = createStations(scene, physics, PORTFOLIO_PROJECTS, SKILL_GROUPS, showcaseModels);
        const show = createShowcase(scene);
        const content = await createContent(scene, physics);
        if (disposed) return;
        const collectibles = createCollectibles(scene);
        setTotalCollectibles(collectibles.length);
        const car = createCar(scene, physics, models.car);
        car.setPixelRatio(renderer.getPixelRatio());

        // Low graphics has no real shadows, so give the car a soft contact shadow instead (one cheap quad).
        const blobTex = canvasTexture(64, 64, (ctx) => {
          const g = ctx.createRadialGradient(32, 32, 2, 32, 32, 31);
          g.addColorStop(0, 'rgba(0,0,0,0.62)');
          g.addColorStop(0.55, 'rgba(0,0,0,0.3)');
          g.addColorStop(1, 'rgba(0,0,0,0)');
          ctx.fillStyle = g;
          ctx.fillRect(0, 0, 64, 64);
        });
        const blob = new THREE.Group();
        const blobMesh = new THREE.Mesh(
          new THREE.PlaneGeometry(2.6, 5),
          new THREE.MeshBasicMaterial({ map: blobTex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }),
        );
        blobMesh.rotation.x = -Math.PI / 2;
        blobMesh.renderOrder = 1;
        blob.add(blobMesh);
        blob.visible = false;
        scene.add(blob);

        // Night lighting: soft coloured pools of light at every stop (off by day).
        const nightLights = [
          ...stations.projectStations.map((st) => ({ x: st.pos.x, z: st.pos.z, color: st.data.color, max: 14 })),
          ...stations.skillStations.map((st) => ({ x: st.pos.x, z: st.pos.z, color: st.data.color, max: 8 })),
          { x: ABOUT_SPOT.ringX, z: ABOUT_SPOT.ringZ, color: '#f2b45a', max: 12 },
          { x: POSTS_SPOT.ringX, z: POSTS_SPOT.ringZ, color: '#9db8f0', max: 9 },
          { x: CONTACT_SPOT.x, z: CONTACT_SPOT.z + 2, color: '#f2b45a', max: 14 },
        ].map((d) => {
          const light = new THREE.PointLight(d.color, 0, 18, 1.5);
          light.position.set(d.x, 2.8, d.z);
          scene.add(light);
          return { light, max: d.max };
        });

        // Keep the camera from ending up inside a house or statue (which shows as a dark flash).
        const camBlockers = landmarks.map((l) => {
          const box = new THREE.Box3().setFromObject(l.object);
          return { x: l.x, z: l.z, rot: l.rotY, hx: l.half[0] + 1.5, hz: l.half[1] + 1.5, top: box.max.y };
        });

        // Everything that can be knocked around, with its home pose for "Reset objects".
        const movable: (DynamicProp & { home: { p: CANNON.Vec3; q: CANNON.Quaternion } })[] = [
          ...playground.dynamic,
          ...content.letters,
        ].map((d) => ({ ...d, home: { p: d.body.position.clone(), q: d.body.quaternion.clone() } }));
        const letterBodies = new Set(content.letters.map((l) => l.body));
        if (process.env.NODE_ENV !== 'production') {
          // Dev-only hook for headless physics checks.
          (window as unknown as { __world: unknown }).__world = { car, physics, crates: playground.dynamic.filter((d) => BODY_KIND.get(d.body) === 'wood'), live: live.current, scene, renderer, camera, THREE };
        }

        // ── Collision sounds (positioned relative to the camera) ──
        const tmpV = new THREE.Vector3();
        const camRight = new THREE.Vector3();
        let shake = 0;
        const spatial = (x: number, y: number, z: number) => {
          tmpV.set(x, y, z).sub(camera.position);
          const dist = tmpV.length();
          camRight.setFromMatrixColumn(camera.matrixWorld, 0);
          const pan = dist > 0.01 ? THREE.MathUtils.clamp(tmpV.normalize().dot(camRight) * 0.9, -1, 1) : 0;
          return { pan, level: 1 / (1 + Math.max(0, dist - 10) / 16) };
        };
        type CollideEvent = { body: CANNON.Body; contact: CANNON.ContactEquation };
        car.phys.addEventListener('collide', (e: CollideEvent) => {
          const kind = BODY_KIND.get(e.body);
          if (!kind) return;
          const v = Math.abs(e.contact.getImpactVelocityAlongNormal());
          const at = spatial(car.root.position.x, 1, car.root.position.z);
          if (kind === 'ground') {
            if (v > 3) {
              sound.impact('ground', Math.min(1, (v - 3) / 9), at.pan, at.level);
              if (v > 9) shake = Math.max(shake, Math.min(0.15, (v - 9) * 0.02));
            }
            return;
          }
          if (kind === 'foliage') actions.current.unlock('edge');
          if (v < 1.2) return;
          const strength = Math.min(1, v / 14);
          sound.impact(kind, strength, at.pan, at.level);
          if (e.body.type === CANNON.Body.STATIC && strength > 0.5) shake = Math.max(shake, (strength - 0.5) * 0.3);
        });
        const lastHit = new WeakMap<CANNON.Body, number>();
        movable.forEach(({ body }) => {
          body.addEventListener('collide', (e: CollideEvent) => {
            if (e.body === car.phys) return;
            const v = Math.abs(e.contact.getImpactVelocityAlongNormal());
            if (v < 1.6) return;
            const now = performance.now();
            if ((lastHit.get(body) ?? 0) > now - 90) return;
            lastHit.set(body, now);
            const at = spatial(body.position.x, body.position.y, body.position.z);
            sound.impact(BODY_KIND.get(body) ?? 'wood', Math.min(1, v / 12) * 0.8, at.pan, at.level * 0.8);
          });
        });
        const pondSpot = POND;
        pond.onSplash = (x, z, strength) => {
          const at = spatial(x, 0.5, z);
          sound.splash(strength, at.pan, at.level);
        };

        // ── Map rendering (minimap + full map panel share one static layer) ──
        const MAP = 220;
        const span = PLAY_HALF + 6;
        const toMap = (x: number, z: number): [number, number] => [MAP + (x / span) * MAP, MAP + (z / span) * MAP];
        const mapLayer = document.createElement('canvas');
        mapLayer.width = mapLayer.height = MAP * 2;
        {
          const m = mapLayer.getContext('2d')!;
          m.fillStyle = '#26301d';
          m.fillRect(0, 0, MAP * 2, MAP * 2);
          m.lineCap = 'round';
          m.lineJoin = 'round';
          roadPaths.forEach((p) => {
            m.strokeStyle = 'rgba(214,190,150,0.85)';
            m.lineWidth = p.width * 1.4;
            m.beginPath();
            p.points.forEach((pt, i) => {
              const [x, y] = toMap(pt.x, pt.z);
              if (i === 0) m.moveTo(x, y);
              else m.lineTo(x, y);
            });
            m.stroke();
          });
          landmarks.forEach((l) => {
            m.save();
            const [x, y] = toMap(l.x, l.z);
            m.translate(x, y);
            m.rotate(-l.rotY);
            const sx = (l.half[0] / span) * MAP;
            const sz = (l.half[1] / span) * MAP;
            m.fillStyle = l.key === 'pond' ? 'rgba(92,150,160,0.9)' : 'rgba(236,228,214,0.85)';
            m.beginPath();
            m.roundRect(-sx, -sz, sx * 2, sz * 2, 4);
            m.fill();
            m.restore();
          });
          m.fillStyle = 'rgba(92,150,160,0.9)';
          m.beginPath();
          pond.outline.forEach(([x, z], i) => {
            const [px, py] = toMap(x, z);
            if (i) m.lineTo(px, py);
            else m.moveTo(px, py);
          });
          m.closePath();
          m.fill();
          const frame = MAP * 2 * (1 - PLAY_HALF / span);
          m.fillStyle = 'rgba(14,22,10,0.92)';
          m.fillRect(0, 0, MAP * 2, frame);
          m.fillRect(0, MAP * 2 - frame, MAP * 2, frame);
          m.fillRect(0, 0, frame, MAP * 2);
          m.fillRect(MAP * 2 - frame, 0, frame, MAP * 2);
        }
        const mapLabels: { x: number; z: number; text: string; color: string }[] = [
          ...stations.projectStations.map((s) => ({ x: s.pos.x, z: s.pos.z + 5, text: s.data.title, color: s.data.color })),
          ...stations.skillStations.map((s) => ({ x: s.pos.x, z: s.pos.z + 4.5, text: s.data.name, color: s.data.color })),
          { x: ABOUT_SPOT.x + 2, z: ABOUT_SPOT.z - 4, text: 'About me', color: '#f2b45a' },
          { x: POSTS_SPOT.x, z: POSTS_SPOT.z - 4, text: 'Posts', color: '#9db8f0' },
          { x: APPROACH_SPOTS[1][0] - 5, z: APPROACH_SPOTS[1][1] - 6, text: 'How I Build', color: '#e8c27a' },
          { x: CONTACT_SPOT.x + 1, z: CONTACT_SPOT.z + 9, text: 'Contact', color: '#f2b45a' },
          { x: CRATE_STACK.x + 6, z: CRATE_STACK.z - 6, text: 'Playground', color: '#d9d4ca' },
          { x: NAME_TITLE.x, z: NAME_TITLE.z - 4, text: 'Start', color: '#ffffff' },
        ];
        const camPos = new THREE.Vector3(60, 70, 120);
        const camLook = new THREE.Vector3(0, 0, 0);

        const drawMap = (cvs: HTMLCanvasElement, round: boolean) => {
          const ctx = cvs.getContext('2d')!;
          const W = cvs.width;
          const k = W / (MAP * 2);
          ctx.clearRect(0, 0, W, W);
          ctx.save();
          ctx.beginPath();
          if (round) ctx.arc(W / 2, W / 2, W / 2, 0, Math.PI * 2);
          else ctx.roundRect(0, 0, W, W, 18);
          ctx.clip();
          ctx.drawImage(mapLayer, 0, 0, W, W);
          const dot = (x: number, z: number, r: number, color: string) => {
            const [mx, my] = toMap(x, z);
            ctx.fillStyle = color;
            ctx.beginPath();
            ctx.arc(mx * k, my * k, r, 0, Math.PI * 2);
            ctx.fill();
          };
          const s = round ? 1 : 1.6;
          stations.projectStations.forEach((st) => dot(st.pos.x, st.pos.z, 5 * s, st.data.color));
          stations.skillStations.forEach((st) => dot(st.pos.x, st.pos.z, 3 * s, st.data.color));
          content.interactives.forEach((it) => it.kind !== 'approach' && dot(it.pos.x, it.pos.z, (it.kind === 'contact' ? 2.6 : 4) * s, it.accent));
          APPROACH_SPOTS.forEach(([x, z]) => dot(x, z, 2.4 * s, '#e8c27a'));
          collectibles.forEach((c) => !c.collected && dot(c.base.x, c.base.z, 2.4 * s, '#ffd27a'));
          if (!round) {
            ctx.font = `600 ${Math.round(13 * (W / 560))}px Inter, system-ui, sans-serif`;
            ctx.textAlign = 'center';
            mapLabels.forEach((l) => {
              const [mx, my] = toMap(l.x, l.z);
              ctx.fillStyle = 'rgba(0,0,0,0.55)';
              ctx.fillText(l.text, mx * k + 1, my * k + 1);
              ctx.fillStyle = l.color;
              ctx.fillText(l.text, mx * k, my * k);
            });
          }
          const route = driver.remaining();
          if (route.length > 1) {
            ctx.save();
            ctx.strokeStyle = 'rgba(242,180,90,0.95)';
            ctx.lineWidth = round ? 2.5 : 3.5;
            ctx.setLineDash([6, 5]);
            ctx.beginPath();
            const [sx, sy] = toMap(car.root.position.x, car.root.position.z);
            ctx.moveTo(sx * k, sy * k);
            route.forEach((p) => {
              const [mx, my] = toMap(p.x, p.z);
              ctx.lineTo(mx * k, my * k);
            });
            ctx.stroke();
            ctx.restore();
            const end = route[route.length - 1];
            dot(end.x, end.z, 5 * s, '#f2b45a');
          }
          const [bx, by] = toMap(car.root.position.x, car.root.position.z);
          ctx.translate(bx * k, by * k);
          if (round) {
            ctx.save();
            ctx.rotate(Math.atan2(camLook.x - camPos.x, -(camLook.z - camPos.z)));
            const grad = ctx.createRadialGradient(0, 0, 0, 0, 0, 40);
            grad.addColorStop(0, 'rgba(255,255,255,0.28)');
            grad.addColorStop(1, 'rgba(255,255,255,0)');
            ctx.fillStyle = grad;
            ctx.beginPath();
            ctx.moveTo(0, 0);
            ctx.arc(0, 0, 40, -Math.PI / 2 - 0.45, -Math.PI / 2 + 0.45);
            ctx.closePath();
            ctx.fill();
            ctx.restore();
          }
          ctx.rotate(-car.state.heading);
          ctx.scale(s, s);
          ctx.fillStyle = '#ffffff';
          ctx.strokeStyle = 'rgba(0,0,0,0.55)';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(0, -8);
          ctx.lineTo(5.5, 6);
          ctx.lineTo(0, 3);
          ctx.lineTo(-5.5, 6);
          ctx.closePath();
          ctx.stroke();
          ctx.fill();
          ctx.restore();
        };

        mapClick.current = (u, v) => {
          const x = ((u * MAP * 2 - MAP) / MAP) * span;
          const z = ((v * MAP * 2 - MAP) / MAP) * span;
          let best: Destination | null = null;
          let bestD = 14;
          for (const d of DESTINATIONS) {
            const dd = Math.hypot(d.at.x - x, d.at.z - z);
            if (dd < bestD) {
              bestD = dd;
              best = d;
            }
          }
          if (best) actions.current.goTo(best.key);
          else actions.current.flash('Click closer to a place on the map');
        };

        // ── Frame loop state ──
        const clock = new THREE.Clock();
        const desiredPos = new THREE.Vector3();
        const desiredLook = new THREE.Vector3();
        let camYaw = live.current.yaw;
        let introT = 0;
        let lastPromptKey = '';
        let lastCardKey = '';
        let lastNear = '';
        let shownShowcase = -1;
        let showcaseStart = 0;
        let showcaseAngle = 0;
        let ringCooldown = 0;
        let hudTimer = 0;
        let checkTimer = 0;
        let elapsed = 0;
        let distance = 0;
        const vignetteEl = document.createElement('div');
        vignetteEl.style.cssText =
          'position:absolute;inset:0;display:none;pointer-events:none;background:radial-gradient(ellipse at center,rgba(8,10,14,0) 45%,rgba(8,10,14,0.55) 100%)';
        container.appendChild(vignetteEl);
        let physMs = 0;
        let renderMs = 0;
        let appliedTier = -1;
        let curTier = TIERS[2];
        let shadowFrame = 0;
        let fpsTimer = 0;
        // ?fps shows a small tier / frame-rate readout (handy for tuning on a real device)
        let fpsEl: HTMLDivElement | null = null;
        if (new URLSearchParams(window.location.search).has('fps')) {
          fpsEl = document.createElement('div');
          fpsEl.style.cssText = 'position:fixed;left:8px;bottom:8px;z-index:99;font:600 11px monospace;color:#fff;background:rgba(0,0,0,.6);padding:3px 7px;border-radius:6px;pointer-events:none';
          container.appendChild(fpsEl);
        }
        let jumpLift = 0; // seconds during which the car may rise freely after a jump
        let sink = 0;
        let shownTime: TimeOfDay = 'day';
        let lastAuto: typeof live.current.auto = null;
        let wasPhoto = false;
        const visitedSkills = new Set<string>();
        const visitedStones = new Set<number>();
        const ringPos = new THREE.Vector3(STUNT_RING.x, STUNT_RING.y, STUNT_RING.z);
        const up = new THREE.Vector3();
        const q = new THREE.Quaternion();
        const allLabels = [
          ...stations.projectStations.map((s) => s.label),
          ...stations.skillStations.map((s) => s.label),
          ...content.labels,
        ];

        setPhase('ready');

        // Optional URL flags for previews/screenshots: ?autostart (skip the intro) and ?cam=chase|overview
        const params = new URLSearchParams(window.location.search);
        if (params.has('autostart')) {
          document.documentElement.classList.add('no-intro');
          actions.current.start();
        }
        const camParam = params.get('cam') as CameraMode | null;
        if (camParam && CAMERA_MODES.includes(camParam)) {
          live.current.cameraMode = camParam;
          setCameraMode(camParam);
        }
        // ?at=x,z,heading places the car (for previews)
        const at = params.get('at')?.split(',').map(Number);
        if (at && at.length >= 2) {
          car.phys.position.set(at[0], 0.6, at[1]);
          car.state.heading = at[2] || 0;
        }
        const timeParam = params.get('time') as TimeOfDay | null;
        if (timeParam && TIMES_OF_DAY.includes(timeParam)) {
          live.current.timeOfDay = timeParam;
          setTimeOfDayState(timeParam);
          env.setTimeOfDay(timeParam, true);
          shownTime = timeParam;
        }
        if (params.has('tour') && live.current.started) actions.current.startTour();
        if (params.has('photo') && live.current.started) actions.current.togglePhoto();
        let snapCamera = params.has('autostart');
        if (snapCamera) introT = 1;

        const tick = () => {
          raf = requestAnimationFrame(tick);
          const rawDt = clock.getDelta();
          const dt = Math.min(rawDt, 1 / 20);
          elapsed += dt;
          const L = live.current;
          const A = actions.current;

          // Adaptive quality: manual mode changes, then the frame-time governor
          if (L.qualityDirty) {
            L.qualityDirty = false;
            gov.setMode(L.qualityMode);
          }
          if (L.started) gov.frame(rawDt);
          if (pendingGov) {
            const s: GovernorState = pendingGov;
            pendingGov = null;
            if (Math.abs(s.pixelRatio - renderer.getPixelRatio()) > 0.001) {
              renderer.setPixelRatio(s.pixelRatio);
              onResize();
              ambient.setPixelRatio(s.pixelRatio);
              car.setPixelRatio(s.pixelRatio);
              pond.setPixelRatio(s.pixelRatio);
            }
            if (s.tier !== appliedTier) {
              appliedTier = s.tier;
              curTier = TIERS[s.tier];
              post.setMode(curTier.post);
              // Without the post chain there is no vignette grade: a CSS gradient is a nearly free stand-in.
              vignetteEl.style.display = curTier.post === 'off' ? 'block' : 'none';
              const sh = env.sun.shadow;
              env.sun.castShadow = curTier.shadows;
              if (sh.mapSize.x !== curTier.shadowMapSize) {
                sh.mapSize.set(curTier.shadowMapSize, curTier.shadowMapSize);
                sh.map?.dispose();
                sh.map = null;
              }
              renderer.shadowMap.autoUpdate = curTier.shadowEvery === 1;
              renderer.shadowMap.needsUpdate = true;
              grassField.setDensity(curTier.grass);
              forest.setDensity(curTier.forest, curTier.liteTrees);
              ground.setLite(curTier.lightGround);
              dancers.setLowDetail(curTier.lowDetailAnim);
              setActiveTier(s.tier);
            }
          }
          if (!renderer.shadowMap.autoUpdate && ++shadowFrame % curTier.shadowEvery === 0) renderer.shadowMap.needsUpdate = true;
          if (fpsEl && (fpsTimer -= rawDt) <= 0) {
            fpsTimer = 0.5;
            fpsEl.textContent = `${TIER_NAMES[appliedTier]} | ${Math.round(1000 / Math.max(1, gov.avgMs))} fps | ${gov.avgMs.toFixed(1)} ms | x${renderer.getPixelRatio().toFixed(2)}${gov.enabled ? ' auto' : ''} | calls ${renderer.info.render.calls} tris ${(renderer.info.render.triangles / 1000).toFixed(0)}k geo ${renderer.info.memory.geometries} tex ${renderer.info.memory.textures} | phys ${physMs.toFixed(1)}ms render-js ${renderMs.toFixed(1)}ms bodies ${physics.world.bodies.length}`;
          }

          // Time of day
          if (L.timeOfDay !== shownTime) {
            shownTime = L.timeOfDay;
            env.setTimeOfDay(shownTime);
          }
          env.tick(dt, elapsed);
          const lamps = env.lamps;
          nightLights.forEach(({ light, max }) => (light.intensity = lamps * max));
          car.setNight(lamps);
          ambient.setNight(lamps);

          // Respawn / unstuck / reset objects
          if (L.respawn) {
            L.respawn = false;
            car.reset();
          }
          if (L.stuck) {
            L.stuck = false;
            // Teleport to the closest point on any road, facing along it.
            const cp0 = car.root.position;
            let best = { d: Infinity, x: SPAWN.x, z: SPAWN.z, h: SPAWN.heading };
            roadPaths.forEach((p) =>
              p.points.forEach((pt, i) => {
                const d = (pt.x - cp0.x) ** 2 + (pt.z - cp0.z) ** 2;
                if (d < best.d) {
                  const n = p.points[Math.min(i + 1, p.points.length - 1)];
                  const pv = p.points[Math.max(i - 1, 0)];
                  best = { d, x: pt.x, z: pt.z, h: Math.atan2(-(n.x - pv.x), -(n.z - pv.z)) };
                }
              }),
            );
            car.phys.position.set(best.x, 1.2, best.z);
            car.phys.velocity.set(0, 0, 0);
            car.state.speed = 0;
            car.state.heading = best.h;
          }
          if (L.resetObjects) {
            L.resetObjects = false;
            movable.forEach(({ body, home }) => {
              body.position.copy(home.p);
              body.quaternion.copy(home.q);
              body.velocity.set(0, 0, 0);
              body.angularVelocity.set(0, 0, 0);
              body.sleep();
            });
          }

          // Input
          const k = L.keys;
          const active = L.started && !L.paused;
          let throttle = active ? THREE.MathUtils.clamp((k.forward ? 1 : 0) - (k.backward ? 1 : 0) + L.touch.throttle, -1, 1) : 0;
          let steer = active ? THREE.MathUtils.clamp((k.left ? 1 : 0) - (k.right ? 1 : 0) + L.touch.steer, -1, 1) : 0;
          let braking = active && (k.brake || L.touch.brake);
          let boosting = active && (k.boost || L.touch.boost) && throttle > 0 && L.boost > 4 && L.engineOn;
          L.boost = THREE.MathUtils.clamp(L.boost + (boosting ? -38 : 16) * dt, 0, 100);
          if (L.boost <= 4) boosting = false;

          // Autopilot: plan a route when a new destination arrives, then drive it.
          if (L.autoCancel) {
            L.autoCancel = false;
            driver.stop();
          }
          if (L.auto && L.auto !== lastAuto) {
            lastAuto = L.auto;
            const from = car.root.position;
            driver.start(graph.route({ x: from.x, z: from.z }, L.auto.dest));
            if (!L.engineOn) A.toggleEngine();
          }
          if (!L.auto) lastAuto = null;
          if (active && driver.active) {
            const ap = driver.step(dt, { x: car.root.position.x, z: car.root.position.z, heading: car.state.heading, speed: car.state.speed });
            if (ap) {
              throttle = ap.throttle;
              steer = ap.steer;
              braking = ap.brake;
              boosting = false;
              if (ap.arrived) {
                if (L.auto?.tour) {
                  L.tourArrived = true;
                  L.tourWait = 0;
                  A.tourArrived(L.tourIndex);
                } else {
                  L.auto = null;
                  A.autoArrived();
                }
              }
            }
          } else if (active && L.auto && L.tourArrived) {
            braking = true; // wait at the tour stop
          }
          if (L.tourIndex >= 0 && L.tourArrived && !L.paused) {
            L.tourWait += dt;
            if (L.tourWait > TOUR_WAIT) {
              L.tourWait = 0;
              A.tourNext();
            }
          }

          // Jump (only from the ground)
          if (L.jump) {
            L.jump = false;
            if (active && !car.state.airborne && car.phys.position.y < 0.4) {
              car.phys.velocity.y = 8.5;
              jumpLift = 0.7;
              sound.jump();
            }
          }

          // What the tyres are rolling on
          const cp = car.root.position;
          blob.visible = !curTier.shadows && cp.y < 0.7 && !car.state.airborne;
          if (blob.visible) {
            blob.position.set(cp.x, 0.04, cp.z);
            blob.rotation.y = car.state.heading;
          }
          let surface: Surface = 'grass';
          if (car.state.airborne) surface = 'air';
          else if (cp.y > 0.15 && RAMPS.some((r) => Math.hypot(cp.x - r.x, cp.z - r.z) < r.len * 0.62)) surface = 'wood';
          else if (pondEdge(cp.x, cp.z) < 1) surface = 'water';
          else if (roadDistance(cp.x, cp.z) < -0.4) surface = 'dirt';

          const before = cp.clone();
          jumpLift = Math.max(0, jumpLift - dt);
          const nearRamp = RAMPS.some((r) => Math.hypot(cp.x - r.x, cp.z - r.z) < r.len * 0.75);
          if (nearRamp) jumpLift = 1.4; // keep the full launch after leaving the ramp lip
          const liftCap = jumpLift > 0 ? Infinity : 2.5;
          car.drive(dt, { throttle, steer, boost: boosting, brake: braking }, L.engineOn, liftCap);
          const tp0 = performance.now();
          physics.world.step(curTier.physicsStep, dt, curTier.physicsMaxSub); // 120 Hz on high: no tunnelling through thin letters at speed
          physMs = physMs * 0.9 + (performance.now() - tp0) * 0.1;
          car.sync(dt, braking || throttle < 0, L.engineOn, surface);
          distance += Math.hypot(cp.x - before.x, cp.z - before.z);

          // The pond: drag, a little sink, spray and ripples.
          const wet = pond.update(elapsed, dt, {
            x: cp.x, z: cp.z, speed: car.state.speed, airborne: car.state.airborne, fx: car.forward.x, fz: car.forward.z,
          });
          sink = THREE.MathUtils.damp(sink, wet * 0.42, 5, dt);
          car.setSink(sink);
          if (wet > 0) {
            car.state.speed *= Math.exp(-dt * (0.4 + wet * 1.6));
            if (Math.abs(car.state.speed) > 3) A.unlock('splash');
          }

          movable.forEach(({ mesh, body }) => {
            mesh.position.set(body.position.x, body.position.y, body.position.z);
            mesh.quaternion.set(body.quaternion.x, body.quaternion.y, body.quaternion.z, body.quaternion.w);
          });

          const v = Math.abs(car.state.speed);
          L.speedKmh = Math.round(v * 3.6);
          const skid = Math.max(
            braking && v > 4 ? Math.min(1, v / 18) : 0,
            Math.abs(car.state.steer) * THREE.MathUtils.clamp((v - 11) / 14, 0, 1),
          );
          const pondAt = spatial(pondSpot.x, 1, pondSpot.z);
          sound.update(dt, {
            engineOn: L.engineOn,
            speed: v,
            throttle,
            braking,
            boost: boosting,
            surface,
            skid,
            pondDistance: Math.max(0, Math.hypot(cp.x - pondSpot.x, cp.z - pondSpot.z) - 12),
            pondPan: pondAt.pan,
          });

          // Ambient animation
          grass.update(elapsed);
          const focus = L.started ? cp : camLook;
          grassField.update(elapsed, dt, focus, {
            x: cp.x, z: cp.z, heading: car.state.heading, speed: car.state.speed,
            grounded: !car.state.airborne && cp.y < 0.35,
          });
          ambient.update(elapsed, dt, focus, cp);
          playground.ring.rotation.y = Math.sin(elapsed * 0.6) * 0.25;
          stations.projectStations.forEach((s, i) => {
            s.ring.scale.setScalar(1 + Math.sin(elapsed * 2 + i) * 0.04);
            s.label.position.y = s.labelY + Math.sin(elapsed * 1.4 + i) * 0.12;
          });
          stations.skillStations.forEach((s, i) => s.ring.scale.setScalar(1 + Math.sin(elapsed * 2.1 + i) * 0.05));

          // Skill showcase: start / switch / stop the effect when the requested one changes.
          if (L.showcase !== shownShowcase) {
            if (L.showcase >= 0) {
              const st = stations.skillStations[L.showcase];
              show.enter(st.data, st.center, st.height, st.radius);
              showcaseStart = elapsed;
              showcaseAngle = Math.atan2(st.pos.x - st.center.x, st.pos.z - st.center.z);
              sound.achievement();
              if (!visitedSkills.has(st.data.id)) {
                visitedSkills.add(st.data.id);
                if (visitedSkills.size >= SKILL_GROUPS.length) A.unlock('all-skills');
              }
            } else show.exit();
            shownShowcase = L.showcase;
          }
          show.update(dt);
          sculptures.update(elapsed);
          dancers.update(dt, elapsed, live.current.radioOn, env.lamps, focus);
          content.interactives.forEach((it, i) => it.ring && it.ring.scale.setScalar(1 + Math.sin(elapsed * 2.2 + i) * 0.05));
          (stations.mast.beacon.material as THREE.MeshStandardMaterial).emissiveIntensity = Math.sin(elapsed * 3) > 0.2 ? 6 : 0.3;
          stations.mast.dish.rotation.z = elapsed * 0.3;

          // Collectibles
          const bp = car.root.position;
          collectibles.forEach((c) => {
            if (c.collected) return;
            c.mesh.rotation.y = elapsed * 1.6;
            c.mesh.position.y = c.base.y + Math.sin(elapsed * 2.4 + c.base.x) * 0.25;
            if (Math.hypot(c.mesh.position.x - bp.x, c.mesh.position.y - (bp.y + 0.8), c.mesh.position.z - bp.z) < 2.4) {
              c.collected = true;
              c.mesh.visible = false;
              sound.pickup();
              setCollected((n) => {
                const next = n + 1;
                if (next === collectibles.length) A.unlock('relics');
                else A.flash(`Relic found · ${next} / ${collectibles.length}`);
                return next;
              });
            }
          });

          ringCooldown -= dt;
          if (ringCooldown <= 0 && bp.distanceTo(ringPos) < 3.6) {
            ringCooldown = 3;
            sound.pickup();
            A.unlock('hoop');
          }

          // ── Proximity: what is the car next to? ──
          let target: Target = null;
          let nextPrompt: Prompt = null;
          let nextCard: Card = null;
          stations.projectStations.forEach((s) => {
            if (Math.hypot(bp.x - s.pos.x, bp.z - s.pos.z) < 4.6) {
              target = { kind: 'project', project: s.data };
              nextPrompt = { text: s.data.title, accent: s.data.color, action: 'View project' };
            }
          });
          stations.skillStations.forEach((s) => {
            if (Math.hypot(bp.x - s.pos.x, bp.z - s.pos.z) < 3.4) {
              target = { kind: 'skill', index: s.index };
              nextPrompt = { text: `${s.name} · ${s.data.name}`, accent: s.data.color, action: 'Show skills' };
            }
          });
          content.interactives.forEach((it) => {
            if (Math.hypot(bp.x - it.pos.x, bp.z - it.pos.z) >= it.radius) return;
            if (it.kind === 'approach') {
              nextCard = { kind: 'approach', index: it.index ?? 0 };
              if (!visitedStones.has(it.index ?? 0)) {
                visitedStones.add(it.index ?? 0);
                if (visitedStones.size >= APPROACH.steps.length) A.unlock('approach');
              }
            } else {
              target = { kind: 'item', item: it };
              nextPrompt = { text: it.title, accent: it.accent, action: it.action };
            }
          });
          if (!L.engineOn && throttle !== 0) nextPrompt = { text: 'Engine is off — press F to start', accent: '#ff8f7a', warning: true };
          L.target = target;
          const t = target as Target;
          const nearKey = t ? (t.kind === 'project' ? t.project.id : t.kind === 'skill' ? `skill${t.index}` : t.item.id) : '';
          if (nearKey && nearKey !== lastNear) sound.arrive();
          lastNear = nearKey;
          if (L.showcase >= 0) nextPrompt = null;
          const pk = nextPrompt ? (nextPrompt as NonNullable<Prompt>).text : '';
          if (pk !== lastPromptKey) {
            lastPromptKey = pk;
            setPrompt(nextPrompt);
          }
          const nc = nextCard as Card;
          const ck = nc ? `a${nc.index}` : '';
          if (ck !== lastCardKey) {
            lastCardKey = ck;
            setCard(nc);
          }

          // ── Achievement checks (a few times per second) ──
          checkTimer -= dt;
          if (checkTimer <= 0 && L.started) {
            checkTimer = 0.4;
            if (distance > 100) A.unlock('first-drive');
            if (L.speedKmh >= 110) A.unlock('speed');
            if (L.timeOfDay === 'night' && L.speedKmh > 15) A.unlock('night');
            let lettersMoved = 0;
            let cratesMoved = 0;
            let pinsDown = 0;
            let drumsDown = 0;
            movable.forEach(({ body, home }) => {
              const moved = body.position.distanceTo(home.p);
              q.set(body.quaternion.x, body.quaternion.y, body.quaternion.z, body.quaternion.w);
              up.set(0, 1, 0).applyQuaternion(q);
              const kind = BODY_KIND.get(body);
              if (letterBodies.has(body)) {
                if (moved > 1 || up.y < 0.8) lettersMoved++;
              } else if (kind === 'wood' && moved > 1.5) cratesMoved++;
              else if (kind === 'pin' && up.y < 0.6) pinsDown++;
              else if (kind === 'metal' && up.y < 0.6) drumsDown++;
            });
            if (lettersMoved > 0) A.unlock('name-crash');
            if (cratesMoved >= 6) A.unlock('crates');
            if (pinsDown >= 10) A.unlock('strike');
            if (drumsDown >= 3) A.unlock('drums');
          }

          // ── Camera ──
          camYaw = THREE.MathUtils.damp(camYaw, L.yawTarget, 4, dt);
          L.yaw = camYaw;
          const mode = L.cameraMode;
          const fwd = car.forward;
          if (mode === 'follow') {
            const dist = 15.5 + v * 0.16;
            desiredPos.set(bp.x + Math.sin(camYaw) * dist, bp.y + 9.6 + v * 0.07, bp.z + Math.cos(camYaw) * dist);
            desiredLook.set(bp.x + fwd.x * v * 0.25, bp.y + 1, bp.z + fwd.z * v * 0.25);
          } else if (mode === 'chase') {
            if (L.mobile) {
              // GTA-style: low and close behind the car, looking down the road ahead of it.
              const back = 8.2 + v * 0.07;
              desiredPos.set(bp.x - fwd.x * back, bp.y + 3.3 + v * 0.01, bp.z - fwd.z * back);
              desiredLook.set(bp.x + fwd.x * 9, bp.y + 1.5, bp.z + fwd.z * 9);
            } else {
              const back = 10 + v * 0.08;
              desiredPos.set(bp.x - fwd.x * back, bp.y + 3.9, bp.z - fwd.z * back);
              desiredLook.set(bp.x + fwd.x * 7, bp.y + 1.4, bp.z + fwd.z * 7);
            }
          } else {
            desiredPos.set(bp.x + Math.sin(camYaw) * 24, bp.y + 46, bp.z + Math.cos(camYaw) * 24);
            desiredLook.set(bp.x, bp.y, bp.z);
          }
          if (L.photo && !wasPhoto) {
            // Enter photo mode from wherever the camera is now.
            L.yawTarget = Math.atan2(camPos.x - bp.x, camPos.z - bp.z);
            camYaw = L.yawTarget;
            const d = camPos.distanceTo(bp);
            L.photoDist = THREE.MathUtils.clamp(d, 5, 30);
            L.pitch = THREE.MathUtils.clamp(Math.asin(THREE.MathUtils.clamp((camPos.y - bp.y - 1.2) / Math.max(d, 0.1), -1, 1)), 0.06, 1.35);
          }
          wasPhoto = L.photo;
          if (L.photo) {
            const pd = L.photoDist;
            desiredPos.set(
              bp.x + Math.sin(camYaw) * Math.cos(L.pitch) * pd,
              bp.y + 1.2 + Math.sin(L.pitch) * pd,
              bp.z + Math.cos(camYaw) * Math.cos(L.pitch) * pd,
            );
            desiredLook.set(bp.x, bp.y + 1.1, bp.z);
          }
          const inShowcase = L.showcase >= 0;
          if (!inShowcase) {
            for (const b of camBlockers) {
              const dx = desiredPos.x - b.x;
              const dz = desiredPos.z - b.z;
              const c = Math.cos(b.rot);
              const sn = Math.sin(b.rot);
              const lx = dx * c - dz * sn;
              const lz = dx * sn + dz * c;
              if (Math.abs(lx) < b.hx && Math.abs(lz) < b.hz && desiredPos.y < b.top + 1.5) desiredPos.y = b.top + 1.5;
            }
          }
          if (inShowcase) {
            // Cinematic sweep across the front of the model.
            const st = stations.skillStations[L.showcase];
            const R = Math.max(10, st.radius * 2 + st.height * 1.3);
            // Side-on sweep: the car waits on the front axis, so stay well round to the side.
            const a = showcaseAngle + 1.35 + Math.sin((elapsed - showcaseStart) * 0.22) * 0.32;
            desiredPos.set(st.center.x + Math.sin(a) * R, st.height * 0.7 + 2.6, st.center.z + Math.cos(a) * R);
            // Aim a little to the right of the model so it sits in the left of the frame,
            // clear of the skills panel on the right.
            const side = window.innerWidth > 760 ? R * 0.32 : 0;
            desiredLook.set(
              st.center.x + Math.cos(a) * side,
              st.height * 0.48,
              st.center.z - Math.sin(a) * side,
            );
          }
          // Keep the camera inside the forest ring so the edge of the world is never in view.
          desiredPos.x = THREE.MathUtils.clamp(desiredPos.x, -CAMERA_HALF, CAMERA_HALF);
          desiredPos.z = THREE.MathUtils.clamp(desiredPos.z, -CAMERA_HALF, CAMERA_HALF);
          desiredPos.y = Math.max(desiredPos.y, 1.6);

          if (!L.started) {
            // Slow aerial orbit behind the intro screen
            introT = 0;
            const a = elapsed * 0.05;
            desiredPos.set(Math.sin(a) * 62, 34, Math.cos(a) * 62);
            desiredLook.set(0, 0, 0);
            camPos.lerp(desiredPos, 1 - Math.exp(-2 * dt));
            camLook.lerp(desiredLook, 1 - Math.exp(-2 * dt));
          } else if (snapCamera) {
            snapCamera = false;
            camPos.copy(desiredPos);
            camLook.copy(desiredLook);
          } else {
            introT = Math.min(1, introT + dt * 0.45);
            const ease = introT * introT * (3 - 2 * introT);
            const stiff = inShowcase ? 2.2 : L.photo ? 6 : mode === 'chase' ? 7 : 5;
            camPos.lerp(desiredPos, 1 - Math.exp(-(stiff * (0.25 + ease)) * dt));
            camLook.lerp(desiredLook, 1 - Math.exp(-(stiff + 2) * (0.25 + ease) * dt));
          }
          camera.position.copy(camPos);
          if (camPos.distanceToSquared(camLook) > 1e-6) camera.lookAt(camLook);
          if (shake > 0.001) {
            camera.position.x += (Math.random() - 0.5) * shake;
            camera.position.y += (Math.random() - 0.5) * shake;
            shake *= Math.exp(-9 * dt);
          }

          // Labels fade out as the camera gets close so they never fill the screen.
          const hiddenLabel = inShowcase ? stations.skillStations[L.showcase].label : null;
          allLabels.forEach((label) => {
            const d = camPos.distanceTo(label.position);
            label.material.opacity = label === hiddenLabel ? 0 : THREE.MathUtils.smoothstep(d, 6, 12);
            label.visible = label.material.opacity > 0.01;
          });
          // Phones get a wider lens: vertical FOV is what a portrait screen is short of.
          const baseFov = L.mobile ? (camera.aspect < 1 ? 84 : 72) : 50;
          const targetFov = baseFov + (boosting ? 8 : 0);
          if (Math.abs(camera.fov - targetFov) > 0.05) {
            camera.fov = THREE.MathUtils.damp(camera.fov, targetFov, 4, dt);
            camera.updateProjectionMatrix();
          }

          env.followSun(L.started ? bp : camLook);
          post.tick(elapsed);
          const tr0 = performance.now();
          post.render(dt);
          renderMs = renderMs * 0.9 + (performance.now() - tr0) * 0.1;
          if (L.capture) {
            // Read the frame right after rendering it (the drawing buffer is still intact).
            L.capture = false;
            A.capture(renderer.domElement);
          }

          hudTimer -= dt;
          if (hudTimer <= 0) {
            hudTimer = curTier.hudInterval;
            setSpeedKmh(L.speedKmh);
            setBoostPct(Math.round(L.boost));
            if (minimapRef.current) drawMap(minimapRef.current, true);
            if (mapRef.current) drawMap(mapRef.current, false);
          }
        };
        tick();
      })
      .catch((err) => {
        console.error(err);
        if (!disposed) setPhase('error');
      });

    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', onResize);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      renderer.domElement.removeEventListener('pointerdown', onPointerDown);
      renderer.domElement.removeEventListener('wheel', onWheel);
      sound.silence();
      post.composer.dispose();
      renderer.dispose();
      if (container.contains(renderer.domElement)) container.removeChild(renderer.domElement);
    };
    // The loop reads callbacks through refs, so the scene is built exactly once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Hide the welcome card once the visitor starts exploring.
  useEffect(() => {
    if (!welcome) return;
    const id = setTimeout(() => setWelcome(false), 16000);
    return () => clearTimeout(id);
  }, [welcome]);

  const touch = (action: 'up' | 'down' | 'left' | 'right' | 'boost' | 'brake', on: boolean) => {
    const t = live.current.touch;
    if (action === 'up') t.throttle = on ? 1 : 0;
    if (action === 'down') t.throttle = on ? -1 : 0;
    if (action === 'left') t.steer = on ? 1 : 0;
    if (action === 'right') t.steer = on ? -1 : 0;
    if (action === 'boost') t.boost = on;
    if (action === 'brake') t.brake = on;
  };
  const touchProps = (action: Parameters<typeof touch>[0]) => ({
    onPointerDown: (e: React.PointerEvent) => {
      (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
      touch(action, true);
    },
    onPointerUp: () => touch(action, false),
    onPointerCancel: () => touch(action, false),
  });

  // ── Virtual joystick (mobile): up = throttle, down = reverse, left/right = steer, diagonals blend ──
  const STICK_R = 52;
  const moveStick = (e: React.PointerEvent) => {
    const el = stickRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    let dx = e.clientX - (r.left + r.width / 2);
    let dy = e.clientY - (r.top + r.height / 2);
    const len = Math.hypot(dx, dy);
    if (len > STICK_R) {
      dx = (dx / len) * STICK_R;
      dy = (dy / len) * STICK_R;
    }
    const nx = dx / STICK_R;
    const ny = dy / STICK_R;
    const mag = Math.hypot(nx, ny);
    const dead = 0.14;
    const scale = mag < dead ? 0 : (mag - dead) / (1 - dead) / mag;
    const t = live.current.touch;
    t.throttle = -ny * scale;
    t.steer = THREE.MathUtils.clamp(-nx * scale * 1.2, -1, 1);
    setStick({ x: dx, y: dy, active: true });
  };
  const stickProps = {
    onPointerDown: (e: React.PointerEvent) => {
      if (stickPointer.current !== null) return;
      stickPointer.current = e.pointerId;
      (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
      const L = live.current;
      if (L.showcase < 0 && (L.auto || L.tourIndex >= 0)) stopAuto('Autopilot off · you have the wheel');
      moveStick(e);
    },
    onPointerMove: (e: React.PointerEvent) => {
      if (stickPointer.current === e.pointerId) moveStick(e);
    },
    onPointerUp: (e: React.PointerEvent) => releaseStick(e),
    onPointerCancel: (e: React.PointerEvent) => releaseStick(e),
  };
  function releaseStick(e: React.PointerEvent) {
    if (stickPointer.current !== e.pointerId) return;
    stickPointer.current = null;
    live.current.touch.throttle = 0;
    live.current.touch.steer = 0;
    setStick({ x: 0, y: 0, active: false });
  }

  // Run a car-menu action; panels/modes close the drawer, quick toggles leave it open.
  const menuDo = (fn: () => void, close = true) => () => {
    fn();
    if (close) setCarMenu(false);
  };

  const ready = phase === 'ready';
  const gaugeFrac = Math.min(1, speedKmh / (CAR.boostSpeed * 3.6));
  const ARC = 2 * Math.PI * 44 * 0.75;
  const gear = !engineOn ? 'Engine off' : speedKmh === 0 ? 'Idle' : speedKmh < 25 ? '2nd gear' : speedKmh < 55 ? '3rd gear' : speedKmh < 85 ? '4th gear' : 'Top gear';
  const closePanel = () => setPanel(null);

  return (
    <div className={`world-root ${showcase !== null ? 'is-showcase' : ''} ${photo ? 'is-photo' : ''} ${timeOfDay === 'night' ? 'is-night' : ''} ${mobile ? 'is-mobile' : ''}`}>
      <div ref={mountRef} className="world-canvas" />

      {/* Intro / loader */}
      <div className={`intro ${ready ? 'is-ready' : ''} ${started ? 'is-hidden' : ''}`}>
        <div className="intro-card">
          <div className="eyebrow">
            <i style={{ background: 'var(--w-accent)' }} /> {SITE.role} · {SITE.university}
          </div>
          <h1>{SITE.ownerName}</h1>
          <p className="lede">{SITE.tagline}</p>
          {ready ? (
            <>
              <button className="btn btn-primary" onClick={start}>
                Start driving
                <span className="kbd" style={{ background: 'rgba(0,0,0,0.12)', color: 'inherit', borderColor: 'rgba(0,0,0,0.2)' }}>↵</span>
              </button>
              <div className="intro-alt">
                <button className="btn btn-ghost" onClick={() => { start(); startTour(); }}>
                  Take the guided tour
                </button>
                <button className="btn btn-ghost" onClick={() => { start(); setPanel('resume'); }}>
                  Quick view (no driving)
                </button>
              </div>
              <a className="intro-back" href={MAIN_SITE_URL}>← Back to the main portfolio</a>
              <div className="intro-hint">
                <span className="kbd">W</span><span className="kbd">A</span><span className="kbd">S</span><span className="kbd">D</span>
                to drive · <span className="kbd">Space</span> jump · <span className="kbd">E</span> interact · sound on
              </div>
            </>
          ) : (
            <div className="progress">
              <div className="progress-track">
                <div className="progress-fill" style={{ width: `${phase === 'building' ? 100 : Math.round(progress * 100)}%` }} />
              </div>
              <div className="progress-label">
                <span>{phase === 'error' ? 'Could not load the world' : phase === 'building' ? 'Building the valley' : 'Loading models'}</span>
                <span>{phase === 'building' ? '100%' : `${Math.round(progress * 100)}%`}</span>
              </div>
            </div>
          )}
        </div>
      </div>

      {started && (
        <>
          <header className="hud-top">
            <a className="hud-back glass" href={MAIN_SITE_URL} title="Back to the main portfolio">← Main site</a>
            <button className="brand glass" onClick={() => { openPanel('about'); actions.current.unlock('about'); }} title="About me">
              <img className="brand-photo" src={SITE.photo} alt="" />
              <div>
                <div className="brand-name">{SITE.ownerName}</div>
                <div className="brand-role">{SITE.role}</div>
              </div>
            </button>

            <div className="hud-center">
              <div className="pill glass" title="Hidden relics">
                <span className="dot" />
                Relics <span className="num">{collected}/{totalCollectibles}</span>
              </div>
              <button className="pill glass pill-btn" onClick={() => openPanel('resume')} title="Everything on one page">
                Quick view
              </button>
            </div>

            <div className="hud-actions">
              <button className={`icon-btn glass ${tour ? 'is-on' : ''}`} onClick={() => (tour ? stopAuto('Tour ended') : startTour())} title="Guided tour (T)">
                <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" /><path d="m15.5 8.5-2 5-5 2 2-5z" /></svg>
              </button>
              <button className="icon-btn glass" onClick={cycleTime} title={`Time of day: ${TIME_LABEL[timeOfDay]} (N)`}>
                {timeOfDay === 'night' ? (
                  <svg viewBox="0 0 24 24"><path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z" /></svg>
                ) : timeOfDay === 'sunset' ? (
                  <svg viewBox="0 0 24 24"><path d="M4 18h16M7 18a5 5 0 0 1 10 0M12 5v3M5.6 9.6l1.8 1.8M18.4 9.6l-1.8 1.8M3 14h2M19 14h2" /></svg>
                ) : (
                  <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></svg>
                )}
              </button>
              <button className={`icon-btn glass ${radioPlaying ? 'is-on' : ''}`} onClick={() => openPanel('radio')} title="Radio">
                <svg viewBox="0 0 24 24"><rect x="3" y="8" width="18" height="12" rx="2" /><path d="M7 8l9-5" /><circle cx="15.5" cy="14" r="2.6" /><path d="M6.5 12.5h4M6.5 15.5h4" /></svg>
              </button>
              <button className="icon-btn glass" onClick={togglePhoto} title="Photo mode (P)">
                <svg viewBox="0 0 24 24"><path d="M4 8h3l2-3h6l2 3h3v11H4z" /><circle cx="12" cy="13" r="3.5" /></svg>
              </button>
              <button className={`icon-btn glass ${engineOn ? '' : 'is-off'}`} onClick={toggleEngine} title="Engine on/off (F)">
                <svg viewBox="0 0 24 24"><path d="M12 3v8" /><path d="M6.3 7.3a8 8 0 1 0 11.4 0" /></svg>
              </button>
              <button className="icon-btn glass" onClick={() => openPanel('map')} title="Map (M)">
                <svg viewBox="0 0 24 24"><path d="M9 4 3 6v14l6-2 6 2 6-2V4l-6 2z" /><path d="M9 4v14M15 6v14" /></svg>
              </button>
              <button className="icon-btn glass" onClick={() => openPanel('achievements')} title="Achievements">
                <svg viewBox="0 0 24 24"><path d="M8 4h8v5a4 4 0 0 1-8 0z" /><path d="M8 6H5a3 3 0 0 0 3 4M16 6h3a3 3 0 0 1-3 4M12 13v4M8 20h8" /></svg>
                <span className="badge">{unlocked.length}/{ACHIEVEMENTS.length}</span>
              </button>
              <button className="icon-btn glass" onClick={() => openPanel('controls')} title="Controls">
                <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" /><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6M12 17h.01" /></svg>
              </button>
              <button className="icon-btn glass" onClick={() => openPanel('options')} title="Options">
                <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-1.8-.3 1.6 1.6 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.6 1.6 0 0 0-1-1.5 1.6 1.6 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.6 1.6 0 0 0 .3-1.8 1.6 1.6 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.6 1.6 0 0 0 1.5-1 1.6 1.6 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.6 1.6 0 0 0 1.8.3H9a1.6 1.6 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.6 1.6 0 0 0 1 1.5 1.6 1.6 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0-.3 1.8V9a1.6 1.6 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.6 1.6 0 0 0-1.5 1z" /></svg>
              </button>
            </div>
          </header>

          <RadioSet open={panel === 'radio'} onOpen={() => setPanel('radio')} onClose={closePanel} onPlayingChange={setRadioPlaying} />

          {welcome && (
            <div className="welcome glass">
              <button className="welcome-close" onClick={() => setWelcome(false)} aria-label="Close">×</button>
              <div className="welcome-title">Welcome!</div>
              <p>
                I&apos;m <b>{SITE.ownerName}</b>, a <b>{SITE.role.toLowerCase()}</b> at {SITE.university}.
              </p>
              <p>
                Drive around the valley to find my projects, skills and how to reach me. Glowing rings are interactive — and feel free to knock things over.
              </p>
              <div className="welcome-keys">
                <span className="kbd">WASD</span> drive <span className="kbd">E</span> interact <span className="kbd">M</span> map
              </div>
            </div>
          )}

          {tour && (() => {
            const d = destOf(TOUR_ORDER[tour.index]);
            const last = tour.index + 1 >= TOUR_ORDER.length;
            return (
              <div className="tour-card glass" key={`${tour.index}-${tour.arrived}`}>
                <div className="eyebrow"><i style={{ background: d.color }} />Guided tour · stop {tour.index + 1} / {TOUR_ORDER.length}</div>
                <div className="tour-title">{tour.arrived ? d.title : <>Driving to <b>{d.title}</b>…</>}</div>
                {tour.arrived && <p>{d.text}</p>}
                <div className="tour-actions">
                  {tour.arrived && d.open && (
                    <button className="btn btn-primary sm" onClick={interact}>Open <span className="kbd">E</span></button>
                  )}
                  <button className="btn btn-ghost sm" onClick={tourNext}>{last ? 'Finish' : 'Next stop →'}</button>
                  <button className="btn btn-ghost sm" onClick={() => stopAuto('Tour ended · you have the wheel')}>End tour</button>
                </div>
                {tour.arrived && <div className="tour-timer"><i style={{ animationDuration: `${TOUR_WAIT}s` }} /></div>}
                {!tour.arrived && <div className="tour-hint">Press any drive key to take over</div>}
              </div>
            );
          })()}
          {autoDest && !tour && (
            <div className="auto-pill glass">
              <span className="dot" />
              Autopilot → <b>{autoDest}</b>
              <button onClick={() => stopAuto()}>Cancel</button>
            </div>
          )}

          {toast && (
            <div className="toast glass">
              {toast.badge && <span className="toast-badge">{toast.badge}</span>}
              {toast.text}
            </div>
          )}

          {showcase !== null && (
            <ShowcasePanel
              key={showcase}
              index={showcase}
              onPrev={() => enterShowcase(showcase - 1)}
              onNext={() => enterShowcase(showcase + 1)}
              onExit={exitShowcase}
            />
          )}
          {card?.kind === 'approach' && (
            <div className="skill-card glass">
              <div className="eyebrow"><i style={{ background: '#e8c27a' }} />How I build · step {APPROACH.steps[card.index].n}</div>
              <div className="approach-stage">{APPROACH.steps[card.index].stage}</div>
              <div className="skill-desc">{APPROACH.steps[card.index].focus}</div>
              <div className="approach-steps">
                {APPROACH.steps.map((s, i) => (
                  <span key={s.n} className={i === card.index ? 'on' : ''}>{s.n} {s.stage}</span>
                ))}
              </div>
            </div>
          )}

          {prompt && (
            <div className={`prompt glass ${prompt.warning ? 'is-warning' : ''}`} onClick={prompt.action ? interact : undefined}>
              <span className="accent-dot" style={{ background: prompt.accent, boxShadow: `0 0 12px ${prompt.accent}` }} />
              {prompt.text}
              {prompt.action && (
                <span className="go">
                  {prompt.action} <span className="kbd">E</span>
                </span>
              )}
            </div>
          )}

          <div className="speedo glass">
            <div className="gauge">
              <svg viewBox="0 0 104 104">
                <circle cx="52" cy="52" r="44" fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth="6" strokeDasharray={`${ARC} 999`} strokeLinecap="round" />
                <circle cx="52" cy="52" r="44" fill="none" stroke="url(#gaugeGrad)" strokeWidth="6" strokeLinecap="round" strokeDasharray={`${ARC * gaugeFrac} 999`} style={{ transition: 'stroke-dasharray 0.12s linear' }} />
                <defs>
                  <linearGradient id="gaugeGrad" x1="0" y1="0" x2="1" y2="1">
                    <stop offset="0" stopColor="#d98a3a" />
                    <stop offset="1" stopColor="#f6c77b" />
                  </linearGradient>
                </defs>
              </svg>
              <div className="gauge-value">
                <div>
                  <b>{speedKmh}</b>
                  <span>KM/H</span>
                </div>
              </div>
            </div>
            <div className="speedo-meta">
              <div>
                <div className="meta-label">Status</div>
                <div className="meta-value" style={{ color: engineOn ? undefined : '#ff9a8a' }}>{gear}</div>
              </div>
              <div>
                <div className="meta-label">Boost</div>
                <div className="boost-track"><div className="boost-fill" style={{ width: `${boostPct}%` }} /></div>
              </div>
            </div>
          </div>

          {photo && (
            <div className="photo-bar glass">
              <span className="photo-hint">Drag to orbit · scroll to zoom</span>
              <div className="seg">
                {TIMES_OF_DAY.map((t) => (
                  <button key={t} className={timeOfDay === t ? 'on' : ''} onClick={() => setTimeOfDay(t)}>{TIME_LABEL[t]}</button>
                ))}
              </div>
              <button className="btn btn-primary sm" onClick={takePhoto}>Capture <span className="kbd">Space</span></button>
              <button className="btn btn-ghost sm" onClick={togglePhoto}>Exit <span className="kbd">P</span></button>
            </div>
          )}
          {shot > 0 && <div key={shot} className="shot-flash" />}

          <button className="minimap" onClick={() => openPanel('map')} title="Open map (M)">
            <div className="minimap-ring glass">
              <canvas ref={minimapRef} width={168} height={168} style={{ width: 168, height: 168 }} />
            </div>
            <div className="minimap-label">Map · M</div>
          </button>

          {mobile && (
            <>
              <div className="touch">
                <div className="touch-side">
                  <button className="touch-btn touch-round glass" onPointerDown={() => (live.current.jump = true)}>Jump</button>
                </div>
                <div className="stick glass" ref={stickRef} {...stickProps}>
                  <div className="stick-ring" />
                  <div
                    className={`stick-knob ${stick.active ? 'is-active' : ''}`}
                    style={{ transform: `translate(${stick.x}px, ${stick.y}px)` }}
                  />
                </div>
                <div className="touch-side">
                  <button className="touch-btn touch-round glass touch-boost" {...touchProps('boost')}>Boost</button>
                </div>
              </div>

              <button className={`car-fab glass ${carMenu ? 'is-on' : ''}`} onClick={() => { sound.click(); setCarMenu((o) => !o); }} aria-label="Car controls">
                <svg viewBox="0 0 24 24"><path d="M5 16V12l2-5h10l2 5v4M3 16h18v2H3zM7 19v1.5M17 19v1.5M7.5 12h9" /></svg>
              </button>

              {carMenu && <div className="car-scrim" onClick={() => setCarMenu(false)} />}
              <aside className={`car-panel glass ${carMenu ? 'is-open' : ''}`} aria-hidden={!carMenu}>
                <div className="car-panel-head">
                  <span>Car controls</span>
                  <button onClick={() => setCarMenu(false)} aria-label="Close">×</button>
                </div>
                <div className="car-grid">
                  <button className={engineOn ? '' : 'is-off'} onClick={menuDo(toggleEngine, false)}><b>⏻</b>Engine {engineOn ? 'on' : 'off'}</button>
                  <button onClick={menuDo(honk, false)}><b>♪</b>Horn</button>
                  <button onClick={menuDo(cycleCamera, false)}><b>◉</b>View: {CAMERA_LABEL[cameraMode]}</button>
                  <button onClick={menuDo(() => { live.current.respawn = true; })}><b>↺</b>Reset car</button>
                  <button onClick={menuDo(cycleTime, false)}><b>☼</b>{TIME_LABEL[timeOfDay]}</button>
                  <button className={muted ? 'is-off' : ''} onClick={menuDo(toggleMute, false)}><b>♫</b>Sound {muted ? 'off' : 'on'}</button>
                  <button className={radioPlaying ? 'is-on' : ''} onClick={menuDo(() => openPanel('radio'))}><b>◎</b>Radio</button>
                  <button onClick={menuDo(() => openPanel('map'))}><b>⌖</b>Map</button>
                  <button className={tour ? 'is-on' : ''} onClick={menuDo(() => (tour ? stopAuto('Tour ended') : startTour()))}><b>➤</b>{tour ? 'End tour' : 'Guided tour'}</button>
                  <button onClick={menuDo(togglePhoto)}><b>▣</b>Photo mode</button>
                  <button onClick={menuDo(() => openPanel('resume'))}><b>☰</b>Quick view</button>
                  <button onClick={menuDo(() => openPanel('achievements'))}><b>★</b>Awards {unlocked.length}/{ACHIEVEMENTS.length}</button>
                  <button onClick={menuDo(() => { openPanel('about'); unlock('about'); })}><b>☺</b>About me</button>
                  <button onClick={menuDo(() => openPanel('controls'))}><b>?</b>Help</button>
                  <button onClick={menuDo(() => openPanel('options'))}><b>⚙</b>Options</button>
                </div>
              </aside>
            </>
          )}
        </>
      )}

      {/* ── Panels ── */}
      {openProject && (
        <Modal onClose={() => setOpenProject(null)}>
          <div className="eyebrow"><i style={{ background: openProject.color }} />{openProject.category} · {openProject.date}</div>
          <h2>{openProject.title}</h2>
          <div className="lede">{openProject.tagline}</div>
          {openProject.video && (
            <div className="video">
              <iframe
                src={`https://www.youtube-nocookie.com/embed/${openProject.video}?rel=0&modestbranding=1`}
                title={`${openProject.title} gameplay`}
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen"
                allowFullScreen
              />
            </div>
          )}
          <p>{openProject.description}</p>
          <div className="section-label">Highlights</div>
          <ul className="highlights">
            {openProject.highlights.map((h) => <li key={h}>{h}</li>)}
          </ul>
          <div className="section-label">Built with</div>
          <div className="chips">
            {openProject.tech.map((t) => <span key={t} className="chip">{t}</span>)}
          </div>
          {openProject.links.length > 0 && (
            <div className="actions">
              {openProject.links.map((l, i) => (
                <a key={l.url + i} className={`btn ${i === 0 ? 'btn-primary' : 'btn-ghost'}`} href={l.url} target="_blank" rel="noopener noreferrer">
                  {l.label} ↗
                </a>
              ))}
            </div>
          )}
        </Modal>
      )}

      {panel === 'about' && (
        <Modal onClose={closePanel} wide>
          <div className="about">
            <img className="about-photo" src={SITE.photo} alt={`Portrait of ${SITE.fullName}`} />
            <div>
              <div className="eyebrow"><i style={{ background: '#8fcf9a' }} />{SITE.status}</div>
              <h2>{SITE.fullName}</h2>
              <div className="lede">{SITE.role} · {SITE.university} · {SITE.location}</div>
              <p>{SITE.summary}</p>
              <div className="taglines">
                {SITE.taglines.map((t) => <span key={t} className="chip">{t}</span>)}
              </div>
            </div>
          </div>
          <div className="section-label">Education</div>
          <div className="edu">
            {EDUCATION.map((e) => (
              <div key={e.institution} className="edu-row">
                <span className="edu-status">{e.status}</span>
                <div>
                  <b>{e.institution}</b>
                  <div>{e.qualification}</div>
                </div>
              </div>
            ))}
          </div>
          <div className="section-label">How I build</div>
          <p>{APPROACH.intro}</p>
          <div className="approach-grid">
            {APPROACH.steps.map((s) => (
              <div key={s.n}>
                <span>{s.n}</span>
                <b>{s.stage}</b>
                <small>{s.focus}</small>
              </div>
            ))}
          </div>
          <div className="section-label">Also working with</div>
          <ul className="highlights">
            {ADDITIONAL_SKILLS.map((s) => <li key={s.area}><b>{s.area}:</b> {s.detail}</li>)}
          </ul>
          <div className="section-label">Interests</div>
          <div className="chips">{INTERESTS.map((i) => <span key={i} className="chip">{i}</span>)}</div>
          <div className="actions">
            <a className="btn btn-primary" href={SITE.links.email} onClick={() => actions.current.unlock('contact')}>Email me</a>
            <a className="btn btn-ghost" href={SITE.links.linkedin} target="_blank" rel="noopener noreferrer" onClick={() => actions.current.unlock('contact')}>LinkedIn ↗</a>
            <a className="btn btn-ghost" href={SITE.links.github} target="_blank" rel="noopener noreferrer" onClick={() => actions.current.unlock('contact')}>GitHub ↗</a>
          </div>
        </Modal>
      )}

      {panel === 'resume' && (
        <Modal onClose={closePanel} wide>
          <div className="resume">
            <div className="about">
              <img className="about-photo" src={SITE.photo} alt={`Portrait of ${SITE.fullName}`} />
              <div>
                <div className="eyebrow"><i style={{ background: '#8fcf9a' }} />{SITE.status} · Quick view</div>
                <h2>{SITE.fullName}</h2>
                <div className="lede">{SITE.role} · {SITE.university} · {SITE.location}</div>
                <p>{SITE.summary}</p>
                <div className="actions">
                  <a className="btn btn-primary" href={SITE.links.email} onClick={() => actions.current.unlock('contact')}>Email me</a>
                  <a className="btn btn-ghost" href={SITE.links.linkedin} target="_blank" rel="noopener noreferrer" onClick={() => actions.current.unlock('contact')}>LinkedIn ↗</a>
                  <a className="btn btn-ghost" href={SITE.links.github} target="_blank" rel="noopener noreferrer" onClick={() => actions.current.unlock('contact')}>GitHub ↗</a>
                  <button className="btn btn-ghost no-print" onClick={() => window.print()}>Print / PDF</button>
                </div>
              </div>
            </div>
            <div className="section-label">Projects</div>
            <div className="resume-projects">
              {PORTFOLIO_PROJECTS.map((p) => (
                <button key={p.id} className="resume-project" onClick={() => { setPanel(null); showProject(p); }}>
                  <div className="eyebrow"><i style={{ background: p.color }} />{p.category} · {p.date}</div>
                  <b>{p.title}</b>
                  <small>{p.tagline}</small>
                  <div className="chips">{p.tech.slice(0, 4).map((t) => <span key={t} className="chip">{t}</span>)}</div>
                </button>
              ))}
            </div>
            <div className="section-label">Skills</div>
            <div className="resume-skills">
              {SKILL_GROUPS.map((g) => (
                <div key={g.id} className="resume-skill">
                  <b style={{ color: g.color }}>{g.name}</b>
                  {g.items.map((it) => (
                    <div key={it.name} className="rs-row">
                      <span>{it.name}</span>
                      <div className="rs-bar"><i style={{ width: `${it.level}%`, background: g.color }} /></div>
                    </div>
                  ))}
                </div>
              ))}
            </div>
            <div className="section-label">Education</div>
            <div className="edu">
              {EDUCATION.map((e) => (
                <div key={e.institution} className="edu-row">
                  <span className="edu-status">{e.status}</span>
                  <div>
                    <b>{e.institution}</b>
                    <div>{e.qualification}</div>
                  </div>
                </div>
              ))}
            </div>
            <div className="section-label">How I build</div>
            <div className="approach-grid">
              {APPROACH.steps.map((st) => (
                <div key={st.n}>
                  <span>{st.n}</span>
                  <b>{st.stage}</b>
                  <small>{st.focus}</small>
                </div>
              ))}
            </div>
            <div className="section-label">Interests</div>
            <div className="chips">{INTERESTS.map((i) => <span key={i} className="chip">{i}</span>)}</div>
            <div className="metric no-print">
              Want the fun version? Close this and drive around the valley, or press <b>T</b> for a guided tour.
            </div>
          </div>
        </Modal>
      )}

      {panel === 'posts' && (
        <Modal onClose={closePanel}>
          <div className="eyebrow"><i style={{ background: '#9db8f0' }} />Notice board</div>
          <h2>Latest from LinkedIn</h2>
          <div className="lede">Topics I&apos;ve written and shared about recently (dates approximate).</div>
          <div className="posts">
            {POSTS.map((p) => (
              <div key={p.topic} className="post-row">
                <span>{p.when}</span>
                <p>{p.topic}</p>
              </div>
            ))}
          </div>
          <div className="actions">
            <a className="btn btn-primary" href={SITE.links.linkedin} target="_blank" rel="noopener noreferrer" onClick={() => actions.current.unlock('contact')}>Follow on LinkedIn ↗</a>
          </div>
        </Modal>
      )}

      {panel === 'map' && (
        <Modal onClose={closePanel}>
          <div className="eyebrow"><i style={{ background: 'var(--w-accent)' }} />Map</div>
          <h2>The valley</h2>
          <canvas
            ref={mapRef}
            className="map-canvas"
            width={560}
            height={560}
            title="Click a place to drive there"
            onClick={(e) => {
              const r = e.currentTarget.getBoundingClientRect();
              mapClick.current((e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height);
            }}
          />
          <div className="map-legend">
            <span><i style={{ background: '#7cc4d9' }} />Projects</span>
            <span><i style={{ background: '#c3a3e6' }} />Skills</span>
            <span><i style={{ background: '#e8c27a' }} />How I build</span>
            <span><i style={{ background: '#f2b45a' }} />About & contact</span>
            <span><i style={{ background: '#ffd27a' }} />Relics</span>
          </div>
          <div className="section-label">Autopilot · click the map or pick a place</div>
          <div className="dest-grid">
            {DESTINATIONS.map((d) => (
              <button key={d.key} className="dest" onClick={() => goTo(d.key)}>
                <i style={{ background: d.color }} />
                <span>{d.title}</span>
                <small>{d.group}</small>
              </button>
            ))}
          </div>
          <div className="actions">
            <button className="btn btn-primary" onClick={startTour}>Start the guided tour <span className="kbd">T</span></button>
          </div>
        </Modal>
      )}

      {panel === 'achievements' && (
        <Modal onClose={closePanel}>
          <div className="eyebrow"><i style={{ background: 'var(--w-accent)' }} />{unlocked.length} of {ACHIEVEMENTS.length} unlocked</div>
          <h2>Achievements</h2>
          <div className="ach-progress"><i style={{ width: `${(unlocked.length / ACHIEVEMENTS.length) * 100}%` }} /></div>
          <div className="ach-grid">
            {ACHIEVEMENTS.map((a) => {
              const done = unlocked.includes(a.id);
              return (
                <div key={a.id} className={`ach ${done ? 'done' : ''}`}>
                  <span className="ach-icon">{done ? a.icon : '🔒'}</span>
                  <div>
                    <b>{a.title}</b>
                    <small>{a.hint}</small>
                  </div>
                </div>
              );
            })}
          </div>
        </Modal>
      )}

      {panel === 'controls' && (
        <Modal onClose={closePanel}>
          <div className="eyebrow"><i style={{ background: 'var(--w-accent)' }} />How to drive</div>
          <h2>Controls</h2>
          <div className="keys-grid" style={{ marginTop: 18 }}>
            {[
              ['Drive', ['W', 'A', 'S', 'D']], ['Boost', ['Shift']], ['Jump', ['Space']], ['Brake', ['B', 'Ctrl']],
              ['Interact', ['E', 'Enter']], ['Map', ['M']], ['Respawn', ['R']], ['Horn', ['H']],
              ['Engine on/off', ['F']], ['Camera view', ['C']], ['Rotate view', ['Q', 'drag']], ['Mute', ['L']],
              ['Time of day', ['N']], ['Photo mode', ['P']], ['Guided tour', ['T']], ['Take over autopilot', ['W']],
            ].map(([label, keys]) => (
              <div key={label as string} className="key-row">
                <span>{label as string}</span>
                <span className="keys">{(keys as string[]).map((k) => <span key={k} className="kbd">{k}</span>)}</span>
              </div>
            ))}
          </div>
          <div className="metric">
            On a phone, slide the joystick (bottom centre) to drive and open the car button on the right for everything else. Drive into a glowing ring and press <b>E</b> to open what&apos;s there — projects are in
            the four houses and the two sculptures on the east and west edges, your skills are presented by the three statues and the old motorbike at the start (press E in their ring),
            and the contact tiles are at the south end of the main road.
          </div>
        </Modal>
      )}

      {panel === 'options' && (
        <Modal onClose={closePanel}>
          <div className="eyebrow"><i style={{ background: 'var(--w-accent)' }} />Settings</div>
          <h2>Options</h2>
          <div className="opt-list">
            <OptionRow title="Sound" desc="Engine, tyres, impacts and ambience">
              <button className={`switch ${muted ? '' : 'on'}`} onClick={toggleMute}><i /></button>
            </OptionRow>
            <OptionRow
              title="Graphics"
              desc={qualityMode === 'auto' ? `Auto: tunes itself to your device (now ${TIER_NAMES[activeTier]})` : 'Lower = smoother on older devices'}
            >
              <div className="seg">
                {QUALITY_MODES.map((m) => (
                  <button key={m} className={qualityMode === m ? 'on' : ''} onClick={() => setQuality(m)}>{m[0].toUpperCase() + m.slice(1)}</button>
                ))}
              </div>
            </OptionRow>
            <OptionRow title="Engine" desc="Start or stop the engine (F)">
              <button className={`switch ${engineOn ? 'on' : ''}`} onClick={toggleEngine}><i /></button>
            </OptionRow>
            <OptionRow title="Camera" desc="How the camera follows the car (C)">
              <div className="seg">
                {CAMERA_MODES.map((m) => (
                  <button key={m} className={cameraMode === m ? 'on' : ''} onClick={() => setCamera(m)}>{CAMERA_LABEL[m]}</button>
                ))}
              </div>
            </OptionRow>
            <OptionRow title="Time of day" desc="Day, golden hour or a starry night (N)">
              <div className="seg">
                {TIMES_OF_DAY.map((t) => (
                  <button key={t} className={timeOfDay === t ? 'on' : ''} onClick={() => setTimeOfDay(t)}>{TIME_LABEL[t]}</button>
                ))}
              </div>
            </OptionRow>
            <OptionRow title="Guided tour" desc="Sit back: the car drives you to every stop (T)">
              <button className="btn btn-ghost sm" onClick={startTour}>Start tour</button>
            </OptionRow>
            <OptionRow title="Photo mode" desc="Frame a shot and save it as a postcard (P)">
              <button className="btn btn-ghost sm" onClick={togglePhoto}>Open</button>
            </OptionRow>
            <OptionRow title="I'm stuck!" desc="Move the car to the closest road">
              <button className="btn btn-ghost sm" onClick={() => { live.current.stuck = true; closePanel(); }}>Unstuck</button>
            </OptionRow>
            <OptionRow title="Reset objects" desc="Put every crate, pin, drum and letter back">
              <button className="btn btn-ghost sm" onClick={() => { live.current.resetObjects = true; closePanel(); }}>Reset</button>
            </OptionRow>
            <OptionRow title="Reset achievements" desc="Start your collection from scratch">
              <button
                className="btn btn-ghost sm"
                onClick={() => {
                  live.current.unlocked = new Set();
                  saveUnlocked(live.current.unlocked);
                  setUnlocked([]);
                }}
              >
                Reset
              </button>
            </OptionRow>
          </div>
          <div className="section-label">Behind the scenes</div>
          <p>
            Built with Next.js, Three.js and cannon-es physics. Every sound is synthesised live with the Web Audio API. 3D models are licensed
            under CC BY 4.0:
          </p>
          <div className="credits">
            {MODEL_CREDITS.map((c) => (
              <a key={c.url} className="credit" href={c.url} target="_blank" rel="noopener noreferrer">
                {c.title}
                <span>by {c.author}</span>
              </a>
            ))}
          </div>
        </Modal>
      )}
    </div>
  );
}

function CountUp({ to, delay }: { to: number; delay: number }) {
  const [v, setV] = useState(0);
  useEffect(() => {
    let raf = 0;
    const t0 = performance.now() + delay;
    const step = (now: number) => {
      const k = Math.min(1, Math.max(0, (now - t0) / 900));
      setV(Math.round(to * (1 - Math.pow(1 - k, 3))));
      if (k < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [to, delay]);
  return <>{v}%</>;
}

function ShowcasePanel({ index, onPrev, onNext, onExit }: { index: number; onPrev: () => void; onNext: () => void; onExit: () => void }) {
  const g = SKILL_GROUPS[index];
  const sc = SKILL_SHOWCASES[index];
  const avg = Math.round(g.items.reduce((s, i) => s + i.level, 0) / g.items.length);
  return (
    <div className="showcase-panel glass" style={{ ['--sc' as string]: g.color }}>
      <div className="eyebrow"><i style={{ background: g.color }} />Skill showcase · {index + 1} / {SKILL_GROUPS.length}</div>
      <h3>{g.name}</h3>
      <div className="showcase-sub"><b>{sc.name}</b> — {sc.why}</div>
      <div className="showcase-avg">
        <span><CountUp to={avg} delay={250} /></span>
        <small>average self-rating</small>
      </div>
      <div className="showcase-rows">
        {g.items.map((s, i) => (
          <div className="showcase-row" key={s.name} style={{ animationDelay: `${350 + i * 160}ms` }}>
            <span>{s.name}</span>
            <div className="showcase-bar"><i style={{ width: `${s.level}%`, animationDelay: `${350 + i * 160}ms` }} /></div>
            <b><CountUp to={s.level} delay={350 + i * 160} /></b>
          </div>
        ))}
      </div>
      <div className="showcase-nav">
        <button className="btn btn-ghost sm" onClick={onPrev}>← Prev</button>
        <button className="btn btn-primary sm" onClick={onExit}>Back to driving <span className="kbd">E</span></button>
        <button className="btn btn-ghost sm" onClick={onNext}>Next →</button>
      </div>
    </div>
  );
}

function OptionRow({ title, desc, children }: { title: string; desc: string; children: React.ReactNode }) {
  return (
    <div className="opt-row">
      <div>
        <b>{title}</b>
        <small>{desc}</small>
      </div>
      {children}
    </div>
  );
}

function Modal({ children, onClose, wide }: { children: React.ReactNode; onClose: () => void; wide?: boolean }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className={`modal ${wide ? 'modal-wide' : ''}`} onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        <button className="modal-close" onClick={onClose} aria-label="Close">
          <svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18" /></svg>
        </button>
        {children}
      </div>
    </div>
  );
}
