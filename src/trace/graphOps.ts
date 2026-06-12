/* ------------------------------------------------------------------ *
 * Higher-level graph operations and validation used by the tracer.
 * ------------------------------------------------------------------ */

import { type Project } from '../state/types.ts';
import { dist, findWallLoop } from '../graph/geometryHelpers.ts';

export interface Validation {
  ok: boolean;
  warnings: string[];
}

/** Gate for leaving the trace phase. Minimal but meaningful. */
export function validateGraph(p: Project): Validation {
  const warnings: string[] = [];

  if (p.edges.length === 0) {
    warnings.push('Trace at least one section to continue.');
    return { ok: false, warnings };
  }

  // zero-length edges
  const map = new Map(p.nodes.map((n) => [n.id, n]));
  for (const e of p.edges) {
    const a = map.get(e.a);
    const b = map.get(e.b);
    if (a && b && dist(a, b) < 1) {
      warnings.push('Some sections have zero length — remove or fix them.');
      break;
    }
  }

  // a closed wall loop is recommended but not strictly required
  const hasWalls = p.edges.some((e) => e.type === 'wall');
  if (!hasWalls) {
    warnings.push('Tip: trace the room walls so the 3D model has a shell.');
  } else if (!findWallLoop(p)) {
    warnings.push(
      'Tip: close the wall loop (connect the last wall back to the first) for a complete room.',
    );
  }

  // ok as long as there is at least one usable section
  const ok = p.edges.length > 0;
  return { ok, warnings };
}
