import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { normalize, prepModel } from './assets';
import type { Physics } from './props';
import { SPAWN } from './layout';
import type { Surface } from '@/lib/audio';

export const CAR = {
  maxSpeed: 24, // m/s ≈ 86 km/h
  boostSpeed: 34, // ≈ 122 km/h
  reverseSpeed: -7,
  accel: 10,
  boostAccel: 17,
  brake: 24,
  coastDrag: 3,
  turnRate: 1.45,
  maxSteer: 0.55,
};

const LENGTH = 5.4;
const WHEEL_RADIUS = 0.39;

/** Wheel nodes in the Vairogs GLB (names are sanitised by GLTFLoader: dots removed). */
const WHEELS: { re: RegExp; front: boolean }[] = [
  { re: /^Cylinder563/, front: true }, // front right
  { re: /^Cylinder565/, front: true }, // front left
  { re: /^Cylinder564|^Cylinder568/, front: false }, // rear left (+ brake drum)
  { re: /^Cylinder566/, front: false }, // rear right
];

function toPhysical(std: THREE.MeshStandardMaterial) {
  const phys = new THREE.MeshPhysicalMaterial();
  THREE.MeshStandardMaterial.prototype.copy.call(phys, std);
  phys.defines = { STANDARD: '', PHYSICAL: '' };
  return phys;
}

