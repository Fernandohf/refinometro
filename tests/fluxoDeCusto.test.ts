import { describe, expect, it } from 'vitest';

import { PRECOS_FIXOS } from './precosFixos';
import { BLESSING_ITEM_ID } from '../src/data/ores';
import { calcular } from '../src/engine/plan';
import { listaDeCompras } from '../src/engine/pricing';
import {
  fluxoDeCusto,
  quantidadesNaMargem,
  type CategoriaCusto,
} from '../src/engine/fluxoDeCusto';
import type { CalcInput } from '../src/engine/types';

const input = (over: Partial<CalcInput> = {}): CalcInput => ({
  kind: 'w4',
  precoItem: 30_000_000,
  refinoAtual: 0,
  refinoAlvo: 10,
  grauAtual: 'none',
  grauAlvo: 'none',
  evento: false,
  precos: PRECOS_FIXOS,
  usarBencaoFerreiro: true,
  usarMineriosEspeciais: true,
  perdaAceitavel: true,
  ...over,
});

const plano = () => calcular(input(), { execucoes: 20_000, tempoMs: 3_000 });

describe('para onde vai o zeny', () => {
  it('soma exatamente o total da lista de compras', () => {
    // Este é o invariante que sustenta o desenho: ele fica ao lado da tabela,
    // e um diagrama que discordasse dela em um zeny não valeria nada. As duas
    // contas partem da mesma `listaDeCompras`, no mesmo percentil.
    const p = plano();
    const fluxo = fluxoDeCusto(p, 'p90');

    const lista = listaDeCompras(quantidadesNaMargem(p, 'p90'), p.input.precos);
    const quebras = Math.ceil(p.simulacao!.quebras.p90);
    const taxas = Math.ceil(p.simulacao!.taxas.p90);
    const totalDaTabela = lista.total + quebras * p.input.precoItem + taxas;

    expect(fluxo.total).toBe(totalDaTabela);
  });

  it('cada grupo soma as suas folhas, e os grupos somam o total', () => {
    const fluxo = fluxoDeCusto(plano(), 'p90');
    for (const g of fluxo.grupos) {
      expect(g.valor).toBeCloseTo(
        g.folhas.reduce((s, f) => s + f.valor, 0),
        6,
      );
    }
    expect(fluxo.grupos.reduce((s, g) => s + g.valor, 0)).toBeCloseTo(fluxo.total, 6);
  });

  it('separa proteção de material: a Bênção não é minério', () => {
    // A divisão é por natureza do gasto, não por tipo de item. Pôr a Bênção
    // entre os minérios apagaria justamente a resposta que o desenho existe
    // para dar.
    const fluxo = fluxoDeCusto(plano(), 'p90');
    const protecao = fluxo.grupos.find((g) => g.categoria === 'protecao');

    expect(protecao).toBeDefined();
    expect(protecao!.folhas.map((f) => f.id)).toContain(`item-${BLESSING_ITEM_ID}`);

    const materiais = fluxo.grupos.find((g) => g.categoria === 'materiais');
    expect(materiais!.folhas.map((f) => f.id)).not.toContain(`item-${BLESSING_ITEM_ID}`);
  });

  it('nos preços padrão, o minério é a menor parte de um +10', () => {
    // A afirmação que o painel faz por escrito. Se um dia os preços padrão
    // mudarem a ponto de inverter isso, o texto ao lado do desenho passa a
    // mentir — e este teste é quem avisa.
    const fluxo = fluxoDeCusto(plano(), 'p90');
    const fatia = (c: CategoriaCusto) =>
      (fluxo.grupos.find((g) => g.categoria === c)?.valor ?? 0) / fluxo.total;

    expect(fatia('protecao') + fatia('item')).toBeGreaterThan(0.6);
    expect(fatia('materiais')).toBeLessThan(fatia('protecao'));
  });

  it('ordena do maior para o menor, para a resposta ser a primeira faixa', () => {
    const fluxo = fluxoDeCusto(plano(), 'p90');
    const valores = fluxo.grupos.map((g) => g.valor);
    expect([...valores].sort((a, b) => b - a)).toEqual(valores);
    for (const g of fluxo.grupos) {
      const f = g.folhas.map((x) => x.valor);
      expect([...f].sort((a, b) => b - a)).toEqual(f);
    }
  });

  it('não inventa reposição quando o item não quebra', () => {
    // Alvo dentro do limite seguro: nenhuma tentativa pode destruir o item, e
    // uma faixa vermelha de "reposição" ali seria um risco inexistente.
    const p = calcular(input({ refinoAlvo: 4 }), { execucoes: 5_000, tempoMs: 1_000 });
    const fluxo = fluxoDeCusto(p, 'p90');
    expect(fluxo.grupos.find((g) => g.categoria === 'item')).toBeUndefined();
  });

  it('separa refinar o MINÉRIO de refinar o EQUIPAMENTO', () => {
    // Dois NPCs, duas coisas: o balcão que transforma 5 Minério de Oridecon em
    // 1 Oridecon, e a taxa cobrada por tentativa no equipamento. Um se resolve
    // comprando o minério pronto; o outro não se resolve de jeito nenhum.
    // Juntá-los num "balcão e taxas" escondia essa diferença.
    const p = calcular(input({ kind: 'w5', refinoAlvo: 11, grauAlvo: 'A' }), {
      execucoes: 20_000,
      tempoMs: 3_000,
    });
    const fluxo = fluxoDeCusto(p, 'p90');

    const fabricacao = fluxo.grupos.find((g) => g.categoria === 'fabricacao');
    const refino = fluxo.grupos.find((g) => g.categoria === 'refino');

    expect(fabricacao).toBeDefined();
    expect(refino).toBeDefined();
    expect(fabricacao!.valor).toBeGreaterThan(0);
    expect(refino!.valor).toBeGreaterThan(0);
    // E cada um tem tamanho próprio: numa campanha de Grau o balcão é ordens de
    // grandeza maior que a taxa, o que a soma dos dois escondia.
    expect(fabricacao!.valor).toBeGreaterThan(refino!.valor);

    // A fabricação vem aberta por minério: é o nome que diz qual vale procurar
    // pronto no mercado.
    expect(fabricacao!.folhas.length).toBeGreaterThan(1);
    expect(fabricacao!.folhas[0]!.rotulo).toMatch(/^Fabricar /);
  });

  it('não cobra balcão de receita gratuita', () => {
    // 5 Minério de Oridecon viram 1 Oridecon sem custo de balcão. Uma linha de
    // 0z ali seria uma faixa invisível com um rótulo ocupando espaço.
    const p = plano();
    const lista = listaDeCompras(quantidadesNaMargem(p, 'p90'), p.input.precos);
    for (const f of lista.fabricacao) expect(f.zeny).toBeGreaterThan(0);
    expect(lista.fabricacao.reduce((s, f) => s + f.zeny, 0)).toBe(lista.zenyNpc);
  });

  it('dobra a cauda sem mudar o total do grupo', () => {
    // O desenho mostra as maiores e resume o resto; a tabela ao lado continua
    // com a conta linha a linha. O que não pode é o total escorrer.
    const p = calcular(input({ kind: 'w5', refinoAlvo: 11, grauAlvo: 'A' }), {
      execucoes: 20_000,
      tempoMs: 3_000,
    });
    const fluxo = fluxoDeCusto(p, 'p90');

    for (const g of fluxo.grupos) {
      expect(g.valor).toBeCloseTo(
        g.folhas.reduce((s, f) => s + f.valor, 0),
        6,
      );
      expect(g.folhas.length).toBeLessThanOrEqual(7);
    }
    const dobrado = fluxo.grupos.flatMap((g) => g.folhas).filter((f) => f.id.startsWith('outros-'));
    expect(dobrado.length).toBeGreaterThan(0);
    expect(dobrado[0]!.rotulo).toMatch(/^\+\d+ outras linhas$/);
  });

  it('não devolve folha de valor zero, que viraria faixa invisível', () => {
    const fluxo = fluxoDeCusto(plano(), 'p90');
    for (const g of fluxo.grupos) {
      for (const f of g.folhas) expect(f.valor).toBeGreaterThan(0);
    }
  });
});
