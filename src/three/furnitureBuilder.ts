/* ------------------------------------------------------------------ *
 * Build furniture pieces. Each piece is a closed-ish loop of furniture
 * edges sharing a loopId; we extrude its polygon into a low block.
 * ------------------------------------------------------------------ */

import * as THREE from 'three';
import { type Project, type Edge } from '../state/types.ts';
import { Coords } from './coords.ts';
import { nodeMap, signedArea, type Vec2 } from '../graph/geometryHelpers.ts';

const FURNITURE_H = 0.5;

const matFurniture = new THREE.MeshStandardMaterial({
  color: '#3f6f5a',
  roughness: 0.8,
});

/** Ordered, de-duplicated ring of image-pixel points for one loop. */
function loopRing(p: Project, edges: Edge[]): Vec2[] {
  const map = nodeMap(p);
  // Build adjacency to walk the ring in order.
  const adj = new Map<string, string[]>();
  for (const e of edges) {
    (adj.get(e.a) ?? adj.set(e.a, []).get(e.a)!).push(e.b);
    (adj.get(e.b) ?? adj.set(e.b, []).get(e.b)!).push(e.a);
  }
  const startId = edges[0].a;
  const order: string[] = [startId];
  let prev = '';
  let cur = startId;
  for (let i = 0; i < edges.length; i++) {
    const next = (adj.get(cur) ?? []).find((n) => n !== prev);
    if (next === undefined || next === startId) break;
    order.push(next);
    prev = cur;
    cur = next;
  }
  return order
    .map((id) => map.get(id))
    .filter((n): n is NonNullable<typeof n> => !!n)
    .map((n) => ({ x: n.x, y: n.y }));
}

export function buildFurniture(
  p: Project,
  loops: Map<string, Edge[]>,
  coords: Coords,
): THREE.Object3D {
  const group = new THREE.Group();

  for (const edges of loops.values()) {
    const ring = loopRing(p, edges);
    if (ring.length < 3) {
      // not a closed piece — render its edges as thin low bars instead
      for (const e of edges) {
        const a = p.nodes.find((n) => n.id === e.a);
        const b = p.nodes.find((n) => n.id === e.b);
        if (a && b) {
          group.add(barBetween(coords.toWorld(a), coords.toWorld(b)));
        }
      }
      continue;
    }

    // ensure consistent winding for the shape
    if (signedArea(ring) < 0) ring.reverse();

    const shape = new THREE.Shape();
    ring.forEach((pt, i) => {
      const w = coords.toWorld(pt);
      if (i === 0) shape.moveTo(w.x, w.z);
      else shape.lineTo(w.x, w.z);
    });
    shape.closePath();

    const geo = new THREE.ExtrudeGeometry(shape, {
      depth: FURNITURE_H,
      bevelEnabled: false,
    });
    // ExtrudeGeometry builds in XY then extrudes +Z; lay it flat on the floor.
    geo.rotateX(-Math.PI / 2);
    const mesh = new THREE.Mesh(geo, matFurniture);
    mesh.position.y = FURNITURE_H;
    group.add(mesh);
  }

  return group;
}

function barBetween(a: THREE.Vector3, b: THREE.Vector3): THREE.Mesh {
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const length = Math.hypot(dx, dz) || 0.001;
  const geo = new THREE.BoxGeometry(length, FURNITURE_H, 0.06);
  const mesh = new THREE.Mesh(geo, matFurniture);
  mesh.position.set((a.x + b.x) / 2, FURNITURE_H / 2, (a.z + b.z) / 2);
  mesh.rotation.y = -Math.atan2(dz, dx);
  return mesh;
}
