// Cubos, martelos e pergaminhos de refino: itens que mudam o refino de um equipamento sem uma
// tentativa no refinador.
//
// São três mecanismos, e o motor trata os três como uma AÇÃO a mais no mesmo processo de
// decisão que escolhe o minério — o que quer dizer que ninguém precisa decidir à mão quando usar
// um cubo: o otimizador compara o preço dele com o custo esperado do caminho que ele pula.
//
// - **Refino fixo**: o item vai direto para um refino, sem chance de falha. Os cubos do
//   Hollgrehenn ("Refina um item temporal para o +11"), o Martelo Sombrio +9, os Tickets de
//   Refino dos equipamentos Nobre/Ilustre/Grácil e os Pergaminhos de Arma/Armadura +X.
// - **Refino sorteado**: o item recebe um refino aleatório numa faixa, SUBSTITUINDO o atual —
//   pode até descer. Os Cubos Ilusionais e o Martelo de Refino Sombrio. As chances de cada
//   resultado são as do https://browiki.org/wiki/Combina%C3%A7%C3%A3o (seção "Refino").
// - **Refino somado**: +1 garantido a cada uso, numa faixa, cobrando materiais além do próprio
//   martelo (quase sempre 14 Bênçãos do Ferreiro). Os Martelos de Refino de cada conteúdo.
//
// QUAIS equipamentos cada um aceita, e a partir de que refino, não está aqui: vem da página de
// cada item no Divine Pride, que lista os alvos com link — ver `scripts/atalhos.ts`, que gera
// `atalhos.json`. Os Pergaminhos são a exceção: quem os aceita é um NPC (o Mestre do Refino, em
// Prontera), e a regra dele é por categoria — ver `PERGAMINHOS`.

import type { MaterialCost, ItemKind } from './ores';
import gerado from './atalhos.json';

/** O que um atalho faz com o refino do equipamento. */
export type EfeitoDoAtalho =
  /** O refino passa a ser exatamente este. */
  | { tipo: 'fixo'; refino: number }
  /** O refino passa a ser um destes, sorteado — mesmo que menor que o atual. */
  | { tipo: 'sorteio'; resultados: readonly { refino: number; p: number }[] }
  /** O refino sobe `refinos` níveis. */
  | { tipo: 'soma'; refinos: number };

export type GrupoDoAtalho = 'cubo' | 'martelo' | 'pergaminho' | 'ticket';

/** O que é escrito à mão: nome e efeito. Os alvos vêm do Divine Pride. */
export interface AtalhoCatalogado {
  itemId: number;
  /** Nome no LATAM, como a listagem do Divine Pride o escreve. */
  nome: string;
  grupo: GrupoDoAtalho;
  efeito: EfeitoDoAtalho;
  /**
   * Preso na conta: não passa de um jogador para outro, então não tem preço de mercado e
   * começa sem preço. Quem tem um digita o que ele vale para si (até 0).
   */
  presoNaConta?: boolean;
}

/** Um atalho pronto para o motor: efeito, faixa aceita, custo e alvos. */
export interface Atalho extends AtalhoCatalogado {
  /** Faixa de refino ATUAL em que o item é aceito, inclusiva. */
  aceitaDe: readonly [number, number];
  /** O que cada uso consome além do próprio atalho. */
  materiais: readonly MaterialCost[];
}

// -------------------------------------------------------------------- sorteios
//
// As três tabelas do Browiki, seção "Refino" da página de Combinação. Somam 100%.

const ILUSIONAL = [
  { refino: 7, p: 0.65 },
  { refino: 8, p: 0.22 },
  { refino: 9, p: 0.1 },
  { refino: 10, p: 0.03 },
] as const;

const SUPER_ILUSIONAL = [
  { refino: 9, p: 0.65 },
  { refino: 10, p: 0.285 },
  { refino: 11, p: 0.05 },
  { refino: 12, p: 0.015 },
] as const;

/** "Maior chance de sair um refino +4", diz a descrição — e é 35%. */
const MARTELO_SOMBRIO = [
  { refino: 1, p: 0.044 },
  { refino: 2, p: 0.0879 },
  { refino: 3, p: 0.1703 },
  { refino: 4, p: 0.3516 },
  { refino: 5, p: 0.1758 },
  { refino: 6, p: 0.0879 },
  { refino: 7, p: 0.044 },
  { refino: 8, p: 0.022 },
  { refino: 9, p: 0.011 },
  { refino: 10, p: 0.0055 },
] as const;

