import { defineConfig } from 'vite';

// Served from a sub-folder of bentleyblanks.github.io (e.g. /badge-buster/).
// Relative base makes the build path-independent.
export default defineConfig({
  base: './',
  build: {
    outDir: 'dist',
    target: 'es2020',
    assetsInlineLimit: 0,
  },
});
