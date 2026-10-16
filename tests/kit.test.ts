import { describe, expect, it } from 'vitest';

import { PRECOS_FIXOS } from './precosFixos';
import { avaliarEstoque, emMateriais } from '../src/engine/estoque';
import { campanhaEmMinerios, estoqueDoKit, faltaParaOKit, montarKit } from '../src/engine/kit';
import { calcular } from '../src/engine/plan';
import type { CalcInput } from '../src/engine/types';

const input = (over: Partial<CalcInput> = {}): CalcInput => ({
  kind: 'w4',
  precoItem: 30_000_000,
  refinoAtual: 0,
  refinoAlvo: 10,
  grauAtual: 'none',
  grauAlvo: 'none',
  evento: false,
  precos: PRECOS_FIXOS,
  usarBencaoFerreiro: true,
  usarMineriosEspeciais: true,
  perdaAceitavel: true,
  itemId: null,
  usarAtalhos: false,
  ...over,
});

const plano = (over: Partial<CalcInput> = {}) =>
  calcular(input(over), { execucoes: 5_000, tempoMs: 3_000 });

describe('o kit de quem junta tudo antes', () => {
  it('fecha pelo menos a fração pedida das campanhas', () => {
    const p = plano();
    const c = campanhaEmMinerios(p)!;
    for (const chance of [0.5, 0.75, 0.9, 0.95, 0.99]) {
      expect(montarKit(p, c, chance).chance!).toBeGreaterThanOrEqual(chance);
    }
  });

  it('comprado, nunca sai mais barato que o custo total em zeny, no mesmo nível', () => {
    // É a razão de a página mostrar os dois: toda campanha que o kit fecha
    // custa no máximo o valor dele, então o kit que fecha 90% delas vale pelo
    // menos o percentil 90 do custo. Se este teste falhar, um dos dois números
    // do topo está errado.
    for (const over of [{}, { kind: 'w5' as const, refinoAlvo: 11, grauAlvo: 'C' as const }]) {
      const p = plano(over);
      const c = campanhaEmMinerios(p)!;
      for (const [chance, chave] of [
        [0.5, 'p50'],
        [0.9, 'p90'],
        [0.99, 'p99'],
      ] as const) {
        expect(montarKit(p, c, chance).valor).toBeGreaterThanOrEqual(p.simulacao!.custo[chave]);
      }
    }
  });

  it('cresce com o nível de segurança', () => {
    const p = plano();
    const c = campanhaEmMinerios(p)!;
    const menor = montarKit(p, c, 0.5);
    const maior = montarKit(p, c, 0.95);
    expect(maior.valor).toBeGreaterThanOrEqual(menor.valor);
    for (const [id, q] of Object.entries(menor.itens)) {
      expect(maior.itens[Number(id)] ?? 0).toBeGreaterThanOrEqual(q);
    }
  });

  it('conta em minério inteiro, que é a moeda da lista de compras', () => {
    // A lista abre a receita embaixo de cada linha; o kit precisa estar no
    // mesmo nível, ou os nomes do cartão do topo não apareceriam na lista.
    const p = plano();
    const kit = montarKit(p, campanhaEmMinerios(p), 0.9);
    const consumidos = Object.keys(p.recursos.itens);
    expect(Object.keys(kit.itens).length).toBeGreaterThan(0);
    for (const id of Object.keys(kit.itens)) expect(consumidos).toContain(id);
  });

  it('desmontado, fecha no simulador de estoque pelo menos o que fecha inteiro', () => {
    // A aba "O que eu tenho" abre com este estoque. Quem tem os insumos do kit
    // fabrica o kit, então a chance de lá não pode ficar abaixo da daqui.
    const p = plano({ kind: 'w5', refinoAlvo: 11, grauAlvo: 'C' });
    const kit = montarKit(p, campanhaEmMinerios(p), 0.9);
    const desmontada = emMateriais(p.simulacao!.amostras, p.input.precos, p.input.precoItem);
    const v = avaliarEstoque(desmontada, estoqueDoKit(kit, p.input.precos));
    expect(v.chance).toBeGreaterThanOrEqual(kit.chance!);
  });

  it('sem simulação, é a média — e não promete fração nenhuma', () => {
    const p = plano();
    const kit = montarKit(p, null, 0.9);
    expect(kit.chance).toBeNull();
    for (const [id, media] of Object.entries(p.recursos.itens)) {
      if (media > 0) expect(kit.itens[Number(id)]).toBe(Math.ceil(media));
    }
  });

  it('o que falta para o kit devolve a chance ao nível escolhido', () => {
    // A aba de estoque diz "falta comprar X z". Comprar exatamente isso tem de
    // bastar: a promessa da tela é a chance do nível, não "um pouco mais".
    const p = plano({ kind: 'w5', refinoAlvo: 11, grauAlvo: 'C' });
    const kit = montarKit(p, campanhaEmMinerios(p), 0.9);
    const c = emMateriais(p.simulacao!.amostras, p.input.precos, p.input.precoItem);
    const cheio = estoqueDoKit(kit, p.input.precos);
    const metade = {
      zeny: Math.floor(cheio.zeny / 2),
      copias: 1,
      itens: Object.fromEntries(Object.entries(cheio.itens).map(([id, q]) => [id, Math.floor(q / 2)])),
    };
    expect(avaliarEstoque(c, metade).chance).toBeLessThan(0.9);

    const falta = faltaParaOKit(cheio, metade, c);
    expect(falta.valor).toBeGreaterThan(0);
    const comprado = {
      zeny: metade.zeny + falta.zeny,
      copias: metade.copias + falta.copias,
      itens: { ...metade.itens },
    };
    for (const l of falta.itens) comprado.itens[l.itemId] = (comprado.itens[l.itemId] ?? 0) + l.qtd;
    expect(avaliarEstoque(c, comprado).chance).toBeGreaterThanOrEqual(0.9);

    // E quem já tem o kit não tem nada a comprar.
    expect(faltaParaOKit(cheio, cheio, c).valor).toBe(0);
  });
});
