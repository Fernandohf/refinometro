import refineChances from '../data/refineChances.json';
import {
  blessingCost,
  BLESSING_ITEM_ID,
  oresFor,
  taxaDaTentativa,
  type ItemKind,
  type Ore,
} from '../data/ores';
import { refinoMaximoDoEfeito, type Atalho } from '../data/atalhos';
import { oreCost, unitCost } from './pricing';
import { fatorarLU, resolverLU } from './linear';
import type { Destino, PolicyEntry, PriceTable, RefineAction, ResourceUsage } from './types';

type ChanceTab = 'normal' | 'normalEvent' | 'special' | 'specialEvent';
const TABS = refineChances.chances as Record<ChanceTab, Record<string, Record<string, number | null>>>;

/**
 * Coluna da tabela de chances para uma categoria. Arma e armadura sombrias
 * dividem a mesma coluna "Sombrio" — o que muda entre elas é só o minério.
 */
function colunaDe(kind: ItemKind): string {
  return kind === 'shadowW' || kind === 'shadowA' ? 'shadow' : kind;
}

/**
 * Chance de a tentativa que produz `+para` dar certo, para um item `kind`.
 *
 * `aumentada` é a propriedade do MINÉRIO de usar a tabela alta (`Ore.chanceAumentada`),
 * e não a de ser um minério especial: nem todo especial aumenta a chance.
 */
export function chanceOf(kind: ItemKind, para: number, aumentada: boolean, evento: boolean): number | null {
  const tab: ChanceTab = aumentada ? (evento ? 'specialEvent' : 'special') : evento ? 'normalEvent' : 'normal';
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
  /**
   * Se destruir o item é uma opção. `false` para equipamento insubstituível —
   * com carta, encanto ou de evento —, e aí nenhum preço torna a quebra
   * aceitável: ela vira restrição, não custo (ver `pisoSeguro`).
   */
  perdaAceitavel: boolean;
  /** Preço de reposição do item, cobrado sempre que ele quebra. */
  precoItem: number;
  /** Refino do item de reposição comprado após uma quebra. */
  refinoReposicao: number;
  /**
   * Cubos, martelos e pergaminhos que servem para ESTE item (ver `atalhosDoItem`). Vazio
   * quando o jogador desliga a opção, ou quando nenhum serve.
   */
  atalhos: readonly Atalho[];
}

/** Todas as ações viáveis para sair do refino `de` e tentar `de + 1`. */
export function actionsAt(de: number, opts: RefineOptions): RefineAction[] {
  const acoes: RefineAction[] = [];
  const precoBencao = unitCost(BLESSING_ITEM_ID, opts.precos);
  const qtdBencao = opts.usarBencaoFerreiro ? blessingCost(opts.kind, de) : null;

  for (const ore of oresFor(opts.kind, de)) {
    if (ore.especial && !opts.usarMineriosEspeciais) continue;

    // A tabela é escolhida por `chanceAumentada`, não por `especial`: o Bradium
    // Perfeito e o Carnium Perfeito são minérios especiais que, pela descrição
    // deles, só trocam a quebra por perder 1 refino — não aumentam a chance.
    const chance = chanceOf(opts.kind, de + 1, ore.chanceAumentada, opts.evento);
    if (chance === null || chance <= 0) continue;

    const custoMinerio = oreCost(ore, opts.precos);
    if (!Number.isFinite(custoMinerio)) continue; // sem preço nem receita: não dá pra usar

    // A taxa depende do minério, então entra por ação e não como constante da
    // campanha: minério de Cash Shop é isento nas armas nv1 a nv4.
    const taxa = taxaDaTentativa(opts.kind, ore);

    // Sem Bênção: a penalidade do minério vale.
    acoes.push({
      tipo: 'minerio',
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
        tipo: 'minerio',
        ore,
        bencaos: qtdBencao,
        chance,
        taxa,
        custo: custoMinerio + taxa + qtdBencao * precoBencao,
        falhaVaiPara: de,
      });
    }
  }

  for (const atalho of opts.atalhos) {
    const acao = usoDeAtalho(atalho, de, opts.precos);
    if (acao) acoes.push(acao);
  }

  return semDominadas(acoes, de);
}

/**
 * O uso de um atalho no refino `de`, ou `null` quando ele não serve ali.
 *
 * Fora da faixa aceita não serve, e sem preço também não — a mesma regra do minério sem preço
 * nem receita: o atalho que ninguém informou quanto custa sai das estratégias possíveis, em vez
 * de entrar de graça. É o que mantém os Tickets presos na conta fora do plano até alguém dizer
 * que tem um.
 *
 * Também não serve o atalho que não leva a lugar nenhum: um Cubo Ilusional num item +10 só
 * poderia manter ou baixar o refino, e o Mestre do Refino recusa o pergaminho que não sobe.
 */
