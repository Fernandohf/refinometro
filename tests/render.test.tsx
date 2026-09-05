import { describe, expect, it, beforeAll } from 'vitest';
import { renderToString } from 'react-dom/server';

import App from '../src/App';
import { CurvaDeCusto } from '../src/components/CurvaDeCusto';
import { TabelaDeEstados } from '../src/components/Cadeia';
import { Resultado } from '../src/components/Resultado';
import { PRECOS_FIXOS } from './precosFixos';
import { calcular } from '../src/engine/plan';
import type { CalcInput } from '../src/engine/types';

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

describe('página', () => {
  it('deixa o apoio à vista, fora do trecho recolhido do rodapé', () => {
    const html = renderToString(<App />);

    // O rodapé esconde a proveniência atrás de um `hidden`, e o pedido não pode
    // cair junto: pedido escondido não é pedido. `hidden` aparece no HTML do
    // trecho recolhido, então o que se confere é que o botão vem DEPOIS dele —
    // fora da <div> que abre e fecha.
    const recolhido = html.indexOf('hidden=""');
    const botao = html.indexOf('buymeacoffee.com/fernandohf');
    expect(recolhido).toBeGreaterThan(-1);
    expect(botao).toBeGreaterThan(recolhido);

    expect(html).toContain('Me pague um café');
    // A caneca é desenhada no bundle, e não buscada no CDN da Buy Me a Coffee:
    // um <img> de lá entregaria o IP de todo visitante, tendo clicado ou não.
    expect(html).not.toContain('cdn.buymeacoffee.com');
    expect(html).toContain('rel="noreferrer noopener"');
  });

  it('abre o simulador de estoque com o que ficou salvo', () => {
    // Estoque salvo => o painel já vem aberto, com os campos do plano atual.
    localStorage.setItem(
      'refinometro:estoque:v1',
      JSON.stringify({ zeny: 500_000_000, itens: { 984: 300 }, copias: 2 }),
    );
    const html = renderToString(<App />);
    localStorage.removeItem('refinometro:estoque:v1');

    expect(html).toContain('Dá com o que eu tenho?');
    expect(html).toContain('Chance de chegar ao alvo');
    expect(html).toContain('Zeny em caixa');
    expect(html).toContain('Quero chegar com');
    expect(html).toContain('preencher mochila e caixa');
    expect(html).toContain('só o material, com o meu zeny');
    // Os campos são os materiais que se compra, não o minério fabricado.
    expect(html).toContain('Oridecon');
    expect(html).not.toContain('mín. 0');
  });

  it('renderiza sem estourar e já mostra um orçamento', () => {
    const html = renderToString(<App />);
    expect(html).toContain('Refin');
    expect(html).toContain('Orçamento recomendado');
    expect(html).toContain('Melhor estratégia');
    // O que levar para o jogo: quantidades da margem e cópias do equipamento.
    expect(html).toContain('Lista de compras');
    expect(html).toContain('Cópias do item');
    expect(html).toContain('Valor do item');
    // O padrão é Arma nv4 +0 → +10, que passa por minérios e Bênção.
    expect(html).toContain('Oridecon');
    expect(html).toContain('browiki.org');
  });

  it('põe o que muda a decisão antes do que só a explica', () => {
    // A ordem da coluna de resultado é a ordem das decisões de quem joga: o que
    // pode dar errado, quanto custa, como eu faço, no que o dinheiro vira, o
    // que eu compro, dá com o que eu tenho. Um aviso de perigo lido depois do
    // orçamento chega tarde — ele existe justamente para desmentir o número.
    //
    // As abas não mudam essa ordem, e é por isso que ela é conferida pelo
    // CONTEÚDO de cada painel, e não pelo rótulo da aba: os três rótulos vivem
    // juntos, lá em cima, antes de qualquer painel.
    //
    // O alvo é fixado aqui, e não herdado do padrão da tela: o aviso de quebra
    // é o primeiro item da ordem conferida, e só existe onde a falha pode
    // destruir o equipamento — uma Arma nv4 até o +10, não a nv5 do padrão,
    // que sobe de Éter e nunca quebra.
    localStorage.setItem(
      'refinometro:v1',
      JSON.stringify({ kind: 'w4', refinoAtual: 0, refinoAlvo: 10, grauAlvo: 'none' }),
    );
    const html = renderToString(<App />);
    localStorage.removeItem('refinometro:v1');

    const aviso = html.indexOf('Risco de quebra do item');
    const orcamento = html.indexOf('Orçamento recomendado');
    const estrategia = html.indexOf('Melhor estratégia');
    const zeny = html.indexOf('Para onde vai o zeny');
    const compras = html.indexOf('Comprar no mercado');
    const estoque = html.indexOf('Zeny em caixa');

    expect(aviso).toBeGreaterThan(-1);
    expect(aviso).toBeLessThan(orcamento);
    // A estratégia é o que se FAZ: vem antes da lista de compras, que é
    // derivada dela, e antes do simulador de estoque, que é conferência.
    expect(orcamento).toBeLessThan(estrategia);
    expect(estrategia).toBeLessThan(zeny);
    expect(zeny).toBeLessThan(compras);
    expect(compras).toBeLessThan(estoque);
    // O consumo por minério é a segunda vista da lista, não um painel: nem o
    // cabeçalho nem a coluna dele existem até alguém pedir. ("Minérios e
    // materiais" continua na página como nome de grupo do Sankey.)
    expect(html).not.toContain('Consumo por minério');
    expect(html).not.toContain('Ter em mãos');
    expect(html).toContain('por minério');
  });

  it('divide o resultado em três abas, e deixa fora delas o que governa as três', () => {
    // O orçamento e a margem mandam nas três perguntas — a lista de compras e o
    // simulador de estoque leem a mesma margem. Se o controle morasse na
    // primeira aba, ele estaria numa tela e o efeito, em outra.
    const html = renderToString(<App />);

    const orcamento = html.indexOf('Orçamento recomendado');
    const margem = html.indexOf('aria-label="Margem de segurança"');
    const lista = html.indexOf('role="tablist"');

    expect(orcamento).toBeLessThan(lista);
    expect(margem).toBeLessThan(lista);

    // Três abas, na ordem das prioridades, e só a primeira aberta.
    const rotulos = [...html.matchAll(/role="tab" [^>]*>(?:<[^>]*>)*([^<]+)/g)].map((m) => m[1]);
    expect(rotulos).toEqual(['O plano', 'O que comprar', 'O que eu tenho']);
    expect(html.match(/role="tab" [^>]*aria-selected="true"/g)).toHaveLength(1);
    expect(html.indexOf('aria-selected="true"')).toBeLessThan(html.indexOf('aria-selected="false"'));
  });

  it('não deixa pintura no elemento que o `until-found` esconde', () => {
    // `until-found` esconde o CONTEÚDO do elemento, não o elemento: a caixa
    // continua sendo desenhada. Com a borda, o fundo e a sombra no próprio
    // elemento escondido, todo balão fechado aparecia na tela como uma pílula
    // vazia — e eram dezenas deles, um por botão de informação da página.
    //
    // A regra que isso deixa: quem carrega o `hidden` não pinta nada; quem
    // pinta é a camada de dentro.
    const html = renderToString(<App />);

    const balao = html.match(/<span[^>]*role="note"[^>]*>/);
    expect(balao).not.toBeNull();
    expect(balao![0]).not.toContain('bg-camada');
    expect(balao![0]).not.toContain('border-contorno');
    expect(balao![0]).not.toContain('shadow-e3');
    // O painel de aba não pinta, mas espaçava — dois fechados somavam dois
    // respiros de nada no fim da página.
    const painel = html.match(/<div[^>]*role="tabpanel"[^>]*>/);
    expect(painel).not.toBeNull();
    expect(painel![0]).not.toContain('pt-4');
  });

  it('esconde o que está em aba fechada sem tirá-lo do documento', () => {
    // `display:none` some da busca do navegador, e um plano inteiro atrás de
    // duas abas fechadas deixaria de ser encontrável pelo Ctrl+F e pelos
    // buscadores. `until-found` esconde igual e continua achável — o navegador
    // abre a aba sozinho ao encontrar o trecho.
    const html = renderToString(<App />);

    // O SSR serializa `hidden` como booleano; a variante é reposta no cliente
    // (ver `useRevelavelPelaBusca`). O que o servidor precisa garantir é que o
    // conteúdo das abas fechadas ESTEJA no HTML.
    expect(html).toContain('role="tabpanel"');
    expect(html).toContain('Comprar no mercado');
    expect(html).toContain('Chance de chegar ao alvo');
  });

  it('deixa a margem de segurança ao lado do número que ela muda', () => {
    // Antes ela era um <select> no fim do formulário, do outro lado da tela.
    const html = renderToString(<App />);
    expect(html).toContain('aria-label="Margem de segurança"');
    expect(html).toContain('aria-checked="true"');
  });

  it('mostra o item com a arte do Divine Pride e o nome do jogo', () => {
    // Com um item escolhido, a tela deixa de falar em "Arma nv4" e passa a
    // mostrar o equipamento como ele vai ficar: arte, +refino e [slots].
    localStorage.setItem(
      'refinometro:v1',
      JSON.stringify({
        itemNome: 'Lâmina Nêmesis',
        itemId: 1163,
        itemSlots: 2,
        kind: 'w4',
        // O refino alvo entra explícito: é ele que o nome exibe, e o teste é
        // sobre o formato do nome, não sobre o padrão da tela.
        refinoAlvo: 10,
        grauAlvo: 'none',
      }),
    );
    const html = renderToString(<App />);
    localStorage.removeItem('refinometro:v1');

    // A arte vem por URL do id, sem passar pela base varrida nem por CORS.
    expect(html).toContain('static.divine-pride.net/images/items/collection/1163.png');
    expect(html).toContain('Lâmina Nêmesis');
    // Nome no formato do cliente: +refino antes, [slots] depois.
    expect(html).toContain('+10');
    expect(html).toContain('[2]');
    // E a origem continua conferível.
    expect(html).toContain('divine-pride.net/database/item/1163');
  });

  it('oferece a cadeia dentro da fase, sem custar nada a quem não abre', () => {
    // A cadeia era um painel próprio que repetia a estratégia com outra
    // granularidade. Agora as duas leituras finas abrem dentro da fase que
    // explicam — e continuam não custando render a quem não pede.
    const html = renderToString(<App />);
    expect(html).not.toContain('A cadeia de decisões');
    expect(html).toContain('ver estado por estado');
    expect(html).toContain('Simular');
    // Fechadas: nem a tabela de estados nem o percurso são renderizados.
    expect(html).not.toContain('Falta gastar');
    expect(html).not.toContain('recomeçar');
  });

  it('reparte o custo degrau a degrau, sem perder nem inventar zeny', () => {
    // A tabela ganhou o `nesta etapa` ao lado do `falta gastar`. Ele é a
    // diferença entre o que falta gastar num estado e no seguinte, então a
    // soma da coluna PRECISA dar o custo da campanha: sobrando ou faltando
    // zeny, a tabela estaria contando um degrau duas vezes ou escondendo um.
    //
    // É o número que a tabela existia para não dar: `falta gastar` cai suave
    // porque é acumulado, e escondia que um degrau só come a maior parte.
    const input: CalcInput = {
      kind: 'w4',
      precoItem: 30_000_000,
      refinoAtual: 0,
      refinoAlvo: 11,
      grauAtual: 'none',
      grauAlvo: 'none',
      evento: false,
      precos: PRECOS_FIXOS,
      usarBencaoFerreiro: true,
      usarMineriosEspeciais: true,
      perdaAceitavel: true,
    };
    const fase = calcular(input).fases.find((f) => f.politica?.length)!;
    const politica = fase.politica!;
    const html = renderToString(<TabelaDeEstados politica={politica} alvo={11} />);

    expect(html).toContain('Nesta etapa');
    expect(html).toContain('Falta gastar');

    // Os títulos das duas colunas trazem o número exato: é por eles que se
    // confere a conta, e não pelo texto abreviado da barra.
    const etapas = [...html.matchAll(/title="([\d.]+)z para sair do \+(\d+)/g)];
    expect(etapas).toHaveLength(politica.length);

    const numero = (s: string) => Number(s.replaceAll('.', ''));
    const soma = etapas.reduce((t, m) => t + numero(m[1]!), 0);
    // Arredondado zeny a zeny, uma vez por linha.
    expect(soma).toBeCloseTo(Math.round(fase.custoEsperado), -1);

    // E nenhum degrau sai negativo: subir um refino nunca devolve dinheiro.
    for (const m of etapas) expect(numero(m[1]!)).toBeGreaterThanOrEqual(0);
  });

  it('oferece o plano sem risco quando ele ganha na margem exibida', () => {
    // O motor minimiza a média; o número grande da tela é um percentil. Quando
    // as duas coisas discordam, a página tem que dizer — senão marcar "posso
    // perder o item", que só deveria abrir caminhos, PIORA o orçamento exibido
    // em silêncio. Ver `AlternativaSegura`, em engine/plan.ts.
    const alvo: CalcInput = {
      kind: 'w5',
      precoItem: 200_000,
      refinoAtual: 6,
      refinoAlvo: 9,
      grauAtual: 'none',
      grauAlvo: 'D',
      evento: true,
      precos: { ...PRECOS_FIXOS, 6635: 6_000_000 },
      usarBencaoFerreiro: true,
      usarMineriosEspeciais: true,
      perdaAceitavel: true,
    };
    const plano = calcular(alvo, { execucoes: 4_000, tempoMs: 30_000, comparar: true });
    const html = renderToString(
      <Resultado plano={plano} margem="p90" onMargem={() => {}} />,
    );

    expect(html).toContain('o plano sem risco de quebra sai mais barato');
    // As três linhas da comparação, com o orçamento da margem escolhida em cima.
    expect(html).toContain('Orçamento (90%)');
    expect(html).toContain('Custo médio');
    expect(html).toContain('Itens destruídos');
    // E o caminho para chegar nele, que é o único jeito de agir sobre o aviso.
    expect(html).toContain('posso perder o item');

    // Sem pedir a comparação não há bloco nenhum: ele custa uma campanha
    // inteira a mais, e quem paga por ela é o passe preciso, no Worker.
    const rapido = calcular(alvo, { execucoes: 4_000, tempoMs: 30_000 });
    const semBloco = renderToString(
      <Resultado plano={rapido} margem="p90" onMargem={() => {}} />,
    );
    expect(semBloco).not.toContain('sem risco de quebra');
  });

  it('desenha o Sankey do custo colado na lista de compras', () => {
    // O desenho e a tabela são a mesma conta lida de dois jeitos, no mesmo
    // percentil: são painéis vizinhos de propósito, e nessa ordem — a
    // proporção primeiro, o que se leva ao jogo depois. Longe do orçamento,
    // que é outro total (o percentil da soma, não a soma dos percentis).
    //
    // Alvo fixado pelo mesmo motivo do teste da ordem: os grupos "Proteção" e
    // "Reposição do item" só aparecem em campanha que compra Bênção e quebra
    // equipamento, e a nv5 do padrão não faz nem uma coisa nem outra.
    localStorage.setItem(
      'refinometro:v1',
      JSON.stringify({ kind: 'w4', refinoAtual: 0, refinoAlvo: 10, grauAlvo: 'none' }),
    );
    const html = renderToString(<App />);
    localStorage.removeItem('refinometro:v1');
    const orcamento = html.indexOf('Orçamento recomendado');
    const sankey = html.indexOf('Para onde vai o zeny');
    const compras = html.indexOf('Lista de compras');
    const tabela = html.indexOf('Preço un.');

    expect(orcamento).toBeLessThan(sankey);
    expect(sankey).toBeLessThan(compras);
    expect(compras).toBeLessThan(tabela);
    // Os grupos por natureza do gasto, que é o que o desenho acrescenta.
    expect(html).toContain('Proteção');
    expect(html).toContain('Reposição do item');
    // E o desenho é acessível por texto, não só por faixa colorida.
    expect(html).toContain('<title');
  });

  it('separa, na lista de alvos, perder refino de perder o item', () => {
    // Um ⚠ só para tudo acima do limite seguro escondia a diferença que mais
    // muda a decisão: subir de +10 para +12 numa Arma nv4 só derruba o refino
    // na falha; sair do +0 para o mesmo +12 atravessa a faixa em que todo
    // minério destrói o equipamento.
    localStorage.setItem(
      'refinometro:v1',
      JSON.stringify({ kind: 'w4', refinoAtual: 0, refinoAlvo: 10 }),
    );
    const doZero = renderToString(<App />);
    localStorage.removeItem('refinometro:v1');

    // Até o limite seguro a opção sai limpa; acima dele, marcada.
    expect(doZero).toContain('>+4</option>');
    expect(doZero).toContain('>+10 ⚠</option>');
    expect(doZero).toContain('Não há caminho até lá sem arriscar o equipamento');

    localStorage.setItem(
      'refinometro:v1',
      JSON.stringify({ kind: 'w4', refinoAtual: 10, refinoAlvo: 12 }),
    );
    const doDez = renderToString(<App />);
    localStorage.removeItem('refinometro:v1');

    expect(doDez).toContain('>+12 ↓</option>');
    expect(doDez).toContain('a falha derruba o refino, mas o item sobrevive');
    // E o mesmo alvo, agora alcançável sem risco, perde o ⚠.
    expect(doDez).not.toContain('>+12 ⚠</option>');
  });

  it('desenha a distribuição do custo com o ponto na margem escolhida', () => {
    // O número da margem sozinho não mostra por que subir de 90% para 99% custa
    // tão caro: isso está na forma da distribuição, não na fila de percentis.
    localStorage.setItem('refinometro:v1', JSON.stringify({ margem: 'p90' }));
    const html = renderToString(<App />);
    localStorage.removeItem('refinometro:v1');

    const orcamento = html.indexOf('Orçamento recomendado');
    const curva = html.indexOf('Cada faixa é a fatia das campanhas simuladas');
    const compras = html.indexOf('Lista de compras');

    // O desenho fica entre o número que ele explica e o que se leva ao jogo.
    expect(curva).toBeGreaterThan(orcamento);
    expect(curva).toBeLessThan(compras);
    // A área acesa é a chance escolhida, e o ponto pousa no percentil dela.
    expect(html).toContain('A margem escolhida, 90%, cai em');
    // O texto acessível do desenho é uma string só, então dá para conferir a
    // frase inteira; a legenda visível é interpolada e o SSR corta os nós com
    // comentários no meio, o que não sobrevive a um `toContain`.
    expect(html).toContain('cobre 90% delas');
    // E a cauda que não cabe na escala é dita, não cortada em silêncio.
    expect(html).toContain('O bloco solto na ponta é a cauda');
  });

  it('só alisa a curva de custo onde o serrilhado é ruído de amostragem', () => {
    // Duas doenças com o mesmo sintoma. Num alvo caro as faixas se encostam e o
    // serrilhado é erro de amostragem — 5 mil campanhas em 48 faixas dão ~10%
    // de ruído em cada uma. Num alvo barato os degraus SÃO o dado: no +7 os
    // custos se juntam em blocos de 31,66 mi, o preço de repor o item, e o vão
    // entre dois blocos é custo que não pode acontecer. Alisar o segundo caso
    // desenharia uma rampa contínua por cima de valores impossíveis.
    const traco = (refinoAlvo: number) => {
      const input: CalcInput = {
        kind: 'w4',
        precoItem: 30_000_000,
        refinoAtual: 0,
        refinoAlvo,
        grauAtual: 'none',
        grauAlvo: 'none',
        evento: false,
        precos: PRECOS_FIXOS,
        usarBencaoFerreiro: true,
        usarMineriosEspeciais: true,
        perdaAceitavel: true,
      };
      const r = calcular(input);
      const c = r.simulacao!.custo;
      const html = renderToString(
        <CurvaDeCusto
          amostras={r.simulacao!.amostras.custo}
          media={r.custoEsperado}
          escolhida={{ rotulo: '90%', chance: 0.9, valor: c.p90 }}
          margens={[c.p50, c.p75, c.p90, c.p95, c.p99]}
        />,
      );
      return { html, ds: [...html.matchAll(/ d="([^"]+)"/g)].map((m) => m[1]!) };
    };

    const barato = traco(7);
    const caro = traco(11);

    // O `Q` é a assinatura da curva: quadrática, e não escada.
    expect(caro.ds.some((d) => d.includes('Q'))).toBe(true);
    expect(barato.ds.some((d) => d.includes('Q'))).toBe(false);
    // E onde os degraus ficam, a legenda diz de onde eles vêm.
    expect(barato.html).toContain('Os degraus separados são os itens destruídos');
    expect(caro.html).not.toContain('Os degraus separados');

    // Quadrática nunca sai do triângulo dos seus pontos: nenhum traço pode
    // estourar acima do pico nem mergulhar abaixo do eixo entre duas faixas.
    for (const d of [...barato.ds, ...caro.ds]) {
      expect(d).not.toMatch(/NaN|Infinity|undefined/);
      for (const [, y] of d.matchAll(/[-\d.]+,([-\d.]+)/g)) {
        expect(Number(y)).toBeGreaterThanOrEqual(28);
        expect(Number(y)).toBeLessThanOrEqual(98);
      }
    }
  });

  it('credita todas as fontes, cada uma dizendo o que fornece', () => {
    // Nenhum número da tela é do projeto: as chances são da divulgação oficial da
    // GNJOY, os minérios e custos de NPC do Browiki, a taxa do refinador do balcão
    // do jogo, os itens do Divine Pride e os preços do usuário. Se uma fonte sumir
    // do rodapé, a página passa a se apresentar como autora.
    const html = renderToString(<App />);

    expect(html).toContain('De onde vêm os números');
    expect(html).toContain('ro.gnjoyamericas.com/pt/news/probability/2');
    expect(html).toContain('ro.gnjoyamericas.com/pt/news/probability/27');
    expect(html).toContain('browiki.org/wiki/Refinamento');
    expect(html).toContain('browiki.org/wiki/Grau');
    expect(html).toContain('divine-pride.net');
    // A base é datada e contada na própria página, para não envelhecer calada.
    expect(html).toMatch(/\d{2}\/\d{2}\/\d{4}/);
    // E a calculadora não se confunde com o jogo nem com a fonte dos dados.
    expect(html).toContain('sem vínculo com a Gravity');
  });
});
