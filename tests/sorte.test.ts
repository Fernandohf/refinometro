import { describe, expect, it } from 'vitest';

import { campanhaDoKit, campanhaEmMinerios } from '../src/engine/kit';
import { calcular } from '../src/engine/plan';
import { avaliarSorte, relatoNoQueSeCompra, type Relato } from '../src/engine/sorte';
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
  return campanhaDoKit(calcular({ ...BASE, ...mudanca }, { tempoMs: 300 }))!;
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
  // A taxa não é perguntada: sai do material. Se ela não reproduzisse o custo
  // de cada campanha simulada, a pessoa seria comparada com uma régua que não
  // é a dela — e o veredito erraria sempre para o mesmo lado.
  it.each([
    ['refino e Grau', { kind: 'a2' as const, grauAlvo: 'A' as const, perdaAceitavel: false, usarMineriosEspeciais: true }],
    ['Grau A com evento', { kind: 'w5' as const, refinoAlvo: 0, grauAlvo: 'A' as const, evento: true, perdaAceitavel: false, usarMineriosEspeciais: true }],
    ['minério de Cash Shop isento de taxa', { kind: 'w1' as const, refinoAlvo: 10, usarMineriosEspeciais: true }],
    ['Sombrio', { kind: 'shadowW' as const, refinoAlvo: 10, usarMineriosEspeciais: true }],
  ])('onde cada fabricado tem insumo próprio, a taxa reproduz cada campanha (%s)', (_, mudanca) => {
    const c = campanha(mudanca);
    for (let i = 0; i < c.execucoes; i += 97) {
      expect(avaliarSorte(c, relatoDa(c, i)).total).toBeCloseTo(c.custo[i]!, -1);
    }
  });

  it('onde dois minérios viram o mesmo insumo, a taxa é estimada e erra pouco', () => {
    // Bradium e Oridecon saem do mesmo Minério de Oridecon, com taxas
    // diferentes: o relato não separa um do outro, e nenhuma conta separa.
    const c = campanha({});
    let pior = 0;
    for (let i = 0; i < c.execucoes; i += 7) {
      const total = avaliarSorte(c, relatoDa(c, i)).total;
      pior = Math.max(pior, Math.abs(total - c.custo[i]!) / c.custo[i]!);
    }
    expect(pior).toBeLessThan(0.005);
  });

  it('pergunta pelo que se compra, não pelo fabricado', () => {
    // Grau A: o Âmbar de Éter se fabrica, e a aba pede a Pedra de Éter e o Âmbar.
    const c = campanha({ kind: 'a2', grauAlvo: 'A', perdaAceitavel: false, usarMineriosEspeciais: true });
    const ids = c.materiais.map((m) => m.itemId);
    expect(ids).not.toContain(1000328);
    expect(ids).toContain(1000321);
  });

  it('desmonta o relato do tempo em que se contava minério inteiro', () => {
    // Links compartilhados antes da mudança dizem "N Âmbar de Éter"; desmontado,
    // o relato tem de dar o mesmo veredito que a mesma campanha contada hoje.
    const p = calcular({ ...BASE, kind: 'a2', grauAlvo: 'A', perdaAceitavel: false, usarMineriosEspeciais: true }, { tempoMs: 300 });
    const inteira = campanhaEmMinerios(p)!;
    const c = campanhaDoKit(p)!;
    const i = execucoes(c).tipica;
    const antigo = relatoDa(inteira, i);
    const convertido = { ...antigo, itens: relatoNoQueSeCompra(antigo.itens, p.input.precos) };
    expect(avaliarSorte(c, convertido).maisSorteQue).toBeCloseTo(avaliarSorte(c, relatoDa(c, i)).maisSorteQue, 2);
  });

  it('põe a campanha típica no meio, a mais sortuda no topo e a mais azarada no fundo', () => {
    const c = campanha({});
    const { sortuda, tipica, azarada } = execucoes(c);

    expect(avaliarSorte(c, relatoDa(c, tipica)).maisSorteQue).toBeCloseTo(0.5, 1);
    expect(avaliarSorte(c, relatoDa(c, sortuda)).maisSorteQue).toBeGreaterThan(0.99);
    expect(avaliarSorte(c, relatoDa(c, azarada)).maisSorteQue).toBeLessThan(0.01);
  });

  it('conta empate como meio, para a sorte mais comum não virar "mais sorte que 0%"', () => {
    // No +4 de uma arma nv4 nada falha: toda campanha custa o mesmo.
    const c = campanha({ refinoAlvo: 4, perdaAceitavel: false });
    const s = avaliarSorte(c, relatoDa(c, 0));
    expect(s.maisSorteQue).toBeCloseTo(0.5, 5);
  });

  it('diz o que falta preencher antes de chamar alguém de sortudo', () => {
    const c = campanha({});
    const { tipica } = execucoes(c);
    const relato = relatoDa(c, tipica);
    const sempreUsado = c.materiais.find((_, col) => c.consumoOrdenado[col * c.execucoes]! > 0)!;
    delete relato.itens[sempreUsado.itemId];

    const s = avaliarSorte(c, relato);
    expect(s.faltando).toEqual([sempreUsado.itemId]);
    expect(avaliarSorte(c, relatoDa(c, tipica)).faltando).toEqual([]);
  });

  it('compara cada material com a campanha típica', () => {
    const c = campanha({});
    const s = avaliarSorte(c, relatoDa(c, execucoes(c).sortuda));
    for (const m of s.porMaterial) {
      expect(m.tipico).toBeGreaterThanOrEqual(0);
      expect(m.maisSorteQue).toBeGreaterThanOrEqual(0);
      expect(m.maisSorteQue).toBeLessThanOrEqual(1);
    }
  });
});