function usoDeAtalho(atalho: Atalho, de: number, precos: PriceTable): RefineAction | null {
  if (de < atalho.aceitaDe[0] || de > atalho.aceitaDe[1]) return null;
  if (refinoMaximoDoEfeito(atalho.efeito, de) <= de) return null;

  let custo = unitCost(atalho.itemId, precos);
  for (const mat of atalho.materiais) custo += unitCost(mat.itemId, precos) * mat.qtd;
  if (!Number.isFinite(custo)) return null;

  const e = atalho.efeito;
  const destinos: Destino[] =
    e.tipo === 'fixo'
      ? [{ refino: e.refino, p: 1 }]
      : e.tipo === 'soma'
        ? [{ refino: de + e.refinos, p: 1 }]
        : e.resultados.map((r) => ({ refino: r.refino, p: r.p }));

  return { tipo: 'atalho', atalho, destinos, custo, taxa: 0 };
}

/**
 * Para onde uma ação tomada no refino `de` leva o item, e com que probabilidade. `null` é o
 * item destruído.
 *
 * É a única leitura de transição do motor: o solver, a análise de segurança e a simulação
 * perguntam aqui, e por isso não precisam saber se a ação é um minério ou um cubo. Destinos de
 * probabilidade zero ficam de fora — num degrau de 100% a penalidade do minério existe no
 * papel, mas não é um lugar aonde o item possa ir.
 */
export function destinosDe(a: RefineAction, de: number): Destino[] {
  if (a.tipo === 'atalho') return a.destinos.filter((d) => d.p > 0);
  const saida: Destino[] = [];
  if (a.chance > 0) saida.push({ refino: de + 1, p: a.chance });
  if (a.chance < 1) saida.push({ refino: a.falhaVaiPara, p: 1 - a.chance });
  return saida;
}

/** O que uma ação consome por uso. A taxa do refinador fica de fora: é zeny, não item. */
export function consumoDe(a: RefineAction): { itemId: number; qtd: number }[] {
  if (a.tipo === 'atalho') {
    return [
      { itemId: a.atalho.itemId, qtd: 1 },
      ...a.atalho.materiais.map((m) => ({ itemId: m.itemId, qtd: m.qtd })),
    ];
  }
  return a.bencaos > 0
    ? [
        { itemId: a.ore.itemId, qtd: 1 },
        { itemId: BLESSING_ITEM_ID, qtd: a.bencaos },
      ]
    : [{ itemId: a.ore.itemId, qtd: 1 }];
}

/** Probabilidade de a ação, tomada no refino `de`, destruir o item. */
export function chanceDeQuebra(a: RefineAction, de: number): number {
  return destinosDe(a, de).reduce((s, d) => s + (d.refino === null ? d.p : 0), 0);
}

/**
 * Descarta ações que outra faz igual e mais barato.
 *
 * Duas ações com a mesma chance e o mesmo destino de falha são indistinguíveis
 * para o motor: a matriz de transição é idêntica e só o custo muda. A cara
 * nunca é escolhida, mas sobreviver até a política deixaria o plano poder
 * exibi-la num empate — e é justamente o par que confunde quem lê a estratégia,
 * porque a proteção do minério vira letra morta ao lado da Bênção.
 *
 * Cortar aqui é seguro para a análise de segurança (`niveisSeguros`): quando
 * duas ações têm o mesmo destino de falha, tirar uma não muda o conjunto de
 * destinos alcançáveis a partir do nível.
 */
function semDominadas(acoes: RefineAction[], de: number): RefineAction[] {
  const melhorPorTransicao = new Map<string, RefineAction>();
  for (const a of acoes) {
    // Pelos destinos, e não pelo tipo: o martelo de +1 e um degrau de 100% levam
    // ao mesmo lugar, e a cara dos dois nunca seria escolhida.
    const chave = destinosDe(a, de)
      .map((d) => `${d.refino ?? 'quebra'}:${d.p}`)
      .join('|');
    const atual = melhorPorTransicao.get(chave);
    if (!atual || a.custo < atual.custo) melhorPorTransicao.set(chave, a);
  }
  return [...melhorPorTransicao.values()];
}

/**
 * Uma ação é legal quando o plano pode arcar com o que ela faz na falha.
 *
 * Aceitando a perda, tudo é legal: quebrar tem preço e o otimizador decide. Sem
 * aceitar, não basta a tentativa em si não quebrar o item — ela não pode
 * derrubar o refino para um nível de onde só se sai arriscando o equipamento.
 * É por isso que a legalidade depende do `piso`, e não só do minério.
 */
