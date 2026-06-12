/* ------------------------------------------------------------------ *
 * Build wall / door / window segments as oriented boxes.
 *
 * The trace model places a node wherever components meet, so a wall, a
 * door, and a window are already SEPARATE, non-overlapping segments of
 * the same line — no boolean cutting needed. Each segment type renders
 * differently:
 *   wall   -> solid full-height slab
 *   door   -> wood slab up to door height + lintel above
 *   window -> sill below + glass pane + header above
 * ------------------------------------------------------------------ */

import * as THREE from 'three';
import { type Edge } from '../state/types.ts';
import { Coords } from './coords.ts';
import { type Vec2 } from '../graph/geometryHelpers.ts';

export const WALL_H = 2.6;
export const WALL_THICK = 0.09;
const DOOR_H = 2.04;
const SILL_H = 0.9;
const WIN_TOP = 2.1;

const matWall = new THREE.MeshStandardMaterial({
  color: '#8893a3',
  roughness: 0.95,
  metalness: 0,
  side: THREE.DoubleSide,
});
const matDoor = new THREE.MeshStandardMaterial({
  color: '#b5835a',
  roughness: 0.7,
});
const matFrame = new THREE.MeshStandardMaterial({
  color: '#cdd6df',
  roughness: 0.9,
});
const matGlass = new THREE.MeshStandardMaterial({
  color: '#9fd4f5',
  roughness: 0.1,
  metalness: 0,
  transparent: true,
  opacity: 0.32,
  side: THREE.DoubleSide,
});

/** A box whose local +X spans from world point A to world point B. */
export function orientedBox(
  a: THREE.Vector3,
  b: THREE.Vector3,
  height: number,
  thickness: number,
  yCenter: number,
  material: THREE.Material,
): THREE.Mesh {
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const length = Math.hypot(dx, dz) || 0.001;
  const geo = new THREE.BoxGeometry(length, height, thickness);
  const mesh = new THREE.Mesh(geo, material);
  mesh.position.set((a.x + b.x) / 2, yCenter, (a.z + b.z) / 2);
  mesh.rotation.y = -Math.atan2(dz, dx);
  return mesh;
}

const matHandle = new THREE.MeshStandardMaterial({
  color: '#d8dde3',
  roughness: 0.3,
  metalness: 0.6,
});

export function buildWallEdge(
  edge: Edge,
  a: Vec2,
  b: Vec2,
  coords: Coords,
  center: THREE.Vector3,
): THREE.Object3D {
  const wa = coords.toWorld(a);
  const wb = coords.toWorld(b);
  const group = new THREE.Group();

  switch (edge.type) {
    case 'wall': {
      group.add(orientedBox(wa, wb, WALL_H, WALL_THICK, WALL_H / 2, matWall));
      break;
    }
    case 'door': {
      // A framed opening with a leaf hinged open into the room.
      const len = Math.hypot(wb.x - wa.x, wb.z - wa.z) || 0.001;
      const ux = (wb.x - wa.x) / len;
      const uz = (wb.z - wa.z) / len;
      // inward normal (toward the room centre)
      let nx = -uz;
      let nz = ux;
      if ((center.x - wa.x) * nx + (center.z - wa.z) * nz < 0) {
        nx = -nx;
        nz = -nz;
      }
      // lintel over the opening
      group.add(
        orientedBox(
          wa,
          wb,
          WALL_H - DOOR_H,
          WALL_THICK,
          (WALL_H + DOOR_H) / 2,
          matFrame,
        ),
      );
      // jamb posts at each end
      for (const p of [wa, wb]) {
        const post = new THREE.Mesh(
          new THREE.BoxGeometry(0.07, DOOR_H, WALL_THICK),
          matFrame,
        );
        post.position.set(p.x, DOOR_H / 2, p.z);
        post.rotation.y = -Math.atan2(uz, ux);
        group.add(post);
      }
      // door leaf, hinged at A, swung ~35° toward the room
      const theta = 0.62;
      const dx = ux * Math.cos(theta) + nx * Math.sin(theta);
      const dz = uz * Math.cos(theta) + nz * Math.sin(theta);
      const leafLen = len * 0.94;
      const leaf = new THREE.Mesh(
        new THREE.BoxGeometry(leafLen, DOOR_H, 0.045),
        matDoor,
      );
      leaf.position.set(
        wa.x + dx * (leafLen / 2),
        DOOR_H / 2,
        wa.z + dz * (leafLen / 2),
      );
      leaf.rotation.y = -Math.atan2(dz, dx);
      group.add(leaf);
      // handle near the leaf's free end
      const handle = new THREE.Mesh(
        new THREE.SphereGeometry(0.05, 10, 8),
        matHandle,
      );
      handle.position.set(
        wa.x + dx * (leafLen * 0.86),
        1.02,
        wa.z + dz * (leafLen * 0.86),
      );
      group.add(handle);
      break;
    }
    case 'window': {
      group.add(orientedBox(wa, wb, SILL_H, WALL_THICK, SILL_H / 2, matWall));
      group.add(
        orientedBox(
          wa,
          wb,
          WALL_H - WIN_TOP,
          WALL_THICK,
          (WALL_H + WIN_TOP) / 2,
          matWall,
        ),
      );
      group.add(
        orientedBox(
          wa,
          wb,
          WIN_TOP - SILL_H,
          WALL_THICK * 0.4,
          (WIN_TOP + SILL_H) / 2,
          matGlass,
        ),
      );
      break;
    }
    default:
      break;
  }
  return group;
}
