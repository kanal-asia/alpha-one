import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/server/alpha-server.ts', 'src/server/alpha-infra-server.ts'],
  format: ['esm'],
  outDir: 'dist/server',
  target: 'node22',
  platform: 'node',
  bundle: true,
  splitting: false,
  sourcemap: false,
  clean: true,
  minify: false,
  external: [
    // OpenCode binary is resolved at runtime, not imported
    'opencode-ai',
    // node:sqlite is experimental built-in, must not be bundled
    'node:sqlite',
  ],
  banner: {
    js: `import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);`,
  },
  noExternal: [
    'express',
    'cors',
    'dotenv',
  ],
  define: {
    'import.meta.url': 'import.meta.url',
  },
});
