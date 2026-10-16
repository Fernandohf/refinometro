import { describe, expect, it } from 'vitest';

import { PRECOS_FIXOS } from './precosFixos';
import {
  avaliarEstoque,
  chanceDoEstoque,
  emMateriais,
  estoqueRecomendado,
  estoquesMaisBaratos,
} from '../src/engine/estoque';
import {
  balcaoDoKit,
  campanhaEmMinerios,
  estoqueDoKit,
  faltaParaOKit,
  montarKit,
  montarKits,
} from '../src/engine/kit';
import { listaDeCompras } from '../src/engine/pricing';
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

  it('cresce com o nível de segurança, linha a linha', () => {
    // Subir a segurança e ver um minério diminuir seria ler o kit como erro.
    // O descasque guloso, rodado nível a nível, chegou a fazer isso (361 → 359
    // Eterium do 90% para o 95% num a2 +11 Grau A); um descasque só, anotado
    // de passagem, não consegue.
    const niveis = [0.5, 0.75, 0.9, 0.95, 0.99];
    for (const over of [{}, { kind: 'a2' as const, refinoAlvo: 11, grauAlvo: 'A' as const }]) {
      const p = plano(over);
      const kits = montarKits(p, campanhaEmMinerios(p), niveis);
      for (let j = 1; j < kits.length; j++) {
        const menor = kits[j - 1]!;
        const maior = kits[j]!;
        expect(maior.valor).toBeGreaterThanOrEqual(menor.valor);
        expect(maior.taxas).toBeGreaterThanOrEqual(menor.taxas);
        expect(maior.reposicoes).toBeGreaterThanOrEqual(menor.reposicoes);
        for (const [id, q] of Object.entries(menor.itens)) {
          expect(maior.itens[Number(id)] ?? 0).toBeGreaterThanOrEqual(q);
        }
      }
    }
  });

  it('nunca sai mais caro que o quantil comum, e com quebra sai bem mais barato', () => {
    // O quantil comum sobe a Bênção de 2 mi no mesmo passo do Oridecon de 10
    // mil. O descasque põe a folga onde ela é barata, e o kit fica com o mais
    // barato dos dois — então ele só pode empatar ou ganhar.
    const p = plano({ refinoAlvo: 12, precoItem: 1_000_000 });
    const c = campanhaEmMinerios(p)!;
    const valorComum = (chance: number) => {
      const e = estoqueRecomendado(c, chance);
      const lista = listaDeCompras(
        Object.fromEntries(Object.entries(e.itens).filter(([, q]) => q > 0)),
        p.input.precos,
      );
      return lista.total + (e.copias - 1) * p.input.precoItem + e.zeny;
    };
    for (const chance of [0.5, 0.9, 0.99]) {
      const kit = montarKit(p, c, chance);
      expect(kit.chance!).toBeGreaterThanOrEqual(chance);
      expect(kit.valor).toBeLessThanOrEqual(valorComum(chance));
    }
    expect(montarKit(p, c, 0.9).valor).toBeLessThan(valorComum(0.9) * 0.95);
  });

  it('o descasque sozinho fecha a fração pedida em cada nível', () => {
    const p = plano({ kind: 'w5', refinoAlvo: 11, grauAlvo: 'C' });
    const c = campanhaEmMinerios(p)!;
    const niveis = [0.99, 0.5, 0.9];
    estoquesMaisBaratos(c, niveis).forEach((e, j) => {
      expect(chanceDoEstoque(c, e)).toBeGreaterThanOrEqual(niveis[j]!);
    });
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

  it('o zeny do estoque é o das taxas mais o balcão de fabricar o kit', () => {
    // O "o que ter em mãos" mostra só as taxas; a aba de estoque, que pede a
    // matéria-prima, mostra mais. A diferença tem de ser exatamente o balcão
    // que as duas telas citam — senão a explicação de uma para a outra mente.
    // Grau A em Armadura nv2: centenas de Pedras de Éter, cada uma com balcão.
    const p = plano({ kind: 'a2', precoItem: 5_000_000, refinoAlvo: 11, grauAlvo: 'A' });
    const kit = montarKit(p, campanhaEmMinerios(p), 0.5);
    const balcao = balcaoDoKit(kit, p.input.precos);
    expect(balcao.total).toBeGreaterThan(0);
    expect(estoqueDoKit(kit, p.input.precos).zeny).toBe(Math.ceil(kit.taxas + balcao.total));
    expect(balcao.linhas.reduce((s, l) => s + l.zeny, 0)).toBeCloseTo(balcao.total, 0);
    for (let i = 1; i < balcao.linhas.length; i++) {
      expect(balcao.linhas[i - 1]!.zeny).toBeGreaterThanOrEqual(balcao.linhas[i]!.zeny);
    }
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
