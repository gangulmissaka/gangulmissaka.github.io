// Single source of truth for where everything lives in the world.
// Units are metres. -Z is "north" (up on the minimap), +X is east.
//
// Zones (south → north):
//   Contact tiles (south end)  ·  notice board  ·  SPAWN + name title + controls
//   About board (east of spawn) · "How I Build" stones along the west cross road
//   Playground (ramps, crates, pins) in the middle · skills + sculpture garden (north)
//   Project houses in the four corners

export type V2 = [number, number];

/** Half-size of the drivable square. The forest ring starts just outside it. */
export const PLAY_HALF = 84;
/** Camera is never allowed past this (keeps the view inside the forest ring). */
export const CAMERA_HALF = 78;
/** Edge length of one forest tile once scaled into the world. */
export const FOREST_TILE = 86;

export const SPAWN = { x: -1.5, z: 23, heading: 0 }; // heading 0 = facing north (-Z)

// ── Roads (Catmull-Rom control points, x/z) ─────────────────────────────
export interface RoadDef {
  id: string;
  width: number;
  closed?: boolean;
  points: V2[];
}

export const ROADS: RoadDef[] = [
  {
    id: 'loop',
    width: 6.5,
    closed: true,
    points: [
      [-44, -36], [-18, -44], [16, -45], [44, -36], [52, -6],
      [46, 30], [18, 40], [-16, 41], [-46, 30], [-53, -2],
    ],
  },
  {
    id: 'spine',
    width: 6,
    points: [[0, 72], [3, 56], [0, 41], [-3, 26], [0, 10], [2, -10], [0, -30], [-2, -45], [0, -58]],
  },
  { id: 'west-house', width: 4.6, points: [[-44, -36], [-50, -44], [-54, -52]] },
  { id: 'east-house', width: 4.6, points: [[44, -36], [51, -43], [55, -50]] },
  { id: 'slum', width: 4.6, points: [[-46, 30], [-52, 40], [-55, 47]] },
  { id: 'pond', width: 4.6, points: [[46, 30], [52, 38], [56, 44]] },
  { id: 'cross', width: 5, points: [[-53, -2], [-30, 4], [-8, 2], [0, 10]] },
  // Short spurs to the two sculpture projects on the west and east edges of the valley.
  { id: 'nimbo', width: 4.6, points: [[-53, -2], [-57, -2.2], [-60, -2]] },
  { id: 'manim', width: 4.6, points: [[52, -6], [56, -6.2], [60, -6]] },
];

// ── Landmarks (GLB models) ─────────────────────────────────────────────
export type LandmarkKey =
  | 'house' | 'stiltHouse' | 'slumHouse' | 'pond'
  | 'hunter' | 'nile' | 'chamois' | 'fuelPump'
  | 'nimbo' | 'manim'; // the last two are sculptures built in code (world/sculptures.ts)

export interface LandmarkDef {
  key: LandmarkKey;
  x: number;
  z: number;
  /** Rotation around Y in radians (model front is +Z before rotation). */
  rotY: number;
}

export const LANDMARKS: LandmarkDef[] = [
  { key: 'house', x: -58, z: -60, rotY: Math.PI * 0.2 },
  { key: 'stiltHouse', x: 60, z: -59, rotY: -Math.PI * 0.22 },
  { key: 'slumHouse', x: -60, z: 56, rotY: Math.PI * 0.78 },
  { key: 'pond', x: 62, z: 57, rotY: 0 }, // hand-made pond (see world/pond.ts), not a GLB
  { key: 'hunter', x: -16, z: -64, rotY: Math.PI * 0.08 },
  { key: 'nile', x: 17, z: -64, rotY: -Math.PI * 0.08 },
  { key: 'chamois', x: 0, z: -72, rotY: 0 },
  { key: 'fuelPump', x: 7, z: 27, rotY: -Math.PI / 2 },
  { key: 'nimbo', x: -70, z: -2, rotY: Math.PI / 2 }, // faces east, down the cross road
  { key: 'manim', x: 70, z: -6, rotY: -Math.PI / 2 }, // faces west
];

