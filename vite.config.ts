import { defineConfig } from 'vite';

// Served from the domain root (Vercel and most static hosts), so base is '/'.
// The standalone single-file build uses its own config (base './').
export default defineConfig(() => ({
  base: '/',
  server: {
    host: true, // expose on LAN so a phone can reach the dev server
  },
  preview: {
    host: true,
  },
}));
