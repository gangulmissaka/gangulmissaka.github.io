// A hand-built pond: animated water with sky reflections, shoreline foam and ripple rings,
// a muddy bed and wet bank, swaying reeds and cattails, lily pads with flowers, mossy rocks
// and koi that leap out of the water. The car can drive in: it slows, sinks a little and
// throws up spray, leaving ripples behind it.
import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { mergeGeometries, mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { POND, pondEdge, pondRadiusAt } from './layout';
import { BODY_KIND, type Physics } from './props';
import { mulberry32 } from './terrain';

const RIPPLES = 16;
const WATER_Y = 0.07;

/** Polar grid that follows the irregular shoreline. `f` runs 0 (centre) → `outer` (beyond the shore). */
function polarGeometry(segs: number, rings: number, outer: number, inner = 0, extraMetres = 0) {
  const pos: number[] = [];
  const edge: number[] = [];
  for (let i = 0; i <= rings; i++) {
    const f = inner + ((outer - inner) * i) / rings;
    for (let s = 0; s < segs; s++) {
      const a = (s / segs) * Math.PI * 2;
      const R = pondRadiusAt(a);
      const r = f * R + (f > 1 ? (f - 1) / (outer - 1) * extraMetres : 0);
      pos.push(Math.cos(a) * r, 0, Math.sin(a) * r);
      edge.push(f);
    }
  }
  const idx: number[] = [];
  for (let i = 0; i < rings; i++) {
    for (let s = 0; s < segs; s++) {
      const a = i * segs + s;
      const b = i * segs + ((s + 1) % segs);
      const c = a + segs;
      const d = b + segs;
      idx.push(a, b, c, b, d, c); // counter-clockwise seen from above
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(pos.map((_, i) => (i % 3 === 1 ? 1 : 0)), 3));
  g.setAttribute('aEdge', new THREE.Float32BufferAttribute(edge, 1));
  g.setIndex(idx);
  return g;
}

function rockGeometry(seed: number) {
  const rand = mulberry32(seed);
  let g: THREE.BufferGeometry = new THREE.IcosahedronGeometry(1, 1);
  g.deleteAttribute('normal');
  g.deleteAttribute('uv');
  g = mergeVertices(g);
  const p = g.attributes.position as THREE.BufferAttribute;
  const bumps = Array.from({ length: 5 }, () => [rand() * 2 - 1, rand() * 2 - 1, rand() * 2 - 1, 0.1 + rand() * 0.25]);
  for (let i = 0; i < p.count; i++) {
    const v = new THREE.Vector3().fromBufferAttribute(p, i);
    let k = 0.85 + rand() * 0.25;
    bumps.forEach(([x, y, z, a]) => (k += a * Math.max(0, v.x * x + v.y * y + v.z * z)));
    v.multiplyScalar(k);
    v.y *= 0.5;
    p.setXYZ(i, v.x, v.y, v.z);
  }
  g.computeVertexNormals();
  return g;
}

function tinted(geo: THREE.BufferGeometry, color: THREE.Color) {
  const n = geo.attributes.position.count;
  const c = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) c.set([color.r, color.g, color.b], i * 3);
  geo.setAttribute('color', new THREE.BufferAttribute(c, 3));
  return geo;
}

export function createPond(scene: THREE.Scene, physics: Physics, noise: THREE.Texture) {
  const rand = mulberry32(91);
  const group = new THREE.Group();
  group.position.set(POND.x, 0, POND.z);
  scene.add(group);

  const uTime = { value: 0 };
  const ripples = Array.from({ length: RIPPLES }, () => new THREE.Vector4(0, 0, -100, 0));
  let nextRipple = 0;
  const ripple = (x: number, z: number, strength = 1) => {
    ripples[nextRipple].set(x, z, uTime.value, strength);
    nextRipple = (nextRipple + 1) % RIPPLES;
  };

  // ── Bed + wet bank: dark mud under the water fading out into the grass ──
  const bedGeo = polarGeometry(128, 30, 1.32, 0, 0);
  {
    const f = bedGeo.attributes.aEdge as THREE.BufferAttribute;
    const col = new Float32Array(f.count * 4);
    const deep = new THREE.Color(0x0c110c);
    const mud = new THREE.Color(0x2d2416);
    const bank = new THREE.Color(0x3f3a24);
    const c = new THREE.Color();
    for (let i = 0; i < f.count; i++) {
      const e = f.getX(i);
      if (e < 1) c.copy(deep).lerp(mud, THREE.MathUtils.smoothstep(e, 0.6, 1));
      else c.copy(mud).lerp(bank, THREE.MathUtils.smoothstep(e, 1, 1.2));
      const a = 1 - THREE.MathUtils.smoothstep(e, 1.12, 1.32);
      col.set([c.r, c.g, c.b, a], i * 4);
    }
    bedGeo.setAttribute('color', new THREE.BufferAttribute(col, 4));
  }
  const bed = new THREE.Mesh(
    bedGeo,
    new THREE.MeshStandardMaterial({
      vertexColors: true, transparent: true, roughness: 0.55, metalness: 0, depthWrite: false,
      polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
    }),
  );
  bed.position.y = 0.02;
  bed.receiveShadow = true;
  bed.renderOrder = 1;
  group.add(bed);

  // ── Water ──
  const waterMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.14, metalness: 0, transparent: true, envMapIntensity: 1.25 });
  waterMat.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = uTime;
    sh.uniforms.uNoise = { value: noise };
    sh.uniforms.uRipples = { value: ripples };
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aEdge;\nvarying float vEdge;\nvarying vec2 vWXZ;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvEdge = aEdge;\nvWXZ = (modelMatrix * vec4(position, 1.0)).xz;');
    sh.fragmentShader = sh.fragmentShader
      .replace(
        '#include <common>',
        /* glsl */ `#include <common>
        uniform float uTime;
        uniform sampler2D uNoise;
        uniform vec4 uRipples[${RIPPLES}];
        varying float vEdge;
        varying vec2 vWXZ;
        float rippleH(vec2 p) {
          float h = 0.0;
          for (int i = 0; i < ${RIPPLES}; i++) {
            vec4 r = uRipples[i];
            float age = uTime - r.z;
            if (age < 0.0 || age > 3.5) continue;
            float d = length(p - r.xy);
            float x = d - age * 1.7;
            h += sin(x * 8.0) * exp(-x * x * 2.2) * exp(-age * 1.2) * r.w / (1.0 + d * 0.5);
          }
          return h;
        }
        float waterH(vec2 p) {
          float h = texture2D(uNoise, p * 0.05 + vec2(uTime * 0.013, uTime * 0.009)).r;
          h += texture2D(uNoise, p * 0.11 - vec2(uTime * 0.019, -uTime * 0.012)).g * 0.55;
          return h * 0.22 + rippleH(p) * 0.09;
        }`,
      )
      .replace(
        '#include <color_fragment>',
        /* glsl */ `#include <color_fragment>
        float depthK = smoothstep(1.0, 0.3, vEdge);
        vec3 wc = mix(vec3(0.10, 0.13, 0.085), vec3(0.008, 0.03, 0.035), depthK);
        float n = texture2D(uNoise, vWXZ * 0.4 + uTime * 0.015).r;
        float foam = smoothstep(0.93, 1.0, vEdge + (n - 0.5) * 0.06 + sin(uTime * 1.3 + vWXZ.x * 0.9 + vWXZ.y * 0.6) * 0.01) * (0.45 + n * 0.55);
        foam += clamp(rippleH(vWXZ) * 0.9, 0.0, 0.55);
        diffuseColor.rgb = mix(wc, vec3(0.62, 0.66, 0.6), clamp(foam, 0.0, 1.0) * 0.45);
        diffuseColor.a = mix(0.94, 0.5, smoothstep(0.93, 1.0, vEdge));`,
      )
      .replace(
        '#include <normal_fragment_maps>',
        /* glsl */ `
        vec2 ep = vec2(0.09, 0.0);
        float hx = waterH(vWXZ + ep.xy) - waterH(vWXZ - ep.xy);
        float hz = waterH(vWXZ + ep.yx) - waterH(vWXZ - ep.yx);
        vec3 wn = normalize(vec3(-hx / (2.0 * ep.x), 1.0, -hz / (2.0 * ep.x)));
        normal = normalize((viewMatrix * vec4(wn, 0.0)).xyz);`,
      );
  };
  const water = new THREE.Mesh(polarGeometry(128, 26, 1.0), waterMat);
  water.position.y = WATER_Y;
  water.receiveShadow = true;
  water.renderOrder = 2;
  group.add(water);

  // Helper: a world point on the shore ring at angle a, fraction f of the radius.
  const at = (a: number, f: number) => {
    const r = pondRadiusAt(a) * f;
    return new THREE.Vector3(POND.x + Math.cos(a) * r, 0, POND.z + Math.sin(a) * r);
  };

  // ── Reeds and cattails (sway in the wind) ──
  const sway = (mat: THREE.Material) => {
    mat.onBeforeCompile = (sh) => {
      sh.uniforms.uTime = uTime;
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nuniform float uTime;')
        .replace(
          '#include <project_vertex>',
          /* glsl */ `
          vec4 mvPosition = vec4(transformed, 1.0);
          mvPosition = instanceMatrix * mvPosition;
          float hh = max(mvPosition.y, 0.0);
          float ph = instanceMatrix[3].x * 0.9 + instanceMatrix[3].z * 0.6;
          mvPosition.x += (sin(uTime * 1.7 + ph) * 0.05 + 0.04) * hh * hh;
          mvPosition.z += cos(uTime * 1.3 + ph * 1.3) * 0.03 * hh * hh;
          mvPosition = modelViewMatrix * mvPosition;
          gl_Position = projectionMatrix * mvPosition;`,
        );
    };
    return mat;
  };
  const reedGeo = tinted(new THREE.CylinderGeometry(0.012, 0.03, 1, 4, 4).translate(0, 0.5, 0), new THREE.Color(0x4f6a2a));
  const stem = tinted(new THREE.CylinderGeometry(0.014, 0.022, 1, 4, 4).translate(0, 0.5, 0), new THREE.Color(0x5b6e30));
  const head = tinted(new THREE.CylinderGeometry(0.05, 0.05, 0.24, 7).translate(0, 0.84, 0), new THREE.Color(0x4a2f17));
  const tip = tinted(new THREE.CylinderGeometry(0.004, 0.01, 0.16, 3).translate(0, 1.04, 0), new THREE.Color(0x6a6a3a));
  const cattailGeo = mergeGeometries([stem, head, tip])!;
  const plantMat = sway(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85 }));
  const reedSpots: { m: THREE.Matrix4; cattail: boolean }[] = [];
  const clusters = [0.3, 1.25, 2.2, 3.4, 4.3, 5.4];
  const dummy = new THREE.Object3D();
  clusters.forEach((ca) => {
    const n = 26 + Math.floor(rand() * 16);
    for (let i = 0; i < n; i++) {
      const a = ca + (rand() - 0.5) * 0.55;
      const f = 0.9 + rand() * 0.2;
      const p = at(a, f);
      dummy.position.set(p.x, -0.05, p.z);
      dummy.rotation.set((rand() - 0.5) * 0.25, rand() * Math.PI, (rand() - 0.5) * 0.25);
      const h = 0.8 + rand() * 1.1;
      dummy.scale.set(1, h, 1);
      dummy.updateMatrix();
      reedSpots.push({ m: dummy.matrix.clone(), cattail: rand() < 0.35 });
    }
  });
  const reedList = reedSpots.filter((r) => !r.cattail);
  const tailList = reedSpots.filter((r) => r.cattail);
  const reeds = new THREE.InstancedMesh(reedGeo, plantMat, reedList.length);
  reedList.forEach((r, i) => reeds.setMatrixAt(i, r.m));
  const cattails = new THREE.InstancedMesh(cattailGeo, plantMat, tailList.length);
  tailList.forEach((r, i) => cattails.setMatrixAt(i, r.m));
  [reeds, cattails].forEach((m) => {
    m.frustumCulled = false;
    m.receiveShadow = true;
    scene.add(m);
  });

  // ── Lily pads + flowers ──
  const padGeo = new THREE.CircleGeometry(0.5, 20, 0.35, Math.PI * 2 - 0.55).rotateX(-Math.PI / 2);
  const padMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.5, side: THREE.DoubleSide });
  const PADS = 22;
  const pads = new THREE.InstancedMesh(padGeo, padMat, PADS);
  const padData: { x: number; z: number; rot: number; s: number; ph: number }[] = [];
  const padClusters = [[0.9, 0.62], [2.6, 0.55], [4.6, 0.68]];
  for (let i = 0; i < PADS; i++) {
    const [ca, cf] = padClusters[i % padClusters.length];
    const p = at(ca + (rand() - 0.5) * 0.6, cf + (rand() - 0.5) * 0.3);
    padData.push({ x: p.x, z: p.z, rot: rand() * Math.PI * 2, s: 0.6 + rand() * 0.7, ph: rand() * 10 });
    pads.setColorAt(i, new THREE.Color().setHSL(0.27 + rand() * 0.05, 0.45, 0.22 + rand() * 0.08));
  }
  pads.receiveShadow = true;
  pads.frustumCulled = false;
  scene.add(pads);
  const petal = new THREE.SphereGeometry(0.1, 8, 6).scale(0.55, 0.45, 1.25).translate(0, 0.05, 0.09);
  const petals: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 7; i++) petals.push(tinted(petal.clone().rotateX(-0.5).rotateY((i / 7) * Math.PI * 2), new THREE.Color(0xf4b6cf)));
  petals.push(tinted(new THREE.SphereGeometry(0.05, 8, 6).translate(0, 0.08, 0), new THREE.Color(0xffd34d)));
  const flowerGeo = mergeGeometries(petals)!;
  const flowerIdx = [1, 5, 9, 14, 19];
  const flowers = new THREE.InstancedMesh(
    flowerGeo,
    new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.5, emissive: 0x552233, emissiveIntensity: 0.25 }),
    flowerIdx.length,
  );
  flowers.frustumCulled = false;
  scene.add(flowers);

  // ── Rocks around the bank (the big ones are solid) ──
  const rockGeos = [rockGeometry(3), rockGeometry(8), rockGeometry(21)];
  const rockMat = new THREE.MeshStandardMaterial({ color: 0x6f6a60, roughness: 0.95, flatShading: true, envMapIntensity: 0.5 });
  const rockPlan: { a: number; f: number; s: number }[] = [];
  for (let i = 0; i < 22; i++) rockPlan.push({ a: rand() * Math.PI * 2, f: 0.98 + rand() * 0.16, s: 0.3 + Math.pow(rand(), 2) * 1.0 });
  rockPlan.push({ a: 3.0, f: 0.45, s: 0.75 }, { a: 3.25, f: 0.36, s: 0.45 }); // stepping stones in the water
  rockGeos.forEach((geo, gi) => {
    const mine = rockPlan.filter((_, i) => i % rockGeos.length === gi);
    const im = new THREE.InstancedMesh(geo, rockMat, mine.length);
    mine.forEach((r, i) => {
      const p = at(r.a, r.f);
      dummy.position.set(p.x, -r.s * 0.28, p.z);
      dummy.rotation.set(0, rand() * Math.PI * 2, (rand() - 0.5) * 0.3);
      dummy.scale.set(r.s * (0.9 + rand() * 0.5), r.s, r.s * (0.9 + rand() * 0.4));
      dummy.updateMatrix();
      im.setMatrixAt(i, dummy.matrix);
      const mossy = rand() < 0.35;
      im.setColorAt(i, new THREE.Color().setHSL(mossy ? 0.24 : 0.09, mossy ? 0.3 : 0.1, 0.55 + rand() * 0.2));
      if (r.s > 0.7) {
        const b = new CANNON.Body({ type: CANNON.Body.STATIC, shape: new CANNON.Sphere(r.s * 0.8), material: physics.mats.prop });
        b.position.set(p.x, -r.s * 0.25, p.z);
        physics.world.addBody(b);
        BODY_KIND.set(b, 'stone');
      }
    });
    im.castShadow = true;
    im.receiveShadow = true;
    scene.add(im);
  });

  // ── Koi that leap out of the water now and then ──
  const fishBody = tinted(new THREE.SphereGeometry(0.16, 12, 8).scale(0.75, 0.6, 1.9), new THREE.Color(0xff7a2a));
  const fishPatch = tinted(new THREE.SphereGeometry(0.1, 8, 6).scale(0.8, 0.7, 1.4).translate(0, 0.045, 0.06), new THREE.Color(0xfff4e8));
  const fishTail = tinted(new THREE.ConeGeometry(0.12, 0.24, 4).rotateX(-Math.PI / 2).scale(0.25, 1, 1).translate(0, 0, -0.38), new THREE.Color(0xff9a50));
  const fishGeo = mergeGeometries([fishBody, fishPatch, fishTail])!;
  const fishMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.35 });
  const koi = Array.from({ length: 3 }, () => {
    const m = new THREE.Mesh(fishGeo, fishMat);
    m.visible = false;
    m.castShadow = true;
    scene.add(m);
    return { m, t: -1, wait: 2 + rand() * 6, from: new THREE.Vector3(), dir: new THREE.Vector3(), len: 1.6, h: 0.7 };
  });

  // ── Spray particles ──
  const SPRAY = 320;
  const sprayGeo = new THREE.BufferGeometry();
  const sprayPos = new Float32Array(SPRAY * 3);
  const sprayA = new Float32Array(SPRAY);
  const sprayS = new Float32Array(SPRAY);
  sprayGeo.setAttribute('position', new THREE.BufferAttribute(sprayPos, 3));
  sprayGeo.setAttribute('aAlpha', new THREE.BufferAttribute(sprayA, 1));
  sprayGeo.setAttribute('aSize', new THREE.BufferAttribute(sprayS, 1));
  const sprayMat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    uniforms: { uScale: { value: 1 } },
    vertexShader: /* glsl */ `
      attribute float aAlpha; attribute float aSize;
      uniform float uScale;
      varying float vA;
      void main() {
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * mv;
        float dist = max(-mv.z, 0.01);
        vA = aAlpha * smoothstep(0.6, 2.5, dist);
        gl_PointSize = min(aSize * uScale / dist, 90.0 * uScale);
      }`,
    fragmentShader: /* glsl */ `
      varying float vA;
      void main() {
        float d = length(gl_PointCoord - 0.5);
        gl_FragColor = vec4(vec3(0.86, 0.93, 0.96), smoothstep(0.5, 0.1, d) * vA);
      }`,
  });
  const spray = new THREE.Points(sprayGeo, sprayMat);
  spray.frustumCulled = false;
  scene.add(spray);
  const drops = Array.from({ length: SPRAY }, () => ({ p: new THREE.Vector3(), v: new THREE.Vector3(), life: 0, max: 1, size: 1 }));
  let cursor = 0;
  const splash = (x: number, z: number, count: number, power: number, vx = 0, vz = 0) => {
    for (let i = 0; i < count; i++) {
      const d = drops[cursor];
      cursor = (cursor + 1) % SPRAY;
      const a = Math.random() * Math.PI * 2;
      const r = Math.random() * 0.6;
      d.p.set(x + Math.cos(a) * r, WATER_Y + 0.05, z + Math.sin(a) * r);
      const out = (0.6 + Math.random() * 1.6) * power;
      d.v.set(Math.cos(a) * out + vx, (2.2 + Math.random() * 3.2) * power, Math.sin(a) * out + vz);
      d.max = d.life = 0.6 + Math.random() * 0.7;
      d.size = 40 + Math.random() * 70;
    }
  };

  /** Notified so the game can play a sound: (x, z, strength 0..1). */
  let onSplash: ((x: number, z: number, strength: number) => void) | null = null;

  const outline: [number, number][] = [];
  for (let i = 0; i < 64; i++) {
    const p = at((i / 64) * Math.PI * 2, 1);
    outline.push([p.x, p.z]);
  }

  /** How deep the water is at a point: 0 outside / at the shore, 1 in the middle. */
  const depthAt = (x: number, z: number) => THREE.MathUtils.clamp((1 - pondEdge(x, z)) / 0.55, 0, 1);

  let wakeAcc = 0;
  let sprayAcc = 0;
  let wasIn = false;
  const tmp = new THREE.Vector3();

  return {
    outline,
    depthAt,
    ripple,
    splash,
    setPixelRatio(pr: number) {
      sprayMat.uniforms.uScale.value = pr;
    },
    set onSplash(fn: ((x: number, z: number, strength: number) => void) | null) {
      onSplash = fn;
    },
    /**
     * Animate the pond and react to the car. Returns how far the car is into the water (0..1).
     */
    update(time: number, dt: number, car: { x: number; z: number; speed: number; airborne: boolean; fx: number; fz: number }) {
      uTime.value = time;

      // Lily pads bob gently and rock in passing ripples.
      pads.instanceMatrix.needsUpdate = true;
      padData.forEach((p, i) => {
        dummy.position.set(p.x, WATER_Y + 0.012 + Math.sin(time * 1.1 + p.ph) * 0.008, p.z);
        dummy.rotation.set(Math.sin(time * 0.9 + p.ph) * 0.03, p.rot + Math.sin(time * 0.2 + p.ph) * 0.1, 0);
        dummy.scale.setScalar(p.s);
        dummy.updateMatrix();
        pads.setMatrixAt(i, dummy.matrix);
        const fi = flowerIdx.indexOf(i);
        if (fi >= 0) {
          dummy.position.y += 0.01;
          dummy.scale.setScalar(0.8 + p.s * 0.3);
          dummy.updateMatrix();
          flowers.setMatrixAt(fi, dummy.matrix);
        }
      });
      flowers.instanceMatrix.needsUpdate = true;

      // Koi
      koi.forEach((k) => {
        if (k.t < 0) {
          k.wait -= dt;
          if (k.wait > 0) return;
          const a = Math.random() * Math.PI * 2;
          const start = at(a, 0.15 + Math.random() * 0.4);
          const d = new THREE.Vector3(POND.x - start.x, 0, POND.z - start.z).normalize();
          d.applyAxisAngle(new THREE.Vector3(0, 1, 0), (Math.random() - 0.5) * 1.6);
          k.from.copy(start);
          k.dir.copy(d);
          k.len = 1.3 + Math.random() * 1.2;
          k.h = 0.5 + Math.random() * 0.5;
          k.t = 0;
          k.m.visible = true;
          ripple(start.x, start.z, 0.8);
          splash(start.x, start.z, 10, 0.5);
          onSplash?.(start.x, start.z, 0.25);
        }
        k.t += dt / 0.95;
        const t = Math.min(k.t, 1);
        const y = WATER_Y - 0.25 + (k.h + 0.5) * 4 * t * (1 - t);
        k.m.position.copy(k.from).addScaledVector(k.dir, k.len * t);
        k.m.position.y = y;
        const dy = (k.h + 0.5) * 4 * (1 - 2 * t);
        tmp.copy(k.m.position).addScaledVector(k.dir, k.len * 0.1);
        tmp.y += dy * 0.1;
        k.m.lookAt(tmp);
        k.m.rotateZ(Math.sin(time * 18) * 0.25);
        if (k.t >= 1) {
          k.t = -1;
          k.wait = 4 + Math.random() * 8;
          k.m.visible = false;
          ripple(k.m.position.x, k.m.position.z, 1);
          splash(k.m.position.x, k.m.position.z, 16, 0.6);
          onSplash?.(k.m.position.x, k.m.position.z, 0.3);
        }
      });

      // The car in the water
      const depth = depthAt(car.x, car.z);
      const inWater = pondEdge(car.x, car.z) < 1 && !car.airborne;
      const v = Math.abs(car.speed);
      if (inWater && !wasIn && v > 2) {
        // Driving in (or landing in) the pond: a big splash.
        const k = Math.min(1, v / 20);
        splash(car.x, car.z, 40 + Math.floor(k * 60), 0.8 + k * 1.2, car.fx * v * 0.2, car.fz * v * 0.2);
        ripple(car.x, car.z, 1.6);
        onSplash?.(car.x, car.z, 0.5 + k * 0.5);
      }
      wasIn = inWater;
      if (inWater && v > 0.6) {
        wakeAcc += dt;
        if (wakeAcc > 0.22) {
          wakeAcc = 0;
          ripple(car.x - car.fx * 1.6, car.z - car.fz * 1.6, Math.min(1.4, 0.4 + v / 12));
        }
        sprayAcc += dt * v * 3.5;
        const rx = -car.fz;
        const rz = car.fx;
        while (sprayAcc > 1) {
          sprayAcc -= 1;
          const side = Math.random() < 0.5 ? -1 : 1;
          const wx = car.x + rx * side * 0.95 + car.fx * (Math.random() < 0.5 ? 1.5 : -1.5);
          const wz = car.z + rz * side * 0.95 + car.fz * (Math.random() < 0.5 ? 1.5 : -1.5);
          splash(wx, wz, 1, 0.35 + v / 30, rx * side * 1.5, rz * side * 1.5);
        }
      }

      // Spray simulation
      drops.forEach((d, i) => {
        if (d.life > 0) {
          d.life -= dt;
          d.v.y -= 9.8 * dt;
          d.v.multiplyScalar(1 - 0.8 * dt);
          d.p.addScaledVector(d.v, dt);
          if (d.p.y < WATER_Y) d.life = 0;
          const t = 1 - d.life / d.max;
          sprayA[i] = d.life > 0 ? (1 - t) * 0.75 : 0;
          sprayS[i] = d.size * (0.6 + t * 0.6);
          sprayPos.set([d.p.x, d.p.y, d.p.z], i * 3);
        } else sprayA[i] = 0;
      });
      sprayGeo.attributes.position.needsUpdate = true;
      sprayGeo.attributes.aAlpha.needsUpdate = true;
      sprayGeo.attributes.aSize.needsUpdate = true;

      return inWater ? depth : 0;
    },
  };
}
export type Pond = ReturnType<typeof createPond>;
