import { defineConfig } from 'vite';
import path from 'path';

export default defineConfig({
  base: './',
  resolve: {
    alias: {
      '@config': path.resolve(__dirname, 'src/config'),
      '@core': path.resolve(__dirname, 'src/core'),
      '@scenes': path.resolve(__dirname, 'src/scenes'),
      '@minigames': path.resolve(__dirname, 'src/minigames'),
      '@ui': path.resolve(__dirname, 'src/ui'),
      '@utils': path.resolve(__dirname, 'src/utils'),
      '@i18n': path.resolve(__dirname, 'src/i18n'),
    },
  },
  build: {
    target: 'es2020',
    sourcemap: true,
    rollupOptions: {
      output: {
        manualChunks: (id: string) => {
          if (id.includes('node_modules/phaser')) return 'phaser';
          return undefined;
        },
      },
    },
  },
  server: {
    port: 5173,
    host: true,
  },
});
