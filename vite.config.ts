import { defineConfig } from 'vite';

// base is set to the repo name so the production build works on GitHub Pages
// (served from https://<user>.github.io/WalkThroughRoomMeasure/). The same base
// is used for `vite preview` so the built asset paths resolve; plain `vite dev`
// stays at '/' for convenience.
export default defineConfig(({ command, isPreview }) => ({
  base: command === 'build' || isPreview ? '/WalkThroughRoomMeasure/' : '/',
  server: {
    host: true, // expose on LAN so a phone can reach the dev server
  },
  preview: {
    host: true,
  },
}));