/** Landmarks built in code rather than loaded from a GLB. */
export const CODE_LANDMARKS: LandmarkKey[] = ['pond', 'nimbo', 'manim'];

// ── The pond (built in code, world/pond.ts) ───────────────────────────
export const POND = { x: 62, z: 57, r: 10 };
/** Shoreline radius (m) for a direction angle = atan2(dz, dx) from the pond centre. */
export function pondRadiusAt(angle: number) {
  return POND.r * (1 + 0.15 * Math.sin(3 * angle + 0.7) + 0.08 * Math.sin(5 * angle + 2.1) + 0.05 * Math.sin(2 * angle + 4));
}
/** 0 at the pond centre, 1 on the shoreline, > 1 outside. */
export function pondEdge(x: number, z: number) {
  const dx = x - POND.x;
  const dz = z - POND.z;
  return Math.hypot(dx, dz) / pondRadiusAt(Math.atan2(dz, dx));
}

// ── Intro zone ─────────────────────────────────────────────────────────
/** The owner's name as physical 3D letters, read from the spawn point. */
export const NAME_TITLE = { x: 0, z: 9, size: 1.65 };
export const SUBTITLE_DECAL = { x: 0, z: 13.2, w: 24, h: 3.2 };
export const CONTROLS_DECAL = { x: -13, z: 23, w: 10, h: 7.5 };

// ── Interactive spots ─────────────────────────────────────────────────
/** Where each project's interaction ring sits (in front of its landmark). */
export const PROJECT_SPOTS: { landmark: LandmarkKey; x: number; z: number; /** Label over this point instead of the ring. */ label?: [number, number, number] }[] = [
  { landmark: 'house', x: -47, z: -47 },
  { landmark: 'stiltHouse', x: 49, z: -46 },
  { landmark: 'slumHouse', x: -49, z: 44 },
  { landmark: 'pond', x: 49, z: 41 },
  { landmark: 'nimbo', x: -60.5, z: -2, label: [-63, 4.8, -9.5] },
  { landmark: 'manim', x: 60.5, z: -6, label: [63, 4.8, 1.5] },
];

/** The old motorbike, parked on its kickstand beside the fuel pump. */
export const PARKED_BIKE = { x: 10.2, z: 24.5, rotY: -0.5 };

/**
 * Skill showcases: each skill group is presented by one of the 3D models. Drive into the
 * ring in front of it and press E. Order matches SKILL_GROUPS in portfolioData.ts.
 */
export const SKILL_SHOWCASES: {
  model: 'hunter' | 'nile' | 'chamois' | 'bike';
  name: string;
  why: string;
  ring: V2;
}[] = [
  { model: 'hunter', name: 'The Hunter', why: 'Precision and craft — aim carefully, build it right.', ring: [-14.5, -55] },
  { model: 'nile', name: 'The Nile', why: 'Data flows like a river: structured, governed, endless.', ring: [15.5, -55] },
  { model: 'chamois', name: 'The Chamois', why: 'The sentinel on the rocks — always watching the perimeter.', ring: [0, -61.5] },
  { model: 'bike', name: 'The Old Motorbike', why: 'Drive, planning and teamwork keep every project moving.', ring: [12.5, 19.5] },
];

/** About-me billboard (with photo) and the ring in front of it. */
export const ABOUT_SPOT = { x: 18, z: 7, rotY: -0.55, ringX: 14.5, ringZ: 12.5 };
/** Notice board with LinkedIn posts. */
export const POSTS_SPOT = { x: -18, z: 31, rotY: 0.6, ringX: -14.5, ringZ: 35 };
/** "How I Build" standing stones along the west cross road, in reading order. */
export const APPROACH_SPOTS: V2[] = [[-13, -2.6], [-23, -1.4], [-33, -0.6], [-43, -3.4]];

/** Contact: tiles you drive onto at the south end of the spine road. */
export const CONTACT_SPOT = { x: 0, z: 62 };
export const CONTACT_TILES: { id: 'email' | 'github' | 'linkedin' | 'website'; x: number; z: number }[] = [
  { id: 'email', x: -10.5, z: 63 },
  { id: 'github', x: -4.5, z: 64.5 },
  { id: 'linkedin', x: 6.5, z: 64.5 },
  { id: 'website', x: 12.5, z: 63 },
];
export const MAST_SPOT = { x: 16, z: 70 };

