import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

import { cabecalhoSEO, HOME, PAGINAS, sitemap } from './src/data/seo';
import { arquivosDePagina } from './src/paginas';

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
function seo(base: string): Plugin {
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

    /**
     * As páginas de referência, servidas em dev também.
     *
     * Sem isto elas só existiriam depois de `npm run build`, e a única forma de
     * conferir uma tabela seria publicando — que é como se erra uma tabela e só
     * se descobre pelo Search Console três semanas depois.
     */
    configureServer(server) {
      const paginas = new Map(
        arquivosDePagina('/').map((a) => [`/${a.nome.replace(/index\.html$/, '')}`, a.html]),
      );

      server.middlewares.use((req, res, next) => {
        // O endereço canônico tem a barra final; sem ela, o navegador resolveria
        // os links relativos a partir do diretório errado.
        const caminho = req.url?.split('?')[0] ?? '';
        const html = paginas.get(caminho.endsWith('/') ? caminho : `${caminho}/`);
        if (!html) return next();

        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        res.end(html);
      });
    },

    generateBundle() {
      // `base` é `/refinometro/` no build: os links internos das páginas de
      // referência precisam do prefixo, ou apontariam para a raiz do domínio,
      // que é de outro repositório.
      for (const { nome, html } of arquivosDePagina(base)) {
        this.emitFile({ type: 'asset', fileName: nome, source: html });
      }

      this.emitFile({
        type: 'asset',
        fileName: 'sitemap.xml',
        source: sitemap([HOME, ...PAGINAS]),
      });
    },
  };
}

// `base` precisa bater com o nome do repositório no GitHub Pages
// (https://<user>.github.io/refinometro/). Em dev fica na raiz.
export default defineConfig(({ command }) => {
  const base = command === 'build' ? '/refinometro/' : '/';
  return { base, plugins: [react(), tailwindcss(), seo(base)] };
});
