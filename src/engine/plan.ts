import { GRADE_ORDER, type Grade } from '../data/grade';
import { BLESSING_ITEM_ID, blessingCost, ehSombrio, type FailureMode, type ItemKind } from '../data/ores';
import { ETHER_BLESSING_ITEM_ID } from '../data/grade';
import { maxRefine, RefineImpossivel, safeLimit, solveRefine, type RefineOptions } from './refine';
import { GrauImpossivel, solveGradeCampaign, suportaGrau, type GradeAttemptPlan } from './grade';
import { simulateCampaign, type Fase, type SimulationResult } from './simulate';
import type { CalcInput, PolicyEntry, ResourceUsage } from './types';

/** Um trecho de refino em que a mesma ação é a melhor escolha. */
export interface StrategyRange {
  de: number;
  para: number;
  minerio: string;
  minerioItemId: number;
  /** Bênçãos do Ferreiro por tentativa neste trecho (0 = nenhuma). */
  bencaos: number;
  chance: number;
  /** `true` quando uma falha aqui destrói o item. */
  arriscaQuebrar: boolean;
  /** Descrição do que acontece ao falhar. */
  naFalha: string;
}

export interface Aviso {
  nivel: 'perigo' | 'atencao' | 'info';
  texto: string;
}

export interface PlanoDeFase {
  rotulo: string;
  tipo: 'refino' | 'grau';
  custoEsperado: number;
  trechos: StrategyRange[];
  grau?: GradeAttemptPlan;
}

export interface Resultado {
  input: CalcInput;
  fases: PlanoDeFase[];
  /** Custo esperado total em zeny (média exata, via cadeia de Markov). */
  custoEsperado: number;
  /** Itens-base esperados destruídos ao longo de toda a campanha. */
  itensQuebrados: number;
  /**
   * Cópias do item-base que a campanha consome, em média: a que você começa
   * segurando mais uma para cada quebra. É o número de itens a ter em mãos.
   *
   * As cópias não estão todas no mesmo refino: a sua está em `refinoAtual`, e
   * cada reposição entra no +0 (ver `refinoReposicao`), pelo preço sem refino —
   * o caminho até o alvo é refeito desde o zero.
   */
  copiasItem: number;
  /**
   * Distribuição do custo — é daqui que sai a margem de segurança.
   * `null` quando o alvo exige tentativas demais para simular com honestidade.
   */
  simulacao: SimulationResult | null;
  /** Tentativas de refino esperadas na campanha inteira (cálculo exato). */
  tentativasEsperadas: number;
  /** Preço justo do item ao final: preço de entrada + custo esperado do caminho. */
  valorJusto: number;
  avisos: Aviso[];
  /** Recursos esperados agregados de toda a campanha, por id de item. */
  recursos: ResourceUsage;
}

const MAX_REFINO_ALVO = 20;

const zeny = (n: number) => `${Math.round(n).toLocaleString('pt-BR')}z`;

/** Percentual em português: vírgula decimal, como todo número da tela. */
const pct = (p: number) => `${(p * 100).toFixed(1).replace('.', ',')}%`;

/**
 * Tentativas de refino que a simulação vence por milissegundo, medida com
 * `npm run perf` no pior caso (alvos baratos, em que o custo por execução pesa
 * mais que o laço interno). O número serve para transformar um orçamento de
 * TEMPO num orçamento de TRABALHO, que é determinístico: o mesmo alvo produz o
 * mesmo número de execuções em qualquer máquina, e o relógio dentro da
 * simulação fica só como rede de segurança para máquinas mais lentas.
 */
export const TENTATIVAS_POR_MS = 40_000;

/** Tempo de simulação usado quando quem chama não pede outro. */
export const TEMPO_PADRAO_MS = 150;

const MIN_EXECUCOES = 300;

/** Teto de execuções: acima disto os percentis já não melhoram de forma visível. */
const MAX_EXECUCOES = 200_000;

export interface CalcOptions {
  /**
   * Quanto tempo a simulação pode gastar. Vira um orçamento de tentativas — é
   * ele que decide quantas execuções cabem e se o alvo é simulável.
   */
  tempoMs?: number;
  /** Teto de execuções, independente do tempo. */
  execucoes?: number;
}

