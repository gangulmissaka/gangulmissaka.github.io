import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import {
  BARRELS, CODE_LANDMARKS, COLLECTIBLES, CRATE_STACK, LANDMARKS, MAST_SPOT, PARKED_BIKE, PIN_RACK, PLAY_HALF,
  PROJECT_SPOTS, RAMPS, SKILL_SHOWCASES, STUNT_RING, type LandmarkKey,
} from './layout';
import { largestMesh, medianSurfaceHeight, normalize, prepModel, sizeOf, type ModelSet } from './assets';
import { mulberry32 } from './terrain';
import type { ProjectItem, SkillGroup } from '@/data/portfolioData';
import type { ImpactKind } from '@/lib/audio';

/** What each physics body sounds like when something hits it. */
export const BODY_KIND = new WeakMap<CANNON.Body, ImpactKind>();

// ── Physics ───────────────────────────────────────────────────────

export function createPhysics() {
  const world = new CANNON.World({ gravity: new CANNON.Vec3(0, -22, 0) });
  const sap = new CANNON.SAPBroadphase(world);
  world.broadphase = sap;
  // Two cannon-es broadphase pitfalls made the car drive straight through crates:
  //  1. A body's AABB is computed when it is created (at the origin) and only refreshed while it
  //     is awake and moving, so static and sleeping bodies that were positioned afterwards keep
  //     an AABB at the origin forever.
  //  2. The SAP axis list is only re-sorted when bodies are added or removed.
  // SAP sorts by those AABBs and stops scanning early, so with stale boxes it skipped real
  // pairs. Refresh both before every step (77 bodies: negligible cost).
  world.addEventListener('preStep', () => {
    for (const b of world.bodies) b.aabbNeedsUpdate = true;
    sap.dirty = true;
  });
  world.allowSleep = true;
  // More solver iterations keep stacked / multi-box bodies (crates, name letters) stable.
  (world.solver as CANNON.GSSolver).iterations = 16;
  (world.solver as CANNON.GSSolver).tolerance = 1e-4;
  const ground = new CANNON.Material('ground');
  const bike = new CANNON.Material('bike');
  const prop = new CANNON.Material('prop');
  world.addContactMaterial(new CANNON.ContactMaterial(bike, ground, { friction: 0.0, restitution: 0.05 }));
  // Stiff contact so the car can't sink into crates and other props.
  world.addContactMaterial(new CANNON.ContactMaterial(bike, prop, { friction: 0.05, restitution: 0.2, contactEquationStiffness: 5e7, contactEquationRelaxation: 2 }));
  world.addContactMaterial(new CANNON.ContactMaterial(prop, ground, { friction: 0.45, restitution: 0.15 }));
  world.addContactMaterial(new CANNON.ContactMaterial(prop, prop, { friction: 0.4, restitution: 0.1 }));

  const plane = new CANNON.Body({ type: CANNON.Body.STATIC, shape: new CANNON.Plane(), material: ground });
  plane.quaternion.setFromEuler(-Math.PI / 2, 0, 0);
  world.addBody(plane);
  BODY_KIND.set(plane, 'ground');

  // Invisible walls just inside the forest ring.
  const H = PLAY_HALF + 1.5;
  const wall = (x: number, z: number, hx: number, hz: number) => {
    const b = new CANNON.Body({ type: CANNON.Body.STATIC, shape: new CANNON.Box(new CANNON.Vec3(hx, 6, hz)), material: prop });
    b.position.set(x, 6, z);
    world.addBody(b);
    BODY_KIND.set(b, 'foliage');
  };
  wall(0, -H - 1, H + 2, 1);
  wall(0, H + 1, H + 2, 1);
  wall(-H - 1, 0, 1, H + 2);
  wall(H + 1, 0, 1, H + 2);

  return { world, mats: { ground, bike, prop } };
}
export type Physics = ReturnType<typeof createPhysics>;

