/*
  A moldura das páginas de referência.

  Estas páginas não são a calculadora: são as tabelas que ela consulta,
  publicadas como texto. Quem chega nelas digitou uma pergunta fechada — "qual
  a chance do +12", "o Oridecon Perfeito aumenta a chance" — e quer a linha da
  tabela, não um orçamento. A calculadora fica a um link de distância para
  quando a pergunta seguinte for "e quanto isso custa", que é a que ela responde
  e a tabela não.

  Por que HTML cru, sem React e sem o bundle do app:

  A resposta destas páginas é uma tabela que não muda enquanto o wiki não mudar.
  Servir isso através de um bundle de 320 kB que monta a página no cliente
  significaria que o texto só existe depois do JavaScript — exatamente o
  problema que o `#root` pré-preenchido do `index.html` contorna à mão na
  calculadora. Aqui não há o que contornar: o documento inteiro sai pronto do
  build, com o CSS embutido, e é a página completa no primeiro byte. Para quem
  lê e para quem indexa dá no mesmo; a diferença é que dá no mesmo SEMPRE, e
  não só quando o script carrega.

  O preço disso é não reaproveitar os componentes da tela. É um preço baixo: o
  que estas páginas desenham são tabelas e parágrafos, e nada aqui tem estado.
*/

import {
  atributo,
  cabecalhoDePagina,
  enderecoDe,
  SITE,
  texto,
  type Pagina,
} from '../data/seo';

/** Uma pergunta que a página responde à vista, e declara ao buscador. */
export interface Pergunta {
  pergunta: string;
  resposta: string;
}

/**
 * Uma página de referência.
 *
 * `resumo` é texto puro e não HTML porque ele vai para dois lugares — o
 * parágrafo de abertura e o `description` do dado estruturado — e o segundo não
 * aceita marcação.
 */
export interface PaginaDeConteudo {
  pagina: Pagina;
  /**
   * O `<h1>`. Não é o `<title>`: o título carrega o nome do site porque
   * concorre com outros resultados numa lista; o `<h1>` é lido por quem já
   * está na página, e ali o nome do site é ruído.
   */
  h1: string;
  resumo: string;
  /** De onde vêm os números desta página. */
  fonte: { nome: string; url: string };
  perguntas: readonly Pergunta[];
  /** O miolo, em HTML. `base` é o prefixo dos links internos. */
  corpo: (base: string) => string;
}

/* ────────────────────────────────────────────────────────────── ferramentas */

/**
 * Uma célula de tabela. `null` é "não existe", que não é o mesmo que zero.
 *
 * Texto e número saem escapados — as células vêm dos dados, e um `&` num nome
 * de item quebraria a marcação. Uma célula que precisa de marcação de verdade
 * (a cor que separa "destrói o item" de "cai 1 refino") tem que dizer isso com
 * `cru()`, e aí a responsabilidade de escapar é de quem chamou. O tipo é o que
 * torna essa escolha visível na revisão em vez de acidental.
 */
export type Celula = string | number | null | { readonly cru: string };

/** Marca uma célula como HTML pronto, que `tabela()` não deve escapar. */
export function cru(html: string): { readonly cru: string } {
  return { cru: html };
}

/**
 * Uma tabela com cabeçalho, dentro de um contêiner que rola.
 *
 * A rolagem é do contêiner e não da página: uma tabela de nove colunas não cabe
 * num telefone, e deixar a PÁGINA rolar de lado por causa dela quebra a leitura
 * de todo o resto. `null` vira o travessão de "não existe" — o Grau A não é 0%
 * no +10, ele é impossível ali, e as duas coisas se planejam diferente.
 *
 * A primeira coluna sai como `<th scope="row">`: é ela que diz de que nível ou
 * de que minério a linha fala, e sem isso a tabela não faz sentido para quem a
 * lê fora da vista, célula por célula.
 */
export function tabela(
  legenda: string,
  colunas: readonly string[],
  linhas: readonly (readonly Celula[])[],
  classePorLinha: (linha: readonly Celula[], i: number) => string = () => '',
): string {
  const th = colunas.map((c) => `<th scope="col">${texto(c)}</th>`).join('');

  const corpo = linhas
    .map((linha, i) => {
      const celulas = linha.map((c, coluna) => {
        const conteudo =
          c === null
            ? '<span class="vazio">—</span>'
            : typeof c === 'object'
              ? c.cru
              : texto(String(c));
        return coluna === 0 ? `<th scope="row">${conteudo}</th>` : `<td>${conteudo}</td>`;
      });
      const classe = classePorLinha(linha, i);
      return `<tr${classe ? ` class="${atributo(classe)}"` : ''}>${celulas.join('')}</tr>`;
    })
    .join('\n          ');

  return `<div class="rolagem">
        <table>
          <caption>${texto(legenda)}</caption>
          <thead><tr>${th}</tr></thead>
          <tbody>
          ${corpo}
          </tbody>
        </table>
      </div>`;
}

