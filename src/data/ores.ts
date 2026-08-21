// Catálogo de minérios de refino.
// Fonte: https://browiki.org/wiki/Refinamento (seção "Minérios")
//
// `refinaDe` é a faixa de refino ATUAL do item em que o minério pode ser usado.
// Ex.: "0 ao +9" => refinaDe: [0, 9], ou seja, tentativas que produzem +1 a +10.

/**
 * Categoria do equipamento — define qual coluna da tabela de chances usar.
 *
 * Os sombrios são divididos em arma e armadura embora compartilhem a mesma
 * coluna de chances: as chances são iguais, mas os minérios não. Arma sombria
 * refina com Oridecon; armadura sombria, com Elunium.
 */
export type ItemKind = 'w1' | 'w2' | 'w3' | 'w4' | 'w5' | 'a1' | 'a2' | 'shadowW' | 'shadowA';

/** O que acontece com o item quando a tentativa falha. */
export type FailureMode =
  /** O item é destruído. */
  | 'break'
  /** O item sobrevive e perde 3 níveis de refino (piso em +0). */
  | 'down3'
  /** O item sobrevive e perde 1 nível de refino (piso em +0). */
  | 'down1';

/** Um material consumido, além do zeny, para obter o minério no NPC. */
export interface MaterialCost {
  itemId: number;
  nome: string;
  qtd: number;
}

export interface Ore {
  id: string;
  itemId: number;
  nome: string;
  /** Categorias de item em que este minério funciona. */
  kinds: ItemKind[];
  /** Faixa de refino atual [min, max] em que o minério é aceito. */
  refinaDe: [number, number];
  /** Usa a tabela de chances "especiais" (Enriquecido / Perfeito). */
  especial: boolean;
  penalidade: FailureMode;
  /** Custo no NPC da refinaria, quando existe. `null` = só via JoyCoins/mercado. */
  npc: { zeny: number; materiais: MaterialCost[] } | null;
  /** Só é obtido com JoyCoins (cash shop) — preço é de mercado, não fixo. */
  joyCoins?: boolean;
}

const ORIDECON = { itemId: 984, nome: 'Oridecon', qtd: 1 };
const ELUNIUM = { itemId: 985, nome: 'Elunium', qtd: 1 };
const PO_ETER = { itemId: 1000322, nome: 'Pó de Éter', qtd: 1 };
const m = (base: MaterialCost, qtd: number): MaterialCost => ({ ...base, qtd });

