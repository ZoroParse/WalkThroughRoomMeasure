/* ------------------------------------------------------------------ *
 * Pure drawing of the blueprint + traced graph onto the 2D context.
 * ------------------------------------------------------------------ */

import {
  type Project,
  COMPONENT_COLOR,
} from '../state/types.ts';
import { type Viewport } from './traceCanvas.ts';
import { type Vec2, nodeMap } from '../graph/geometryHelpers.ts';

export interface TraceVisualState {
  activeNodeId: string | null;
  hoverEdgeId: string | null;
  /** Rubber-band endpoint (image px) while drawing the next segment. */
  rubberTo: Vec2 | null;
}

export function renderTrace(
  ctx: CanvasRenderingContext2D,
  vp: Viewport,
  image: HTMLImageElement | null,
  p: Project,
  visual: TraceVisualState,
): void {
  // blueprint, slightly dimmed so colored overlay reads clearly
  if (image) {
    ctx.globalAlpha = 0.85;
    const o = vp.toScreen({ x: 0, y: 0 });
    ctx.drawImage(
      image,
      o.x,
      o.y,
      p.imageW * vp.scale,
      p.imageH * vp.scale,
    );
    ctx.globalAlpha = 1;
  }

  const map = nodeMap(p);

  // edges
  for (const e of p.edges) {
    const a = map.get(e.a);
    const b = map.get(e.b);
    if (!a || !b) continue;
    const sa = vp.toScreen(a);
    const sb = vp.toScreen(b);
    const color = COMPONENT_COLOR[e.type];
    const active = e.id === visual.hoverEdgeId;

    ctx.lineCap = 'round';
    // soft halo
    ctx.strokeStyle = color;
    ctx.globalAlpha = active ? 0.35 : 0.2;
    ctx.lineWidth = active ? 14 : 10;
    line(ctx, sa, sb);
    // core
    ctx.globalAlpha = 1;
    ctx.lineWidth = active ? 5 : 3.5;
    line(ctx, sa, sb);
  }

  // rubber-band from active node to finger
  if (visual.activeNodeId && visual.rubberTo) {
    const a = map.get(visual.activeNodeId);
    if (a) {
      const sa = vp.toScreen(a);
      const sb = vp.toScreen(visual.rubberTo);
      ctx.strokeStyle = '#38bdf8';
      ctx.globalAlpha = 0.6;
      ctx.setLineDash([6, 6]);
      ctx.lineWidth = 2.5;
      line(ctx, sa, sb);
      ctx.setLineDash([]);
      ctx.globalAlpha = 1;
    }
  }

  // nodes
  for (const n of p.nodes) {
    const s = vp.toScreen(n);
    const isActive = n.id === visual.activeNodeId;
    ctx.beginPath();
    ctx.arc(s.x, s.y, isActive ? 7 : 5, 0, Math.PI * 2);
    ctx.fillStyle = isActive ? '#38bdf8' : '#e8eef4';
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#0b1017';
    ctx.stroke();
  }
}

function line(ctx: CanvasRenderingContext2D, a: Vec2, b: Vec2): void {
  ctx.beginPath();
  ctx.moveTo(a.x, a.y);
  ctx.lineTo(b.x, b.y);
  ctx.stroke();
}