/** Orçamento de trabalho (tentativas de refino) para um dado tempo. */
export function orcamentoDe(tempoMs: number): number {
  return Math.max(1, Math.round(tempoMs * TENTATIVAS_POR_MS));
}

/**
 * Acima disto, nem tentamos simular.
 *
 * O +20 de uma arma nível 4 exige da ordem de 10^8 tentativas de refino: uma
 * única execução da simulação já seria inviável, e truncá-la produziria
 * percentis silenciosamente subestimados. Nesses casos só o cálculo exato é
 * honesto — e o que ele diz, na prática, é que o alvo é inalcançável.
 *
 * O limite é DERIVADO do orçamento, e não escolhido à parte: como toda simulação
 * roda pelo menos MIN_EXECUCOES vezes, um teto independente deixaria o pior caso
 * estourar o orçamento em silêncio.
 */
function limiteSimulavel(orcamento: number): number {
  return orcamento / MIN_EXECUCOES;
}

export function calcular(input: CalcInput, opcoes: CalcOptions = {}): Resultado {
  validar(input);

  const tempoMs = opcoes.tempoMs ?? TEMPO_PADRAO_MS;
  const orcamento = orcamentoDe(tempoMs);
  const tetoExecucoes = Math.min(opcoes.execucoes ?? MAX_EXECUCOES, MAX_EXECUCOES);

  const opts: RefineOptions = {
    kind: input.kind,
    precos: input.precos,
    evento: input.evento,
    usarBencaoFerreiro: input.usarBencaoFerreiro,
    usarMineriosEspeciais: input.usarMineriosEspeciais,
    perdaAceitavel: input.perdaAceitavel,
    precoItem: input.precoItem,
    // `precoItem` é o preço do item SEM refino, e a reposição sempre vem no +0.
    // Modelar a reposição no refino atual criaria um atalho falso: quebrar sairia
    // barato e ainda devolveria o item adiantado, e o otimizador aprenderia a
    // quebrar de propósito.
    refinoReposicao: 0,
  };

  const fases: Fase[] = [];
  const planos: PlanoDeFase[] = [];

  const subindoGrau = GRADE_ORDER.indexOf(input.grauAlvo) > GRADE_ORDER.indexOf(input.grauAtual);

  if (subindoGrau) {
    const campanha = solveGradeCampaign(input.grauAtual, input.grauAlvo, input.refinoAtual, opts);

    let refinoDe = input.refinoAtual;
    for (const degrau of campanha.degraus) {
      const rotuloPreparo = `Refinar +${refinoDe} → +${degrau.refino} (para o grau ${degrau.step.para})`;
      fases.push({
        tipo: 'refino',
        rotulo: rotuloPreparo,
        de: refinoDe,
        para: degrau.refino,
        politica: degrau.refinoPreparo.politica,
        tentativas: degrau.refinoPreparo.recursos.tentativas,
        recursos: degrau.refinoPreparo.recursos,
      });
      planos.push({
        rotulo: rotuloPreparo,
        tipo: 'refino',
        custoEsperado: degrau.custoPreparo,
        trechos: agruparTrechos(degrau.refinoPreparo.politica, refinoDe, degrau.refino),
      });

      const rotuloGrau = `Grau ${degrau.step.de === 'none' ? 'sem grau' : degrau.step.de} → ${degrau.step.para}`;
      fases.push({ tipo: 'grau', rotulo: rotuloGrau, plano: degrau });
      planos.push({
        rotulo: rotuloGrau,
        tipo: 'grau',
        custoEsperado: degrau.custoTentativas,
        trechos: [],
        grau: degrau,
      });

      refinoDe = 0; // o sucesso zera o refino
    }

    if (input.refinoAlvo > 0) {
      const finalPlan = solveRefine(0, input.refinoAlvo, opts);
      const rotulo = `Refinar +0 → +${input.refinoAlvo} (refino final)`;
      fases.push({
        tipo: 'refino',
        rotulo,
        de: 0,
        para: input.refinoAlvo,
        politica: finalPlan.politica,
        tentativas: finalPlan.recursos.tentativas,
        recursos: finalPlan.recursos,
      });
      planos.push({
        rotulo,
        tipo: 'refino',
        custoEsperado: finalPlan.custoEsperado,
        trechos: agruparTrechos(finalPlan.politica, 0, input.refinoAlvo),
      });
    }
  } else if (input.refinoAlvo > input.refinoAtual) {
    const plan = solveRefine(input.refinoAtual, input.refinoAlvo, opts);
    const rotulo = `Refinar +${input.refinoAtual} → +${input.refinoAlvo}`;
    fases.push({
      tipo: 'refino',
      rotulo,
      de: input.refinoAtual,
      para: input.refinoAlvo,
      politica: plan.politica,
      tentativas: plan.recursos.tentativas,
      recursos: plan.recursos,
    });
    planos.push({
      rotulo,
      tipo: 'refino',
      custoEsperado: plan.custoEsperado,
      trechos: agruparTrechos(plan.politica, input.refinoAtual, input.refinoAlvo),
    });
  }

  const custoEsperado = planos.reduce((s, f) => s + f.custoEsperado, 0);

  // Os números de recurso vêm sempre do cálculo exato, nunca da amostragem:
  // são mais precisos e continuam disponíveis quando a simulação é inviável.
  const recursos = agregarRecursos(fases, custoEsperado);

  // Uma execução da simulação custa `porExecucao` tentativas. Se isso já for
  // proibitivo, não simulamos: percentis truncados enganariam mais que ajudam.
  const porExecucao = Math.max(1, recursos.tentativas);
  const simulacao =
    porExecucao > limiteSimulavel(orcamento)
      ? null
      : simulateCampaign(fases, opts, {
          execucoes: Math.max(
            MIN_EXECUCOES,
            Math.min(tetoExecucoes, Math.floor(orcamento / porExecucao)),
          ),
          // O relógio é o teto duro: numa máquina mais lenta que a da
          // calibragem ele encurta a amostragem em vez de estourar o tempo.
          tempoMs,
          // Uma execução azarada pode passar longe da média, mas 20x a campanha
          // esperada é cauda o bastante para o corte não falsear o resultado.
          maxTentativas: Math.max(200_000, Math.ceil(porExecucao * 20)),
        });

  return {
    input,
    fases: planos,
    custoEsperado,
    itensQuebrados: recursos.itensQuebrados,
    copiasItem: 1 + recursos.itensQuebrados,
    simulacao,
    tentativasEsperadas: recursos.tentativas,
    valorJusto: input.precoItem + custoEsperado,
    // Sem aceitar a perda, o aviso põe preço na garantia — e para isso precisa
    // do mesmo alvo resolvido com o risco liberado.
    avisos: gerarAvisos(input, planos, simulacao, recursos, custoAceitandoPerda(input)),
    recursos,
  };
}

