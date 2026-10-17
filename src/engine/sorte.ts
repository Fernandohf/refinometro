/*
  Quanta sorte teve quem já refinou.

  A pergunta vem DEPOIS da campanha: a pessoa chegou ao alvo e conta quanto
  gastou de cada minério e quantas cópias do item perdeu. A resposta é onde essa
  campanha cai entre as simuladas — as mesmas cinco mil do orçamento e do "Dá
  com o que eu tenho?", lidas de um terceiro jeito.

  A comparação é contra o plano da calculadora: ela assume que a pessoa seguiu a
  estratégia ótima, e a tela diz isso. Quem refinou de outro jeito mede, aqui,
  sorte e estratégia misturadas.

  A taxa do refinador não é perguntada, porque ninguém a anota — e não precisa
  ser: cada minério gasto no refinador é uma tentativa, e cada tentativa cobra a
  taxa daquele minério; no Grau, a taxa é proporcional ao material da tentativa
  (150 mil por Aquamarina de Éter, nos dois modos). A taxa da campanha é então
  uma soma exata do que a pessoa informou, e um teste confere isso contra as
  campanhas simuladas.
*/

import { GRADE_STEPS } from '../data/grade';
import { ORES, taxaDaTentativa, type ItemKind } from '../data/ores';
import type { CampanhaEmMateriais } from './estoque';

/** O que a pessoa conta da campanha que já fez. */
export interface Relato {
  /** Quanto gastou de cada minério, por id — em minério inteiro, como no kit. */
  itens: Record<number, number>;
  /** Cópias do item destruídas no caminho. */
  quebras: number;
}

export interface SorteDoMaterial {
  itemId: number;
  usado: number;
  /** Consumo da campanha típica (mediana) das simuladas. */
  tipico: number;
  /** Fração das campanhas simuladas que gastaram mais deste material. */
  maisSorteQue: number;
}

export interface Sorte {
  /** Zeny do minério informado, ao mesmo preço que o plano usou. */
  materiais: number;
  /** Zeny das cópias destruídas, ao preço do item. */
  reposicoes: number;
  /** Taxa do refinador e do Grau, calculada a partir do minério (ver `taxaPorUnidade`). */
  taxas: number;
  total: number;
  /** Custo total da campanha típica (mediana). */
  tipico: number;
  /**
   * Fração das campanhas simuladas que custaram mais que esta. Empate conta
   * meio: num alvo barato muitas campanhas custam exatamente o mesmo, e contá-las
   * todas de um lado só daria "mais sorte que 0%" a quem teve a sorte mais comum.
   */
  maisSorteQue: number;
  porMaterial: SorteDoMaterial[];
  /**
   * Materiais que TODA campanha simulada usou e o relato deixou em zero. Enquanto
   * houver algum, o relato está incompleto, não sortudo.
   */
  faltando: number[];
}

/**
 * A taxa que uma unidade deste material cobra quando é gasta.
 *
 * Minério do refinador: uma unidade é uma tentativa, e paga a taxa dela —
 * zero para o minério de Cash Shop nas categorias isentas. Material de Grau: a
 * taxa da tentativa dividida pelo material que ela gasta, que dá o mesmo valor
 * no modo normal e no seguro. O resto (Bênção, cubos, pergaminhos) não cobra
 * taxa própria.
 */
export function taxaPorUnidade(kind: ItemKind, itemId: number): number {
  const minerio = ORES.find((o) => o.itemId === itemId && o.kinds.includes(kind));
  if (minerio) return taxaDaTentativa(kind, minerio);
  for (const degrau of GRADE_STEPS) {
    for (const modo of [degrau.normal, degrau.seguro]) {
      if (modo.material.itemId === itemId) return modo.zeny / modo.material.qtd;
    }
  }
  return 0;
}

/**
 * Onde a campanha relatada cai entre as simuladas.
 *
 * `c` é a campanha em minério inteiro (`campanhaEmMinerios`): é a unidade que o
 * jogador lembra — quantos Eterium passou no refinador —, e não quantos Pó de
 * Éter comprou para fabricá-los.
 */
export function avaliarSorte(c: CampanhaEmMateriais, kind: ItemKind, relato: Relato): Sorte {
  const n = c.execucoes;
  let materiais = 0;
  let taxas = 0;
  const porMaterial: SorteDoMaterial[] = [];
  const faltando: number[] = [];

  c.materiais.forEach((m, col) => {
    const usado = Math.max(0, relato.itens[m.itemId] ?? 0);
    materiais += usado * m.preco;
    taxas += usado * taxaPorUnidade(kind, m.itemId);
    const coluna = c.consumoOrdenado.subarray(col * n, (col + 1) * n);
    if (usado === 0 && coluna[0]! > 0) faltando.push(m.itemId);
    porMaterial.push({
      itemId: m.itemId,
      usado,
      tipico: coluna[Math.floor(n / 2)]!,
      maisSorteQue: fracaoAcima(coluna, usado),
    });
  });

  const reposicoes = Math.max(0, relato.quebras) * c.precoItem;
  const total = materiais + reposicoes + taxas;
  const custo = Float64Array.from(c.custo).sort();

  return {
    materiais,
    reposicoes,
    taxas,
    total,
    tipico: custo[Math.floor(n / 2)]!,
    maisSorteQue: fracaoAcima(custo, total),
    porMaterial,
    faltando,
  };
}

/**
 * Fração da amostra ordenada acima de `v`, com o empate contando meio.
 *
 * A comparação tolera um milésimo de zeny: o total relatado e o simulado somam
 * as mesmas parcelas em ordens diferentes, e o ponto flutuante não promete que
 * dois caminhos para o mesmo número cheguem ao mesmo bit.
 */
function fracaoAcima(ordenado: Float64Array, v: number): number {
  const eps = Math.max(1e-3, Math.abs(v) * 1e-12);
  const abaixo = primeiroMaiorOuIgual(ordenado, v - eps);
  const ateIgual = primeiroMaiorOuIgual(ordenado, v + eps);
  const acima = ordenado.length - ateIgual;
  const empates = ateIgual - abaixo;
  return (acima + empates / 2) / ordenado.length;
}

function primeiroMaiorOuIgual(ordenado: Float64Array, v: number): number {
  let lo = 0;
  let hi = ordenado.length;
  while (lo < hi) {
    const meio = (lo + hi) >>> 1;
    if (ordenado[meio]! < v) lo = meio + 1;
    else hi = meio;
  }
  return lo;
}