export function createCar(scene: THREE.Scene, physics: Physics, model: THREE.Group) {
  prepModel(model, { cast: true, receive: true, envIntensity: 1.1 });

  // Materials: lacquered paint, simple glass (no costly transmission pass), lamps we can light.
  const headlightMats: THREE.MeshStandardMaterial[] = [];
  const tailMats: THREE.MeshStandardMaterial[] = [];
  const headlightMeshes: THREE.Mesh[] = [];
  model.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    const m = mesh.material as THREE.MeshStandardMaterial;
    const name = m.name || '';
    if (name === 'blue_paint') {
      const p = toPhysical(m);
      // Satin lacquer: glossy enough to read as paint, rough enough that the sun
      // doesn't become a blinding hotspot on the roof.
      p.clearcoat = 0.12;
      p.clearcoatRoughness = 0.55;
      p.metalness = Math.min(p.metalness, 0.2);
      p.roughness = 0.55;
      p.envMapIntensity = 0.7;
      mesh.material = p;
    } else if (name === 'Glass') {
      // Slightly rough, tinted glass: a mirror-smooth surface turns the sun into a blinding,
      // bloomed hotspot across the roof.
      mesh.material = new THREE.MeshPhysicalMaterial({
        color: 0x56656d, roughness: 0.26, metalness: 0, specularIntensity: 0.45, transparent: true, opacity: 0.45, envMapIntensity: 0.9, depthWrite: false,
      });
      mesh.castShadow = false;
    } else if (name === 'headlight_glass') {
      const lamp = new THREE.MeshStandardMaterial({ color: 0xfff4dc, emissive: 0xffe2a8, emissiveIntensity: 0, roughness: 0.1 });
      mesh.material = lamp;
      headlightMats.push(lamp);
      headlightMeshes.push(mesh);
    } else if (name.startsWith('tail_light')) {
      const tail = m.clone();
      tail.emissive = new THREE.Color(0xff1608);
      tail.emissiveIntensity = 0;
      mesh.material = tail;
      tailMats.push(tail);
    } else if (name.startsWith('mirror') || name === 'aloominum' || name === 'Metallic') {
      m.metalness = 1;
      m.roughness = 0.22; // brushed chrome — no pin-point sun glints
    }
  });

  const inner = normalize(model, LENGTH, 'z');
  // The model's grille faces +Z; our forward is -Z.
  inner.rotation.y = Math.PI;

  // Re-parent each wheel under a pivot at its hub so it can spin and steer.
  inner.updateMatrixWorld(true);
  const wheels: { pivot: THREE.Group; front: boolean }[] = [];
  WHEELS.forEach(({ re, front }) => {
    const nodes: THREE.Object3D[] = [];
    model.traverse((o) => {
      if (re.test(o.name) && !(o as THREE.Mesh).isMesh) nodes.push(o);
    });
    if (!nodes.length) return;
    const box = new THREE.Box3();
    nodes.forEach((n) => box.expandByObject(n));
    const centre = inner.worldToLocal(box.getCenter(new THREE.Vector3()));
    const pivot = new THREE.Group();
    pivot.position.copy(centre);
    pivot.rotation.order = 'YXZ';
    inner.add(pivot);
    pivot.updateMatrixWorld(true);
    nodes.forEach((n) => pivot.attach(n));
    wheels.push({ pivot, front });
  });

  // body (roll/pitch) sits inside root (position/heading)
  const body = new THREE.Group();
  body.add(inner);
  const root = new THREE.Group();
  root.add(body);
  scene.add(root);

  // Headlight beams from the actual lamp positions.
  root.updateMatrixWorld(true);
  const lampBox = new THREE.Box3();
  headlightMeshes.forEach((m) => lampBox.expandByObject(m));
  const lampC = lampBox.isEmpty() ? new THREE.Vector3(0, 0.95, -2.4) : root.worldToLocal(lampBox.getCenter(new THREE.Vector3()));
  const lampHalf = lampBox.isEmpty() ? 0.6 : lampBox.getSize(new THREE.Vector3()).x * 0.42;
  const beams = [-1, 1].map((side) => {
    const s = new THREE.SpotLight(0xffe7c2, 0, 42, 0.5, 0.6, 1.2);
    s.position.set(lampC.x + side * lampHalf, lampC.y, lampC.z - 0.1);
    s.target.position.set(side * 1.5, 0, lampC.z - 16);
    body.add(s, s.target);
    return s;
  });

  // Physics: four wheel spheres glide over ramp lips; a box is the bodywork.
  const phys = new CANNON.Body({ mass: 900, material: physics.mats.bike, linearDamping: 0.01, allowSleep: false });
  [-1, 1].forEach((sz) => {
    [-1, 1].forEach((sx) => phys.addShape(new CANNON.Sphere(0.4), new CANNON.Vec3(sx * 0.7, 0.4, sz * 1.55)));
  });
  phys.addShape(new CANNON.Box(new CANNON.Vec3(1.0, 0.42, 2.62)), new CANNON.Vec3(0, 0.92, 0));
  phys.addShape(new CANNON.Box(new CANNON.Vec3(0.85, 0.35, 1.3)), new CANNON.Vec3(0, 1.62, 0.3));
  phys.angularFactor.set(0, 0, 0);
  phys.position.set(SPAWN.x, 0.6, SPAWN.z);
  physics.world.addBody(phys);
  // Remember when the car touches something that can move (crates, drums, pins, letters):
  // for a moment it keeps the speed it really has after the hit instead of forcing its old
  // speed back, so momentum is shared and it can't plough through objects like a ghost.
  let pushT = 0;
  phys.addEventListener('collide', (e: { body: CANNON.Body }) => {
    if (e.body.type === CANNON.Body.DYNAMIC) pushT = 0.2;
  });

  // Dust / grass bits kicked up by the rear tyres
  const DUST = 220;
  const dustGeo = new THREE.BufferGeometry();
  const dustPos = new Float32Array(DUST * 3);
  const dustAlpha = new Float32Array(DUST);
  const dustSize = new Float32Array(DUST);
  const dustCol = new Float32Array(DUST * 3);
  dustGeo.setAttribute('position', new THREE.BufferAttribute(dustPos, 3));
  dustGeo.setAttribute('aAlpha', new THREE.BufferAttribute(dustAlpha, 1));
  dustGeo.setAttribute('aSize', new THREE.BufferAttribute(dustSize, 1));
  dustGeo.setAttribute('aColor', new THREE.BufferAttribute(dustCol, 3));
  const dustMat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    uniforms: { uScale: { value: 1 } },
    vertexShader: /* glsl */ `
      attribute float aAlpha; attribute float aSize; attribute vec3 aColor;
      varying float vAlpha; varying vec3 vColor;
      uniform float uScale;
      void main() {
        vColor = aColor;
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * mv;
        float dist = max(-mv.z, 0.01);
        // A puff drifting right into the lens must never fill the screen.
        vAlpha = aAlpha * smoothstep(1.0, 3.5, dist);
        gl_PointSize = min(aSize * uScale / dist, 160.0 * uScale);
      }`,
    fragmentShader: /* glsl */ `
      varying float vAlpha; varying vec3 vColor;
      void main() {
        float d = length(gl_PointCoord - 0.5);
        gl_FragColor = vec4(vColor, smoothstep(0.5, 0.0, d) * vAlpha);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const dust = new THREE.Points(dustGeo, dustMat);
  dust.frustumCulled = false;
  scene.add(dust);
  const particles = Array.from({ length: DUST }, () => ({ p: new THREE.Vector3(0, -50, 0), v: new THREE.Vector3(), life: 0, max: 1, size: 1 }));
  const DIRT = new THREE.Color(0xb39a78);
  const GRASS = new THREE.Color(0x6f7f45);
  let spawnAcc = 0;

  const state = { speed: 0, heading: SPAWN.heading, steer: 0, roll: 0, pitch: 0, airborne: false, accel: 0, wheelSpin: 0 };
  const forward = new THREE.Vector3();
  const right = new THREE.Vector3();
  let lastSpeed = 0;
  let nightBoost = 0;

  function reset() {
    phys.position.set(SPAWN.x, 0.8, SPAWN.z);
    phys.velocity.set(0, 0, 0);
    state.speed = 0;
    state.heading = SPAWN.heading;
  }

  /**
   * `liftCap` limits how fast the car may rise (m/s). Because the car's horizontal speed is
   * imposed every frame, a knocked-over letter or crate under a wheel would otherwise act
   * like a ramp and fling the car into the air; outside real ramps and jumps it may only
   * bump over obstacles.
   */
  function drive(dt: number, input: { throttle: number; steer: number; boost: boolean; brake: boolean }, engineOn: boolean, liftCap = Infinity) {
    if (phys.velocity.y > liftCap) phys.velocity.y = liftCap;
    const s = state;
    const max = input.boost ? CAR.boostSpeed : CAR.maxSpeed;
    if (!engineOn) {
      s.speed -= Math.sign(s.speed) * Math.min(Math.abs(s.speed), CAR.coastDrag * 2 * dt);
    } else if (input.brake) {
      s.speed -= Math.sign(s.speed) * Math.min(Math.abs(s.speed), CAR.brake * dt);
    } else if (input.throttle > 0) {
      const a = input.boost ? CAR.boostAccel : CAR.accel;
      s.speed += a * (1 - Math.max(0, s.speed) / max) * 1.6 * dt;
      if (s.speed > max) s.speed -= (s.speed - max) * Math.min(1, 2 * dt);
    } else if (input.throttle < 0) {
      if (s.speed > 0.5) s.speed -= CAR.brake * 0.8 * dt;
      else s.speed = Math.max(CAR.reverseSpeed, s.speed - 6 * dt);
    } else {
      s.speed -= Math.sign(s.speed) * Math.min(Math.abs(s.speed), CAR.coastDrag * dt);
    }

    s.steer = THREE.MathUtils.damp(s.steer, input.steer, 8, dt);
    const v = Math.abs(s.speed);
    // Cars need to roll to turn, and turn more gently at speed.
    const grip = THREE.MathUtils.clamp(v / 4, 0, 1) * (1 - THREE.MathUtils.clamp((v - 12) / 40, 0, 0.5));
    if (!s.airborne) s.heading += s.steer * CAR.turnRate * grip * Math.sign(s.speed || 1) * dt;

    forward.set(-Math.sin(s.heading), 0, -Math.cos(s.heading));
    right.set(Math.cos(s.heading), 0, -Math.sin(s.heading));
    phys.velocity.x = forward.x * s.speed;
    phys.velocity.z = forward.z * s.speed;
    phys.quaternion.setFromAxisAngle(new CANNON.Vec3(0, 1, 0), s.heading);
  }

  /** After the physics step: reconcile speed with what really happened, then pose the mesh. */
  function sync(dt: number, braking: boolean, engineOn: boolean, surface: Surface) {
    const s = state;
    const actual = phys.velocity.x * forward.x + phys.velocity.z * forward.z;
    let impact = 0;
    pushT = Math.max(0, pushT - dt);
    if (Math.abs(actual) < Math.abs(s.speed) - (pushT > 0 ? 0.25 : 1.5)) {
      impact = Math.abs(s.speed) - Math.abs(actual);
      s.speed = actual;
    }
    s.airborne = phys.position.y > 0.3 && Math.abs(phys.velocity.y) > 0.8;
    if (phys.position.y < -4) reset();

    // Smooth the height so tiny physics contact jitter never shows as vibration.
    const smoothY = s.airborne ? phys.position.y : THREE.MathUtils.damp(root.position.y, phys.position.y, 18, dt);
    root.position.set(phys.position.x, smoothY, phys.position.z);
    root.rotation.y = s.heading;

    const v = Math.abs(s.speed);
    s.accel = THREE.MathUtils.damp(s.accel, (s.speed - lastSpeed) / Math.max(dt, 1e-3), 2.5, dt);
    lastSpeed = s.speed;
    // Body roll leans out of the turn; pitch squats on acceleration and dives under braking.
    const targetRoll = -s.steer * THREE.MathUtils.clamp(v / 20, 0, 1) * 0.07;
    const slope = Math.atan2(phys.velocity.y, Math.max(2, v));
    const targetPitch = s.airborne ? slope * 0.7 : THREE.MathUtils.clamp(s.accel * 0.004, -0.05, 0.035);
    s.roll = THREE.MathUtils.damp(s.roll, targetRoll, 6, dt);
    s.pitch = THREE.MathUtils.damp(s.pitch, targetPitch, 4, dt);
    body.rotation.set(s.pitch, 0, s.roll, 'YXZ');

    // Wheels: spin with distance travelled, front wheels steer.
    s.wheelSpin += (s.speed * dt) / WHEEL_RADIUS;
    wheels.forEach((w) => {
      w.pivot.rotation.x = s.wheelSpin;
      if (w.front) w.pivot.rotation.y = s.steer * CAR.maxSteer;
    });

    const lit = engineOn ? 5.5 : 0;
    headlightMats.forEach((m) => (m.emissiveIntensity = lit));
    beams.forEach((b) => (b.intensity = engineOn ? 45 + nightBoost * 55 : 0));
    tailMats.forEach((m) => (m.emissiveIntensity = braking ? 6 : engineOn ? 1.2 : 0));

    // Dust (dirt) or flicked-up grass bits behind the rear wheels
    const kick = !s.airborne && v > 3 && surface !== 'wood' && surface !== 'water' ? (v / CAR.maxSpeed) * (1 + Math.abs(s.steer) * 1.5) * (surface === 'dirt' ? 1 : 0.35) : 0;
    spawnAcc += kick * 90 * dt;
    const col = surface === 'dirt' ? DIRT : GRASS;
    while (spawnAcc > 1) {
      spawnAcc -= 1;
      const i = particles.findIndex((q) => q.life <= 0);
      if (i < 0) break;
      const p = particles[i];
      const side = Math.random() < 0.5 ? -0.75 : 0.75;
      p.p.set(
        root.position.x - forward.x * 1.6 + right.x * side,
        0.12,
        root.position.z - forward.z * 1.6 + right.z * side,
      );
      p.v.set(
        -forward.x * v * 0.12 + (Math.random() - 0.5) * 1.8 - right.x * s.steer * 2,
        0.5 + Math.random() * 1.3,
        -forward.z * v * 0.12 + (Math.random() - 0.5) * 1.8 - right.z * s.steer * 2,
      );
      p.max = p.life = surface === 'dirt' ? 1 + Math.random() * 1.1 : 0.5 + Math.random() * 0.4;
      p.size = surface === 'dirt' ? 1.6 + Math.random() * 1.6 : 0.5 + Math.random() * 0.5;
      dustCol.set([col.r, col.g, col.b], i * 3);
    }
    particles.forEach((p, i) => {
      if (p.life > 0) {
        p.life -= dt;
        p.v.multiplyScalar(1 - 1.8 * dt);
        p.v.y -= 1.5 * dt;
        p.p.addScaledVector(p.v, dt);
        const t = 1 - p.life / p.max;
        dustAlpha[i] = Math.sin(t * Math.PI) * 0.34;
        dustSize[i] = p.size * (1 + t * 2.5) * 220;
        dustPos.set([p.p.x, Math.max(0.05, p.p.y), p.p.z], i * 3);
      } else {
        dustAlpha[i] = 0;
      }
    });
    dustGeo.attributes.position.needsUpdate = true;
    dustGeo.attributes.aAlpha.needsUpdate = true;
    dustGeo.attributes.aSize.needsUpdate = true;
    dustGeo.attributes.aColor.needsUpdate = true;
    return impact;
  }

  /** Visual only: lower the body into water (metres). */
  const setSink = (y: number) => {
    body.position.y = -y;
  };
  /** Night driving: brighter, longer beams (0 day .. 1 night). */
  const setNight = (k: number) => {
    beams.forEach((b) => (b.distance = 42 + k * 28));
    nightBoost = k;
  };

  return { root, phys, state, forward, drive, sync, reset, setSink, setNight, setPixelRatio: (pr: number) => (dustMat.uniforms.uScale.value = pr) };
}
export type Car = ReturnType<typeof createCar>;