const fixo = (refino: number): EfeitoDoAtalho => ({ tipo: 'fixo', refino });
const sorteio = (resultados: readonly { refino: number; p: number }[]): EfeitoDoAtalho => ({
  tipo: 'sorteio',
  resultados,
});
const MAIS_UM: EfeitoDoAtalho = { tipo: 'soma', refinos: 1 };

/**
 * Os atalhos com lista de alvos no Divine Pride.
 *
 * O resultado dos cubos de refino fixo está na descrição de cada um ("Refina um item temporal
 * para o +11") e `scripts/atalhos.ts` confere que ele continua lá a cada execução.
 */
export const CATALOGO: readonly AtalhoCatalogado[] = [
  // ---------------------------------------------- cubos do Hollgrehenn: refino fixo
  { itemId: 100268, nome: 'Cubo de Refino Temporal', grupo: 'cubo', efeito: fixo(11) },
  { itemId: 100269, nome: 'Cubo de Refino do Torneio', grupo: 'cubo', efeito: fixo(12) },
  { itemId: 100270, nome: 'Cubo de Refino Memorável', grupo: 'cubo', efeito: fixo(12) },
  { itemId: 100321, nome: 'Cubo de Refino OS', grupo: 'cubo', efeito: fixo(11) },
  { itemId: 100322, nome: 'Cubo de Refino da Corrida', grupo: 'cubo', efeito: fixo(11) },
  { itemId: 100354, nome: 'Cubo de Refino Automatron', grupo: 'cubo', efeito: fixo(11) },
  { itemId: 100355, nome: 'Cubo de Refino de Bioarma', grupo: 'cubo', efeito: fixo(12) },
  { itemId: 100436, nome: 'Cubo de Refino de Diademas', grupo: 'cubo', efeito: fixo(11) },
  { itemId: 100684, nome: 'Cubo de Refino Biológico', grupo: 'cubo', efeito: fixo(11) },
  { itemId: 106429, nome: 'Cubo de Refino de Cinzas', grupo: 'cubo', efeito: fixo(7) },
  { itemId: 106430, nome: 'Cubo de Refino de Mora', grupo: 'cubo', efeito: fixo(9) },
  { itemId: 106431, nome: 'Cubo de Refino Desbravador', grupo: 'cubo', efeito: fixo(8) },
  {
    itemId: 103678,
    nome: 'Cubo de Refino de Cinzas +11',
    grupo: 'cubo',
    efeito: fixo(11),
    presoNaConta: true,
  },

  // ------------------------------------------------- cubos ilusionais: refino sorteado
  { itemId: 9785, nome: 'Cubo de Refino do Gelo', grupo: 'cubo', efeito: sorteio(ILUSIONAL) },
  { itemId: 100391, nome: 'Cubo de Refino do Luar', grupo: 'cubo', efeito: sorteio(ILUSIONAL) },
  { itemId: 100414, nome: 'Cubo de Refino do Vampiro', grupo: 'cubo', efeito: sorteio(ILUSIONAL) },
  { itemId: 100417, nome: 'Cubo da Tartaruga', grupo: 'cubo', efeito: sorteio(ILUSIONAL) },
  { itemId: 100419, nome: 'Cubo do Ursinho', grupo: 'cubo', efeito: sorteio(ILUSIONAL) },
  { itemId: 100421, nome: 'Cubo de Luanda', grupo: 'cubo', efeito: sorteio(ILUSIONAL) },
  { itemId: 100423, nome: 'Cubo do Labirinto', grupo: 'cubo', efeito: sorteio(ILUSIONAL) },
  { itemId: 100425, nome: 'Cubo do Mar', grupo: 'cubo', efeito: sorteio(ILUSIONAL) },
  { itemId: 100699, nome: 'Cubo das Gêmeas', grupo: 'cubo', efeito: sorteio(ILUSIONAL) },
  { itemId: 100416, nome: 'Super Cubo de Refino do Gelo', grupo: 'cubo', efeito: sorteio(SUPER_ILUSIONAL) },
  { itemId: 100392, nome: 'Super Cubo de Refino do Luar', grupo: 'cubo', efeito: sorteio(SUPER_ILUSIONAL) },
  { itemId: 100415, nome: 'Super Cubo de Refino do Vampiro', grupo: 'cubo', efeito: sorteio(SUPER_ILUSIONAL) },
  { itemId: 100418, nome: 'Super Cubo da Tartaruga', grupo: 'cubo', efeito: sorteio(SUPER_ILUSIONAL) },
  { itemId: 100420, nome: 'Super Cubo do Ursinho', grupo: 'cubo', efeito: sorteio(SUPER_ILUSIONAL) },
  { itemId: 100422, nome: 'Super Cubo de Luanda', grupo: 'cubo', efeito: sorteio(SUPER_ILUSIONAL) },
  { itemId: 100424, nome: 'Super Cubo do Labirinto', grupo: 'cubo', efeito: sorteio(SUPER_ILUSIONAL) },
  { itemId: 100426, nome: 'Super Cubo do Mar', grupo: 'cubo', efeito: sorteio(SUPER_ILUSIONAL) },
  { itemId: 100700, nome: 'Super Cubo das Gêmeas', grupo: 'cubo', efeito: sorteio(SUPER_ILUSIONAL) },

  // ------------------------------------------------------------------ sombrios
  { itemId: 23926, nome: 'Martelo Sombrio +9', grupo: 'martelo', efeito: fixo(9) },
  { itemId: 23436, nome: 'Martelo de Refino Sombrio', grupo: 'martelo', efeito: sorteio(MARTELO_SOMBRIO) },

  // ------------------------------------- Tickets de Refino: presos na conta, refino fixo
  { itemId: 100128, nome: 'Ticket Nobre de Refino', grupo: 'ticket', efeito: fixo(9), presoNaConta: true },
  { itemId: 100129, nome: 'Ticket Ilustre de Refino', grupo: 'ticket', efeito: fixo(9), presoNaConta: true },
  { itemId: 100130, nome: 'Ticket Grácil de Refino', grupo: 'ticket', efeito: fixo(9), presoNaConta: true },

  // --------------------------------------------- martelos de reforma: +1 com materiais
  { itemId: 100619, nome: 'Martelo de Refino de Cinzas', grupo: 'martelo', efeito: MAIS_UM },
  { itemId: 100821, nome: 'Martelo de Refino Primordial I', grupo: 'martelo', efeito: MAIS_UM },
  { itemId: 100822, nome: 'Martelo de Refino Primordial II', grupo: 'martelo', efeito: MAIS_UM },
  { itemId: 100835, nome: 'Martelo de Refino Primordial III', grupo: 'martelo', efeito: MAIS_UM },
  { itemId: 100917, nome: 'Martelo de Refino Primordial IV', grupo: 'martelo', efeito: MAIS_UM },
  { itemId: 100938, nome: 'Martelo de Refino Primordial V', grupo: 'martelo', efeito: MAIS_UM },
  { itemId: 101189, nome: 'Martelo de Refino Primordial VI', grupo: 'martelo', efeito: MAIS_UM },
  { itemId: 101077, nome: 'Martelo de Refino Vivatus', grupo: 'martelo', efeito: MAIS_UM },
  { itemId: 101259, nome: 'Martelo de Refino dos Elmos', grupo: 'martelo', efeito: MAIS_UM },
  { itemId: 101306, nome: 'Martelo de Refino Paenitentia', grupo: 'martelo', efeito: MAIS_UM },
  { itemId: 101307, nome: 'Martelo de Refino da Ecosfera', grupo: 'martelo', efeito: MAIS_UM },
  { itemId: 101363, nome: 'Martelo de Refino COR', grupo: 'martelo', efeito: MAIS_UM },
  { itemId: 101364, nome: 'Martelo de Refino OSAD', grupo: 'martelo', efeito: MAIS_UM },
  { itemId: 101389, nome: 'Martelo de Refino da Fé', grupo: 'martelo', efeito: MAIS_UM },
  { itemId: 101390, nome: 'Martelo de Refino do Relógio', grupo: 'martelo', efeito: MAIS_UM },
  { itemId: 102072, nome: 'Martelo de Refino Celestial', grupo: 'martelo', efeito: MAIS_UM },
  { itemId: 102073, nome: 'Martelo de Refino Infernal', grupo: 'martelo', efeito: MAIS_UM },
];