/**
 * Dancers (world/dancers.ts): they dance whenever the radio plays. Each faces `look` (x, z).
 * Kept clear of roads, rings and props.
 */
export const DANCER_SPOTS: { x: number; z: number; look: V2 }[] = [
  { x: 20, z: 31, look: [4, 34] }, // start, beside the fuel pump
  { x: -26, z: 29, look: [-16, 36] }, // by the notice board
  { x: 24, z: 60, look: [6, 60] }, // contact zone, near the radio mast
  { x: 50, z: 66, look: [44, 56] }, // pond shore
  { x: -28, z: -56, look: [-18, -52] }, // statue garden, west
  { x: 30, z: -56, look: [20, -52] }, // statue garden, east
];

// ── Physics playground ──────────────────────────────────────────────
export const RAMPS: { x: number; z: number; rotY: number; w: number; len: number; h: number }[] = [
  { x: 0, z: -18, rotY: 0, w: 6, len: 11, h: 3.4 },
  { x: -32, z: 16, rotY: Math.PI / 2, w: 5.5, len: 9, h: 2.6 },
  { x: 33, z: 12, rotY: -Math.PI / 2, w: 5.5, len: 9, h: 2.6 },
];
export const STUNT_RING = { x: 0, y: 7.2, z: -30 };
export const CRATE_STACK = { x: -24, z: -18 };
export const PIN_RACK = { x: 24, z: 24 };
export const BARRELS: V2[] = [[-12, -30], [12, -30], [-40, 18], [40, 4], [-36, 48], [-30, 52]];

export const COLLECTIBLES: [number, number, number][] = [
  [0, 7.2, -30], // inside the stunt ring
  [-32, 4.2, 16], // above the west ramp
  [33, 4.2, 12],
  [-72, 1.4, -22],
  [72, 1.4, 16],
  [0, 1.4, -57],
  [-24, 1.4, 62],
  [30, 1.4, 64],
];

/** Circles the grass scatterer and other clutter must avoid (x, z, radius). */
export const CLEAR_ZONES: [number, number, number][] = [
  ...LANDMARKS.map((l): [number, number, number] => {
    const r = l.key === 'pond' ? 13.5 : l.key === 'chamois' ? 9 : l.key === 'fuelPump' ? 3 : l.key === 'nimbo' || l.key === 'manim' ? 5.5 : 8;
    return [l.x, l.z, r];
  }),
  [-9, NAME_TITLE.z + 2, 6], [0, NAME_TITLE.z + 2, 6], [9, NAME_TITLE.z + 2, 6],
  [CONTROLS_DECAL.x, CONTROLS_DECAL.z, 6.5],
  [ABOUT_SPOT.x, ABOUT_SPOT.z, 6], [ABOUT_SPOT.ringX, ABOUT_SPOT.ringZ, 5],
  [POSTS_SPOT.x, POSTS_SPOT.z, 5], [POSTS_SPOT.ringX, POSTS_SPOT.ringZ, 5],
  ...APPROACH_SPOTS.map(([x, z]): [number, number, number] => [x, z, 3]),
  [CONTACT_SPOT.x, CONTACT_SPOT.z + 2, 15],
  ...SKILL_SHOWCASES.map((s): [number, number, number] => [s.ring[0], s.ring[1], 3.5]),
  [PARKED_BIKE.x, PARKED_BIKE.z, 2.5],
  [MAST_SPOT.x, MAST_SPOT.z, 3],
  [CRATE_STACK.x, CRATE_STACK.z, 7],
  [PIN_RACK.x, PIN_RACK.z, 6],
  [SPAWN.x, SPAWN.z, 7],
  ...RAMPS.map((r): [number, number, number] => [r.x, r.z, 8]),
  ...DANCER_SPOTS.map((d): [number, number, number] => [d.x, d.z, 1.8]),
];
