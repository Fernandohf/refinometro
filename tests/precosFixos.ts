import type { PriceTable } from '../src/engine/types';

/**
 * Preços congelados, para os testes do motor.
 *
 * Os testes NÃO usam `DEFAULT_PRICES`, e a razão é que ele deixou de ser uma
 * constante: `npm run precos` regrava `src/data/precos.json` com o mercado do
 * dia. Boa parte das asserções aqui é sobre a FORMA do plano — qual minério
 * entra, se o Bradium é fabricado ou comprado, onde a Bênção compensa —, e
 * várias dessas escolhas se decidem na margem. Basta o Oridecon subir 5% para
 * passar a compensar fabricá-lo a partir do minério, e um teste sobre a forma do
 * plano quebra por causa de uma venda em Prontera.
 *
 * Já aconteceu: com a primeira cotação real, o Oridecon foi de 20.000 para
 * 21.100 e a lista de compras trocou Oridecon por Minério de Oridecon. O motor
 * estava certo — `unitCost()` toma o menor entre mercado e receita, recursivamente
 * — e o teste, que fixava o id, estava errado em depender disso.
 *
 * Estes são os valores escritos à mão que serviram de padrão até o projeto
 * passar a ler o mercado. O que eles precisam ser é estáveis e plausíveis, não
 * atuais. Quem confere o arquivo de verdade é `tests/precos.test.ts`.
 */
export const PRECOS_FIXOS: PriceTable = {
  // Minérios básicos
  756: 4_000, // Minério de Oridecon
  757: 10_000, // Minério de Elunium
  984: 20_000, // Oridecon
  985: 50_000, // Elunium

  // Éter
  1000322: 68_000, // Pó de Éter

  // Especiais (JoyCoins)
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
