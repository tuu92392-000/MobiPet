import 'dotenv/config';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  root: here,
  plugins: [react()],
  resolve: { alias: { '@shared': path.resolve(here, '../shared') } },
  server: {
    port: 5273,
    strictPort: true,
    fs: { allow: [path.resolve(here, '..')] },
    proxy: {
      '/api': {
        target: `http://localhost:${process.env.PORT ?? 3101}`,
        configure(proxy) {
          // When the API restarts, end the browser's SSE stream too so EventSource reconnects.
          proxy.on('proxyRes', (proxyRes, _req, res) => {
            proxyRes.on('close', () => {
              if (!res.writableEnded) res.end();
            });
          });
        },
      },
    },
  },
  build: { outDir: path.resolve(here, '../dist'), emptyOutDir: true },
});
