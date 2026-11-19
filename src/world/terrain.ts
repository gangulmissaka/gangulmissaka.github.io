import * as THREE from 'three';
import { CLEAR_ZONES, FOREST_TILE, PLAY_HALF, ROADS, type V2 } from './layout';
import { cropBelowX, normalize, prepModel } from './assets';

// ── Deterministic randomness so the world looks the same on every visit ──
export function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Tileable two-channel value-noise texture (R and G are independent fBm fields). */
export function makeNoiseTexture(size = 256, seed = 7) {
  const rand = mulberry32(seed);
  const channel = () => {
    const out = new Float32Array(size * size);
    let amp = 1;
    let norm = 0;
    for (let cells = 4; cells <= 64; cells *= 2) {
      const lattice = Array.from({ length: cells * cells }, rand);
      const at = (x: number, y: number) => lattice[((y + cells) % cells) * cells + ((x + cells) % cells)];
      for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
          const fx = (x / size) * cells;
          const fy = (y / size) * cells;
          const ix = Math.floor(fx);
          const iy = Math.floor(fy);
          const tx = fx - ix;
          const ty = fy - iy;
          const sx = tx * tx * (3 - 2 * tx);
          const sy = ty * ty * (3 - 2 * ty);
          const v =
            (at(ix, iy) * (1 - sx) + at(ix + 1, iy) * sx) * (1 - sy) +
            (at(ix, iy + 1) * (1 - sx) + at(ix + 1, iy + 1) * sx) * sy;
          out[y * size + x] += v * amp;
        }
      }
      norm += amp;
      amp *= 0.5;
    }
    return out.map((v) => v / norm);
  };
  const r = channel();
  const g = channel();
  const data = new Uint8Array(size * size * 4);
  for (let i = 0; i < size * size; i++) {
    data[i * 4] = Math.round(THREE.MathUtils.clamp((r[i] - 0.5) * 1.8 + 0.5, 0, 1) * 255);
    data[i * 4 + 1] = Math.round(THREE.MathUtils.clamp((g[i] - 0.5) * 1.8 + 0.5, 0, 1) * 255);
    data[i * 4 + 2] = 0;
    data[i * 4 + 3] = 255;
  }
  const tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.needsUpdate = true;
  return tex;
}

// ── Ground ─────────────────────────────────────────────────────────

const FLAT_HALF = FOREST_TILE * 2 + 4; // flat out to the back of the forest ring
const GROUND_SIZE = 640;

/** Visual ground height: flat meadow, then rolling hills behind the forest ring. */
export function groundHeight(x: number, z: number) {
  const d = Math.max(Math.abs(x), Math.abs(z));
  if (d <= FLAT_HALF) return 0;
  const t = THREE.MathUtils.smoothstep(d, FLAT_HALF, FLAT_HALF + 70);
  const n = Math.sin(x * 0.021 + 1.3) * Math.cos(z * 0.017 - 0.4) + 0.5 * Math.sin((x + z) * 0.043);
  return t * (16 + n * 9);
}

