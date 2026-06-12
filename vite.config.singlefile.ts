import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

// Produces a single, fully self-contained dist-single/index.html with all JS,
// CSS and the sample image inlined — no separate files, no server. You can send
// this one file to anyone and they open it in any browser, offline.
export default defineConfig({
  base: './',
  plugins: [viteSingleFile()],
  build: {
    outDir: 'dist-single',
    target: 'es2018',
    assetsInlineLimit: 100_000_000, // inline every asset (incl. the sample image)
    cssCodeSplit: false,
    modulePreload: false,
    // Emit a single classic (non-module) IIFE bundle. iOS Quick Look and some
    // in-app webviews refuse <script type="module">, so a plain script is the
    // most broadly runnable form for a file you send around.
    rollupOptions: {
      output: { format: 'iife', inlineDynamicImports: true },
    },
  },
});