// ------------------------------------------------------------------ pergaminhos

/** Um Pergaminho de Arma ou Armadura +X, e a caixa do Cash Shop que o entrega. */
export interface Pergaminho {
  itemId: number;
  refino: number;
  /** A "Caixa de Arma +X" que, aberta, dá este pergaminho — é o que se acha à venda. */
  caixa: number;
}

const pergaminhos = (linhas: readonly [refino: number, itemId: number, caixa: number][]) =>
  linhas.map(([refino, itemId, caixa]): Pergaminho => ({ itemId, refino, caixa }));

/**
 * Os Pergaminhos de Arma +5 a +19, e as caixas que os entregam.
 *
 * O par caixa → pergaminho é o `getitem` do script de cada caixa no banco do rAthena
 * (`item_db_usable.yml`): a Caixa de Arma +9 (22913) entrega 1 Pergaminho de Arma +9 (6228), e
 * assim por diante, sem sorteio.
 */
export const PERGAMINHOS_DE_ARMA = pergaminhos([
  [5, 6456, 22909], [6, 6231, 22910], [7, 6230, 22911], [8, 6229, 22912], [9, 6228, 22913],
  [10, 6993, 22944], [11, 6238, 22915], [12, 6584, 22916], [13, 6870, 22917], [14, 6871, 22918],
  [15, 6872, 22919], [16, 6873, 22920], [17, 6874, 22921], [18, 6875, 22922], [19, 6864, 22923],
]);

