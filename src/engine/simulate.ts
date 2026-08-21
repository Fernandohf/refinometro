import { BLESSING_ITEM_ID } from '../data/ores';
import { ETHER_BLESSING_ITEM_ID } from '../data/grade';
import type { Percentis, PolicyEntry, ResourceUsage } from './types';
import type { RefineOptions } from './refine';
import type { GradeAttemptPlan } from './grade';

/**
 * Uma campanha é uma sequência de fases: trechos de refino intercalados com
 * tentativas de subir de grau. Como um sucesso de grau zera o refino, a campanha
 * até o Grau A tem quatro subidas de refino separadas, não uma só.
 */
export type Fase =
  | {
      tipo: 'refino';
      rotulo: string;
      de: number;
      para: number;
      politica: PolicyEntry[];
      /** Tentativas esperadas nesta fase, do cálculo exato. Dimensiona a simulação. */
      tentativas: number;
      /** Recursos exatos desta fase, usados para o total sem depender de amostragem. */
      recursos: ResourceUsage;
    }
  | { tipo: 'grau'; rotulo: string; plano: GradeAttemptPlan };

/** Gerador determinístico (mulberry32) — mesma entrada, mesmo resultado na tela. */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface SimulationResult {
  /** Percentis do custo total em zeny. */
  custo: Percentis;
  /** Percentis da quantidade de itens destruídos. */
  quebras: Percentis;
  /** Percentis do zeny gasto só em taxa do refinador. */
  taxas: Percentis;
  /** Percentis de cada minério/material consumido, por id de item. */
  itens: Record<number, Percentis>;
  /** Custo médio observado — serve de conferência contra o cálculo exato. */
  custoMedio: number;
  /** Quantidade média de cada minério/material consumido, por id de item. */
  mediaItens: Record<number, number>;
  /** Número médio de itens-base destruídos. */
  mediaQuebras: number;
  /** Fração das simulações que chegaram ao alvo sem destruir nenhum item. */
  chanceSemQuebra: number;
  /** Número esperado de tentativas de refino ao longo da campanha. */
  tentativasMedias: number;
  /** Execuções efetivamente rodadas — pode ser menos que o teto, se o tempo acabar. */
  execucoes: number;
  /** Execuções cortadas pelo teto de tentativas; acima de zero, o custo sai subestimado. */
  truncadas: number;
  /** `true` quando foi o relógio, e não o teto de execuções, que encerrou a amostragem. */
  limitadoPorTempo: boolean;
  /** Tempo gasto na amostragem, em ms. */
  duracaoMs: number;
}

/**
 * Teto de tentativas por execução, para uma cauda azarada não travar a página.
 *
 * Truncar uma execução falseia o resultado para baixo, então quem chama mantém
 * este teto bem acima da campanha média (ver LIMITE_SIMULAVEL, em plan.ts) e
 * confere `truncadas` no resultado.
 */
const MAX_TENTATIVAS_PADRAO = 4_000_000;

/**
 * Execuções entre duas checagens do relógio, e teto de tentativas entre elas.
 *
 * Só contar execuções não serve: numa campanha cara um lote de 256 leva
 * segundos, e o corte por tempo chegaria tarde demais. O contador de tentativas
 * é que segura o estouro quando cada execução é pesada.
 */
const LOTE = 256;
const TENTATIVAS_ENTRE_CHECAGENS = 100_000;

export interface SimulacaoOpts {
  /** Teto de execuções. A simulação para antes se o tempo acabar. */
  execucoes: number;
  /** Teto de tempo de parede, em ms. `Infinity` desliga o corte por tempo. */
  tempoMs?: number;
  /** Semente do gerador — mesma semente, mesmo resultado. */
  seed?: number;
  /** Teto de tentativas dentro de uma única execução. */
  maxTentativas?: number;
}

// ---------------------------------------------------------------------------
// Compilação
//
// O laço interno roda milhões de vezes, então tudo que ele precisa vira array
// tipado indexado por nível de refino, e cada material vira um índice fixo. Sem
// isso, uma consulta de Map por tentativa domina o tempo da página.
// ---------------------------------------------------------------------------

/** Um trecho de refino pronto para simular, indexado por nível de refino. */
interface Trilha {
  de: number;
  para: number;
  chance: Float64Array;
  custo: Float64Array;
  /** Parcela de `custo` que é taxa do refinador, para poder ser somada à parte. */
  taxa: Float64Array;
  /** Nível para onde a falha leva; -1 significa que o item é destruído. */
  falha: Int32Array;
  /** Índice do minério consumido, dentro do vetor de contagem. */
  slotMinerio: Int32Array;
  /** Bênçãos do Ferreiro gastas na tentativa. */
  qtdBencao: Float64Array;
}

