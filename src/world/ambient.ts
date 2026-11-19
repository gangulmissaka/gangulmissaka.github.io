// Ambient life: drifting pollen motes, fireflies, wind streaks and butterflies that scatter
// when the car comes close. Motes, fireflies and streaks are fully GPU-animated.
import * as THREE from 'three';
import { CLEAR_ZONES, LANDMARKS, PLAY_HALF } from './layout';
import { mulberry32 } from './terrain';

const WIND = new THREE.Vector2(0.92, 0.39); // same direction as the grass gusts

function dotTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const ctx = c.getContext('2d')!;
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.25, 'rgba(255,255,255,0.65)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

export function createAmbient(scene: THREE.Scene, roadDistance: (x: number, z: number) => number) {
  const rand = mulberry32(2024);
  const dot = dotTexture();
  const uTime = { value: 0 };
  const uScale = { value: 1 };
  const uCenter = { value: new THREE.Vector3() };
  const uNight = { value: 0 };

  // ── 1. Pollen / dust motes: wrap-around box that follows the camera focus ──
  const MOTES = 900;
  const BOX = new THREE.Vector3(70, 9, 70);
  const moteSeed = new Float32Array(MOTES * 4);
  for (let i = 0; i < MOTES; i++) moteSeed.set([rand(), rand(), rand(), rand()], i * 4);
  const moteGeo = new THREE.BufferGeometry();
  moteGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(MOTES * 3), 3));
  moteGeo.setAttribute('aSeed', new THREE.BufferAttribute(moteSeed, 4));
  const moteMat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: { uTime, uScale, uCenter, uBox: { value: BOX }, uMap: { value: dot }, uWind: { value: WIND } },
    vertexShader: /* glsl */ `
      attribute vec4 aSeed;
      uniform float uTime; uniform float uScale; uniform vec3 uCenter; uniform vec3 uBox; uniform vec2 uWind;
      varying float vAlpha;
      void main() {
        float sp = 0.35 + aSeed.w * 0.9;
        vec3 p = aSeed.xyz * uBox;
        p.xz += uWind * uTime * sp;
        p.x += sin(uTime * 0.6 + aSeed.w * 40.0) * 1.2;
        p.z += cos(uTime * 0.5 + aSeed.x * 40.0) * 1.2;
        p.y += sin(uTime * 0.8 + aSeed.z * 30.0) * 0.6 + uTime * 0.08 * sp;
        // wrap inside a box centred on the focus point
        vec3 origin = uCenter - vec3(uBox.x, 0.0, uBox.z) * 0.5;
        p.xz = mod(p.xz - origin.xz, uBox.xz) + origin.xz;
        p.y = mod(p.y, uBox.y) + 0.25;
        vec2 e = abs(p.xz - uCenter.xz) / (uBox.xz * 0.5);
        float edge = 1.0 - smoothstep(0.7, 1.0, max(e.x, e.y));
        float twinkle = 0.55 + 0.45 * sin(uTime * (1.5 + aSeed.y * 3.0) + aSeed.x * 50.0);
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mv;
        float dist = max(-mv.z, 0.01);
        vAlpha = edge * twinkle * smoothstep(uBox.y, uBox.y * 0.6, p.y) * smoothstep(0.8, 2.5, dist);
        gl_PointSize = min((2.2 + aSeed.w * 3.2) * uScale * 12.0 / dist, 40.0 * uScale);
      }`,
    fragmentShader: /* glsl */ `
      uniform sampler2D uMap; varying float vAlpha;
      void main() {
        float a = texture2D(uMap, gl_PointCoord).a * vAlpha;
        gl_FragColor = vec4(vec3(1.0, 0.93, 0.74) * 0.95, a * 0.85);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const motes = new THREE.Points(moteGeo, moteMat);
  motes.frustumCulled = false;
  scene.add(motes);

  // ── 2. Fireflies around the pond and along the forest edge ──
  const pond = LANDMARKS.find((l) => l.key === 'pond')!;
  const anchors: number[] = [];
  for (let i = 0; i < 70; i++) {
    const a = rand() * Math.PI * 2;
    const r = 9 + rand() * 12;
    anchors.push(pond.x + Math.cos(a) * r, 0.5 + rand() * 2.2, pond.z + Math.sin(a) * r, rand());
  }
  for (let i = 0; i < 170; i++) {
    const side = Math.floor(rand() * 4);
    const along = (rand() * 2 - 1) * (PLAY_HALF - 4);
    const depth = PLAY_HALF - 7 + rand() * 9;
    const x = side < 2 ? along : side === 2 ? -depth : depth;
    const z = side < 2 ? (side === 0 ? -depth : depth) : along;
    anchors.push(x, 0.6 + rand() * 3, z, rand());
  }
  const FF = anchors.length / 4;
  const ffGeo = new THREE.BufferGeometry();
  ffGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(FF * 3), 3));
  ffGeo.setAttribute('aAnchor', new THREE.BufferAttribute(new Float32Array(anchors), 4));
  const ffMat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: { uTime, uScale, uNight, uMap: { value: dot } },
    vertexShader: /* glsl */ `
      attribute vec4 aAnchor;
      uniform float uTime; uniform float uScale;
      varying float vGlow;
      void main() {
        float s = aAnchor.w * 100.0;
        vec3 p = aAnchor.xyz + vec3(
          sin(uTime * 0.37 + s) * 1.6 + sin(uTime * 0.9 + s * 1.7) * 0.4,
          sin(uTime * 0.6 + s * 2.3) * 0.45,
          cos(uTime * 0.31 + s * 1.3) * 1.6);
        float blink = pow(max(0.0, sin(uTime * (0.8 + aAnchor.w * 1.4) + s)), 5.0);
        vGlow = 0.12 + blink;
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mv;
        gl_PointSize = min((5.0 + blink * 9.0) * uScale * 10.0 / max(-mv.z, 0.01), 60.0 * uScale);
      }`,
    fragmentShader: /* glsl */ `
      uniform sampler2D uMap; uniform float uNight; varying float vGlow;
      void main() {
        float a = texture2D(uMap, gl_PointCoord).a;
        float g = vGlow * (1.0 + uNight * 1.6);
        gl_FragColor = vec4(vec3(0.85, 1.0, 0.45) * (0.6 + g), a * min(1.0, g));
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const fireflies = new THREE.Points(ffGeo, ffMat);
  fireflies.frustumCulled = false;
  scene.add(fireflies);

  // ── 3. Wind streaks: thin curling strokes that sweep across with the gusts ──
  const SEG = 24;
  const STREAKS = 18;
  const base = new THREE.InstancedBufferGeometry();
  const sPos: number[] = [];
  for (let i = 0; i <= SEG; i++) {
    const u = i / SEG;
    sPos.push(u, -1, 0, u, 1, 0);
  }
  const sIdx: number[] = [];
  for (let i = 0; i < SEG; i++) {
    const a = i * 2;
    sIdx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
  }
  base.setAttribute('position', new THREE.Float32BufferAttribute(sPos, 3));
  base.setIndex(sIdx);
  const sSeed = new Float32Array(STREAKS * 4);
  for (let i = 0; i < STREAKS; i++) sSeed.set([rand(), rand(), rand(), rand()], i * 4);
  base.setAttribute('aSeed', new THREE.InstancedBufferAttribute(sSeed, 4));
  base.instanceCount = STREAKS;
  const streakMat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    uniforms: { uTime, uCenter, uWind: { value: WIND } },
    vertexShader: /* glsl */ `
      attribute vec4 aSeed;
      uniform float uTime; uniform vec3 uCenter; uniform vec2 uWind;
      varying float vU; varying float vLife;
      float h1(float n) { return fract(sin(n) * 43758.5453); }
      void main() {
        float period = 3.2 + aSeed.x * 2.5;
        float cyc = uTime / period + aSeed.y * 7.0;
        float id = floor(cyc);
        float life = fract(cyc);
        float u = position.x;
        // a fresh random start each cycle, upwind of the focus point
        vec2 perp = vec2(-uWind.y, uWind.x);
        vec2 start = uCenter.xz - uWind * 24.0 + perp * (h1(id * 12.9 + aSeed.z * 91.0) - 0.5) * 50.0
                   + uWind * (h1(id * 4.1 + aSeed.w * 33.0)) * 20.0;
        float travel = life * 26.0;
        float along = u * 7.0 + travel;
        float curl = sin(u * 6.2832 * (0.8 + aSeed.w) + life * 5.0 + aSeed.z * 10.0) * 0.45;
        // occasional little loop at the head of the stroke
        float loopAmt = smoothstep(0.55, 1.0, u) * step(0.5, aSeed.w);
        vec2 xz = start + uWind * along + perp * curl + perp * sin(u * 18.0) * 0.6 * loopAmt;
        float y = 0.8 + aSeed.x * 3.5 + sin(u * 4.0 + life * 3.0) * 0.35 + cos(u * 18.0) * 0.6 * loopAmt;
        vec3 p = vec3(xz.x, y, xz.y);
        p.y += position.y * 0.025;
        vU = u; vLife = life;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      varying float vU; varying float vLife;
      void main() {
        // the visible part of the stroke slides along its path
        float head = vLife * 1.4;
        float tail = head - 0.45;
        float a = smoothstep(tail, tail + 0.25, vU) * (1.0 - smoothstep(head - 0.05, head, vU));
        a *= sin(vLife * 3.14159);
        gl_FragColor = vec4(vec3(1.0), a * 0.32);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const streaks = new THREE.Mesh(base, streakMat);
  streaks.frustumCulled = false;
  scene.add(streaks);

  // ── 4. Butterflies ──
  const wingTex = (hue: string, edge: string) => {
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const ctx = c.getContext('2d')!;
    ctx.fillStyle = edge;
    ctx.beginPath();
    ctx.ellipse(64, 50, 58, 44, -0.3, 0, Math.PI * 2);
    ctx.ellipse(52, 98, 36, 26, 0.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = hue;
    ctx.beginPath();
    ctx.ellipse(62, 50, 46, 33, -0.3, 0, Math.PI * 2);
    ctx.ellipse(52, 97, 26, 18, 0.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    [[86, 36, 6], [96, 56, 4], [40, 96, 4]].forEach(([x, y, r]) => {
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    });
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  };
  const palettes: [string, string][] = [
    ['#f2a33a', '#3a1d08'], ['#f6f1e4', '#4a4a4a'], ['#6fa8ff', '#10204a'], ['#ffd84a', '#3a2a06'], ['#e4685a', '#2a0c08'],
  ];
  const wingMats = palettes.map(([h, e]) => new THREE.MeshStandardMaterial({
    map: wingTex(h, e), alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.6, emissive: new THREE.Color(h), emissiveIntensity: 0.25,
  }));
  const wingGeo = new THREE.PlaneGeometry(0.34, 0.34);
  wingGeo.rotateX(-Math.PI / 2);
  wingGeo.translate(0.17, 0, 0); // hinge on the body
  const blocked = (x: number, z: number) =>
    roadDistance(x, z) < 1 || CLEAR_ZONES.some(([cx, cz, r]) => (x - cx) ** 2 + (z - cz) ** 2 < r * r);
  const butterflies = Array.from({ length: 22 }, (_, i) => {
    let hx = 0;
    let hz = 0;
    do {
      hx = (rand() * 2 - 1) * (PLAY_HALF - 10);
      hz = (rand() * 2 - 1) * (PLAY_HALF - 10);
    } while (blocked(hx, hz));
    const g = new THREE.Group();
    const mat = wingMats[i % wingMats.length];
    const left = new THREE.Mesh(wingGeo, mat);
    const right = new THREE.Mesh(wingGeo, mat);
    right.scale.x = -1;
    const lPivot = new THREE.Group();
    const rPivot = new THREE.Group();
    lPivot.add(left);
    rPivot.add(right);
    g.add(lPivot, rPivot);
    g.scale.setScalar(0.8 + rand() * 0.6);
    scene.add(g);
    return {
      g, lPivot, rPivot, home: new THREE.Vector3(hx, 0, hz), phase: rand() * 100,
      flee: new THREE.Vector3(), fleeAmt: 0, pos: new THREE.Vector3(hx, 1, hz), prev: new THREE.Vector3(hx, 1, hz),
    };
  });

  const tmp = new THREE.Vector3();
  return {
    setPixelRatio(pr: number) {
      uScale.value = pr;
    },
    update(time: number, dt: number, focus: THREE.Vector3, car: THREE.Vector3) {
      uTime.value = time;
      uCenter.value.copy(focus);
      butterflies.forEach((b) => {
        const t = time * 0.55 + b.phase;
        // lazy figure-eight around home, bobbing up and down
        tmp.set(
          b.home.x + Math.sin(t) * 3.2 + Math.sin(t * 2.3) * 0.8,
          0.7 + Math.sin(t * 1.7) * 0.35 + Math.max(0, Math.sin(t * 0.4)) * 0.8,
          b.home.z + Math.sin(t * 2) * 1.8,
        );
        // scatter away from the car, then drift back
        const d = Math.hypot(b.pos.x - car.x, b.pos.z - car.z);
        if (d < 6) {
          b.flee.set(b.pos.x - car.x, 0, b.pos.z - car.z).normalize().multiplyScalar(7);
          b.fleeAmt = Math.min(1, b.fleeAmt + dt * 3);
        } else b.fleeAmt = Math.max(0, b.fleeAmt - dt * 0.25);
        tmp.addScaledVector(b.flee, b.fleeAmt);
        tmp.y += b.fleeAmt * 3.2;
        b.prev.copy(b.pos);
        b.pos.lerp(tmp, 1 - Math.exp(-(2 + b.fleeAmt * 6) * dt));
        b.g.position.copy(b.pos);
        const vx = b.pos.x - b.prev.x;
        const vz = b.pos.z - b.prev.z;
        if (vx * vx + vz * vz > 1e-6) b.g.rotation.y = Math.atan2(vx, vz) + Math.PI / 2;
        const flap = Math.sin(time * (16 + b.fleeAmt * 14) + b.phase) * (0.9 + b.fleeAmt * 0.3);
        b.lPivot.rotation.z = 0.25 + flap;
        b.rPivot.rotation.z = -0.25 - flap;
      });
    },
    /** 0 day .. 1 night: fireflies glow brighter in the dark. */
    setNight(k: number) {
      uNight.value = k;
    },
    setVisible(v: boolean) {
      motes.visible = v;
      streaks.visible = v;
    },
  };
}
