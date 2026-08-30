import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

import { cabecalhoSEO, sitemap } from './src/data/seo';

/**
 * Preenche o `<!-- seo -->` do `index.html` e emite o `sitemap.xml`.
 *
 * O `<head>` do site é gerado, e não escrito à mão, porque título e descrição
 * aparecem em três protocolos diferentes na mesma página — HTML, Open Graph e
 * Twitter — e mantê-los iguais à mão é a espécie de tarefa que ninguém erra na
 * primeira vez e todo mundo erra na quarta. A fonte é `src/data/seo.ts`, que é
 * o mesmo arquivo de onde a tela lê as perguntas frequentes.
 *
 * Roda em dev também: o que o navegador mostra em `npm run dev` é o que vai
 * para o ar, incluindo os dados estruturados — que dá para conferir no
 * Rich Results Test sem precisar publicar antes.
 */
function seo(): Plugin {
  const MARCADOR = '<!-- seo -->';

  return {
    name: 'refinometro:seo',

    transformIndexHtml: {
      order: 'pre',
      handler(html) {
        // Falhar alto: sem o marcador, a página subiria sem `<title>` e sem
        // nada — e um site sem título não é um bug que alguém note olhando.
        if (!html.includes(MARCADOR)) {
          throw new Error(`index.html perdeu o marcador ${MARCADOR} (ver src/data/seo.ts)`);
        }
        return html.replace(MARCADOR, cabecalhoSEO());
      },
    },

    generateBundle() {
      this.emitFile({ type: 'asset', fileName: 'sitemap.xml', source: sitemap() });
    },
  };
}

// `base` precisa bater com o nome do repositório no GitHub Pages
// (https://<user>.github.io/refinometro/). Em dev fica na raiz.
export default defineConfig(({ command }) => ({
  base: command === 'build' ? '/refinometro/' : '/',
  plugins: [react(), tailwindcss(), seo()],
}));