/**
 * Custo do mesmo alvo quando o otimizador pode arriscar o equipamento.
 *
 * Existe só para o aviso que compara os dois mundos, então roda sem orçamento
 * de simulação: o que interessa é a média exata. Devolve `null` quando não há
 * nada a comparar — ou porque a perda já era aceitável, ou porque nem o plano
 * com risco existe.
 */
function custoAceitandoPerda(input: CalcInput): number | null {
  if (input.perdaAceitavel) return null;
  try {
    return calcular({ ...input, perdaAceitavel: true }, { tempoMs: 0 }).custoEsperado;
  } catch {
    return null;
  }
}

/**
 * Soma os recursos esperados de todas as fases, a partir dos números exatos.
 *
 * Nas fases de grau, cada tentativa consome o material do degrau; se o processo
 * for o normal, cada falha ainda obriga a comprar outro item e refiná-lo até lá
 * de novo, então o preparo entra multiplicado pelo número de falhas.
 */
function agregarRecursos(fases: Fase[], zeny: number): ResourceUsage {
  const itens: Record<number, number> = {};
  let itensQuebrados = 0;
  let tentativas = 0;
  let taxas = 0;

  const somar = (itemId: number, qtd: number) => {
    itens[itemId] = (itens[itemId] ?? 0) + qtd;
  };

  for (const fase of fases) {
    if (fase.tipo === 'refino') {
      const r = fase.recursos;
      tentativas += r.tentativas;
      taxas += r.taxas;
      itensQuebrados += r.itensQuebrados;
      for (const [id, qtd] of Object.entries(r.itens)) somar(Number(id), qtd);
      continue;
    }

    const p = fase.plano;
    const modo = p.seguro ? p.step.seguro : p.step.normal;
    somar(modo.material.itemId, modo.material.qtd * p.tentativasEsperadas);
    if (p.qtdBencaos > 0) somar(ETHER_BLESSING_ITEM_ID, p.qtdBencaos * p.tentativasEsperadas);

    if (!p.seguro) {
      const falhas = p.tentativasEsperadas - 1;
      itensQuebrados += falhas;
      const rep = p.refinoReposicao!.recursos;
      tentativas += falhas * rep.tentativas;
      taxas += falhas * rep.taxas;
      itensQuebrados += falhas * rep.itensQuebrados;
      for (const [id, qtd] of Object.entries(rep.itens)) somar(Number(id), qtd * falhas);
    }
  }

  return { zeny, itens, itensQuebrados, tentativas, taxas };
}

