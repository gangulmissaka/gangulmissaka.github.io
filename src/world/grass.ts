// Interactive grass field (Bruno-Simon style): ~100k GPU-instanced blades in a patch that
// follows the camera focus. Blades are anchored to a world-space lattice so they never
// "swim", sway with travelling wind gusts, bend away from the car, and get flattened
// into tyre tracks that slowly recover. A mask keeps grass off roads, decals and props.
import * as THREE from 'three';
import {
  ABOUT_SPOT, CLEAR_ZONES, CONTACT_SPOT, CONTROLS_DECAL, PLAY_HALF, POND, POSTS_SPOT, PROJECT_SPOTS,
  SKILL_SHOWCASES, SUBTITLE_DECAL, pondRadiusAt,
} from './layout';
import type { RoadPath } from './terrain';

const WORLD_HALF = 92; // mask / trail textures cover [-92, 92]²
const RADIUS = 36; // patch radius (m)
const SPACING = 0.2; // blade spacing (m)

const POND_ZONE = CLEAR_ZONES.findIndex(([x, z]) => x === POND.x && z === POND.z);

function buildMask(roads: RoadPath[]) {
  const S = 1024;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const ctx = c.getContext('2d')!;
  const px = (v: number) => ((v + WORLD_HALF) / (2 * WORLD_HALF)) * S;
  const m = S / (2 * WORLD_HALF); // pixels per metre
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, S, S);
  ctx.fillStyle = '#fff';
  const e = PLAY_HALF + 2.5;
  ctx.fillRect(px(-e), px(-e), (2 * e) * m, (2 * e) * m);

  ctx.filter = 'blur(2px)';
  ctx.strokeStyle = '#000';
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  // Roads: bare in the middle, the shoulders keep a ragged fringe.
  roads.forEach((r) => {
    ctx.lineWidth = Math.max(1, (r.width - 1.1) * m);
    ctx.beginPath();
    r.points.forEach((p, i) => (i ? ctx.lineTo(px(p.x), px(p.z)) : ctx.moveTo(px(p.x), px(p.z))));
    if (r.closed) ctx.closePath();
    ctx.stroke();
  });
  ctx.fillStyle = '#000';
  const circle = (x: number, z: number, r: number) => {
    ctx.beginPath();
    ctx.arc(px(x), px(z), r * m, 0, Math.PI * 2);
    ctx.fill();
  };
  const rect = (x: number, z: number, w: number, h: number) => ctx.fillRect(px(x - w / 2), px(z - h / 2), w * m, h * m);
  // The pond: grass grows right up to the water's edge.
  ctx.beginPath();
  for (let i = 0; i <= 96; i++) {
    const a = (i / 96) * Math.PI * 2;
    const r = pondRadiusAt(a) + 0.2;
    const x = px(POND.x + Math.cos(a) * r);
    const y = px(POND.z + Math.sin(a) * r);
    if (i) ctx.lineTo(x, y);
    else ctx.moveTo(x, y);
  }
  ctx.fill();
  CLEAR_ZONES.forEach(([x, z, r], i) => i !== POND_ZONE && circle(x, z, r * 0.9));
  PROJECT_SPOTS.forEach((p) => circle(p.x, p.z, 4.8));
  SKILL_SHOWCASES.forEach((s) => circle(s.ring[0], s.ring[1], 3.4));
  circle(ABOUT_SPOT.ringX, ABOUT_SPOT.ringZ, 3.6);
  circle(POSTS_SPOT.ringX, POSTS_SPOT.ringZ, 3.4);
  rect(SUBTITLE_DECAL.x, SUBTITLE_DECAL.z, SUBTITLE_DECAL.w + 1, SUBTITLE_DECAL.h + 1);
  rect(CONTROLS_DECAL.x, CONTROLS_DECAL.z, CONTROLS_DECAL.w + 1, CONTROLS_DECAL.h + 1);
  rect(CONTACT_SPOT.x + 1, CONTACT_SPOT.z - 6, 22, 4);
  ctx.filter = 'none';

  const tex = new THREE.CanvasTexture(c);
  tex.flipY = false;
  tex.colorSpace = THREE.NoColorSpace;
  return tex;
}

function bladeGeometry() {
  // 4 rows (3 quads) + a tip: x = side (-1..1, tapering), y = t (0..1)
  const rows = [0, 0.38, 0.72];
  const pos: number[] = [];
  rows.forEach((t) => {
    const w = 1 - t * 0.75;
    pos.push(-w, t, 0, w, t, 0);
  });
  pos.push(0, 1, 0);
  const idx: number[] = [];
  for (let r = 0; r < rows.length - 1; r++) {
    const a = r * 2;
    idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
  }
  const last = (rows.length - 1) * 2;
  idx.push(last, last + 1, last + 2);
  const g = new THREE.InstancedBufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(new Array(pos.length).fill(0).map((_, i) => (i % 3 === 1 ? 1 : 0)), 3));
  g.setIndex(idx);
  return g;
}

