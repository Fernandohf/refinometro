// Catálogo de minérios de refino.
//
// Faixas de refino e alvo de cada minério: https://ro.gnjoyamericas.com/pt/news/probability/2
// (tabela 7), a divulgação oficial da GNJOY Americas — a operadora do LATAM. Penalidades e
// receitas de NPC não aparecem lá e continuam vindo do https://browiki.org/wiki/Refinamento
// (seção "Minérios").
//
// A exceção é o EFEITO de cada minério (aumenta a chance? protege da quebra?), conferido um a um
// na descrição LATAM do item no Divine Pride — https://www.divine-pride.net/database/item/<id>.
// A tabela oficial agrupa todos os "especiais" numa coluna de chances só, e isso esconde que nem
// todo especial aumenta a chance; a ficha do Divine Pride é datamine do cliente, então sobre "o
// que este item faz" ela ganha de um agrupamento de tabela — e foi ela que o jogo confirmou.
// Ver o campo `chanceAumentada`.
//
// `npm run descricoes` imprime as descrições lado a lado para reconferir.
//
// `refinaDe` é a faixa de refino ATUAL do item em que o minério pode ser usado.
// Ex.: "0 ao +9" => refinaDe: [0, 9], ou seja, tentativas que produzem +1 a +10.

/**
 * Categoria do equipamento — define qual coluna da tabela de chances usar.
 *
 * Os sombrios são divididos em arma e armadura embora compartilhem a mesma
 * coluna de chances: as chances são iguais, mas os minérios não. A Manopla
 * Sombria (`shadowW`) refina com Oridecon; o Equipamento Sombrio (`shadowA`),
 * com Elunium. A taxa do refinador também os separa — ver `ISENTA_CASH_SHOP`.
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
  /**
   * É um minério "especial" (Enriquecido / Perfeito), e por isso só entra no
   * plano quando o jogador marca que aceita usá-los. É uma questão de acesso —
   * eles vêm de JoyCoins ou de receita cara —, não de efeito.
   */
  especial: boolean;
  /**
   * Usa a tabela de chances aumentadas em vez da comum.
   *
   * NÃO é sinônimo de `especial`, e o critério é a descrição LATAM do item: os
   * minérios que aumentam a chance dizem isso com todas as letras — "Aumenta as
   * chances de sucesso ao refinar uma arma", "Refina armas de nível 5, do +1 até
   * +10, **com maior chance**". Os que só protegem descrevem apenas a proteção:
   * "garante a segurança no refinamento", "a arma não será perdida, mas reduz 1
   * nível de refino". A distinção é sistemática nos 22 minérios, em português e
   * em inglês, então a ausência da frase é informação, não descuido.
   *
   * Daí saem três grupos, e o nome do minério não diz a qual ele pertence:
   *
   * - só chance: Oridecon e Elunium Enriquecido — que continuam DESTRUINDO o item;
   * - só proteção: Oridecon, Elunium, Bradium e Carnium Perfeito;
   * - as duas: todos os de Éter marcados "com maior chance".
   *
   * **Confirmado in-game em 2026-09-04**: em Oridecon e Elunium, só o Enriquecido
   * aumenta a chance; nas categorias de Éter (Arma nv5 e Equipamento nv2) o especial
   * aumenta. Era a última divergência aberta com a tabela oficial, que agrupa tudo numa
   * coluna só — a leitura da descrição do item estava certa.
   */
  chanceAumentada: boolean;
  penalidade: FailureMode;
  /**
   * Custo no NPC da refinaria, quando existe. `null` = não é fabricável: só sai de
   * JoyCoins ou da mão de outro jogador, e o preço vem do mercado.
   */
  npc: { zeny: number; materiais: MaterialCost[] } | null;
  /**
   * Vem do Cash Shop (JoyCoins). Além do preço ser de revenda entre jogadores, é
   * este campo que isenta a taxa do refinador nas armas nv1 a nv4 — ver
   * `taxaDaTentativa`.
   */
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
    chanceAumentada: false,
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
    chanceAumentada: false,
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
    chanceAumentada: false,
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
    chanceAumentada: false,
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
    chanceAumentada: false,
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
    chanceAumentada: false,
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
    // A tabela oficial dá "Manopla Sombria / Arma nv. 1~4" aos dois Oridecons especiais,
    // enquanto o Oridecon comum para no nv3. Não é descuido: a tabela de chances especiais
    // publica colunas para Arma nv1 e nv2, que só existem porque há um minério especial que
    // as refina.
    kinds: ['w1', 'w2', 'w3', 'w4', 'shadowW'],
    refinaDe: [0, 9],
    especial: true,
    chanceAumentada: true,
    penalidade: 'break',
    npc: null,
    joyCoins: true,
  },
  {
    id: 'oridecon-perfeito',
    itemId: 6240,
    nome: 'Oridecon Perfeito',
    kinds: ['w1', 'w2', 'w3', 'w4', 'shadowW'],
    refinaDe: [7, 9],
    especial: true,
    // "Um Oridecon perfeito, que garante a segurança no refinamento do seu
    // equipamento. Em casos de falha ao refinar itens +7, +8 ou +9, a arma não
    // será perdida, mas reduz 1 nível de refino." — nem uma palavra sobre chance.
    chanceAumentada: false,
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
    chanceAumentada: false,
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
    chanceAumentada: true,
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
    chanceAumentada: true,
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
    chanceAumentada: true,
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
    chanceAumentada: false,
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
    chanceAumentada: false,
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
    chanceAumentada: false,
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
    chanceAumentada: false,
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
    chanceAumentada: true,
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
    // Mesma descrição do Oridecon Perfeito, trocando arma por equipamento: só
    // fala em não perder o item e cair 1 refino.
    chanceAumentada: false,
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
    chanceAumentada: false,
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
    chanceAumentada: true,
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
    chanceAumentada: true,
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
    chanceAumentada: true,
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
 * É a única tabela do projeto sem fonte publicada — a divulgação oficial da GNJOY traz
 * as chances, não os custos —, e por isso foi levantada no balcão do NPC, categoria por
 * categoria, em 2026-09-04. **Todas as nove foram conferidas in-game.** O
 * https://irowiki.org/wiki/Refinement_System, que servia de fonte antes, errava sete das
 * nove: nenhum valor dele sobreviveu à conferência, e é por isso que ele não é mais
 * citado aqui.
 *
 * A taxa **não muda com o refino do item**: é a mesma do +0 ao +19 (conferido).
 */
export const TAXA_REFINO: Record<ItemKind, number> = {
  w1: 1_000,
  w2: 2_000,
  w3: 10_000,
  w4: 10_000,
  w5: 75_000,
  a1: 10_000,
  a2: 45_000,
  // Os dois sombrios cobram como Equipamento nv1, cada um conferido no seu balcão.
  shadowW: 10_000,
  shadowA: 10_000,
};

/**
 * Categorias em que minério de Cash Shop sai com a taxa isenta.
 *
 * A isenção existe, mas não é geral: **a linha que a separa é arma × equipamento**.
 * Refinar Arma nv1 a nv4 ou Manopla Sombria com Oridecon Enriquecido custa 0z de taxa;
 * refinar Equipamento nv1 ou Equipamento Sombrio com Elunium Enriquecido — ou Perfeito
 * — custa os 10.000z cheios. O mesmo tipo de minério isenta na arma e não isenta no
 * equipamento, e é o par de sombrios que fecha a leitura: mesma taxa, mesma coluna de
 * chances, e mesmo assim só a Manopla isenta.
 *
 * Não é o que o iROwiki descreve ("If the player is using Enriched Oridecon / Enriched
 * Elunium / HD Oridecon / HD Elunium from the Kafra Shop, the fee is 0z", sem ressalva
 * de categoria), e nenhuma fonte explica a assimetria — mas é o que o NPC cobra, nas
 * cinco categorias em que dá para testar.
 *
 * A Arma nv5 não está na lista porque a pergunta não existe lá: o especial dela é
 * fabricado no NPC, não comprado com JoyCoins, e cobra a taxa cheia (conferido com
 * Eteridecon Enriquecido). Mesma coisa no Equipamento nv2.
 */
const ISENTA_CASH_SHOP: readonly ItemKind[] = ['w1', 'w2', 'w3', 'w4', 'shadowW'];

/**
 * Quanto o NPC cobra de taxa por uma tentativa com este minério.
 *
 * Depende do minério, e não só da categoria, por causa da isenção acima — por isso a
 * taxa entra por AÇÃO no motor, e o total de taxas de uma campanha não é
 * `tentativas x valor fixo`.
 *
 * Toda a tabela foi medida no balcão do NPC em 2026-09-04, categoria por categoria e
 * minério por minério.
 */
export function taxaDaTentativa(kind: ItemKind, ore: Ore): number {
  if (ore.joyCoins && ISENTA_CASH_SHOP.includes(kind)) return 0;
  return TAXA_REFINO[kind];
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
 * quantidade consumida cresce com o refino. Não funciona com Equipamentos Sombrios.
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