export function createGround(scene: THREE.Scene, grassMap: THREE.Texture, noise: THREE.Texture) {
  const geo = new THREE.PlaneGeometry(GROUND_SIZE, GROUND_SIZE, 128, 128);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) pos.setY(i, groundHeight(pos.getX(i), pos.getZ(i)));
  geo.computeVertexNormals();

  const mat = new THREE.MeshStandardMaterial({ map: grassMap, roughness: 0.97, metalness: 0 });
  // Weak GPUs: 1 texture fetch instead of ~10 for the de-tiled grass (the ground covers most of the screen).
  const uLite = { value: 0 };
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uNoise = { value: noise };
    shader.uniforms.uLite = uLite;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec2 vGroundXZ;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvGroundXZ = (modelMatrix * vec4(transformed, 1.0)).xz;');
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        /* glsl */ `#include <common>
        varying vec2 vGroundXZ;
        uniform sampler2D uNoise;
        uniform float uLite;
        // Texture repetition removal (after Inigo Quilez): a smooth noise field picks a
        // per-region random offset, and neighbouring regions are blended together.
        vec3 noTile(sampler2D samp, vec2 uv, float seed) {
          float k = texture(uNoise, 0.045 * uv + seed).r;
          vec2 dx = dFdx(uv), dy = dFdy(uv);
          float l = k * 8.0;
          float f = fract(l);
          float ia = floor(l), ib = ia + 1.0;
          vec2 offa = sin(vec2(3.0, 7.0) * (ia + seed * 13.0));
          vec2 offb = sin(vec2(3.0, 7.0) * (ib + seed * 13.0));
          vec3 ca = textureGrad(samp, uv + offa, dx, dy).rgb;
          vec3 cb = textureGrad(samp, uv + offb, dx, dy).rgb;
          float s = dot(ca - cb, vec3(0.33));
          return mix(ca, cb, smoothstep(0.2, 0.8, f - 0.1 * s));
        }`,
      )
      .replace(
        '#include <map_fragment>',
        /* glsl */ `
        vec2 wp = vGroundXZ;
        vec4 nA = texture2D(uNoise, wp * 0.0042);
        vec4 nB = texture2D(uNoise, wp * 0.019 + 0.37);
        // Two de-tiled layers at different scales and rotations.
        vec3 g;
        if (uLite > 0.5) {
          g = texture2D(map, wp / 3.6).rgb;
        } else {
          vec3 gA = noTile(map, wp / 3.6, 0.0);
          vec3 gB = noTile(map, mat2(0.788, -0.616, 0.616, 0.788) * wp / 5.3, 0.5);
          g = mix(gA, gB, smoothstep(0.3, 0.7, nB.r));
        }
        // Large-scale variation: lush and sun-dried patches.
        g *= mix(vec3(0.84, 0.9, 0.74), vec3(1.06, 1.05, 0.94), nA.g);
        g = mix(g, g * vec3(1.12, 1.0, 0.72), smoothstep(0.55, 0.9, nA.r) * 0.55);
        float d = max(abs(wp.x), abs(wp.y));
        // Needle-covered forest floor where the ring begins, with an organic (noisy) edge…
        float edgeN = (nB.g - 0.5) * 9.0;
        vec3 floorCol = mix(vec3(0.23, 0.20, 0.13), g * vec3(0.55, 0.62, 0.45), smoothstep(0.35, 0.75, nB.r) * 0.65);
        g = mix(g, floorCol, smoothstep(${(PLAY_HALF - 1).toFixed(1)} + edgeN, ${(PLAY_HALF + 9).toFixed(1)} + edgeN, d) * 0.9);
        // …and deep green distant hills.
        g = mix(g, vec3(0.07, 0.10, 0.05), smoothstep(${FLAT_HALF.toFixed(1)}, ${(FLAT_HALF + 40).toFixed(1)}, d));
        diffuseColor.rgb *= g;
        `,
      );
  };
  const mesh = new THREE.Mesh(geo, mat);
  mesh.receiveShadow = true;
  scene.add(mesh);
  return Object.assign(mesh, { setLite: (v: boolean) => (uLite.value = v ? 1 : 0) });
}

// ── Roads ──────────────────────────────────────────────────────────

export interface RoadPath {
  width: number;
  closed: boolean;
  points: THREE.Vector3[]; // evenly spaced samples along the centre line
}

export function sampleRoads(): RoadPath[] {
  return ROADS.map((r) => {
    const curve = new THREE.CatmullRomCurve3(
      r.points.map(([x, z]) => new THREE.Vector3(x, 0, z)),
      !!r.closed,
      'centripetal',
    );
    const n = Math.max(8, Math.ceil(curve.getLength() / 0.8));
    return { width: r.width, closed: !!r.closed, points: curve.getSpacedPoints(n) };
  });
}

