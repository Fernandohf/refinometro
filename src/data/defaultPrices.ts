import type { PriceTable } from '../engine/types';

import cotacao from './precos.json';

/**
 * Chutes de ordem de grandeza, para o que a cotação não alcança.
 *
 * Foram estes os preços de partida até o projeto passar a ler o mercado do
 * LATAM: escritos à mão, sem fonte, só para o campo não vir vazio. Hoje são a
 * reserva — valem para o item que ninguém negociou no período, ou cuja média o
 * `npm run precos` recusou por instabilidade. Ver `DEFAULT_PRICES`.
 */
const CHUTES: PriceTable = {
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

/** Uma linha de `precos.json`: id, zeny, data da cotação e transações na janela. */
type LinhaCotada = [itemId: number, zeny: number, cotadoEm: string, transacoes: number];

/**
 * Quando os preços foram lidos do mercado, e de onde.
 *
 * O rodapé credita isto. `geradoEm` é a data da última execução do script;
 * `cotadoEm`, por item, pode ser mais antiga — item que ninguém negociou nesta
 * semana mantém a cotação boa da semana passada em vez de sumir.
 */
export const COTACAO: {
  fonte: string;
  servidor: string;
  janela: string;
  geradoEm: string;
  total: number;
} = {
  fonte: cotacao._fonte,
  servidor: cotacao._servidor,
  janela: cotacao._janela,
  geradoEm: cotacao._geradoEm,
  total: cotacao.precos.length,
};

/**
 * Preços de partida, em zeny.
 *
 * NÃO são preços oficiais nem pretendem ser: são o que as lojas de jogador de UM
 * servidor cobraram numa janela de tempo, e a calculadora continua esperando que
 * você ajuste para o preço que está realmente vendo. Trocar um deles não é
 * corrigir um erro do projeto — é a operação normal.
 *
 * A cotação vem de `precos.json`, gerado por `npm run precos` a partir do
 * histórico de transações do site do LATAM. O que a conferência entre as duas
 * janelas recusar não entra lá, e cai para o `CHUTES` acima — sem cotação
 * confiável, um chute de ordem de grandeza é mais honesto que a média de 30 dias
 * do site, que uma venda solta consegue multiplicar por 50.
 *
 * Item que não aparece em lugar nenhum fica sem preço, de propósito: os
 * fabricáveis no NPC (Bradium, Carnium, Eteridecon...) são cotados pela receita,
 * e o motor já escolhe sozinho entre comprar pronto e fabricar.
 */
export const DEFAULT_PRICES: PriceTable = {
  ...CHUTES,
  ...Object.fromEntries((cotacao.precos as LinhaCotada[]).map(([id, zeny]) => [id, zeny])),
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
