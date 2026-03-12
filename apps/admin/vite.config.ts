import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from 'tailwindcss';
import autoprefixer from 'autoprefixer';
import path from 'path';
import { loadRepoEnv } from '../../packages/config/src/load-env';

loadRepoEnv();

const devProxyTarget = process.env.VITE_DEV_PROXY_TARGET || 'http://localhost:4000';
const devHost = process.env.VITE_DEV_HOST || '127.0.0.1';
const devPort = Number(process.env.VITE_DEV_PORT || (process.platform === 'win32' ? '4173' : '5173'));

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  css: {
    postcss: {
      plugins: [
        tailwindcss({ config: path.resolve(__dirname, 'tailwind.config.js') }),
        autoprefixer(),
      ],
    },
  },
  server: {
    host: devHost,
    port: devPort,
    proxy: {
      '/api': {
        target: devProxyTarget,
        changeOrigin: true,
      },
      '/health': {
        target: devProxyTarget,
        changeOrigin: true,
      },
    },
  },
});
