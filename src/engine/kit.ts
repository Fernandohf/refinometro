// O kit: tudo o que se separa ANTES de começar, para não voltar ao mercado.
//
// A página responde "quanto custa" em duas moedas. O custo total em zeny é o
// percentil do custo da campanha, com tudo convertido — e nele a sorte de um
// material compensa o azar de outro. O que ter em mãos é uma mochila fechada,
// levada ao refinador sem voltar ao mercado: zeny para as taxas e o material
// contado, cobrindo o azar de TODOS os materiais na mesma campanha. Esse é o kit.
//
// O kit é a única fonte de quantidades da página: a lista de compras, o
// diagrama de custo e o simulador de estoque leem dele. Antes cada vista lia
// uma estatística diferente (média, percentil de cada linha, quantil conjunto
// dos materiais desmontados) e mostrava três números para o mesmo minério, os
// três rotulados "90%".

import type { MaterialCost } from '../data/ores';
import {
  chanceDoEstoque,
  emMateriais,
  estoquesMaisBaratos,
  estoqueRecomendado,
  type CampanhaEmMateriais,
  type Estoque,
  type ZenyPorTipo,
} from './estoque';
import { listaDeCompras, receitaDe, viaDe, type MotivoDaVia } from './pricing';
import type { Resultado as ResultadoPlano } from './plan';
import type { PriceTable } from './types';

export interface Kit {
  /**
   * O que se compra, por id: o minério que se acha pronto e, do que vale mais
   * a pena fabricar, os insumos da receita — Pedra de Éter e Âmbar, não Âmbar
   * de Éter. Insumo é moeda comum entre receitas: a Pedra de Éter que sobrou
   * do Topázio de Éter serve ao Âmbar de Éter, e o kit conta com isso.
   */
  itens: Record<number, number>;
  /** Cópias de reposição, no +0 — sem contar a que já está no refino. */
  reposicoes: number;
  /**
   * Zeny que não vira material: a taxa do refinador e a de cada tentativa de
   * Grau, e o balcão do NPC que fabrica o que o kit leva desmontado.
   */
  taxas: number;
  /** As mesmas `taxas`, por NPC. As três parcelas somam `taxas` exatamente. */
  zenyPorTipo: ZenyPorTipo;
  /**
   * Fração das campanhas simuladas que fecham sem voltar ao mercado. `null`
   * quando não houve simulação e o kit é só a média.
   */
  chance: number | null;
  /** Tudo em zeny: materiais, reposições e taxas. */
  valor: number;
}

/**
 * O consumo simulado, contado em minério inteiro: Eteridecon, não Minério de
 * Oridecon. É a unidade que o jogador lembra do que passou no refinador, e a
 * de "Já refinei" (`sorte.ts`).
 */
export function campanhaEmMinerios(plano: ResultadoPlano): CampanhaEmMateriais | null {
  const sim = plano.simulacao;
  if (!sim) return null;
  return emMateriais(sim.amostras, plano.input.precos, plano.input.precoItem, { desmontar: false });
}

/**
 * O consumo simulado no que se compra: o que vale mais a pena fabricar entra
 * pelos insumos, e o balcão de fabricar vai para o zeny. É a matéria-prima do
 * kit e a mesma moeda do simulador de estoque.
 *
 * Antes o kit contava o minério fabricado inteiro, e cada um levava a própria
 * folga: Topázios de Éter para o azar do Grau C e Âmbares de Éter para o do
 * Grau A, cada pilha cobrindo o seu pior caso. Desmontados, os dois puxam a
 * mesma Pedra de Éter, e uma folga só cobre os dois azares — que raramente
 * acontecem juntos.
 */
export function campanhaDoKit(plano: ResultadoPlano): CampanhaEmMateriais | null {
  const sim = plano.simulacao;
  if (!sim) return null;
  return emMateriais(sim.amostras, plano.input.precos, plano.input.precoItem);
}

/**
 * Os kits mais baratos que fecham cada fração de `chances` das campanhas.
 *
 * `campanha` é a do kit (`campanhaDoKit`), no que se compra.
 *
 * Dois candidatos por nível: o quantil comum do simulador de estoque
 * (`estoqueRecomendado`), que sobe todos os recursos no mesmo passo, e o
 * descasque por preço (`estoquesMaisBaratos`), que põe a folga onde ela é
 * barata. Os dois fecham a fração pedida, e fica o mais barato — o descasque é
 * guloso e não garante o ótimo, e assim o kit nunca piora por causa dele.
 *
 * Cada kit ainda leva o máximo dos níveis abaixo dele: escolher candidatos
 * diferentes em níveis vizinhos poderia fazer o "Muito seguro" pedir menos de
 * um minério que o "Seguro". Só soma recurso, então a chance não cai. Sem
 * simulação, sobra a média — que não fecha fração nenhuma garantida, e por
 * isso `chance` volta `null`.
 */
