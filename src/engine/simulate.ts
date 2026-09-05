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

/**
 * Amostras cruas de um pedaço das execuções: quanto cada campanha simulada
 * consumiu, material a material.
 *
 * Os percentis são marginais e não sabem responder "dá com o que eu tenho?":
 * faltar Oridecon e faltar zeny na MESMA campanha não é a soma dos dois azares,
 * e a pergunta do estoque depende dessa distribuição conjunta. Guardar as
 * execuções cruas deixa a resposta ser recalculada a cada tecla digitada, sem
 * simular de novo — ver `src/engine/estoque.ts`.
 *
 * Como as execuções são independentes e igualmente distribuídas, guardar as
 * primeiras é uma amostra tão válida quanto qualquer outra, e mantém leve a
 * resposta que atravessa o Worker.
 */
export interface AmostrasCampanha {
  /** Materiais, na ordem das colunas de `consumo`. */
  itemIds: number[];
  /** Zeny total de cada execução, com tudo cotado a preço de mercado. */
  custo: Float64Array;
  /** Itens-base destruídos em cada execução. */
  quebras: Float64Array;
  /** Achatado: `consumo[i * execucoes + n]` unidades do material `i`. */
  consumo: Float64Array;
  /** Quantas execuções estão guardadas aqui — nem sempre todas as simuladas. */
  execucoes: number;
  /** Os pontos de progresso da campanha, na ordem em que ela os atravessa. */
  marcos: Marco[];
  /**
   * Consumo acumulado em cada marco: `progresso[(m * itens + i) * execucoesMarcos + n]`.
   *
   * O total já diz *se* o estoque dá; isto diz **até onde** ele leva. São as
   * mesmas execuções, fotografadas no caminho em vez de só no fim.
   */
  progresso: Float64Array;
  /** Custo acumulado em cada marco: `[m * execucoesMarcos + n]`. */
  progressoCusto: Float64Array;
  /** Quebras acumuladas em cada marco: `[m * execucoesMarcos + n]`. */
  progressoQuebras: Float64Array;
  /** Execuções guardadas no progresso — bem menos que `execucoes`, ver `MAX_MARCOS_GUARDADOS`. */
  execucoesMarcos: number;
}

/**
 * Um ponto de progresso da campanha: o item chegou aqui pela primeira vez.
 *
 * Só a **primeira** chegada conta. A campanha sobe e desce o mesmo degrau
 * dezenas de vezes, e o que interessa é o avanço — o ponto mais longe que ela
 * alcançou com o que já gastou.
 */
export interface Marco {
  /** Rótulo curto: `+9`, `Grau C`. */
  rotulo: string;
  /** A fase a que ele pertence, para a tela dizer de que trecho se trata. */
  faseRotulo: string;
  tipo: 'refino' | 'grau';
}

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
  /** Execuções cruas guardadas para a pergunta do estoque. */
  amostras: AmostrasCampanha;
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
 * Execuções cruas guardadas no resultado (ver `AmostrasCampanha`).
 *
 * 5 mil bastam: a chance que elas sustentam tem margem de erro de menos de um
 * ponto percentual, e a resposta continua leve o bastante para atravessar o
 * Worker a cada cálculo.
 */
const MAX_AMOSTRAS_GUARDADAS = 5_000;

/**
 * Execuções guardadas com o progresso marco a marco.
 *
 * São bem menos que as 5 mil do consumo total, e de propósito: esta amostra é
 * uma matriz (marcos × materiais) por execução, não um vetor, e a pergunta que
 * ela responde é grossa — "até onde eu chego", em degraus de refino. Mil
 * execuções dão a esse quartil um erro de ~1,5 ponto percentual, muito abaixo
 * da largura de um degrau.
 */
