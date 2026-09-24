/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import { wgslLoader } from './tools/wgsl-loader.ts';

export default defineConfig({
  // Relative asset URLs so the build works from any sub-path (GitHub Pages serves /<repo>/).
  base: './',
  plugins: [wgslLoader()],
  build: {
    // Top-level await + modern syntax; WebGPU browsers all support ES2022+.
    target: 'esnext',
    sourcemap: true,
  },
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
  },
});
