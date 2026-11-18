import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';

/** Late-afternoon sun: warm, low enough for long soft shadows. */
const SUN_ELEVATION = 24; // degrees above the horizon
const SUN_AZIMUTH = 215; // degrees, light comes from the south-west
export const FOG_COLOR = new THREE.Color(0xa9bcc6);

export function createRenderer(container: HTMLElement) {
  const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance', stencil: false });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
  renderer.setSize(container.clientWidth, container.clientHeight);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.08;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  container.appendChild(renderer.domElement);
  return renderer;
}

function createSky(sunDir: THREE.Vector3, sunBoost = 1) {
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: {
      uTop: { value: new THREE.Color(0x4a84bf) },
      uMid: { value: new THREE.Color(0x86a8c4) },
      uHorizon: { value: FOG_COLOR.clone() },
      uGround: { value: new THREE.Color(0x76805e) },
      uSunDir: { value: sunDir.clone() },
      uSunColor: { value: new THREE.Color(0xffd9a8) },
      uSunBoost: { value: sunBoost },
    },
    vertexShader: /* glsl */ `
      varying vec3 vDir;
      void main() {
        vDir = normalize((modelMatrix * vec4(position, 0.0)).xyz);
        vec4 p = projectionMatrix * viewMatrix * vec4((modelMatrix * vec4(position, 1.0)).xyz, 1.0);
        gl_Position = p.xyww; // always at the far plane
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uTop, uMid, uHorizon, uGround, uSunDir, uSunColor;
      uniform float uSunBoost;
      varying vec3 vDir;
      void main() {
        vec3 d = normalize(vDir);
        float h = d.y;
        vec3 col = mix(uHorizon, uMid, smoothstep(0.0, 0.18, h));
        col = mix(col, uTop, smoothstep(0.12, 0.75, h));
        col = mix(col, uGround, smoothstep(0.0, -0.25, h));
        float s = max(dot(d, normalize(uSunDir)), 0.0);
        col += uSunColor * (pow(s, 900.0) * 1.6 + pow(s, 16.0) * 0.22 + pow(s, 3.0) * 0.06) * uSunBoost;
        gl_FragColor = vec4(col, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(1000, 48, 24), mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = -1;
  return mesh;
}

export type TimeOfDay = 'day' | 'sunset' | 'night';
export const TIMES_OF_DAY: TimeOfDay[] = ['day', 'sunset', 'night'];

/** Everything that changes with the time of day. Night swaps the sun for a cool moon. */
interface SkyPreset {
  elev: number; // light elevation (deg)
  az: number; // light azimuth (deg)
  top: number; mid: number; horizon: number; ground: number;
  glow: number; // sun / moon disc + halo colour
  glowBoost: number;
  light: number; lightI: number;
  hemiSky: number; hemiGround: number; hemiI: number;
  fogDensity: number;
  envI: number;
  stars: number;
  /** 0 = lamps off, 1 = full night lighting */
  lamps: number;
}

const PRESETS: Record<TimeOfDay, SkyPreset> = {
  day: {
    elev: SUN_ELEVATION, az: SUN_AZIMUTH,
    top: 0x4a84bf, mid: 0x86a8c4, horizon: FOG_COLOR.getHex(), ground: 0x76805e,
    glow: 0xffd9a8, glowBoost: 1, light: 0xffe2bd, lightI: 3.1,
    hemiSky: 0xdfe8f2, hemiGround: 0x5a5236, hemiI: 0.7, fogDensity: 0.0039, envI: 0.85, stars: 0, lamps: 0,
  },
  sunset: {
    elev: 6.5, az: 252,
    top: 0x29406e, mid: 0x9a7a86, horizon: 0xe9a173, ground: 0x4c4434,
    glow: 0xffa155, glowBoost: 1.6, light: 0xffa868, lightI: 2.5,
    hemiSky: 0xf0b892, hemiGround: 0x3b3124, hemiI: 0.5, fogDensity: 0.0042, envI: 0.62, stars: 0.12, lamps: 0.45,
  },
  night: {
    elev: 38, az: 140,
    top: 0x03060f, mid: 0x0a1428, horizon: 0x1b2a42, ground: 0x07090a,
    glow: 0xc4d2ff, glowBoost: 0.9, light: 0x9db2e6, lightI: 0.95,
    hemiSky: 0x34476f, hemiGround: 0x101318, hemiI: 0.7, fogDensity: 0.0048, envI: 0.28, stars: 1, lamps: 1,
  },
};

function createStars() {
  const N = 1800;
  const pos = new Float32Array(N * 3);
  const seed = new Float32Array(N);
  let s = 12345;
  const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < N; i++) {
    const u = rnd();
    const y = 0.04 + Math.pow(u, 0.8) * 0.96;
    const a = rnd() * Math.PI * 2;
    const r = Math.sqrt(1 - y * y);
    pos.set([Math.cos(a) * r, y, Math.sin(a) * r], i * 3);
    seed[i] = rnd();
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
  const mat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    fog: false,
    blending: THREE.AdditiveBlending,
    uniforms: { uTime: { value: 0 }, uAlpha: { value: 0 } },
    vertexShader: /* glsl */ `
      attribute float aSeed;
      uniform float uTime;
      varying float vA;
      void main() {
        vec3 wp = position * 800.0 + cameraPosition;
        vec4 p = projectionMatrix * viewMatrix * vec4(wp, 1.0);
        gl_Position = p.xyww; // on the far plane, behind everything
        float tw = 0.65 + 0.35 * sin(uTime * (0.7 + aSeed * 2.4) + aSeed * 60.0);
        vA = tw * (0.35 + aSeed * 0.65) * smoothstep(0.03, 0.2, position.y);
        gl_PointSize = 1.2 + aSeed * aSeed * 2.6;
      }`,
    fragmentShader: /* glsl */ `
      uniform float uAlpha;
      varying float vA;
      void main() {
        float d = length(gl_PointCoord - 0.5);
        float a = smoothstep(0.5, 0.0, d) * vA * uAlpha;
        gl_FragColor = vec4(vec3(0.85, 0.9, 1.0) * a, a);
      }`,
  });
  const pts = new THREE.Points(geo, mat);
  pts.frustumCulled = false;
  pts.renderOrder = -0.5;
  return pts;
}

export function createEnvironment(scene: THREE.Scene, renderer: THREE.WebGLRenderer) {
  const sunDir = new THREE.Vector3().setFromSphericalCoords(
    1,
    THREE.MathUtils.degToRad(90 - SUN_ELEVATION),
    THREE.MathUtils.degToRad(SUN_AZIMUTH),
  );

  // Art-directed gradient sky: deep blue overhead, haze at the horizon that matches the fog,
  // and a soft sun glow. Kept below bloom threshold so it never washes the frame out.
  const sky = createSky(sunDir);
  scene.add(sky);
  const stars = createStars();
  scene.add(stars);
  const skyU = (sky.material as THREE.ShaderMaterial).uniforms;
  const starU = stars.material.uniforms;

  // Image-based lighting generated from each time of day's sky, so reflections match it.
  // No sun disc in the reflection map: direct sunlight already lights the scene, and a
  // reflected disc turns into blinding hotspots on glossy surfaces (e.g. the car roof).
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envMaps = {} as Record<TimeOfDay, THREE.Texture>;
  TIMES_OF_DAY.forEach((t) => {
    const p = PRESETS[t];
    const envScene = new THREE.Scene();
    const envSky = createSky(sunDir, 0);
    const u = (envSky.material as THREE.ShaderMaterial).uniforms;
    u.uTop.value.setHex(p.top);
    u.uMid.value.setHex(p.mid);
    u.uHorizon.value.setHex(p.horizon);
    u.uGround.value.setHex(p.ground);
    envSky.scale.setScalar(0.05); // inside the PMREM cube camera's far plane
    envScene.add(envSky);
    envMaps[t] = pmrem.fromScene(envScene, 0.02).texture;
  });
  pmrem.dispose();
  scene.environment = envMaps.day;
  scene.environmentIntensity = 0.85;

  const fog = new THREE.FogExp2(FOG_COLOR.clone(), 0.0039);
  scene.fog = fog;

  const hemi = new THREE.HemisphereLight(0xdfe8f2, 0x5a5236, 0.7);
  scene.add(hemi);

  // Sun. Its shadow camera follows the player so shadows stay crisp everywhere.
  const sun = new THREE.DirectionalLight(0xffe2bd, 3.1);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  const S = 46;
  sun.shadow.camera.left = -S;
  sun.shadow.camera.right = S;
  sun.shadow.camera.top = S;
  sun.shadow.camera.bottom = -S;
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = 260;
  sun.shadow.bias = -0.00025;
  sun.shadow.normalBias = 0.035;
  sun.shadow.radius = 3;
  scene.add(sun);
  scene.add(sun.target);

  const followSun = (focus: THREE.Vector3) => {
    // Snap to shadow-map texels to avoid shimmering while moving.
    const texel = (2 * S) / sun.shadow.mapSize.x;
    const fx = Math.round(focus.x / texel) * texel;
    const fz = Math.round(focus.z / texel) * texel;
    sun.target.position.set(fx, 0, fz);
    sun.position.set(fx + sunDir.x * 120, sunDir.y * 120, fz + sunDir.z * 120);
  };
  followSun(new THREE.Vector3());

  // ── Time of day: blend every value from where it is now to the chosen preset ──
  const cA = new THREE.Color();
  const cB = new THREE.Color();
  const COLOR_KEYS = ['top', 'mid', 'horizon', 'ground', 'glow', 'light', 'hemiSky', 'hemiGround'];
  const current: SkyPreset = { ...PRESETS.day };
  let from: SkyPreset = { ...PRESETS.day };
  let to: SkyPreset = PRESETS.day;
  let mode: TimeOfDay = 'day';
  let k = 1;
  const lerpHex = (a: number, b: number, t: number) => cA.setHex(a).lerp(cB.setHex(b), t).getHex();
  const apply = (p: SkyPreset) => {
    sunDir.setFromSphericalCoords(1, THREE.MathUtils.degToRad(90 - p.elev), THREE.MathUtils.degToRad(p.az));
    skyU.uSunDir.value.copy(sunDir);
    skyU.uTop.value.setHex(p.top);
    skyU.uMid.value.setHex(p.mid);
    skyU.uHorizon.value.setHex(p.horizon);
    skyU.uGround.value.setHex(p.ground);
    skyU.uSunColor.value.setHex(p.glow);
    skyU.uSunBoost.value = p.glowBoost;
    sun.color.setHex(p.light);
    sun.intensity = p.lightI;
    hemi.color.setHex(p.hemiSky);
    hemi.groundColor.setHex(p.hemiGround);
    hemi.intensity = p.hemiI;
    fog.color.setHex(p.horizon);
    fog.density = p.fogDensity;
    if (scene.background instanceof THREE.Color) scene.background.setHex(p.horizon);
    scene.environmentIntensity = p.envI;
    starU.uAlpha.value = p.stars;
    stars.visible = p.stars > 0.01;
  };

  return {
    sun,
    sky,
    sunDir,
    followSun,
    get timeOfDay() {
      return mode;
    },
    /** 0 by day, 1 at night: how much artificial light the world needs right now. */
    get lamps() {
      return current.lamps;
    },
    setTimeOfDay(t: TimeOfDay, instant = false) {
      mode = t;
      from = { ...current };
      to = PRESETS[t];
      k = instant ? 1 : 0;
      if (instant) {
        Object.assign(current, to);
        apply(current);
        scene.environment = envMaps[t];
      }
    },
    tick(dt: number, time: number) {
      starU.uTime.value = time;
      if (k >= 1) return;
      k = Math.min(1, k + dt / 2.6);
      const e = k * k * (3 - 2 * k);
      (Object.keys(current) as (keyof SkyPreset)[]).forEach((key) => {
        const a = from[key];
        const b = to[key];
        current[key] = COLOR_KEYS.includes(key) ? lerpHex(a, b, e) : a + (b - a) * e;
      });
      // Swap the reflection map half-way through the blend.
      if (e > 0.5) scene.environment = envMaps[mode];
      apply(current);
    },
  };
}

// Premium dark cinematic grade, applied after tone mapping: lower exposure, filmic
// contrast, slightly muted colour, teal shadows / amber highlights, a deep vignette
// and fine grain.
const FinishShader = {
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    uTime: { value: 0 },
    uExposure: { value: 0.84 },
    uContrast: { value: 1.14 },
    uSaturation: { value: 0.82 },
    uVignette: { value: 0.55 },
    uGrain: { value: 0.03 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uTime;
    uniform float uExposure;
    uniform float uContrast;
    uniform float uSaturation;
    uniform float uVignette;
    uniform float uGrain;
    varying vec2 vUv;
    float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
    void main() {
      vec3 c = texture2D(tDiffuse, vUv).rgb * uExposure;
      // filmic S-curve contrast around a lowered mid-point (deeper shadows)
      c = clamp((c - 0.42) * uContrast + 0.42, 0.0, 1.0);
      c = c * c * (3.0 - 2.0 * c) * 0.35 + c * 0.65;
      // muted colour
      float l = dot(c, vec3(0.299, 0.587, 0.114));
      c = mix(vec3(l), c, uSaturation);
      // split-tone: teal-blue shadows, warm amber highlights
      c *= mix(vec3(0.84, 0.95, 1.05), vec3(1.06, 0.99, 0.88), smoothstep(0.12, 0.8, l));
      // deep vignette pulling the frame toward a blue-black edge
      vec2 d = vUv - 0.5;
      float v = smoothstep(0.18, 0.95, dot(d, d) * 2.4);
      c = mix(c, c * vec3(0.12, 0.13, 0.16), uVignette * v);
      // rich (not crushed) blacks
      c = c * 0.975 + vec3(0.008, 0.010, 0.014);
      c += (hash(vUv * 1000.0 + uTime) - 0.5) * uGrain;
      gl_FragColor = vec4(c, 1.0);
    }
  `,
};