const MAX_MARCOS_GUARDADOS = 1_000;

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
      /**
       * Refino a reconquistar quando o processo normal destrói o item. `null` no
       * processo seguro, que não destrói nada — e é o único permitido quando a
       * perda do item não é aceitável.
       */
      reposicao: Trilha | null;
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

  // Os vetores são indexados pelo nível de refino, mas a política pode não
  // começar no +0: sem aceitar a perda do item ela só existe do piso para cima.
  // Os níveis abaixo dele ficam zerados e nunca são lidos — nenhuma falha da
  // política leva para lá.
  for (const p of politica) {
    const a = p.acao;
    chance[p.de] = a.chance;
    custo[p.de] = a.custo;
    taxa[p.de] = a.taxa;
    falha[p.de] = a.falhaVaiPara ?? -1;
    slotMinerio[p.de] = slot(a.ore.itemId);
    qtdBencao[p.de] = a.bencaos;
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
          reposicao: fase.plano.refinoReposicao
            ? compilarTrilha(
                opts.refinoReposicao,
                fase.plano.refino,
                fase.plano.refinoReposicao.politica,
                slot,
              )
            : null,
        },
  );

  const nItens = itemIds.length;
  const custos = new Float64Array(execucoes);
  const quebras = new Float64Array(execucoes);
  const taxas = new Float64Array(execucoes);
  // Uma matriz achatada: consumo[item * execucoes + n].
  const consumo = new Float64Array(nItens * execucoes);
  const contagem = new Float64Array(nItens);

  // Os pontos de progresso, na ordem em que a campanha os atravessa: um por
  // degrau de refino de cada fase, e um por grau conquistado. É a mesma lista
  // que a tela lê para dizer onde o estoque acabou.
  const marcos: Marco[] = [];
  for (const fase of fases) {
    if (fase.tipo === 'refino') {
      for (let r = fase.de + 1; r <= fase.para; r++) {
        marcos.push({ rotulo: `+${r}`, faseRotulo: fase.rotulo, tipo: 'refino' });
      }
    } else {
      const para = fase.plano.step.para;
      marcos.push({ rotulo: `Grau ${para}`, faseRotulo: fase.rotulo, tipo: 'grau' });
    }
  }

  const nMarcos = marcos.length;
  const marcosGuardados = Math.min(execucoes, MAX_MARCOS_GUARDADOS);
  const progresso = new Float64Array(nMarcos * nItens * marcosGuardados);
  const progressoCusto = new Float64Array(nMarcos * marcosGuardados);
  const progressoQuebras = new Float64Array(nMarcos * marcosGuardados);

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
    // Quantos marcos esta execução já atravessou. Eles vêm sempre na mesma
    // ordem — as fases correm em sequência e, dentro de uma, o refino só é
    // alcançado pela primeira vez em ordem crescente —, então um contador só
    // basta para saber qual é o próximo.
    let marcosFeitos = 0;

    const guardaMarcos = n < marcosGuardados;

    /** Fotografa o consumo acumulado no marco que acabou de ser alcançado. */
    const marcar = () => {
      const m = marcosFeitos++;
      if (!guardaMarcos) return;
      for (let k = 0; k < nItens; k++) {
        progresso[(m * nItens + k) * marcosGuardados + n] = contagem[k]!;
      }
      progressoCusto[m * marcosGuardados + n] = zeny;
      progressoQuebras[m * marcosGuardados + n] = quebrou;
    };

    /**
     * Percorre um trecho de refino até chegar em `trilha.para`.
     *
     * `marca` distingue a subida que é progresso da que é recuperação: a
     * reposição de um item quebrado no meio de uma fase de grau reconquista um
     * refino que a campanha já tinha, e contá-la de novo faria a campanha
     * "avançar" a cada azar.
     */
    const rodar = (trilha: Trilha, inicio: number, marca: boolean) => {
      let r = inicio;
      const alvo = trilha.para;
      let maisLonge = inicio;
      while (r < alvo && tentativas < maxTentativas) {
        tentativas++;
        zeny += trilha.custo[r]!;
        taxa += trilha.taxa[r]!;
        contagem[trilha.slotMinerio[r]!]! += 1;
        const bencaos = trilha.qtdBencao[r]!;
        if (bencaos > 0) contagem[slotBencao]! += bencaos;

        if (rand() < trilha.chance[r]!) {
          r++;
          if (marca && r > maisLonge) {
            maisLonge = r;
            marcar();
          }
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
        rodar(fase.trilha, fase.trilha.de, true);
        continue;
      }

      for (let guarda = 0; guarda < 10_000; guarda++) {
        zeny += fase.custo;
        contagem[fase.slotMaterial]! += fase.qtdMaterial;
        if (fase.qtdBencao > 0) contagem[slotBencaoEter]! += fase.qtdBencao;

        if (rand() < fase.chance) {
          marcar();
          break;
        }

        if (!fase.seguro) {
          // O processo normal destrói o item: comprar outro e refiná-lo de novo.
          quebrou++;
          zeny += precoItem;
          rodar(fase.reposicao!, refinoReposicao, false);
        }
      }
    }

    // Execução truncada pelo teto de tentativas: os marcos que ela não chegou a
    // alcançar ficam com o consumo final. É o mesmo que dizer "daqui não passou
    // com o que gastou", que é a leitura certa — e `truncadas` já avisa que
    // essas execuções existem.
    while (marcosFeitos < nMarcos) marcar();

    custos[n] = zeny;
    quebras[n] = quebrou;
    taxas[n] = taxa;
    if (quebrou === 0) semQuebra++;
    if (tentativas >= maxTentativas) truncadas++;
    somaTentativas += tentativas;
    desdeChecagem += tentativas;
    for (let i = 0; i < nItens; i++) consumo[i * execucoes + n] = contagem[i]!;
  }

  // `n` é quanto de fato rodou: as fatias param aí, senão as execuções que
  // sobraram entrariam como zeros e puxariam todo percentil para baixo.
  const rodadas = Math.max(1, n);
  const custosFeitos = custos.subarray(0, rodadas);
  const quebrasFeitas = quebras.subarray(0, rodadas);
  const taxasFeitas = taxas.subarray(0, rodadas);

  const itens: Record<number, Percentis> = {};
  const mediaItens: Record<number, number> = {};
  const usados: number[] = [];
  for (let i = 0; i < nItens; i++) {
    const fatia = consumo.subarray(i * execucoes, i * execucoes + rodadas);
    const m = media(fatia);
    // Materiais que a estratégia escolhida nunca usa não entram no resultado.
    if (m === 0) continue;
    usados.push(i);
    itens[itemIds[i]!] = percentis(fatia);
    mediaItens[itemIds[i]!] = m;
  }

  const guardadas = Math.min(rodadas, MAX_AMOSTRAS_GUARDADAS);
  const consumoGuardado = new Float64Array(usados.length * guardadas);
  for (let c = 0; c < usados.length; c++) {
    const i = usados[c]!;
    for (let n2 = 0; n2 < guardadas; n2++) consumoGuardado[c * guardadas + n2] = consumo[i * execucoes + n2]!;
  }
  // O progresso é recortado nas mesmas colunas do consumo — materiais que a
  // estratégia nunca toca não viram campo na tela e não precisam de trajetória
  // — e nas execuções que de fato rodaram.
  const marcosFeitos = Math.min(rodadas, marcosGuardados);
  const progressoGuardado = new Float64Array(nMarcos * usados.length * marcosFeitos);
  for (let m = 0; m < nMarcos; m++) {
    for (let c = 0; c < usados.length; c++) {
      const i = usados[c]!;
      for (let n2 = 0; n2 < marcosFeitos; n2++) {
        progressoGuardado[(m * usados.length + c) * marcosFeitos + n2] =
          progresso[(m * nItens + i) * marcosGuardados + n2]!;
      }
    }
  }
  const recorte = (v: Float64Array) => {
    const saida = new Float64Array(nMarcos * marcosFeitos);
    for (let m = 0; m < nMarcos; m++) {
      for (let n2 = 0; n2 < marcosFeitos; n2++) {
        saida[m * marcosFeitos + n2] = v[m * marcosGuardados + n2]!;
      }
    }
    return saida;
  };

  const amostras: AmostrasCampanha = {
    itemIds: usados.map((i) => itemIds[i]!),
    custo: custosFeitos.slice(0, guardadas),
    quebras: quebrasFeitas.slice(0, guardadas),
    consumo: consumoGuardado,
    execucoes: guardadas,
    marcos,
    progresso: progressoGuardado,
    progressoCusto: recorte(progressoCusto),
    progressoQuebras: recorte(progressoQuebras),
    execucoesMarcos: marcosFeitos,
  };

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
    amostras,
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