function addStaticBox(p: Physics, kind: ImpactKind, x: number, y: number, z: number, hx: number, hy: number, hz: number, rotY = 0) {
  const b = new CANNON.Body({ type: CANNON.Body.STATIC, shape: new CANNON.Box(new CANNON.Vec3(hx, hy, hz)), material: p.mats.prop });
  b.position.set(x, y, z);
  b.quaternion.setFromEuler(0, rotY, 0);
  p.world.addBody(b);
  BODY_KIND.set(b, kind);
  return b;
}

// ── Landmarks ─────────────────────────────────────────────────────

interface LandmarkSpec {
  size: number;
  axis: 'x' | 'y' | 'z' | 'max' | 'xz';
  /** Collider footprint as a fraction of the model's bounding box (0 = no collider). */
  solid: number;
  relight?: boolean;
  /** Sit a photo-scanned diorama's surface flush with the ground. */
  surface?: boolean;
  cast?: boolean;
}

/** Landmarks that are GLB models (the pond is built in code: world/pond.ts). */
type ModelLandmark = Exclude<LandmarkKey, 'pond' | 'nimbo' | 'manim'>;

const KIND_OF: Record<ModelLandmark, ImpactKind> = {
  house: 'house', stiltHouse: 'house', slumHouse: 'house',
  hunter: 'stone', nile: 'stone', chamois: 'stone', fuelPump: 'metal',
};

const SPECS: Record<ModelLandmark, LandmarkSpec> = {
  house: { size: 12, axis: 'max', solid: 0.82, cast: true },
  stiltHouse: { size: 12.5, axis: 'max', solid: 0.72, cast: true },
  slumHouse: { size: 12, axis: 'max', solid: 0.55, cast: true },
  hunter: { size: 5.2, axis: 'x', solid: 0.75, cast: true },
  nile: { size: 6.4, axis: 'x', solid: 0.85, cast: true },
  chamois: { size: 14, axis: 'xz', solid: 0.35, relight: true, surface: true, cast: true },
  fuelPump: { size: 2.0, axis: 'y', solid: 0.95, cast: true },
};

export interface PlacedLandmark {
  key: LandmarkKey;
  object: THREE.Object3D;
  /** Footprint half-size (x, z) in world units, for the minimap. */
  half: [number, number];
  x: number;
  z: number;
  rotY: number;
}

export function placeLandmarks(scene: THREE.Scene, physics: Physics, models: ModelSet) {
  const placed: PlacedLandmark[] = [];
  LANDMARKS.forEach((l) => {
    if (CODE_LANDMARKS.includes(l.key)) return;
    const key = l.key as ModelLandmark;
    const spec = SPECS[key];
    const src = models[key];
    prepModel(src, {
      cast: spec.cast,
      receive: true,
      cutout: 0.5,
      envIntensity: 0.8,
      relight: spec.relight ? { roughness: 0.95 } : undefined,
    });

    const obj = normalize(src, spec.size, spec.axis);
    if (spec.surface) {
      const terrain = largestMesh(obj);
      if (terrain) {
        const edge: [number, number][] = [
          [0.08, 0.08], [0.5, 0.06], [0.92, 0.08], [0.06, 0.5], [0.94, 0.5], [0.08, 0.92], [0.5, 0.94], [0.92, 0.92],
        ];
        obj.position.y = -medianSurfaceHeight(terrain, edge, 0.25) - 0.05;
      }
    } else {
      obj.position.y = -0.04; // bury the base a touch so nothing floats
    }
    const holder = new THREE.Group();
    holder.add(obj);
    holder.position.set(l.x, 0, l.z);
    holder.rotation.y = l.rotY;
    scene.add(holder);

    const s = sizeOf(obj);
    if (spec.solid > 0) {
      addStaticBox(physics, KIND_OF[key], l.x, s.y / 2, l.z, (s.x / 2) * spec.solid, Math.max(1, s.y / 2), (s.z / 2) * spec.solid, l.rotY);
    }
    placed.push({ key: l.key, object: holder, half: [s.x / 2, s.z / 2], x: l.x, z: l.z, rotY: l.rotY });
  });

  // The old motorbike now rests on its kickstand beside the fuel pump.
  prepModel(models.bike, { cast: true, receive: true, envIntensity: 1 });
  const bike = normalize(models.bike, 2.3, 'x');
  const parked = new THREE.Group();
  parked.add(bike);
  bike.rotation.x = -0.12; // lean onto the stand (model's long axis is X)
  parked.position.set(PARKED_BIKE.x, 0, PARKED_BIKE.z);
  parked.rotation.y = PARKED_BIKE.rotY;
  scene.add(parked);
  addStaticBox(physics, 'metal', parked.position.x, 0.6, parked.position.z, 1.1, 0.6, 0.35, parked.rotation.y);

  /** The 3D model that presents each kind of showcase. */
  const showcaseModels: Record<'hunter' | 'nile' | 'chamois' | 'bike', THREE.Object3D> = {
    hunter: placed.find((p) => p.key === 'hunter')!.object,
    nile: placed.find((p) => p.key === 'nile')!.object,
    chamois: placed.find((p) => p.key === 'chamois')!.object,
    bike: parked,
  };
  return { placed, showcaseModels };
}