export const ORES: Ore[] = [
  // ---------------------------------------------------------------- Armas: comuns
  {
    id: 'fracon',
    itemId: 1010,
    nome: 'Fracon',
    kinds: ['w1'],
    refinaDe: [0, 9],
    especial: false,
    penalidade: 'break',
    npc: { zeny: 200, materiais: [] },
  },
  {
    id: 'emveretarcon',
    itemId: 1011,
    nome: 'Emveretarcon',
    kinds: ['w2'],
    refinaDe: [0, 9],
    especial: false,
    penalidade: 'break',
    npc: { zeny: 1_000, materiais: [] },
  },
  {
    id: 'oridecon',
    itemId: 984,
    nome: 'Oridecon',
    kinds: ['w3', 'w4', 'shadowW'],
    refinaDe: [0, 9],
    especial: false,
    penalidade: 'break',
    npc: { zeny: 0, materiais: [{ itemId: 756, nome: 'Minério de Oridecon', qtd: 5 }] },
  },
  {
    id: 'bradium',
    itemId: 6224,
    nome: 'Bradium',
    kinds: ['w1', 'w2', 'w3', 'w4'],
    refinaDe: [10, 19],
    especial: false,
    penalidade: 'down3',
    npc: { zeny: 50_000, materiais: [m(ORIDECON, 3)] },
  },
  {
    id: 'eteridecon',
    itemId: 1000332,
    nome: 'Eteridecon',
    kinds: ['w5'],
    refinaDe: [0, 9],
    especial: false,
    penalidade: 'down3',
    npc: { zeny: 10_000, materiais: [m(ORIDECON, 1), m(PO_ETER, 1)] },
  },
  {
    id: 'bradium-eter',
    itemId: 1000368,
    nome: 'Bradium de Éter',
    kinds: ['w5'],
    refinaDe: [10, 19],
    especial: false,
    penalidade: 'break',
    npc: {
      zeny: 30_000,
      materiais: [{ itemId: 6224, nome: 'Bradium', qtd: 1 }, m(PO_ETER, 3)],
    },
  },

  // -------------------------------------------------------------- Armas: especiais
  {
    id: 'oridecon-enriquecido',
    itemId: 7620,
    nome: 'Oridecon Enriquecido',
    kinds: ['w3', 'w4', 'shadowW'],
    refinaDe: [0, 9],
    especial: true,
    penalidade: 'break',
    npc: null,
    joyCoins: true,
  },
  {
    id: 'oridecon-perfeito',
    itemId: 6240,
    nome: 'Oridecon Perfeito',
    kinds: ['w3', 'w4', 'shadowW'],
    refinaDe: [7, 9],
    especial: true,
    penalidade: 'down1',
    npc: null,
    joyCoins: true,
  },
  {
    id: 'bradium-perfeito',
    itemId: 6226,
    nome: 'Bradium Perfeito',
    kinds: ['w1', 'w2', 'w3', 'w4'],
    refinaDe: [10, 19],
    especial: true,
    penalidade: 'down1',
    npc: null,
    joyCoins: true,
  },
  {
    id: 'eteridecon-enriquecido',
    itemId: 1000334,
    nome: 'Eteridecon Enriquecido',
    kinds: ['w5'],
    refinaDe: [0, 9],
    especial: true,
    penalidade: 'down1',
    npc: {
      zeny: 20_000,
      materiais: [{ itemId: 7620, nome: 'Oridecon Enriquecido', qtd: 1 }, m(PO_ETER, 2)],
    },
  },
  {
    id: 'eteridecon-perfeito',
    itemId: 1000336,
    nome: 'Eteridecon Perfeito',
    kinds: ['w5'],
    refinaDe: [10, 14],
    especial: true,
    penalidade: 'break',
    npc: {
      zeny: 50_000,
      materiais: [{ itemId: 6240, nome: 'Oridecon Perfeito', qtd: 1 }, m(PO_ETER, 3)],
    },
  },
  {
    id: 'bradium-eter-perfeito',
    itemId: 1000369,
    nome: 'Bradium de Éter Perfeito',
    kinds: ['w5'],
    refinaDe: [15, 19],
    especial: true,
    penalidade: 'break',
    npc: {
      zeny: 50_000,
      materiais: [{ itemId: 6226, nome: 'Bradium Perfeito', qtd: 1 }, m(PO_ETER, 3)],
    },
  },

  // --------------------------------------------------------- Equipamentos: comuns
  {
    id: 'elunium',
    itemId: 985,
    nome: 'Elunium',
    kinds: ['a1', 'shadowA'],
    refinaDe: [0, 9],
    especial: false,
    penalidade: 'break',
    npc: { zeny: 0, materiais: [{ itemId: 757, nome: 'Minério de Elunium', qtd: 5 }] },
  },
  {
    id: 'carnium',
    itemId: 6223,
    nome: 'Carnium',
    kinds: ['a1'],
    refinaDe: [10, 19],
    especial: false,
    penalidade: 'down3',
    npc: { zeny: 50_000, materiais: [m(ELUNIUM, 3)] },
  },
  {
    id: 'eterium',
    itemId: 1000331,
    nome: 'Eterium',
    kinds: ['a2'],
    refinaDe: [0, 9],
    especial: false,
    penalidade: 'down3',
    npc: { zeny: 10_000, materiais: [m(ELUNIUM, 1), m(PO_ETER, 1)] },
  },
  {
    id: 'carnium-eter',
    itemId: 1000370,
    nome: 'Carnium de Éter',
    kinds: ['a2'],
    refinaDe: [10, 19],
    especial: false,
    penalidade: 'break',
    npc: {
      zeny: 50_000,
      materiais: [{ itemId: 6223, nome: 'Carnium', qtd: 1 }, m(PO_ETER, 3)],
    },
  },

  // ------------------------------------------------------ Equipamentos: especiais
  {
    id: 'elunium-enriquecido',
    itemId: 7619,
    nome: 'Elunium Enriquecido',
    kinds: ['a1', 'shadowA'],
    refinaDe: [0, 9],
    especial: true,
    penalidade: 'break',
    npc: null,
    joyCoins: true,
  },
  {
    id: 'elunium-perfeito',
    itemId: 6241,
    nome: 'Elunium Perfeito',
    kinds: ['a1', 'shadowA'],
    refinaDe: [7, 9],
    especial: true,
    penalidade: 'down1',
    npc: null,
    joyCoins: true,
  },
  {
    id: 'carnium-perfeito',
    itemId: 6225,
    nome: 'Carnium Perfeito',
    kinds: ['a1'],
    refinaDe: [10, 19],
    especial: true,
    penalidade: 'down1',
    npc: null,
    joyCoins: true,
  },
  {
    id: 'eterium-enriquecido',
    itemId: 1000333,
    nome: 'Eterium Enriquecido',
    kinds: ['a2'],
    refinaDe: [0, 9],
    especial: true,
    penalidade: 'down1',
    npc: {
      zeny: 20_000,
      materiais: [{ itemId: 7619, nome: 'Elunium Enriquecido', qtd: 1 }, m(PO_ETER, 2)],
    },
  },
  {
    id: 'eterium-perfeito',
    itemId: 1000335,
    nome: 'Eterium Perfeito',
    kinds: ['a2'],
    refinaDe: [10, 14],
    especial: true,
    penalidade: 'break',
    npc: {
      zeny: 50_000,
      materiais: [{ itemId: 6241, nome: 'Elunium Perfeito', qtd: 1 }, m(PO_ETER, 3)],
    },
  },
  {
    id: 'carnium-eter-perfeito',
    itemId: 1000371,
    nome: 'Carnium de Éter Perfeito',
    kinds: ['a2'],
    refinaDe: [15, 19],
    especial: true,
    penalidade: 'break',
    npc: {
      zeny: 50_000,
      materiais: [{ itemId: 6225, nome: 'Carnium Perfeito', qtd: 1 }, m(PO_ETER, 3)],
    },
  },
];

