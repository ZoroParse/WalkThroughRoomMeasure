/* ------------------------------------------------------------------ *
 * Central reactive store. A hand-written observable holding the single
 * Project. Views subscribe; mutations notify subscribers and trigger a
 * debounced persist. No framework needed.
 * ------------------------------------------------------------------ */

import {
  type Project,
  type Node,
  type Edge,
  type AppPhase,
  type ComponentType,
  type FurnitureKind,
  emptyProject,
} from './types.ts';
import { loadProject, saveProjectDebounced } from './persistence.ts';
import { uid } from '../util/id.ts';

type Listener = (project: Project) => void;

class Store {
  private project: Project;
  private listeners = new Set<Listener>();

  constructor() {
    this.project = loadProject() ?? emptyProject();
  }

  get state(): Readonly<Project> {
    return this.project;
  }

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private emit(): void {
    this.project.updatedAt = Date.now();
    for (const fn of this.listeners) fn(this.project);
    saveProjectDebounced(this.project);
  }

  /** Apply a mutation and notify. */
  update(mutator: (p: Project) => void): void {
    mutator(this.project);
    this.emit();
  }

  // --- specific helpers -------------------------------------------------

  setImage(dataUrl: string, w: number, h: number): void {
    this.update((p) => {
      p.imageDataUrl = dataUrl;
      p.imageW = w;
      p.imageH = h;
      p.phase = 'trace';
    });
  }

  setPhase(phase: AppPhase): void {
    this.update((p) => {
      p.phase = phase;
    });
  }

  addNode(x: number, y: number): Node {
    const node: Node = { id: uid('n'), x, y };
    this.update((p) => p.nodes.push(node));
    return node;
  }

  moveNode(id: string, x: number, y: number): void {
    this.update((p) => {
      const n = p.nodes.find((n) => n.id === id);
      if (n) {
        n.x = x;
        n.y = y;
      }
    });
  }

  addEdge(a: string, b: string, type: ComponentType, loopId?: string): Edge {
    const edge: Edge = { id: uid('e'), a, b, type, loopId };
    this.update((p) => p.edges.push(edge));
    return edge;
  }

  setEdgeType(id: string, type: ComponentType): void {
    this.update((p) => {
      const e = p.edges.find((e) => e.id === id);
      if (e) e.type = type;
    });
  }

  /** Set the kind for a furniture piece — every edge sharing its loopId (or
   *  just the one edge when it has no loopId). */
  setFurnitureKind(edgeId: string, kind: FurnitureKind): void {
    this.update((p) => {
      const e = p.edges.find((e) => e.id === edgeId);
      if (!e) return;
      const key = e.loopId ?? e.id;
      for (const edge of p.edges) {
        if (edge.type === 'furniture' && (edge.loopId ?? edge.id) === key) {
          edge.kind = kind;
        }
      }
    });
  }

  deleteEdge(id: string): void {
    this.update((p) => {
      p.edges = p.edges.filter((e) => e.id !== id);
      delete p.measurements[id];
      this.pruneOrphans(p);
    });
  }

  /** Delete a node and every edge touching it. */
  deleteNode(id: string): void {
    this.update((p) => {
      for (const e of p.edges) {
        if (e.a === id || e.b === id) delete p.measurements[e.id];
      }
      p.edges = p.edges.filter((e) => e.a !== id && e.b !== id);
      p.nodes = p.nodes.filter((n) => n.id !== id);
    });
  }

  private pruneOrphans(p: Project): void {
    const used = new Set<string>();
    for (const e of p.edges) {
      used.add(e.a);
      used.add(e.b);
    }
    p.nodes = p.nodes.filter((n) => used.has(n.id));
  }

  setMeasurement(edgeId: string, cm: number): void {
    this.update((p) => {
      p.measurements[edgeId] = cm;
    });
  }

  setCalibration(cmPerPixel: number): void {
    this.update((p) => {
      p.cmPerPixel = cmPerPixel;
    });
  }

  reset(): void {
    this.project = emptyProject();
    this.emit();
  }
}

export const store = new Store();
