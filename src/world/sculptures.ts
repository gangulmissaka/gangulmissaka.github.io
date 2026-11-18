// Two code-built sculptures that present the desktop-app projects:
//   Nimbo (west):     "The Sorting Cloud": photos spiral down out of a cloud and land in year stacks.
//   ManimDesk (east): "The Equation Engine": a brass knot inside a render frame that flips 16:9 ⇄ 9:16,
//                     a glowing curve that draws and erases itself, and floating formulas.
// Positions come from LANDMARKS in layout.ts. Model front is +Z before rotation, like the GLBs.
import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { LANDMARKS } from './layout';
import { BODY_KIND, canvasTexture, type Physics, type PlacedLandmark } from './props';
import { mulberry32 } from './terrain';
import { PORTFOLIO_PROJECTS } from '@/data/portfolioData';

const FONT = 'Inter, "Helvetica Neue", Arial, sans-serif';
const colorOf = (id: string, fallback: string) => PORTFOLIO_PROJECTS.find((p) => p.id === id)?.color ?? fallback;

function stoneTexture(seed: number, tone: [number, number, number]) {
  const rand = mulberry32(seed);
  return canvasTexture(256, 256, (ctx) => {
    ctx.fillStyle = `rgb(${tone.join(',')})`;
    ctx.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 2200; i++) {
      const k = rand() < 0.5 ? 0 : 255;
      ctx.fillStyle = `rgba(${k},${k},${k},${0.03 + rand() * 0.06})`;
      ctx.fillRect(rand() * 256, rand() * 256, 1 + rand() * 3, 1 + rand() * 3);
    }
  });
}

/** Engraved bronze plaque on the front of a plinth. */
function plaque(title: string, subtitle: string, accent: string, w: number, h: number) {
  const tex = canvasTexture(1024, 256, (ctx) => {
    const g = ctx.createLinearGradient(0, 0, 0, 256);
    g.addColorStop(0, '#5c4a32');
    g.addColorStop(1, '#3a2e20');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 1024, 256);
    ctx.strokeStyle = 'rgba(232,206,150,0.55)';
    ctx.lineWidth = 6;
    ctx.strokeRect(14, 14, 996, 228);
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ead7a8';
    ctx.font = `800 92px ${FONT}`;
    ctx.fillText(title, 512, 126, 940);
    ctx.fillStyle = accent;
    ctx.font = `600 40px ${FONT}`;
    ctx.fillText(subtitle.toUpperCase(), 512, 196, 940);
  });
  const mat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.45, metalness: 0.55, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 0.08 });
  return new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
}

function addSolid(physics: Physics, shape: CANNON.Shape, x: number, y: number, z: number, rotY: number) {
  const b = new CANNON.Body({ type: CANNON.Body.STATIC, shape, material: physics.mats.prop });
  b.position.set(x, y * SCALE, z);
  b.quaternion.setFromEuler(0, rotY, 0);
  physics.world.addBody(b);
  BODY_KIND.set(b, 'stone');
}

/** Both sculptures are modelled at 1:1 and scaled up by this much. */
const SCALE = 1.25;

const smooth = (t: number) => t * t * (3 - 2 * t);
const clamp01 = (t: number) => Math.min(1, Math.max(0, t));

// ── Nimbo: the sorting cloud ──────────────────────────────────────