// ── Procedural textures for the playground props ────────────────────

export function canvasTexture(w: number, h: number, draw: (ctx: CanvasRenderingContext2D) => void) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d')!);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

function woodPlanks(w = 512, h = 512, planks = 6, tone = [120, 86, 52]) {
  const rand = mulberry32(5);
  return canvasTexture(w, h, (ctx) => {
    const ph = h / planks;
    for (let i = 0; i < planks; i++) {
      const k = 0.8 + rand() * 0.35;
      ctx.fillStyle = `rgb(${tone[0] * k},${tone[1] * k},${tone[2] * k})`;
      ctx.fillRect(0, i * ph, w, ph);
      for (let g = 0; g < 26; g++) {
        ctx.strokeStyle = `rgba(40,25,12,${0.08 + rand() * 0.12})`;
        ctx.lineWidth = 1 + rand() * 2;
        ctx.beginPath();
        const y = i * ph + rand() * ph;
        ctx.moveTo(0, y);
        ctx.bezierCurveTo(w * 0.3, y + (rand() - 0.5) * 8, w * 0.6, y + (rand() - 0.5) * 8, w, y + (rand() - 0.5) * 6);
        ctx.stroke();
      }
      ctx.fillStyle = 'rgba(25,15,8,0.65)';
      ctx.fillRect(0, i * ph, w, 3);
    }
  });
}

function crateTexture() {
  const base = woodPlanks(512, 512, 5, [150, 112, 66]);
  const img = base.image as HTMLCanvasElement;
  const ctx = img.getContext('2d')!;
  ctx.strokeStyle = 'rgb(92,64,36)';
  ctx.lineWidth = 46;
  ctx.strokeRect(23, 23, 466, 466);
  ctx.lineWidth = 38;
  ctx.beginPath();
  ctx.moveTo(40, 40);
  ctx.lineTo(472, 472);
  ctx.stroke();
  ctx.strokeStyle = 'rgba(20,12,6,0.5)';
  ctx.lineWidth = 3;
  ctx.strokeRect(46, 46, 420, 420);
  base.needsUpdate = true;
  return base;
}

