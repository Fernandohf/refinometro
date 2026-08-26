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

/**
 * A mesma fabricação, com a receita aberta: o que entra para sair o minério.
 *
 * `FabricacaoLinha` responde "quanto o balcão cobrou"; esta responde "o que o
 * NPC pede em troca". É o que a lista de compras precisa para mostrar a
 * composição de um item ao lado dele — sem isso, quem lê a lista vê 1.900
 * Minério de Oridecon e não tem como saber que aquilo vira os 380 Oridecon do
 * plano.
 */
export interface FabricacaoAberta extends FabricacaoLinha {
  materiais: {
    itemId: number;
    nome: string;
    /** Quantas unidades a receita pede para produzir UMA do item. */
    porUnidade: number;
    /** O total consumido: `porUnidade x qtd`. */
    total: number;
  }[];
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
  /**
   * Toda etapa de fabricação, de balcão pago ou não, com a receita aberta.
   *
   * É a lista que a tela usa para mostrar a composição de cada minério. Inclui
   * as receitas de 0z que `fabricacao` omite justamente porque elas existem: o
   * jogador ainda precisa saber que os 1.900 Minério de Oridecon da lista viram
   * 380 Oridecon no NPC, mesmo que a transformação seja de graça.
   */
  fabricacaoAberta: FabricacaoAberta[];
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

  const fabricacaoAberta: FabricacaoAberta[] = [...fabricados]
    .map(([itemId, a]) => ({
      itemId,
      qtd: a.qtd,
      zeny: a.zeny,
      materiais: (RECIPES.get(itemId)?.materiais ?? []).map((mat) => ({
        itemId: mat.itemId,
        nome: mat.nome,
        porUnidade: mat.qtd,
        total: mat.qtd * a.qtd,
      })),
    }))
    // Pela quantidade fabricada, e não pelo balcão: a de balcão zerado é tão
    // parte do preparo quanto as outras, e ordenar por zeny a jogaria para o
    // fim mesmo sendo a maior transformação da lista.
    .sort((a, b) => b.qtd - a.qtd);

  // Só o balcão pago vira linha de custo. Transformar 5 Minério de Oridecon em
  // 1 Oridecon é de graça, e uma linha de 0z no diagrama só ocuparia espaço.
  const fabricacao: FabricacaoLinha[] = fabricacaoAberta
    .filter((f) => f.zeny > 0)
    .map(({ itemId, qtd, zeny }) => ({ itemId, qtd, zeny }))
    .sort((a, b) => b.zeny - a.zeny);

  const total = linhas.reduce((s, l) => s + l.total, 0) + zenyNpc;
  return { compras: linhas, zenyNpc, fabricacao, fabricacaoAberta, total };
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
