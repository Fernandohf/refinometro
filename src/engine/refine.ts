import refineChances from '../data/refineChances.json';
import {
  blessingCost,
  BLESSING_ITEM_ID,
  oresFor,
  taxaDaTentativa,
  type ItemKind,
  type Ore,
} from '../data/ores';
import { oreCost, unitCost } from './pricing';
import { fatorarLU, resolverLU } from './linear';
import type { PolicyEntry, PriceTable, RefineAction, ResourceUsage } from './types';

type ChanceTab = 'normal' | 'normalEvent' | 'special' | 'specialEvent';
const TABS = refineChances.chances as Record<ChanceTab, Record<string, Record<string, number | null>>>;

/**
 * Coluna da tabela de chances para uma categoria. Arma e armadura sombrias
 * dividem a mesma coluna "Sombrio" — o que muda entre elas é só o minério.
 */
function colunaDe(kind: ItemKind): string {
  return kind === 'shadowW' || kind === 'shadowA' ? 'shadow' : kind;
}

/** Chance de a tentativa que produz `+para` dar certo, para um item `kind`. */
export function chanceOf(kind: ItemKind, para: number, especial: boolean, evento: boolean): number | null {
  const tab: ChanceTab = especial ? (evento ? 'specialEvent' : 'special') : evento ? 'normalEvent' : 'normal';
  return TABS[tab][String(para)]?.[colunaDe(kind)] ?? null;
}

/** Refino máximo alcançável por esta categoria de item. */
export function maxRefine(kind: ItemKind): number {
  let max = 0;
  for (let r = 1; r <= 20; r++) {
    if (chanceOf(kind, r, false, false) !== null || chanceOf(kind, r, true, false) !== null) max = r;
  }
  return max;
}

/** Refino máximo garantido (100% de sucesso) para esta categoria. */
export function safeLimit(kind: ItemKind): number {
  let limite = 0;
  for (let r = 1; r <= 20; r++) {
    if (chanceOf(kind, r, false, false) === 1) limite = r;
    else break;
  }
  return limite;
}

export interface RefineOptions {
  kind: ItemKind;
  precos: PriceTable;
  evento: boolean;
  usarBencaoFerreiro: boolean;
  usarMineriosEspeciais: boolean;
  /** Preço de reposição do item, cobrado sempre que ele quebra. */
  precoItem: number;
  /** Refino do item de reposição comprado após uma quebra. */
  refinoReposicao: number;
}

/** Todas as ações viáveis para sair do refino `de` e tentar `de + 1`. */
export function actionsAt(de: number, opts: RefineOptions): RefineAction[] {
  const acoes: RefineAction[] = [];
  const precoBencao = unitCost(BLESSING_ITEM_ID, opts.precos);
  const qtdBencao = opts.usarBencaoFerreiro ? blessingCost(opts.kind, de) : null;

  for (const ore of oresFor(opts.kind, de)) {
    if (ore.especial && !opts.usarMineriosEspeciais) continue;

    const chance = chanceOf(opts.kind, de + 1, ore.especial, opts.evento);
    if (chance === null || chance <= 0) continue;

    const custoMinerio = oreCost(ore, opts.precos);
    if (!Number.isFinite(custoMinerio)) continue; // sem preço nem receita: não dá pra usar

    // A taxa do refinador depende do minério, então entra por ação e não como
    // uma constante da campanha: minério de Cash Shop é isento.
    const taxa = taxaDaTentativa(opts.kind, ore);

    // Sem Bênção: a penalidade do minério vale.
    acoes.push({
      ore,
      bencaos: 0,
      chance,
      taxa,
      custo: custoMinerio + taxa,
      falhaVaiPara: failureTarget(ore, de),
    });

    // Com Bênção do Ferreiro: o item não quebra nem perde refino.
    if (qtdBencao !== null && Number.isFinite(precoBencao)) {
      acoes.push({
        ore,
        bencaos: qtdBencao,
        chance,
        taxa,
        custo: custoMinerio + taxa + qtdBencao * precoBencao,
        falhaVaiPara: de,
      });
    }
  }

  return acoes;
}