function acaoLegal(a: RefineAction, de: number, piso: number, opts: RefineOptions): boolean {
  if (opts.perdaAceitavel) return true;
  return destinosDe(a, de).every((d) => d.refino !== null && d.refino >= piso);
}

/**
 * Refino mais baixo a partir do qual existe caminho até `alvo` sem nunca
 * arriscar o item.
 *
 * Um nível é seguro quando tem alguma ação que não destrói o item e cuja falha
 * cai em outro nível seguro — a Bênção do Ferreiro, que segura o refino no
 * lugar, sempre serve. Como toda falha desce (ou fica parada), dá para resolver
 * o ponto fixo de baixo para cima numa passada só.
 *
 * O piso é o começo do trecho seguro que encosta no alvo: de nada adiantaria um
 * nível seguro isolado lá embaixo se, para chegar nele, o item tivesse que
 * passar por um nível de onde só se sai arriscando a quebra.
 *
 * Numa Arma nv4 o piso é +7: do +7 para cima a Bênção segura o item, e abaixo
 * dele todo minério da categoria pode destruí-lo. Já numa Arma nv5 o piso é +0,
 * porque o Eteridecon derruba 3 refinos mas nunca quebra.
 */
export function pisoSeguro(alvo: number, opts: RefineOptions): number {
  if (opts.perdaAceitavel) return 0;
  return inicioDoTrechoSeguro(alvo, niveisSeguros(alvo, opts));
}

/**
 * Para cada refino abaixo de `ate`, se dá para tentar dali sem arriscar o item.
 *
 * Não depende do alvo — é uma propriedade do nível e dos minérios que o
 * atendem —, então uma passada só serve para responder por todos os alvos da
 * lista (ver `riscoPorAlvo`).
 */
function niveisSeguros(ate: number, opts: RefineOptions): boolean[] {
  const seguro: boolean[] = [];
  for (let r = 0; r < ate; r++) {
    // Para cima não precisa conferir: o piso é o começo de um trecho seguro CONTÍGUO até o
    // alvo, então quem sobe a partir de um nível do trecho cai dentro dele. Para baixo, o
    // destino já foi decidido nesta mesma passada.
    seguro[r] = actionsAt(r, opts).some((a) =>
      destinosDe(a, r).every((d) => d.refino !== null && (d.refino >= r || seguro[d.refino]!)),
    );
  }
  return seguro;
}

/** Onde começa o trecho seguro que encosta em `alvo`. `alvo` = não há nenhum. */
function inicioDoTrechoSeguro(alvo: number, seguro: boolean[]): number {
  let piso = alvo;
  for (let r = alvo - 1; r >= 0 && seguro[r]; r--) piso = r;
  return piso;
}

/** O que uma falha pode fazer no caminho até um alvo. */
export type RiscoDaFalha =
  /** Nenhuma tentativa do caminho falha. */
  | 'nenhuma'
  /** A falha derruba o refino, mas o item sempre sobrevive. */
  | 'derruba'
  /** Alguma tentativa do caminho pode destruir o item. */
  | 'quebra';

/**
 * As condições que decidem o risco. Nem o preço do item nem aceitar a perda
 * entram: o risco é uma propriedade dos minérios que a categoria tem à mão, e
 * não da disposição de quem refina — marcar a perda como aceitável não faz o
 * Oridecon parar de quebrar o equipamento.
 */
export type CondicoesDeRisco = Pick<
  RefineOptions,
  'kind' | 'precos' | 'evento' | 'usarBencaoFerreiro' | 'usarMineriosEspeciais' | 'atalhos'
>;

/**
 * O que uma falha pode fazer no caminho do refino `de` até cada alvo possível,
 * indexado pelo alvo (0 a `maxRefine`).
 *
 * Existe para a lista de alvos poder distinguir as duas coisas que a palavra
 * "risco" mistura: subir de +10 para +12 numa Arma nv4 só derruba o refino na
 * falha, enquanto sair do +0 para o mesmo +12 passa por uma faixa em que todo
 * minério pode destruir o equipamento. As duas seriam a mesma marca de aviso,
 * e são decisões completamente diferentes.
 *
 * O critério é o do próprio motor (ver `pisoSeguro`): existe caminho até o alvo
 * em que nenhuma tentativa destrói o item? Não basta olhar o minério de cada
 * degrau — uma falha que derruba 3 refinos pode largar o item numa faixa de
 * onde só se sai arriscando a quebra, e aí o caminho inteiro arrisca.
 */
