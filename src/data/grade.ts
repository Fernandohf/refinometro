// Sistema de Grau (Grade D / C / B / A).
// Fonte: https://ro.gnjoyamericas.com/pt/news/probability/27 (divulgação oficial da GNJOY
// Americas, a operadora do LATAM).
//
// Só Armas nível 5 e Armaduras nível 2 têm Grau.
//
// Duas regras dominam a estratégia:
//   1. Ao SUBIR de grau com sucesso, o refino do item é RESETADO para +0.
//   2. Cada degrau exige refino alto de novo, do zero.
// Ou seja, ir de "sem grau" até Grau A significa quatro ciclos de refino.

import type { MaterialCost } from './ores';

export type Grade = 'none' | 'D' | 'C' | 'B' | 'A';

/** Ordem dos graus, do menor para o maior. */
export const GRADE_ORDER: Grade[] = ['none', 'D', 'C', 'B', 'A'];

/** Chave usada nas tabelas de chance geradas a partir da página oficial. */
export type GradeStepKey = 'toD' | 'toC' | 'toB' | 'toA';

export interface GradeStep {
  key: GradeStepKey;
  de: Grade;
  para: Grade;
  /** Processo normal: 1 material (2 no B→A). Em caso de falha, perde o item. */
  normal: { zeny: number; material: MaterialCost };
  /** Processo seguro: 5x o material (10x no B→A). Em caso de falha, não perde nada. */
  seguro: { zeny: number; material: MaterialCost };
  /** Quantas Bênçãos de Éter custam +1% de chance neste degrau. */
  bencaosPorPonto: number;
}

const AQUAMARINA = { itemId: 1000325, nome: 'Aquamarina de Éter' };
const TOPAZIO = { itemId: 1000326, nome: 'Topázio de Éter' };
const AMETISTA = { itemId: 1000327, nome: 'Ametista de Éter' };
const AMBAR = { itemId: 1000328, nome: 'Âmbar de Éter' };

/**
 * Refino mínimo para tentar o grau. Abaixo dele o processo simplesmente não existe.
 *
 * A tabela oficial começa no +11, e o NPC recusa o item abaixo disso — conferido
 * in-game em 2026-09-04. Foi um ponto que ficou em aberto por um tempo: o Browiki
 * listava chances a partir do +9, o que fazia o motor propor Grau D logo no +9 e
 * economizar (no papel) 22% numa campanha de arma nv5. Era plano ilegal, e as duas
 * fontes concordam em desfazê-lo.
 *
 * A tabela continua mandando: ela traz `null` onde o degrau não é possível, e este
 * valor é só o piso da busca.
 */
export const REFINO_MINIMO_GRAU = 11;

/**
 * A página oficial publica as CHANCES, não os custos.
 *
 * O degrau "sem grau → D" foi conferido no NPC em 2026-09-04: 150.000z no processo
 * normal e 750.000z no seguro. O Browiki dizia 100.000z e 500.000z — errou os dois, e
 * manteve só a estrutura (o seguro custa 5x o normal, com 5x o material).
 *
 * Os outros três degraus continuam com o número do https://browiki.org/wiki/Grau, que
 * é a única fonte que existe para eles, e ficam **suspeitos**: o único que deu para
 * medir estava errado. As receitas dos materiais (GRADE_RECIPES) vêm do mesmo lugar e
 * carregam a mesma ressalva.
 */
export const GRADE_STEPS: GradeStep[] = [
  {
    key: 'toD',
    de: 'none',
    para: 'D',
    // Conferido in-game em 2026-09-04.
    normal: { zeny: 150_000, material: { ...AQUAMARINA, qtd: 1 } },
    seguro: { zeny: 750_000, material: { ...AQUAMARINA, qtd: 5 } },
    bencaosPorPonto: 1,
  },
  {
    key: 'toC',
    de: 'D',
    para: 'C',
    normal: { zeny: 125_000, material: { ...TOPAZIO, qtd: 1 } },
    seguro: { zeny: 625_000, material: { ...TOPAZIO, qtd: 5 } },
    bencaosPorPonto: 3,
  },
  {
    key: 'toB',
    de: 'C',
    para: 'B',
    normal: { zeny: 200_000, material: { ...AMETISTA, qtd: 1 } },
    seguro: { zeny: 1_000_000, material: { ...AMETISTA, qtd: 5 } },
    bencaosPorPonto: 5,
  },
  {
    key: 'toA',
    de: 'B',
    para: 'A',
    normal: { zeny: 500_000, material: { ...AMBAR, qtd: 2 } },
    seguro: { zeny: 2_500_000, material: { ...AMBAR, qtd: 10 } },
    bencaosPorPonto: 7,
  },
];

/** A Bênção de Éter só pode empurrar a chance em, no máximo, +10 pontos percentuais. */
export const MAX_BLESSING_BONUS = 0.1;
export const ETHER_BLESSING_ITEM_ID = 1000337;

/**
 * Receitas dos materiais de Grau nos NPCs, para estimar o custo por craft quando
 * o jogador prefere fabricar em vez de comprar de outro jogador.
 * Fonte: https://browiki.org/wiki/Grau (seção "Materiais")
 */
export const GRADE_RECIPES: Record<number, { nome: string; zeny: number; materiais: MaterialCost[] }> = {
  1000323: {
    nome: 'Pedra de Éter',
    zeny: 100_000,
    materiais: [{ itemId: 1000322, nome: 'Pó de Éter', qtd: 5 }],
  },
  1000337: {
    nome: 'Bênção de Éter',
    zeny: 100_000,
    materiais: [
      { itemId: 1000322, nome: 'Pó de Éter', qtd: 5 },
      { itemId: 6635, nome: 'Bênção do Ferreiro', qtd: 1 },
    ],
  },
  1000325: {
    nome: 'Aquamarina de Éter',
    zeny: 100_000,
    materiais: [
      { itemId: 1000323, nome: 'Pedra de Éter', qtd: 3 },
      { itemId: 720, nome: 'Aquamarina', qtd: 1 },
    ],
  },
  1000326: {
    nome: 'Topázio de Éter',
    zeny: 200_000,
    materiais: [
      { itemId: 1000323, nome: 'Pedra de Éter', qtd: 6 },
      { itemId: 728, nome: 'Topázio', qtd: 1 },
    ],
  },
  1000327: {
    nome: 'Ametista de Éter',
    zeny: 300_000,
    materiais: [
      { itemId: 1000323, nome: 'Pedra de Éter', qtd: 10 },
      { itemId: 719, nome: 'Ametista', qtd: 1 },
    ],
  },
  1000328: {
    nome: 'Âmbar de Éter',
    zeny: 500_000,
    materiais: [
      { itemId: 1000323, nome: 'Pedra de Éter', qtd: 15 },
      { itemId: 1000321, nome: 'Âmbar', qtd: 1 },
    ],
  },
};

/** ATQ/ATQM ganho por nível de refino, conforme o grau do item. */
export const GRADE_ATK_PER_REFINE: Record<Grade, number> = {
  none: 8.0,
  D: 8.8,
  C: 10.4,
  B: 12.0,
  A: 16.0,
};

/** Degraus necessários para sair de `de` e chegar em `para`. */
export function stepsBetween(de: Grade, para: Grade): GradeStep[] {
  const from = GRADE_ORDER.indexOf(de);
  const to = GRADE_ORDER.indexOf(para);
  if (from === -1 || to === -1) throw new Error(`Grau inválido: ${de} -> ${para}`);
  if (to <= from) return [];
  return GRADE_STEPS.slice(from, to);
}
