import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
const proxy = { '/api': process.env.API_TARGET || 'http://127.0.0.1:3001' };
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: { host: '127.0.0.1', port: 5173, strictPort: true, proxy },
  preview: { host: '127.0.0.1', proxy },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          validation: ['zod', 'react-hook-form', '@hookform/resolvers/zod'],
          vendor: ['react', 'react-dom', 'react-router-dom', '@tanstack/react-query'],
        },
      },
    },
  },
});
