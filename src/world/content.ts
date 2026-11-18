// In-world content: the name title, ground decals, about board, notice board,
// "How I Build" stones and contact tiles.
import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { FontLoader } from 'three/examples/jsm/loaders/FontLoader.js';
import { TextGeometry } from 'three/examples/jsm/geometries/TextGeometry.js';
import {
  ABOUT_SPOT, APPROACH_SPOTS, CONTACT_SPOT, CONTACT_TILES, CONTROLS_DECAL, NAME_TITLE, POSTS_SPOT, SUBTITLE_DECAL,
} from './layout';
import { BODY_KIND, canvasTexture, groundRing, labelSprite, type DynamicProp, type Physics } from './props';
import { APPROACH, POSTS, SITE } from '@/data/portfolioData';

const FONT_UI = 'Inter, "Helvetica Neue", Arial, sans-serif';
const INK = '#f5f2ec';

export type InteractiveKind = 'about' | 'posts' | 'approach' | 'contact';
export interface Interactive {
  kind: InteractiveKind;
  id: string;
  pos: THREE.Vector3;
  radius: number;
  title: string;
  accent: string;
  /** Button text in the prompt; omitted for walk-by info (approach stones). */
  action?: string;
  url?: string;
  index?: number;
  ring?: THREE.Mesh;
}

// ── Helpers ───────────────────────────────────────────────────────