export function createGrassField(scene: THREE.Scene, roads: RoadPath[], noise: THREE.Texture) {
  const geo = bladeGeometry();
  // Patch lattice, shuffled so that a lower instanceCount thins it out evenly.
  const n = Math.floor((RADIUS * 2) / SPACING);
  const cells: [number, number][] = [];
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      const x = (i - n / 2) * SPACING;
      const z = (j - n / 2) * SPACING;
      if (x * x + z * z < RADIUS * RADIUS) cells.push([x, z]);
    }
  }
  for (let i = cells.length - 1; i > 0; i--) {
    const k = Math.floor(Math.random() * (i + 1));
    [cells[i], cells[k]] = [cells[k], cells[i]];
  }
  const cellArr = new Float32Array(cells.length * 2);
  cells.forEach(([x, z], i) => cellArr.set([x, z], i * 2));
  geo.setAttribute('aCell', new THREE.InstancedBufferAttribute(cellArr, 2));
  geo.instanceCount = cells.length;

  // Trail texture: where the tyres have pressed the grass down (decays over a few seconds).
  const TS = 512;
  const trailCanvas = document.createElement('canvas');
  trailCanvas.width = trailCanvas.height = TS;
  const tctx = trailCanvas.getContext('2d')!;
  tctx.fillStyle = '#000';
  tctx.fillRect(0, 0, TS, TS);
  const trailTex = new THREE.CanvasTexture(trailCanvas);
  trailTex.flipY = false;
  trailTex.colorSpace = THREE.NoColorSpace;
  const tpx = (v: number) => ((v + WORLD_HALF) / (2 * WORLD_HALF)) * TS;

  const uniforms = {
    uTime: { value: 0 },
    uCenter: { value: new THREE.Vector2() },
    uCar: { value: new THREE.Vector3(0, 0, 0) },
    uMask: { value: buildMask(roads) },
    uTrail: { value: trailTex },
    uNoise: { value: noise },
  };

  const mat = new THREE.MeshStandardMaterial({ roughness: 0.82, metalness: 0, side: THREE.DoubleSide });
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        /* glsl */ `#include <common>
        attribute vec2 aCell;
        uniform float uTime;
        uniform vec2 uCenter;
        uniform vec3 uCar;
        uniform sampler2D uMask;
        uniform sampler2D uTrail;
        uniform sampler2D uNoise;
        varying float vT;
        varying float vShade;
        varying float vFlower;
        varying float vTrail;
        varying float vDry;
        vec4 hash4(vec2 p) {
          vec4 p4 = fract(vec4(p.xyxy) * vec4(0.1031, 0.1030, 0.0973, 0.1099));
          p4 += dot(p4, p4.wzxy + 33.33);
          return fract((p4.xxyz + p4.yzzw) * p4.zywx);
        }`,
      )
      .replace(
        '#include <beginnormal_vertex>',
        /* glsl */ `
        vec2 gCenter = floor(uCenter / ${SPACING.toFixed(3)} + 0.5) * ${SPACING.toFixed(3)};
        vec2 wp = gCenter + aCell;
        vec4 rnd = hash4(floor(wp * ${(1 / SPACING).toFixed(4)} + 0.5));
        wp += (rnd.xy - 0.5) * ${(SPACING * 0.95).toFixed(3)};
        float bAng = rnd.x * 6.2831853;
        vec2 bDir = vec2(cos(bAng), sin(bAng));
        vec3 objectNormal = normalize(vec3(bDir.x * 0.3, 1.0, bDir.y * 0.3));`,
      )
      .replace(
        '#include <begin_vertex>',
        /* glsl */ `
        vec2 muv = wp / ${(2 * WORLD_HALF).toFixed(1)} + 0.5;
        float mask = texture2D(uMask, muv).r;
        float dist = length(wp - uCenter) / ${RADIUS.toFixed(1)};
        float fade = 1.0 - smoothstep(0.45, 1.0, dist);
        fade *= fade * (3.0 - 2.0 * fade);
        float field = texture2D(uNoise, wp * 0.03).r;
        float height = mix(0.16, 0.55, rnd.z) * mix(0.5, 1.3, field) * mask * fade;
        float width = mix(0.03, 0.05, rnd.w) * mix(0.75, 1.0, field);
        float t = position.y;
        vec2 side = vec2(-bDir.y, bDir.x);

        // Wind: a steady sway plus gusts travelling across the field.
        float gust = texture2D(uNoise, wp * 0.014 - vec2(uTime * 0.045, uTime * 0.02)).g;
        float sway = sin(uTime * 1.9 + wp.x * 0.33 + wp.y * 0.21 + rnd.y * 2.0) * 0.18;
        vec2 bend = vec2(0.92, 0.39) * (sway + 0.12 + smoothstep(0.35, 0.85, gust) * 0.9);

        // The car pushes blades away from it.
        vec2 toB = wp - uCar.xy;
        float dc = length(toB);
        float push = 1.0 - smoothstep(1.2, 3.4, dc);
        bend += (toB / max(dc, 0.001)) * push * 1.8;

        // Tyre tracks flatten the grass, which springs back as the trail fades.
        float trail = texture2D(uTrail, muv).r;
        // (8-bit canvas fading never quite reaches 0, so ignore the faint residue)
        float flat_ = clamp((trail - 0.08) * 1.5, 0.0, 0.9);
        bend += bDir * flat_ * 1.6;

        float bl = min(length(bend), 1.6);
        bend = bl > 0.0 ? normalize(bend) * bl : bend;
        float k = t * t;
        vec3 transformed = vec3(0.0);
        transformed.xz = wp + side * position.x * width + bend * k * height;
        transformed.y = t * height * (1.0 - 0.38 * bl * k) * (1.0 - flat_ * 0.75);

        vT = t;
        vShade = rnd.z;
        vFlower = step(0.982, rnd.y) * step(0.12, mask * fade);
        vTrail = flat_;
        vDry = 0.6 * smoothstep(0.6, 0.9, texture2D(uNoise, wp * 0.006 + 0.3).r);`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        '#include <common>\nvarying float vT;\nvarying float vShade;\nvarying float vFlower;\nvarying float vTrail;\nvarying float vDry;',
      )
      .replace(
        '#include <color_fragment>',
        /* glsl */ `
        vec3 gBase = vec3(0.07, 0.12, 0.035);
        vec3 gTip = mix(vec3(0.30, 0.42, 0.10), vec3(0.50, 0.46, 0.18), vDry);
        vec3 gCol = mix(gBase, gTip, smoothstep(0.0, 1.0, vT)) * mix(0.78, 1.18, vShade);
        // Wildflowers: a few blades end in a bright bloom.
        if (vFlower > 0.5 && vT > 0.72) {
          vec3 bloom = vShade < 0.33 ? vec3(0.95, 0.93, 0.85) : vShade < 0.66 ? vec3(0.98, 0.78, 0.18) : vec3(0.62, 0.45, 0.92);
          gCol = bloom * 0.9;
        }
        gCol *= 1.0 - vTrail * 0.3;
        diffuseColor.rgb = gCol;`,
      );
  };

  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  mesh.receiveShadow = true;
  mesh.castShadow = false;
  scene.add(mesh);

  const full = cells.length;
  let decayAcc = 0;
  let uploadAcc = 0;
  let last: { lx: number; lz: number; rx: number; rz: number } | null = null;

  return {
    /** Fraction (0..1) of the blades to draw; cells are shuffled so any prefix is evenly spread. */
    setDensity(f: number) {
      geo.instanceCount = Math.max(1, Math.floor(full * f));
    },
    /**
     * @param center  patch centre (camera focus)
     * @param car     car x/z, heading, speed, whether the tyres touch the ground
     */
    update(time: number, dt: number, center: THREE.Vector3, car: { x: number; z: number; heading: number; speed: number; grounded: boolean }) {
      uniforms.uTime.value = time;
      uniforms.uCenter.value.set(center.x, center.z);
      uniforms.uCar.value.set(car.x, car.z, car.speed);

      // Fade old tracks.
      decayAcc += dt;
      if (decayAcc > 0.1) {
        decayAcc = 0;
        tctx.fillStyle = 'rgba(0,0,0,0.035)';
        tctx.fillRect(0, 0, TS, TS);
      }
      // Stamp the left/right wheel tracks.
      const fx = -Math.sin(car.heading);
      const fz = -Math.cos(car.heading);
      const rx = -fz;
      const rz = fx;
      const lx = car.x - rx * 0.78;
      const lz = car.z - rz * 0.78;
      const rrx = car.x + rx * 0.78;
      const rrz = car.z + rz * 0.78;
      if (car.grounded && Math.abs(car.speed) > 0.4) {
        tctx.strokeStyle = 'rgba(255,255,255,0.9)';
        tctx.lineWidth = (0.5 / (2 * WORLD_HALF)) * TS * 2;
        tctx.lineCap = 'round';
        if (last) {
          tctx.beginPath();
          tctx.moveTo(tpx(last.lx), tpx(last.lz));
          tctx.lineTo(tpx(lx), tpx(lz));
          tctx.moveTo(tpx(last.rx), tpx(last.rz));
          tctx.lineTo(tpx(rrx), tpx(rrz));
          tctx.stroke();
        }
        last = { lx, lz, rx: rrx, rz: rrz };
      } else {
        last = null;
      }
      uploadAcc += dt;
      if (uploadAcc > 1 / 30) {
        uploadAcc = 0;
        trailTex.needsUpdate = true;
      }
    },
  };
}