type FaseCompilada =
  | { tipo: 'refino'; trilha: Trilha }
  | {
      tipo: 'grau';
      chance: number;
      custo: number;
      seguro: boolean;
      slotMaterial: number;
      qtdMaterial: number;
      qtdBencao: number;
      /** Refino a reconquistar quando o processo normal destrói o item. */
      reposicao: Trilha;
    };

function compilarTrilha(
  de: number,
  para: number,
  politica: PolicyEntry[],
  slot: (itemId: number) => number,
): Trilha {
  const chance = new Float64Array(para);
  const custo = new Float64Array(para);
  const taxa = new Float64Array(para);
  const falha = new Int32Array(para);
  const slotMinerio = new Int32Array(para);
  const qtdBencao = new Float64Array(para);

  for (let r = 0; r < para; r++) {
    const a = politica[r]!.acao;
    chance[r] = a.chance;
    custo[r] = a.custo;
    taxa[r] = a.taxa;
    falha[r] = a.falhaVaiPara ?? -1;
    slotMinerio[r] = slot(a.ore.itemId);
    qtdBencao[r] = a.bencaos;
  }

  return { de, para, chance, custo, taxa, falha, slotMinerio, qtdBencao };
}

/**
 * Simula a campanha inteira para extrair os percentis que o cálculo exato (que
 * só devolve a média) não fornece.
 *
 * A média de um refino é enganosa: a distribuição tem cauda longa à direita, e
 * quem se planeja pela média fica sem recursos no meio do caminho quase metade
 * das vezes. Os percentis é que respondem "quanto preciso ter em caixa".
 */