/** Distance from (x, z) to the nearest road edge (negative = on the road). */
export function makeRoadDistance(paths: RoadPath[]) {
  return (x: number, z: number) => {
    let best = Infinity;
    for (const p of paths) {
      const pts = p.points;
      for (let i = 0; i < pts.length - 1; i++) {
        const ax = pts[i].x;
        const az = pts[i].z;
        const bx = pts[i + 1].x;
        const bz = pts[i + 1].z;
        const dx = bx - ax;
        const dz = bz - az;
        const t = THREE.MathUtils.clamp(((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz || 1), 0, 1);
        const ex = ax + dx * t - x;
        const ez = az + dz * t - z;
        const dist = Math.sqrt(ex * ex + ez * ez) - p.width / 2;
        if (dist < best) best = dist;
      }
    }
    return best;
  };
}

/** Soft, slightly ragged road shoulders (alpha across the width, varying along it). */
function makeRoadEdgeTexture() {
  const W = 64;
  const H = 256;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const ctx = c.getContext('2d')!;
  const img = ctx.createImageData(W, H);
  const rand = mulberry32(42);
  const wobble = Array.from({ length: 9 }, () => rand());
  for (let y = 0; y < H; y++) {
    const t = y / H;
    let w = 0;
    for (let k = 0; k < 4; k++) w += Math.sin((t * (k + 1) * 2 + wobble[k]) * Math.PI * 2) * (0.5 / (k + 1));
    const edgeL = 0.1 + 0.05 * w;
    const edgeR = 0.1 - 0.05 * Math.sin((t * 3 + wobble[5]) * Math.PI * 2);
    for (let x = 0; x < W; x++) {
      const u = x / (W - 1);
      const a = THREE.MathUtils.smoothstep(u, 0, edgeL * 1.8) * THREE.MathUtils.smoothstep(1 - u, 0, edgeR * 1.8);
      const v = Math.round(a * 255);
      const i = (y * W + x) * 4;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapT = THREE.RepeatWrapping;
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.repeat.set(1, 0.18);
  return tex;
}

export function createRoads(scene: THREE.Scene, paths: RoadPath[], roadMap: THREE.Texture, texAspect: number) {
  const mat = new THREE.MeshStandardMaterial({
    map: roadMap,
    alphaMap: makeRoadEdgeTexture(),
    vertexColors: true,
    transparent: true,
    depthWrite: false,
    roughness: 1,
    metalness: 0,
    color: 0xe8dccb,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -4,
  });
  const group = new THREE.Group();
  paths.forEach((p, idx) => {
    const pts = p.points;
    const n = pts.length;
    const positions = new Float32Array(n * 2 * 3);
    const uvs = new Float32Array(n * 2 * 2);
    const indices: number[] = [];
    const tileLen = p.width * texAspect;
    let dist = 0;
    for (let i = 0; i < n; i++) {
      const prev = pts[Math.max(0, i - 1)];
      const next = pts[Math.min(n - 1, i + 1)];
      const tx = next.x - prev.x;
      const tz = next.z - prev.z;
      const len = Math.hypot(tx, tz) || 1;
      const nx = -tz / len;
      const nz = tx / len;
      if (i > 0) dist += pts[i].distanceTo(pts[i - 1]);
      const y = 0.035 + idx * 0.004; // stagger overlapping roads to avoid z-fighting
      positions.set([pts[i].x + nx * p.width / 2, y, pts[i].z + nz * p.width / 2], i * 6);
      positions.set([pts[i].x - nx * p.width / 2, y, pts[i].z - nz * p.width / 2], i * 6 + 3);
      uvs.set([0, dist / tileLen, 1, dist / tileLen], i * 4);
      if (i < n - 1) {
        const a = i * 2;
        indices.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
      }
    }
    // Open-ended roads fade out over their last few metres instead of ending in a hard edge.
    const colors = new Float32Array(n * 2 * 4);
    let along = 0;
    for (let i = 0; i < n; i++) {
      if (i > 0) along += pts[i].distanceTo(pts[i - 1]);
      const fadeIn = p.closed ? 1 : THREE.MathUtils.smoothstep(along, 0, 5);
      const fadeOut = p.closed ? 1 : THREE.MathUtils.smoothstep(dist - along, 0, 5);
      const a = Math.min(fadeIn, fadeOut);
      colors.set([1, 1, 1, a, 1, 1, 1, a], i * 8);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 4));
    geo.setIndex(indices);
    geo.computeVertexNormals();
    // Ribbon winding can face down depending on direction; force up-facing normals.
    const nrm = geo.attributes.normal as THREE.BufferAttribute;
    for (let i = 0; i < nrm.count; i++) nrm.setXYZ(i, 0, 1, 0);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.receiveShadow = true;
    mesh.renderOrder = 1;
    group.add(mesh);
  });
  mat.side = THREE.DoubleSide;
  scene.add(group);
  return group;
}

// ── Grass tufts (instanced plants taken from the grass-chunks scan) ──

export function createGrass(
  scene: THREE.Scene,
  grassModel: THREE.Object3D,
  roadDistance: (x: number, z: number) => number,
) {
  grassModel.updateMatrixWorld(true);
  const variants: { geo: THREE.BufferGeometry; mat: THREE.MeshStandardMaterial }[] = [];
  grassModel.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    const isPlant = /^r12_[abc]_/.test(mesh.name) || /^rostlinka_07c_rostlinka/.test(mesh.name);
    if (!isPlant) return;
    const geo = mesh.geometry.clone();
    geo.applyMatrix4(mesh.matrixWorld);
    geo.computeBoundingBox();
    const bb = geo.boundingBox!;
    const h = bb.max.y - bb.min.y;
    geo.translate(-(bb.min.x + bb.max.x) / 2, -bb.min.y, -(bb.min.z + bb.max.z) / 2);
    geo.scale(1 / h, 1 / h, 1 / h);
    const src = mesh.material as THREE.MeshStandardMaterial;
    const mat = new THREE.MeshStandardMaterial({
      map: src.map,
      alphaTest: 0.45,
      side: THREE.DoubleSide,
      roughness: 0.9,
      metalness: 0,
      color: new THREE.Color(0.78, 0.92, 0.58),
    });
    variants.push({ geo, mat });
  });
  if (!variants.length) return { update: () => {} };

  const uTime = { value: 0 };
  variants.forEach(({ mat }) => {
    mat.onBeforeCompile = (shader) => {
      shader.uniforms.uTime = uTime;
      // Both faces of a card use the same "up" normal (no back-face flip into darkness).
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <normal_fragment_begin>',
        '#include <normal_fragment_begin>\nnormal = normalize((viewMatrix * vec4(0.0, 1.0, 0.0, 0.0)).xyz);',
      );
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nuniform float uTime;')
        // Light the cards like the ground underneath them instead of as flat planes.
        .replace('#include <beginnormal_vertex>', 'vec3 objectNormal = vec3(0.0, 1.0, 0.0);')
        .replace(
          '#include <begin_vertex>',
          /* glsl */ `#include <begin_vertex>
          #ifdef USE_INSTANCING
            vec3 ip = instanceMatrix[3].xyz;
          #else
            vec3 ip = vec3(0.0);
          #endif
          float sway = sin(uTime * 1.7 + ip.x * 0.31 + ip.z * 0.23) * 0.65 + sin(uTime * 2.9 + ip.x * 0.8) * 0.25;
          float k = transformed.y * transformed.y;
          transformed.x += sway * k * 0.14;
          transformed.z += sway * k * 0.07;`,
        );
    };
  });

  // Clustered placement looks far more natural than a uniform sprinkle.
  const rand = mulberry32(1337);
  const spots: { x: number; z: number; s: number }[] = [];
  const blocked = (x: number, z: number) => {
    if (Math.abs(x) > PLAY_HALF + 3 || Math.abs(z) > PLAY_HALF + 3) return true;
    if (roadDistance(x, z) < 0.5) return true;
    return CLEAR_ZONES.some(([cx, cz, r]) => (x - cx) ** 2 + (z - cz) ** 2 < r * r);
  };
  for (let c = 0; c < 340; c++) {
    const cx = (rand() * 2 - 1) * (PLAY_HALF + 2);
    const cz = (rand() * 2 - 1) * (PLAY_HALF + 2);
    const radius = 1.5 + rand() * 5;
    const count = 10 + Math.floor(rand() * 34);
    for (let i = 0; i < count; i++) {
      const a = rand() * Math.PI * 2;
      const r = radius * Math.sqrt(rand());
      const x = cx + Math.cos(a) * r;
      const z = cz + Math.sin(a) * r;
      if (!blocked(x, z)) spots.push({ x, z, s: 0.32 + rand() * 0.5 });
    }
  }
  for (let i = 0; i < 2600; i++) {
    const x = (rand() * 2 - 1) * (PLAY_HALF + 2);
    const z = (rand() * 2 - 1) * (PLAY_HALF + 2);
    if (!blocked(x, z)) spots.push({ x, z, s: 0.22 + rand() * 0.35 });
  }
  // Road shoulders get a denser fringe.
  for (let i = 0; i < 4000; i++) {
    const x = (rand() * 2 - 1) * PLAY_HALF;
    const z = (rand() * 2 - 1) * PLAY_HALF;
    const d = roadDistance(x, z);
    if (d > 0.4 && d < 2.2 && !blocked(x, z)) spots.push({ x, z, s: 0.25 + rand() * 0.3 });
  }

  const buckets = variants.map(() => [] as typeof spots);
  spots.forEach((s, i) => buckets[i % variants.length].push(s));
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const p = new THREE.Vector3();
  const sc = new THREE.Vector3();
  variants.forEach(({ geo, mat }, vi) => {
    const list = buckets[vi];
    const inst = new THREE.InstancedMesh(geo, mat, list.length);
    list.forEach((s, i) => {
      e.set((rand() - 0.5) * 0.15, rand() * Math.PI * 2, (rand() - 0.5) * 0.15);
      q.setFromEuler(e);
      const wscale = s.s * (0.9 + rand() * 0.6);
      sc.set(wscale, s.s, wscale);
      p.set(s.x, -0.02, s.z);
      inst.setMatrixAt(i, m.compose(p, q, sc));
    });
    inst.receiveShadow = true;
    inst.computeBoundingSphere();
    scene.add(inst);
  });

  return {
    update: (t: number) => {
      uTime.value = t;
    },
  };
}

