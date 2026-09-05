/*
  O que o site diz sobre si mesmo para quem não é o navegador de um jogador: o
  buscador que indexa a página, o cartão de link que o Discord e o WhatsApp
  desenham, e o rastreador do Google — que renderiza a calculadora inteira
  antes de decidir do que ela trata.

  Está tudo aqui, e não solto no `index.html`, porque cada frase aparecia em
  três lugares — `<title>`, `og:title`, `twitter:title` — e três cópias de uma
  frase divergem na primeira vez que alguém melhora só uma. O `index.html`
  guarda um marcador `<!-- seo -->`; quem o preenche é o plugin `seo()` do
  `vite.config.ts`, em dev e no build.

  As perguntas de `FAQ` descem para a tela também (ver `components/Sobre.tsx`):
  o dado estruturado de FAQ só é honesto quando a resposta que ele declara ao
  buscador é a mesma que o visitante lê — e é por isso que a resposta aqui é
  texto puro, sem link nem negrito no meio.
*/

/** Endereço público do site. Com a barra final: é a raiz do GitHub Pages. */
const URL_BASE = 'https://fernandohf.github.io/refinometro/';

export const SITE = {
  url: URL_BASE,
  nome: 'Refinômetro',

  /*
    O título é a linha que o buscador mostra em negrito e a única que muitos
    vão ler. Ele carrega, na ordem, o que a página é e para onde ela vale:
    calculadora, simulador, refino, Ragnarok Latam. "Refinômetro" vem antes por
    ser o nome pelo qual quem já usou volta a procurar.
  */
  titulo: 'Refinômetro — Calculadora e Simulador de Refino do Ragnarok Latam',

  /*
    A descrição não muda a posição no resultado, mas decide o clique. Por isso
    ela responde à pergunta em vez de se apresentar: quanto custa, em quê, e até
    onde. Cabe nos ~160 caracteres que o Google mostra sem cortar.
  */
  descricao:
    'Calculadora e simulador de refino do Ragnarok Latam: quanto zeny, quantos ' +
    'minérios e quantas cópias do item para chegar ao +10, ao +15 e ao Grau A.',

  /** Cartão de link (1200×630). Servido de `public/`, na raiz do site. */
  imagem: `${URL_BASE}og.png`,
  imagemAlt:
    'Refinômetro — calculadora e simulador de refino do Ragnarok Latam, com o ' +
    'custo esperado de uma campanha de refino.',

  autor: 'Fernando Ferreira',
  repositorio: 'https://github.com/Fernandohf/refinometro',

  /** Cor da barra do navegador no celular: o `--color-fundo` do tema escuro. */
  corDoTema: '#090d15',
} as const;

/**
 * As perguntas que chegam de fora — as que alguém digita no buscador antes de
 * conhecer o nome do projeto.
 *
 * Não é a mesma lista do `docs/README.md`: aquelas são perguntas de quem já
 * está usando ("por que o plano escolheu Enriquecido?"), estas são de quem
 * ainda não sabe que a página existe. Resposta em texto puro, uma ideia por
 * frase, porque ela é lida em dois lugares — na tela e no resultado da busca.
 */
/**
 * A pergunta cuja resposta a tela AMPLIA, em vez de só exibir.
 *
 * A resposta aqui é texto puro, como todas — é ela que vai ao buscador. Mas a
 * proveniência tem link para cada fonte e ressalvas que não cabem numa frase,
 * e isso desce logo abaixo dela na tela (ver `components/Fontes.tsx`). O nome
 * da pergunta é a costura entre os dois arquivos: comparar strings soltas
 * quebraria calado no dia em que alguém reescrevesse a pergunta.
 */
export const PERGUNTA_DAS_FONTES = 'De onde vêm os números?';

