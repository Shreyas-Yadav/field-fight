import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  base: './',
  server: {
    proxy: {
      '/socket.io': {
        target: 'http://localhost:3001',
        ws: true,
        changeOrigin: true,
      },
      '/api': {
        target: 'http://localhost:3002',
        changeOrigin: true,
      },
      '/auth': {
        target: 'http://localhost:3003',
        changeOrigin: true,
      },
      '/matches': {
        target: 'http://localhost:3004',
        changeOrigin: true,
      },
    },
  },
});
