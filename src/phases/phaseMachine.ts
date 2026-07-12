/* ------------------------------------------------------------------ *
 * Phase metadata and ordering. The actual wiring lives in the App shell;
 * this just describes each phase.
 * ------------------------------------------------------------------ */

import { type AppPhase } from '../state/types.ts';

export const PHASE_TITLE: Record<AppPhase, { title: string; sub: string }> = {
  upload: { title: 'Add your blueprint', sub: 'Step 1 — Upload' },
  trace: { title: 'Trace the room', sub: 'Step 2 — Outline' },
  walkthrough: { title: 'Walk & measure', sub: 'Step 3 — Measure' },
  rescale: { title: 'True-scale model', sub: 'Step 4 — Rescale' },
  done: { title: 'All measured', sub: 'Step 5 — Share' },
};

/** Which canvas surface a phase uses. */
export function surfaceFor(phase: AppPhase): 'trace' | 'scene' {
  return phase === 'walkthrough' || phase === 'rescale' || phase === 'done'
    ? 'scene'
    : 'trace';
}
