import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 1200,
    rollupOptions: {
      output: { manualChunks: { three: ['three'], rapier: ['@dimforge/rapier3d-compat'] } },
    },
  },
  test: { environment: 'node', include: ['tests/**/*.test.ts'] },
});