const SanitizeShader = {
  uniforms: { tDiffuse: { value: null as THREE.Texture | null } },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    varying vec2 vUv;
    void main() {
      vec4 c = texture2D(tDiffuse, vUv);
      // NaN fails every comparison and Inf fails the upper bound: both become black,
      // everything else is clamped to a sane HDR range before bloom.
      bool ok = c.r >= 0.0 && c.r < 6.0e4 && c.g >= 0.0 && c.g < 6.0e4 && c.b >= 0.0 && c.b < 6.0e4;
      vec3 rgb = ok ? min(c.rgb, vec3(64.0)) : vec3(0.0);
      gl_FragColor = vec4(rgb, 1.0);
    }
  `,
};

export function createComposer(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera) {
  const size = renderer.getSize(new THREE.Vector2());
  const rt = new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.HalfFloatType, samples: 4 });
  const composer = new EffectComposer(renderer, rt);
  composer.addPass(new RenderPass(scene, camera));
  // Guard: a single NaN / overflowed pixel would otherwise be smeared across the whole frame
  // by the bloom blur, flashing the screen black for a frame.
  composer.addPass(new ShaderPass(SanitizeShader));
  const bloom = new UnrealBloomPass(new THREE.Vector2(size.x, size.y), 0.3, 0.55, 1.15);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());
  const finish = new ShaderPass(FinishShader);
  composer.addPass(finish);
  composer.setSize(size.x, size.y);
  return {
    composer,
    /** Low quality drops bloom (the most expensive pass). */
    setQuality: (high: boolean) => {
      bloom.enabled = high;
    },
    setSize: (w: number, h: number) => {
      composer.setSize(w, h);
      bloom.setSize(w, h);
    },
    tick: (t: number) => {
      finish.uniforms.uTime.value = t % 100;
    },
  };
}
