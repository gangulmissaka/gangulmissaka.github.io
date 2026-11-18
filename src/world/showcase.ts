// Skill showcase: when the visitor presses E at a statue, the model is lit by a coloured
// spotlight, glowing motes rise around it, and one holographic orb per skill floats up
// and orbits it showing the skill's level.
import * as THREE from 'three';
import { canvasTexture } from './props';
import type { SkillGroup } from '@/data/portfolioData';

const FONT = 'Inter, "Helvetica Neue", Arial, sans-serif';

function orbTexture(name: string, level: number, color: string) {
  return canvasTexture(512, 512, (ctx) => {
    const c = 256;
    // soft halo
    const halo = ctx.createRadialGradient(c, c, 120, c, c, 250);
    halo.addColorStop(0, color + '55');
    halo.addColorStop(1, color + '00');
    ctx.fillStyle = halo;
    ctx.fillRect(0, 0, 512, 512);
    // glass disc
    ctx.fillStyle = 'rgba(12,13,15,0.78)';
    ctx.beginPath();
    ctx.arc(c, c, 168, 0, Math.PI * 2);
    ctx.fill();
    // progress ring
    ctx.lineCap = 'round';
    ctx.lineWidth = 18;
    ctx.strokeStyle = 'rgba(255,255,255,0.12)';
    ctx.beginPath();
    ctx.arc(c, c, 150, 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeStyle = color;
    ctx.shadowColor = color;
    ctx.shadowBlur = 24;
    ctx.beginPath();
    ctx.arc(c, c, 150, -Math.PI / 2, -Math.PI / 2 + (level / 100) * Math.PI * 2);
    ctx.stroke();
    ctx.shadowBlur = 0;
    // text
    ctx.textAlign = 'center';
    ctx.fillStyle = '#f5f2ec';
    ctx.font = `800 104px ${FONT}`;
    ctx.fillText(`${level}%`, c, c + 22);
    ctx.fillStyle = 'rgba(245,242,236,0.85)';
    let size = 38;
    ctx.font = `700 ${size}px ${FONT}`;
    while (ctx.measureText(name).width > 250 && size > 22) {
      size -= 2;
      ctx.font = `700 ${size}px ${FONT}`;
    }
    ctx.fillText(name, c, c + 82);
  });
}

export function createShowcase(scene: THREE.Scene) {
  const group = new THREE.Group();
  group.visible = false;
  scene.add(group);

  const spot = new THREE.SpotLight(0xffffff, 0, 40, 0.55, 0.6, 1.4);
  spot.castShadow = false;
  group.add(spot, spot.target);

  // Rising motes
  const MOTES = 140;
  const motePos = new Float32Array(MOTES * 3);
  const moteSeed = Array.from({ length: MOTES }, () => ({ a: Math.random() * Math.PI * 2, r: Math.random(), s: 0.4 + Math.random(), o: Math.random() }));
  const moteGeo = new THREE.BufferGeometry();
  moteGeo.setAttribute('position', new THREE.BufferAttribute(motePos, 3));
  const moteMat = new THREE.PointsMaterial({
    size: 0.22, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, color: 0xffffff, fog: false,
    map: canvasTexture(64, 64, (ctx) => {
      const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
      g.addColorStop(0, 'rgba(255,255,255,1)');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, 64, 64);
    }),
  });
  const motes = new THREE.Points(moteGeo, moteMat);
  motes.frustumCulled = false;
  group.add(motes);

  // Glowing base ring around the model
  const baseMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, fog: false });
  const base = new THREE.Mesh(new THREE.RingGeometry(0.96, 1, 96), baseMat);
  base.rotation.x = -Math.PI / 2;
  base.position.y = 0.1;
  group.add(base);

  let orbs: { sprite: THREE.Sprite; delay: number }[] = [];
  let center = new THREE.Vector3();
  let height = 4;
  let radius = 3;
  let t = 0; // time since enter
  let fade = 0; // 0..1 overall visibility
  let active = false;

  function clearOrbs() {
    orbs.forEach(({ sprite }) => {
      group.remove(sprite);
      sprite.material.map?.dispose();
      sprite.material.dispose();
    });
    orbs = [];
  }

  function enter(skills: SkillGroup, c: THREE.Vector3, h: number, r: number) {
    clearOrbs();
    center = c.clone();
    height = Math.max(1.4, h);
    radius = Math.max(1.6, r);
    const col = new THREE.Color(skills.color);
    spot.color.copy(col);
    moteMat.color.copy(col);
    baseMat.color.copy(col);
    spot.position.set(center.x, height + 9, center.z + 3);
    spot.target.position.copy(center).setY(height * 0.4);
    base.position.set(center.x, 0.1, center.z);
    base.scale.setScalar(radius + 1.4);
    skills.items.forEach((s, i) => {
      const sprite = new THREE.Sprite(
        new THREE.SpriteMaterial({ map: orbTexture(s.name, s.level, skills.color), transparent: true, depthWrite: false, fog: false, opacity: 0 }),
      );
      sprite.renderOrder = 5;
      group.add(sprite);
      orbs.push({ sprite, delay: 0.35 + i * 0.16 });
    });
    t = 0;
    active = true;
    group.visible = true;
  }

  function exit() {
    active = false;
  }

  function update(dt: number) {
    fade = THREE.MathUtils.damp(fade, active ? 1 : 0, active ? 3 : 6, dt);
    if (!active && fade < 0.01) {
      if (group.visible) {
        group.visible = false;
        clearOrbs();
      }
      return;
    }
    t += dt;
    spot.intensity = 260 * fade;
    moteMat.opacity = 0.9 * fade;
    baseMat.opacity = (0.55 + Math.sin(t * 3) * 0.15) * fade;

    // Motes spiral upward around the model
    const R = radius + 1.2;
    moteSeed.forEach((m, i) => {
      const life = (m.o + t * 0.18 * m.s) % 1;
      const a = m.a + t * 0.6 * m.s;
      const rr = R * (0.55 + m.r * 0.6);
      motePos[i * 3] = center.x + Math.cos(a) * rr;
      motePos[i * 3 + 1] = life * (height + 3);
      motePos[i * 3 + 2] = center.z + Math.sin(a) * rr;
    });
    moteGeo.attributes.position.needsUpdate = true;

    // Orbs rise from the ground, then orbit on two staggered rows
    const n = orbs.length;
    const orbitR = radius + 2.4;
    orbs.forEach(({ sprite, delay }, i) => {
      const k = THREE.MathUtils.clamp((t - delay) / 0.9, 0, 1);
      const e = 1 - Math.pow(1 - k, 3);
      const a = (i / n) * Math.PI * 2 + t * 0.32;
      const row = i % 2 === 0 ? 0.55 : 0.95;
      const y = THREE.MathUtils.lerp(0.2, height * row + 0.9 + Math.sin(t * 1.4 + i) * 0.18, e);
      sprite.position.set(center.x + Math.cos(a) * orbitR, y, center.z + Math.sin(a) * orbitR);
      const s = 1.9 * (0.4 + 0.6 * e);
      sprite.scale.set(s, s, 1);
      sprite.material.opacity = e * fade;
    });
  }

  return { enter, exit, update, get active() { return active; } };
}
export type Showcase = ReturnType<typeof createShowcase>;