export function riscoPorAlvo(de: number, cond: CondicoesDeRisco): RiscoDaFalha[] {
  const max = maxRefine(cond.kind);
  const limite = safeLimit(cond.kind);
  const opts: RefineOptions = {
    ...cond,
    perdaAceitavel: false,
    precoItem: 0,
    refinoReposicao: 0,
  };

  const seguro = niveisSeguros(max, opts);

  return Array.from({ length: max + 1 }, (_, alvo) => {
    // Abaixo do refino atual não há tentativa nenhuma; até o limite seguro da
    // categoria toda tentativa passa. Nos dois casos não há falha a qualificar.
    if (alvo <= de || alvo <= limite) return 'nenhuma';
    return de >= inicioDoTrechoSeguro(alvo, seguro) ? 'derruba' : 'quebra';
  });
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
  /**
   * Refino mais baixo que o plano admite visitar. É 0 quando a perda do item é
   * aceitável; sem isso, a política não tem entrada abaixo dele (ver `pisoSeguro`).
   */
  piso: number;
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
      piso: de,
      politica: [],
      custoEsperado: 0,
      recursos: { zeny: 0, itens: {}, itensQuebrados: 0, tentativas: 0, taxas: 0 },
    };
  }

  // A faixa de estados começa no piso e não no refino atual: uma falha pode
  // empurrar o item para baixo do ponto de partida, e o custo de voltar de lá
  // faz parte da conta. Aceitando a perda o piso é o +0; sem aceitar, é o refino
  // mais baixo de onde ainda se sai sem arriscar o equipamento.
  const piso = pisoSeguro(para, opts);
  if (de < piso) throw semCaminhoSeguro(de, para, piso);

  const n = para - piso; // `para` é absorvente e fica fora do sistema
  const acoesPorEstado: RefineAction[][] = [];
  for (let r = piso; r < para; r++) {
    const acoes = actionsAt(r, opts).filter((a) => acaoLegal(a, r, piso, opts));
    if (acoes.length === 0) {
      throw opts.perdaAceitavel
        ? new RefineImpossivel(
            `Não há minério disponível para levar o item de +${r} para +${r + 1}. ` +
              `Informe o preço dos minérios dessa faixa ou revise o alvo.`,
          )
        : semCaminhoSeguro(de, para, piso);
    }
    acoesPorEstado.push(acoes);
  }

  // Iteração de política: avalia a política atual de forma EXATA (sistema
  // linear), melhora estado a estado, repete. Bem mais confiável que iteração de
  // valor aqui — nos alvos altos o custo esperado passa de 10^10 zeny e a
  // iteração de valor precisaria de centenas de milhares de passos, entregando
  // números truncados que pareciam plausíveis.
  const escolha = new Int32Array(n);
  // Começa pela ação de menor custo imediato: é um chute válido e barato.
  for (let i = 0; i < n; i++) {
    const acoes = acoesPorEstado[i]!;
    let melhorIdx = 0;
    for (let k = 1; k < acoes.length; k++) {
      if (acoes[k]!.custo < acoes[melhorIdx]!.custo) melhorIdx = k;
    }
    escolha[i] = melhorIdx;
  }

  let avaliacao = avaliarPolitica(escolha, acoesPorEstado, piso, para, opts);

  for (let iter = 0; iter < MAX_ITER; iter++) {
    const E = avaliacao.custo;
    let mudou = false;

    for (let i = 0; i < n; i++) {
      const acoes = acoesPorEstado[i]!;
      let melhor = Infinity;
      let melhorIdx = escolha[i]!;
      for (let k = 0; k < acoes.length; k++) {
        const v = valorDaAcao(acoes[k]!, piso + i, E, piso, para, opts);
        if (v < melhor - 1e-6) {
          melhor = v;
          melhorIdx = k;
        }
      }
      if (melhorIdx !== escolha[i]) {
        escolha[i] = melhorIdx;
        mudou = true;
      }
    }

    if (!mudou) break;
    avaliacao = avaliarPolitica(escolha, acoesPorEstado, piso, para, opts);
  }

  const politica: PolicyEntry[] = [];
  for (let i = 0; i < n; i++) {
    politica.push({
      de: piso + i,
      acao: acoesPorEstado[i]![escolha[i]!]!,
      custoEsperado: avaliacao.custo[i]!,
    });
  }

  return {
    de,
    para,
    piso,
    politica,
    custoEsperado: avaliacao.custo[de - piso]!,
    recursos: avaliacao.recursos(de, politica),
  };
}

