import { asset } from '@/lib/basePath';
// Dancers that come alive whenever the radio plays a song. One skinned character with one clip
// (Mixamo: "Northern Soul Spin Combo"), cloned to every spot in DANCER_SPOTS. The model loads in the
// background after the world is up, so it never delays the intro.
import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { DANCER_SPOTS } from './layout';
import { BODY_KIND, canvasTexture, type Physics } from './props';

const MODEL_URL = asset('/models/dancer.glb');
/** Height of the character in world units (metres). */
const HEIGHT = 1.74;
/** Seconds to blend between standing and dancing. */
const BLEND = 0.7;
const GLOW_COLORS = ['#ff8fb1', '#ffcf7a', '#8fd6ff', '#b9a3ff', '#8ff0c0', '#ffa07a'];

interface Dancer {
  root: THREE.Group;
  mixer: THREE.AnimationMixer;
  dance: THREE.AnimationAction;
  pose: THREE.AnimationAction;
  glow: THREE.Mesh;
  glowMat: THREE.MeshBasicMaterial;
  beam: THREE.Mesh;
  beamMat: THREE.MeshBasicMaterial;
}

/** Keep the hips' vertical bounce but pin them horizontally, so the dance stays on its spot. */
function pinRootMotion(clip: THREE.AnimationClip) {
  for (const track of clip.tracks) {
    if (!/hips\.position$/i.test(track.name)) continue;
    const v = track.values;
    for (let i = 3; i < v.length; i += 3) {
      v[i] = v[0];
      v[i + 2] = v[2];
    }
  }
}

/**
 * The exported character is split into dozens of tiny skinned meshes that share one set of vertex buffers.
 * Every one of them is a draw call and (after cloning) its own skeleton to update each frame, ×6 dancers.
 * Joining the parts that use the same material into one mesh gives identical pixels for a fraction of the cost.
 */
function mergeSkinnedParts(root: THREE.Object3D) {
  const byMaterial = new Map<THREE.Material, THREE.SkinnedMesh[]>();
  root.traverse((o) => {
    const m = o as THREE.SkinnedMesh;
    if (!m.isSkinnedMesh || Array.isArray(m.material) || !m.geometry.index) return;
    const list = byMaterial.get(m.material);
    if (list) list.push(m);
    else byMaterial.set(m.material, [m]);
  });
  byMaterial.forEach((meshes) => {
    if (meshes.length < 2) return;
    const first = meshes[0];
    const pos = first.geometry.attributes.position;
    const sameBuffers = meshes.every((m) => m.geometry.attributes.position === pos && m.parent === first.parent);
    if (!sameBuffers) return;
    let total = 0;
    meshes.forEach((m) => (total += m.geometry.index!.count));
    const merged = new Uint32Array(total);
    let at = 0;
    meshes.forEach((m) => {
      merged.set(m.geometry.index!.array as ArrayLike<number>, at);
      at += m.geometry.index!.count;
    });
    const geo = new THREE.BufferGeometry();
    for (const name of Object.keys(first.geometry.attributes)) geo.setAttribute(name, first.geometry.attributes[name]);
    geo.setIndex(new THREE.BufferAttribute(merged, 1));
    const sm = new THREE.SkinnedMesh(geo, first.material as THREE.Material);
    sm.name = first.name;
    sm.position.copy(first.position);
    sm.quaternion.copy(first.quaternion);
    sm.scale.copy(first.scale);
    first.parent!.add(sm);
    sm.bind(first.skeleton, first.bindMatrix);
    meshes.forEach((m) => m.removeFromParent());
  });
}

