/* ------------------------------------------------------------------ *
 * A single reusable translucent double-headed arrow that spans the
 * section currently being measured. It stands as a vertical marker in
 * front of the segment (facing into the room), so from a first-person
 * view it clearly reads as "measure this span". Colored per component
 * type, with a gentle opacity pulse.
 * ------------------------------------------------------------------ */

import * as THREE from 'three';

export class ArrowOverlay {
  readonly mesh: THREE.Mesh;
  private material: THREE.MeshBasicMaterial;
  private outline: THREE.LineLoop;
  private pulseT = 0;

  constructor() {
    this.material = new THREE.MeshBasicMaterial({
      color: '#38bdf8',
      transparent: true,
      opacity: 0.6,
      depthWrite: false,
      depthTest: false,
      side: THREE.DoubleSide,
    });
    this.mesh = new THREE.Mesh(new THREE.BufferGeometry(), this.material);
    this.mesh.renderOrder = 999;
    this.mesh.visible = false;

    // dark border so the arrow reads on any wall color
    this.outline = new THREE.LineLoop(
      new THREE.BufferGeometry(),
      new THREE.LineBasicMaterial({
        color: '#0b1017',
        transparent: true,
        opacity: 0.9,
        depthTest: false,
        depthWrite: false,
      }),
    );
    this.outline.renderOrder = 1000;
    this.mesh.add(this.outline);
  }

  /**
   * Aim the arrow along section a->b (world floor points), standing it
   * upright at `yCenter`, facing along `inward` (toward the room).
   */
  update(
    a: THREE.Vector3,
    b: THREE.Vector3,
    inward: THREE.Vector3,
    color: string,
    yCenter = 1.15,
    frontOffset = 0.05,
  ): void {
    const dir = new THREE.Vector3(b.x - a.x, 0, b.z - a.z);
    const length = dir.length() || 0.001;
    dir.normalize();

    // orthonormal basis: x along the wall, z facing inward, y up
    const z = inward.clone().setY(0);
    z.addScaledVector(dir, -z.dot(dir)); // make perpendicular to dir
    if (z.lengthSq() < 1e-6) z.set(-dir.z, 0, dir.x); // fallback
    z.normalize();
    const y = new THREE.Vector3().crossVectors(z, dir).normalize();
    const basis = new THREE.Matrix4().makeBasis(dir, y, z);

    const { geometry, outline } = arrowGeometry(length);
    this.mesh.geometry.dispose();
    this.mesh.geometry = geometry;
    this.outline.geometry.dispose();
    this.outline.geometry = outline;
    this.material.color.set(color);

    this.mesh.quaternion.setFromRotationMatrix(basis);
    const mx = (a.x + b.x) / 2 + z.x * frontOffset;
    const mz = (a.z + b.z) / 2 + z.z * frontOffset;
    this.mesh.position.set(mx, yCenter, mz);
    this.mesh.visible = true;
  }

  hide(): void {
    this.mesh.visible = false;
  }

  tick(dt: number): void {
    if (!this.mesh.visible) return;
    this.pulseT += dt;
    this.material.opacity = 0.68 + 0.2 * (0.5 + 0.5 * Math.sin(this.pulseT * 3));
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    this.outline.geometry.dispose();
    (this.outline.material as THREE.Material).dispose();
    this.material.dispose();
  }
}

/** Flat double-headed arrow in the local XY plane, centered, length L along X. */
function arrowGeometry(L: number): {
  geometry: THREE.ShapeGeometry;
  outline: THREE.BufferGeometry;
} {
  const h = Math.min(0.28, L * 0.3); // head length
  const hw = Math.min(0.22, L * 0.18 + 0.05); // head half-height
  const w = Math.min(0.085, hw * 0.5); // shaft half-height
  const x0 = -L / 2;
  const x1 = L / 2;

  const pts: [number, number][] = [
    [x0, 0],
    [x0 + h, hw],
    [x0 + h, w],
    [x1 - h, w],
    [x1 - h, hw],
    [x1, 0],
    [x1 - h, -hw],
    [x1 - h, -w],
    [x0 + h, -w],
    [x0 + h, -hw],
  ];

  const shape = new THREE.Shape();
  pts.forEach(([x, yy], i) => (i === 0 ? shape.moveTo(x, yy) : shape.lineTo(x, yy)));
  shape.closePath();

  const outline = new THREE.BufferGeometry().setFromPoints(
    pts.map(([x, yy]) => new THREE.Vector3(x, yy, 0)),
  );
  return { geometry: new THREE.ShapeGeometry(shape), outline };
}
