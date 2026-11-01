import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    host: true,
    port: 5173,
    proxy: { '/api': `http://localhost:${process.env.API_PORT ?? 8085}` },
  },
  build: { outDir: 'dist', sourcemap: true, chunkSizeWarningLimit: 900 },
});