export const FAQ: readonly { pergunta: string; resposta: string }[] = [
  {
    pergunta: 'O que é o Refinômetro?',
    resposta:
      'É uma calculadora e um simulador de refino do Ragnarok Latam. Você escolhe o item, ' +
      'o refino atual e aonde quer chegar, e ele responde quanto zeny, quantos minérios e ' +
      'quantas cópias do equipamento a campanha custa — com o minério certo em cada nível, ' +
      'e não uma receita fixa.',
  },
  {
    pergunta: 'Os números valem para o Ragnarok Latam?',
    resposta:
      'Valem. As chances de refino e de grau vêm da divulgação oficial da GNJOY Americas, que ' +
      'é a operadora do servidor; os minérios e as penalidades de falha vêm do Browiki, o wiki ' +
      'do LATAM; e os itens vêm do Divine Pride no servidor LATAM. Em outro servidor as chances ' +
      'mudam, e o resultado muda junto.',
  },
  {
    pergunta: 'Qual é a diferença entre a calculadora e o simulador?',
    resposta:
      'A calculadora resolve o custo esperado de forma exata: ela trata o refino como um ' +
      'processo de decisão de Markov e escolhe o minério ótimo de cada nível. O simulador ' +
      'roda milhares de campanhas com essa estratégia e mostra os percentis. Os dois são ' +
      'necessários porque a distribuição tem cauda longa: quem se planeja pela média fica ' +
      'sem recursos no meio do caminho quase metade das vezes.',
  },
  {
    pergunta: 'Como eu descubro quanto custa levar uma arma até o +10?',
    resposta:
      'Busque o item pelo nome, informe o refino atual e escolha +10 como alvo. O orçamento ' +
      'recomendado sai na margem de segurança que você escolher — 90% quer dizer que nove em ' +
      'cada dez campanhas terminam dentro daquele valor.',
  },
  {
    pergunta: 'A calculadora considera Grau?',
    resposta:
      'Considera, em Arma nível 5 e Armadura nível 2. Cada subida de Grau zera o refino de ' +
      'volta para +0, então um alvo como Grau A +11 vira cinco fases de refino, e o motor ' +
      'decide em que refino tentar cada subida e quanta Bênção de Éter comprar.',
  },
  {
    pergunta: 'Preciso instalar alguma coisa, pagar ou criar conta?',
    resposta:
      'Não. A página roda inteira no seu navegador, sem anúncio, sem cadastro e sem custo. ' +
      'Os preços que você digita ficam salvos só na sua máquina, e o código é aberto.',
  },
  {
    pergunta: 'De onde vêm os preços que já vêm preenchidos?',
    resposta:
      'São um retrato recente do mercado de lojas de jogador do LATAM, não uma tabela do ' +
      'jogo. Eles servem de ponto de partida: a cotação que entra na conta é a sua, e o ' +
      'orçamento só vale o que valerem os preços que você colocar.',
  },
  {
    pergunta: PERGUNTA_DAS_FONTES,
    resposta:
      'Nenhum número da tela é do projeto. As chances de refino e de grau vêm da divulgação ' +
      'oficial da GNJOY Americas; os minérios, as penalidades de falha e os custos de NPC vêm ' +
      'do Browiki; os itens vêm do Divine Pride no servidor LATAM; e a taxa do refinador foi ' +
      'conferida no balcão do NPC, categoria por categoria. Os preços são seus. É um projeto ' +
      'de fã, sem vínculo com a Gravity.',
  },
];

/* ─────────────────────────────────────────────────────────── as outras páginas */

/**
 * Uma página do site, do ponto de vista de quem a indexa.
 *
 * A calculadora é uma só, mas o site não é mais uma página só: as tabelas de
 * referência em `src/paginas/` respondem perguntas que a calculadora não
 * responde — "qual é a chance do +12?" é uma consulta, não um orçamento — e
 * cada pergunta dessas precisa de um endereço próprio para poder aparecer na
 * busca. Um site de uma URL só disputa um punhado de termos; o resto da cauda
 * longa não tem onde pousar.
 *
 * O que se declara aqui é só o que o buscador lê; o conteúdo mora com a página.
 */
export interface Pagina {
  /** Caminho a partir da raiz, sem barras nas pontas. `''` é a calculadora. */
  slug: string;
  titulo: string;
  descricao: string;
}

/** A calculadora, descrita como as outras páginas para caber no mesmo sitemap. */
export const HOME: Pagina = { slug: '', titulo: SITE.titulo, descricao: SITE.descricao };

/**
 * O endereço público de um slug.
 *
 * Sempre com a barra final, inclusive nas páginas internas: o GitHub Pages
 * serve `/tabela-de-refino/index.html` nos dois endereços, e sem a barra o
 * canônico apontaria para o que redireciona em vez de para o que responde.
 */
export function enderecoDe(slug: string): string {
  return slug ? `${SITE.url}${slug}/` : SITE.url;
}

