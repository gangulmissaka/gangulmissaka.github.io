import { asset } from '@/lib/basePath';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
// @ts-expect-error -- @types/three points these typings at the separate `meshoptimizer` package; the JS export exists.
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';

// Optimised copies of the source GLBs live in /public/models (meshopt + webp).
export const MODEL_FILES = {
  car: 'classic_car',
  bike: 'rusty_motorbike',
  forest: 'a_forest_3_with_a_road_at_night_for_game',
  house: 'a_house_3d_model_free',
  stiltHouse: 'rusty_roof_house_3d_model_free',
  slumHouse: 'slum_house',
  hunter: 'statue_of_a_hunter',
  nile: 'nile',
  chamois: 'chamois_statue',
  fuelPump: 'fuel_station',
  road: 'muddy_road_with_tire_tracks',
  grass: 'simple_grass_chunks',
} as const;

export type ModelKey = keyof typeof MODEL_FILES;
export type ModelSet = Record<ModelKey, THREE.Group>;

/** Approximate download sizes (KB) so the progress bar moves evenly. */
const SIZE_KB: Record<ModelKey, number> = {
  car: 2730, bike: 1240, forest: 1190, house: 800, stiltHouse: 900, slumHouse: 2400,
  hunter: 900, nile: 2000, chamois: 660, fuelPump: 560, road: 530, grass: 3440,
};

// The Sketchfab models are CC-BY-4.0 and must be credited; the dancer comes from Mixamo.
export const MODEL_CREDITS: { title: string; author: string; url: string }[] = [
  { title: 'FREE 1938/39 Vairogs v.2 (new version)', author: 'Libau Media', url: 'https://sketchfab.com/3d-models/free-193839-vairogs-v2-new-version-e3a9b187643c4bbb84c485b1dd2a53a3' },
  { title: 'Rusty Motorbike', author: 'cansuaydin', url: 'https://sketchfab.com/3d-models/rusty-motorbike-2633c99a142a4f7eafbdfaa2328d9041' },
  { title: 'A forest (3) with a road at night for game', author: 'dasy444', url: 'https://sketchfab.com/3d-models/a-forest-3-with-a-road-at-night-for-game-61f8c7817fe6457fb26e4814cfc48a3f' },
  { title: 'a_house 3d model free', author: 'iGauravRajput', url: 'https://sketchfab.com/3d-models/a-house-3d-model-free-72d61eca72884e8981b57ac94105811f' },
  { title: 'Rusty roof house 3d model free', author: 'iGauravRajput', url: 'https://sketchfab.com/3d-models/rusty-roof-house-3d-model-free-2bc2a0e65d074ed587d9a67b53ec95a8' },
  { title: 'Slum house', author: 'DESIGN BUREAU', url: 'https://sketchfab.com/3d-models/slum-house-e902e0af80804d01924387da6af8eecf' },
  { title: 'Statue of a hunter', author: '3dhdscan', url: 'https://sketchfab.com/3d-models/statue-of-a-hunter-f777e0a58bd84e7f945a9dd688eab27a' },
  { title: 'Nile', author: 'Rigsters', url: 'https://sketchfab.com/3d-models/nile-42e02439c61049d681c897441d40aaa1' },
  { title: 'Chamois Statue', author: '3Dnovator', url: 'https://sketchfab.com/3d-models/chamois-statue-7c893af418cc4787ad9b6c990aa43796' },
  { title: 'fuel station', author: 'AlemanGame', url: 'https://sketchfab.com/3d-models/fuel-station-224ef1e149b3494695c8d5416126208d' },
  { title: 'muddy road with tire tracks', author: 'SPLEEN VISION', url: 'https://sketchfab.com/3d-models/muddy-road-with-tire-tracks-23de5f8d88ee42308d53eaae4accaf43' },
  { title: 'Simple grass chunks', author: '3dhdscan', url: 'https://sketchfab.com/3d-models/simple-grass-chunks-eb4f6dc9d4e3455ea3435385faf58b60' },
  { title: 'Dancers: Kachujin + "Northern Soul Spin Combo"', author: 'Mixamo (Adobe)', url: 'https://www.mixamo.com' },
];

