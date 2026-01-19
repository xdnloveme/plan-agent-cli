import { defineConfig } from 'tsup';

export default defineConfig((options) => ({
  entry: ['src/index.ts'],
  format: ['esm'],
  dts: true,
  sourcemap: true,
  // Don't clean in watch mode to avoid breaking imports
  clean: !options.watch,
  treeshake: true,
  splitting: false,
  minify: false,
}));