/** Para onde o refino cai quando a tentativa falha. `null` = item destruído. */
function failureTarget(ore: Ore, de: number): number | null {
  switch (ore.penalidade) {
    case 'break':
      return null;
    case 'down1':
      return Math.max(0, de - 1);
    case 'down3':
      return Math.max(0, de - 3);
  }
}

export interface RefinePlan {
  de: number;
  para: number;
  /** Ação ótima para cada nível de refino que pode ser visitado. */
  politica: PolicyEntry[];
  /** Custo esperado total em zeny, saindo de `de` e chegando em `para`. */
  custoEsperado: number;
  /** Recursos esperados consumidos no caminho. */
  recursos: ResourceUsage;
}

/**
 * Teto de rodadas de melhoria de política. A iteração de política converge em
 * poucas rodadas (dezenas, não milhares); este número só existe para não haver
 * laço infinito se duas políticas empatarem e ficarem alternando.
 */
const MAX_ITER = 200;

/**
 * Resolve a política de refino de menor custo esperado para levar o item de
 * `de` até `para`.
 *
 * O problema é um processo de decisão de Markov e não uma simples sequência de
 * tentativas: uma falha pode empurrar o item para trás (perde 1 ou 3 refinos) ou
 * destruí-lo, então a escolha de minério em cada nível depende do custo esperado
 * dos níveis vizinhos — inclusive dos que ficam abaixo do refino inicial.
 */
export function solveRefine(de: number, para: number, opts: RefineOptions): RefinePlan {
  if (para <= de) {
    return {
      de,
      para,
      politica: [],
      custoEsperado: 0,
      recursos: { zeny: 0, itens: {}, itensQuebrados: 0, tentativas: 0, taxas: 0 },
    };
  }

  // Estados 0..para-1 exigem tentativa; `para` é absorvente.
  // A faixa começa em 0 porque uma falha pode derrubar o item abaixo de `de`.
  const acoesPorEstado: RefineAction[][] = [];
  for (let r = 0; r < para; r++) {
    const acoes = actionsAt(r, opts);
    if (acoes.length === 0) {
      throw new RefineImpossivel(
        `Não há minério disponível para levar o item de +${r} para +${r + 1}. ` +
          `Informe o preço dos minérios dessa faixa ou revise o alvo.`,
      );
    }
    acoesPorEstado.push(acoes);
  }

  // Iteração de política: avalia a política atual de forma EXATA (sistema
  // linear), melhora estado a estado, repete. Bem mais confiável que iteração de
  // valor aqui — nos alvos altos o custo esperado passa de 10^10 zeny e a
  // iteração de valor precisaria de centenas de milhares de passos, entregando
  // números truncados que pareciam plausíveis.
  const escolha = new Int32Array(para);
  // Começa pela ação de menor custo imediato: é um chute válido e barato.
  for (let r = 0; r < para; r++) {
    const acoes = acoesPorEstado[r]!;
    let melhorIdx = 0;
    for (let i = 1; i < acoes.length; i++) {
      if (acoes[i]!.custo < acoes[melhorIdx]!.custo) melhorIdx = i;
    }
    escolha[r] = melhorIdx;
  }

  let avaliacao = avaliarPolitica(escolha, acoesPorEstado, para, opts);

  for (let iter = 0; iter < MAX_ITER; iter++) {
    const E = avaliacao.custo;
    let mudou = false;

    for (let r = 0; r < para; r++) {
      const acoes = acoesPorEstado[r]!;
      let melhor = Infinity;
      let melhorIdx = escolha[r]!;
      for (let i = 0; i < acoes.length; i++) {
        const v = valorDaAcao(acoes[i]!, r, E, opts);
        if (v < melhor - 1e-6) {
          melhor = v;
          melhorIdx = i;
        }
      }
      if (melhorIdx !== escolha[r]) {
        escolha[r] = melhorIdx;
        mudou = true;
      }
    }

    if (!mudou) break;
    avaliacao = avaliarPolitica(escolha, acoesPorEstado, para, opts);
  }

  const politica: PolicyEntry[] = [];
  for (let r = 0; r < para; r++) {
    politica.push({
      de: r,
      acao: acoesPorEstado[r]![escolha[r]!]!,
      custoEsperado: avaliacao.custo[r]!,
    });
  }

  return {
    de,
    para,
    politica,
    custoEsperado: avaliacao.custo[de]!,
    recursos: avaliacao.recursos(de, politica),
  };
}

