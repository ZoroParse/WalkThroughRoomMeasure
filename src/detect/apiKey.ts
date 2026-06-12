/* ------------------------------------------------------------------ *
 * OpenAI API key handling for the in-browser vision detector.
 *
 * The key is stored ONLY in this browser's localStorage and sent straight
 * to api.openai.com — it never touches any server of ours (there is none).
 * promptForApiKey renders a small overlay form when no key is set.
 * ------------------------------------------------------------------ */

import { el } from '../util/dom.ts';

const KEY = 'wtrm:openaiKey';

export function getApiKey(): string | null {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

export function setApiKey(value: string): void {
  try {
    localStorage.setItem(KEY, value);
  } catch {
    /* ignore quota / privacy-mode errors */
  }
}

export function clearApiKey(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}

/** Resolve to a usable key, prompting with an overlay if none is stored. */
export function ensureApiKey(): Promise<string | null> {
  const existing = getApiKey();
  if (existing) return Promise.resolve(existing);
  return promptForApiKey();
}

function promptForApiKey(): Promise<string | null> {
  return new Promise((resolve) => {
    const input = el('input', {
      type: 'password',
      placeholder: 'sk-...',
      autocomplete: 'off',
      'aria-label': 'OpenAI API key',
    }) as HTMLInputElement;

    const save = el('button', { class: 'primary' }, ['Save & detect']);
    const cancel = el('button', { class: 'ghost' }, ['Cancel']);

    const overlay = el('div', { class: 'overlay-center modal-overlay' }, [
      el('div', { class: 'panel card' }, [
        el('h1', { text: 'Connect OpenAI vision' }),
        el('p', {
          text: 'Paste your OpenAI API key to auto-detect the room. It is stored only on this device and sent directly to OpenAI — never to us.',
        }),
        input,
        el('p', {
          class: 'hint',
          html: 'Get a key at <strong>platform.openai.com</strong>. Standard API usage rates apply.',
        }),
        el('div', { class: 'actions' }, [save, cancel]),
      ]),
    ]);

    const close = (value: string | null) => {
      overlay.remove();
      resolve(value);
    };
    save.addEventListener('click', () => {
      const v = input.value.trim();
      if (!v) {
        input.focus();
        return;
      }
      setApiKey(v);
      close(v);
    });
    cancel.addEventListener('click', () => close(null));
    input.addEventListener('keydown', (e) => {
      if ((e as KeyboardEvent).key === 'Enter') save.click();
    });

    document.body.append(overlay);
    input.focus();
  });
}
