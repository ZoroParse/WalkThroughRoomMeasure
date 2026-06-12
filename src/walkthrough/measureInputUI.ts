/* ------------------------------------------------------------------ *
 * Bottom HUD card for the walkthrough: shows the current section, takes
 * a centimetre measurement, and offers Prev / Next plus a progress bar.
 * The green "Done!" button is owned by the phase shell and appears once
 * every section has a value.
 * ------------------------------------------------------------------ */

import { store } from '../state/store.ts';
import { type Section, COMPONENT_COLOR, COMPONENT_LABEL } from '../state/types.ts';
import { measuredCount } from '../graph/sections.ts';
import { el, clear } from '../util/dom.ts';

export interface MeasureCallbacks {
  onPrev(): void;
  onNext(): void;
  onValue(edgeId: string, cm: number): void;
}

export class MeasureInputUI {
  private host: HTMLElement;
  private cb: MeasureCallbacks;
  private input!: HTMLInputElement;

  constructor(host: HTMLElement, cb: MeasureCallbacks) {
    this.host = host;
    this.cb = cb;
  }

  render(section: Section, index: number, total: number): void {
    clear(this.host);
    const p = store.state;
    const done = measuredCount(p);
    const existing = p.measurements[section.edgeId];

    const card = el('div', { class: 'card measure-card' });

    // header: kind + progress
    const kind = el('div', { class: 'measure-kind' }, [
      el('span', {
        class: 'swatch',
        style: `background:${COMPONENT_COLOR[section.type]}`,
      }),
      el('span', { text: `${COMPONENT_LABEL[section.type]} — section ${index + 1} of ${total}` }),
    ]);
    const prog = el('div', {
      class: 'measure-progress',
      text: `${done}/${total} measured`,
    });
    card.append(el('div', { class: 'measure-head' }, [kind, prog]));

    // progress bar
    const bar = el('div', { class: 'bar' }, [
      el('span', { style: `width:${Math.round((done / total) * 100)}%` }),
    ]);
    card.append(bar);

    // input row
    this.input = el('input', {
      type: 'number',
      inputmode: 'numeric',
      min: '0',
      step: '1',
      placeholder: '0',
      'aria-label': 'Measurement in centimetres',
    }) as HTMLInputElement;
    if (typeof existing === 'number') this.input.value = String(existing);

    const commit = () => {
      const v = parseFloat(this.input.value);
      if (Number.isFinite(v) && v > 0) {
        this.cb.onValue(section.edgeId, v);
        prog.textContent = `${measuredCount(store.state)}/${total} measured`;
        bar.firstElementChild?.setAttribute(
          'style',
          `width:${Math.round((measuredCount(store.state) / total) * 100)}%`,
        );
      }
    };
    this.input.addEventListener('input', commit);
    this.input.addEventListener('keydown', (e) => {
      if ((e as KeyboardEvent).key === 'Enter') {
        commit();
        this.cb.onNext();
      }
    });

    const row = el('div', { class: 'measure-input-row' }, [
      this.input,
      el('span', { class: 'measure-unit', text: 'cm' }),
    ]);
    card.append(row);

    // nav
    const prev = el('button', { class: 'ghost' }, ['‹ Prev']);
    prev.toggleAttribute('disabled', index === 0);
    prev.addEventListener('click', () => {
      commit();
      this.cb.onPrev();
    });
    const next = el('button', { class: 'primary' }, [
      index === total - 1 ? 'Finish' : 'Next ›',
    ]);
    next.addEventListener('click', () => {
      commit();
      this.cb.onNext();
    });
    card.append(el('div', { class: 'measure-nav' }, [prev, next]));

    this.host.append(card);
  }

  focusInput(): void {
    // don't steal focus on touch (avoids keyboard popping over the 3D view)
    if (!matchMedia('(pointer: coarse)').matches) this.input?.focus();
  }
}