function insidePoly(x: number, y: number, pts: THREE.Vector2[]) {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const a = pts[i];
    const b = pts[j];
    if (a.y > y !== b.y > y && x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

/**
 * Approximates a glyph (shapes with holes) by a small set of axis-aligned rectangles:
 * rasterise onto a grid, merge filled cells into horizontal runs, then stack identical
 * runs vertically. `grow` pads each rectangle to cover the bevel.
 */
function glyphBoxes(shapes: THREE.Shape[], bb: THREE.Box3, cell: number, grow: number) {
  const polys = shapes.map((s) => {
    const p = s.extractPoints(6);
    return { outer: p.shape, holes: p.holes };
  });
  const filled = (x: number, y: number) =>
    polys.some((p) => insidePoly(x, y, p.outer) && !p.holes.some((h) => insidePoly(x, y, h)));
  const x0 = bb.min.x;
  const y0 = bb.min.y;
  const cols = Math.max(1, Math.ceil((bb.max.x - x0) / cell));
  const rows = Math.max(1, Math.ceil((bb.max.y - y0) / cell));
  const cw = (bb.max.x - x0) / cols;
  const ch = (bb.max.y - y0) / rows;
  // A cell counts as solid if most of its sample points are inside the glyph.
  const solid: boolean[][] = [];
  for (let r = 0; r < rows; r++) {
    solid.push([]);
    for (let c = 0; c < cols; c++) {
      let hits = 0;
      for (const [u, v] of [[0.5, 0.5], [0.2, 0.2], [0.8, 0.2], [0.2, 0.8], [0.8, 0.8]]) {
        if (filled(x0 + (c + u) * cw, y0 + (r + v) * ch)) hits++;
      }
      solid[r].push(hits >= 3);
    }
  }
  // Horizontal runs per row, then merge runs with identical extents on consecutive rows.
  type Run = { c0: number; c1: number; r0: number; r1: number };
  const open: Run[] = [];
  const done: Run[] = [];
  for (let r = 0; r < rows; r++) {
    const runs: Run[] = [];
    for (let c = 0; c < cols; ) {
      if (!solid[r][c]) {
        c++;
        continue;
      }
      const start = c;
      while (c < cols && solid[r][c]) c++;
      runs.push({ c0: start, c1: c, r0: r, r1: r + 1 });
    }
    const next: Run[] = [];
    runs.forEach((run) => {
      const i = open.findIndex((o) => o.c0 === run.c0 && o.c1 === run.c1 && o.r1 === r);
      if (i >= 0) {
        open[i].r1 = r + 1;
        next.push(open[i]);
        open.splice(i, 1);
      } else next.push(run);
    });
    done.push(...open);
    open.length = 0;
    open.push(...next);
  }
  done.push(...open);
  return done.map((r) => ({
    x: x0 + r.c0 * cw - grow,
    y: y0 + r.r0 * ch - grow,
    w: (r.c1 - r.c0) * cw + grow * 2,
    h: (r.r1 - r.r0) * ch + grow * 2,
  }));
}

function groundDecal(tex: THREE.Texture, w: number, h: number, x: number, z: number, rotY = 0, opacity = 1) {
  const mat = new THREE.MeshStandardMaterial({
    map: tex, transparent: true, opacity, depthWrite: false, roughness: 0.95, metalness: 0,
    polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -6,
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
  mesh.rotation.set(-Math.PI / 2, rotY, 0, 'YXZ');
  mesh.position.set(x, 0.05, z);
  mesh.receiveShadow = true;
  mesh.renderOrder = 1;
  return mesh;
}

function wrapText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, maxW: number, lineH: number, maxLines = 99) {
  const words = text.split(' ');
  let line = '';
  let lines = 0;
  for (let i = 0; i < words.length; i++) {
    const test = line ? `${line} ${words[i]}` : words[i];
    if (ctx.measureText(test).width > maxW && line) {
      lines++;
      if (lines >= maxLines) {
        ctx.fillText(line + '…', x, y);
        return y + lineH;
      }
      ctx.fillText(line, x, y);
      line = words[i];
      y += lineH;
    } else line = test;
  }
  if (line) ctx.fillText(line, x, y);
  return y + lineH;
}

function keycap(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, label: string) {
  ctx.fillStyle = 'rgba(245,242,236,0.92)';
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, 14);
  ctx.fill();
  ctx.fillStyle = 'rgba(0,0,0,0.18)';
  ctx.fillRect(x + 6, y + h - 8, w - 12, 6);
  ctx.fillStyle = '#1b1a17';
  ctx.font = `700 ${Math.round(h * 0.42)}px ${FONT_UI}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, x + w / 2, y + h / 2 + 1);
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
}

const woodMat = () => new THREE.MeshStandardMaterial({ color: 0x5b4330, roughness: 0.85 });

/** A framed signboard on two posts; the face is a canvas texture facing local +Z. */
function signboard(face: THREE.Texture, w: number, h: number, postH: number) {
  const g = new THREE.Group();
  const wood = woodMat();
  [-1, 1].forEach((s) => {
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.22, postH + h, 0.22), wood);
    post.position.set((s * (w + 0.1)) / 2, (postH + h) / 2, -0.05);
    post.castShadow = true;
    g.add(post);
  });
  const frame = new THREE.Mesh(new THREE.BoxGeometry(w + 0.3, h + 0.3, 0.16), wood);
  frame.position.set(0, postH + h / 2, -0.06);
  frame.castShadow = true;
  g.add(frame);
  const panelMat = new THREE.MeshStandardMaterial({ map: face, roughness: 0.75, emissive: 0xffffff, emissiveMap: face, emissiveIntensity: 0.22 });
  const panel = new THREE.Mesh(new THREE.PlaneGeometry(w, h), panelMat);
  panel.position.set(0, postH + h / 2, 0.025);
  g.add(panel);
  return { group: g, panelMat };
}

function staticBox(physics: Physics, x: number, y: number, z: number, hx: number, hy: number, hz: number, rotY: number, kind: 'wood' | 'stone') {
  const b = new CANNON.Body({ type: CANNON.Body.STATIC, material: physics.mats.prop, shape: new CANNON.Box(new CANNON.Vec3(hx, hy, hz)) });
  b.position.set(x, y, z);
  b.quaternion.setFromEuler(0, rotY, 0);
  physics.world.addBody(b);
  BODY_KIND.set(b, kind);
}

// ── Build ──────────────────────────────────────────────────────────

export async function createContent(scene: THREE.Scene, physics: Physics) {
  const interactives: Interactive[] = [];
  const labels: THREE.Sprite[] = [];
  const letters: DynamicProp[] = [];

  // 1. Name title: every letter is a rigid body whose collider follows the glyph's real
  //    outline (holes and gaps included), with its centre of mass where the material is.
  try {
    const json = await fetch('/fonts/helvetiker_bold.typeface.json').then((r) => r.json());
    const font = new FontLoader().parse(json);
    const size = NAME_TITLE.size;
    const depth = 0.7;
    const bevel = { thickness: 0.05, size: 0.035 };
    const text = SITE.ownerName.toUpperCase();
    const res = (font.data as unknown as { resolution: number }).resolution;
    const glyphs = (font.data as unknown as { glyphs: Record<string, { ha: number }> }).glyphs;
    const advance = (ch: string) => ((glyphs[ch]?.ha ?? res * 0.6) / res) * size * 1.08;
    const total = [...text].reduce((s, ch) => s + advance(ch), 0);
    const mat = new THREE.MeshStandardMaterial({ color: 0xf1ebe0, roughness: 0.55, metalness: 0.02 });
    const letterMat = new CANNON.Material('letter');
    physics.world.addContactMaterial(new CANNON.ContactMaterial(letterMat, physics.mats.ground, { friction: 0.55, restitution: 0.08 }));
    physics.world.addContactMaterial(new CANNON.ContactMaterial(letterMat, letterMat, { friction: 0.45, restitution: 0.05 }));
    physics.world.addContactMaterial(new CANNON.ContactMaterial(letterMat, physics.mats.prop, { friction: 0.4, restitution: 0.1 }));
    physics.world.addContactMaterial(new CANNON.ContactMaterial(letterMat, physics.mats.bike, { friction: 0.08, restitution: 0.15 }));
    const DENSITY = 60; // kg/m³ — hollow painted letters: ~35–130 kg each, satisfying to knock over

    let cursor = NAME_TITLE.x - total / 2;
    for (const ch of text) {
      const adv = advance(ch);
      if (ch !== ' ') {
        const geo = new TextGeometry(ch, {
          font, size, depth, curveSegments: 5,
          bevelEnabled: true, bevelThickness: bevel.thickness, bevelSize: bevel.size, bevelSegments: 2,
        });
        geo.computeBoundingBox();
        // Copy: geo.translate() below recomputes (mutates) geo.boundingBox in place.
        const bb = geo.boundingBox!.clone();

        // Trace the glyph outline into a set of boxes (in TextGeometry's x/y space).
        const rects = glyphBoxes(font.generateShapes(ch, size), bb, size * 0.075, bevel.size);
        const zHalf = depth / 2 + bevel.thickness;
        const zMid = depth / 2;
        // Centre of mass = area-weighted centroid of the boxes.
        let area = 0;
        let cx = 0;
        let cy = 0;
        rects.forEach((r) => {
          const a = r.w * r.h;
          area += a;
          cx += (r.x + r.w / 2) * a;
          cy += (r.y + r.h / 2) * a;
        });
        cx /= area || 1;
        cy /= area || 1;

        geo.translate(-cx, -cy, -zMid);
        const mesh = new THREE.Mesh(geo, mat);
        mesh.castShadow = mesh.receiveShadow = true;
        scene.add(mesh);

        const body = new CANNON.Body({
          mass: Math.max(25, area * depth * DENSITY),
          material: letterMat,
          linearDamping: 0.04,
          angularDamping: 0.12,
          allowSleep: true,
          sleepSpeedLimit: 0.15,
          sleepTimeLimit: 0.8,
        });
        rects.forEach((r) =>
          body.addShape(
            new CANNON.Box(new CANNON.Vec3(r.w / 2, r.h / 2, zHalf)),
            new CANNON.Vec3(r.x + r.w / 2 - cx, r.y + r.h / 2 - cy, 0),
          ),
        );
        // Rest the glyph's baseline on the ground.
        const minY = rects.reduce((m, r) => Math.min(m, r.y), Infinity);
        body.position.set(cursor + adv / 2 - (bb.min.x + bb.max.x) / 2 + cx, cy - minY + 0.01, NAME_TITLE.z);
        body.sleep();
        physics.world.addBody(body);
        BODY_KIND.set(body, 'wood');
        mesh.position.set(body.position.x, body.position.y, body.position.z);
        letters.push({ mesh, body });
      }
      cursor += adv;
    }
  } catch (e) {
    console.warn('Name title font failed to load', e);
  }

  // 2. Ground decals: role subtitle and the controls cheat-sheet.
  const subTex = canvasTexture(2048, 272, (ctx) => {
    ctx.fillStyle = INK;
    ctx.font = `700 92px ${FONT_UI}`;
    ctx.textAlign = 'center';
    ctx.fillText(`${SITE.role.toUpperCase()}`, 1024, 110);
    ctx.fillStyle = 'rgba(245,242,236,0.75)';
    ctx.font = `600 64px ${FONT_UI}`;
    ctx.fillText(`${SITE.university}  ·  ${SITE.location}`, 1024, 220);
  });
  scene.add(groundDecal(subTex, SUBTITLE_DECAL.w, SUBTITLE_DECAL.h, SUBTITLE_DECAL.x, SUBTITLE_DECAL.z, 0, 0.92));

  const ctrlTex = canvasTexture(1024, 768, (ctx) => {
    const K = 92;
    keycap(ctx, 120, 40, K, K, 'W');
    keycap(ctx, 20, 140, K, K, 'A');
    keycap(ctx, 120, 140, K, K, 'S');
    keycap(ctx, 220, 140, K, K, 'D');
    ctx.fillStyle = INK;
    ctx.font = `700 54px ${FONT_UI}`;
    ctx.fillText('DRIVE', 360, 160);
    const rows: [string, string, number][] = [
      ['SHIFT', 'BOOST', 200],
      ['SPACE', 'JUMP', 200],
      ['B', 'BRAKE', K],
      ['E', 'INTERACT', K],
      ['R', 'RESPAWN', K],
      ['M', 'MAP', K],
    ];
    rows.forEach(([key, what, w], i) => {
      const col = i % 2;
      const row = Math.floor(i / 2);
      const x = 20 + col * 500;
      const y = 300 + row * 150;
      keycap(ctx, x, y, w, 92, key);
      ctx.fillStyle = INK;
      ctx.font = `700 46px ${FONT_UI}`;
      ctx.fillText(what, x + w + 28, y + 62);
    });
  });
  scene.add(groundDecal(ctrlTex, CONTROLS_DECAL.w, CONTROLS_DECAL.h, CONTROLS_DECAL.x, CONTROLS_DECAL.z, 0, 0.9));

  // 3. About board with photo.
  {
    const W = 1600;
    const H = 1000;
    const draw = (photo?: HTMLImageElement) =>
      canvasTexture(W, H, (ctx) => {
        ctx.fillStyle = '#16171a';
        ctx.fillRect(0, 0, W, H);
        if (photo) {
          const ph = H - 120;
          const pw = ph * 0.75;
          ctx.save();
          ctx.beginPath();
          ctx.roundRect(60, 60, pw, ph, 30);
          ctx.clip();
          const s = Math.max(pw / photo.width, ph / photo.height);
          ctx.drawImage(photo, 60 + (pw - photo.width * s) / 2, 60, photo.width * s, photo.height * s);
          ctx.restore();
        }
        const x = 760;
        ctx.fillStyle = '#f2b45a';
        ctx.font = `700 40px ${FONT_UI}`;
        ctx.fillText('ABOUT ME', x, 150);
        ctx.fillStyle = INK;
        ctx.font = `800 104px ${FONT_UI}`;
        ctx.fillText('Gangul', x, 280);
        ctx.fillText('Missaka', x, 390);
        ctx.fillStyle = 'rgba(245,242,236,0.78)';
        ctx.font = `600 46px ${FONT_UI}`;
        ctx.fillText(SITE.role, x, 480);
        ctx.fillText(SITE.university, x, 540);
        ctx.fillStyle = 'rgba(245,242,236,0.6)';
        ctx.font = `500 40px ${FONT_UI}`;
        ctx.fillText(SITE.location, x, 610);
        ctx.fillStyle = '#8fcf9a';
        ctx.beginPath();
        ctx.arc(x + 14, 688, 12, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = INK;
        ctx.font = `600 40px ${FONT_UI}`;
        ctx.fillText(SITE.status, x + 40, 702);
        ctx.fillStyle = 'rgba(245,242,236,0.55)';
        ctx.font = `500 36px ${FONT_UI}`;
        ctx.fillText('Drive into the ring and press E', x, 880);
      });
    const rotY = Math.atan2(ABOUT_SPOT.ringX - ABOUT_SPOT.x, ABOUT_SPOT.ringZ - ABOUT_SPOT.z);
    const board = signboard(draw(), 6.4, 4, 1.1);
    board.group.position.set(ABOUT_SPOT.x, 0, ABOUT_SPOT.z);
    board.group.rotation.y = rotY;
    scene.add(board.group);
    const img = new Image();
    img.onload = () => {
      const tex = draw(img);
      board.panelMat.map = tex;
      board.panelMat.emissiveMap = tex;
      board.panelMat.needsUpdate = true;
    };
    img.src = SITE.photo;
    staticBox(physics, ABOUT_SPOT.x, 1.5, ABOUT_SPOT.z, 3.4, 1.5, 0.3, rotY, 'wood');
    const ring = groundRing('#f2b45a', 3.4);
    ring.position.set(ABOUT_SPOT.ringX, 0.08, ABOUT_SPOT.ringZ);
    scene.add(ring);
    interactives.push({ kind: 'about', id: 'about', pos: new THREE.Vector3(ABOUT_SPOT.ringX, 0, ABOUT_SPOT.ringZ), radius: 3.6, title: 'About Gangul', accent: '#f2b45a', action: 'Read about me', ring });
  }

  // 4. Notice board with LinkedIn posts.
  {
    const W = 1400;
    const H = 1000;
    const tex = canvasTexture(W, H, (ctx) => {
      ctx.fillStyle = '#c9b48e';
      ctx.fillRect(0, 0, W, H);
      for (let i = 0; i < 1600; i++) {
        ctx.fillStyle = `rgba(90,60,30,${Math.random() * 0.08})`;
        ctx.fillRect(Math.random() * W, Math.random() * H, 3, 3);
      }
      ctx.fillStyle = '#2a2219';
      ctx.font = `800 70px ${FONT_UI}`;
      ctx.fillText('Latest posts', 70, 120);
      ctx.font = `600 34px ${FONT_UI}`;
      ctx.fillStyle = 'rgba(42,34,25,0.7)';
      ctx.fillText('from LinkedIn', 72, 170);
      POSTS.slice(0, 4).forEach((p, i) => {
        const x = 70 + (i % 2) * 650;
        const y = 230 + Math.floor(i / 2) * 360;
        ctx.save();
        ctx.translate(x + 280, y + 160);
        ctx.rotate((i % 2 ? 1 : -1) * 0.02);
        ctx.fillStyle = '#f7f2e6';
        ctx.shadowColor = 'rgba(0,0,0,0.25)';
        ctx.shadowBlur = 16;
        ctx.fillRect(-280, -160, 560, 320);
        ctx.shadowBlur = 0;
        ctx.fillStyle = '#c0392b';
        ctx.beginPath();
        ctx.arc(0, -140, 12, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#7a6a55';
        ctx.font = `700 28px ${FONT_UI}`;
        ctx.fillText(p.when.toUpperCase(), -250, -90);
        ctx.fillStyle = '#231d16';
        ctx.font = `600 31px ${FONT_UI}`;
        wrapText(ctx, p.topic, -250, -40, 500, 40, 5);
        ctx.restore();
      });
    });
    const rotY = Math.atan2(POSTS_SPOT.ringX - POSTS_SPOT.x, POSTS_SPOT.ringZ - POSTS_SPOT.z);
    const board = signboard(tex, 5.6, 4, 1.0);
    board.panelMat.emissiveIntensity = 0.12;
    board.group.position.set(POSTS_SPOT.x, 0, POSTS_SPOT.z);
    board.group.rotation.y = rotY;
    scene.add(board.group);
    staticBox(physics, POSTS_SPOT.x, 1.5, POSTS_SPOT.z, 3, 1.5, 0.3, rotY, 'wood');
    const ring = groundRing('#9db8f0', 3.2);
    ring.position.set(POSTS_SPOT.ringX, 0.08, POSTS_SPOT.ringZ);
    scene.add(ring);
    interactives.push({ kind: 'posts', id: 'posts', pos: new THREE.Vector3(POSTS_SPOT.ringX, 0, POSTS_SPOT.ringZ), radius: 3.4, title: 'Latest posts', accent: '#9db8f0', action: 'Read posts', ring });
  }

  // 5. "How I Build" standing stones.
  {
    const stoneTex = canvasTexture(128, 128, (ctx) => {
      ctx.fillStyle = '#8f8a80';
      ctx.fillRect(0, 0, 128, 128);
      for (let i = 0; i < 900; i++) {
        const v = 110 + Math.random() * 60;
        ctx.fillStyle = `rgba(${v},${v - 3},${v - 8},0.4)`;
        ctx.fillRect(Math.random() * 128, Math.random() * 128, 2, 2);
      }
    });
    const stone = new THREE.MeshStandardMaterial({ map: stoneTex, roughness: 0.95 });
    const header = labelSprite('How I Build', 'Approach', '#e8c27a');
    header.scale.multiplyScalar(0.8);
    header.position.set(APPROACH_SPOTS[0][0] + 4, 4.3, APPROACH_SPOTS[0][1] - 1);
    scene.add(header);
    labels.push(header);
    APPROACH.steps.forEach((step, i) => {
      const [x, z] = APPROACH_SPOTS[i];
      const face = canvasTexture(512, 768, (ctx) => {
        ctx.fillStyle = '#8c877d';
        ctx.fillRect(0, 0, 512, 768);
        for (let k = 0; k < 2500; k++) {
          const v = 110 + Math.random() * 60;
          ctx.fillStyle = `rgba(${v},${v - 3},${v - 8},0.35)`;
          ctx.fillRect(Math.random() * 512, Math.random() * 768, 3, 3);
        }
        // engraved look: dark text with a light lower edge
        const engrave = (txt: string, y: number, font: string) => {
          ctx.font = font;
          ctx.textAlign = 'center';
          ctx.fillStyle = 'rgba(255,255,255,0.25)';
          ctx.fillText(txt, 258, y + 3);
          ctx.fillStyle = '#2f2c27';
          ctx.fillText(txt, 256, y);
        };
        engrave(step.n, 290, `800 220px ${FONT_UI}`);
        engrave(step.stage.toUpperCase(), 450, `800 72px ${FONT_UI}`);
        ctx.font = `600 38px ${FONT_UI}`;
        ctx.fillStyle = '#34302a';
        ctx.textAlign = 'center';
        wrapText(ctx, step.focus, 256, 540, 420, 48);
      });
      const faceMat = new THREE.MeshStandardMaterial({ map: face, roughness: 0.9 });
      const slab = new THREE.Mesh(new THREE.BoxGeometry(1.7, 2.5, 0.5), [stone, stone, stone, stone, faceMat, stone]);
      slab.position.set(x, 1.25, z);
      slab.rotation.set(0, (i % 2 ? 1 : -1) * 0.06, (i % 2 ? -1 : 1) * 0.025);
      slab.castShadow = slab.receiveShadow = true;
      scene.add(slab);
      staticBox(physics, x, 1.25, z, 0.85, 1.25, 0.25, 0, 'stone');
      interactives.push({
        kind: 'approach', id: `approach-${i}`, pos: new THREE.Vector3(x, 0, z + 3.2), radius: 4.6,
        title: `${step.n} · ${step.stage}`, accent: '#e8c27a', index: i,
      });
    });
  }

  // 6. Contact tiles you drive onto.
  {
    const meta: Record<string, { label: string; sub: string; glyph: string; color: string; url: string }> = {
      email: { label: 'EMAIL', sub: SITE.links.emailText, glyph: '@', color: '#f2b45a', url: SITE.links.email },
      github: { label: 'GITHUB', sub: 'gangulmissaka', glyph: '</>', color: '#d9d4ca', url: SITE.links.github },
      linkedin: { label: 'LINKEDIN', sub: 'Missaka Hinguralaarachchi', glyph: 'in', color: '#7cb3e8', url: SITE.links.linkedin },
      website: { label: 'WEBSITE', sub: 'gangulmissaka.github.io', glyph: '↗', color: '#8fcf9a', url: SITE.links.website },
    };
    const titleTex = canvasTexture(2048, 256, (ctx) => {
      ctx.fillStyle = INK;
      ctx.font = `800 150px ${FONT_UI}`;
      ctx.textAlign = 'center';
      ctx.fillText('GET IN TOUCH', 1024, 180);
    });
    scene.add(groundDecal(titleTex, 20, 2.5, CONTACT_SPOT.x + 1, CONTACT_SPOT.z - 6, 0, 0.9));
    const slabMat = new THREE.MeshStandardMaterial({ color: 0x2a2a28, roughness: 0.8 });
    CONTACT_TILES.forEach((t) => {
      const m = meta[t.id];
      const top = canvasTexture(512, 512, (ctx) => {
        ctx.fillStyle = '#1d1e20';
        ctx.fillRect(0, 0, 512, 512);
        ctx.strokeStyle = m.color;
        ctx.lineWidth = 10;
        ctx.strokeRect(18, 18, 476, 476);
        ctx.fillStyle = m.color;
        ctx.textAlign = 'center';
        ctx.font = `800 ${m.glyph.length > 1 ? 150 : 200}px ${FONT_UI}`;
        ctx.fillText(m.glyph, 256, 250);
        ctx.fillStyle = INK;
        ctx.font = `800 64px ${FONT_UI}`;
        ctx.fillText(m.label, 256, 370);
        ctx.fillStyle = 'rgba(245,242,236,0.7)';
        ctx.font = `600 ${m.sub.length > 20 ? 26 : 32}px ${FONT_UI}`;
        ctx.fillText(m.sub, 256, 430);
      });
      const topMat = new THREE.MeshStandardMaterial({ map: top, roughness: 0.6, emissive: 0xffffff, emissiveMap: top, emissiveIntensity: 0.18 });
      const tile = new THREE.Mesh(new THREE.BoxGeometry(4.2, 0.16, 4.2), [slabMat, slabMat, topMat, slabMat, slabMat, slabMat]);
      tile.position.set(t.x, 0.08, t.z);
      tile.receiveShadow = true;
      scene.add(tile);
      const ring = groundRing(m.color, 3.2);
      ring.position.set(t.x, 0.06, t.z);
      scene.add(ring);
      interactives.push({
        kind: 'contact', id: t.id, pos: new THREE.Vector3(t.x, 0, t.z), radius: 2.5,
        title: `${m.label.charAt(0)}${m.label.slice(1).toLowerCase()} · ${m.sub}`, accent: m.color,
        action: t.id === 'email' ? 'Send email' : 'Open', url: m.url, ring,
      });
    });
  }

  return { interactives, labels, letters };
}
