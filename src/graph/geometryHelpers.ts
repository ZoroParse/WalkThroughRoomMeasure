/* ------------------------------------------------------------------ *
 * 2D vector math in image-pixel space, plus room-polygon helpers used
 * by both the 3D builder and the walkthrough camera/arrow placement.
 * ------------------------------------------------------------------ */

import { type Project, type Node, type Edge } from '../state/types.ts';

export interface Vec2 {
  x: number;
  y: number;
}

export const sub = (a: Vec2, b: Vec2): Vec2 => ({ x: a.x - b.x, y: a.y - b.y });
export const add = (a: Vec2, b: Vec2): Vec2 => ({ x: a.x + b.x, y: a.y + b.y });
export const scale = (a: Vec2, s: number): Vec2 => ({ x: a.x * s, y: a.y * s });
export const dot = (a: Vec2, b: Vec2): number => a.x * b.x + a.y * b.y;
export const len = (a: Vec2): number => Math.hypot(a.x, a.y);
export const dist = (a: Vec2, b: Vec2): number => Math.hypot(a.x - b.x, a.y - b.y);

export function normalize(a: Vec2): Vec2 {
  const l = len(a) || 1;
  return { x: a.x / l, y: a.y / l };
}

export function mid(a: Vec2, b: Vec2): Vec2 {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

/** Perpendicular (rotate 90°). */
export function perp(a: Vec2): Vec2 {
  return { x: -a.y, y: a.x };
}

export function nodeMap(p: Project): Map<string, Node> {
  return new Map(p.nodes.map((n) => [n.id, n]));
}

/** Distance from point pt to segment a-b, in pixels. */
export function pointSegmentDistance(pt: Vec2, a: Vec2, b: Vec2): number {
  const ab = sub(b, a);
  const t = clamp01(dot(sub(pt, a), ab) / (dot(ab, ab) || 1));
  const proj = add(a, scale(ab, t));
  return dist(pt, proj);
}

export const clamp01 = (t: number): number => Math.max(0, Math.min(1, t));

/** Signed area of a polygon (positive = counter-clockwise in image space). */
export function signedArea(poly: Vec2[]): number {
  let a = 0;
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i];
    const q = poly[(i + 1) % poly.length];
    a += p.x * q.y - q.x * p.y;
  }
  return a / 2;
}

export function centroid(poly: Vec2[]): Vec2 {
  if (poly.length === 0) return { x: 0, y: 0 };
  let cx = 0;
  let cy = 0;
  for (const p of poly) {
    cx += p.x;
    cy += p.y;
  }
  return { x: cx / poly.length, y: cy / poly.length };
}

/**
 * Find the wall-loop polygon: the largest cycle made of `wall` (and the
 * door/window openings that sit on walls) edges. We build adjacency over
 * wall-ish edges and walk the longest simple cycle from an arbitrary
 * start. For typical hand-traced rooms this is the room outline.
 *
 * Returns ordered node ids around the loop, or null if no closed loop.
 */
export function findWallLoop(p: Project): string[] | null {
  const wallEdges = p.edges.filter(
    (e) => e.type === 'wall' || e.type === 'door' || e.type === 'window',
  );
  if (wallEdges.length < 3) return null;

  const adj = new Map<string, Set<string>>();
  const link = (a: string, b: string) => {
    if (!adj.has(a)) adj.set(a, new Set());
    adj.get(a)!.add(b);
  };
  for (const e of wallEdges) {
    link(e.a, e.b);
    link(e.b, e.a);
  }

  // A clean room loop has every node at degree 2. Walk from any node.
  const start = wallEdges[0].a;
  const loop: string[] = [start];
  let prev = '';
  let cur = start;

  for (let guard = 0; guard < wallEdges.length + 2; guard++) {
    const neighbors = [...(adj.get(cur) ?? [])].filter((n) => n !== prev);
    if (neighbors.length === 0) return null; // dead end
    const next = neighbors[0];
    if (next === start) {
      return loop; // closed the loop
    }
    if (loop.includes(next)) return loop.slice(0, loop.indexOf(next));
    loop.push(next);
    prev = cur;
    cur = next;
  }
  return null;
}

export function loopPolygon(p: Project, loop: string[]): Vec2[] {
  const map = nodeMap(p);
  return loop
    .map((id) => map.get(id))
    .filter((n): n is Node => !!n)
    .map((n) => ({ x: n.x, y: n.y }));
}

/** Group edges of a furniture loop by their loopId. */
export function furnitureLoops(p: Project): Map<string, Edge[]> {
  const groups = new Map<string, Edge[]>();
  for (const e of p.edges) {
    if (e.type !== 'furniture') continue;
    const key = e.loopId ?? e.id;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(e);
  }
  return groups;
}
