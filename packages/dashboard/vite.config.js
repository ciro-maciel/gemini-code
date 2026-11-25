import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

import { demoSite } from './src/demo/vite-plugin.js';

// The control server serves this build in production; in development Vite
// forwards the API, the OAuth return and the live screen's websocket to it.
const CONTROL = process.env.CONTROL_URL || 'http://localhost:8787';

export default defineConfig(({ mode }) => {
  // `--mode demo`: the public demo on GitHub Pages (src/demo/), with an
  // in-browser fake API and no control server, so no proxy either.
  const isDemo = mode === 'demo';
  return {
    // A branch preview builds under /gemini-code/preview/<branch>/ (DEMO_BASE, set by the demo workflow).
    base: isDemo ? process.env.DEMO_BASE || '/gemini-code/' : '/',
    plugins: [react(), ...(isDemo ? [demoSite()] : [])],
    server: {
      port: 5180,
      proxy: isDemo
        ? undefined
        : {
            '/api': { target: CONTROL, ws: true },
            '/oauth': { target: CONTROL },
          },
    },
    // noVNC ships top-level await.
    build: {
      target: 'esnext',
      // Inside dist/, which git already ignores.
      ...(isDemo
        ? { outDir: 'dist/demo', rollupOptions: { input: 'demo.html' } }
        : {}),
    },
    optimizeDeps: { esbuildOptions: { target: 'esnext' } },
  };
});