/**
 * As páginas de referência: o que o buscador lê sobre cada uma.
 *
 * Só os metadados moram aqui; o conteúdo mora em `src/paginas/`, que é um
 * módulo do BUILD. A separação não é arrumação — é o que permite a tela
 * LINKAR para estas páginas sem arrastar o HTML delas para o bundle da
 * calculadora, já que `src/paginas/` carrega as tabelas inteiras em texto.
 *
 * E a tela precisa linkar: uma página que só o sitemap conhece é rastreada com
 * má vontade e some do índice na primeira faxina. `rotulo` é o texto desse
 * link — curto, porque ele aparece no meio de uma frase, e não como título.
 */
export const REFERENCIAS = {
  tabelaDeRefino: {
    slug: 'tabela-de-refino',
    titulo: 'Tabela de Chances de Refino do Ragnarok Latam — Refinômetro',
    descricao:
      'A chance de sucesso de cada nível de refino, do +1 ao +20, por categoria de item, ' +
      'com minério comum e com minério de chance aumentada. Dados oficiais do LATAM.',
    rotulo: 'tabela de chances de refino',
  },
  minerios: {
    slug: 'minerios',
    titulo: 'Minérios de Refino do Ragnarok Latam: qual usar em cada faixa',
    descricao:
      'Todos os minérios de refino do Ragnarok Latam: em que categoria e faixa cada um ' +
      'serve, quais aumentam a chance, quais protegem da quebra e o que o NPC cobra.',
    rotulo: 'minérios de refino',
  },
  grau: {
    slug: 'grau',
    titulo: 'Grau A, B, C e D no Ragnarok Latam: chances, materiais e custo',
    descricao:
      'Como funciona o Grau no Ragnarok Latam: a chance de cada degrau por refino, os ' +
      'materiais de cada subida, a Bênção de Éter e por que subir de Grau zera o refino.',
    rotulo: 'sistema de Grau',
  },
} as const satisfies Record<string, Pagina & { rotulo: string }>;

/**
 * As páginas de referência, na ordem em que aparecem no sitemap e no rodapé —
 * da pergunta mais procurada para a mais específica.
 */
export const PAGINAS: readonly (Pagina & { rotulo: string })[] = Object.values(REFERENCIAS);

/* ──────────────────────────────────────────────────────── o que vai no <head> */

/** Escapa o que vai dentro de um atributo HTML. */
export function atributo(valor: string): string {
  return valor.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
}

/**
 * Escapa o que vai como texto entre tags.
 *
 * As páginas de `src/paginas/` montam HTML com nome de item e nome de material
 * vindos dos dados, e um `&` num nome quebraria a marcação em silêncio.
 */
export function texto(valor: string): string {
  return valor.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/**
 * Empacota um JSON-LD na sua tag, com o `<` escapado.
 *
 * Todo `<` sai escapado na forma `\u003c`, que o JSON desfaz na leitura. Sem isso, um
 * `</script>` escrito dentro de uma resposta fecharia esta tag no meio do JSON
 * e levaria o resto da página junto.
 */
export function tagDeDados(dados: unknown): string {
  return (
    '<script type="application/ld+json">' +
    JSON.stringify(dados).replace(/</g, '\\u003c') +
    '</script>'
  );
}

/**
 * Dados estruturados, no formato que o Google lê.
 *
 * Duas coisas num grafo só: o que a página **é** (`WebApplication` — de graça,
 * em português, roda no navegador) e o que ela **responde** (`FAQPage`). O
 * segundo há anos não rende mais aquele bloco de perguntas embaixo do
 * resultado, e continua aqui pelo que ele ainda faz: afirmar, sem depender de o
 * rastreador acertar a leitura do HTML, que esta página responde estas
 * perguntas.
 */
export function dadosEstruturados(): string {
  return JSON.stringify({
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'WebApplication',
        '@id': `${SITE.url}#app`,
        name: SITE.nome,
        alternateName: 'Calculadora de refino do Ragnarok Latam',
        url: SITE.url,
        description: SITE.descricao,
        applicationCategory: 'UtilitiesApplication',
        applicationSubCategory: 'Calculadora e simulador de refino de Ragnarok Online',
        operatingSystem: 'Qualquer sistema com navegador moderno',
        browserRequirements: 'Requer JavaScript.',
        inLanguage: 'pt-BR',
        isAccessibleForFree: true,
        image: SITE.imagem,
        author: { '@type': 'Person', name: SITE.autor },
        license: 'https://opensource.org/licenses/MIT',
        sameAs: [SITE.repositorio],
        // Sem `offers` não existe como declarar "custa zero" — e ser de graça é
        // metade do motivo de alguém clicar num resultado destes.
        offers: { '@type': 'Offer', price: '0', priceCurrency: 'BRL' },
        about: { '@type': 'VideoGame', name: 'Ragnarok Online', gamePlatform: 'PC' },
      },
      {
        '@type': 'FAQPage',
        '@id': `${SITE.url}#faq`,
        inLanguage: 'pt-BR',
        mainEntity: FAQ.map((f) => ({
          '@type': 'Question',
          name: f.pergunta,
          acceptedAnswer: { '@type': 'Answer', text: f.resposta },
        })),
      },
    ],
  });
}

