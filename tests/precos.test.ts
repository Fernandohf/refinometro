import { describe, expect, it } from 'vitest';

import { COTACAO, DEFAULT_PRICES, PRICE_FIELDS } from '../src/data/defaultPrices';
import cotacao from '../src/data/precos.json';

// `src/data/precos.json` é gerado por `npm run precos` e regravado sempre que
// alguém roda o script. Os testes do motor usam preços congelados justamente
// para não depender dele (ver `tests/precosFixos.ts`); é aqui que o arquivo de
// verdade responde por si.

const precos = cotacao.precos as [number, number, string, number, string][];
const idsConhecidos = new Set(PRICE_FIELDS.flatMap((g) => g.itens.map((i) => i.itemId)));

describe('cotação do mercado', () => {
  it('cota preço positivo para item que a interface pergunta', () => {
    for (const [itemId, zeny] of precos) {
      expect(idsConhecidos, `item ${itemId} não é um campo de preço da interface`).toContain(itemId);
      expect(zeny, `item ${itemId}`).toBeGreaterThan(0);
      expect(Number.isFinite(zeny)).toBe(true);
    }
  });

  it('não repete item', () => {
    const ids = precos.map(([id]) => id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('data em ISO, e nenhuma no futuro', () => {
    const hoje = new Date().toISOString().slice(0, 10);
    expect(COTACAO.geradoEm).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(COTACAO.geradoEm <= hoje).toBe(true);
    for (const [itemId, , cotadoEm] of precos) {
      expect(cotadoEm, `item ${itemId}`).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      // A data de cada item pode ser mais antiga que a da execução — item que
      // ninguém negociou nesta semana mantém a cotação boa da semana passada.
      // Mais NOVA que a execução, não: isso seria linha vinda de outro lugar.
      expect(cotadoEm <= COTACAO.geradoEm, `item ${itemId}`).toBe(true);
    }
  });

  it('a cotação vence o chute escrito à mão', () => {
    // O ponto de `DEFAULT_PRICES` é essa precedência. Se a mesclagem inverter, o
    // arquivo continua sendo lido e nada estoura — os preços é que voltam a ser
    // os de 2026 para sempre.
    for (const [itemId, zeny] of precos) expect(DEFAULT_PRICES[itemId]).toBe(zeny);
  });

  it('mantém o chute para o que a cotação não alcançou', () => {
    // Bênção do Ferreiro e Oridecon estão sempre no mercado; o que este teste
    // protege é o caso oposto, o item recusado ou não negociado, que precisa
    // continuar com um valor em vez de sumir do formulário.
    const cotados = new Set(precos.map(([id]) => id));
    const semCotacao = [...idsConhecidos].filter((id) => !cotados.has(id));
    for (const id of semCotacao) {
      const v = DEFAULT_PRICES[id];
      // Ou tem chute, ou fica sem preço de propósito (fabricável no NPC, cotado
      // pela receita). O que não pode é vir zero ou negativo.
      if (v !== undefined) expect(v, `item ${id}`).toBeGreaterThan(0);
    }
  });

  it('diz de onde cada preço veio', () => {
    // A procedência não é enfeite: a mediana vem de uma Server Action interna e
    // frágil, e é a coluna que permite saber, olhando o arquivo, quais preços
    // dependem dela — sem reexecutar o script. A média do dia diz outra coisa,
    // igualmente útil de saber sem reexecutar nada: aquele preço é de hoje
    // porque o material estava andando, e envelhece mais rápido que os outros.
    for (const [itemId, , , , origem] of precos) {
      expect(['janelas', 'diaria', 'mediana'], `item ${itemId}`).toContain(origem);
    }
  });

  it('só cota pela média do dia o que tem giro para isso', () => {
    // O piso é o mesmo que separa cotação de anedota nas outras janelas (mil
    // transações, `LIQUIDEZ_MINIMA`). Sem ele a regra publicaria a média de um
    // dia de meia dúzia de vendas, que é o erro que o script inteiro existe
    // para não cometer — só que com data de hoje, o que o disfarça.
    for (const [itemId, , , volume, origem] of precos) {
      if (origem === 'diaria') expect(volume, `item ${itemId}`).toBeGreaterThanOrEqual(1_000);
    }
  });

  it('conta volume para toda cotação', () => {
    for (const [itemId, , , volume] of precos) {
      expect(volume, `item ${itemId}`).toBeGreaterThan(0);
    }
  });

  it('credita a fonte e o servidor', () => {
    expect(COTACAO.fonte).toMatch(/^https:\/\/ro\.gnjoylatam\.com\//);
    expect(COTACAO.servidor).toMatch(/^[A-Z]+$/);
    expect(COTACAO.total).toBe(precos.length);
  });
});
