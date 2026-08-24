import { describe, expect, it } from 'vitest';

import { COR_GRAU, nomeNoJogo, rotuloCurto } from '../src/data/rotulos';
import { GRADE_ORDER } from '../src/data/grade';

describe('nome do item como o jogo escreve', () => {
  it('monta +refino, [grau], nome e [slots] na ordem do cliente', () => {
    const p = nomeNoJogo('Adaga', 10, 'B', 2);
    expect(p.refino).toBe('+10');
    expect(p.grau).toBe('[B]');
    expect(p.nome).toBe('Adaga');
    expect(p.slots).toBe('[2]');
  });

  it('omite o que o jogo omite: +0, sem grau e sem slot', () => {
    // No jogo um item +0 não mostra "+0", e um sem fenda não mostra "[0]" —
    // escrevê-los faria a tela dizer coisas que a mochila não diz.
    const p = nomeNoJogo('Adaga', 0, 'none', 0);
    expect(p.refino).toBeNull();
    expect(p.grau).toBeNull();
    expect(p.slots).toBeNull();
    expect(p.nome).toBe('Adaga');
  });

  it('tem cor para todo grau que existe, e nenhuma para "sem grau"', () => {
    // As cores saem dos ícones itemgrade_*.png do Browiki. Um grau novo sem cor
    // cairia calado para `undefined` e sairia com a cor do texto comum.
    expect(COR_GRAU.none).toBeNull();
    for (const g of GRADE_ORDER.filter((x) => x !== 'none')) {
      expect(COR_GRAU[g]).not.toBeNull();
      expect(COR_GRAU[g]!.forte).toMatch(/^#[0-9A-F]{6}$/);
      expect(COR_GRAU[g]!.claro).toMatch(/^#[0-9A-F]{6}$/);
      expect(COR_GRAU[g]!.letra).toBe(g);
    }
    // Nenhum par de graus divide a mesma cor: a cor é o que os distingue. Vale
    // para as duas variantes — a tela escura usa `claro`, e uma colisão só ali
    // passaria despercebida no teste da outra.
    for (const chave of ['forte', 'claro'] as const) {
      const cores = GRADE_ORDER.filter((g) => g !== 'none').map((g) => COR_GRAU[g]![chave]);
      expect(new Set(cores).size).toBe(cores.length);
    }
  });

  it('tem rótulo curto para toda categoria', () => {
    expect(rotuloCurto('w4')).toBe('Arma nv4');
    expect(rotuloCurto('shadowA')).toBe('Equip. Sombrio');
  });
});