/**
 * O `<head>` de uma página qualquer do site.
 *
 * `og:` e `twitter:` repetem título e descrição de propósito — é assim que os
 * dois protocolos funcionam —, mas repetem o MESMO argumento, que é o ponto de
 * tudo isto morar numa função só. O que muda de página para página são as três
 * primeiras linhas e o dado estruturado; o resto é o site se identificando, e
 * é igual em todas.
 *
 * O cartão de link é sempre o mesmo `og.png`. Uma imagem por página seria
 * melhor, mas uma imagem GENÉRICA por página não seria: o cartão que o Discord
 * desenha diz o nome do site, e isso é verdade em qualquer página dele.
 */
export function cabecalhoDePagina(pagina: Pagina, dados: unknown): string {
  const url = enderecoDe(pagina.slug);
  const meta = (chave: 'name' | 'property', nome: string, conteudo: string) =>
    `<meta ${chave}="${nome}" content="${atributo(conteudo)}" />`;

  return [
    `<title>${atributo(pagina.titulo)}</title>`,
    meta('name', 'description', pagina.descricao),
    meta('name', 'author', SITE.autor),

    // `max-snippet:-1` e `max-image-preview:large` liberam o trecho longo e a
    // miniatura grande. Sem eles vale o padrão conservador do Google, que na
    // Europa é um resumo curto e imagem nenhuma.
    meta('name', 'robots', 'index, follow, max-snippet:-1, max-image-preview:large'),

    // Canônico: o mesmo conteúdo responde com e sem a barra final, e sem esta
    // linha os dois endereços competem entre si e dividem a autoridade.
    `<link rel="canonical" href="${atributo(url)}" />`,

    meta('name', 'theme-color', SITE.corDoTema),
    meta('name', 'color-scheme', 'dark'),

    meta('property', 'og:type', 'website'),
    meta('property', 'og:site_name', SITE.nome),
    meta('property', 'og:locale', 'pt_BR'),
    meta('property', 'og:url', url),
    meta('property', 'og:title', pagina.titulo),
    meta('property', 'og:description', pagina.descricao),
    meta('property', 'og:image', SITE.imagem),
    meta('property', 'og:image:type', 'image/png'),
    meta('property', 'og:image:width', '1200'),
    meta('property', 'og:image:height', '630'),
    meta('property', 'og:image:alt', SITE.imagemAlt),

    meta('name', 'twitter:card', 'summary_large_image'),
    meta('name', 'twitter:title', pagina.titulo),
    meta('name', 'twitter:description', pagina.descricao),
    meta('name', 'twitter:image', SITE.imagem),
    meta('name', 'twitter:image:alt', SITE.imagemAlt),

    tagDeDados(dados),
  ].join('\n    ');
}

/** O bloco que substitui o marcador `<!-- seo -->` do `index.html`. */
export function cabecalhoSEO(): string {
  return cabecalhoDePagina(HOME, JSON.parse(dadosEstruturados()) as unknown);
}

/**
 * O sitemap.
 *
 * O que ele resolve não é descoberta — são poucas páginas, e todas se ligam
 * por link — e sim ter um endereço para entregar ao Search Console e uma data
 * de modificação que não dependa de o rastreador adivinhar. `lastmod` é a data
 * do build, e essa é a verdade: o site é republicado inteiro a cada push na
 * `main`.
 *
 * A calculadora vem com prioridade maior que as tabelas porque é ela que
 * responde à busca principal; as tabelas existem para a cauda longa, e dizer
 * ao rastreador que todas são igualmente centrais seria não dizer nada.
 */
export function sitemap(paginas: readonly Pagina[] = [HOME], hoje = new Date()): string {
  const data = hoje.toISOString().slice(0, 10);
  const entradas = paginas.map(
    (p) => `  <url>
    <loc>${enderecoDe(p.slug)}</loc>
    <lastmod>${data}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>${p.slug ? '0.7' : '1.0'}</priority>
  </url>`,
  );

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${entradas.join('\n')}
</urlset>
`;
}
