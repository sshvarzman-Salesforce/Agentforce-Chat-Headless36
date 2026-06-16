import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// base: './' makes the build work under a GitHub Pages subpath (/repo-name/).
// During `npm run dev`, /api is proxied to the local Express server so the
// frontend can use same-origin relative URLs in development.
export default defineConfig({
  base: './',
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:8787',
        changeOrigin: true,
      },
    },
  },
});
