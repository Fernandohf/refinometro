/*
  As páginas de referência do site.

  A calculadora responde "quanto custa". Estas respondem "qual é o número" — e
  são perguntas diferentes, feitas por gente diferente, que precisam de
  endereços diferentes para poderem ser encontradas. Ver `docs/seo.md`.

  Este módulo é do BUILD, não do app: quem o importa é o plugin `seo()` do
  `vite.config.ts`. Nada em `src/App.tsx` pode importar daqui, ou o HTML destas
  páginas entra no bundle da calculadora para nunca ser usado.
*/

import { documento, type PaginaDeConteudo } from './documento';
import { TABELA_DE_REFINO } from './tabelaDeRefino';
import { MINERIOS } from './minerios';
import { GRAU } from './grau';

/**
 * A ordem importa: é a do rodapé de cada página, e vai da pergunta mais
 * procurada para a mais específica. A do sitemap vem de `PAGINAS`, em
 * `data/seo.ts`, e um teste amarra as duas listas.
 */
export const PAGINAS_DE_CONTEUDO: readonly PaginaDeConteudo[] = [
  TABELA_DE_REFINO,
  MINERIOS,
  GRAU,
];

/** Um arquivo por página: `<slug>/index.html`, que responde em `<slug>/`. */
export function arquivosDePagina(base: string): { nome: string; html: string }[] {
  return PAGINAS_DE_CONTEUDO.map((c) => ({
    nome: `${c.pagina.slug}/index.html`,
    html: documento(c, base, PAGINAS_DE_CONTEUDO),
  }));
}
