/* ------------------------------------------------------------------ *
 * Core data model.
 *
 * The user traces the blueprint as a GRAPH: nodes (junctions/corners
 * where components meet) connected by typed edges. Each edge IS exactly
 * one measurable "section", because a node is only placed where one
 * component meets another — so an edge is, by construction, bounded by
 * junctions. Junctions need no separate entity; they are simply nodes
 * shared by two or more edges.
 *
 * All trace coordinates live in IMAGE-PIXEL space (origin top-left, in
 * the blueprint's natural dimensions) so they are independent of the
 * display canvas size / device pixel ratio.
 * ------------------------------------------------------------------ */

export type ComponentType = 'wall' | 'window' | 'door' | 'furniture';

export const COMPONENT_TYPES: ComponentType[] = [
  'wall',
  'window',
  'door',
  'furniture',
];

/** Shared colors for each component type (2D trace, 3D arrow, export).
 * Chosen to stay distinct and legible on both a white blueprint and the
 * grey 3D walls. */
export const COMPONENT_COLOR: Record<ComponentType, string> = {
  wall: '#6366f1', // indigo
  window: '#0ea5e9', // sky
  door: '#f97316', // orange
  furniture: '#10b981', // emerald
};

export const COMPONENT_LABEL: Record<ComponentType, string> = {
  wall: 'Wall',
  window: 'Window',
  door: 'Door',
  furniture: 'Furniture',
};

/** A junction / corner, in image-pixel coordinates. */
export interface Node {
  id: string;
  x: number;
  y: number;
}

/** A typed segment between two nodes — one measurable section. */
export interface Edge {
  id: string;
  a: string; // node id
  b: string; // node id
  type: ComponentType;
  /** Furniture edges that form one closed piece share a loopId. */
  loopId?: string;
}

export type AppPhase = 'upload' | 'trace' | 'walkthrough' | 'rescale' | 'done';

/** Everything needed to fully restore a session from localStorage. */
export interface Project {
  schemaVersion: number;
  /** Blueprint persisted as a data URL so a reload restores the image too. */
  imageDataUrl: string | null;
  imageW: number;
  imageH: number;
  nodes: Node[];
  edges: Edge[];
  /** edgeId -> measured length in centimetres. */
  measurements: Record<string, number>;
  phase: AppPhase;
  /**
   * Calibration: world units per image-pixel after rescale. Null until the
   * user has measured enough sections to calibrate true scale.
   */
  cmPerPixel: number | null;
  updatedAt: number;
}

export const SCHEMA_VERSION = 1;

export function emptyProject(): Project {
  return {
    schemaVersion: SCHEMA_VERSION,
    imageDataUrl: null,
    imageW: 0,
    imageH: 0,
    nodes: [],
    edges: [],
    measurements: {},
    phase: 'upload',
    cmPerPixel: null,
    updatedAt: Date.now(),
  };
}

/** A measurable section — derived from an edge, ordered for the walkthrough. */
export interface Section {
  edgeId: string;
  type: ComponentType;
  order: number;
  /** Convenience copy of endpoint coordinates (image px). */
  ax: number;
  ay: number;
  bx: number;
  by: number;
  measuredCm: number | null;
}
