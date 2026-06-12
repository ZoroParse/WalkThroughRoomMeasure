/* ------------------------------------------------------------------ *
 * Turn the entered centimetre measurements into a single global scale so
 * the 3D model can be rebuilt at true size.
 *
 * Per-edge px->cm ratios disagree slightly (the trace is over-constrained),
 * so we use the length-weighted mean
 *     R = Σ(cm) / Σ(px)
 * which is the least-squares fit through the origin of cm-vs-px — longer
 * walls dominate appropriately. Node positions are unchanged, so the
 * traced SHAPE is preserved; only absolute scale is corrected.
 * ------------------------------------------------------------------ */

import { type Project } from '../state/types.ts';
import { nodeMap, dist } from '../graph/geometryHelpers.ts';

export interface Calibration {
  cmPerPixel: number;
  /** Estimated true room bounding-box size in metres, for display. */
  widthM: number;
  depthM: number;
}

export function computeCalibration(p: Project): Calibration | null {
  const map = nodeMap(p);
  let sumCm = 0;
  let sumPx = 0;
  for (const e of p.edges) {
    const cm = p.measurements[e.id];
    const a = map.get(e.a);
    const b = map.get(e.b);
    if (typeof cm !== 'number' || !a || !b) continue;
    const px = dist(a, b);
    if (px <= 0) continue;
    sumCm += cm;
    sumPx += px;
  }
  if (sumPx <= 0 || sumCm <= 0) return null;

  const cmPerPixel = sumCm / sumPx;

  // bounding box of all nodes -> real-world size estimate
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const n of p.nodes) {
    minX = Math.min(minX, n.x);
    minY = Math.min(minY, n.y);
    maxX = Math.max(maxX, n.x);
    maxY = Math.max(maxY, n.y);
  }
  const widthM = ((maxX - minX) * cmPerPixel) / 100;
  const depthM = ((maxY - minY) * cmPerPixel) / 100;

  return { cmPerPixel, widthM, depthM };
}
