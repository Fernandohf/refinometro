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