/** Custo esperado de tomar `a` no refino `r`, dados os valores `E` dos estados. */
function valorDaAcao(
  a: RefineAction,
  r: number,
  E: Float64Array,
  piso: number,
  para: number,
  opts: RefineOptions,
): number {
  let v = a.custo;
  for (const d of destinosDe(a, r)) {
    // Quebrar cobra a reposição e recomeça dela; passar do alvo é chegar nele.
    if (d.refino === null) v += d.p * (opts.precoItem + E[opts.refinoReposicao - piso]!);
    else v += d.p * E[Math.min(d.refino, para) - piso]!;
  }
  return v;
}

/** O alvo é inalcançável sem arriscar o item; a mensagem diz o que fazer. */
function semCaminhoSeguro(de: number, para: number, piso: number): RefineImpossivel {
  if (piso >= para) {
    return new RefineImpossivel(
      `Não há caminho até o +${para} sem arriscar destruir o item: nesta categoria toda tentativa ` +
        `da faixa pode quebrá-lo, e a Bênção do Ferreiro não cobre. Marque que a perda é aceitável ` +
        `para ver o plano com risco.`,
    );
  }
  return new RefineImpossivel(
    `Sem aceitar a perda do item não há caminho do +${de} até o +${para}: abaixo do +${piso} todo ` +
      `minério desta categoria pode destruir o equipamento. Comece do +${piso} ou marque que a ` +
      `perda é aceitável.`,
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
  piso: number,
  para: number,
  opts: RefineOptions,
): { custo: Float64Array; recursos: (de: number, politica: PolicyEntry[]) => ResourceUsage } {
  // A linha `i` da matriz é o refino `piso + i`. Aceitando a perda do item o
  // piso é 0 e os dois coincidem; sem aceitar, o sistema é só do piso para cima.
  const n = para - piso;
  const A = new Float64Array(n * n);

  for (let i = 0; i < n; i++) {
    const a = acoesPorEstado[i]![escolha[i]!]!;
    A[i * n + i] = A[i * n + i]! + 1;
    for (const d of destinosDe(a, piso + i)) {
      // O estado `para` é absorvente e vale 0, então some da matriz — e quem passa do alvo
      // chega nele.
      const j = (d.refino === null ? opts.refinoReposicao : Math.min(d.refino, para)) - piso;
      if (j < n) A[i * n + j] = A[i * n + j]! - d.p;
    }
  }

  const lu = fatorarLU(A, n);

  /** Resolve para um vetor de custo imediato por estado. */
  const resolver = (imediato: (a: RefineAction, r: number) => number): Float64Array => {
    const b = new Float64Array(n);
    for (let i = 0; i < n; i++) b[i] = imediato(acoesPorEstado[i]![escolha[i]!]!, piso + i);
    const x = resolverLU(lu, b);
    // Um estado a mais, valendo 0, para o alvo absorvente.
    const completo = new Float64Array(n + 1);
    completo.set(x);
    return completo;
  };

  const custo = resolver((a, r) => a.custo + chanceDeQuebra(a, r) * opts.precoItem);

  const recursos = (de: number, politica: PolicyEntry[]): ResourceUsage => {
    const itensUsados = new Set<number>();
    for (const p of politica) for (const c of consumoDe(p.acao)) itensUsados.add(c.itemId);

    // Um uso de cubo conta como uma tentativa: é uma ida ao balcão, e é a unidade com que a
    // simulação mede o trabalho de uma campanha.
    const tentativas = resolver(() => 1);
    const quebras = resolver((a, r) => chanceDeQuebra(a, r));
    const taxas = resolver((a) => a.taxa);

    const itens: Record<number, number> = {};
    for (const itemId of itensUsados) {
      const v = resolver((a) =>
        consumoDe(a).reduce((q, c) => q + (c.itemId === itemId ? c.qtd : 0), 0),
      );
      // A política cobre todo estado, inclusive os que o plano nunca visita: com
      // um cubo do +0 ao +11, o Oridecon escolhido para o +5 tem consumo zero, e
      // não pode virar uma linha "0 Oridecon" na lista de compras.
      if (v[de - piso]! > 1e-9) itens[itemId] = v[de - piso]!;
    }

    return {
      zeny: custo[de - piso]!,
      itens,
      itensQuebrados: quebras[de - piso]!,
      tentativas: tentativas[de - piso]!,
      taxas: taxas[de - piso]!,
    };
  };

  return { custo, recursos };
}

/** Lançado quando o alvo é inalcançável com os minérios e preços informados. */
export class RefineImpossivel extends Error {}
