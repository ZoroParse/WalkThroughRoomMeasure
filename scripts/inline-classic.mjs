// Post-process the single-file build so the inlined bundle runs as a classic
// script that executes after the DOM exists.
//
// Why: the bundle is emitted as an IIFE (no import/export/import.meta), so it
// can run as a plain <script>. iOS Quick Look and some in-app webviews refuse
// <script type="module">, so we drop that. But module scripts are deferred by
// default while a classic inline script runs immediately — and Vite injects it
// into <head>, before #app exists. So we also move the script to the end of
// <body>, guaranteeing the DOM is present when it runs.
import { readFileSync, writeFileSync } from 'node:fs';

const file = new URL('../dist-single/index.html', import.meta.url);
let html = readFileSync(file, 'utf8');

// Grab the (single) inlined bundle script, whatever attributes it carries.
const scriptRe = /<script\b[^>]*>([\s\S]*?)<\/script>/;
const match = html.match(scriptRe);
if (!match) {
  console.warn('[inline-classic] no inline script found — nothing changed');
  process.exit(0);
}

const code = match[1];
html = html.replace(scriptRe, ''); // remove from its original (head) position
const classic = `<script>${code}</script>`;
html = html.includes('</body>')
  ? html.replace('</body>', `${classic}</body>`)
  : html + classic;

writeFileSync(file, html);
console.log('[inline-classic] converted to classic script and moved to end of <body>');
