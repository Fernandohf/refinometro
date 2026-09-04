import { describe, expect, it } from 'vitest';
import { renderToString } from 'react-dom/server';
import { createElement } from 'react';

import { arquivosDePagina, PAGINAS_DE_CONTEUDO } from '../src/paginas';
import { enderecoDe, PAGINAS, SITE } from '../src/data/seo';
import { Sobre } from '../src/components/Sobre';
import { chanceOf } from '../src/engine/refine';
import { porcento } from '../src/format';

/*
  As páginas de referência falham do mesmo jeito que o resto do SEO falha:
  caladas. Uma tabela que virou cópia velha continua bonita na tela; dois
  títulos iguais fazem o Google escolher um e esconder o outro sem avisar; um
  canônico copiado da página vizinha entrega as duas como duplicata. Nada disso
  quebra o build, aparece na tela ou some do ar — só para de trazer gente.

  O `base` dos testes é `/` (o de dev). O do build é `/refinometro/`, e a
  diferença entre os dois é o que o teste dos links internos vigia.
*/

const BASE = '/';
const arquivos = arquivosDePagina(BASE);
const paginas = PAGINAS_DE_CONTEUDO.map((c, i) => ({ conteudo: c, html: arquivos[i]!.html }));

describe('as páginas de referência', () => {
  it('publica exatamente as páginas que o sitemap anuncia, na mesma ordem', () => {
    // `PAGINAS` (em `data/seo.ts`) é o que vai para o sitemap e para os links
    // da tela; `PAGINAS_DE_CONTEUDO` (aqui) é o que o build emite como arquivo.
    // São duas listas porque a tela não pode importar o HTML das páginas — e
    // duas listas divergem. Se divergirem, o sitemap anuncia um 404 ou esconde
    // uma página, e nas duas hipóteses ninguém percebe.
    expect(PAGINAS_DE_CONTEUDO.map((c) => c.pagina)).toEqual([...PAGINAS]);
  });

  it('é linkada pela calculadora, e não só pelo sitemap', () => {
    // Página órfã é rastreada com má vontade e some do índice na primeira
    // faxina. A tela é a página com mais autoridade do site para emprestar.
    const tela = renderToString(createElement(Sobre));
    for (const pagina of PAGINAS) {
      expect(tela).toContain(`${pagina.slug}/`);
      expect(tela).toContain(pagina.rotulo);
    }
  });

  it('emite um arquivo por página, no caminho que responde com a barra final', () => {
    // `tabela-de-refino/index.html` é o que o GitHub Pages serve em
    // `/tabela-de-refino/`, que é o endereço declarado como canônico. Emitir
    // `tabela-de-refino.html` publicaria a página num endereço que o canônico
    // não aponta — e o Google indexaria uma e receberia a outra.
    for (const [i, a] of arquivos.entries()) {
      expect(a.nome).toBe(`${PAGINAS_DE_CONTEUDO[i]!.pagina.slug}/index.html`);
    }
  });

  it('dá a cada página um slug próprio, sem barra e sem maiúscula', () => {
    const slugs = PAGINAS_DE_CONTEUDO.map((c) => c.pagina.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
    for (const slug of slugs) expect(slug).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
  });

  it('dá a cada página um título e uma descrição próprios, e do tamanho que cabe', () => {
    // Dois títulos iguais fazem o Google tratar as páginas como a mesma coisa e
    // mostrar só uma. É o jeito mais rápido de publicar três páginas e ser
    // encontrado por uma.
    const titulos = PAGINAS_DE_CONTEUDO.map((c) => c.pagina.titulo);
    const descricoes = PAGINAS_DE_CONTEUDO.map((c) => c.pagina.descricao);
    expect(new Set(titulos).size).toBe(titulos.length);
    expect(new Set(descricoes).size).toBe(descricoes.length);

    for (const c of PAGINAS_DE_CONTEUDO) {
      expect(c.pagina.titulo.length).toBeLessThanOrEqual(70);
      expect(c.pagina.descricao.length).toBeLessThanOrEqual(165);
      expect(c.pagina.descricao.length).toBeGreaterThan(60);
      // O <h1> não repete o nome do site: quem já está na página não precisa
      // dele, e o título é que concorre numa lista de resultados.
      expect(c.h1).not.toContain(SITE.nome);
    }
  });

  it('aponta o canônico de cada página para ela mesma', () => {
    // O erro clássico ao criar a segunda página é copiar a primeira e esquecer
    // esta linha — e aí as duas se declaram a mesma URL, que é um pedido
    // explícito para o Google descartar uma delas.
    for (const { conteudo, html } of paginas) {
      const url = enderecoDe(conteudo.pagina.slug);
      expect(html).toContain(`<link rel="canonical" href="${url}" />`);
      expect(html).toContain(`<title>${conteudo.pagina.titulo}</title>`);
      expect(html).toContain(`content="${url}"`); // og:url
    }
  });

  it('tem exatamente um <h1>, e é o da página', () => {
    for (const { conteudo, html } of paginas) {
      expect(html.match(/<h1>/g)).toHaveLength(1);
      expect(html).toContain(`<h1>${conteudo.h1}</h1>`);
      expect(html).toContain('<html lang="pt-BR">');
    }
  });

  it('não depende de JavaScript nenhum para mostrar o conteúdo', () => {
    // É a razão de estas páginas existirem separadas do app: a resposta é uma
    // tabela que não muda, e servir isso através de um bundle que monta a
    // página no cliente devolveria o problema que o `index.html` da
    // calculadora tem que contornar à mão.
    for (const { html } of paginas) {
      expect(html).not.toMatch(/<script(?![^>]*application\/ld\+json)/i);
      expect(html).toContain('<table>');
    }
  });

  it('liga cada página à calculadora e às irmãs', () => {
    // Página órfã — que só o sitemap conhece — é rastreada com má vontade e
    // some do índice na primeira faxina. O que a mantém viva é link de dentro.
    for (const { conteudo, html } of paginas) {
      expect(html).toContain(`href="${BASE}"`);

      for (const outra of PAGINAS_DE_CONTEUDO) {
        if (outra.pagina.slug === conteudo.pagina.slug) continue;
        expect(html).toContain(`href="${BASE}${outra.pagina.slug}/"`);
      }
    }
  });

  it('usa o `base` do build em todo link interno', () => {
    // Em produção o site mora em `/refinometro/`, e não na raiz do domínio —
    // essa é de outro repositório. Um link interno que escape o `base` cai num
    // 404 do GitHub Pages, e o rastreador conclui que a página aponta para o
    // vazio.
    for (const { html } of arquivosDePagina('/refinometro/')) {
      expect(html).toContain('href="/refinometro/"');
      expect(html).not.toMatch(/href="\/(?!refinometro\/)/);
    }
  });
});

describe('o que as páginas declaram ao buscador', () => {
  const grafos = paginas.map(({ conteudo, html }) => {
    const bruto = html.match(/<script type="application\/ld\+json">(.*?)<\/script>/s)?.[1];
    expect(bruto, `sem JSON-LD em ${conteudo.pagina.slug}`).toBeDefined();
    return {
      conteudo,
      html,
      grafo: JSON.parse(bruto!) as { '@graph': Record<string, unknown>[] },
    };
  });

  it('prende cada página ao site e desenha a trilha', () => {
    for (const { conteudo, grafo } of grafos) {
      const url = enderecoDe(conteudo.pagina.slug);
      const web = grafo['@graph'].find((n) => n['@type'] === 'WebPage');
      expect(web).toMatchObject({ url, name: conteudo.h1, inLanguage: 'pt-BR' });
      expect(web!.isPartOf).toMatchObject({ url: SITE.url });

      const trilha = grafo['@graph'].find((n) => n['@type'] === 'BreadcrumbList');
      expect(trilha).toBeDefined();
    }
  });

  it('promete as mesmas respostas que a página mostra', () => {
    // Mesma regra da tela da calculadora: declarar uma resposta ao Google e
    // exibir outra é o que o próprio Google chama de conteúdo enganoso, e a
    // punição não vem com aviso.
    for (const { conteudo, html, grafo } of grafos) {
      const faq = grafo['@graph'].find((n) => n['@type'] === 'FAQPage') as
        | { mainEntity: unknown[] }
        | undefined;
      expect(faq?.mainEntity).toHaveLength(conteudo.perguntas.length);

      for (const { pergunta, resposta } of conteudo.perguntas) {
        expect(html).toContain(pergunta);
        expect(html).toContain(resposta.slice(0, 40));
      }
    }
  });

  it('escapa o `<` para um `</script>` no texto não fechar a tag', () => {
    for (const { html } of paginas) {
      const dentro = html.match(/<script type="application\/ld\+json">(.*?)<\/script>/s)?.[1];
      expect(dentro).not.toMatch(/<\/script/i);
    }
  });
});

describe('as tabelas contra os dados', () => {
  const tabelaDeRefino = paginas.find((p) => p.conteudo.pagina.slug === 'tabela-de-refino')!.html;

  it('publica a chance que o motor calcula, e não uma cópia', () => {
    // Este é o teste que autoriza a página a existir. Uma tabela de referência
    // copiada à mão fica errada no dia em que a base é atualizada e ninguém
    // percebe — e uma tabela errada é pior que tabela nenhuma, porque quem a lê
    // planeja uma campanha inteira em cima dela.
    //
    // A conferência é célula a célula, contra `chanceOf`: a mesma função que o
    // motor usa para montar o plano.
    for (const kind of ['w1', 'w4', 'w5', 'a2'] as const) {
      for (let para = 1; para <= 20; para++) {
        const chance = chanceOf(kind, para, false, false);
        if (chance === null) continue;
        expect(tabelaDeRefino).toContain(porcento(chance));
      }
    }
  });

  it('marca os alvos que as pessoas de fato procuram', () => {
    for (const alvo of ['+10', '+15', '+20']) {
      expect(tabelaDeRefino).toContain(`<tr class="marco"><th scope="row">${alvo}</th>`);
    }
  });

  it('distingue "não existe" de "zero por cento"', () => {
    // Equipamento Sombrio não é 0% no +11: ele para no +10, e as duas coisas se
    // planejam de formas completamente diferentes. Na tabela isso é o travessão.
    expect(tabelaDeRefino).toContain('<span class="vazio">—</span>');

    // No Grau a mesma distinção não cabe numa célula: abaixo do +11 não há linha
    // nenhuma, porque o processo não existe. Aí quem diz isso é a prosa.
    const grau = paginas.find((p) => p.conteudo.pagina.slug === 'grau')!.html;
    expect(grau).not.toContain('<th scope="row">+10</th>');
    expect(grau).toContain('<strong>não existe</strong>');
  });
});