// ── Forest ring (the boundary the player can't cross) ────────────────

/** Random order, so the first N instances are an even sample (lets a quality tier draw just a fraction). */
function shuffleInstances(inst: THREE.InstancedMesh, rnd: () => number) {
  const a = inst.instanceMatrix.array as Float32Array;
  const c = inst.instanceColor?.array as Float32Array | undefined;
  const tmp = new Float32Array(16);
  for (let i = inst.count - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    tmp.set(a.subarray(i * 16, i * 16 + 16));
    a.copyWithin(i * 16, j * 16, j * 16 + 16);
    a.set(tmp, j * 16);
    if (c) {
      const t3 = [c[i * 3], c[i * 3 + 1], c[i * 3 + 2]];
      c.copyWithin(i * 3, j * 3, j * 3 + 3);
      c[j * 3] = t3[0];
      c[j * 3 + 1] = t3[1];
      c[j * 3 + 2] = t3[2];
    }
  }
  inst.instanceMatrix.needsUpdate = true;
  if (inst.instanceColor) inst.instanceColor.needsUpdate = true;
}

/**
 * A cheaper version of a foliage-card geometry: keeps every other connected card (leaf cluster) and shares the
 * same vertex buffers, so it costs no extra GPU memory. Small meshes (few cards) are returned unchanged.
 */
