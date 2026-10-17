import cotacao from './precos.json';

/**
 * Transações que sustentaram cada cotação de `precos.json`, por id de item.
 *
 * É o giro do item no mercado, e não muda com o preço que a pessoa digita: um
 * Topázio de Éter com 25 vendas no mês continua difícil de achar em quantidade
 * por mais barato que alguém diga tê-lo visto. O motor usa isto para preferir
 * fabricar o que quase não se vende pronto (ver `decidir`, em `pricing.ts`).
 *
 * Fica fora de `defaultPrices.ts` porque o motor de preços entra no build das
 * páginas estáticas, e lá não cabem os atalhos que aquele arquivo arrasta.
 */
export const GIRO: Record<number, number> = Object.fromEntries(
  (cotacao.precos as [number, number, string, number, string][]).map(([id, , , transacoes]) => [
    id,
    transacoes,
  ]),
);
