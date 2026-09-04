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
];

/* ──────────────────────────────────────────────────────── o que vai no <head> */

/** Escapa o que vai dentro de um atributo HTML. */
function atributo(valor: string): string {
  return valor.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
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
 * O bloco inteiro que substitui o marcador `<!-- seo -->` do `index.html`.
 *
 * `og:` e `twitter:` repetem título e descrição de propósito — é assim que os
 * dois protocolos funcionam —, mas repetem a MESMA constante, que é o ponto de
 * tudo isto morar num arquivo só.
 */
export function cabecalhoSEO(): string {
  const meta = (chave: 'name' | 'property', nome: string, conteudo: string) =>
    `<meta ${chave}="${nome}" content="${atributo(conteudo)}" />`;

  return [
    `<title>${atributo(SITE.titulo)}</title>`,
    meta('name', 'description', SITE.descricao),
    meta('name', 'author', SITE.autor),

    // `max-snippet:-1` e `max-image-preview:large` liberam o trecho longo e a
    // miniatura grande. Sem eles vale o padrão conservador do Google, que na
    // Europa é um resumo curto e imagem nenhuma.
    meta('name', 'robots', 'index, follow, max-snippet:-1, max-image-preview:large'),

    // Canônico: o mesmo conteúdo responde em `/refinometro` e em
    // `/refinometro/`, e sem esta linha os dois endereços competem entre si.
    `<link rel="canonical" href="${atributo(SITE.url)}" />`,

    meta('name', 'theme-color', SITE.corDoTema),
    meta('name', 'color-scheme', 'dark'),

    meta('property', 'og:type', 'website'),
    meta('property', 'og:site_name', SITE.nome),
    meta('property', 'og:locale', 'pt_BR'),
    meta('property', 'og:url', SITE.url),
    meta('property', 'og:title', SITE.titulo),
    meta('property', 'og:description', SITE.descricao),
    meta('property', 'og:image', SITE.imagem),
    meta('property', 'og:image:type', 'image/png'),
    meta('property', 'og:image:width', '1200'),
    meta('property', 'og:image:height', '630'),
    meta('property', 'og:image:alt', SITE.imagemAlt),

    meta('name', 'twitter:card', 'summary_large_image'),
    meta('name', 'twitter:title', SITE.titulo),
    meta('name', 'twitter:description', SITE.descricao),
    meta('name', 'twitter:image', SITE.imagem),
    meta('name', 'twitter:image:alt', SITE.imagemAlt),

    // Todo `<` sai escapado na forma `\u003c`, que o JSON desfaz na
    // leitura. Sem isso, um `</script>` escrito dentro de uma resposta
    // fecharia esta tag no meio do JSON e levaria o resto da página junto.
    '<script type="application/ld+json">' +
      dadosEstruturados().replace(/</g, '\\u003c') +
      '</script>',
  ].join('\n    ');
}

/**
 * O sitemap.
 *
 * Uma página só — o que ele resolve não é descoberta, e sim ter um endereço
 * para entregar ao Search Console e uma data de modificação que não dependa de
 * o rastreador adivinhar. `lastmod` é a data do build, e essa é a verdade: o
 * site é republicado inteiro a cada push na `main`.
 */
export function sitemap(hoje = new Date()): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>${SITE.url}</loc>
    <lastmod>${hoje.toISOString().slice(0, 10)}</lastmod>
    <changefreq>weekly</changefreq>
  </url>
</urlset>
`;
}
