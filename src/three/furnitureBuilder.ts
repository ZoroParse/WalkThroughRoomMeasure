/* ------------------------------------------------------------------ *
 * Build furniture pieces as recognisable models. Each piece is a closed
 * loop of furniture edges sharing a loopId. We fit an oriented bounding
 * box to the loop, then assemble a model for its kind (bed, wardrobe,
 * table, sofa…) so the 3D room reads like the blueprint rather than a
 * field of identical blocks. Kind comes from the detector; when missing
 * (hand-traced pieces) we infer it from the footprint.
 * ------------------------------------------------------------------ */

import * as THREE from 'three';
import { type Project, type Edge, type FurnitureKind } from '../state/types.ts';
import { Coords } from './coords.ts';
import { nodeMap, type Vec2 } from '../graph/geometryHelpers.ts';

const mat = {
  frame: new THREE.MeshStandardMaterial({ color: '#6b7686', roughness: 0.9 }),
  bedBase: new THREE.MeshStandardMaterial({ color: '#5b4636', roughness: 0.8 }),
  mattress: new THREE.MeshStandardMaterial({ color: '#dfe6ee', roughness: 0.9 }),
  pillow: new THREE.MeshStandardMaterial({ color: '#f4f7fb', roughness: 1 }),
  duvet: new THREE.MeshStandardMaterial({ color: '#8fb4d6', roughness: 0.95 }),
  wood: new THREE.MeshStandardMaterial({ color: '#9c6b43', roughness: 0.75 }),
  panel: new THREE.MeshStandardMaterial({ color: '#b07d50', roughness: 0.6 }),
  handle: new THREE.MeshStandardMaterial({
    color: '#d8dde3',
    roughness: 0.3,
    metalness: 0.6,
  }),
  soft: new THREE.MeshStandardMaterial({ color: '#4f7a8c', roughness: 1 }),
  top: new THREE.MeshStandardMaterial({ color: '#caa982', roughness: 0.6 }),
  generic: new THREE.MeshStandardMaterial({ color: '#3f6f5a', roughness: 0.8 }),
};

interface OBB {
  cx: number;
  cz: number;
  ux: number; // unit length-axis (world XZ)
  uz: number;
  length: number; // extent along the length-axis
  depth: number; // extent along the perpendicular axis
}

export function buildFurniture(
  p: Project,
  loops: Map<string, Edge[]>,
  coords: Coords,
  center: THREE.Vector3,
  roomDiag: number,
): THREE.Object3D {
  const group = new THREE.Group();
  const map = nodeMap(p);

  for (const edges of loops.values()) {
    const ring = ringWorld(edges, map, coords);
    if (ring.length < 2) continue;
    const obb = computeOBB(ring);
    if (obb.length < 0.05 || obb.depth < 0.05) continue;

    const kind =
      edges.find((e) => e.kind)?.kind ?? inferKind(obb, roomDiag);

    // place a model in the OBB's frame: local +X = length, +Z = depth, +Y up
    const piece = new THREE.Group();
    piece.position.set(obb.cx, 0, obb.cz);
    piece.rotation.y = -Math.atan2(obb.uz, obb.ux);

    // which local-Z side faces the room interior (for doors / fronts / backs)
    const wx = -obb.uz; // world depth-axis
    const wz = obb.ux;
    const frontSign =
      (center.x - obb.cx) * wx + (center.z - obb.cz) * wz >= 0 ? 1 : -1;

    buildModel(piece, kind, obb.length, obb.depth, frontSign);
    group.add(piece);
  }

  return group;
}

