import { rm, rmdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import preact from '@preact/preset-vite';
import type { Plugin } from 'vite';
import { defineConfig } from 'vitest/config';

/**
 * public/data/ holds the owner's private GitHub record. The dev server serves it; a
 * production build must not ship it. Vite copies `public/` wholesale, so the copy is
 * taken back out once the bundle is written.
 */
function keepPrivateDataOut(): Plugin {
  let outDir = 'dist';
  return {
    name: 'keep-private-data-out',
    apply: 'build',
    configResolved(config) {
      outDir = resolve(config.root, config.build.outDir);
    },
    async closeBundle() {
      await rm(resolve(outDir, 'data', 'github.json'), { force: true });
      // Leave no empty folder behind; if anything else lives there, it stays.
      await rmdir(resolve(outDir, 'data')).catch(() => undefined);
    },
  };
}

export default defineConfig({
  plugins: [preact(), keepPrivateDataOut()],
  server: { port: 5199, strictPort: true },
  test: { include: ['src/**/*.test.ts'] },
});
