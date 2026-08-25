// Sistema de Grau (Grade D / C / B / A).
// Fonte: https://browiki.org/wiki/Grau
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

/** Chave usada nas tabelas de chance geradas a partir do wiki. */
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
 * Refino mínimo a partir do qual faz sentido procurar uma tentativa de grau.
 *
 * O Browiki se contradiz: o texto da página afirma que o item precisa estar em
 * +11, mas a tabela de chances da MESMA página lista valores a partir do +9.
 * Como a fonte preferida não fecha sozinha, aqui vale abrir uma de terceiro
 * nível para desempatar: o Hazy Forest (https://hazyforest.com/equipment:grade)
 * traz a mesma tabela desde o +9 sem citar exigência nenhuma. Entre um texto e
 * duas tabelas que concordam entre si, seguimos as tabelas.
 *
 * Este valor é só o piso da busca: quem realmente decide é a tabela, que traz
 * `null` onde o degrau não é possível. Hoje isso significa D a partir do +9, C a
 * partir do +10 e B/A a partir do +11.
 *
 * TODO: confirmar in-game. Se o NPC recusar abaixo do +11, basta subir para 11.
 */
export const REFINO_MINIMO_GRAU = 9;

export const GRADE_STEPS: GradeStep[] = [
  {
    key: 'toD',
    de: 'none',
    para: 'D',
    normal: { zeny: 100_000, material: { ...AQUAMARINA, qtd: 1 } },
    seguro: { zeny: 500_000, material: { ...AQUAMARINA, qtd: 5 } },
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
