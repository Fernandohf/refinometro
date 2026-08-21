import type { PriceTable } from '../engine/types';

/**
 * Preços de partida, em zeny.
 *
 * NÃO são preços oficiais: o Browiki documenta as chances e as receitas de NPC,
 * mas o valor de mercado dos minérios varia por servidor e por semana. Estes
 * números são um chute razoável para o campo já vir preenchido — a calculadora
 * espera que o jogador ajuste para o preço que ele realmente está vendo.
 *
 * Itens fabricáveis no NPC (Bradium, Carnium, Eteridecon...) ficam em 0 de
 * propósito: sem preço de mercado informado, o motor os cota pela receita.
 */
export const DEFAULT_PRICES: PriceTable = {
  // Minérios básicos
  756: 4_000, // Minério de Oridecon
  757: 10_000, // Minério de Elunium
  984: 20_000, // Oridecon
  985: 50_000, // Elunium

  // Éter
  1000322: 68_000, // Pó de Éter

  // Especiais (JoyCoins — preço é de revenda entre jogadores)
  7619: 2_500_000, // Elunium Enriquecido
  7620: 1_500_000, // Oridecon Enriquecido
  6240: 1_250_000, // Oridecon Perfeito
  6241: 2_300_000, // Elunium Perfeito
  6225: 1_250_000, // Carnium Perfeito
  6226: 1_200_000, // Bradium Perfeito

  // Proteção
  6635: 3_500_000, // Bênção do Ferreiro

  // Gemas usadas nos materiais de Grau
  719: 6_000, // Ametista
  720: 4_000, // Aquamarina
  728: 16_000, // Topázio
  1000321: 50_000, // Âmbar
};

/**
 * Campos de preço do formulário, agrupados.
 *
 * Deixar em branco não quebra o cálculo: itens com receita de NPC são cotados
 * pela receita. Itens sem receita e sem preço simplesmente saem das estratégias
 * possíveis.
 */
export const PRICE_FIELDS: { grupo: string; itens: { itemId: number; nome: string }[] }[] = [
  {
    grupo: 'Minérios básicos',
    itens: [
      { itemId: 756, nome: 'Minério de Oridecon' },
      { itemId: 757, nome: 'Minério de Elunium' },
      { itemId: 984, nome: 'Oridecon' },
      { itemId: 985, nome: 'Elunium' },
      { itemId: 6224, nome: 'Bradium' },
      { itemId: 6223, nome: 'Carnium' },
    ],
  },
  {
    grupo: 'Éter (Arma nv5 / Armadura nv2)',
    itens: [
      { itemId: 1000322, nome: 'Pó de Éter' },
      { itemId: 1000332, nome: 'Eteridecon' },
      { itemId: 1000331, nome: 'Eterium' },
      { itemId: 1000368, nome: 'Bradium de Éter' },
      { itemId: 1000370, nome: 'Carnium de Éter' },
    ],
  },
  {
    // Todos têm receita de NPC, e por isso saem cotados mesmo em branco: o
    // Eterium Enriquecido, por exemplo, vale um Elunium Enriquecido mais 2 Pó
    // de Éter mais o balcão. Os campos existem para quem acha esses minérios
    // prontos, mais baratos, na loja de outro jogador.
    grupo: 'Éter especiais (fabricáveis)',
    itens: [
      { itemId: 1000334, nome: 'Eteridecon Enriquecido' },
      { itemId: 1000333, nome: 'Eterium Enriquecido' },
      { itemId: 1000336, nome: 'Eteridecon Perfeito' },
      { itemId: 1000335, nome: 'Eterium Perfeito' },
      { itemId: 1000369, nome: 'Bradium de Éter Perfeito' },
      { itemId: 1000371, nome: 'Carnium de Éter Perfeito' },
    ],
  },
  {
    grupo: 'Especiais (JoyCoins)',
    itens: [
      { itemId: 7620, nome: 'Oridecon Enriquecido' },
      { itemId: 7619, nome: 'Elunium Enriquecido' },
      { itemId: 6240, nome: 'Oridecon Perfeito' },
      { itemId: 6241, nome: 'Elunium Perfeito' },
      { itemId: 6226, nome: 'Bradium Perfeito' },
      { itemId: 6225, nome: 'Carnium Perfeito' },
    ],
  },
  {
    grupo: 'Proteção',
    itens: [{ itemId: 6635, nome: 'Bênção do Ferreiro' }],
  },
  {
    grupo: 'Materiais de Grau',
    itens: [
      { itemId: 720, nome: 'Aquamarina' },
      { itemId: 728, nome: 'Topázio' },
      { itemId: 719, nome: 'Ametista' },
      { itemId: 1000321, nome: 'Âmbar' },
      { itemId: 1000323, nome: 'Pedra de Éter' },
      { itemId: 1000337, nome: 'Bênção de Éter' },
      { itemId: 1000325, nome: 'Aquamarina de Éter' },
      { itemId: 1000326, nome: 'Topázio de Éter' },
      { itemId: 1000327, nome: 'Ametista de Éter' },
      { itemId: 1000328, nome: 'Âmbar de Éter' },
    ],
  },
];
