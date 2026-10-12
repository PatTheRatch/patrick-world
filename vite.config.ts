import { rm } from 'node:fs/promises';
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
      // Everything under data/ is private: the GitHub record, evidence packs (README text)
      // and the generated understanding. None of it ships.
      await rm(resolve(outDir, 'data'), { recursive: true, force: true });
    },
  };
}

export default defineConfig({
  plugins: [preact(), keepPrivateDataOut()],
  server: { port: 5199, strictPort: true },
  test: { include: ['src/**/*.test.ts'] },
});