function rustyDrumTexture() {
  const rand = mulberry32(11);
  return canvasTexture(512, 256, (ctx) => {
    ctx.fillStyle = '#7d2a1c';
    ctx.fillRect(0, 0, 512, 256);
    for (let i = 0; i < 2600; i++) {
      const r = rand();
      ctx.fillStyle = r > 0.6 ? 'rgba(120,64,30,0.5)' : r > 0.3 ? 'rgba(60,30,20,0.45)' : 'rgba(170,100,60,0.35)';
      const s = 2 + rand() * 14;
      ctx.beginPath();
      ctx.arc(rand() * 512, rand() * 256, s, 0, Math.PI * 2);
      ctx.fill();
    }
    [64, 192].forEach((y) => {
      ctx.fillStyle = 'rgba(30,14,8,0.6)';
      ctx.fillRect(0, y - 6, 512, 12);
      ctx.fillStyle = 'rgba(200,140,100,0.25)';
      ctx.fillRect(0, y - 6, 512, 3);
    });
  });
}


// ── Physics playground ───────────────────────────────────────────

export interface DynamicProp {
  mesh: THREE.Object3D;
  body: CANNON.Body;
}

export function createPlayground(scene: THREE.Scene, physics: Physics) {
  const dynamic: DynamicProp[] = [];
  const plankTex = woodPlanks(512, 512, 7);
  plankTex.wrapS = plankTex.wrapT = THREE.RepeatWrapping;
  const rampMat = new THREE.MeshStandardMaterial({ map: plankTex, roughness: 0.85 });
  const frameMat = new THREE.MeshStandardMaterial({ color: 0x4a3524, roughness: 0.9 });

  RAMPS.forEach((r) => {
    const angle = Math.asin(r.h / r.len);
    const g = new THREE.Group();
    g.position.set(r.x, 0, r.z);
    g.rotation.y = r.rotY;
    // Low end at local +Z, high end at local -Z: approach travelling toward -Z.
    const deck = new THREE.Mesh(new THREE.BoxGeometry(r.w, 0.3, r.len), rampMat);
    deck.rotation.x = angle;
    deck.position.y = r.h / 2;
    deck.castShadow = deck.receiveShadow = true;
    g.add(deck);
    // support frame under the high end
    const legH = r.h;
    [-1, 1].forEach((side) => {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.3, legH, 0.3), frameMat);
      leg.position.set((side * (r.w - 0.4)) / 2, legH / 2, -Math.cos(angle) * r.len * 0.5 + 0.25);
      leg.castShadow = true;
      g.add(leg);
    });
    const brace = new THREE.Mesh(new THREE.BoxGeometry(r.w - 0.4, 0.25, 0.25), frameMat);
    brace.position.set(0, legH * 0.55, -Math.cos(angle) * r.len * 0.5 + 0.25);
    g.add(brace);
    scene.add(g);

    const body = new CANNON.Body({ type: CANNON.Body.STATIC, material: physics.mats.ground });
    body.addShape(new CANNON.Box(new CANNON.Vec3(r.w / 2, 0.15, r.len / 2)));
    body.position.set(r.x, r.h / 2, r.z);
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(angle, r.rotY, 0, 'YXZ'));
    body.quaternion.set(q.x, q.y, q.z, q.w);
    physics.world.addBody(body);
    BODY_KIND.set(body, 'wood');
  });

  // Hoop of fire-orange steel above the main ramp.
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(3.3, 0.22, 20, 64),
    new THREE.MeshStandardMaterial({ color: 0x3a1a08, emissive: 0xff7a1a, emissiveIntensity: 2.4, roughness: 0.4, metalness: 0.6 }),
  );
  ring.position.set(STUNT_RING.x, STUNT_RING.y, STUNT_RING.z);
  scene.add(ring);
  [-1, 1].forEach((side) => {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.18, STUNT_RING.y - 3.2, 10), frameMat);
    pole.position.set(STUNT_RING.x + side * 3.5, (STUNT_RING.y - 3.2) / 2, STUNT_RING.z);
    pole.castShadow = true;
    scene.add(pole);
  });

  // Crate pyramid
  const crateMat = new THREE.MeshStandardMaterial({ map: crateTexture(), roughness: 0.85 });
  const crateGeo = new THREE.BoxGeometry(1.6, 1.6, 1.6);
  for (let row = 0; row < 4; row++) {
    const count = 4 - row;
    for (let c = 0; c < count; c++) {
      const x = CRATE_STACK.x + (c - (count - 1) / 2) * 1.68;
      const y = 0.8 + row * 1.62;
      const mesh = new THREE.Mesh(crateGeo, crateMat);
      mesh.castShadow = mesh.receiveShadow = true;
      scene.add(mesh);
      // 45 kg: heavy enough to really stop the car and tumble, light enough to scatter.
      const body = new CANNON.Body({ mass: 45, material: physics.mats.prop, shape: new CANNON.Box(new CANNON.Vec3(0.8, 0.8, 0.8)) });
      BODY_KIND.set(body, 'wood');
      body.position.set(x, y, CRATE_STACK.z);
      body.sleepSpeedLimit = 0.3;
      body.sleep();
      physics.world.addBody(body);
      dynamic.push({ mesh, body });
    }
  }

  // Rusty oil drums
  const drumMat = new THREE.MeshStandardMaterial({ map: rustyDrumTexture(), roughness: 0.7, metalness: 0.45 });
  const drumGeo = new THREE.CylinderGeometry(0.42, 0.42, 1.25, 22);
  BARRELS.forEach(([x, z]) => {
    const mesh = new THREE.Mesh(drumGeo, drumMat);
    mesh.castShadow = mesh.receiveShadow = true;
    scene.add(mesh);
    const body = new CANNON.Body({ mass: 22, material: physics.mats.prop, shape: new CANNON.Cylinder(0.42, 0.42, 1.25, 10) });
    BODY_KIND.set(body, 'metal');
    body.position.set(x, 0.63, z);
    body.sleep();
    physics.world.addBody(body);
    dynamic.push({ mesh, body });
  });

  // Bowling pins (lathe profile, white lacquer with red bands)
  const pinProfile = [
    [0, 0], [0.13, 0], [0.17, 0.12], [0.2, 0.32], [0.18, 0.5], [0.1, 0.72], [0.085, 0.82], [0.11, 0.96], [0.1, 1.06], [0.05, 1.12], [0, 1.13],
  ].map(([r, y]) => new THREE.Vector2(r * 1.8, y * 1.8));
  const pinGeo = new THREE.LatheGeometry(pinProfile, 20);
  pinGeo.translate(0, -1.02, 0);
  const pinTex = canvasTexture(64, 256, (ctx) => {
    ctx.fillStyle = '#f3efe6';
    ctx.fillRect(0, 0, 64, 256);
    ctx.fillStyle = '#b3241b';
    ctx.fillRect(0, 60, 64, 10);
    ctx.fillRect(0, 76, 64, 10);
  });
  const pinMat = new THREE.MeshStandardMaterial({ map: pinTex, roughness: 0.25 });
  for (let r = 0; r < 4; r++) {
    for (let c = 0; c <= r; c++) {
      const x = PIN_RACK.x + (c - r / 2) * 1.1;
      const z = PIN_RACK.z + r * 1.0;
      const mesh = new THREE.Mesh(pinGeo, pinMat);
      mesh.castShadow = true;
      scene.add(mesh);
      const body = new CANNON.Body({ mass: 5, material: physics.mats.prop, shape: new CANNON.Cylinder(0.22, 0.3, 2.04, 8) });
      BODY_KIND.set(body, 'pin');
      body.position.set(x, 1.03, z);
      body.sleep();
      physics.world.addBody(body);
      dynamic.push({ mesh, body });
    }
  }

  return { dynamic, ring };
}