/** Os Pergaminhos de Armadura +5 a +19, mesma regra dos de arma. */
export const PERGAMINHOS_DE_ARMADURA = pergaminhos([
  [5, 6457, 22924], [6, 6235, 22925], [7, 6234, 22926], [8, 6233, 22927], [9, 6232, 22928],
  [10, 6994, 22943], [11, 6239, 22930], [12, 6585, 22931], [13, 6876, 22932], [14, 6877, 22933],
  [15, 6878, 22934], [16, 6879, 22935], [17, 6880, 22936], [18, 6881, 22937], [19, 6865, 22938],
]);

/**
 * Para que categorias cada pergaminho serve.
 *
 * Quem aplica o pergaminho é o Mestre do Refino (Prontera 184, 177 — a descrição LATAM do item
 * aponta para ele). A regra dele não está em página nenhuma do Divine Pride; vem do script do
 * NPC no rAthena (`npc/re/merchants/ticket_refiner.txt`): **arma de nível 1 a 4** para o de
 * arma, **equipamento de nível 1** para o de armadura, e só se o refino atual for MENOR que o do
 * pergaminho. Arma nv5 e Equipamento nv2 — os de Éter, com Grau — ficam de fora, e Sombrio também:
 * ele não é arma nem armadura para o NPC.
 *
 * O +10 é o único que o script do rAthena não lista, embora a caixa e o pergaminho existam no
 * LATAM com a mesma descrição dos outros. Ele entra pela descrição; é a suposição desta tabela.
 */
const KINDS_DO_PERGAMINHO = {
  arma: ['w1', 'w2', 'w3', 'w4'],
  armadura: ['a1'],
} as const satisfies Record<string, readonly ItemKind[]>;

const comoAtalho = (p: Pergaminho, tipo: 'Arma' | 'Armadura'): Atalho => ({
  itemId: p.itemId,
  nome: `Pergaminho de ${tipo} +${p.refino}`,
  grupo: 'pergaminho',
  efeito: fixo(p.refino),
  aceitaDe: [0, p.refino - 1],
  materiais: [],
});

const ATALHOS_DE_ARMA = PERGAMINHOS_DE_ARMA.map((p) => comoAtalho(p, 'Arma'));
const ATALHOS_DE_ARMADURA = PERGAMINHOS_DE_ARMADURA.map((p) => comoAtalho(p, 'Armadura'));

// ------------------------------------------------------------ o que veio do site

