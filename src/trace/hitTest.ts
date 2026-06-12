/* ------------------------------------------------------------------ *
 * Picking helpers, all in image-pixel space. Callers pass a pixel
 * tolerance already scaled for the current zoom so finger taps hit.
 * ------------------------------------------------------------------ */

import { type Project, type Node, type Edge } from '../state/types.ts';
import {
  type Vec2,
  dist,
  pointSegmentDistance,
  nodeMap,
} from '../graph/geometryHelpers.ts';

export function nearestNode(
  p: Project,
  pt: Vec2,
  tolerancePx: number,
): Node | null {
  let best: Node | null = null;
  let bestD = tolerancePx;
  for (const n of p.nodes) {
    const d = dist(pt, n);
    if (d <= bestD) {
      bestD = d;
      best = n;
    }
  }
  return best;
}

export function nearestEdge(
  p: Project,
  pt: Vec2,
  tolerancePx: number,
): Edge | null {
  const map = nodeMap(p);
  let best: Edge | null = null;
  let bestD = tolerancePx;
  for (const e of p.edges) {
    const a = map.get(e.a);
    const b = map.get(e.b);
    if (!a || !b) continue;
    const d = pointSegmentDistance(pt, a, b);
    if (d <= bestD) {
      bestD = d;
      best = e;
    }
  }
  return best;
}
