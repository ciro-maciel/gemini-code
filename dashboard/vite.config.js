import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// The control server serves this build in production; in development Vite
// forwards the API, the OAuth return and the live screen's websocket to it.
const CONTROL = process.env.CONTROL_URL || 'http://localhost:8787'

export default defineConfig({
    plugins: [react()],
    server: {
        port: 5180,
        proxy: {
            '/api': { target: CONTROL, ws: true },
            '/oauth': { target: CONTROL },
        },
    },
    // noVNC ships top-level await.
    build: { target: 'esnext' },
    optimizeDeps: { esbuildOptions: { target: 'esnext' } },
})