/** Custo esperado de tomar `a` no refino `r`, dados os valores `E` dos estados. */
function valorDaAcao(a: RefineAction, r: number, E: Float64Array, opts: RefineOptions): number {
  const destinoFalha = a.falhaVaiPara ?? opts.refinoReposicao;
  const penalidade = a.falhaVaiPara === null ? opts.precoItem : 0;
  return (
    a.custo +
    (1 - a.chance) * penalidade +
    a.chance * E[r + 1]! +
    (1 - a.chance) * E[destinoFalha]!
  );
}

/**
 * Avalia uma política fixa resolvendo (I - P) E = m exatamente.
 *
 * A mesma matriz serve para o custo e para cada recurso contado (minérios,
 * bênçãos, tentativas, quebras) — só muda o lado direito — então a fatoração LU
 * é feita uma vez e reaproveitada.
 */
function avaliarPolitica(
  escolha: Int32Array,
  acoesPorEstado: RefineAction[][],
  para: number,
  opts: RefineOptions,
): { custo: Float64Array; recursos: (de: number, politica: PolicyEntry[]) => ResourceUsage } {
  const n = para;
  const A = new Float64Array(n * n);

  for (let r = 0; r < n; r++) {
    const a = acoesPorEstado[r]![escolha[r]!]!;
    const destinoFalha = a.falhaVaiPara === null ? opts.refinoReposicao : a.falhaVaiPara;
    A[r * n + r] = (A[r * n + r] ?? 0) + 1;
    // O estado `para` é absorvente e vale 0, então some da matriz.
    if (r + 1 < n) A[r * n + (r + 1)] = A[r * n + (r + 1)]! - a.chance;
    A[r * n + destinoFalha] = A[r * n + destinoFalha]! - (1 - a.chance);
  }

  const lu = fatorarLU(A, n);

  /** Resolve para um vetor de custo imediato por estado. */
  const resolver = (imediato: (a: RefineAction, r: number) => number): Float64Array => {
    const b = new Float64Array(n);
    for (let r = 0; r < n; r++) b[r] = imediato(acoesPorEstado[r]![escolha[r]!]!, r);
    const x = resolverLU(lu, b);
    // Um estado a mais, valendo 0, para o alvo absorvente.
    const completo = new Float64Array(n + 1);
    completo.set(x);
    return completo;
  };

  const custo = resolver(
    (a) => a.custo + (a.falhaVaiPara === null ? (1 - a.chance) * opts.precoItem : 0),
  );

  const recursos = (de: number, politica: PolicyEntry[]): ResourceUsage => {
    const itensUsados = new Set<number>();
    for (const p of politica) {
      itensUsados.add(p.acao.ore.itemId);
      if (p.acao.bencaos > 0) itensUsados.add(BLESSING_ITEM_ID);
    }

    const tentativas = resolver(() => 1);
    const quebras = resolver((a) => (a.falhaVaiPara === null ? 1 - a.chance : 0));
    const taxas = resolver((a) => a.taxa);

    const itens: Record<number, number> = {};
    for (const itemId of itensUsados) {
      const v = resolver((a) => {
        let q = 0;
        if (a.ore.itemId === itemId) q += 1;
        if (itemId === BLESSING_ITEM_ID) q += a.bencaos;
        return q;
      });
      itens[itemId] = v[de]!;
    }

    return {
      zeny: custo[de]!,
      itens,
      itensQuebrados: quebras[de]!,
      tentativas: tentativas[de]!,
      taxas: taxas[de]!,
    };
  };

  return { custo, recursos };
}

/** Lançado quando o alvo é inalcançável com os minérios e preços informados. */
export class RefineImpossivel extends Error {}
