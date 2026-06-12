/* ------------------------------------------------------------------ *
 * Smoothly fly a perspective camera from its current pose to a new
 * position + look-at target. Position and target are both eased; we call
 * lookAt every frame so orientation follows naturally.
 * ------------------------------------------------------------------ */

import * as THREE from 'three';
import { tween, type TweenHandle } from '../util/tween.ts';

export interface CameraPose {
  position: THREE.Vector3;
  target: THREE.Vector3;
}

export class CameraAnimator {
  private camera: THREE.PerspectiveCamera;
  private current: CameraPose;
  private handle: TweenHandle | null = null;

  constructor(camera: THREE.PerspectiveCamera, initial: CameraPose) {
    this.camera = camera;
    this.current = {
      position: initial.position.clone(),
      target: initial.target.clone(),
    };
    this.apply(this.current);
  }

  get target(): THREE.Vector3 {
    return this.current.target.clone();
  }

  /** Animate to a new pose. Cancels any in-flight animation. */
  to(pose: CameraPose, duration = 750): void {
    this.handle?.cancel();
    const fromPos = this.camera.position.clone();
    const fromTarget = this.current.target.clone();
    const toPos = pose.position.clone();
    const toTarget = pose.target.clone();

    this.handle = tween(duration, (p) => {
      const pos = fromPos.clone().lerp(toPos, p);
      const tgt = fromTarget.clone().lerp(toTarget, p);
      this.current.position.copy(pos);
      this.current.target.copy(tgt);
      this.apply(this.current);
    });
  }

  /** Snap immediately (no animation). */
  set(pose: CameraPose): void {
    this.handle?.cancel();
    this.current.position.copy(pose.position);
    this.current.target.copy(pose.target);
    this.apply(this.current);
  }

  private apply(pose: CameraPose): void {
    this.camera.position.copy(pose.position);
    this.camera.lookAt(pose.target);
  }
}