export function montarKits(
  plano: ResultadoPlano,
  campanha: CampanhaEmMateriais | null,
  chances: number[],
): Kit[] {
  const { precos, precoItem } = plano.input;

  if (!campanha) {
    const lista = listaDeCompras(plano.recursos.itens, precos);
    const itens = Object.fromEntries(
      lista.compras.filter((l) => l.qtd > 0).map((l) => [l.itemId, Math.ceil(l.qtd)]),
    );
    const reposicoes = Math.ceil(plano.recursos.itensQuebrados);
    const medias: ZenyPorTipo = {
      refino: plano.recursos.taxas,
      grau: taxaDeGrauMedia(plano),
      balcao: lista.zenyNpc,
    };
    const taxas = Math.ceil(medias.refino + medias.grau + medias.balcao);
    const media: Kit = {
      itens,
      reposicoes,
      taxas,
      zenyPorTipo: dividirZeny(taxas, medias),
      chance: null,
      ...valorEm(itens, reposicoes, taxas, precos, precoItem),
    };
    return chances.map(() => media);
  }

  const kitDe = (e: Estoque): Kit => {
    const itens = Object.fromEntries(Object.entries(e.itens).filter(([, q]) => q > 0)) as Record<
      number,
      number
    >;
    const reposicoes = e.copias - 1;
    return {
      itens,
      reposicoes,
      taxas: e.zeny,
      zenyPorTipo: dividirZeny(e.zeny, campanha.zenyPorTipo),
      chance: chanceDoEstoque(campanha, e),
      ...valorEm(itens, reposicoes, e.zeny, precos, precoItem),
    };
  };

  const baratos = estoquesMaisBaratos(campanha, chances);
  const escolhidos = chances.map((chance, j) => {
    const comum = estoqueRecomendado(campanha, chance);
    return kitDe(baratos[j]!).valor < kitDe(comum).valor ? baratos[j]! : comum;
  });

  const saida: Kit[] = new Array(chances.length);
  let abaixo: Estoque | null = null;
  for (const j of chances.map((_, j) => j).sort((a, b) => chances[a]! - chances[b]!)) {
    const e: Estoque = abaixo ? maximo(escolhidos[j]!, abaixo) : escolhidos[j]!;
    saida[j] = kitDe(e);
    abaixo = e;
  }
  return saida;
}

/** O kit de um nível só. A página pede os cinco de uma vez (`montarKits`). */
export function montarKit(
  plano: ResultadoPlano,
  campanha: CampanhaEmMateriais | null,
  chance: number,
): Kit {
  return montarKits(plano, campanha, [chance])[0]!;
}

/** Um item que a lista manda fabricar no NPC, com a receita aberta. */
export interface Fabricacao {
  itemId: number;
  /** Quantos a campanha fabrica, em média. No kit eles vêm desmontados. */
  media: number;
  /** O balcão do NPC por unidade. */
  zeny: number;
  /** O que o NPC pede por unidade, além do zeny. */
  materiais: MaterialCost[];
  /** Por que fabricar e não comprar pronto (ver `decidir`, em `pricing.ts`). */
  motivo: MotivoDaVia;
  /** Preço de comprar pronto, ou `null` quando ninguém vende. */
  precoMercado: number | null;
  /** Insumos mais balcão, por unidade. */
  custoFabricado: number;
}

/**
 * O que fabricar no NPC, do que mais pesa para o que menos.
 *
 * O kit leva o que vale a pena fabricar desmontado, e por isso não diz mais
 * "40 Âmbares de Éter": diz Pedra de Éter e Âmbar. Esta é a outra metade da
 * informação — o que montar com eles, e quanto o NPC cobra por unidade. A
 * quantidade é a média da campanha, porque o kit não fixa quantos de cada:
 * a sobra de um vira o insumo do outro.
 *
 * Entra também o que se fabrica dentro de outra receita (a Pedra de Éter do
 * Âmbar de Éter) e o que o NPC faz de graça (5 Minério de Oridecon em 1
 * Oridecon): os dois são uma parada no balcão.
 */
export function fabricacoesDoPlano(plano: ResultadoPlano): Fabricacao[] {
  const precos = plano.input.precos;
  return listaDeCompras(plano.recursos.itens, precos)
    .fabricados.map((f) => {
      const receita = receitaDe(f.itemId)!;
      const via = viaDe(f.itemId, precos);
      return {
        itemId: f.itemId,
        media: f.qtd,
        zeny: receita.zeny,
        materiais: receita.materiais,
        motivo: via.motivo,
        precoMercado: Number.isFinite(via.mercado) ? via.mercado : null,
        custoFabricado: via.fabricado,
      };
    })
    .sort((a, b) => b.media * b.custoFabricado - a.media * a.custoFabricado);
}

