/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import { wgslLoader } from './tools/wgsl-loader.ts';

export default defineConfig({
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
