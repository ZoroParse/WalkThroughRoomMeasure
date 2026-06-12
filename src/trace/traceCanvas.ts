/* ------------------------------------------------------------------ *
 * The 2D tracing surface. Owns the canvas, a pan/zoom viewport that maps
 * between screen pixels and image pixels, and a render pass that draws
 * the blueprint plus the traced graph. Interaction lives in
 * traceController; drawing lives in traceRender.
 * ------------------------------------------------------------------ */

import { store } from '../state/store.ts';
import { type Vec2 } from '../graph/geometryHelpers.ts';
import { renderTrace, type TraceVisualState } from './traceRender.ts';

export class Viewport {
  scale = 1; // image px -> screen px
  tx = 0; // screen px offset
  ty = 0;

  toScreen(p: Vec2): Vec2 {
    return { x: p.x * this.scale + this.tx, y: p.y * this.scale + this.ty };
  }
  toImage(p: Vec2): Vec2 {
    return { x: (p.x - this.tx) / this.scale, y: (p.y - this.ty) / this.scale };
  }
}

export class TraceCanvas {
  readonly canvas: HTMLCanvasElement;
  readonly ctx: CanvasRenderingContext2D;
  readonly viewport = new Viewport();
  private image: HTMLImageElement | null = null;
  private dpr = Math.min(window.devicePixelRatio || 1, 2);
  visual: TraceVisualState = { activeNodeId: null, hoverEdgeId: null, rubberTo: null };

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d')!;
  }

  async setImageFromState(): Promise<void> {
    const { imageDataUrl } = store.state;
    if (!imageDataUrl) {
      this.image = null;
      return;
    }
    this.image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = imageDataUrl;
    });
  }

  resize(): void {
    const rect = this.canvas.getBoundingClientRect();
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.width = Math.round(rect.width * this.dpr);
    this.canvas.height = Math.round(rect.height * this.dpr);
  }

  /** Fit the blueprint into the canvas with a small margin. */
  fit(): void {
    const { imageW, imageH } = store.state;
    if (!imageW || !imageH) return;
    const cw = this.canvas.width / this.dpr;
    const ch = this.canvas.height / this.dpr;
    const margin = 0.92;
    const s = Math.min(cw / imageW, ch / imageH) * margin;
    this.viewport.scale = s;
    this.viewport.tx = (cw - imageW * s) / 2;
    this.viewport.ty = (ch - imageH * s) / 2;
  }

  /** Current pixel tolerance for finger-sized hit testing, in image px. */
  hitTolerance(screenPx = 22): number {
    return screenPx / this.viewport.scale;
  }

  render(): void {
    const { ctx, dpr } = this;
    ctx.save();
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    renderTrace(ctx, this.viewport, this.image, store.state, this.visual);
    ctx.restore();
  }
}
