import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['electron/main.ts', 'electron/preload.ts'],
  format: ['cjs'],
  outDir: 'electron/dist',
  target: 'node22',
  platform: 'node',
  bundle: true,
  splitting: false,
  sourcemap: false,
  clean: true,
  minify: false,
  external: [
    'electron',
  ],
});
