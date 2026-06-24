import { defineConfig } from 'vite';

// base: './' so the built bundle works when served from /badge-buster-ai/
// on GitHub Pages. dist/ is copied up to ../ (the deployed folder).
export default defineConfig({
  base: './',
  build: {
    target: 'es2022',
    assetsInlineLimit: 0,
  },
});