export function simulateCampaign(
  fases: Fase[],
  opts: RefineOptions,
  sim: SimulacaoOpts,
): SimulationResult {
  const execucoes = sim.execucoes;
  const tempoMs = sim.tempoMs ?? Infinity;
  const maxTentativas = sim.maxTentativas ?? MAX_TENTATIVAS_PADRAO;
  const rand = rng(sim.seed ?? 0x5eed);

  // Cada material vira um índice fixo no vetor de contagem.
  const itemIds: number[] = [];
  const indice = new Map<number, number>();
  const slot = (itemId: number) => {
    let i = indice.get(itemId);
    if (i === undefined) {
      i = itemIds.length;
      itemIds.push(itemId);
      indice.set(itemId, i);
    }
    return i;
  };

  const slotBencao = slot(BLESSING_ITEM_ID);
  const slotBencaoEter = slot(ETHER_BLESSING_ITEM_ID);

  const compiladas: FaseCompilada[] = fases.map((fase) =>
    fase.tipo === 'refino'
      ? { tipo: 'refino', trilha: compilarTrilha(fase.de, fase.para, fase.politica, slot) }
      : {
          tipo: 'grau',
          chance: fase.plano.chance,
          custo: fase.plano.custoPorTentativa,
          seguro: fase.plano.seguro,
          slotMaterial: slot(
            (fase.plano.seguro ? fase.plano.step.seguro : fase.plano.step.normal).material.itemId,
          ),
          qtdMaterial: (fase.plano.seguro ? fase.plano.step.seguro : fase.plano.step.normal).material
            .qtd,
          qtdBencao: fase.plano.qtdBencaos,
          reposicao: compilarTrilha(
            opts.refinoReposicao,
            fase.plano.refino,
            fase.plano.refinoReposicao.politica,
            slot,
          ),
        },
  );

  const nItens = itemIds.length;
  const custos = new Float64Array(execucoes);
  const quebras = new Float64Array(execucoes);
  const taxas = new Float64Array(execucoes);
  // Uma matriz achatada: amostras[item * execucoes + n].
  const amostras = new Float64Array(nItens * execucoes);
  const contagem = new Float64Array(nItens);

  const precoItem = opts.precoItem;
  const refinoReposicao = opts.refinoReposicao;

  let semQuebra = 0;
  let somaTentativas = 0;
  let truncadas = 0;

  // A amostragem para no teto de execuções OU quando o tempo acaba, o que vier
  // primeiro. O relógio é conferido de lote em lote: `performance.now()` a cada
  // execução custaria mais que a própria execução nos alvos baratos.
  const inicio = agora();
  const prazo = inicio + tempoMs;
  let limitadoPorTempo = false;
  let n = 0;
  let desdeChecagem = 0;

  for (; n < execucoes; n++) {
    if (n > 0 && (n % LOTE === 0 || desdeChecagem >= TENTATIVAS_ENTRE_CHECAGENS)) {
      desdeChecagem = 0;
      if (agora() >= prazo) {
        limitadoPorTempo = true;
        break;
      }
    }
    contagem.fill(0);
    let zeny = 0;
    let taxa = 0;
    let quebrou = 0;
    let tentativas = 0;

    /** Percorre um trecho de refino até chegar em `trilha.para`. */
    const rodar = (trilha: Trilha, inicio: number) => {
      let r = inicio;
      const alvo = trilha.para;
      while (r < alvo && tentativas < maxTentativas) {
        tentativas++;
        zeny += trilha.custo[r]!;
        taxa += trilha.taxa[r]!;
        contagem[trilha.slotMinerio[r]!]! += 1;
        const bencaos = trilha.qtdBencao[r]!;
        if (bencaos > 0) contagem[slotBencao]! += bencaos;

        if (rand() < trilha.chance[r]!) {
          r++;
        } else {
          const destino = trilha.falha[r]!;
          if (destino < 0) {
            quebrou++;
            zeny += precoItem;
            r = refinoReposicao;
          } else {
            r = destino;
          }
        }
      }
    };

    for (const fase of compiladas) {
      if (fase.tipo === 'refino') {
        rodar(fase.trilha, fase.trilha.de);
        continue;
      }

      for (let guarda = 0; guarda < 10_000; guarda++) {
        zeny += fase.custo;
        contagem[fase.slotMaterial]! += fase.qtdMaterial;
        if (fase.qtdBencao > 0) contagem[slotBencaoEter]! += fase.qtdBencao;

        if (rand() < fase.chance) break;

        if (!fase.seguro) {
          // O processo normal destrói o item: comprar outro e refiná-lo de novo.
          quebrou++;
          zeny += precoItem;
          rodar(fase.reposicao, refinoReposicao);
        }
      }
    }

    custos[n] = zeny;
    quebras[n] = quebrou;
    taxas[n] = taxa;
    if (quebrou === 0) semQuebra++;
    if (tentativas >= maxTentativas) truncadas++;
    somaTentativas += tentativas;
    desdeChecagem += tentativas;
    for (let i = 0; i < nItens; i++) amostras[i * execucoes + n] = contagem[i]!;
  }

  // `n` é quanto de fato rodou: as fatias param aí, senão as execuções que
  // sobraram entrariam como zeros e puxariam todo percentil para baixo.
  const rodadas = Math.max(1, n);
  const custosFeitos = custos.subarray(0, rodadas);
  const quebrasFeitas = quebras.subarray(0, rodadas);
  const taxasFeitas = taxas.subarray(0, rodadas);

  const itens: Record<number, Percentis> = {};
  const mediaItens: Record<number, number> = {};
  for (let i = 0; i < nItens; i++) {
    const fatia = amostras.subarray(i * execucoes, i * execucoes + rodadas);
    const m = media(fatia);
    // Materiais que a estratégia escolhida nunca usa não entram no resultado.
    if (m === 0) continue;
    itens[itemIds[i]!] = percentis(fatia);
    mediaItens[itemIds[i]!] = m;
  }

  let soma = 0;
  for (const c of custosFeitos) soma += c;

  return {
    custo: percentis(custosFeitos),
    quebras: percentis(quebrasFeitas),
    taxas: percentis(taxasFeitas),
    itens,
    custoMedio: soma / rodadas,
    mediaItens,
    mediaQuebras: media(quebrasFeitas),
    chanceSemQuebra: semQuebra / rodadas,
    tentativasMedias: somaTentativas / rodadas,
    execucoes: rodadas,
    truncadas,
    limitadoPorTempo,
    duracaoMs: agora() - inicio,
  };
}

/** Relógio monotônico, com queda para `Date.now()` onde não houver `performance`. */
function agora(): number {
  return typeof performance !== 'undefined' ? performance.now() : Date.now();
}

function media(amostras: Float64Array): number {
  let soma = 0;
  for (const v of amostras) soma += v;
  return soma / amostras.length;
}

function percentis(amostras: Float64Array): Percentis {
  const ordenado = Float64Array.from(amostras).sort();
  const at = (q: number) => {
    const i = Math.min(ordenado.length - 1, Math.max(0, Math.ceil(q * ordenado.length) - 1));
    return ordenado[i]!;
  };
  return { p50: at(0.5), p75: at(0.75), p90: at(0.9), p95: at(0.95), p99: at(0.99) };
}
