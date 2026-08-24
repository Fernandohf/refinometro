import gradeChances from '../data/gradeChances.json';
import {
  ETHER_BLESSING_ITEM_ID,
  MAX_BLESSING_BONUS,
  REFINO_MINIMO_GRAU,
  stepsBetween,
  type Grade,
  type GradeStep,
  type GradeStepKey,
} from '../data/grade';
import type { ItemKind } from '../data/ores';
import { solveRefine, type RefineOptions, type RefinePlan } from './refine';
import { unitCost } from './pricing';

type GradeTab = 'weapon' | 'weaponEvent' | 'armor' | 'armorEvent';
const TABS = gradeChances.chances as Record<GradeTab, Record<string, Record<string, number | null>>>;

/** Só Armas nível 5 e Armaduras nível 2 têm Grau. */
export function suportaGrau(kind: ItemKind): boolean {
  return kind === 'w5' || kind === 'a2';
}

/** Chance base de um degrau de grau, tentado com o item no refino `refino`. */
export function gradeChanceOf(
  kind: ItemKind,
  refino: number,
  step: GradeStepKey,
  evento: boolean,
): number | null {
  const arma = kind.startsWith('w');
  const tab: GradeTab = arma ? (evento ? 'weaponEvent' : 'weapon') : evento ? 'armorEvent' : 'armor';
  return TABS[tab][String(refino)]?.[step] ?? null;
}

/** A tentativa de grau escolhida para um degrau, já otimizada. */
export interface GradeAttemptPlan {
  step: GradeStep;
  /** Refino em que vale a pena tentar o processo. */
  refino: number;
  /** Processo seguro (5x material, não perde o item) ou normal. */
  seguro: boolean;
  /** Pontos percentuais comprados com Bênção de Éter (0 a 10). */
  pontosBencao: number;
  /** Quantas Bênçãos de Éter isso consome por tentativa. */
  qtdBencaos: number;
  /** Chance final da tentativa. */
  chance: number;
  /** Custo de uma única tentativa, em zeny. */
  custoPorTentativa: number;
  /** Número esperado de tentativas até passar. */
  tentativasEsperadas: number;
  /** Plano de refino para levar o item até `refino` antes da primeira tentativa. */
  refinoPreparo: RefinePlan;
  /**
   * Plano de refino de um item de reposição, usado quando o processo normal
   * falha e destrói o item. `null` no processo seguro, que não destrói nada.
   */
  refinoReposicao: RefinePlan | null;
  /** Custo esperado só do preparo (igual a `refinoPreparo.custoEsperado`). */
  custoPreparo: number;
  /** Custo esperado das tentativas de grau, já incluindo reposições de item. */
  custoTentativas: number;
  /** Custo esperado total do degrau: preparo + tentativas + reposições. */
  custoEsperado: number;
  /** Itens-base esperados destruídos neste degrau (refino + falhas de grau). */
  itensQuebrados: number;
}

/**
 * Escolhe a forma mais barata de subir um degrau de grau, partindo do refino
 * `refinoInicial`.
 *
 * Três decisões entram no mesmo cálculo, porque interagem:
 *  - em que refino tentar (a chance sobe em degraus até o +16, mas o refino é
 *    resetado no sucesso, então subir além do necessário pode ser dinheiro
 *    jogado fora);
 *  - processo seguro (5x material, não perde nada) ou normal (1x, perde tudo);
 *  - quantos pontos de chance comprar com Bênção de Éter (até +10 p.p.).
 */
/**
 * Cache de planos de refino dentro de uma mesma campanha de grau.
 *
 * Os degraus repetem muito trecho: todo degrau depois do primeiro parte do +0, e
 * cada um avalia os mesmos refinos candidatos. Sem o cache, a mesma cadeia de
 * Markov é resolvida dezenas de vezes.
 */
type CacheRefino = Map<string, RefinePlan>;

function refinoCacheado(
  de: number,
  para: number,
  opts: RefineOptions,
  cache: CacheRefino,
): RefinePlan {
  const chave = `${de}->${para}`;
  let plano = cache.get(chave);
  if (!plano) {
    plano = solveRefine(de, para, opts);
    cache.set(chave, plano);
  }
  return plano;
}

/**
 * Refinos que vale a pena avaliar como ponto de partida do processo de grau.
 *
 * A chance de grau só muda em alguns degraus de refino. Entre dois níveis de
 * mesma chance, o mais baixo sempre vence: o preparo custa estritamente mais a
 * cada refino, e o sucesso zera tudo de qualquer forma. Então basta testar o
 * menor refino de cada chance distinta.
 *
 * Quem define onde cada degrau começa é a própria tabela, através dos `null`
 * (ver REFINO_MINIMO_GRAU). Tentar o Grau D já no +9 costuma ser ruim — 10% de
 * chance contra 70% no +11 —, mas quando o trecho +9→+11 é caro o suficiente a
 * conta vira, e é justamente esse tipo de troca que o otimizador existe para
 * resolver. Por isso a decisão fica com ele, e não com uma regra fixa aqui.
 */
function refinosCandidatos(step: GradeStep, opts: RefineOptions): number[] {
  const candidatos: number[] = [];
  const chancesVistas = new Set<number>();

  for (let refino = REFINO_MINIMO_GRAU; refino <= 20; refino++) {
    const chance = gradeChanceOf(opts.kind, refino, step.key, opts.evento);
    if (chance === null || chance <= 0) continue;
    if (chancesVistas.has(chance)) continue;
    chancesVistas.add(chance);
    candidatos.push(refino);
  }

  return candidatos;
}