/** O que `scripts/atalhos.ts` grava por atalho. */
export interface AtalhoGerado {
  /** Refino mínimo exigido, pela tabela do Divine Pride. */
  minimo: number;
  /** Refino máximo aceito — só os martelos de reforma publicam um. */
  maximo: number | null;
  materiais: MaterialCost[];
  /** Ids dos equipamentos que o atalho aceita. */
  alvos: number[];
}

const GERADO = (gerado as unknown as { atalhos: Record<string, AtalhoGerado> }).atalhos;

/** De onde vieram os alvos, e quando — o rodapé credita. */
export const META_ATALHOS: { fonte: string; geradoEm: string } = {
  fonte: (gerado as { _fonte: string })._fonte,
  geradoEm: (gerado as { _geradoEm: string })._geradoEm,
};

/** O maior refino que o efeito pode produzir. */
export function refinoMaximoDoEfeito(efeito: EfeitoDoAtalho, de: number): number {
  switch (efeito.tipo) {
    case 'fixo':
      return efeito.refino;
    case 'sorteio':
      return Math.max(...efeito.resultados.map((r) => r.refino));
    case 'soma':
      return de + efeito.refinos;
  }
}

/**
 * Onde o atalho deixa de ser aceito.
 *
 * Os cubos não publicam o teto, e a regra é a mesma em todos os que publicam: o item é recusado
 * a partir do maior refino que o atalho pode dar. O rAthena registra assim cada cubo
 * (`laphine_upgrade.yml`: o Temporal, que dá +11, aceita até o +10; o Ilusional, que sorteia até
 * o +10, até o +9), e o Mestre do Refino recusa o item "já refinado tanto quanto o pergaminho".
 * Os martelos de reforma publicam a faixa, e ela vence.
 */
function tetoAceito(c: AtalhoCatalogado, g: AtalhoGerado): number {
  if (g.maximo !== null) return g.maximo;
  return refinoMaximoDoEfeito(c.efeito, 0) - 1;
}

/** Os atalhos com alvo por item, prontos para o motor. */
const POR_ITEM = new Map<number, Atalho[]>();
for (const c of CATALOGO) {
  const g = GERADO[c.itemId];
  if (!g) continue;
  const atalho: Atalho = { ...c, aceitaDe: [g.minimo, tetoAceito(c, g)], materiais: g.materiais };
  for (const alvo of g.alvos) {
    const lista = POR_ITEM.get(alvo);
    if (lista) lista.push(atalho);
    else POR_ITEM.set(alvo, [atalho]);
  }
}

/**
 * Os materiais que os martelos cobram por uso, sem repetição — a Bênção do Ferreiro e os
 * insumos de conteúdo (Núcleo COR, Sombridecon, Zelunium). Precisam de nome na tela e de preço,
 * senão o martelo que os pede sai do plano por falta de cotação.
 */
export const MATERIAIS_DE_ATALHO: readonly MaterialCost[] = [
  ...new Map(
    Object.values(GERADO)
      .flatMap((g) => g.materiais)
      .map((m) => [m.itemId, { ...m, qtd: 1 }] as const),
  ).values(),
];

/** Todos os atalhos conhecidos, com ou sem alvo gerado — para nomes e campos de preço. */
export const TODOS_OS_ATALHOS: readonly AtalhoCatalogado[] = [
  ...CATALOGO,
  ...ATALHOS_DE_ARMA,
  ...ATALHOS_DE_ARMADURA,
];

/**
 * Os atalhos que servem para um equipamento.
 *
 * `itemId` é o do item escolhido na busca; sem ele (categoria escolhida à mão) sobram só os
 * Pergaminhos, que valem pela categoria. Sem o id não há como saber se o item é um Temporal ou
 * um Ilusional — e oferecer o cubo de um item que não é o da pessoa seria um orçamento falso.
 */
export function atalhosDoItem(itemId: number | null, kind: ItemKind): Atalho[] {
  const doItem = itemId === null ? [] : (POR_ITEM.get(itemId) ?? []);
  const porCategoria = [
    ...((KINDS_DO_PERGAMINHO.arma as readonly ItemKind[]).includes(kind) ? ATALHOS_DE_ARMA : []),
    ...((KINDS_DO_PERGAMINHO.armadura as readonly ItemKind[]).includes(kind) ? ATALHOS_DE_ARMADURA : []),
  ];
  return [...doItem, ...porCategoria];
}
