import { ORES, type MaterialCost, type Ore } from '../data/ores';
import { GRADE_RECIPES } from '../data/grade';
import type { PriceTable } from './types';

/**
 * Receitas conhecidas (NPC) para fabricar um item a partir de outros.
 * Junta as receitas de minérios de refino com as dos materiais de Grau.
 */
const RECIPES = new Map<number, { zeny: number; materiais: MaterialCost[] }>();
for (const ore of ORES) {
  if (ore.npc) RECIPES.set(ore.itemId, { zeny: ore.npc.zeny, materiais: ore.npc.materiais });
}
for (const [itemId, r] of Object.entries(GRADE_RECIPES)) {
  RECIPES.set(Number(itemId), { zeny: r.zeny, materiais: r.materiais });
}

/**
 * Custo unitário em zeny de um item, considerando as duas formas de obtê-lo:
 * comprar de outro jogador (preço informado) ou fabricar no NPC a partir dos
 * materiais. Devolve o menor dos dois.
 *
 * Retorna `Infinity` quando não há preço informado nem receita — aí o item é
 * inalcançável e o motor descarta as estratégias que dependem dele.
 */
export function unitCost(itemId: number, precos: PriceTable, memo = new Map<number, number>()): number {
  const cached = memo.get(itemId);
  if (cached !== undefined) return cached;

  // Marca como em-progresso para não entrar em laço numa receita cíclica.
  memo.set(itemId, Infinity);

  const mercado = precos[itemId];
  let melhor = mercado && mercado > 0 ? mercado : Infinity;

  const receita = RECIPES.get(itemId);
  if (receita) {
    let craft = receita.zeny;
    for (const mat of receita.materiais) {
      const c = unitCost(mat.itemId, precos, memo);
      if (!Number.isFinite(c)) {
        craft = Infinity;
        break;
      }
      craft += c * mat.qtd;
    }
    if (craft < melhor) melhor = craft;
  }

  memo.set(itemId, melhor);
  return melhor;
}

/** Como o jogador deve obter um item: comprando pronto ou fabricando no NPC. */
export type Sourcing = 'mercado' | 'npc' | 'indisponivel';

export function sourcingOf(
  itemId: number,
  precos: PriceTable,
  memo = new Map<number, number>(),
): Sourcing {
  const mercado = precos[itemId];
  const precoMercado = mercado && mercado > 0 ? mercado : Infinity;

  const receita = RECIPES.get(itemId);
  let craft = Infinity;
  if (receita) {
    craft = receita.zeny;
    for (const mat of receita.materiais) {
      const c = unitCost(mat.itemId, precos, memo);
      if (!Number.isFinite(c)) {
        craft = Infinity;
        break;
      }
      craft += c * mat.qtd;
    }
  }

  if (!Number.isFinite(precoMercado) && !Number.isFinite(craft)) return 'indisponivel';
  return craft < precoMercado ? 'npc' : 'mercado';
}

/** Uma linha da lista de compras: o que comprar, quanto, e por quanto. */
export interface CompraLinha {
  itemId: number;
  qtd: number;
  /** Preço unitário de mercado usado na conta. */
  custoUnitario: number;
  /** Quanto esta linha pesa no total. */
  total: number;
}

/** O que o balcão do NPC cobrou para preparar um minério intermediário. */
export interface FabricacaoLinha {
  /** O minério que SAI da receita (Bradium, Eteridecon...), não os insumos. */
  itemId: number;
  /** Quantas unidades foram fabricadas. */
  qtd: number;
  /** Zeny de balcão desta receita, já multiplicado pela quantidade. */
  zeny: number;
}

/** A receita de NPC de um item, quando existe uma. */
export function receitaDe(itemId: number): { zeny: number; materiais: MaterialCost[] } | null {
  return RECIPES.get(itemId) ?? null;
}

export interface ListaDeCompras {
  /** Só o que se compra de fato — os intermediários já vêm desmontados. */
  compras: CompraLinha[];
  /** Zeny pago no balcão do NPC para fabricar os intermediários. */
  zenyNpc: number;
  /**
   * O mesmo `zenyNpc`, aberto por minério fabricado. Só entram as receitas que
   * cobram balcão: transformar 5 Minério de Oridecon em 1 Oridecon é de graça,
   * e uma linha de 0z só ocuparia espaço.
   */
  fabricacao: FabricacaoLinha[];
  /** Compras + balcão do NPC. Não inclui taxa de refino nem itens quebrados. */
  total: number;
}