function validar(input: CalcInput) {
  const max = maxRefine(input.kind);
  if (input.refinoAtual < 0 || input.refinoAtual > max) {
    throw new RefineImpossivel(`Refino atual fora da faixa válida (0 a +${max}).`);
  }
  if (input.refinoAlvo < 0 || input.refinoAlvo > Math.min(max, MAX_REFINO_ALVO)) {
    throw new RefineImpossivel(`Refino alvo fora da faixa válida (0 a +${max}).`);
  }
  const subindoGrau = GRADE_ORDER.indexOf(input.grauAlvo) > GRADE_ORDER.indexOf(input.grauAtual);
  if (subindoGrau && !suportaGrau(input.kind)) {
    throw new GrauImpossivel('Só Armas nível 5 e Armaduras nível 2 têm sistema de Grau.');
  }
  if (GRADE_ORDER.indexOf(input.grauAlvo) < GRADE_ORDER.indexOf(input.grauAtual)) {
    throw new GrauImpossivel('Não é possível baixar o grau de um item.');
  }
  if (!subindoGrau && input.refinoAlvo < input.refinoAtual) {
    throw new RefineImpossivel('O refino alvo é menor que o refino atual.');
  }
}

/** Junta níveis consecutivos que usam a mesma ação num único trecho legível. */
function agruparTrechos(politica: PolicyEntry[], de: number, para: number): StrategyRange[] {
  const trechos: StrategyRange[] = [];
  // A política é indexada pelo refino em `de`, não pela posição: sem aceitar a
  // perda do item ela começa no piso, e não no +0.
  const porNivel = new Map(politica.map((p) => [p.de, p.acao]));

  for (let r = de; r < para; r++) {
    const a = porNivel.get(r)!;
    const naFalha = descreverFalha(a.ore.penalidade, a.bencaos > 0);
    const ultimo = trechos[trechos.length - 1];
    const mesmaAcao =
      ultimo &&
      ultimo.minerioItemId === a.ore.itemId &&
      ultimo.bencaos === a.bencaos &&
      ultimo.chance === a.chance;

    if (mesmaAcao) {
      ultimo.para = r + 1;
      continue;
    }

    trechos.push({
      de: r,
      para: r + 1,
      minerio: a.ore.nome,
      minerioItemId: a.ore.itemId,
      bencaos: a.bencaos,
      chance: a.chance,
      arriscaQuebrar: a.falhaVaiPara === null && a.chance < 1,
      naFalha,
    });
  }

  return trechos;
}

function descreverFalha(penalidade: FailureMode, comBencao: boolean): string {
  if (comBencao) return 'a Bênção segura o item e o refino';
  switch (penalidade) {
    case 'break':
      return 'o item é destruído';
    case 'down1':
      return 'o item sobrevive e perde 1 refino';
    case 'down3':
      return 'o item sobrevive e perde até 3 refinos';
  }
}

