// Autopilot: plans a route along the roads (Dijkstra over the sampled road centre lines)
// and drives the car along it with a pure-pursuit steering controller. Used by
// "Take me there" on the map and by the guided tour.
import {
  ABOUT_SPOT, APPROACH_SPOTS, BARRELS, CONTACT_SPOT, CRATE_STACK, DANCER_SPOTS, LANDMARKS, MAST_SPOT, NAME_TITLE,
  PARKED_BIKE, PIN_RACK, POSTS_SPOT, RAMPS, pondEdge,
} from './layout';
import type { RoadPath } from './terrain';

export interface P2 {
  x: number;
  z: number;
}

/** Things the autopilot steers around: (x, z, radius). */
export function obstacles(): [number, number, number][] {
  const list: [number, number, number][] = [];
  for (let x = -13; x <= 13; x += 3.25) list.push([NAME_TITLE.x + x, NAME_TITLE.z, 2.6]); // the name letters
  RAMPS.forEach((r) => list.push([r.x, r.z, r.len * 0.7]));
  list.push([CRATE_STACK.x, CRATE_STACK.z, 4.5], [PIN_RACK.x, PIN_RACK.z, 4]);
  BARRELS.forEach(([x, z]) => list.push([x, z, 1.6]));
  LANDMARKS.forEach((l) => {
    if (l.key === 'pond') return;
    const r = l.key === 'fuelPump' ? 2.6 : l.key === 'chamois' ? 6
      : l.key === 'hunter' || l.key === 'nile' || l.key === 'nimbo' || l.key === 'manim' ? 3.6 : 7.5;
    list.push([l.x, l.z, r]);
  });
  list.push([PARKED_BIKE.x, PARKED_BIKE.z, 2], [MAST_SPOT.x, MAST_SPOT.z, 3]);
  list.push([ABOUT_SPOT.x, ABOUT_SPOT.z, 3], [POSTS_SPOT.x, POSTS_SPOT.z, 3]);
  APPROACH_SPOTS.forEach(([x, z]) => list.push([x, z, 1.4]));
  DANCER_SPOTS.forEach((d) => list.push([d.x, d.z, 1.5]));
  return list;
}

function segmentHits(a: P2, b: P2, obs: [number, number, number][]) {
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const len2 = dx * dx + dz * dz || 1;
  return obs.some(([x, z, r]) => {
    const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (z - a.z) * dz) / len2));
    return Math.hypot(a.x + dx * t - x, a.z + dz * t - z) < r;
  });
}

export function createRoadGraph(paths: RoadPath[]) {
  const obs = obstacles();
  const nodes: P2[] = [];
  const edges: { to: number; w: number }[][] = [];
  const blocked: boolean[] = [];
  const add = (a: number, b: number) => {
    const w = Math.hypot(nodes[a].x - nodes[b].x, nodes[a].z - nodes[b].z) * (blocked[a] || blocked[b] ? 40 : 1);
    edges[a].push({ to: b, w });
    edges[b].push({ to: a, w });
  };
  const roadOf: number[] = [];
  paths.forEach((p, ri) => {
    const step = 3;
    const ids: number[] = [];
    for (let i = 0; i < p.points.length; i += step) {
      const pt = p.points[i];
      ids.push(nodes.length);
      nodes.push({ x: pt.x, z: pt.z });
      edges.push([]);
      roadOf.push(ri);
      blocked.push(obs.some(([x, z, r]) => Math.hypot(pt.x - x, pt.z - z) < r) || pondEdge(pt.x, pt.z) < 1.05);
    }
    if (!p.closed) {
      const last = p.points[p.points.length - 1];
      if (Math.hypot(last.x - nodes[ids[ids.length - 1]].x, last.z - nodes[ids[ids.length - 1]].z) > 0.5) {
        ids.push(nodes.length);
        nodes.push({ x: last.x, z: last.z });
        edges.push([]);
        roadOf.push(ri);
        blocked.push(false);
      }
    }
    for (let i = 1; i < ids.length; i++) add(ids[i - 1], ids[i]);
    if (p.closed) add(ids[ids.length - 1], ids[0]);
  });
  // Junctions: connect nodes of different roads that nearly touch.
  for (let a = 0; a < nodes.length; a++) {
    for (let b = a + 1; b < nodes.length; b++) {
      if (roadOf[a] === roadOf[b]) continue;
      if (Math.hypot(nodes[a].x - nodes[b].x, nodes[a].z - nodes[b].z) < 3.2) add(a, b);
    }
  }

  /** Nearest road node from which a straight line to `p` is clear of obstacles. */
  const access = (p: P2) => {
    let best = -1;
    let bestD = Infinity;
    let any = 0;
    let anyD = Infinity;
    nodes.forEach((n, i) => {
      const d = Math.hypot(n.x - p.x, n.z - p.z) + (blocked[i] ? 30 : 0);
      if (d < anyD) {
        anyD = d;
        any = i;
      }
      if (d < bestD && d < 40 && !segmentHits(n, p, obs)) {
        bestD = d;
        best = i;
      }
    });
    return best >= 0 ? best : any;
  };

  /** Route from `from` to `to`: road nodes in between, ending exactly at `to`. */
  const route = (from: P2, to: P2): P2[] => {
    const s = access(from);
    const t = access(to);
    const dist = new Float64Array(nodes.length).fill(Infinity);
    const prev = new Int32Array(nodes.length).fill(-1);
    const done = new Uint8Array(nodes.length);
    dist[s] = 0;
    for (;;) {
      let u = -1;
      let best = Infinity;
      for (let i = 0; i < nodes.length; i++) {
        if (!done[i] && dist[i] < best) {
          best = dist[i];
          u = i;
        }
      }
      if (u < 0 || u === t) break;
      done[u] = 1;
      for (const e of edges[u]) {
        const nd = dist[u] + e.w;
        if (nd < dist[e.to]) {
          dist[e.to] = nd;
          prev[e.to] = u;
        }
      }
    }
    const out: P2[] = [];
    for (let u = t; u >= 0; u = prev[u]) out.unshift(nodes[u]);
    // Skip road nodes behind the car: start from the first one that's not backwards.
    const pts: P2[] = [{ ...from }, ...out, { ...to }];
    return pts;
  };

  return { route, nodes };
}