/** Loads every model in parallel, reporting 0..1 progress weighted by file size. */
export function loadModels(onProgress: (p: number) => void): Promise<ModelSet> {
  const loader = new GLTFLoader();
  loader.setMeshoptDecoder(MeshoptDecoder);
  const keys = Object.keys(MODEL_FILES) as ModelKey[];
  const total = keys.reduce((s, k) => s + SIZE_KB[k], 0);
  const done: Record<string, number> = {};
  const report = () => onProgress(Math.min(1, keys.reduce((s, k) => s + (done[k] || 0) * SIZE_KB[k], 0) / total));

  return Promise.all(
    keys.map(
      (key) =>
        new Promise<[ModelKey, THREE.Group]>((resolve, reject) => {
          loader.load(
            asset(`/models/${MODEL_FILES[key]}.glb`),
            (gltf) => {
              done[key] = 1;
              report();
              resolve([key, gltf.scene]);
            },
            (e) => {
              if (e.total) {
                done[key] = 0.95 * (e.loaded / e.total);
                report();
              }
            },
            reject,
          );
        }),
    ),
  ).then((entries) => Object.fromEntries(entries) as ModelSet);
}

// ── Model helpers ───────────────────────────────────────────────────

const _box = new THREE.Box3();
const _v = new THREE.Vector3();
const _c = new THREE.Vector3();

export interface PrepOptions {
  cast?: boolean;
  receive?: boolean;
  /** Turns alpha-blended cut-outs (foliage cards) into alpha-tested ones. */
  cutout?: number;
  envIntensity?: number;
  /** Swap unlit (photo-scan) materials for lit ones so they pick up sun + shadows. */
  relight?: { roughness?: number; color?: THREE.ColorRepresentation };
}

/** Shadow flags + material clean-up for a loaded glTF scene. */
export function prepModel(root: THREE.Object3D, opts: PrepOptions = {}) {
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    mesh.castShadow = !!opts.cast;
    mesh.receiveShadow = !!opts.receive;
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    const out = mats.map((m) => {
      let mat = m as THREE.MeshStandardMaterial;
      if (opts.relight && (m as THREE.MeshBasicMaterial).isMeshBasicMaterial) {
        const basic = m as THREE.MeshBasicMaterial;
        mat = new THREE.MeshStandardMaterial({
          map: basic.map,
          color: opts.relight.color ?? 0xffffff,
          roughness: opts.relight.roughness ?? 0.92,
          metalness: 0,
          side: basic.side,
          transparent: basic.transparent,
          alphaTest: basic.alphaTest,
        });
        if (!mesh.geometry.attributes.normal) mesh.geometry.computeVertexNormals();
      }
      if (opts.cutout !== undefined && (mat.transparent || mat.alphaTest > 0)) {
        mat.transparent = false;
        mat.alphaTest = opts.cutout;
        mat.depthWrite = true;
        mat.side = THREE.DoubleSide;
      }
      if (mat.isMeshStandardMaterial && opts.envIntensity !== undefined) mat.envMapIntensity = opts.envIntensity;
      return mat;
    });
    mesh.material = Array.isArray(mesh.material) ? out : out[0];
  });
  return root;
}

/**
 * Wraps `obj` in a group, scales it so the chosen bounding-box dimension equals `size`,
 * centres it on X/Z and rests its lowest point on y = 0.
 */
export function normalize(obj: THREE.Object3D, size: number, axis: 'x' | 'y' | 'z' | 'max' | 'xz' = 'max') {
  const group = new THREE.Group();
  group.add(obj);
  obj.updateMatrixWorld(true);
  _box.setFromObject(obj);
  _box.getSize(_v);
  const dim =
    axis === 'max' ? Math.max(_v.x, _v.y, _v.z) : axis === 'xz' ? Math.max(_v.x, _v.z) : _v[axis];
  obj.scale.multiplyScalar(size / dim);
  obj.updateMatrixWorld(true);
  _box.setFromObject(obj);
  _box.getCenter(_c);
  obj.position.x -= _c.x;
  obj.position.z -= _c.z;
  obj.position.y -= _box.min.y;
  group.updateMatrixWorld(true);
  return group;
}

