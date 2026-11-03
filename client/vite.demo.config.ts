// Browser-only demo build for GitHub Pages: `npm run build:demo` → dist-demo/.
// No server: the real API routes run in the page (client/demo/transport.ts), data lives in the
// visitor's localStorage, AI uses templates only, and no environment value reaches the bundle.
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const demo = (file: string) => path.resolve(here, 'demo', file);

/** Node-only (or HTTP-only) modules and their in-browser replacements. */
const REPLACE: Record<string, string> = {
  [path.resolve(root, 'server/store.ts')]: demo('store.ts'),
  [path.resolve(root, 'server/events.ts')]: demo('events.ts'),
  [path.resolve(root, 'server/ai/client.ts')]: demo('aiClient.ts'),
  [path.resolve(root, 'server/ai/log.ts')]: demo('aiLog.ts'),
  [path.resolve(root, 'server/auth/hash.ts')]: demo('hash.ts'),
  [path.resolve(here, 'src/api/transport.ts')]: demo('transport.ts'),
  [path.resolve(here, 'src/lib/stream.ts')]: demo('stream.ts'),
  [path.resolve(here, 'src/config/build.ts')]: demo('build.ts'),
};

function replaceModules(): Plugin {
  return {
    name: 'mobipet-demo-replace',
    enforce: 'pre',
    async resolveId(source, importer, options) {
      if (!importer || !(source.startsWith('.') || source.startsWith('/'))) return null;
      const resolved = await this.resolve(source, importer, { ...options, skipSelf: true });
      const target = resolved && REPLACE[resolved.id];
      // A replacement may import the module it replaces only through another replaced path, never itself.
      return target && target !== importer ? target : null;
    },
  };
}

export default defineConfig({
  root: here,
  // Must match the GitHub repository name exactly: https://tuu92392-000.github.io/MobiPet/
  base: '/MobiPet/',
  plugins: [replaceModules(), react()],
  resolve: {
    alias: {
      '@shared': path.resolve(root, 'shared'),
      express: demo('express.ts'),
      exceljs: path.resolve(root, 'node_modules/exceljs/dist/exceljs.min.js'),
    },
  },
  // Server code reads a few optional settings from process.env; in the page they are all unset (defaults).
  define: { 'process.env': '{}' },
  server: { port: 5373, strictPort: true },
  preview: { port: 5374, strictPort: true },
  build: { outDir: path.resolve(root, 'dist-demo'), emptyOutDir: true, chunkSizeWarningLimit: 2500 },
});
