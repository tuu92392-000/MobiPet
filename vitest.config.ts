import { defineConfig } from 'vitest/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: { alias: { '@shared': path.resolve(here, 'shared') } },
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
    // Shift math uses local time; pin it so results don't depend on where tests run.
    env: { TZ: 'America/New_York', MOBIPET_PERSIST: 'false', ANTHROPIC_API_KEY: '' },
  },
});
