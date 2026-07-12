/* ------------------------------------------------------------------ *
 * Single source of truth for image-pixel -> 3D-world mapping.
 *
 *   world.x = (imgX - cx) * S
 *   world.z = (imgY - cy) * S      (image Y maps to world Z; Y is up)
 *
 * Before calibration S is a preview scale chosen so the room fits a few
 * world units. After calibration S = metresPerPixel, so 1 world unit = 1 m
 * and the model is at true scale.
 * ------------------------------------------------------------------ */

import * as THREE from 'three';
import { type Project } from '../state/types.ts';
import { type Vec2 } from '../graph/geometryHelpers.ts';

export class Coords {
  readonly cx: number;
  readonly cy: number;
  readonly s: number; // world units per image pixel

  constructor(p: Project) {
    this.cx = p.imageW / 2;
    this.cy = p.imageH / 2;

    if (p.cmPerPixel && p.cmPerPixel > 0) {
      // calibrated: 1 world unit = 1 metre
      this.s = p.cmPerPixel / 100;
    } else {
      // preview: fit the larger image dimension to ~6 world units
      const span = Math.max(p.imageW, p.imageH) || 1;
      this.s = 6 / span;
    }
  }

  /** Floor-plane world position for an image-pixel point (y = 0). */
  toWorld(pt: Vec2, y = 0): THREE.Vector3 {
    return new THREE.Vector3(
      (pt.x - this.cx) * this.s,
      y,
      (pt.y - this.cy) * this.s,
    );
  }
}
