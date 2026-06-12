/* ------------------------------------------------------------------ *
 * Composite the entered measurements onto a copy of the blueprint and
 * return it as a PNG blob, plus a structured JSON of the measurements.
 * ------------------------------------------------------------------ */

import { type Project, COMPONENT_COLOR } from '../state/types.ts';
import { nodeMap } from '../graph/geometryHelpers.ts';
import { deriveSections } from '../graph/sections.ts';

export async function buildAnnotatedBlueprint(p: Project): Promise<Blob> {
  const canvas = document.createElement('canvas');
  canvas.width = p.imageW;
  canvas.height = p.imageH;
  const ctx = canvas.getContext('2d')!;

  // base image
  if (p.imageDataUrl) {
    const img = await loadImage(p.imageDataUrl);
    ctx.drawImage(img, 0, 0, p.imageW, p.imageH);
  } else {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, p.imageW, p.imageH);
  }

  const map = nodeMap(p);
  const fontPx = Math.max(14, Math.round(Math.min(p.imageW, p.imageH) / 40));
  ctx.font = `600 ${fontPx}px system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';

  for (const e of p.edges) {
    const cm = p.measurements[e.id];
    if (typeof cm !== 'number') continue;
    const a = map.get(e.a);
    const b = map.get(e.b);
    if (!a || !b) continue;
    const mx = (a.x + b.x) / 2;
    const my = (a.y + b.y) / 2;
    const label = `${cm} cm`;
    const color = COMPONENT_COLOR[e.type];

    // colored segment underlay
    ctx.strokeStyle = color;
    ctx.globalAlpha = 0.85;
    ctx.lineWidth = Math.max(3, fontPx / 5);
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
    ctx.globalAlpha = 1;

    // label chip
    const padX = fontPx * 0.45;
    const w = ctx.measureText(label).width + padX * 2;
    const h = fontPx * 1.5;
    roundRect(ctx, mx - w / 2, my - h / 2, w, h, h / 4);
    ctx.fillStyle = 'rgba(15,23,34,0.92)';
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = color;
    ctx.stroke();
    ctx.fillStyle = '#ffffff';
    ctx.fillText(label, mx, my + 1);
  }

  return await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('toBlob failed'))),
      'image/png',
    ),
  );
}

export function buildMeasurementsJson(p: Project): Blob {
  const sections = deriveSections(p).map((s) => ({
    order: s.order + 1,
    type: s.type,
    measuredCm: s.measuredCm,
  }));
  const payload = {
    exportedAt: new Date().toISOString(),
    imageWidth: p.imageW,
    imageHeight: p.imageH,
    cmPerPixel: p.cmPerPixel,
    sectionCount: sections.length,
    sections,
  };
  return new Blob([JSON.stringify(payload, null, 2)], {
    type: 'application/json',
  });
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}
