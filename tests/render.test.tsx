import { describe, expect, it, beforeAll } from 'vitest';
import { renderToString } from 'react-dom/server';

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

describe('página', () => {
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
    // A ordem da coluna de resultado é a ordem das perguntas: o que pode dar
    // errado, quanto custa, o que comprar. Um aviso de perigo lido depois do
    // orçamento chega tarde — ele existe justamente para desmentir o número.
    const html = renderToString(<App />);

    const aviso = html.indexOf('Risco de quebra do item');
    const orcamento = html.indexOf('Orçamento recomendado');
    const compras = html.indexOf('Lista de compras');
    const materiais = html.indexOf('Minérios e materiais');

    expect(aviso).toBeGreaterThan(-1);
    expect(aviso).toBeLessThan(orcamento);
    expect(orcamento).toBeLessThan(compras);
    // Consumo por minério é conferência: fica recolhido, atrás do resumo.
    expect(compras).toBeLessThan(materiais);
    expect(html).not.toContain('Ter em mãos');
    expect(html).toContain('ver detalhe');
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
      JSON.stringify({ itemNome: 'Lâmina Nêmesis', itemId: 1163, itemSlots: 2, kind: 'w4' }),
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

  it('oferece a cadeia de decisões sem custar nada a quem não abre', () => {
    const html = renderToString(<App />);
    expect(html).toContain('A cadeia de decisões');
    // Fechada: nem a tabela de estados nem o percurso são renderizados.
    expect(html).not.toContain('Falta gastar');
    expect(html).toContain('abrir');
  });

  it('desenha o Sankey do custo dentro da lista de compras', () => {
    // O desenho e a tabela são a mesma conta lida de dois jeitos, e ficam no
    // mesmo painel: a proporção no diagrama, o número que se leva ao jogo na
    // tabela.
    const html = renderToString(<App />);
    const compras = html.indexOf('Lista de compras');
    const sankey = html.indexOf('Para onde vai o zeny');
    const tabela = html.indexOf('Preço un.');

    expect(sankey).toBeGreaterThan(compras);
    expect(sankey).toBeLessThan(tabela);
    // Os grupos por natureza do gasto, que é o que o desenho acrescenta.
    expect(html).toContain('Proteção');
    expect(html).toContain('Reposição do item');
    // E o desenho é acessível por texto, não só por faixa colorida.
    expect(html).toContain('<title');
  });

  it('credita todas as fontes, cada uma dizendo o que fornece', () => {
    // Nenhum número da tela é do projeto: chances são do Browiki, a taxa do
    // refinador do iROwiki, os itens do Divine Pride e os preços do usuário.
    // Se uma fonte sumir do rodapé, a página passa a se apresentar como autora.
    const html = renderToString(<App />);

    expect(html).toContain('De onde vêm os números');
    expect(html).toContain('browiki.org/wiki/Refinamento');
    expect(html).toContain('browiki.org/wiki/Grau');
    expect(html).toContain('irowiki.org');
    expect(html).toContain('divine-pride.net');
    // A base é datada e contada na própria página, para não envelhecer calada.
    expect(html).toMatch(/\d{2}\/\d{2}\/\d{4}/);
    // E a calculadora não se confunde com o jogo nem com a fonte dos dados.
    expect(html).toContain('sem vínculo com a Gravity');
  });
});
