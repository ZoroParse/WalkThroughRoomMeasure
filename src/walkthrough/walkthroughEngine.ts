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

    // Camera stands inside the room facing the section. For walls we back
    // up toward the opposite wall so the whole span (and both arrowheads)
    // fits the frame; for interior furniture we just step back from it.
    let camPos: THREE.Vector3;
    if (inwardLen > 0.6) {
      const standoff = Math.min(6, Math.max(1.2, inwardLen * 2 - 0.4));
      camPos = mid.clone().addScaledVector(inward, standoff).setY(EYE_H);
    } else {
      camPos = mid.clone().addScaledVector(inward, -1.8).setY(EYE_H);
    }
    const pose: CameraPose = {
      position: camPos,
      target: mid.clone().setY(LOOK_H),
    };
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
    const pos = this.center.clone().add(new THREE.Vector3(0, 6, 6));
    this.animator.to(
      { position: pos, target: this.center.clone() },
      900,
    );
  }

  dispose(): void {
    this.arrow.dispose();
  }
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