// ── Station visuals ───────────────────────────────────────────────

/** Soft glowing ring painted on the ground. */
export function groundRing(color: string, radius: number) {
  const tex = canvasTexture(256, 256, (ctx) => {
    const g = ctx.createRadialGradient(128, 128, 60, 128, 128, 128);
    g.addColorStop(0, 'rgba(255,255,255,0)');
    g.addColorStop(0.72, 'rgba(255,255,255,0.0)');
    g.addColorStop(0.86, 'rgba(255,255,255,0.95)');
    g.addColorStop(0.9, 'rgba(255,255,255,0.5)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 256, 256);
  });
  const mat = new THREE.MeshBasicMaterial({
    map: tex,
    color: new THREE.Color(color).multiplyScalar(1.6),
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    fog: false,
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(radius * 2, radius * 2), mat);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = 0.08;
  mesh.renderOrder = 2;
  return mesh;
}

/** Billboard label drawn with the same typography as the HUD. */
export function labelSprite(title: string, subtitle: string, accent: string, hint?: string) {
  const W = 1024;
  const H = 300;
  const tex = canvasTexture(W, H, (ctx) => {
    const r = 46;
    ctx.fillStyle = 'rgba(14,15,16,0.72)';
    ctx.beginPath();
    ctx.roundRect(8, 8, W - 16, H - 16, r);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.14)';
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.fillStyle = accent;
    ctx.beginPath();
    ctx.arc(74, 92, 13, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.62)';
    ctx.font = '600 34px Inter, "Helvetica Neue", Arial, sans-serif';
    ctx.fillText(subtitle.toUpperCase(), 104, 104);
    ctx.fillStyle = '#f6f3ee';
    ctx.font = '700 76px Inter, "Helvetica Neue", Arial, sans-serif';
    ctx.fillText(title, 60, 196, W - 120);
    if (hint) {
      ctx.fillStyle = 'rgba(255,255,255,0.55)';
      ctx.font = '500 30px Inter, "Helvetica Neue", Arial, sans-serif';
      ctx.fillText(hint, 62, 252);
    }
  });
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, fog: false }));
  sprite.scale.set(7.2, 7.2 * (H / W), 1);
  sprite.renderOrder = 3;
  return sprite;
}