/** Uma seção com título — o `<h2>` que estrutura a página. */
export function secao(titulo: string, id: string, ...blocos: string[]): string {
  return `<section id="${atributo(id)}">
      <h2>${texto(titulo)}</h2>
      ${blocos.join('\n      ')}
    </section>`;
}

/** Um parágrafo. O HTML de dentro é escrito por nós, não vem dos dados. */
export function p(html: string): string {
  return `<p>${html}</p>`;
}

/** Um link para fora — são wikis de terceiros, e por isso `nofollow`. */
export function externo(url: string, rotulo: string): string {
  return `<a href="${atributo(url)}" rel="noopener nofollow">${texto(rotulo)}</a>`;
}

/* ──────────────────────────────────────────────────────────────── o documento */

/**
 * O dado estruturado da página.
 *
 * `WebPage` diz o que ela é e a prende ao site (`isPartOf`); `BreadcrumbList`
 * dá ao buscador a trilha "Refinômetro › esta página", que é o que ele mostra
 * no lugar da URL crua no resultado; `FAQPage` declara as perguntas do fim — e
 * elas estão à vista na página, que é a condição para poder declará-las.
 */
function dadosDaPagina(c: PaginaDeConteudo, url: string): unknown {
  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'WebPage',
        '@id': url,
        url,
        name: c.h1,
        description: c.resumo,
        inLanguage: 'pt-BR',
        isPartOf: {
          '@type': 'WebSite',
          '@id': `${SITE.url}#site`,
          name: SITE.nome,
          url: SITE.url,
        },
        about: { '@type': 'VideoGame', name: 'Ragnarok Online', gamePlatform: 'PC' },
        author: { '@type': 'Person', name: SITE.autor },
        license: 'https://opensource.org/licenses/MIT',
      },
      {
        '@type': 'BreadcrumbList',
        '@id': `${url}#trilha`,
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: SITE.nome, item: SITE.url },
          { '@type': 'ListItem', position: 2, name: c.h1, item: url },
        ],
      },
      {
        '@type': 'FAQPage',
        '@id': `${url}#faq`,
        inLanguage: 'pt-BR',
        mainEntity: c.perguntas.map((f) => ({
          '@type': 'Question',
          name: f.pergunta,
          acceptedAnswer: { '@type': 'Answer', text: f.resposta },
        })),
      },
    ],
  };
}

/** As perguntas, à vista. O que se declara ao buscador é exatamente isto. */
function perguntasHTML(perguntas: readonly Pergunta[]): string {
  const itens = perguntas
    .map(
      (f) => `<div class="qa">
          <dt>${texto(f.pergunta)}</dt>
          <dd>${texto(f.resposta)}</dd>
        </div>`,
    )
    .join('\n        ');

  return `<section id="perguntas">
      <h2>Perguntas frequentes</h2>
      <dl>
        ${itens}
      </dl>
    </section>`;
}

/**
 * O documento inteiro, pronto para virar arquivo.
 *
 * `outras` são as páginas irmãs, para o rodapé. Uma página órfã — que só o
 * sitemap conhece — é rastreada com má vontade e some do índice na primeira
 * faxina; o que a mantém viva é ter link de dentro do site apontando para ela.
 */
export function documento(
  c: PaginaDeConteudo,
  base: string,
  outras: readonly PaginaDeConteudo[],
): string {
  const url = enderecoDe(c.pagina.slug);

  const irmas = outras
    .filter((o) => o.pagina.slug !== c.pagina.slug)
    .map((o) => `<li><a href="${atributo(`${base}${o.pagina.slug}/`)}">${texto(o.h1)}</a></li>`)
    .join('\n          ');

  return `<!doctype html>
<html lang="pt-BR">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    ${cabecalhoDePagina(c.pagina, dadosDaPagina(c, url))}
    <link rel="icon" href="${atributo(ICONE)}" />
    <style>${ESTILO}</style>
  </head>
  <body>
    <header class="topo">
      <a class="marca" href="${atributo(base)}">Refinô<span>metro</span></a>
      <nav aria-label="Trilha">
        <a href="${atributo(base)}">Calculadora</a> <span aria-hidden="true">›</span>
        <span aria-current="page">${texto(c.h1)}</span>
      </nav>
    </header>

    <main>
      <h1>${texto(c.h1)}</h1>
      <p class="resumo">${texto(c.resumo)}</p>

      <p class="chamada">
        Esta página é a tabela. Para saber <strong>quanto custa</strong> chegar a um refino — em
        zeny, em minérios e em cópias do item —
        <a href="${atributo(base)}">abra a calculadora</a>: ela resolve o minério ótimo de cada
        nível com os seus preços, e diz o risco de quebrar o item no caminho.
      </p>

      ${c.corpo(base)}

      ${perguntasHTML(c.perguntas)}
    </main>

    <footer>
      <p>
        Números de ${externo(c.fonte.url, c.fonte.nome)} — o wiki do próprio servidor —
        conferidos na data do build. Em outro servidor as chances mudam.
      </p>
      <nav aria-label="Outras páginas">
        <ul>
          <li><a href="${atributo(base)}">Calculadora de refino</a></li>
          ${irmas}
        </ul>
      </nav>
      <p class="miudo">
        Projeto de fã, de código aberto, sem vínculo com a Gravity.
        ${externo(SITE.repositorio, 'Código no GitHub')}.
      </p>
    </footer>
  </body>
</html>
`;
}

