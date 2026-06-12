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

export function buildWallEdge(
  edge: Edge,
  a: Vec2,
  b: Vec2,
  coords: Coords,
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
      // closed door slab + lintel over the top
      group.add(orientedBox(wa, wb, DOOR_H, WALL_THICK * 0.6, DOOR_H / 2, matDoor));
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
