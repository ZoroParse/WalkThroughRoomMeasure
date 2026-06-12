/* ------------------------------------------------------------------ *
 * Load a blueprint image from a file picker (or the bundled sample),
 * downscale if very large so it fits the localStorage quota, and hand a
 * data URL + natural dimensions to the store.
 * ------------------------------------------------------------------ */

import { store } from '../state/store.ts';
import { toast } from '../util/dom.ts';

const MAX_DIM = 2000; // cap persisted image so the data URL stays small

export async function loadBlueprintFromFile(file: File): Promise<void> {
  if (!file.type.startsWith('image/')) {
    toast('Please choose an image file.');
    return;
  }
  const url = URL.createObjectURL(file);
  try {
    await loadBlueprintFromUrl(url);
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function loadBlueprintFromUrl(url: string): Promise<void> {
  const img = await loadImage(url);
  const { dataUrl, w, h } = toPersistableDataUrl(img);
  store.setImage(dataUrl, w, h);
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Could not load image'));
    img.src = src;
  });
}

function toPersistableDataUrl(img: HTMLImageElement): {
  dataUrl: string;
  w: number;
  h: number;
} {
  const nw = img.naturalWidth;
  const nh = img.naturalHeight;
  const s = Math.min(1, MAX_DIM / Math.max(nw, nh));
  const w = Math.round(nw * s);
  const h = Math.round(nh * s);

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(img, 0, 0, w, h);
  // PNG keeps crisp blueprint lines; fall back gracefully.
  const dataUrl = canvas.toDataURL('image/png');
  return { dataUrl, w, h };
}