function liteGeometry(geo: THREE.BufferGeometry): THREE.BufferGeometry {
  const idx = geo.index;
  if (!idx || idx.count < 90) return geo;
  const parent = new Map<number, number>();
  const find = (x: number): number => {
    let r = x;
    while (parent.get(r) !== r) r = parent.get(r)!;
    while (parent.get(x) !== r) {
      const n = parent.get(x)!;
      parent.set(x, r);
      x = n;
    }
    return r;
  };
  const a = idx.array;
  for (let i = 0; i < a.length; i++) if (!parent.has(a[i])) parent.set(a[i], a[i]);
  for (let i = 0; i < a.length; i += 3) {
    const r = find(a[i]);
    parent.set(find(a[i + 1]), r);
    parent.set(find(a[i + 2]), r);
  }
  const order = new Map<number, number>();
  const keep: number[] = [];
  for (let i = 0; i < a.length; i += 3) {
    const r = find(a[i]);
    if (!order.has(r)) order.set(r, order.size);
    if (order.get(r)! % 2 === 0) keep.push(a[i], a[i + 1], a[i + 2]);
  }
  if (order.size < 6 || keep.length < 30) return geo;
  const lite = new THREE.BufferGeometry();
  for (const name of Object.keys(geo.attributes)) lite.setAttribute(name, geo.attributes[name]);
  lite.setIndex(keep);
  lite.boundingBox = geo.boundingBox;
  lite.boundingSphere = geo.boundingSphere;
  return lite;
}

