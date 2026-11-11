import { defineConfig } from 'vite';

export default defineConfig({
  // Relativo: serve tanto na raiz de um domínio quanto numa subpasta (GitHub Pages).
  base: './',
  build: { chunkSizeWarningLimit: 1800 },
});
