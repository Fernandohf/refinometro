// O kit: tudo o que se separa ANTES de começar, para não voltar ao mercado.
//
// A página responde "quanto custa" em duas moedas. O custo total em zeny é o
// percentil do custo da campanha, com tudo convertido — e nele a sorte de um
// material compensa o azar de outro. O que ter em mãos é uma mochila fechada,
// levada ao refinador sem voltar ao mercado: zeny só para as taxas e o minério
// contado, cobrindo o azar de TODOS os materiais na mesma campanha. Esse é o kit.
//
// O kit é a única fonte de quantidades da página: a lista de compras, o
// diagrama de custo e o simulador de estoque leem dele. Antes cada vista lia
// uma estatística diferente (média, percentil de cada linha, quantil conjunto
// dos materiais desmontados) e mostrava três números para o mesmo minério, os
// três rotulados "90%".

import {
  chanceDoEstoque,
  emMateriais,
  estoquesMaisBaratos,
  estoqueRecomendado,
  type CampanhaEmMateriais,
  type Estoque,
} from './estoque';
import { listaDeCompras, type FabricacaoLinha } from './pricing';
import type { Resultado as ResultadoPlano } from './plan';
import type { PriceTable } from './types';

export interface Kit {
  /**
   * Minério inteiro, por id: Eteridecon, não Minério de Oridecon. É a moeda da
   * lista de compras, que abre a receita embaixo da linha.
   */
  itens: Record<number, number>;
  /** Cópias de reposição, no +0 — sem contar a que já está no refino. */
  reposicoes: number;
  /**
   * Zeny que não vira material: taxa do refinador e de cada tentativa de Grau.
   * O balcão do NPC não entra aqui, ele está no preço do minério fabricado.
   */
  taxas: number;
  /**
   * Fração das campanhas simuladas que fecham sem voltar ao mercado. `null`
   * quando não houve simulação e o kit é só a média.
   */
  chance: number | null;
  /** Tudo em zeny: materiais pela via mais barata, reposições e taxas. */
  valor: number;
}

/** O consumo simulado, contado em minério inteiro — a matéria-prima do kit. */
export function campanhaEmMinerios(plano: ResultadoPlano): CampanhaEmMateriais | null {
  const sim = plano.simulacao;
  if (!sim) return null;
  return emMateriais(sim.amostras, plano.input.precos, plano.input.precoItem, { desmontar: false });
}

/**
 * Os kits mais baratos que fecham cada fração de `chances` das campanhas.
 *
 * Dois candidatos por nível, contados em minério inteiro: o quantil comum do
 * simulador de estoque (`estoqueRecomendado`), que sobe todos os recursos no
 * mesmo passo, e o descasque por preço (`estoquesMaisBaratos`), que põe a folga
 * onde ela é barata. Os dois fecham a fração pedida, e fica o mais barato — o
 * descasque é guloso e não garante o ótimo, e assim o kit nunca piora por
 * causa dele.
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
    const itens = Object.fromEntries(
      Object.entries(plano.recursos.itens)
        .filter(([, media]) => media > 0)
        .map(([id, media]) => [Number(id), Math.ceil(media)]),
    );
    const reposicoes = Math.ceil(plano.recursos.itensQuebrados);
    const taxas = Math.ceil(plano.recursos.taxas);
    const media: Kit = { itens, reposicoes, taxas, chance: null, ...valorEm(itens, reposicoes, taxas, precos, precoItem) };
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

export interface BalcaoDoKit {
  /** Zeny de balcão para fabricar o kit inteiro a partir do que se compra. */
  total: number;
  /** O mesmo total, por receita, da que mais pesa para a que menos. */
  linhas: FabricacaoLinha[];
}

/**
 * O balcão do NPC que o kit cobra de quem o fabrica, em vez de comprá-lo pronto.
 *
 * O "o que ter em mãos" conta o zeny só das taxas porque lista o minério e as
 * gemas já prontos. O simulador de estoque desmonta o mesmo kit até o que se
 * compra, e aí o caixa paga também a fabricação — no Grau A são centenas de
 * Pedras de Éter a 100 mil cada. As duas telas dizem "zeny" para coisas
 * diferentes; é este número que liga uma à outra.
 */
export function balcaoDoKit(kit: Kit, precos: PriceTable): BalcaoDoKit {
  const lista = listaDeCompras(kit.itens, precos);
  return {
    total: lista.zenyNpc,
    linhas: [...lista.fabricacao].sort((a, b) => b.zeny - a.zeny),
  };
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
 * O kit na moeda do simulador de estoque: desmontado até o que se compra.
 *
 * Quem tem os insumos do kit consegue fabricar o kit, e quem tem o kit fecha
 * a fração dele — então este estoque fecha pelo menos a mesma fração. Pode
 * fechar um pouco mais: o balcão e os insumos sobem juntos com o minério, e a
 * conta não os aperta um contra o outro. É o preço de os dois painéis falarem
 * das mesmas quantidades.
 */
export function estoqueDoKit(kit: Kit, precos: PriceTable): Estoque {
  const lista = listaDeCompras(kit.itens, precos);
  return {
    zeny: Math.ceil(kit.taxas + lista.zenyNpc),
    copias: kit.reposicoes + 1,
    itens: Object.fromEntries(lista.compras.map((l) => [l.itemId, Math.ceil(l.qtd)])),
  };
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
 * O que separa o estoque informado do kit desmontado: a compra que devolve a
 * chance ao nível escolhido.
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
