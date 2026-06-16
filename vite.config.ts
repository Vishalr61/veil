import { defineConfig } from 'vite';

// base: './' emits relative asset paths so the production build also runs from
// file:// inside Capacitor's native WebView (iOS/Android), not just a web server.
export default defineConfig({
  base: './',
  server: { host: true },
  build: {
    outDir: 'dist',
    target: 'es2020',
    sourcemap: true,
  },
});
