/* ------------------------------------------------------------------ *
 * Owns the Three.js renderer, scene, camera, lights and render loop.
 * buildScene populates a single roomGroup that can be swapped on rebuild.
 * ------------------------------------------------------------------ */

import * as THREE from 'three';

export class SceneManager {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  roomGroup = new THREE.Group();

  private raf = 0;
  private onFrame: ((dt: number) => void) | null = null;
  private last = performance.now();
  private running = false;

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: false,
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.shadowMap.enabled = false;

    this.scene.background = new THREE.Color('#0b1017');
    this.scene.fog = new THREE.Fog('#0b1017', 8, 26);

    this.camera = new THREE.PerspectiveCamera(72, 1, 0.05, 200);
    this.camera.position.set(0, 1.6, 4);

    // lighting: soft sky/ground fill + a key light
    const hemi = new THREE.HemisphereLight('#dbeafe', '#0b1017', 1.0);
    this.scene.add(hemi);
    const key = new THREE.DirectionalLight('#ffffff', 1.4);
    key.position.set(4, 8, 5);
    this.scene.add(key);
    const fill = new THREE.DirectionalLight('#9fb1c2', 0.4);
    fill.position.set(-5, 4, -4);
    this.scene.add(fill);

    this.scene.add(this.roomGroup);
  }

  setRoom(group: THREE.Group): void {
    this.scene.remove(this.roomGroup);
    disposeGroup(this.roomGroup);
    this.roomGroup = group;
    this.scene.add(group);
  }

  resize(width: number, height: number): void {
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / Math.max(1, height);
    this.camera.updateProjectionMatrix();
  }

  start(onFrame?: (dt: number) => void): void {
    this.onFrame = onFrame ?? null;
    if (this.running) return;
    this.running = true;
    this.last = performance.now();
    const loop = (now: number) => {
      if (!this.running) return;
      const dt = (now - this.last) / 1000;
      this.last = now;
      this.onFrame?.(dt);
      this.renderer.render(this.scene, this.camera);
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
  }

  stop(): void {
    this.running = false;
    cancelAnimationFrame(this.raf);
  }
}

export function disposeGroup(group: THREE.Object3D): void {
  group.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (mesh.geometry) mesh.geometry.dispose();
    const mat = mesh.material as THREE.Material | THREE.Material[] | undefined;
    if (Array.isArray(mat)) mat.forEach((m) => m.dispose());
    else mat?.dispose();
  });
}
