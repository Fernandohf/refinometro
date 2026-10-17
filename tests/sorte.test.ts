import { describe, expect, it } from 'vitest';

import { campanhaEmMinerios } from '../src/engine/kit';
import { calcular } from '../src/engine/plan';
import { avaliarSorte, taxaPorUnidade, type Relato } from '../src/engine/sorte';
import type { CampanhaEmMateriais } from '../src/engine/estoque';
import type { CalcInput } from '../src/engine/types';
import { PRECOS_FIXOS } from './precosFixos';

const BASE: CalcInput = {
  kind: 'w4',
  precoItem: 50_000_000,
  refinoAtual: 0,
  refinoAlvo: 12,
  grauAtual: 'none',
  grauAlvo: 'none',
  evento: false,
  precos: PRECOS_FIXOS,
  usarBencaoFerreiro: true,
  usarMineriosEspeciais: false,
  perdaAceitavel: true,
  itemId: null,
  usarAtalhos: false,
};

function campanha(mudanca: Partial<CalcInput>): CampanhaEmMateriais {
  return campanhaEmMinerios(calcular({ ...BASE, ...mudanca }, { tempoMs: 300 }))!;
}

/** A execução `i` da simulação, contada como a pessoa contaria. */
function relatoDa(c: CampanhaEmMateriais, i: number): Relato {
  const n = c.execucoes;
  return {
    itens: Object.fromEntries(c.materiais.map((m, col) => [m.itemId, c.consumo[col * n + i]!])),
    quebras: c.quebras[i]!,
  };
}

/** A execução de custo mediano, a mais barata e a mais cara. */
function execucoes(c: CampanhaEmMateriais) {
  const ordem = Array.from(c.custo.keys()).sort((a, b) => c.custo[a]! - c.custo[b]!);
  return { sortuda: ordem[0]!, tipica: ordem[ordem.length >> 1]!, azarada: ordem[ordem.length - 1]! };
}

describe('quanta sorte teve quem já refinou', () => {
  // A taxa não é perguntada: sai do minério. Se esta soma não reproduzisse o
  // custo de cada campanha simulada, a pessoa seria comparada com uma régua que
  // não é a dela — e o veredito erraria sempre para o mesmo lado.
  it.each([
    ['refino com quebra', {}],
    ['minério de Cash Shop isento de taxa', { kind: 'w1' as const, refinoAlvo: 10, usarMineriosEspeciais: true }],
    ['refino e Grau', { kind: 'a2' as const, grauAlvo: 'A' as const, perdaAceitavel: false, usarMineriosEspeciais: true }],
    ['Sombrio', { kind: 'shadowW' as const, refinoAlvo: 10, usarMineriosEspeciais: true }],
  ])('a taxa calculada pelo minério reproduz o custo de cada campanha simulada (%s)', (_, mudanca) => {
    const c = campanha(mudanca);
    const kind = { ...BASE, ...mudanca }.kind;
    for (let i = 0; i < c.execucoes; i += 97) {
      const s = avaliarSorte(c, kind, relatoDa(c, i));
      expect(s.total).toBeCloseTo(c.custo[i]!, 0);
    }
  });

  it('põe a campanha típica no meio, a mais sortuda no topo e a mais azarada no fundo', () => {
    const c = campanha({});
    const { sortuda, tipica, azarada } = execucoes(c);

    expect(avaliarSorte(c, 'w4', relatoDa(c, tipica)).maisSorteQue).toBeCloseTo(0.5, 1);
    expect(avaliarSorte(c, 'w4', relatoDa(c, sortuda)).maisSorteQue).toBeGreaterThan(0.99);
    expect(avaliarSorte(c, 'w4', relatoDa(c, azarada)).maisSorteQue).toBeLessThan(0.01);
  });

  it('conta empate como meio, para a sorte mais comum não virar "mais sorte que 0%"', () => {
    // No +4 de uma arma nv4 nada falha: toda campanha custa o mesmo.
    const c = campanha({ refinoAlvo: 4, perdaAceitavel: false });
    const s = avaliarSorte(c, 'w4', relatoDa(c, 0));
    expect(s.maisSorteQue).toBeCloseTo(0.5, 5);
  });

  it('diz o que falta preencher antes de chamar alguém de sortudo', () => {
    const c = campanha({});
    const { tipica } = execucoes(c);
    const relato = relatoDa(c, tipica);
    const sempreUsado = c.materiais.find((_, col) => c.consumoOrdenado[col * c.execucoes]! > 0)!;
    delete relato.itens[sempreUsado.itemId];

    const s = avaliarSorte(c, 'w4', relato);
    expect(s.faltando).toEqual([sempreUsado.itemId]);
    expect(avaliarSorte(c, 'w4', relatoDa(c, tipica)).faltando).toEqual([]);
  });

  it('compara cada material com a campanha típica', () => {
    const c = campanha({});
    const s = avaliarSorte(c, 'w4', relatoDa(c, execucoes(c).sortuda));
    for (const m of s.porMaterial) {
      expect(m.tipico).toBeGreaterThanOrEqual(0);
      expect(m.maisSorteQue).toBeGreaterThanOrEqual(0);
      expect(m.maisSorteQue).toBeLessThanOrEqual(1);
    }
  });

  it('cobra a taxa por unidade de minério e de material de Grau', () => {
    // Oridecon Perfeito é de Cash Shop: isento na arma nv1.
    expect(taxaPorUnidade('w1', 6240)).toBe(0);
    // Aquamarina de Éter: 150 mil por tentativa normal, 750 mil por 5 na segura.
    expect(taxaPorUnidade('a2', 1000325)).toBe(150_000);
    // Bênção do Ferreiro não é tentativa.
    expect(taxaPorUnidade('w4', 6635)).toBe(0);
  });
});
