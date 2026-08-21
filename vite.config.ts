import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// `base` precisa bater com o nome do repositório no GitHub Pages
// (https://<user>.github.io/refinometro/). Em dev fica na raiz.
export default defineConfig(({ command }) => ({
  base: command === 'build' ? '/refinometro/' : '/',
  plugins: [react(), tailwindcss()],
}));