export function createForestRing(scene: THREE.Scene, forestModel: THREE.Object3D) {
  prepModel(forestModel, { receive: true, cutout: 0.42, envIntensity: 0.6 });
  // The GLB includes loose sample trees beside the tile — drop them.
  cropBelowX(forestModel, -5.3);
  // All vegetation in the tile is instanced; the only plain meshes are its terrain and a
  // ground overlay. Drop those and plant every tree, rock and bush on the meadow instead,
  // so the ring has no terrain seams or stretched embankments.
  const plain: THREE.Object3D[] = [];
  forestModel.traverse((o) => {
    if ((o as THREE.Mesh).isMesh && !(o as THREE.InstancedMesh).isInstancedMesh) plain.push(o);
  });
  plain.forEach((o) => o.removeFromParent());
  const tile = normalize(forestModel, FOREST_TILE, 'xz');
  tile.updateMatrixWorld(true);
  const shuf = mulberry32(7);
  tile.traverse((o) => {
    const inst = o as THREE.InstancedMesh;
    if (!inst.isInstancedMesh) return;
    inst.geometry.computeBoundingBox();
    const inv = inst.matrixWorld.clone().invert();
    const mi = new THREE.Matrix4();
    const box = new THREE.Box3();
    const p = new THREE.Vector3();
    for (let i = 0; i < inst.count; i++) {
      inst.getMatrixAt(i, mi);
      const w = mi.clone().premultiply(inst.matrixWorld);
      box.copy(inst.geometry.boundingBox!).applyMatrix4(w);
      p.setFromMatrixPosition(w);
      w.setPosition(p.x, p.y - box.min.y - 0.12, p.z);
      inst.setMatrixAt(i, w.premultiply(inv));
    }
    inst.instanceMatrix.needsUpdate = true;
    inst.computeBoundingBox();
    inst.computeBoundingSphere();
    // The tiles are big and mostly outside the player's shadow frustum; the edge tree line
    // below casts the shadows that matter, which keeps the shadow pass cheap.
    inst.castShadow = false;
    shuffleInstances(inst, shuf);
  });

  const group = new THREE.Group();
  const rand = mulberry32(99);
  const T = FOREST_TILE;
  for (let i = -2; i < 2; i++) {
    for (let j = -2; j < 2; j++) {
      const cx = (i + 0.5) * T;
      const cz = (j + 0.5) * T;
      if (Math.abs(cx) < T && Math.abs(cz) < T) continue; // inner 2×2 is the meadow
      const t = tile.clone(true);
      t.position.x = cx;
      t.position.z = cz;
      t.rotation.y = Math.floor(rand() * 4) * (Math.PI / 2);
      group.add(t);
    }
  }
  scene.add(group);
  const thin: { mesh: THREE.InstancedMesh; full: number; orig: THREE.BufferGeometry }[] = [];
  group.traverse((o) => {
    const im = o as THREE.InstancedMesh;
    if (im.isInstancedMesh) thin.push({ mesh: im, full: im.count, orig: im.geometry });
  });

  // Outer forest on the hills, grown from the tile's own tree cards so the horizon is
  // wall-to-wall trees in every direction (and through any gap in the ring).
  // Pick the instanced card set whose instances stand tallest — that's the pine trees
  // (the most numerous set is low grass clumps).
  let treeSource: THREE.InstancedMesh | null = null;
  let tallest = 0;
  tile.updateMatrixWorld(true);
  tile.traverse((o) => {
    const inst = o as THREE.InstancedMesh;
    if (!inst.isInstancedMesh || inst.count < 12) return;
    inst.geometry.computeBoundingBox();
    const mi = new THREE.Matrix4();
    let sum = 0;
    const samples = Math.min(inst.count, 24);
    for (let i = 0; i < samples; i++) {
      inst.getMatrixAt(Math.floor((i / samples) * inst.count), mi);
      const b = inst.geometry.boundingBox!.clone().applyMatrix4(mi.premultiply(inst.matrixWorld));
      sum += b.max.y - b.min.y;
    }
    if (sum / samples > tallest) {
      tallest = sum / samples;
      treeSource = inst;
    }
  });
  if (treeSource) {
    const src = treeSource as THREE.InstancedMesh;
    const m0 = new THREE.Matrix4();
    src.getMatrixAt(0, m0);
    m0.premultiply(new THREE.Matrix4().copy(src.matrixWorld).setPosition(0, 0, 0));
    const baseQ = new THREE.Quaternion();
    const baseS = new THREE.Vector3();
    m0.decompose(new THREE.Vector3(), baseQ, baseS);
    // Size/base of one tree at unit scale, to plant 8–15 m trees with their roots on the ground.
    src.geometry.computeBoundingBox();
    const unitBox = src.geometry.boundingBox!.clone().applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3(), baseQ, baseS));
    const unitH = unitBox.max.y - unitBox.min.y || 1;
    const COUNT = 2600;
    const GRID = 4;
    const outerBins: THREE.Matrix4[][] = Array.from({ length: GRID * GRID }, () => []);
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const yAxis = new THREE.Vector3(0, 1, 0);
    let n = 0;
    while (n < COUNT) {
      const x = (rand() * 2 - 1) * 320;
      const z = (rand() * 2 - 1) * 320;
      const d = Math.max(Math.abs(x), Math.abs(z));
      if (d < 2 * T - 10) continue;
      const h = 8 + rand() * 7;
      const k = h / unitH;
      q.setFromAxisAngle(yAxis, rand() * Math.PI * 2).multiply(baseQ);
      m.compose(new THREE.Vector3(x, groundHeight(x, z) - unitBox.min.y * k - 0.3, z), q, baseS.clone().multiplyScalar(k));
      const cell = Math.min(GRID - 1, Math.floor(((x + 320) / 640) * GRID)) * GRID + Math.min(GRID - 1, Math.floor(((z + 320) / 640) * GRID));
      outerBins[cell].push(m.clone());
      n++;
    }
    // One mesh per map cell so the camera only draws the cells it can actually see.
    outerBins.forEach((bin) => {
      if (!bin.length) return;
      const chunk = new THREE.InstancedMesh(src.geometry, src.material, bin.length);
      bin.forEach((mm, i) => chunk.setMatrixAt(i, mm));
      chunk.computeBoundingSphere();
      chunk.receiveShadow = false;
      scene.add(chunk);
      thin.push({ mesh: chunk, full: bin.length, orig: chunk.geometry });
    });

    // A dense tree line just past the invisible wall hides the tiles' terrain edges and
    // reads as a continuous forest wall from inside the meadow.
    const EDGE = 640;
    const edgeBins: THREE.Matrix4[][] = [[], [], [], []];
    for (let i = 0; i < EDGE; i++) {
      const side = i % 4;
      const along = (rand() * 2 - 1) * (PLAY_HALF + 14);
      const depth = PLAY_HALF + 2.5 + Math.pow(rand(), 1.6) * 16;
      const x = side === 0 ? along : side === 1 ? along : side === 2 ? -depth : depth;
      const z = side === 0 ? -depth : side === 1 ? depth : along;
      const h = 7 + rand() * 8;
      const k = h / unitH;
      q.setFromAxisAngle(yAxis, rand() * Math.PI * 2).multiply(baseQ);
      m.compose(new THREE.Vector3(x, -unitBox.min.y * k - 0.2, z), q, baseS.clone().multiplyScalar(k * (0.85 + rand() * 0.3)));
      edgeBins[side].push(m.clone());
    }
    edgeBins.forEach((bin) => {
      const chunk = new THREE.InstancedMesh(src.geometry, src.material, bin.length);
      bin.forEach((mm, i) => chunk.setMatrixAt(i, mm));
      chunk.computeBoundingSphere();
      chunk.castShadow = true;
      chunk.receiveShadow = true;
      scene.add(chunk);
      thin.push({ mesh: chunk, full: bin.length, orig: chunk.geometry });
    });
  }

  const liteCache = new Map<THREE.BufferGeometry, THREE.BufferGeometry>();
  return {
    group,
    /** Fraction (0..1) of the trees/bushes to draw. Instances are shuffled, so any prefix is an even sample. */
    setDensity(f: number, lite = false) {
      thin.forEach(({ mesh, full, orig }) => {
        mesh.count = Math.max(1, Math.floor(full * f));
        let g = orig;
        if (lite) {
          g = liteCache.get(orig) ?? liteGeometry(orig);
          liteCache.set(orig, g);
        }
        mesh.geometry = g;
      });
    },
  };
}

export type { V2 };
