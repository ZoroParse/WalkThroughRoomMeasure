/* ------------------------------------------------------------------ *
 * Drives the guided walk: orders the sections, flies the camera to face
 * each one from inside the room, and positions the translucent arrow
 * over the segment being measured.
 * ------------------------------------------------------------------ */

import * as THREE from 'three';
import { type Project, type Section, COMPONENT_COLOR } from '../state/types.ts';
import { SceneManager } from '../three/sceneManager.ts';
import { buildScene } from '../three/buildScene.ts';
import { Coords } from '../three/coords.ts';
import { ArrowOverlay } from '../three/arrowOverlay.ts';
import { CameraAnimator, type CameraPose } from './cameraAnimator.ts';
import { deriveSections } from '../graph/sections.ts';
import {
  centroid as centroid2d,
  loopPolygon,
  findWallLoop,
  type Vec2,
} from '../graph/geometryHelpers.ts';

const EYE_H = 1.55;
const LOOK_H = 1.1;

export class WalkthroughEngine {
  private scene: SceneManager;
  private arrow = new ArrowOverlay();
  private animator: CameraAnimator;
  private coords: Coords;
  private center: THREE.Vector3;
  private roomRadius = 4;
  sections: Section[] = [];
  index = 0;
  onChange: ((s: Section, i: number, total: number) => void) | null = null;

  constructor(scene: SceneManager) {
    this.scene = scene;
    this.coords = new Coords({ imageW: 1, imageH: 1 } as Project);
    this.center = new THREE.Vector3();
    this.animator = new CameraAnimator(scene.camera, {
      position: new THREE.Vector3(0, EYE_H, 3),
      target: new THREE.Vector3(0, LOOK_H, 0),
    });
  }

  /** Build the 3D room for the current project and prepare the walk. */
  setup(p: Project): void {
    const built = buildScene(p);
    this.coords = built.coords;
    built.group.add(this.arrow.mesh);
    this.scene.setRoom(built.group);

    this.center = roomCenterWorld(p, this.coords);
    this.roomRadius = roomRadiusWorld(p, this.coords, this.center);
    // scale the fog to the room so large calibrated rooms don't fog out
    this.scene.setEnvironmentScale(this.roomRadius * 2);
    this.sections = deriveSections(p);
    this.index = 0;

    this.scene.start((dt) => this.arrow.tick(dt));
    if (this.sections.length > 0) this.goTo(0, false);
  }

  goTo(i: number, animate = true): void {
    if (i < 0 || i >= this.sections.length) return;
    this.index = i;
    const s = this.sections[i];
    const a = this.coords.toWorld({ x: s.ax, y: s.ay });
    const b = this.coords.toWorld({ x: s.bx, y: s.by });

    const midV: Vec2 = { x: (s.ax + s.bx) / 2, y: (s.ay + s.by) / 2 };
    const mid = this.coords.toWorld(midV);
    const inward = this.center.clone().sub(mid).setY(0);
    const inwardLen = inward.length();
    if (inwardLen < 1e-4) inward.set(0, 0, 1);
    inward.normalize();

    // upright span marker standing just in front of the segment
    this.arrow.update(a, b, inward, COMPONENT_COLOR[s.type]);

    // Elevated 3/4 vantage: pull back across the room (and beyond the far
    // wall) and rise up, looking down at the highlighted segment. This keeps
    // the whole room in frame so it's obvious *which* wall is being measured,
    // rather than a flat first-person view that just fills with one wall.
    const back = 2 * inwardLen + this.roomRadius * 0.9 + 1.5;
    const height = clamp(this.roomRadius * 1.15 + 1.5, 3.5, 16);
    const camPos = mid
      .clone()
      .addScaledVector(inward, back)
      .setY(height);
    // aim a little past the segment toward the room so the wall sits low in
    // frame with the rest of the room visible behind it.
    const target = mid.clone().lerp(this.center, 0.18).setY(LOOK_H);
    const pose: CameraPose = { position: camPos, target };
    if (animate) this.animator.to(pose);
    else this.animator.set(pose);

    this.onChange?.(s, i, this.sections.length);
  }

  next(): void {
    if (this.index < this.sections.length - 1) this.goTo(this.index + 1);
  }
  prev(): void {
    if (this.index > 0) this.goTo(this.index - 1);
  }

  current(): Section | null {
    return this.sections[this.index] ?? null;
  }

  /** Reframe to an overview after rescale, looking down at the whole room. */
  overview(): void {
    this.arrow.hide();
    // Steep, room-scaled vantage: rise high and pull back only modestly so the
    // near wall stays low in frame and doesn't occlude low furniture (a bed) in
    // the front half of the room. Scales with room size so it fits big rooms too.
    const r = this.roomRadius;
    const pos = this.center
      .clone()
      .add(new THREE.Vector3(0, r * 2.0 + 1.6, r * 0.85 + 0.5));
    this.animator.to(
      { position: pos, target: this.center.clone() },
      900,
    );
  }

  dispose(): void {
    this.arrow.dispose();
  }
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

/** Largest world-space distance from the room centre to any traced node. */
function roomRadiusWorld(
  p: Project,
  coords: Coords,
  center: THREE.Vector3,
): number {
  let max = 0;
  for (const n of p.nodes) {
    const w = coords.toWorld({ x: n.x, y: n.y });
    const d = Math.hypot(w.x - center.x, w.z - center.z);
    if (d > max) max = d;
  }
  return max > 0.5 ? max : 4;
}

function roomCenterWorld(p: Project, coords: Coords): THREE.Vector3 {
  const loop = findWallLoop(p);
  let c: Vec2;
  if (loop && loop.length >= 3) {
    c = centroid2d(loopPolygon(p, loop));
  } else if (p.nodes.length > 0) {
    c = centroid2d(p.nodes.map((n) => ({ x: n.x, y: n.y })));
  } else {
    c = { x: p.imageW / 2, y: p.imageH / 2 };
  }
  return coords.toWorld(c);
}