export interface ProjectStation {
  data: ProjectItem;
  pos: THREE.Vector3;
  ring: THREE.Mesh;
  label: THREE.Sprite;
  /** Resting height of the label (it bobs around this). */
  labelY: number;
}
export interface SkillStation {
  index: number;
  data: SkillGroup;
  /** Centre of the interaction ring. */
  pos: THREE.Vector3;
  /** The model presenting this skill group, its centre and height. */
  model: THREE.Object3D;
  center: THREE.Vector3;
  height: number;
  radius: number;
  name: string;
  why: string;
  ring: THREE.Mesh;
  label: THREE.Sprite;
}

export function createStations(
  scene: THREE.Scene,
  physics: Physics,
  projects: ProjectItem[],
  skills: SkillGroup[],
  showcaseModels: Record<'hunter' | 'nile' | 'chamois' | 'bike', THREE.Object3D>,
) {
  const projectStations: ProjectStation[] = projects.slice(0, PROJECT_SPOTS.length).map((data, i) => {
    const spot = PROJECT_SPOTS[i];
    const ring = groundRing(data.color, 4.4);
    ring.position.set(spot.x, 0.08, spot.z);
    scene.add(ring);
    const label = labelSprite(data.title, `Project · ${data.category}`, data.color, 'Drive into the ring · press E');
    if (spot.label) label.position.set(...spot.label);
    else label.position.set(spot.x, 4.4, spot.z);
    scene.add(label);
    return { data, pos: new THREE.Vector3(spot.x, 0, spot.z), ring, label, labelY: label.position.y };
  });

  // Skills are presented by the statues and the old motorbike.
  const skillStations: SkillStation[] = skills.slice(0, SKILL_SHOWCASES.length).map((data, i) => {
    const sc = SKILL_SHOWCASES[i];
    const model = showcaseModels[sc.model];
    model.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(model);
    const center = box.getCenter(new THREE.Vector3()).setY(0);
    const size = box.getSize(new THREE.Vector3());
    const [x, z] = sc.ring;
    const ring = groundRing(data.color, 3.1);
    ring.position.set(x, 0.08, z);
    scene.add(ring);
    const label = labelSprite(data.name, `Skills · ${sc.name}`, data.color, 'Drive into the ring · press E');
    label.scale.multiplyScalar(0.85);
    label.position.set(center.x, size.y + 2.2, center.z);
    scene.add(label);
    return {
      index: i, data, pos: new THREE.Vector3(x, 0, z), model, center, height: size.y,
      radius: Math.max(size.x, size.z) / 2, name: sc.name, why: sc.why, ring, label,
    };
  });

  // Contact zone landmark: an old lattice radio mast with a blinking beacon.
  const mast = new THREE.Group();
  mast.position.set(MAST_SPOT.x, 0, MAST_SPOT.z);
  const steel = new THREE.MeshStandardMaterial({ color: 0x7c7266, roughness: 0.6, metalness: 0.7 });
  const H = 18;
  const legR = 1.1;
  const legs: THREE.Vector3[] = [0, 1, 2].map((k) => new THREE.Vector3(Math.cos((k / 3) * Math.PI * 2) * legR, 0, Math.sin((k / 3) * Math.PI * 2) * legR));
  const strut = (a: THREE.Vector3, b: THREE.Vector3, r: number) => {
    const len = a.distanceTo(b);
    const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, 6), steel);
    m.position.copy(a).add(b).multiplyScalar(0.5);
    m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
    m.castShadow = true;
    mast.add(m);
  };
  const taper = (v: THREE.Vector3, y: number) => new THREE.Vector3(v.x * (1 - (y / H) * 0.75), y, v.z * (1 - (y / H) * 0.75));
  legs.forEach((l) => strut(taper(l, 0), taper(l, H), 0.07));
  for (let y = 0; y < H; y += 2) {
    legs.forEach((l, k) => {
      const n = legs[(k + 1) % 3];
      strut(taper(l, y), taper(n, y + 2), 0.03);
      strut(taper(l, y + 2), taper(n, y + 2), 0.03);
    });
  }
  const beacon = new THREE.Mesh(
    new THREE.SphereGeometry(0.22, 16, 16),
    new THREE.MeshStandardMaterial({ color: 0x220000, emissive: 0xff2a1a, emissiveIntensity: 4 }),
  );
  beacon.position.y = H + 0.25;
  mast.add(beacon);
  const dish = new THREE.Mesh(
    new THREE.SphereGeometry(1.1, 24, 12, 0, Math.PI * 2, 0, Math.PI / 3.2),
    new THREE.MeshStandardMaterial({ color: 0xd9d4ca, roughness: 0.4, metalness: 0.3, side: THREE.DoubleSide }),
  );
  dish.position.set(0, H * 0.7, 0.6);
  dish.rotation.x = Math.PI / 2.4;
  mast.add(dish);
  scene.add(mast);
  const mastBody = new CANNON.Body({ type: CANNON.Body.STATIC, material: physics.mats.prop, shape: new CANNON.Cylinder(1.3, 1.3, 6, 8), position: new CANNON.Vec3(mast.position.x, 3, mast.position.z) });
  physics.world.addBody(mastBody);
  BODY_KIND.set(mastBody, 'metal');

  return { projectStations, skillStations, mast: { beacon, dish } };
}

// ── Collectibles ─────────────────────────────────────────────────

export interface Collectible {
  mesh: THREE.Mesh;
  base: THREE.Vector3;
  collected: boolean;
}

export function createCollectibles(scene: THREE.Scene) {
  const geo = new THREE.OctahedronGeometry(0.55, 0);
  const mat = new THREE.MeshStandardMaterial({ color: 0x2a1a00, emissive: 0xffb340, emissiveIntensity: 3.2, roughness: 0.2, metalness: 0.4 });
  return COLLECTIBLES.map(([x, y, z]) => {
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(x, y, z);
    scene.add(mesh);
    return { mesh, base: new THREE.Vector3(x, y, z), collected: false } as Collectible;
  });
}
