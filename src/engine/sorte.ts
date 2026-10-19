/*
  Quanta sorte teve quem já refinou.

  A pergunta vem DEPOIS da campanha: a pessoa chegou ao alvo e conta quanto
  gastou de cada material e quantas cópias do item perdeu. A resposta é onde essa
  campanha cai entre as simuladas — as mesmas cinco mil do orçamento e do "Dá
  com o que eu tenho?", lidas de um terceiro jeito.

  A comparação é contra o plano da calculadora: ela assume que a pessoa seguiu a
  estratégia ótima, e a tela diz isso. Quem refinou de outro jeito mede, aqui,
  sorte e estratégia misturadas.

  O relato é no que se compra, a mesma moeda da lista de compras: o que vale a
  pena fabricar entra pelos insumos (Pedra de Éter e Âmbar, não Âmbar de Éter).
  É o que a pessoa comprou, e é o que ela consegue contar.

  As taxas não são perguntadas, porque ninguém as anota. Saem dos materiais
  informados (ver `taxasDaCampanha`).
*/

import type { CampanhaEmMateriais } from './estoque';
import { listaDeCompras } from './pricing';
import type { PriceTable } from './types';

/** O que a pessoa conta da campanha que já fez. */
export interface Relato {
  /** Quanto gastou de cada material, por id — no que se compra, como no kit. */
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
  /** Zeny do material informado, ao mesmo preço que o plano usou. */
  materiais: number;
  /** Zeny das cópias destruídas, ao preço do item. */
  reposicoes: number;
  /** Taxas do refinador, do Grau e do NPC que fabrica, estimadas pelo material. */
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

const taxasCalculadas = new WeakMap<CampanhaEmMateriais, Float64Array>();

/**
 * Quanto de taxa cada unidade de material arrasta consigo, coluna a coluna.
 *
 * Em minério inteiro a conta era exata: cada Eterium é uma tentativa e paga a
 * taxa dela. Nos insumos não é mais — o Pó de Éter entra no Eterium, na Pedra de
 * Éter e na Bênção de Éter, e cada um cobra um balcão e uma taxa diferentes. O
 * que se sabe é o que as campanhas simuladas mostram: quanto cada uma gastou de
 * cada insumo, e quanto pagou de taxa. A taxa por unidade é o ajuste de mínimos
 * quadrados entre as duas coisas, sem termo constante — campanha sem material
 * não paga taxa.
 *
 * Onde cada minério fabricado tem um insumo só dele (a gema de cada material de
 * Grau, o Elunium do Eterium), o ajuste é exato, porque a taxa da campanha é uma
 * função linear do que ela gastou. Onde dois minérios se desmontam nos mesmos
 * insumos, nenhuma conta separa um do outro a partir do relato, e o ajuste é a
 * melhor estimativa linear. `tests/sorte.test.ts` mede o erro nos dois casos.
 */
export function taxasDaCampanha(c: CampanhaEmMateriais): Float64Array {
  const pronta = taxasCalculadas.get(c);
  if (pronta) return pronta;

  const n = c.execucoes;
  const k = c.materiais.length;
  // Cada coluna na própria escala, para o sistema não somar Minério de Elunium
  // aos milhares com Bênção de Éter às dezenas.
  const escala = new Float64Array(k);
  for (let j = 0; j < k; j++) {
    let s = 0;
    for (let i = 0; i < n; i++) s += c.consumo[j * n + i]! ** 2;
    escala[j] = Math.sqrt(s / Math.max(1, n)) || 1;
  }

  // Equações normais: (XᵀX + λI) g = Xᵀz, com X já escalado.
  const A = new Float64Array(k * k);
  const b = new Float64Array(k);
  for (let p = 0; p < k; p++) {
    const xp = c.consumo.subarray(p * n, (p + 1) * n);
    for (let q = p; q < k; q++) {
      const xq = c.consumo.subarray(q * n, (q + 1) * n);
      let s = 0;
      for (let i = 0; i < n; i++) s += xp[i]! * xq[i]!;
      A[p * k + q] = A[q * k + p] = s / (escala[p]! * escala[q]!);
    }
    let s = 0;
    for (let i = 0; i < n; i++) s += xp[i]! * c.zenyPuro[i]!;
    b[p] = s / escala[p]!;
  }
  // Uma folga mínima na diagonal: quando dois insumos andam sempre juntos (15
  // Pedras de Éter por Âmbar), o sistema é singular, e ela reparte a taxa entre
  // os dois em vez de explodir. Pequena demais para mexer no caso exato.
  for (let p = 0; p < k; p++) A[p * k + p]! += 1e-9 * n;

  const g = resolver(A, b, k);
  for (let j = 0; j < k; j++) g[j] = g[j]! / escala[j]!;
  taxasCalculadas.set(c, g);
  return g;
}

/** Eliminação de Gauss com pivô parcial. `A` é destruída. */
function resolver(A: Float64Array, b: Float64Array, k: number): Float64Array {
  const x = Float64Array.from(b);
  for (let col = 0; col < k; col++) {
    let piv = col;
    for (let r = col + 1; r < k; r++) if (Math.abs(A[r * k + col]!) > Math.abs(A[piv * k + col]!)) piv = r;
    if (piv !== col) {
      for (let j = 0; j < k; j++) [A[col * k + j], A[piv * k + j]] = [A[piv * k + j]!, A[col * k + j]!];
      [x[col], x[piv]] = [x[piv]!, x[col]!];
    }
    const d = A[col * k + col]!;
    if (d === 0) continue;
    for (let r = col + 1; r < k; r++) {
      const f = A[r * k + col]! / d;
      if (f === 0) continue;
      for (let j = col; j < k; j++) A[r * k + j]! -= f * A[col * k + j]!;
      x[r]! -= f * x[col]!;
    }
  }
  for (let r = k - 1; r >= 0; r--) {
    let s = x[r]!;
    for (let j = r + 1; j < k; j++) s -= A[r * k + j]! * x[j]!;
    const d = A[r * k + r]!;
    x[r] = d === 0 ? 0 : s / d;
  }
  return x;
}

/**
 * Onde a campanha relatada cai entre as simuladas.
 *
 * `c` é a campanha no que se compra (`campanhaDoKit`): a mesma moeda da lista
 * de compras e do kit, e a que a pessoa comprou de fato.
 */
export function avaliarSorte(c: CampanhaEmMateriais, relato: Relato): Sorte {
  const n = c.execucoes;
  const taxaPorUnidade = taxasDaCampanha(c);
  let materiais = 0;
  let taxas = 0;
  const porMaterial: SorteDoMaterial[] = [];
  const faltando: number[] = [];

  c.materiais.forEach((m, col) => {
    const usado = Math.max(0, relato.itens[m.itemId] ?? 0);
    materiais += usado * m.preco;
    taxas += usado * taxaPorUnidade[col]!;
    const coluna = c.consumoOrdenado.subarray(col * n, (col + 1) * n);
    if (usado === 0 && coluna[0]! > 0) faltando.push(m.itemId);
    porMaterial.push({
      itemId: m.itemId,
      usado,
      tipico: coluna[Math.floor(n / 2)]!,
      maisSorteQue: fracaoAcima(coluna, usado),
    });
  });

  // Um relato fora do que o plano faz pode levar o ajuste abaixo de zero; taxa
  // negativa não existe.
  taxas = Math.max(0, taxas);
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

/**
 * Um relato contado em minério inteiro, convertido para o que se compra.
 *
 * Até 2026-10-17 a aba perguntava pelo minério pronto (300 Eterium). Links
 * compartilhados e relatos salvos nesse formato continuam valendo: desmontados
 * pela mesma receita que o plano usa, viram os insumos que a aba pergunta hoje.
 */
export function relatoNoQueSeCompra(itens: Record<number, number>, precos: PriceTable): Record<number, number> {
  const lista = listaDeCompras(
    Object.fromEntries(Object.entries(itens).filter(([, q]) => q > 0)),
    precos,
  );
  return Object.fromEntries(lista.compras.map((l) => [l.itemId, Math.round(l.qtd)]));
}