const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));

/**
 * Pure-pursuit driver. Call every frame; returns the inputs to feed the car, and whether
 * the destination has been reached.
 */
export function createDriver() {
  let path: P2[] = [];
  let idx = 0;
  let stuckT = 0;
  let reverseT = 0;
  let turning = false;
  let active = false;

  return {
    get active() {
      return active;
    },
    get destination() {
      return path[path.length - 1];
    },
    start(p: P2[]) {
      path = p;
      idx = 0;
      stuckT = 0;
      reverseT = 0;
      turning = false;
      active = true;
    },
    stop() {
      active = false;
    },
    /** Remaining path for drawing on the map. */
    remaining(): P2[] {
      return active ? path.slice(idx) : [];
    },
    step(dt: number, car: { x: number; z: number; heading: number; speed: number }) {
      if (!active) return null;
      // Advance along the path: the closest upcoming point.
      let best = idx;
      let bestD = Infinity;
      for (let i = idx; i < Math.min(path.length, idx + 12); i++) {
        const d = Math.hypot(path[i].x - car.x, path[i].z - car.z);
        if (d < bestD) {
          bestD = d;
          best = i;
        }
      }
      idx = best;
      const end = path[path.length - 1];
      const toEnd = Math.hypot(end.x - car.x, end.z - car.z);
      if (toEnd < 2.2 && idx >= path.length - 3) {
        active = false;
        return { throttle: 0, steer: 0, brake: true, arrived: true };
      }
      // Look-ahead target along the path.
      const v = Math.abs(car.speed);
      const look = 4.5 + v * 0.45;
      let target = end;
      let acc = 0;
      let prevPt: P2 = { x: car.x, z: car.z };
      for (let i = idx; i < path.length; i++) {
        acc += Math.hypot(path[i].x - prevPt.x, path[i].z - prevPt.z);
        prevPt = path[i];
        if (acc >= look) {
          target = path[i];
          break;
        }
      }
      const desired = Math.atan2(-(target.x - car.x), -(target.z - car.z));
      const diff = wrap(desired - car.heading);

      // Unstick: if we've been crawling with the throttle down, back up and turn.
      if (reverseT > 0) {
        reverseT -= dt;
        return { throttle: -1, steer: -Math.sign(diff), brake: false, arrived: false };
      }
      if (v < 0.6 && !turning) stuckT += dt;
      else stuckT = Math.max(0, stuckT - dt * 2);
      if (stuckT > 1.6) {
        stuckT = 0;
        reverseT = 1.1;
      }

      const ad = Math.abs(diff);
      const turnDir = Math.sign(diff) || 1;
      // Facing well away from the target (or circling it): three-point turn. Stop, then
      // back up on opposite lock until the nose points roughly the right way.
      if (ad > 1.5 || (turning && ad > 0.8)) {
        if (!turning && car.speed > 1.2) return { throttle: 0, steer: turnDir, brake: true, arrived: false };
        turning = true;
        if (car.speed > 0.5) return { throttle: 0, steer: -turnDir, brake: true, arrived: false };
        return { throttle: car.speed > -3.2 ? -1 : 0, steer: -turnDir, brake: false, arrived: false };
      }
      turning = false;

      // Slow for sharp turns and for the final approach.
      const turnLimit = 22 - Math.min(1, ad / 1.0) * 18.5;
      const endLimit = 2.5 + toEnd * 0.75;
      const targetSpeed = Math.max(3, Math.min(turnLimit, endLimit));
      const throttle = car.speed < targetSpeed ? 1 : 0;
      const brake = car.speed > targetSpeed + 2;
      const steer = Math.max(-1, Math.min(1, diff * 2.4));
      return { throttle, steer, brake, arrived: false };
    },
  };
}

/** A stop on the guided tour. `target` is resolved against live station positions. */
export interface TourStop {
  key: string;
  title: string;
  text: string;
  at: P2;
}

export const CONTACT_POINT: P2 = { x: CONTACT_SPOT.x, z: CONTACT_SPOT.z - 1 };