/** Bounding-box size of an object in world space. */
export function sizeOf(obj: THREE.Object3D) {
  obj.updateMatrixWorld(true);
  return new THREE.Box3().setFromObject(obj).getSize(new THREE.Vector3());
}

/**
 * Removes geometry whose world-space X is below `minX` (the forest GLB ships a row of
 * loose sample trees beside the actual tile). Handles instanced and plain meshes.
 */
export function cropBelowX(root: THREE.Object3D, minX: number) {
  root.updateMatrixWorld(true);
  const m = new THREE.Matrix4();
  const p = new THREE.Vector3();
  const remove: THREE.Object3D[] = [];
  root.traverse((o) => {
    const inst = o as THREE.InstancedMesh;
    if (inst.isInstancedMesh) {
      let w = 0;
      for (let i = 0; i < inst.count; i++) {
        inst.getMatrixAt(i, m);
        p.setFromMatrixPosition(m.clone().premultiply(inst.matrixWorld));
        if (p.x >= minX) inst.setMatrixAt(w++, m);
      }
      inst.count = w;
      inst.instanceMatrix.needsUpdate = true;
      inst.computeBoundingBox();
      inst.computeBoundingSphere();
      if (w === 0) remove.push(inst);
      return;
    }
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    const pos = mesh.geometry.attributes.position;
    const index = mesh.geometry.index;
    const keep: number[] = [];
    const triCount = index ? index.count / 3 : pos.count / 3;
    const vx = (vi: number) => p.fromBufferAttribute(pos, vi).applyMatrix4(mesh.matrixWorld).x;
    for (let t = 0; t < triCount; t++) {
      const a = index ? index.getX(t * 3) : t * 3;
      const b = index ? index.getX(t * 3 + 1) : t * 3 + 1;
      const c = index ? index.getX(t * 3 + 2) : t * 3 + 2;
      if (vx(a) >= minX && vx(b) >= minX && vx(c) >= minX) keep.push(a, b, c);
    }
    if (keep.length === 0) remove.push(mesh);
    else if (keep.length !== triCount * 3) {
      mesh.geometry = mesh.geometry.clone();
      mesh.geometry.setIndex(keep);
      mesh.geometry.computeBoundingBox();
      mesh.geometry.computeBoundingSphere();
    }
  });
  remove.forEach((o) => o.removeFromParent());
}

/** The non-instanced mesh with the largest X/Z footprint (usually the terrain of a diorama). */
export function largestMesh(root: THREE.Object3D) {
  let best: THREE.Mesh | null = null;
  let bestArea = 0;
  root.updateMatrixWorld(true);
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh || (o as THREE.InstancedMesh).isInstancedMesh) return;
    _box.setFromObject(mesh).getSize(_v);
    if (_v.x * _v.z > bestArea) {
      bestArea = _v.x * _v.z;
      best = mesh;
    }
  });
  return best as THREE.Mesh | null;
}

/**
 * Samples the height of `surface` (topmost hit) at normalised positions across its
 * footprint and returns the median — used to sit dioramas flush with the ground.
 */
export function medianSurfaceHeight(surface: THREE.Mesh, samples: [number, number][], percentile = 0.5) {
  surface.updateMatrixWorld(true);
  _box.setFromObject(surface);
  const ray = new THREE.Raycaster();
  const hits: number[] = [];
  samples.forEach(([u, v]) => {
    const x = THREE.MathUtils.lerp(_box.min.x, _box.max.x, u);
    const z = THREE.MathUtils.lerp(_box.min.z, _box.max.z, v);
    ray.set(new THREE.Vector3(x, _box.max.y + 10, z), new THREE.Vector3(0, -1, 0));
    const hit = ray.intersectObject(surface, false)[0];
    if (hit) hits.push(hit.point.y);
  });
  if (!hits.length) return 0;
  hits.sort((a, b) => a - b);
  return hits[Math.min(hits.length - 1, Math.floor(hits.length * percentile))];
}

