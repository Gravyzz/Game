import { defineConfig } from 'vite';
import path from 'path';

// Конфиг сборки. Алиасы синхронизированы с tsconfig.json — добавляешь там, добавляй и здесь.
export default defineConfig({
  base: './', // относительные пути — игра должна жить и в подпапке, и внутри webview
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
        // Phaser в отдельный чанк — кэшируется браузером отдельно от нашего кода
        manualChunks: {
          phaser: ['phaser'],
        },
      },
    },
  },
  server: {
    port: 5173,
    host: true,
  },
});
