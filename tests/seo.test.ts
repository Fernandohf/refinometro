import { readdirSync, readFileSync } from 'node:fs';
import { beforeAll, describe, expect, it } from 'vitest';
import { renderToString } from 'react-dom/server';
import { createElement } from 'react';

import {
  cabecalhoSEO,
  dadosEstruturados,
  enderecoDe,
  FAQ,
  HOME,
  PAGINAS,
  SITE,
  sitemap,
} from '../src/data/seo';
import { Sobre } from '../src/components/Sobre';
import App from '../src/App';

// O App lê preferências salvas já no inicializador do useState, antes de
// qualquer efeito, então o teste precisa de um localStorage antes de renderizar.
beforeAll(() => {
  const memoria = new Map<string, string>();
  globalThis.localStorage = {
    getItem: (k: string) => memoria.get(k) ?? null,
    setItem: (k: string, v: string) => void memoria.set(k, v),
    removeItem: (k: string) => void memoria.delete(k),
    clear: () => memoria.clear(),
    key: (i: number) => [...memoria.keys()][i] ?? null,
    get length() {
      return memoria.size;
    },
  } as Storage;
});

/*
  O que se confere aqui não é gosto de redação: é o punhado de coisas cuja
  falha é MUDA. Um `<title>` que sumiu, um canônico apontando para o endereço
  errado ou um JSON-LD com uma vírgula a mais não quebram a página, não
  aparecem em nenhuma tela e não derrubam o deploy — só param de trazer gente,
  meses depois, sem nunca dizer por quê.
*/

const html = cabecalhoSEO();

describe('cabeçalho da busca', () => {
  it('carrega os termos pelos quais alguém procura esta página', () => {
    // A página existe para ser achada por quem digita "calculadora de refino
    // do ragnarok latam" — e essa pessoa não conhece a palavra "Refinômetro".
    // Título e descrição são o único lugar em que o buscador lê isso antes de
    // decidir renderizar a página.
    for (const termo of ['Calculadora', 'Simulador', 'Refino', 'Ragnarok Latam']) {
      expect(SITE.titulo).toContain(termo);
    }
    for (const termo of ['alculadora', 'simulador', 'refino', 'Ragnarok Latam']) {
      expect(SITE.descricao).toContain(termo);
    }

    // O Google corta o título perto dos 60 caracteres e a descrição perto dos
    // 160. Passar disso não é erro, mas o que sobra fica de fora do resultado.
    expect(SITE.titulo.length).toBeLessThanOrEqual(70);
    expect(SITE.descricao.length).toBeLessThanOrEqual(165);
  });

  it('aponta o canônico e as imagens para endereços absolutos do site', () => {
    // Um `og:image` relativo não é buscado por scraper nenhum, e um canônico
    // relativo vira o endereço de quem estiver visitando — inclusive o de um
    // site que tenha copiado a página.
    expect(SITE.url.startsWith('https://')).toBe(true);
    expect(SITE.url.endsWith('/')).toBe(true);
    expect(SITE.imagem.startsWith(SITE.url)).toBe(true);
    expect(html).toContain(`<link rel="canonical" href="${SITE.url}" />`);

    // Minúsculas: o GitHub Pages serve o host em minúsculas, e o dono do
    // repositório se escreve "Fernandohf". Duas grafias, dois endereços na
    // busca, e a autoridade dividida entre eles.
    expect(SITE.url).toBe(SITE.url.toLowerCase());
  });

  it('não deixa a página sair sem título nem sem permissão de indexação', () => {
    expect(html).toContain(`<title>${SITE.titulo}</title>`);
    expect(html).toContain('name="robots"');
    expect(html).toContain('index, follow');
    expect(html).not.toContain('noindex');
  });

  it('preenche o cartão de link nos dois protocolos', () => {
    // Open Graph para o Discord, o WhatsApp e o Facebook; `twitter:` para o X.
    // Falta um e o link vira uma linha de texto cinza.
    for (const tag of ['og:title', 'og:description', 'og:image', 'og:url', 'og:type']) {
      expect(html).toContain(`property="${tag}"`);
    }
    for (const tag of ['twitter:card', 'twitter:title', 'twitter:image']) {
      expect(html).toContain(`name="${tag}"`);
    }
    expect(html).toContain('summary_large_image');
  });

  it('injeta o cabeçalho no marcador do index.html, e só ali', () => {
    // O plugin do Vite falha se o marcador sumir (ver `vite.config.ts`), mas
    // isso só aparece na hora do build. Aqui aparece na hora do commit.
    const indice = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
    expect(indice).toContain('<!-- seo -->');
    expect(indice).not.toContain('<title>');
  });
});

