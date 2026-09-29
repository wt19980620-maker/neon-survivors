import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  server: { port: Number(process.env.PORT) || 5173, host: true },
  build: { chunkSizeWarningLimit: 2000 },
});