/** Vertical fade for the spotlight beam: bright at the top, gone at the ground. */
function beamTexture() {
  return canvasTexture(8, 128, (ctx) => {
    const g = ctx.createLinearGradient(0, 0, 0, 128);
    g.addColorStop(0, 'rgba(255,255,255,0.0)');
    g.addColorStop(0.12, 'rgba(255,255,255,0.55)');
    g.addColorStop(1, 'rgba(255,255,255,0.0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 8, 128);
  });
}

function glowTexture() {
  return canvasTexture(128, 128, (ctx) => {
    const g = ctx.createRadialGradient(64, 64, 4, 64, 64, 64);
    g.addColorStop(0, 'rgba(255,255,255,0.9)');
    g.addColorStop(0.45, 'rgba(255,255,255,0.35)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 128, 128);
  });
}

export function createDancers(scene: THREE.Scene, physics: Physics) {
  const dancers: Dancer[] = [];
  let weight = 0; // 0 = standing, 1 = dancing (eased)
  let lowDetail = false;
  let animAcc = 0;
  let disposed = false;

  // Colliders go in straight away so the car can't drive through a spot while the model loads.
  DANCER_SPOTS.forEach((d) => {
    const b = new CANNON.Body({ type: CANNON.Body.STATIC, material: physics.mats.prop, shape: new CANNON.Cylinder(0.38, 0.38, 1.8, 10) });
    b.position.set(d.x, 0.9, d.z);
    physics.world.addBody(b);
    BODY_KIND.set(b, 'foliage');
  });

  const glowTex = glowTexture();
  const beamTex = beamTexture();
  const beamGeo = new THREE.CylinderGeometry(0.25, 1.35, 5.2, 24, 1, true);
  /** Dancer materials (shared by all clones): a faint self-glow after dark so they read at night. */
  const bodyMats = new Set<THREE.MeshStandardMaterial>();

  new GLTFLoader().load(MODEL_URL, (gltf) => {
    if (disposed) return;
    const source = gltf.scene;
    const clip = gltf.animations[0];
    if (!clip) return;
    pinRootMotion(clip);
    // A still, first-frame pose to stand in while the radio is quiet.
    const poseClip = THREE.AnimationUtils.subclip(clip, 'pose', 0, 1, 30);

    source.updateMatrixWorld(true);
    mergeSkinnedParts(source);
    source.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(source);
    const scale = HEIGHT / Math.max(0.01, box.max.y - box.min.y);
    source.traverse((o) => {
      const m = o as THREE.SkinnedMesh;
      if (!m.isMesh) return;
      m.castShadow = true;
      m.receiveShadow = true;
      m.frustumCulled = false; // the bind-pose bounds don't cover the spins
      const mats = Array.isArray(m.material) ? m.material : [m.material];
      mats.forEach((mat) => {
        const sm = mat as THREE.MeshStandardMaterial;
        sm.envMapIntensity = 0.9;
        if (sm.map) {
          sm.emissiveMap = sm.map;
          sm.emissive = new THREE.Color(0xffffff);
          sm.emissiveIntensity = 0;
        }
        bodyMats.add(sm);
      });
    });

    DANCER_SPOTS.forEach((spot, i) => {
      const body = cloneSkinned(source) as THREE.Group;
      body.scale.setScalar(scale);
      body.position.y = -box.min.y * scale;
      const root = new THREE.Group();
      root.add(body);
      root.position.set(spot.x, 0, spot.z);
      root.rotation.y = Math.atan2(spot.look[0] - spot.x, spot.look[1] - spot.z);
      scene.add(root);

      const mixer = new THREE.AnimationMixer(body);
      const dance = mixer.clipAction(clip);
      const pose = mixer.clipAction(poseClip);
      dance.play();
      pose.play();
      // Everyone starts at a different point of the routine, at a slightly different tempo.
      dance.time = (i * 1.37) % clip.duration;
      dance.timeScale = 0.94 + ((i * 7) % 5) * 0.03;
      dance.setEffectiveWeight(weight);
      pose.setEffectiveWeight(1 - weight);

      const glowMat = new THREE.MeshBasicMaterial({
        map: glowTex,
        color: new THREE.Color(GLOW_COLORS[i % GLOW_COLORS.length]).multiplyScalar(1.4),
        transparent: true,
        opacity: 0,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      });
      const glow = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 3.4), glowMat);
      glow.rotation.x = -Math.PI / 2;
      glow.position.set(spot.x, 0.06, spot.z);
      glow.renderOrder = 2;
      scene.add(glow);

      // A soft stage spotlight beam from above while they dance.
      const beamMat = new THREE.MeshBasicMaterial({
        map: beamTex,
        color: new THREE.Color(GLOW_COLORS[i % GLOW_COLORS.length]),
        transparent: true,
        opacity: 0,
        depthWrite: false,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
      });
      const beam = new THREE.Mesh(beamGeo, beamMat);
      beam.position.set(spot.x, 2.6, spot.z);
      beam.renderOrder = 3;
      scene.add(beam);

      dancers.push({ root, mixer, dance, pose, glow, glowMat, beam, beamMat });
    });
  });

  return {
    /** `music` is true while the radio is playing a song. */
    /** Low-end mode: animate skeletons at ~20 Hz instead of every frame. */
    setLowDetail(v: boolean) {
      lowDetail = v;
    },
    update(dt: number, elapsed: number, music: boolean, night = 0, focus?: THREE.Vector3) {
      if (!dancers.length) return;
      animAcc += dt;
      const animate = !lowDetail || animAcc >= 1 / 20;
      const animDt = animAcc;
      if (animate) animAcc = 0;
      const target = music ? 1 : 0;
      weight += Math.sign(target - weight) * Math.min(Math.abs(target - weight), dt / BLEND);
      const w = weight * weight * (3 - 2 * weight);
      dancers.forEach((d, i) => {
        d.dance.setEffectiveWeight(w);
        d.pose.setEffectiveWeight(1 - w);
        // Freeze the routine (rather than tick it invisibly) while standing still.
        const near = !focus || d.root.position.distanceToSquared(focus) < 150 * 150;
        d.root.visible = near; // the skinned meshes are never frustum-culled, so skip far ones by hand
        if (animate && near) d.mixer.update(weight > 0 ? animDt : 0);
        d.glowMat.opacity = w * (0.5 + Math.sin(elapsed * 4.2 + i * 1.3) * 0.18);
        d.glow.visible = w > 0.01 && near;
        d.glow.scale.setScalar(1 + night * 0.5);
        d.beamMat.opacity = w * (0.12 + night * 0.28) * (0.85 + Math.sin(elapsed * 2.7 + i) * 0.15);
        d.beam.visible = w > 0.01 && near;
      });
      const selfLight = night * (0.12 + w * 0.25);
      bodyMats.forEach((m) => (m.emissiveIntensity = selfLight));
    },
    dispose() {
      disposed = true;
    },
  };
}
