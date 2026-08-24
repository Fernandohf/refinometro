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
    expect(html).toContain('preencher com o mínimo');
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
    expect(html).toContain('Ter em mãos');
    expect(html).toContain('Valor do item');
    // O padrão é Arma nv4 +0 → +10, que passa por minérios e Bênção.
    expect(html).toContain('Oridecon');
    expect(html).toContain('browiki.org');
  });
});
