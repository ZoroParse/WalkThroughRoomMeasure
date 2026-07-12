/* ------------------------------------------------------------------ *
 * Pointer/touch interaction for the tracer. One unified Pointer Events
 * path handles mouse and touch:
 *   - one finger, quick press/release  -> tap (tool action)
 *   - one finger, press + drag         -> pan (or move a node in select)
 *   - two fingers                      -> pinch-zoom + pan
 * ------------------------------------------------------------------ */

import { store } from '../state/store.ts';
import { type ComponentType, type FurnitureKind } from '../state/types.ts';
import { type Vec2, dist } from '../graph/geometryHelpers.ts';
import { uid } from '../util/id.ts';
import { toast } from '../util/dom.ts';
import { nearestNode, nearestEdge } from './hitTest.ts';
import { TraceCanvas } from './traceCanvas.ts';

export type Tool = ComponentType | 'select' | 'delete';

const TAP_MOVE_THRESHOLD = 8; // screen px

// Cycle order when re-labelling a furniture piece in select mode.
const FURNITURE_KINDS: FurnitureKind[] = [
  'bed',
  'wardrobe',
  'cabinet',
  'table',
  'desk',
  'sofa',
  'chair',
  'other',
];

interface PointerInfo {
  x: number;
  y: number;
  startX: number;
  startY: number;
  moved: boolean;
}

export class TraceController {
  tool: Tool = 'wall';
  private tc: TraceCanvas;
  private onChange: () => void;
  private pointers = new Map<number, PointerInfo>();
  private gesture: 'none' | 'pan' | 'pinch' | 'drag' = 'none';
  private dragNodeId: string | null = null;
  private pinchStartDist = 0;
  private pinchStartScale = 1;

  // chain state for the pen
  private activeNodeId: string | null = null;
  private currentLoopId: string | null = null;
  private loopStartNodeId: string | null = null;

  constructor(tc: TraceCanvas, onChange: () => void) {
    this.tc = tc;
    this.onChange = onChange;
    const c = tc.canvas;
    c.addEventListener('pointerdown', this.onDown);
    c.addEventListener('pointermove', this.onMove);
    c.addEventListener('pointerup', this.onUp);
    c.addEventListener('pointercancel', this.onUp);
  }

  destroy(): void {
    const c = this.tc.canvas;
    c.removeEventListener('pointerdown', this.onDown);
    c.removeEventListener('pointermove', this.onMove);
    c.removeEventListener('pointerup', this.onUp);
    c.removeEventListener('pointercancel', this.onUp);
  }

  setTool(tool: Tool): void {
    this.tool = tool;
    this.endChain(); // never chain across component types
    this.sync();
  }

  /** Drawing furniture? Offer "Close loop" once there is something to close. */
  canCloseLoop(): boolean {
    return (
      this.tool === 'furniture' &&
      !!this.activeNodeId &&
      !!this.loopStartNodeId &&
      this.activeNodeId !== this.loopStartNodeId
    );
  }

  closeLoop(): void {
    if (!this.canCloseLoop()) return;
    store.addEdge(
      this.activeNodeId!,
      this.loopStartNodeId!,
      'furniture',
      this.currentLoopId ?? undefined,
    );
    this.endChain();
    this.onChange();
  }

  /** Lift the pen so the next tap starts a fresh segment. */
  endChain(): void {
    this.activeNodeId = null;
    this.currentLoopId = null;
    this.loopStartNodeId = null;
    this.tc.visual.activeNodeId = null;
    this.tc.visual.rubberTo = null;
  }

  hasActiveChain(): boolean {
    return this.activeNodeId !== null;
  }

  // --- pointer handlers -------------------------------------------------