describe('dados estruturados', () => {
  type No = { '@type': string; mainEntity?: unknown[] };
  const grafo = JSON.parse(dadosEstruturados()) as { '@graph': No[] };

  it('declara o que a página é: de graça, em português, e sobre qual jogo', () => {
    const app = grafo['@graph'].find((n) => n['@type'] === 'WebApplication') as
      | Record<string, unknown>
      | undefined;
    expect(app).toBeDefined();
    expect(app!.isAccessibleForFree).toBe(true);
    expect(app!.inLanguage).toBe('pt-BR');
    expect(app!.about).toMatchObject({ name: 'Ragnarok Online' });
  });

  it('promete ao buscador as mesmas respostas que a tela mostra', () => {
    // Este é o teste que justifica `FAQ` morar em `data/seo.ts`. Declarar uma
    // resposta ao Google e exibir outra na página é o que o próprio Google
    // chama de conteúdo enganoso — e a punição não vem com aviso.
    const faq = grafo['@graph'].find((n) => n['@type'] === 'FAQPage');
    expect(faq?.mainEntity).toHaveLength(FAQ.length);

    // Fechada, que é como a seção nasce: o conteúdo continua no documento sob
    // o `hidden`, e é isso que o rastreador lê.
    const tela = renderToString(createElement(Sobre, { aberto: false, onAlternar: () => {} }));
    for (const { pergunta, resposta } of FAQ) {
      expect(tela).toContain(pergunta);
      // O React escapa as aspas do texto, então a comparação é sobre o
      // primeiro trecho — o bastante para pegar uma resposta reescrita num
      // arquivo e esquecida no outro, que é o erro de que este teste trata.
      expect(tela).toContain(resposta.slice(0, 40));
    }
  });

  it('escapa o `<` para um `</script>` numa resposta não fechar a tag', () => {
    expect(dadosEstruturados().replace(/</g, '\\u003c')).not.toMatch(/<\/script/i);
  });
});

describe('verificação de propriedade', () => {
  it('serve o arquivo do Search Console, com o conteúdo que é o próprio nome', () => {
    // O Google só entrega os relatórios de busca de um site cuja propriedade foi
    // provada, e a prova é este arquivo respondendo na raiz da propriedade —
    // conferida de novo de tempos em tempos, não só uma vez. Apagá-lo, renomeá-lo
    // ou mexer na linha de dentro derruba a verificação em silêncio: a página
    // continua no ar, o build continua verde, e o relatório é que para de existir.
    //
    // `public/` é copiado verbatim para a raiz do site publicado, então o arquivo
    // sai em `/refinometro/googl....html` — que é a propriedade registrada.
    const publico = new URL('../public/', import.meta.url);
    const arquivos = readdirSync(publico).filter((f) => /^google\w+\.html$/.test(f));

    expect(arquivos).toHaveLength(1);
    const nome = arquivos[0]!;
    expect(readFileSync(new URL(nome, publico), 'utf8').trim()).toBe(
      `google-site-verification: ${nome}`,
    );
  });
});

describe('sitemap', () => {
  const xml = sitemap([HOME, ...PAGINAS], new Date('2026-01-15T10:00:00Z'));

  it('lista a raiz do site com a data do build', () => {
    expect(xml).toContain(`<loc>${SITE.url}</loc>`);
    expect(xml).toContain('<lastmod>2026-01-15</lastmod>');
  });

  it('lista também as páginas de referência, e nenhuma a mais', () => {
    // Uma página que o build emite mas o sitemap não lista é uma página que o
    // Search Console não sabe existir; uma que o sitemap lista mas o build não
    // emite é um 404 entregue ao Google de bandeja. As duas falham caladas.
    for (const p of PAGINAS) expect(xml).toContain(`<loc>${enderecoDe(p.slug)}</loc>`);
    expect(xml.match(/<loc>/g)).toHaveLength(1 + PAGINAS.length);
  });
});

describe('o que existe antes do JavaScript', () => {
  const indice = readFileSync(new URL('../index.html', import.meta.url), 'utf8');

  it('põe conteúdo de verdade dentro do #root vazio', () => {
    // Sem isto o HTML servido é uma <div> vazia. O rastreador do Google
    // renderiza a página e enxerga o resto; o do Bing, o cartão de link do
    // Discord e quem chega com o script bloqueado leem só este bloco.
    const root = indice.slice(indice.indexOf('<div id="root">'), indice.indexOf('<script'));
    expect(root).toContain('<h1');
    expect(root).toContain('Ragnarok Latam');
    expect(root).toContain('alculadora');
    expect(root).toContain('simulador');
    expect(root).toContain('<noscript>');
  });

  it('diz na tela o mesmo <h1> que o HTML servido mostra antes dela', () => {
    // `createRoot` limpa o #root no primeiro render: o cabeçalho estático é
    // trocado pelo do React, no mesmo lugar. Se os dois discordarem, o
    // buscador indexa um título que o visitante nunca vê — e quem chega vê a
    // página piscar de um cabeçalho para outro.
    expect(indice).toContain(APOIO);
    expect(renderToString(createElement(App))).toContain(APOIO);
  });
});

/** A linha de apoio do `<h1>`, que existe duas vezes: no HTML e no React. */
const APOIO = 'Calculadora e simulador de custo de refino do Ragnarok Latam.';
