/* ------------------------------------------------------------------ *
 * DOM builders for the chrome around each phase: the tool segmented
 * control, the upload panel, and the rescale/share panel. Orchestration
 * (which builder to mount, and wiring to engine/store) lives in main.ts.
 * ------------------------------------------------------------------ */

import { type Tool } from '../trace/traceController.ts';
import {
  COMPONENT_TYPES,
  COMPONENT_COLOR,
  COMPONENT_LABEL,
} from '../state/types.ts';
import { el } from '../util/dom.ts';

export function setTitle(title: string, sub: string): void {
  const t = document.getElementById('phase-title');
  if (t) t.innerHTML = `${title}<small>${sub}</small>`;
}

/** Segmented tool selector for the trace phase. */
export function buildToolSegmented(
  active: Tool,
  onPick: (tool: Tool) => void,
): HTMLElement {
  const seg = el('div', { class: 'segmented' });
  const add = (tool: Tool, label: string, color?: string) => {
    const btn = el('button', { type: 'button' });
    if (color) btn.append(el('span', { class: 'swatch', style: `background:${color}` }));
    btn.append(document.createTextNode(label));
    btn.setAttribute('aria-pressed', String(tool === active));
    btn.addEventListener('click', () => onPick(tool));
    seg.append(btn);
  };
  for (const t of COMPONENT_TYPES) add(t, COMPONENT_LABEL[t], COMPONENT_COLOR[t]);
  add('select', 'Edit');
  add('delete', 'Delete');
  return seg;
}

export function buildUploadPanel(
  onChoose: () => void,
  onSample: () => void,
): HTMLElement {
  const wrap = el('div', { class: 'overlay-center' });
  const panel = el('div', { class: 'panel card' }, [
    el('h1', { text: 'Measure a room in 3D' }),
    el('p', {
      text: 'Upload a blueprint or floor-plan image. You’ll trace the walls, doors, windows and furniture, then walk through in 3D and enter each measurement.',
    }),
  ]);
  const choose = el('button', { class: 'primary' }, ['Choose blueprint image']);
  choose.addEventListener('click', onChoose);
  const sample = el('button', { class: 'ghost' }, ['Try the sample bedroom']);
  sample.addEventListener('click', onSample);
  panel.append(el('div', { class: 'actions' }, [choose, sample]));
  wrap.append(panel);
  return wrap;
}

export function buildRescalePanel(
  widthM: number,
  depthM: number,
  onShare: () => void,
  onBack: () => void,
): HTMLElement {
  const card = el('div', { class: 'card' });
  card.append(
    el('div', {
      class: 'measure-kind',
      html: `<span class="swatch" style="background:var(--go)"></span> True scale ≈ ${widthM.toFixed(
        2,
      )} m × ${depthM.toFixed(2)} m`,
    }),
  );
  card.append(
    el('p', {
      class: 'hint',
      text: 'Rebuilt from your measurements. Share the annotated blueprint to your phone, Messages or contacts.',
    }),
  );
  const share = el('button', { class: 'go' }, ['Share / Save results']);
  share.addEventListener('click', onShare);
  const back = el('button', { class: 'ghost' }, ['‹ Back to measuring']);
  back.addEventListener('click', onBack);
  card.append(el('div', { class: 'measure-nav' }, [back, share]));
  return card;
}
