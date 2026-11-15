import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

const ruta = (r: string) => fileURLToPath(new URL(r, import.meta.url));

/**
 * Compila las pantallas de /web junto con el motor en navegador en UN solo index.html
 * (código, estilos y fuentes incluidos) que se puede subir a GitHub Pages tal cual.
 */
export default defineConfig({
  base: './',
  plugins: [react(), tailwindcss(), viteSingleFile()],
  resolve: {
    alias: [
      { find: '@/lib/transporte', replacement: ruta('./src/transporte.ts') }, // motor local en lugar del servidor
      { find: 'next/link', replacement: ruta('./src/shims/link.tsx') },
      { find: 'next/navigation', replacement: ruta('./src/shims/navigation.ts') },
      { find: /^@\//, replacement: ruta('../web/src/') },
    ],
    // Las pantallas viven en /web: sus dependencias se toman siempre de este proyecto.
    dedupe: ['react', 'react-dom', 'swr', 'lucide-react', 'clsx'],
  },
  build: { assetsInlineLimit: 100_000_000, chunkSizeWarningLimit: 5000, cssCodeSplit: false },
});
