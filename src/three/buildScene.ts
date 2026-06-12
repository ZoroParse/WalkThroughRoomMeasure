/* ------------------------------------------------------------------ *
 * Assemble the whole room as one THREE.Group from the traced graph:
 * floor, wall/door/window segments, and furniture.
 * ------------------------------------------------------------------ */

import * as THREE from 'three';
import { type Project } from '../state/types.ts';
import { Coords } from './coords.ts';
import { buildWallEdge } from './wallBuilder.ts';
import { buildFurniture } from './furnitureBuilder.ts';
import {
  nodeMap,
  findWallLoop,
  loopPolygon,
  furnitureLoops,
  type Vec2,
} from '../graph/geometryHelpers.ts';

const matFloor = new THREE.MeshStandardMaterial({
  color: '#1b2735',
  roughness: 1,
  metalness: 0,
  side: THREE.DoubleSide,
});

export interface BuiltScene {
  group: THREE.Group;
  coords: Coords;
}

export function buildScene(p: Project): BuiltScene {
  const coords = new Coords(p);
  const group = new THREE.Group();
  const map = nodeMap(p);

  const floorPoly = floorPolygon(p);
  // room centre + diagonal (world) — used for door swing and furniture facing
  const center = roomCenter(floorPoly, coords);
  const roomDiag = roomDiagonal(floorPoly, coords);

  // --- floor ----------------------------------------------------------
  if (floorPoly.length >= 3) {
    const shape = new THREE.Shape();
    floorPoly.forEach((pt, i) => {
      const w = coords.toWorld(pt);
      if (i === 0) shape.moveTo(w.x, w.z);
      else shape.lineTo(w.x, w.z);
    });
    shape.closePath();
    const geo = new THREE.ShapeGeometry(shape);
    geo.rotateX(Math.PI / 2); // XY shape -> XZ plane
    const floor = new THREE.Mesh(geo, matFloor);
    floor.position.y = -0.01;
    group.add(floor);
  }

  // --- walls / doors / windows ---------------------------------------
  for (const e of p.edges) {
    if (e.type === 'furniture') continue;
    const a = map.get(e.a);
    const b = map.get(e.b);
    if (!a || !b) continue;
    group.add(buildWallEdge(e, a, b, coords, center));
  }

  // --- furniture ------------------------------------------------------
  group.add(buildFurniture(p, furnitureLoops(p), coords, center, roomDiag));

  return { group, coords };
}

function roomCenter(poly: Vec2[], coords: Coords): THREE.Vector3 {
  if (poly.length === 0) return new THREE.Vector3();
  let sx = 0;
  let sy = 0;
  for (const pt of poly) {
    sx += pt.x;
    sy += pt.y;
  }
  return coords.toWorld({ x: sx / poly.length, y: sy / poly.length });
}

function roomDiagonal(poly: Vec2[], coords: Coords): number {
  if (poly.length === 0) return 6;
  let minX = Infinity;
  let minZ = Infinity;
  let maxX = -Infinity;
  let maxZ = -Infinity;
  for (const pt of poly) {
    const w = coords.toWorld(pt);
    minX = Math.min(minX, w.x);
    maxX = Math.max(maxX, w.x);
    minZ = Math.min(minZ, w.z);
    maxZ = Math.max(maxZ, w.z);
  }
  return Math.hypot(maxX - minX, maxZ - minZ) || 6;
}

/** Wall loop if closed, otherwise the bounding box of all nodes. */
function floorPolygon(p: Project): Vec2[] {
  const loop = findWallLoop(p);
  if (loop && loop.length >= 3) return loopPolygon(p, loop);
  if (p.nodes.length === 0) return [];
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const n of p.nodes) {
    minX = Math.min(minX, n.x);
    minY = Math.min(minY, n.y);
    maxX = Math.max(maxX, n.x);
    maxY = Math.max(maxY, n.y);
  }
  return [
    { x: minX, y: minY },
    { x: maxX, y: minY },
    { x: maxX, y: maxY },
    { x: minX, y: maxY },
  ];
}
