import { resolve } from 'node:path';
import { defineConfig } from 'vitest/config';
import { pwa } from './tools/pwa/plugin.ts';

// The site is served from https://<user>.github.io/ebody/, so every URL is
// prefixed with /ebody/. Game data is produced by `npm run assets` into
// assets/generated/ and served as static files from there.
export default defineConfig({
  base: '/ebody/',
  publicDir: 'assets/generated',
  plugins: [pwa()],
  input: {
    main: resolve(import.meta.dirname, 'index.html'),
    levels: resolve(import.meta.dirname, 'levels.html'),
    sprites: resolve(import.meta.dirname, 'sprites.html'),
  },
  test: {
    include: ['src/**/*.test.ts', 'tools/**/*.test.ts'],
  },
});