/** Se a categoria é de Equipamento Sombrio (arma ou armadura). */
export function ehSombrio(kind: ItemKind): boolean {
  return kind === 'shadowW' || kind === 'shadowA';
}

/**
 * Taxa em zeny que o refinador cobra por tentativa, por categoria de item.
 *
 * Fonte: https://irowiki.org/wiki/Refinement_System (seção "Reagents and Cost").
 * É a única das três wikis que publica esses valores — o Browiki e o Hazy Forest
 * não os citam.
 *
 * Sombrios não aparecem na tabela, e a taxa deles fica em 0 até alguém conferir
 * in-game: chutar um valor sairia caro no lugar errado, porque a taxa entra em
 * TODA tentativa e é ela que decide, na margem, qual minério compensa.
 */
export const TAXA_REFINO: Record<ItemKind, number> = {
  w1: 50,
  w2: 200,
  w3: 5_000,
  w4: 20_000,
  w5: 50_000,
  a1: 2_000,
  a2: 30_000,
  shadowW: 0,
  shadowA: 0,
};

/**
 * Quanto o NPC cobra por uma tentativa com este minério.
 *
 * Minério comprado no Cash Shop isenta a taxa: "If the player is using Enriched
 * Oridecon / Enriched Elunium / HD Oridecon / HD Elunium from the Kafra Shop,
 * the fee is 0z". Por isso a condição é `joyCoins`, e não `especial` — os
 * Enriquecidos e Perfeitos de Éter também são especiais, mas saem do NPC, e nada
 * indica que a isenção valha para eles.
 */
export function taxaDaTentativa(kind: ItemKind, ore: Ore): number {
  return ore.joyCoins ? 0 : TAXA_REFINO[kind];
}

export const ORE_BY_ID: ReadonlyMap<string, Ore> = new Map(ORES.map((o) => [o.id, o]));

/** Minérios utilizáveis para levar `kind` do refino `from` para `from + 1`. */
export function oresFor(kind: ItemKind, from: number): Ore[] {
  return ORES.filter(
    (o) => o.kinds.includes(kind) && from >= o.refinaDe[0] && from <= o.refinaDe[1],
  );
}

/**
 * Bênção do Ferreiro (item 6635): impede a perda do item e o rebaixamento do
 * refino em caso de falha. Só funciona nas tentativas +7→+8 até +13→+14, e a
 * quantidade consumida cresce com o refino. Não acumula com Equipamentos Sombrios.
 * Fonte: https://browiki.org/wiki/Refinamento (seção "Outros")
 */
export const BLESSING_ITEM_ID = 6635;

const BLESSING_COST: Record<number, number> = {
  7: 1,
  8: 2,
  9: 4,
  10: 7,
  11: 11,
  12: 16,
  13: 22,
};

/**
 * Quantas Bênçãos do Ferreiro são necessárias para proteger a tentativa que sai
 * de `from` para `from + 1`. Retorna `null` quando a Bênção não é aplicável.
 */
export function blessingCost(kind: ItemKind, from: number): number | null {
  if (ehSombrio(kind)) return null; // não funciona em Equipamentos Sombrios
  return BLESSING_COST[from] ?? null;
}