/** 4×4 atlas of little "holiday snapshots" with white borders. */
function photoAtlas() {
  const rand = mulberry32(77);
  const C = 128;
  const skies: [string, string][] = [
    ['#7fb6ff', '#d9ecff'], ['#ff9a6b', '#ffd59e'], ['#2b3a67', '#7d6fa8'], ['#9ad1e8', '#f3f7e8'],
    ['#f7a8b8', '#fde2c4'], ['#5aa0d8', '#c6e3f5'], ['#1d2b4f', '#3f5e8c'], ['#ffc46b', '#fff0c9'],
  ];
  const lands = ['#4f8a3c', '#6aa84f', '#2f5d50', '#a8743d', '#3b6e8f', '#7a9a3a', '#c98f5a', '#355e3b'];
  return canvasTexture(C * 4, C * 4, (ctx) => {
    for (let i = 0; i < 16; i++) {
      const x0 = (i % 4) * C;
      const y0 = Math.floor(i / 4) * C;
      ctx.fillStyle = '#f7f4ee';
      ctx.fillRect(x0, y0, C, C);
      const px = x0 + 9;
      const py = y0 + 9;
      const pw = C - 18;
      const ph = C - 30; // polaroid: thicker bottom border
      const [s0, s1] = skies[i % skies.length];
      const g = ctx.createLinearGradient(0, py, 0, py + ph);
      g.addColorStop(0, s0);
      g.addColorStop(1, s1);
      ctx.fillStyle = g;
      ctx.fillRect(px, py, pw, ph);
      ctx.save();
      ctx.beginPath();
      ctx.rect(px, py, pw, ph);
      ctx.clip();
      // sun or moon
      ctx.fillStyle = i % 4 === 2 ? '#f4f1d0' : '#fff6c8';
      ctx.beginPath();
      ctx.arc(px + 20 + rand() * (pw - 40), py + 16 + rand() * 18, 7 + rand() * 6, 0, Math.PI * 2);
      ctx.fill();
      // hills / sea / city
      const kind = i % 3;
      ctx.fillStyle = lands[(i * 3) % lands.length];
      ctx.beginPath();
      ctx.moveTo(px, py + ph);
      if (kind === 0) {
        for (let k = 0; k <= 6; k++) ctx.lineTo(px + (k / 6) * pw, py + ph * (0.55 + Math.sin(k * 1.7 + i) * 0.12 + rand() * 0.06));
      } else if (kind === 1) {
        ctx.lineTo(px, py + ph * 0.68);
        ctx.lineTo(px + pw * 0.35, py + ph * 0.28);
        ctx.lineTo(px + pw * 0.6, py + ph * 0.6);
        ctx.lineTo(px + pw * 0.78, py + ph * 0.42);
        ctx.lineTo(px + pw, py + ph * 0.7);
      } else {
        let x = px;
        while (x < px + pw) {
          const bw = 8 + rand() * 14;
          const bh = ph * (0.25 + rand() * 0.4);
          ctx.lineTo(x, py + ph - bh);
          ctx.lineTo(x + bw, py + ph - bh);
          x += bw;
        }
        ctx.lineTo(px + pw, py + ph);
      }
      ctx.lineTo(px + pw, py + ph);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
  });
}

function yearSprite(text: string, accent: string) {
  const tex = canvasTexture(256, 112, (ctx) => {
    ctx.fillStyle = 'rgba(12,14,18,0.7)';
    ctx.beginPath();
    ctx.roundRect(6, 6, 244, 100, 30);
    ctx.fill();
    ctx.strokeStyle = accent;
    ctx.lineWidth = 4;
    ctx.stroke();
    ctx.fillStyle = '#f6f3ee';
    ctx.font = `800 62px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.fillText(text, 128, 78);
  });
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
  s.scale.set(0.95, 0.42, 1);
  return s;
}

function buildNimbo(scene: THREE.Scene, physics: Physics, x: number, z: number, rotY: number) {
  const accent = colorOf('nimbo', '#8fb6ff');
  const root = new THREE.Group();
  root.position.set(x, 0, z);
  root.rotation.y = rotY;
  root.scale.setScalar(SCALE);
  scene.add(root);

  // Octagonal plinth (two tiers) with the plaque on the front face.
  const stone = new THREE.MeshStandardMaterial({ color: 0xbdb5a6, map: stoneTexture(11, [150, 144, 132]), roughness: 0.92 });
  const base = new THREE.Mesh(new THREE.CylinderGeometry(2.7, 2.85, 0.7, 8), stone);
  base.rotation.y = Math.PI / 8; // put a flat face toward +Z
  base.position.y = 0.35;
  const top = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 2.35, 0.35, 8), stone);
  top.rotation.y = Math.PI / 8;
  top.position.y = 0.875;
  [base, top].forEach((m) => {
    m.castShadow = true;
    m.receiveShadow = true;
    root.add(m);
  });
  const sign = plaque('NIMBO', 'Image Organizer', accent, 2.1, 0.52);
  sign.position.set(0, 0.36, 2.53);
  sign.rotation.x = -0.03;
  root.add(sign);
  const TOP = 1.05;

  // A glowing inlay ring on the top tier.
  const inlay = new THREE.Mesh(
    new THREE.TorusGeometry(1.95, 0.035, 8, 64),
    new THREE.MeshStandardMaterial({ color: 0x111111, emissive: accent, emissiveIntensity: 2.2 }),
  );
  inlay.rotation.x = Math.PI / 2;
  inlay.position.y = TOP + 0.01;
  root.add(inlay);

  // Four year stacks of neatly filed photos.
  const years = ['2023', '2024', '2025', '2026'];
  const heights = [7, 11, 14, 9];
  const rand = mulberry32(31);
  const total = heights.reduce((a, b) => a + b, 0);
  const frameGeo = new THREE.BoxGeometry(0.66, 0.045, 0.54);
  const frames = new THREE.InstancedMesh(frameGeo, new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.55 }), total);
  frames.castShadow = true;
  frames.receiveShadow = true;
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const one = new THREE.Vector3(1, 1, 1);
  const pv = new THREE.Vector3();
  const tints = ['#f4efe6', '#e8eef7', '#f6e7d9', '#e6f0e2', '#efe4f4'].map((c) => new THREE.Color(c));
  let n = 0;
  const stackPos: THREE.Vector3[] = [];
  years.forEach((year, s) => {
    const a = Math.PI / 4 + (s * Math.PI) / 2;
    const sx = Math.sin(a) * 1.3;
    const sz = Math.cos(a) * 1.3;
    for (let k = 0; k < heights[s]; k++) {
      e.set((rand() - 0.5) * 0.04, a + (rand() - 0.5) * 0.25, (rand() - 0.5) * 0.04);
      q.setFromEuler(e);
      pv.set(sx + (rand() - 0.5) * 0.05, TOP + 0.03 + k * 0.05, sz + (rand() - 0.5) * 0.05);
      frames.setMatrixAt(n, m4.compose(pv, q, one));
      frames.setColorAt(n, tints[Math.floor(rand() * tints.length)]);
      n++;
    }
    const topY = TOP + heights[s] * 0.05;
    stackPos.push(new THREE.Vector3(sx, topY, sz));
    const label = yearSprite(year, accent);
    label.position.set(sx * 1.08, topY + 0.42, sz * 1.08);
    root.add(label);
  });
  root.add(frames);

  // The cloud ("nimbus"): soft marble puffs that bob above the stacks.
  const cloud = new THREE.Group();
  const puffMat = new THREE.MeshStandardMaterial({ color: 0xf4f6fb, roughness: 0.6, emissive: new THREE.Color(accent), emissiveIntensity: 0.07 });
  const puffGeo = new THREE.SphereGeometry(1, 28, 18);
  const puffs: [number, number, number, number][] = [
    [0, 0, 0, 1.05], [0.95, -0.15, 0.1, 0.82], [-1.0, -0.18, 0, 0.78], [0.42, 0.48, 0.15, 0.78],
    [-0.42, 0.4, -0.12, 0.72], [0.2, -0.28, 0.62, 0.7], [-0.25, -0.24, -0.6, 0.7], [1.6, -0.42, 0, 0.52],
    [-1.62, -0.46, 0.08, 0.48], [0.9, 0.12, -0.5, 0.6], [-0.9, 0.05, 0.5, 0.58],
  ];
  puffs.forEach(([px, py, pz, r]) => {
    const m = new THREE.Mesh(puffGeo, puffMat);
    m.position.set(px, py, pz);
    m.scale.set(r, r * 0.86, r);
    m.castShadow = true;
    cloud.add(m);
  });
  cloud.position.y = 6.3;
  root.add(cloud);
  // Glow on the cloud's underside, where the photos fall from.
  const under = new THREE.Mesh(
    new THREE.CircleGeometry(1.6, 40),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(accent).multiplyScalar(1.4), transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }),
  );
  under.rotation.x = Math.PI / 2;
  under.position.y = -0.55;
  cloud.add(under);

  // The light beam from the cloud down to the stacks.
  const beam = new THREE.Mesh(
    new THREE.CylinderGeometry(0.06, 0.2, 5.2, 16, 1, true),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(accent).multiplyScalar(1.2), transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false }),
  );
  beam.position.y = TOP + 2.6;
  root.add(beam);

  // Photos spiralling down from the cloud. One instanced mesh; each instance picks an atlas cell.
  const COUNT = 30;
  const atlas = photoAtlas();
  const cardGeo = new THREE.PlaneGeometry(0.62, 0.62);
  const cells = new Float32Array(COUNT * 2);
  for (let i = 0; i < COUNT; i++) {
    cells[i * 2] = (i % 4) * 0.25;
    cells[i * 2 + 1] = Math.floor((i * 5) % 16 / 4) * 0.25;
  }
  cardGeo.setAttribute('aCell', new THREE.InstancedBufferAttribute(cells, 2));
  const cardMat = new THREE.MeshStandardMaterial({
    map: atlas, emissive: 0xffffff, emissiveMap: atlas, emissiveIntensity: 0.22, roughness: 0.5, side: THREE.DoubleSide,
  });
  cardMat.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec2 aCell;')
      .replace('#include <uv_vertex>', '#include <uv_vertex>\n#ifdef USE_MAP\nvMapUv = vMapUv * 0.25 + vec2(aCell.x, 0.75 - aCell.y);\n#endif\n#ifdef USE_EMISSIVEMAP\nvEmissiveMapUv = vEmissiveMapUv * 0.25 + vec2(aCell.x, 0.75 - aCell.y);\n#endif');
  };
  cardMat.customProgramCacheKey = () => 'nimbo-cards';
  const cards = new THREE.InstancedMesh(cardGeo, cardMat, COUNT);
  cards.castShadow = true;
  cards.frustumCulled = false; // instances move far from the geometry's own bounds
  cards.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  root.add(cards);
  const phase = Array.from({ length: COUNT }, (_, i) => i / COUNT + rand() * 0.02);
  const wobble = Array.from({ length: COUNT }, () => rand() * Math.PI * 2);
  const target = Array.from({ length: COUNT }, (_, i) => i % 4);
  const scl = new THREE.Vector3();
  const look = new THREE.Matrix4();
  const up = new THREE.Vector3(0, 1, 0);
  const eye = new THREE.Vector3();
  const at = new THREE.Vector3();
  const free = new THREE.Vector3();
  const flutter = new THREE.Quaternion();

  addSolid(physics, new CANNON.Cylinder(2.75 * SCALE, 2.85 * SCALE, 1.4 * SCALE, 8), x, 0.7, z, rotY);

  const update = (t: number) => {
    cloud.position.y = 6.3 + Math.sin(t * 0.7) * 0.12;
    cloud.rotation.y = t * 0.08;
    (beam.material as THREE.MeshBasicMaterial).opacity = 0.28 + Math.sin(t * 2.3) * 0.08;
    inlay.material.emissiveIntensity = 1.8 + Math.sin(t * 1.6) * 0.5;
    const top = cloud.position.y - 0.7;
    for (let i = 0; i < COUNT; i++) {
      const u = (phase[i] + t * 0.045) % 1; // 0 = leaving the cloud, 1 = filed on its stack
      const ang = u * Math.PI * 4.5 + i * 0.37 + t * 0.15;
      const r = 0.55 + Math.sin(u * Math.PI) * 1.35;
      free.set(Math.sin(ang) * r, top - u * (top - TOP - 0.9), Math.cos(ang) * r);
      // In the last stretch each photo glides onto its year stack.
      const settle = smooth(clamp01((u - 0.78) / 0.2));
      const dest = stackPos[target[i]];
      pv.copy(free).lerp(eye.set(dest.x, dest.y + 0.12, dest.z), settle);
      const grow = smooth(clamp01(u / 0.08));
      const shrink = 1 - smooth(clamp01((u - 0.93) / 0.07));
      const s = grow * shrink;
      scl.set(s, s, s);
      // Face outward and flutter; lie flat as it lands.
      at.set(pv.x * 2, pv.y + Math.sin(t * 2 + wobble[i]) * 0.6, pv.z * 2);
      look.lookAt(at, pv, up);
      q.setFromRotationMatrix(look);
      e.set(-Math.PI / 2 * settle, 0, Math.sin(t * 1.7 + wobble[i]) * 0.35 * (1 - settle));
      q.multiply(flutter.setFromEuler(e));
      cards.setMatrixAt(i, m4.compose(pv, q, scl));
    }
    cards.instanceMatrix.needsUpdate = true;
  };

  return { root, update, half: [2.85 * SCALE, 2.85 * SCALE] as [number, number] };
}

// ── ManimDesk: the equation engine ───────────────────────────────

/** Draws a formula where `^{...}` is a superscript and `_{...}` a subscript. */
function drawFormula(ctx: CanvasRenderingContext2D, text: string, cx: number, cy: number, size: number) {
  const parts: { s: string; k: 0 | 1 | -1 }[] = [];
  const re = /(\^|_)\{([^}]*)\}/g;
  let last = 0;
  let mt: RegExpExecArray | null;
  while ((mt = re.exec(text))) {
    if (mt.index > last) parts.push({ s: text.slice(last, mt.index), k: 0 });
    parts.push({ s: mt[2], k: mt[1] === '^' ? 1 : -1 });
    last = mt.index + mt[0].length;
  }
  if (last < text.length) parts.push({ s: text.slice(last), k: 0 });
  const fontOf = (k: number) => `italic 500 ${k ? size * 0.62 : size}px "Times New Roman", "Cambria Math", serif`;
  const width = parts.reduce((w, p) => {
    ctx.font = fontOf(p.k);
    return w + ctx.measureText(p.s).width;
  }, 0);
  let x = cx - width / 2;
  parts.forEach((p) => {
    ctx.font = fontOf(p.k);
    ctx.fillText(p.s, x, cy - (p.k === 1 ? size * 0.42 : p.k === -1 ? -size * 0.2 : 0));
    x += ctx.measureText(p.s).width;
  });
}

const FORMULAS = [
  'e^{iπ} + 1 = 0',
  '∇ · E = ρ / ε_{0}',
  'a^{2} + b^{2} = c^{2}',
  'F = ma',
  '∫ e^{−x²} dx = √π',
  'E = mc^{2}',
  'ψ(x, t) = A e^{i(kx − ωt)}',
  'x(t) = A cos(ωt + φ)',
];

function buildManim(scene: THREE.Scene, physics: Physics, x: number, z: number, rotY: number) {
  const accent = colorOf('manimdesk', '#f08fd0');
  const glow = new THREE.Color(accent);
  const root = new THREE.Group();
  root.position.set(x, 0, z);
  root.rotation.y = rotY;
  root.scale.setScalar(SCALE);
  scene.add(root);

  // Square plinth, two tiers, plaque on the front.
  const stone = new THREE.MeshStandardMaterial({ color: 0x8e8a86, map: stoneTexture(23, [96, 92, 90]), roughness: 0.85 });
  const base = new THREE.Mesh(new THREE.BoxGeometry(4.6, 0.7, 4.6), stone);
  base.position.y = 0.35;
  const top = new THREE.Mesh(new THREE.BoxGeometry(3.7, 0.35, 3.7), stone);
  top.position.y = 0.875;
  [base, top].forEach((m) => {
    m.castShadow = true;
    m.receiveShadow = true;
    root.add(m);
  });
  const sign = plaque('MANIMDESK', 'Maths animation renderer', accent, 2.3, 0.57);
  sign.position.set(0, 0.36, 2.31);
  root.add(sign);
  const TOP = 1.05;

  // Glowing grid etched into the top: a little coordinate plane.
  const grid = new THREE.GridHelper(3.4, 8, glow.clone().multiplyScalar(1.6), glow.clone().multiplyScalar(0.6));
  grid.position.y = TOP + 0.01;
  (grid.material as THREE.LineBasicMaterial).transparent = true;
  (grid.material as THREE.LineBasicMaterial).opacity = 0.7;
  root.add(grid);

  // Brass pedestal and the trefoil knot.
  const brass = new THREE.MeshStandardMaterial({ color: 0xd2aa5f, metalness: 1, roughness: 0.26, envMapIntensity: 1.2, emissive: 0x6b4a18, emissiveIntensity: 0.35 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x2e2a26, metalness: 0.8, roughness: 0.4 });
  const ped = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.42, 1.7, 24), dark);
  ped.position.y = TOP + 0.85;
  ped.castShadow = true;
  root.add(ped);
  const cup = new THREE.Mesh(new THREE.TorusGeometry(0.34, 0.07, 10, 32), brass);
  cup.rotation.x = Math.PI / 2;
  cup.position.y = TOP + 1.72;
  root.add(cup);
  const knot = new THREE.Mesh(new THREE.TorusKnotGeometry(0.95, 0.19, 260, 22, 2, 3), brass);
  knot.position.y = 4.15;
  knot.castShadow = true;
  root.add(knot);

  // Render frame behind the knot that flips between 16:9 and 9:16.
  const frameMat = new THREE.MeshBasicMaterial({ color: glow.clone().multiplyScalar(2) });
  const bar = new THREE.BoxGeometry(1, 1, 1);
  const bars = [0, 1, 2, 3].map(() => {
    const b = new THREE.Mesh(bar, frameMat);
    root.add(b);
    return b;
  });
  const corner = new THREE.Mesh(new THREE.CircleGeometry(0.11, 20), new THREE.MeshBasicMaterial({ color: 0xff4b4b }));
  root.add(corner);
  const play = new THREE.Shape();
  play.moveTo(0, 0.17);
  play.lineTo(0.3, 0);
  play.lineTo(0, -0.17);
  play.closePath();
  const playIcon = new THREE.Mesh(new THREE.ShapeGeometry(play), frameMat);
  root.add(playIcon);
  const ratioTex = [
    canvasTexture(256, 96, (ctx) => {
      ctx.fillStyle = '#ffffff';
      ctx.font = `800 64px ${FONT}`;
      ctx.textAlign = 'center';
      ctx.fillText('16:9', 128, 70);
    }),
    canvasTexture(256, 96, (ctx) => {
      ctx.fillStyle = '#ffffff';
      ctx.font = `800 64px ${FONT}`;
      ctx.textAlign = 'center';
      ctx.fillText('9:16', 128, 70);
    }),
  ];
  const ratioMat = new THREE.MeshBasicMaterial({ map: ratioTex[0], color: glow.clone().multiplyScalar(1.8), transparent: true, depthWrite: false });
  const ratio = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 0.26), ratioMat);
  root.add(ratio);
  const FZ = -0.85;
  const CY = 4.15;
  const setFrame = (w: number, h: number) => {
    const T = 0.07;
    bars[0].scale.set(w + T, T, T);
    bars[0].position.set(0, CY + h / 2, FZ);
    bars[1].scale.set(w + T, T, T);
    bars[1].position.set(0, CY - h / 2, FZ);
    bars[2].scale.set(T, h, T);
    bars[2].position.set(-w / 2, CY, FZ);
    bars[3].scale.set(T, h, T);
    bars[3].position.set(w / 2, CY, FZ);
    corner.position.set(-w / 2 + 0.25, CY + h / 2 - 0.25, FZ + 0.05);
    playIcon.position.set(w / 2 - 0.45, CY - h / 2 + 0.3, FZ + 0.05);
    ratio.position.set(w / 2 - 0.5, CY + h / 2 - 0.25, FZ + 0.05);
  };

  // A glowing curve that Manim-style "Create"s itself around the knot, then uncreates.
  class Orbit extends THREE.Curve<THREE.Vector3> {
    constructor() {
      super();
    }
    getPoint(t: number, target = new THREE.Vector3()) {
      const a = t * Math.PI * 2;
      const r = 1.85 + Math.sin(a * 5) * 0.18;
      return target.set(Math.cos(a) * r, CY + Math.sin(a * 3) * 0.75, Math.sin(a) * r);
    }
  }
  const SEG = 360;
  const RADIAL = 6;
  const tubeGeo = new THREE.TubeGeometry(new Orbit(), SEG, 0.035, RADIAL, true);
  const tube = new THREE.Mesh(tubeGeo, new THREE.MeshBasicMaterial({ color: glow.clone().multiplyScalar(2.2) }));
  root.add(tube);
  const tip = new THREE.Mesh(new THREE.SphereGeometry(0.09, 16, 12), new THREE.MeshBasicMaterial({ color: new THREE.Color(3, 3, 3) }));
  root.add(tip);
  const orbit = new Orbit();
  const perSeg = RADIAL * 6;

  // Floating formulas that fade in, drift up and fade out.
  const formulaSprites = [0, 1, 2].map((k) => {
    const c = document.createElement('canvas');
    c.width = 768;
    c.height = 160;
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, opacity: 0 });
    const sp = new THREE.Sprite(mat);
    sp.scale.set(3.2, 0.67, 1);
    root.add(sp);
    return { sp, c, tex, mat, shown: -1, k };
  });
  const paint = (f: (typeof formulaSprites)[number], text: string) => {
    const ctx = f.c.getContext('2d')!;
    ctx.clearRect(0, 0, f.c.width, f.c.height);
    ctx.shadowColor = accent;
    ctx.shadowBlur = 18;
    ctx.fillStyle = '#ffffff';
    ctx.textBaseline = 'middle';
    drawFormula(ctx, text, f.c.width / 2, f.c.height / 2 + 6, 74);
    f.tex.needsUpdate = true;
  };
  const slots = [
    new THREE.Vector3(-2.3, 5.6, 0.6),
    new THREE.Vector3(2.4, 5.2, 0.2),
    new THREE.Vector3(0, 6.6, -0.4),
  ];

  addSolid(physics, new CANNON.Box(new CANNON.Vec3(2.3 * SCALE, 0.7 * SCALE, 2.3 * SCALE)), x, 0.7, z, rotY);

  const tmp = new THREE.Vector3();
  const update = (t: number) => {
    knot.rotation.y = t * 0.35;
    knot.rotation.x = Math.sin(t * 0.25) * 0.35;
    // 16:9 ⇄ 9:16 every 7 s.
    const cyc = (t / 7) % 2;
    const k = smooth(clamp01((cyc < 1 ? cyc : cyc - 1) * 4 - 3)); // last quarter of each half morphs
    const portrait = cyc < 1 ? k : 1 - k;
    setFrame(4.4 + (2.3 - 4.4) * portrait, 2.5 + (4.0 - 2.5) * portrait);
    ratioMat.map = ratioTex[portrait > 0.5 ? 1 : 0];
    corner.visible = Math.sin(t * 5) > -0.2;

    // Create (3 s) → hold (2 s) → uncreate (2 s) → pause (1 s)
    const p = t % 8;
    let from = 0;
    let to = 0;
    if (p < 3) to = smooth(p / 3);
    else if (p < 5) to = 1;
    else if (p < 7) {
      from = smooth((p - 5) / 2);
      to = 1;
    }
    const a = Math.floor(from * SEG) * perSeg;
    const b = Math.floor(to * SEG) * perSeg;
    tubeGeo.setDrawRange(a, Math.max(0, b - a));
    tube.visible = b > a;
    tip.visible = p < 3;
    if (tip.visible) orbit.getPoint(to, tip.position);

    formulaSprites.forEach((f, i) => {
      const period = 9;
      const local = (t + i * 3) % period;
      const round = Math.floor((t + i * 3) / period);
      const idx = (round * 3 + i) % FORMULAS.length;
      if (f.shown !== idx) {
        paint(f, FORMULAS[idx]);
        f.shown = idx;
      }
      f.mat.opacity = smooth(clamp01(local / 1.2)) * (1 - smooth(clamp01((local - 6.5) / 1.5))) * 0.95;
      tmp.copy(slots[i]);
      tmp.y += local * 0.08;
      f.sp.position.copy(tmp);
    });
  };
  update(0);

  return { root, update, half: [2.3 * SCALE, 2.3 * SCALE] as [number, number] };
}

// ── Public ───────────────────────────────────────────────────────

export function createSculptures(scene: THREE.Scene, physics: Physics) {
  const nimboDef = LANDMARKS.find((l) => l.key === 'nimbo')!;
  const manimDef = LANDMARKS.find((l) => l.key === 'manim')!;
  const nimbo = buildNimbo(scene, physics, nimboDef.x, nimboDef.z, nimboDef.rotY);
  const manim = buildManim(scene, physics, manimDef.x, manimDef.z, manimDef.rotY);
  const placed: PlacedLandmark[] = [
    { key: 'nimbo', object: nimbo.root, half: nimbo.half, x: nimboDef.x, z: nimboDef.z, rotY: nimboDef.rotY },
    { key: 'manim', object: manim.root, half: manim.half, x: manimDef.x, z: manimDef.z, rotY: manimDef.rotY },
  ];
  return {
    placed,
    update(t: number) {
      nimbo.update(t);
      manim.update(t);
    },
  };
}