/** Zeny esperado nas taxas do NPC de Grau, tentativa a tentativa. */
function taxaDeGrauMedia(plano: ResultadoPlano): number {
  let total = 0;
  for (const f of plano.fases) {
    const g = f.grau;
    if (!g) continue;
    total += (g.seguro ? g.step.seguro : g.step.normal).zeny * g.tentativasEsperadas;
  }
  return total;
}

/**
 * Reparte o zeny do kit entre os três NPCs, na proporção média da campanha.
 *
 * O zeny do kit é um quantil da SOMA, e é o certo: zeny é zeny, e o azar no
 * Grau pode ser pago com a folga do refino. Não existe "o percentil 90 da
 * taxa de Grau" que some com os outros dois e dê o mesmo número; a proporção
 * média é o jeito honesto de mostrar de onde ele vem sem mudá-lo. As parcelas
 * são inteiras e somam o total exato — o resto vai para as de maior fração.
 */
export function dividirZeny(total: number, medias: ZenyPorTipo): ZenyPorTipo {
  const chaves = ['refino', 'grau', 'balcao'] as const;
  const soma = medias.refino + medias.grau + medias.balcao;
  if (soma <= 0) return { refino: total, grau: 0, balcao: 0 };
  const bruto = chaves.map((k) => (total * medias[k]) / soma);
  const partes = bruto.map(Math.floor);
  let resto = total - partes.reduce((s, v) => s + v, 0);
  const ordem = [0, 1, 2].sort((a, b) => bruto[b]! - partes[b]! - (bruto[a]! - partes[a]!));
  for (const i of ordem) {
    if (resto <= 0) break;
    partes[i]!++;
    resto--;
  }
  return { refino: partes[0]!, grau: partes[1]!, balcao: partes[2]! };
}

/** Recurso a recurso, o maior dos dois estoques. */
function maximo(a: Estoque, b: Estoque): Estoque {
  const itens = { ...a.itens };
  for (const [id, q] of Object.entries(b.itens)) {
    itens[Number(id)] = Math.max(itens[Number(id)] ?? 0, q);
  }
  return { zeny: Math.max(a.zeny, b.zeny), copias: Math.max(a.copias, b.copias), itens };
}

function valorEm(
  itens: Record<number, number>,
  reposicoes: number,
  taxas: number,
  precos: PriceTable,
  precoItem: number,
): { valor: number } {
  return { valor: listaDeCompras(itens, precos).total + reposicoes * precoItem + taxas };
}

/**
 * O kit na moeda do simulador de estoque — que é a dele mesmo: os dois contam
 * o que se compra, e o zeny paga as taxas e o balcão.
 */
export function estoqueDoKit(kit: Kit): Estoque {
  return { zeny: kit.taxas, copias: kit.reposicoes + 1, itens: { ...kit.itens } };
}

export interface FaltaParaOKit {
  /** Material que falta, do que mais pesa em zeny para o que menos. */
  itens: { itemId: number; qtd: number; valor: number }[];
  /** Cópias do equipamento que faltam, no +0. */
  copias: number;
  /** Zeny de taxa e balcão que falta em caixa. */
  zeny: number;
  /** Tudo em zeny: o material a preço de mercado, as cópias e o caixa. */
  valor: number;
}

/**
 * O que separa o estoque informado do kit: a compra que devolve a chance ao
 * nível escolhido.
 *
 * Com a falta comprada, cada recurso fica igual ou acima do kit, e pela
 * monotonia da chance (matematica.md, Proposição 9.1) ela é pelo menos a do
 * kit. É a pergunta "tenho isto, quanto zeny ainda preciso?" respondida sem
 * supor que se volta ao mercado no meio — que é a hipótese desta aba.
 */
export function faltaParaOKit(
  kit: Estoque,
  tem: Estoque,
  campanha: CampanhaEmMateriais,
): FaltaParaOKit {
  const itens = campanha.materiais
    .map((m) => {
      const qtd = Math.max(0, Math.ceil((kit.itens[m.itemId] ?? 0) - (tem.itens[m.itemId] ?? 0)));
      return { itemId: m.itemId, qtd, valor: qtd * m.preco };
    })
    .filter((l) => l.qtd > 0)
    .sort((a, b) => b.valor - a.valor);
  const copias = Math.max(0, Math.ceil(kit.copias - tem.copias));
  const zeny = Math.max(0, Math.ceil(kit.zeny - tem.zeny));
  const valor = itens.reduce((s, l) => s + l.valor, 0) + copias * campanha.precoItem + zeny;
  return { itens, copias, zeny, valor };
}