  private local(e: PointerEvent): Vec2 {
    const r = this.tc.canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  private onDown = (e: PointerEvent): void => {
    this.tc.canvas.setPointerCapture(e.pointerId);
    const s = this.local(e);
    this.pointers.set(e.pointerId, {
      x: s.x,
      y: s.y,
      startX: s.x,
      startY: s.y,
      moved: false,
    });

    if (this.pointers.size === 2) {
      this.beginPinch();
      return;
    }
    if (this.pointers.size === 1) {
      // maybe start dragging a node in select mode
      if (this.tool === 'select') {
        const img = this.tc.viewport.toImage(s);
        const hit = nearestNode(store.state, img, this.tc.hitTolerance());
        if (hit) {
          this.gesture = 'drag';
          this.dragNodeId = hit.id;
          return;
        }
      }
      this.gesture = 'none';
    }
  };

  private onMove = (e: PointerEvent): void => {
    const info = this.pointers.get(e.pointerId);
    if (!info) return;
    const s = this.local(e);
    info.x = s.x;
    info.y = s.y;
    if (dist(s, { x: info.startX, y: info.startY }) > TAP_MOVE_THRESHOLD) {
      info.moved = true;
    }

    if (this.pointers.size >= 2) {
      this.updatePinch();
      return;
    }

    if (this.gesture === 'drag' && this.dragNodeId) {
      const img = this.tc.viewport.toImage(s);
      store.moveNode(this.dragNodeId, img.x, img.y);
      this.onChange();
      return;
    }

    // one-finger pan once movement exceeds the tap threshold
    if (info.moved) {
      this.gesture = 'pan';
      const prev = { x: info.startX, y: info.startY };
      this.tc.viewport.tx += s.x - prev.x;
      this.tc.viewport.ty += s.y - prev.y;
      info.startX = s.x;
      info.startY = s.y;
      this.sync();
    } else if (this.activeNodeId) {
      // live rubber-band toward the finger while aiming the next node
      this.tc.visual.rubberTo = this.tc.viewport.toImage(s);
      this.sync();
    }
  };

  private onUp = (e: PointerEvent): void => {
    const info = this.pointers.get(e.pointerId);
    this.pointers.delete(e.pointerId);

    if (this.gesture === 'pinch' && this.pointers.size < 2) {
      this.gesture = this.pointers.size === 1 ? 'pan' : 'none';
    }
    if (this.gesture === 'drag') {
      this.gesture = 'none';
      this.dragNodeId = null;
      return;
    }

    // a clean tap: single pointer, little movement, not part of a pinch
    if (info && !info.moved && this.gesture !== 'pan' && this.pointers.size === 0) {
      this.handleTap(this.tc.viewport.toImage({ x: info.x, y: info.y }));
    }
    if (this.pointers.size === 0) this.gesture = 'none';
  };

  // --- tap actions ------------------------------------------------------

  private handleTap(pt: Vec2): void {
    const tol = this.tc.hitTolerance();

    if (this.tool === 'delete') {
      const n = nearestNode(store.state, pt, tol);
      if (n) {
        store.deleteNode(n.id);
        this.endChain();
        this.onChange();
        return;
      }
      const edge = nearestEdge(store.state, pt, tol);
      if (edge) {
        store.deleteEdge(edge.id);
        this.onChange();
      }
      return;
    }

    if (this.tool === 'select') {
      const edge = nearestEdge(store.state, pt, tol);
      if (edge) {
        if (edge.type === 'furniture') {
          // furniture: cycle the KIND of the whole piece so the 3D model reads
          // right, rather than changing the component type.
          const idx = edge.kind ? FURNITURE_KINDS.indexOf(edge.kind) : -1;
          const next = FURNITURE_KINDS[(idx + 1) % FURNITURE_KINDS.length];
          store.setFurnitureKind(edge.id, next);
          toast(`Furniture: ${next}`);
        } else {
          // non-furniture: cycle the component type (kind stays undefined when
          // it lands on furniture — footprint inference handles the model).
          const order: ComponentType[] = ['wall', 'window', 'door', 'furniture'];
          const next = order[(order.indexOf(edge.type) + 1) % order.length];
          store.setEdgeType(edge.id, next);
        }
        this.onChange();
      }
      return;
    }

    // drawing tools: chain nodes into typed edges
    const type = this.tool as ComponentType;
    const existing = nearestNode(store.state, pt, tol);
    const endpoint = existing ?? store.addNode(pt.x, pt.y);

    if (!this.activeNodeId) {
      this.activeNodeId = endpoint.id;
      if (type === 'furniture') {
        this.currentLoopId = uid('loop');
        this.loopStartNodeId = endpoint.id;
      }
    } else if (this.activeNodeId !== endpoint.id) {
      store.addEdge(
        this.activeNodeId,
        endpoint.id,
        type,
        type === 'furniture' ? (this.currentLoopId ?? undefined) : undefined,
      );
      this.activeNodeId = endpoint.id;
    }
    this.tc.visual.activeNodeId = this.activeNodeId;
    this.tc.visual.rubberTo = null;
    this.onChange();
  }

  // --- pinch ------------------------------------------------------------

  private twoPointers(): [PointerInfo, PointerInfo] {
    const [a, b] = [...this.pointers.values()];
    return [a, b];
  }

  private beginPinch(): void {
    this.gesture = 'pinch';
    const [a, b] = this.twoPointers();
    this.pinchStartDist = dist(a, b) || 1;
    this.pinchStartScale = this.tc.viewport.scale;
    this.endChain();
  }

  private updatePinch(): void {
    if (this.pointers.size < 2) return;
    const [a, b] = this.twoPointers();
    const d = dist(a, b) || 1;
    const center = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    const vp = this.tc.viewport;

    // keep the image point under the pinch center fixed while scaling
    const before = vp.toImage(center);
    vp.scale = clampScale(this.pinchStartScale * (d / this.pinchStartDist));
    vp.tx = center.x - before.x * vp.scale;
    vp.ty = center.y - before.y * vp.scale;
    this.sync();
  }

  private sync(): void {
    this.onChange();
  }
}

function clampScale(s: number): number {
  return Math.max(0.05, Math.min(20, s));
}