function gerarAvisos(
  input: CalcInput,
  fases: PlanoDeFase[],
  sim: SimulationResult | null,
  recursos: ResourceUsage,
  custoAceitandoPerda: number | null,
): Aviso[] {
  const avisos: Aviso[] = [];
  const limite = safeLimit(input.kind);

  if (!input.perdaAceitavel) {
    const custo = fases.reduce((s, f) => s + f.custoEsperado, 0);
    // A comparação é a parte útil: proteger um item insubstituível é caro, e o
    // quanto varia demais entre alvos para caber numa regra de bolso.
    const comparacao =
      custoAceitandoPerda !== null && custoAceitandoPerda > 0 && custo > custoAceitandoPerda * 1.001
        ? ` Aceitando o risco, o mesmo alvo sairia por ${zeny(custoAceitandoPerda)} — a garantia custa ${zeny(custo - custoAceitandoPerda)} a mais (+${(((custo - custoAceitandoPerda) / custoAceitandoPerda) * 100).toFixed(0)}%).`
        : ' Aqui ela não custa nada: mesmo aceitando o risco, o plano mais barato já não arriscava o item.';
    avisos.push({
      nivel: 'info',
      texto:
        `Nenhuma tentativa deste plano pode destruir o equipamento — é o que a opção "posso perder ` +
        `o item" desmarcada exige, e por isso o preço do item não entra no custo.${comparacao}`,
    });
  }

  const trechosArriscados = fases.flatMap((f) => f.trechos).filter((t) => t.arriscaQuebrar);
  if (trechosArriscados.length > 0) {
    const faixas = trechosArriscados.map((t) => `+${t.de}→+${t.para}`).join(', ');
    avisos.push({
      nivel: 'perigo',
      texto: `Risco de quebra do item nas tentativas ${faixas}. Uma falha aí destrói o equipamento.`,
    });
  }

  const grausNormais = fases.filter((f) => f.grau && !f.grau.seguro);
  if (grausNormais.length > 0) {
    const quais = grausNormais.map((f) => f.rotulo).join(', ');
    avisos.push({
      nivel: 'perigo',
      texto: `O processo de grau escolhido é o normal (não seguro) em: ${quais}. Uma falha destrói o item com todo o refino investido — saiu mais barato na média, mas é a aposta mais volátil do plano.`,
    });
  }

  if (sim) {
    const semQuebra = sim.chanceSemQuebra;
    if (semQuebra < 0.999) {
      avisos.push({
        nivel: semQuebra < 0.5 ? 'perigo' : 'atencao',
        texto: `Chance de atravessar a campanha sem destruir nenhum item: ${pct(semQuebra)}. Em ${pct(1 - semQuebra)} das vezes você vai precisar recomprar o equipamento pelo menos uma vez.`,
      });
    }
  }

  const tentativas = Math.round(recursos.tentativas);
  if (!sim) {
    avisos.push({
      nivel: 'perigo',
      texto: `Este alvo exige cerca de ${tentativas.toLocaleString('pt-BR')} tentativas de refino, em média. Na prática isso quer dizer que ele é inalcançável: acima do +14 a Bênção do Ferreiro para de funcionar e cada falha derruba 3 refinos, então o custo cresce de forma explosiva. O custo médio abaixo é exato, mas não há margem de segurança a calcular — considere parar em um refino mais baixo.`,
    });
  } else if (sim.truncadas > 0) {
    avisos.push({
      nivel: 'atencao',
      texto: `${sim.truncadas.toLocaleString('pt-BR')} de ${sim.execucoes.toLocaleString('pt-BR')} campanhas simuladas bateram no teto de tentativas e foram cortadas no meio. O custo médio continua exato, mas os percentis altos saem subestimados.`,
    });
  } else if (sim.execucoes < 2_000) {
    avisos.push({
      nivel: 'atencao',
      texto: `Este alvo exige cerca de ${tentativas.toLocaleString('pt-BR')} tentativas de refino por campanha, então a simulação rodou só ${sim.execucoes.toLocaleString('pt-BR')} vezes para não travar a página. O custo médio continua exato; os percentis são mais grosseiros, principalmente o de 99%.`,
    });
  }

  if (input.refinoAlvo > limite) {
    avisos.push({
      nivel: 'info',
      texto: `O limite seguro (100% de sucesso) desta categoria é +${limite}. Daí para cima toda tentativa pode falhar.`,
    });
  }

  const usaBradiumOuCarnium = fases
    .flatMap((f) => f.trechos)
    .some((t) => (t.minerioItemId === 6224 || t.minerioItemId === 6223) && t.bencaos === 0);
  if (usaBradiumOuCarnium) {
    avisos.push({
      nivel: 'atencao',
      texto:
        'O plano usa Bradium ou Carnium sem Bênção. O Browiki diz que a falha só derruba 3 refinos, mas o Hazy Forest registra também uma chance RARA de destruir o item. Como nenhuma das duas fontes dá esse número, ele não entra na conta — o custo real pode ser um pouco maior.',
    });
  }

  // O piso do +9 vem das tabelas, contra o texto do Browiki que exige +11 (ver
  // REFINO_MINIMO_GRAU). Enquanto isso não for confirmado in-game, o plano só
  // avisa quando de fato depende da divergência.
  const grausAbaixoDe11 = fases.filter((f) => f.grau && f.grau.refino < 11);
  if (grausAbaixoDe11.length > 0) {
    const quais = grausAbaixoDe11.map((f) => `${f.rotulo} no +${f.grau!.refino}`).join(', ');
    avisos.push({
      nivel: 'atencao',
      texto: `O plano tenta o grau abaixo do +11 (${quais}). As tabelas do Browiki e do Hazy Forest listam chance a partir do +9, mas o texto do Browiki diz que o NPC exige +11. Se ele recusar o item, suba até o +11 antes de tentar.`,
    });
  }

  if (input.usarBencaoFerreiro && input.refinoAlvo > 14) {
    avisos.push({
      nivel: 'atencao',
      texto: 'A Bênção do Ferreiro só funciona até a tentativa +13→+14. Acima disso não há rede de proteção.',
    });
  }

  if (ehSombrio(input.kind)) {
    avisos.push({
      nivel: 'info',
      texto: 'Equipamentos Sombrios vão só até o +10 e não aceitam Bênção do Ferreiro nem Pergaminhos de Refino.',
    });
  }

  if (!input.usarMineriosEspeciais) {
    avisos.push({
      nivel: 'info',
      texto: 'Minérios especiais (Enriquecido / Perfeito) estão desativados. Em refinos altos eles costumam sair mais baratos apesar do preço maior, porque evitam a quebra.',
    });
  }

  const bencaoSemPreco = fases
    .flatMap((f) => f.trechos)
    .some((t) => t.bencaos > 0 && !((input.precos[BLESSING_ITEM_ID] ?? 0) > 0));
  if (bencaoSemPreco) {
    avisos.push({
      nivel: 'info',
      texto: 'A Bênção do Ferreiro está sendo cotada pela receita do NPC, não por preço de mercado. Informe o preço real para um número mais fiel.',
    });
  }

  // Faixas em que a Bênção existe mas o plano ótimo não a usa: vale explicar.
  const naoUsouBencao = fases
    .flatMap((f) => f.trechos)
    .filter((t) => t.bencaos === 0 && t.arriscaQuebrar && blessingCost(input.kind, t.de) !== null);
  if (input.usarBencaoFerreiro && naoUsouBencao.length > 0) {
    const faixas = naoUsouBencao.map((t) => `+${t.de}→+${t.para}`).join(', ');
    avisos.push({
      nivel: 'info',
      texto: `Em ${faixas} a Bênção do Ferreiro é aceita mas não compensa: no preço informado, sai mais barato aceitar o risco de quebra. Se você não quer arriscar o item, use assim mesmo.`,
    });
  }

  return avisos;
}

export { RefineImpossivel, GrauImpossivel };
export type { ItemKind, Grade };