/** A bigorna do `index.html`, para a aba ser a mesma em todas as páginas. */
const ICONE =
  "data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>⚒️</text></svg>";

/*
  O CSS, embutido.

  São ~2 kB: buscá-los num arquivo à parte custaria uma ida ao servidor para
  economizar bytes que já caberiam no primeiro pacote da conexão. As cores são
  as do tema da calculadora (ver `src/index.css`), copiadas e não importadas —
  o Tailwind do app não alcança um arquivo que o build emite à parte, e repetir
  sete cores é mais barato que acoplar as duas coisas.
*/
const ESTILO = `
:root {
  --fundo: oklch(0.16 0.018 265);
  --superficie: oklch(0.195 0.02 265);
  --painel: oklch(0.225 0.022 265);
  --texto: oklch(0.93 0.01 265);
  --suave: oklch(0.755 0.02 265);
  --borda: oklch(0.34 0.025 265);
  --realce: oklch(0.8 0.15 85);
  --perigo: oklch(0.72 0.17 25);
  --ok: oklch(0.78 0.14 155);
  color-scheme: dark;
}
* { box-sizing: border-box; }
body {
  margin: 0;
  background: var(--fundo);
  color: var(--texto);
  font-family: ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif;
  font-size: 15px;
  line-height: 1.6;
  -webkit-font-smoothing: antialiased;
  overflow-wrap: break-word;
}
a { color: var(--realce); text-decoration: none; }
a:hover { text-decoration: underline; }
.topo, main, footer { max-width: 62rem; margin: 0 auto; padding: 0 1rem; }
.topo {
  display: flex; flex-wrap: wrap; align-items: baseline; gap: 0.5rem 1.25rem;
  padding-top: 1.5rem; padding-bottom: 0.5rem;
}
.marca { font-size: 1.25rem; font-weight: 600; letter-spacing: -0.01em; color: var(--texto); }
.marca span { color: var(--realce); }
.topo nav { font-size: 0.8125rem; color: var(--suave); }
h1 { font-size: clamp(1.5rem, 1.1rem + 1.6vw, 2rem); line-height: 1.2; margin: 1rem 0 0.5rem; }
h2 { font-size: 1.1875rem; margin: 2.5rem 0 0.75rem; scroll-margin-top: 1rem; }
h3 { font-size: 1rem; margin: 1.5rem 0 0.5rem; color: var(--suave); }
.resumo { font-size: 1.0625rem; color: var(--suave); max-width: 46rem; }
p { max-width: 46rem; }
.chamada {
  background: var(--superficie); border-left: 3px solid var(--realce);
  border-radius: 0 0.75rem 0.75rem 0; padding: 0.75rem 1rem; margin: 1.5rem 0;
  font-size: 0.9375rem; color: var(--suave);
}
.chamada strong { color: var(--texto); }
.rolagem {
  overflow-x: auto; margin: 1rem 0;
  border-radius: 0.75rem; background: var(--superficie);
}
table {
  border-collapse: collapse; width: 100%;
  font-size: 0.875rem; font-variant-numeric: tabular-nums;
}
caption {
  text-align: left; padding: 0.75rem 1rem 0.25rem;
  color: var(--suave); font-size: 0.8125rem;
}
th, td {
  padding: 0.4rem 0.75rem; text-align: right;
  white-space: nowrap; border-top: 1px solid var(--borda);
}
thead th { color: var(--suave); font-weight: 600; font-size: 0.8125rem; border-top: 0; }
th[scope='row'], thead th:first-child { text-align: left; }
tbody th[scope='row'] { font-weight: 600; }
tbody tr:hover { background: var(--painel); }
td.txt, th.txt { white-space: normal; }
.vazio { color: var(--borda); }
.quebra { color: var(--perigo); }
.segura { color: var(--ok); }
.marco th, .marco td { background: color-mix(in oklch, var(--realce) 9%, transparent); }
dl { margin: 0; }
.qa { margin-bottom: 1rem; max-width: 46rem; }
.qa dt { font-weight: 600; }
.qa dd { margin: 0.125rem 0 0; color: var(--suave); }
ul { padding-left: 1.25rem; max-width: 46rem; }
li { margin-bottom: 0.25rem; }
footer {
  margin-top: 3rem; padding-top: 1.5rem; padding-bottom: 3rem;
  border-top: 1px solid var(--borda); color: var(--suave); font-size: 0.875rem;
}
footer ul { list-style: none; padding: 0; display: flex; flex-wrap: wrap; gap: 0.5rem 1.25rem; }
.miudo { font-size: 0.8125rem; }
@media (max-width: 30rem) { th, td { padding: 0.4rem 0.5rem; } }
`;
