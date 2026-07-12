/* ------------------------------------------------------------------ *
 * Derive the ordered list of measurable sections from the traced graph.
 * One section per edge. Ordering aims to feel like a natural walk:
 *   1. walls, traversed around the room loop
 *   2. openings (doors / windows), grouped near the wall they sit on
 *   3. furniture, grouped per piece (loopId)
 * ------------------------------------------------------------------ */

import { type Project, type Section, type Edge } from '../state/types.ts';
import { nodeMap, findWallLoop } from './geometryHelpers.ts';

/**
 * Edges whose endpoints both still exist in the node map. A graph swap
 * mid-chain (e.g. auto-detect while the pen has an active node) can leave an
 * edge referencing a deleted node; skipping such danglers keeps everything
 * downstream — section geometry, allMeasured, measuredCount — consistent so a
 * stray edge never makes the walk impossible to finish.
 */
function liveEdges(p: Project): Edge[] {
  const map = nodeMap(p);
  return p.edges.filter((e) => map.has(e.a) && map.has(e.b));
}

export function deriveSections(p: Project): Section[] {
  const map = nodeMap(p);
  const edges = liveEdges(p);
  const ordered: Edge[] = [];
  const taken = new Set<string>();

  const take = (e: Edge) => {
    if (taken.has(e.id)) return;
    taken.add(e.id);
    ordered.push(e);
  };

  // 1. Walls around the loop (in loop order if we can find one).
  const loop = findWallLoop(p);
  if (loop) {
    for (let i = 0; i < loop.length; i++) {
      const a = loop[i];
      const b = loop[(i + 1) % loop.length];
      const e = edges.find(
        (e) =>
          e.type === 'wall' &&
          ((e.a === a && e.b === b) || (e.a === b && e.b === a)),
      );
      if (e) take(e);
    }
  }
  // any remaining walls
  for (const e of edges) if (e.type === 'wall') take(e);

  // 2. Openings — doors then windows.
  for (const e of edges) if (e.type === 'door') take(e);
  for (const e of edges) if (e.type === 'window') take(e);

  // 3. Furniture grouped by loopId.
  const furnitureKeys: string[] = [];
  for (const e of edges) {
    if (e.type !== 'furniture') continue;
    const key = e.loopId ?? e.id;
    if (!furnitureKeys.includes(key)) furnitureKeys.push(key);
  }
  for (const key of furnitureKeys) {
    for (const e of edges) {
      if (e.type === 'furniture' && (e.loopId ?? e.id) === key) take(e);
    }
  }

  // anything left (defensive)
  for (const e of edges) take(e);

  return ordered.map((e, i) => {
    const a = map.get(e.a)!;
    const b = map.get(e.b)!;
    return {
      edgeId: e.id,
      type: e.type,
      order: i,
      ax: a.x,
      ay: a.y,
      bx: b.x,
      by: b.y,
      measuredCm: p.measurements[e.id] ?? null,
    } satisfies Section;
  });
}

/** True when every derived section has a measurement. */
export function allMeasured(p: Project): boolean {
  const edges = liveEdges(p);
  if (edges.length === 0) return false;
  return edges.every((e) => typeof p.measurements[e.id] === 'number');
}

export function measuredCount(p: Project): number {
  return liveEdges(p).filter((e) => typeof p.measurements[e.id] === 'number')
    .length;
}