/**
 * Desmonta uma conta de materiais na lista do que o jogador realmente compra.
 *
 * O motor raciocina em minérios prontos ("380 Eterium"), mas ninguém compra
 * Eterium: fabrica no NPC a partir de Elunium e Pó de Éter. Como o custo já é
 * cotado pela via mais barata (ver `unitCost`), a lista de compras precisa
 * seguir exatamente a mesma decisão — senão o total mostrado não fecharia com
 * o orçamento.
 */
export function listaDeCompras(
  itens: Record<number, number>,
  precos: PriceTable,
): ListaDeCompras {
  const memo = new Map<number, number>();
  const compras = new Map<number, number>();
  const fabricados = new Map<number, { qtd: number; zeny: number }>();
  let zenyNpc = 0;

  const expandir = (itemId: number, qtd: number, profundidade: number) => {
    if (qtd <= 0) return;
    const receita = RECIPES.get(itemId);
    // Sem receita, ou com o mercado mais barato: acabou de descer, é compra.
    // A profundidade é só uma trava contra receita cíclica em dados novos.
    if (!receita || profundidade > 8 || sourcingOf(itemId, precos, memo) !== 'npc') {
      compras.set(itemId, (compras.get(itemId) ?? 0) + qtd);
      return;
    }
    zenyNpc += receita.zeny * qtd;
    const acc = fabricados.get(itemId) ?? { qtd: 0, zeny: 0 };
    acc.qtd += qtd;
    acc.zeny += receita.zeny * qtd;
    fabricados.set(itemId, acc);
    for (const mat of receita.materiais) expandir(mat.itemId, mat.qtd * qtd, profundidade + 1);
  };

  for (const [id, qtd] of Object.entries(itens)) expandir(Number(id), qtd, 0);

  const linhas: CompraLinha[] = [...compras]
    .map(([itemId, qtd]) => {
      const custoUnitario = precos[itemId] ?? 0;
      return { itemId, qtd, custoUnitario, total: custoUnitario * qtd };
    })
    .sort((a, b) => b.total - a.total || b.qtd - a.qtd);

  // Só o balcão pago vira linha de custo. Transformar 5 Minério de Oridecon em
  // 1 Oridecon é de graça, e uma linha de 0z no diagrama só ocuparia espaço.
  const fabricacao: FabricacaoLinha[] = [...fabricados]
    .filter(([, a]) => a.zeny > 0)
    .map(([itemId, a]) => ({ itemId, qtd: a.qtd, zeny: a.zeny }))
    .sort((a, b) => b.zeny - a.zeny);

  const total = linhas.reduce((s, l) => s + l.total, 0) + zenyNpc;
  return { compras: linhas, zenyNpc, fabricacao, total };
}

/**
 * Uma linha da lista de compras com a escolha ainda aberta: comprar pronto ou
 * fabricar no NPC, e quanto separa uma da outra.
 *
 * `listaDeCompras` decide sozinha e entrega o resultado já desmontado — é o que
 * o orçamento precisa, porque o custo do plano é cotado pela via mais barata.
 * Mas quem vai ao jogo não paga só zeny: fabricar 1 Oridecon é juntar 5 minérios
 * de peso alto, e o desconto que o motor viu pode não pagar a viagem a mais.
 * Esta árvore mantém os DOIS números por linha para a pessoa poder discordar da
 * conta com conhecimento de causa.
 */
export interface ItemDaLista {
  itemId: number;
  /** Quantas unidades desta linha — já multiplicadas pela receita, se for insumo. */
  qtd: number;
  /** A via mais barata pelos preços informados. É a que o custo do plano usou. */
  via: Sourcing;
  /** Custo unitário pela via escolhida. Igual a `unitCost` deste item. */
  custoUnitario: number;
  /** O que esta linha custa pela via escolhida: `qtd x custoUnitario`. */
  total: number;
  /** Preço unitário de comprar pronto, ou `null` quando ninguém vende. */
  precoMercado: number | null;
  /** Custo unitário de fabricar, materiais mais balcão, ou `null` sem receita. */
  custoFabricado: number | null;
  /**
   * O que a via escolhida poupa contra a outra, no total desta linha.
   *
   * É o número da decisão: `0` quando não há alternativa nenhuma, e quanto maior,
   * mais trabalho braçal se paga. Sempre positivo — a via escolhida é a barata.
   */
  economia: number;
  /** O balcão e os insumos, quando fabricar é a via escolhida. */
  fabricacao: { zenyBalcao: number; insumos: ItemDaLista[] } | null;
}