export function solveGradeStep(
  step: GradeStep,
  refinoInicial: number,
  opts: RefineOptions,
  cache: CacheRefino = new Map(),
): GradeAttemptPlan {
  const custoMaterial = unitCost(step.normal.material.itemId, opts.precos);
  const custoBencao = unitCost(ETHER_BLESSING_ITEM_ID, opts.precos);

  if (!Number.isFinite(custoMaterial)) {
    throw new GrauImpossivel(
      `Sem preço para ${step.normal.material.nome}, necessário para o grau ${step.de} → ${step.para}.`,
    );
  }

  const maxPontos = Math.round(MAX_BLESSING_BONUS * 100);
  let melhor: GradeAttemptPlan | null = null;

  for (const refino of refinosCandidatos(step, opts)) {
    const base = gradeChanceOf(opts.kind, refino, step.key, opts.evento)!;

    // Preparo: levar o item até este refino, e o custo de repetir isso se o
    // processo normal falhar e destruir o item.
    let preparo: RefinePlan;
    let reposicao: RefinePlan | null = null;
    try {
      preparo = refinoCacheado(refinoInicial, refino, opts, cache);
      // Só o processo normal precisa de reposição — e quando a perda do item não
      // é aceitável ele nem é uma opção, então nem tentamos resolver o refino de
      // um item que nunca será comprado (que poderia até ser impossível).
      if (opts.perdaAceitavel) reposicao = refinoCacheado(opts.refinoReposicao, refino, opts, cache);
    } catch {
      continue;
    }

    for (let pontos = 0; pontos <= maxPontos; pontos++) {
      if (pontos > 0 && !Number.isFinite(custoBencao)) break;

      const qtdBencaos = pontos * step.bencaosPorPonto;
      const chance = Math.min(1, base + pontos / 100);
      const custoBencoes = qtdBencaos * (Number.isFinite(custoBencao) ? custoBencao : 0);

      // Sem aceitar a perda, o processo normal está fora: ele destrói o item na
      // falha, e é isso que a restrição proíbe — não é caro, é inaceitável.
      for (const seguro of opts.perdaAceitavel ? [false, true] : [true]) {
        const modo = seguro ? step.seguro : step.normal;
        const custoPorTentativa = modo.zeny + modo.material.qtd * custoMaterial + custoBencoes;

        // Seguro: o item sobrevive à falha e continua no mesmo refino, então
        // basta repetir a tentativa. Normal: a falha destrói o item, e é preciso
        // comprar outro e refiná-lo de novo até aqui.
        const custoFalha = seguro ? 0 : opts.precoItem + reposicao!.custoEsperado;
        const esperadoTentativas = (custoPorTentativa + (1 - chance) * custoFalha) / chance;
        const total = preparo.custoEsperado + esperadoTentativas;

        const tentativasEsperadas = 1 / chance;
        const quebrasGrau = seguro ? 0 : tentativasEsperadas - 1;
        const itensQuebrados =
          preparo.recursos.itensQuebrados +
          quebrasGrau * (1 + (reposicao?.recursos.itensQuebrados ?? 0));

        if (melhor === null || total < melhor.custoEsperado) {
          melhor = {
            step,
            refino,
            seguro,
            pontosBencao: pontos,
            qtdBencaos,
            chance,
            custoPorTentativa,
            tentativasEsperadas,
            refinoPreparo: preparo,
            refinoReposicao: reposicao,
            custoPreparo: preparo.custoEsperado,
            custoTentativas: esperadoTentativas,
            custoEsperado: total,
            itensQuebrados,
          };
        }
      }
    }
  }

  if (melhor === null) {
    throw new GrauImpossivel(`Não há caminho viável para o grau ${step.de} → ${step.para}.`);
  }
  return melhor;
}

export class GrauImpossivel extends Error {}

export interface GradeCampaign {
  degraus: GradeAttemptPlan[];
  custoEsperado: number;
  itensQuebrados: number;
  /** Refino em que o item fica ao final da campanha de grau (sempre +0). */
  refinoFinal: number;
}

/**
 * Sobe o item de `grauAtual` até `grauAlvo`.
 *
 * Cada sucesso zera o refino, então todo degrau depois do primeiro parte do +0 —
 * é daí que vem o custo desproporcional de perseguir Grau A.
 */
export function solveGradeCampaign(
  grauAtual: Grade,
  grauAlvo: Grade,
  refinoAtual: number,
  opts: RefineOptions,
): GradeCampaign {
  const steps = stepsBetween(grauAtual, grauAlvo);
  const degraus: GradeAttemptPlan[] = [];
  const cache: CacheRefino = new Map();

  let refinoInicial = refinoAtual;
  let custo = 0;
  let quebras = 0;

  for (const step of steps) {
    const plano = solveGradeStep(step, refinoInicial, opts, cache);
    degraus.push(plano);
    custo += plano.custoEsperado;
    quebras += plano.itensQuebrados;
    refinoInicial = 0; // o sucesso reseta o refino
  }

  return { degraus, custoEsperado: custo, itensQuebrados: quebras, refinoFinal: refinoInicial };
}