function buildModel(
  g: THREE.Group,
  kind: FurnitureKind,
  L: number,
  D: number,
  front: number,
): void {
  const box = (
    w: number,
    h: number,
    d: number,
    x: number,
    y: number,
    z: number,
    m: THREE.Material,
  ) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
    mesh.position.set(x, y, z);
    g.add(mesh);
    return mesh;
  };

  switch (kind) {
    case 'bed': {
      box(L, 0.3, D, 0, 0.15, 0, mat.bedBase); // base
      box(L * 0.98, 0.18, D * 0.94, 0, 0.39, 0, mat.mattress); // mattress
      box(L * 0.62, 0.06, D * 0.94, L * 0.16, 0.51, 0, mat.duvet); // duvet over the foot end
      // headboard + pillows at the -X (head) end
      box(0.08, 0.7, D, -L / 2 - 0.04, 0.35, 0, mat.bedBase);
      box(L * 0.16, 0.1, D * 0.4, -L / 2 + L * 0.13, 0.53, D * 0.22, mat.pillow);
      box(L * 0.16, 0.1, D * 0.4, -L / 2 + L * 0.13, 0.53, -D * 0.22, mat.pillow);
      break;
    }
    case 'wardrobe':
    case 'cabinet': {
      const H = kind === 'cabinet' ? 1.05 : 2.05;
      box(L, H, D, 0, H / 2, 0, mat.wood); // body
      const fz = front * (D / 2 + 0.025);
      box(L * 0.47, H * 0.94, 0.04, -L * 0.24, H / 2, fz, mat.panel); // left door
      box(L * 0.47, H * 0.94, 0.04, L * 0.24, H / 2, fz, mat.panel); // right door
      const hz = front * (D / 2 + 0.06);
      box(0.03, 0.28, 0.03, -L * 0.03, H * 0.52, hz, mat.handle); // handles by the seam
      box(0.03, 0.28, 0.03, L * 0.03, H * 0.52, hz, mat.handle);
      break;
    }
    case 'table': {
      box(L * 0.86, 0.46, D * 0.86, 0, 0.25, 0, mat.wood); // body
      box(L, 0.05, D, 0, 0.5, 0, mat.top); // top overhang
      box(0.05, 0.05, 0.05, 0, 0.32, front * (D / 2 + 0.02), mat.handle); // knob
      break;
    }
    case 'desk': {
      box(L, 0.05, D, 0, 0.74, 0, mat.top); // top
      const lx = L / 2 - 0.05;
      const lz = D / 2 - 0.05;
      for (const sx of [-lx, lx])
        for (const sz of [-lz, lz])
          box(0.05, 0.72, 0.05, sx, 0.36, sz, mat.wood); // legs
      break;
    }
    case 'sofa': {
      box(L, 0.38, D, 0, 0.2, 0, mat.soft); // seat base
      box(L, 0.5, D * 0.24, 0, 0.45, -front * (D / 2 - D * 0.12), mat.soft); // backrest
      for (const sx of [-(L / 2 - 0.09), L / 2 - 0.09])
        box(0.18, 0.46, D, sx, 0.23, 0, mat.soft); // arms
      break;
    }
    case 'chair': {
      box(L, 0.45, D, 0, 0.23, 0, mat.wood);
      box(L, 0.45, D * 0.18, 0, 0.66, -front * (D / 2 - D * 0.09), mat.wood);
      break;
    }
    default:
      box(L, 0.5, D, 0, 0.25, 0, mat.generic); // simple block
      break;
  }
}

/** Footprint-based guess when the detector didn't label the piece. */
function inferKind(obb: OBB, roomDiag: number): FurnitureKind {
  const long = Math.max(obb.length, obb.depth);
  const short = Math.min(obb.length, obb.depth) || 0.01;
  const ratio = long / short;
  const frac = long / (roomDiag || long);
  if (ratio > 2.4) return 'wardrobe'; // long and thin against a wall
  if (frac > 0.3 && ratio < 2.2) return 'bed'; // large and chunky
  if (frac < 0.18) return 'table'; // small
  return 'other';
}

/** Ordered ring of world XZ points for one loop. */
function ringWorld(
  edges: Edge[],
  map: Map<string, { x: number; y: number }>,
  coords: Coords,
): Vec2[] {
  const adj = new Map<string, string[]>();
  for (const e of edges) {
    (adj.get(e.a) ?? adj.set(e.a, []).get(e.a)!).push(e.b);
    (adj.get(e.b) ?? adj.set(e.b, []).get(e.b)!).push(e.a);
  }
  const start = edges[0].a;
  const order: string[] = [start];
  let prev = '';
  let cur = start;
  for (let i = 0; i < edges.length; i++) {
    const next = (adj.get(cur) ?? []).find((n) => n !== prev);
    if (next === undefined || next === start) break;
    order.push(next);
    prev = cur;
    cur = next;
  }
  return order
    .map((id) => map.get(id))
    .filter((n): n is { x: number; y: number } => !!n)
    .map((n) => {
      const w = coords.toWorld({ x: n.x, y: n.y });
      return { x: w.x, y: w.z }; // pack world (x,z) into Vec2 (x,y)
    });
}

/** Oriented bounding box, axis aligned to the loop's longest edge. */
function computeOBB(pts: Vec2[]): OBB {
  // dominant axis from the longest edge of the ring
  let ux = 1;
  let uz = 0;
  let best = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    const dx = b.x - a.x;
    const dz = b.y - a.y;
    const len = Math.hypot(dx, dz);
    if (len > best) {
      best = len;
      ux = dx / len;
      uz = dz / len;
    }
  }
  // perpendicular axis
  const wx = -uz;
  const wz = ux;
  let minU = Infinity;
  let maxU = -Infinity;
  let minW = Infinity;
  let maxW = -Infinity;
  for (const pt of pts) {
    const pu = pt.x * ux + pt.y * uz;
    const pw = pt.x * wx + pt.y * wz;
    minU = Math.min(minU, pu);
    maxU = Math.max(maxU, pu);
    minW = Math.min(minW, pw);
    maxW = Math.max(maxW, pw);
  }
  const cu = (minU + maxU) / 2;
  const cw = (minW + maxW) / 2;
  return {
    cx: cu * ux + cw * wx,
    cz: cu * uz + cw * wz,
    ux,
    uz,
    length: maxU - minU,
    depth: maxW - minW,
  };
}