/**
 * Percentis de uma amostra. Exportado porque o veredito do estoque roda fora
 * daqui e precisa cortar a distribuição do mesmo jeito.
 */
export function percentis(amostras: Float64Array): Percentis {
  const ordenado = Float64Array.from(amostras).sort();
  const at = (q: number) => corte(ordenado, q);
  return { p50: at(0.5), p75: at(0.75), p90: at(0.9), p95: at(0.95), p99: at(0.99) };
}

/**
 * Um quantil qualquer da amostra, pelo mesmo corte dos percentis.
 *
 * Os cinco percentis fixos são as margens que a tela oferece; o painel de
 * estoque pergunta o inverso ("quanto preciso para 10% de chance?"), e aí o
 * corte é onde a pessoa apontar.
 */
export function quantil(amostras: Float64Array, q: number): number {
  return corte(Float64Array.from(amostras).sort(), q);
}

/**
 * Que fatia da amostra custou até `v` — o inverso de `quantil`.
 *
 * `quantil` responde "quanto custa cobrir 90%?"; esta responde "90% de quê?"
 * para um valor qualquer, que é o que a curva de custo pergunta quando alguém
 * aponta um ponto dela que não é nenhuma das cinco margens.
 *
 * Recebe a amostra **já ordenada**, ao contrário de `quantil`: quem lê pergunta
 * a cada movimento do cursor, e ordenar 5 mil custos por pixel percorrido
 * custaria mil vezes mais que a busca binária que responde.
 *
 * Nos alvos baratos o resultado salta de degrau em degrau, e o salto é a
 * verdade: entre dois blocos de custo há valores que não podem acontecer, então
 * não existe campanha nenhuma a acumular ali.
 */
export function chanceAte(ordenado: Float64Array, v: number): number {
  let baixo = 0;
  let alto = ordenado.length;
  while (baixo < alto) {
    const meio = (baixo + alto) >>> 1;
    if (ordenado[meio]! <= v) baixo = meio + 1;
    else alto = meio;
  }
  return baixo / ordenado.length;
}

/**
 * O mesmo corte de `quantil`, numa amostra **já ordenada**.
 *
 * O painel de estoque pergunta o quantil de cinco distribuições a cada passo de
 * uma bisseção; reordenar todas elas dezenas de vezes custaria mais que a busca.
 */
export function quantilOrdenado(ordenado: Float64Array, q: number): number {
  return corte(ordenado, q);
}

/**
 * O menor valor que deixa pelo menos a fração `q` da amostra abaixo dele — daí
 * o `ceil`: cortar em 0,9 devolve um número que cobre 90% das campanhas, nunca
 * 89,98%.
 */
function corte(ordenado: Float64Array, q: number): number {
  const i = Math.min(ordenado.length - 1, Math.max(0, Math.ceil(q * ordenado.length) - 1));
  return ordenado[i]!;
}
