// O kit: tudo o que se separa ANTES de começar, para não voltar ao mercado.
//
// A página responde "quanto custa" de dois jeitos, porque há dois jeitos de
// jogar. Quem compra aos poucos volta ao mercado quando o minério acaba e só
// paga o que usou — a resposta é o percentil do custo total, e nele a sorte de
// um material compensa o azar de outro. Quem junta tudo antes leva uma mochila
// fechada ao refinador, e ela tem de cobrir o azar de TODOS os materiais na
// mesma campanha. Esse é o kit.
//
// O kit é a única fonte de quantidades da página: a lista de compras, o
// diagrama de custo e o simulador de estoque leem dele. Antes cada vista lia
// uma estatística diferente (média, percentil de cada linha, quantil conjunto
// dos materiais desmontados) e mostrava três números para o mesmo minério, os
// três rotulados "90%".

import {
  chanceDoEstoque,
  emMateriais,
  estoqueRecomendado,
  type CampanhaEmMateriais,
  type Estoque,
} from './estoque';
import { listaDeCompras } from './pricing';
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
 * O menor kit que fecha a fração `chance` das campanhas.
 *
 * É o mesmo quantil comum do simulador de estoque (`estoqueRecomendado`), só
 * que contado em minério inteiro. Sem simulação, sobra a média — que não fecha
 * fração nenhuma garantida, e por isso `chance` volta `null`.
 */
export function montarKit(
  plano: ResultadoPlano,
  campanha: CampanhaEmMateriais | null,
  chance: number,
): Kit {
  const { precos, precoItem } = plano.input;

  if (!campanha) {
    const itens = Object.fromEntries(
      Object.entries(plano.recursos.itens)
        .filter(([, media]) => media > 0)
        .map(([id, media]) => [Number(id), Math.ceil(media)]),
    );
    const reposicoes = Math.ceil(plano.recursos.itensQuebrados);
    const taxas = Math.ceil(plano.recursos.taxas);
    return { itens, reposicoes, taxas, chance: null, ...valorEm(itens, reposicoes, taxas, precos, precoItem) };
  }

  const e = estoqueRecomendado(campanha, chance);
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