/**
 * A mesma conta de `listaDeCompras`, em árvore em vez de achatada.
 *
 * As raízes são os minérios que o plano consome — os mesmos nomes que aparecem
 * na tabela por minério —, e cada uma que vale a pena fabricar abre embaixo o
 * que o NPC pede em troca, recursivamente até o que se acha à venda. Somar os
 * totais das raízes dá exatamente o `total` da lista achatada: as duas leem a
 * mesma decisão de `unitCost`, só que uma esconde os degraus e a outra os mostra.
 *
 * O que se perde em relação à lista achatada é a soma de um material que
 * aparece sob dois pais (Pó de Éter entra na Pedra de Éter e no Eteridecon);
 * o que se ganha é saber, a cada linha, quanto minério a economia custa em
 * viagem.
 */
export function arvoreDeCompras(
  itens: Record<number, number>,
  precos: PriceTable,
): ItemDaLista[] {
  const memo = new Map<number, number>();

  const no = (itemId: number, qtd: number, profundidade: number): ItemDaLista => {
    const mercado = precos[itemId];
    const precoMercado = mercado && mercado > 0 ? mercado : null;

    const receita = RECIPES.get(itemId);
    let custoFabricado: number | null = null;
    if (receita) {
      let craft = receita.zeny;
      for (const mat of receita.materiais) {
        const c = unitCost(mat.itemId, precos, memo);
        if (!Number.isFinite(c)) {
          craft = Infinity;
          break;
        }
        craft += c * mat.qtd;
      }
      custoFabricado = Number.isFinite(craft) ? craft : null;
    }

    // A mesma decisão de `sourcingOf`, com os dois números já em mãos — e a
    // mesma trava de profundidade de `listaDeCompras` contra receita cíclica.
    const fabricar =
      custoFabricado !== null &&
      profundidade <= 8 &&
      (precoMercado === null || custoFabricado < precoMercado);

    const custoUnitario = fabricar ? custoFabricado! : (precoMercado ?? Infinity);
    const alternativa = fabricar ? precoMercado : custoFabricado;

    return {
      itemId,
      qtd,
      via: fabricar ? 'npc' : precoMercado !== null ? 'mercado' : 'indisponivel',
      custoUnitario,
      total: custoUnitario * qtd,
      precoMercado,
      custoFabricado,
      economia: alternativa === null ? 0 : (alternativa - custoUnitario) * qtd,
      fabricacao: fabricar
        ? {
            zenyBalcao: receita!.zeny * qtd,
            insumos: receita!.materiais
              .map((mat) => no(mat.itemId, mat.qtd * qtd, profundidade + 1))
              .sort((a, b) => b.total - a.total),
          }
        : null,
    };
  };

  return Object.entries(itens)
    .filter(([, qtd]) => qtd > 0)
    .map(([id, qtd]) => no(Number(id), qtd, 0))
    .sort((a, b) => b.total - a.total || b.qtd - a.qtd);
}

/** Custo de uma unidade de minério, pela via mais barata. */
export function oreCost(ore: Ore, precos: PriceTable): number {
  return unitCost(ore.itemId, precos);
}

/**
 * Materiais de base que o jogador precisa cotar. São os itens que aparecem em
 * receitas mas não têm receita própria — não dá para o site adivinhar o preço
 * deles, então viram campos do formulário.
 */
export function baseMaterials(): { itemId: number; nome: string }[] {
  const vistos = new Map<number, string>();
  const temReceita = (id: number) => RECIPES.has(id);

  for (const ore of ORES) {
    if (!temReceita(ore.itemId)) vistos.set(ore.itemId, ore.nome);
    for (const mat of ore.npc?.materiais ?? []) {
      if (!temReceita(mat.itemId)) vistos.set(mat.itemId, mat.nome);
    }
  }
  for (const r of Object.values(GRADE_RECIPES)) {
    for (const mat of r.materiais) {
      if (!temReceita(mat.itemId)) vistos.set(mat.itemId, mat.nome);
    }
  }

  return [...vistos].map(([itemId, nome]) => ({ itemId, nome })).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
}