/**
 * Renders a top-down orthographic "photo" of part of a model into a texture.
 * Used to turn the photo-scanned road and lawn into tileable ground textures.
 * `crop` is [u0, v0, u1, v1] in the model's X/Z bounding box; `align` rotates the
 * model's long axis onto Z first (for the road strip).
 */
export function bakeTopDown(
  renderer: THREE.WebGLRenderer,
  source: THREE.Object3D,
  crop: [number, number, number, number],
  width: number,
  height: number,
  align = false,
) {
  const scene = new THREE.Scene();
  const holder = new THREE.Group();
  const clone = source.clone(true);
  clone.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    const src = (Array.isArray(mesh.material) ? mesh.material[0] : mesh.material) as THREE.MeshStandardMaterial;
    mesh.material = new THREE.MeshBasicMaterial({
      map: src.map,
      color: src.color,
      side: THREE.DoubleSide,
      alphaTest: src.transparent || src.alphaTest > 0 ? 0.5 : 0,
      fog: false,
    });
  });
  holder.add(clone);
  scene.add(holder);
  holder.updateMatrixWorld(true);

  if (align) {
    let n = 0;
    let mx = 0;
    let mz = 0;
    const pts: number[] = [];
    clone.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      const pos = mesh.geometry.attributes.position;
      for (let i = 0; i < pos.count; i += 3) {
        _v.fromBufferAttribute(pos, i).applyMatrix4(mesh.matrixWorld);
        pts.push(_v.x, _v.z);
        mx += _v.x;
        mz += _v.z;
        n++;
      }
    });
    mx /= n;
    mz /= n;
    let sxx = 0;
    let szz = 0;
    let sxz = 0;
    for (let i = 0; i < pts.length; i += 2) {
      const dx = pts[i] - mx;
      const dz = pts[i + 1] - mz;
      sxx += dx * dx;
      szz += dz * dz;
      sxz += dx * dz;
    }
    const angle = 0.5 * Math.atan2(2 * sxz, sxx - szz);
    holder.rotation.y = angle - Math.PI / 2;
    holder.updateMatrixWorld(true);
  }

  _box.setFromObject(holder);
  const s = _box.getSize(new THREE.Vector3());
  const x0 = _box.min.x + s.x * crop[0];
  const x1 = _box.min.x + s.x * crop[2];
  const z0 = _box.min.z + s.z * crop[1];
  const z1 = _box.min.z + s.z * crop[3];
  const cam = new THREE.OrthographicCamera(-(x1 - x0) / 2, (x1 - x0) / 2, (z1 - z0) / 2, -(z1 - z0) / 2, 0.001, s.y * 4 + 10);
  cam.up.set(0, 0, -1);
  cam.position.set((x0 + x1) / 2, _box.max.y + 1, (z0 + z1) / 2);
  cam.lookAt((x0 + x1) / 2, _box.min.y, (z0 + z1) / 2);

  const target = new THREE.WebGLRenderTarget(width, height, {
    colorSpace: THREE.SRGBColorSpace,
    generateMipmaps: true,
    minFilter: THREE.LinearMipmapLinearFilter,
    magFilter: THREE.LinearFilter,
    wrapS: THREE.MirroredRepeatWrapping,
    wrapT: THREE.MirroredRepeatWrapping,
    anisotropy: Math.min(8, renderer.capabilities.getMaxAnisotropy()),
    samples: 4,
  });
  const prevTarget = renderer.getRenderTarget();
  const prevTone = renderer.toneMapping;
  const prevClear = renderer.getClearColor(new THREE.Color());
  const prevAlpha = renderer.getClearAlpha();
  renderer.toneMapping = THREE.NoToneMapping;
  renderer.setRenderTarget(target);
  renderer.setClearColor(0x6b6a4a, 1);
  renderer.clear();
  renderer.render(scene, cam);
  renderer.setRenderTarget(prevTarget);
  renderer.setClearColor(prevClear, prevAlpha);
  renderer.toneMapping = prevTone;

  // Dispose the temporary materials (textures are shared with the source model).
  clone.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (mesh.isMesh) (mesh.material as THREE.Material).dispose();
  });

  const tex = target.texture;
  return { texture: tex, target, worldWidth: x1 - x0, worldLength: z1 - z0 };
}
