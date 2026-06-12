/** Tiny DOM helpers — keep call sites terse without pulling in a framework. */

type Attrs = Record<string, string | number | boolean | undefined>;

export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Attrs = {},
  children: (Node | string)[] = [],
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === false) continue;
    if (k === 'class') node.className = String(v);
    else if (k === 'text') node.textContent = String(v);
    else if (k === 'html') node.innerHTML = String(v);
    else node.setAttribute(k, v === true ? '' : String(v));
  }
  for (const c of children) {
    node.append(c instanceof Node ? c : document.createTextNode(c));
  }
  return node;
}

export function clear(node: HTMLElement): void {
  node.replaceChildren();
}

export function $(sel: string): HTMLElement {
  const node = document.querySelector(sel);
  if (!node) throw new Error(`Element not found: ${sel}`);
  return node as HTMLElement;
}

let toastTimer: number | undefined;
/** Brief status message in the HUD. */
export function toast(message: string, ms = 2200): void {
  const hud = document.getElementById('hud');
  if (!hud) return;
  document.querySelector('.toast')?.remove();
  const t = el('div', { class: 'toast', text: message });
  hud.append(t);
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => t.remove(), ms);
}
