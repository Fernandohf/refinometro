import { describe, expect, it } from 'vitest';

import { PRECOS_FIXOS } from './precosFixos';
import {
  blessingCost,
  BLESSING_ITEM_ID,
  ORE_BY_ID,
  ORES,
  oresFor,
  TAXA_REFINO,
  taxaDaTentativa,
} from '../src/data/ores';
import { REFINO_MINIMO_GRAU, stepsBetween } from '../src/data/grade';
import { gradeChanceOf, solveGradeCampaign } from '../src/engine/grade';
import { arvoreDeCompras, listaDeCompras, unitCost } from '../src/engine/pricing';
import {
  actionsAt,
  chanceOf,
  maxRefine,
  pisoSeguro,
  riscoPorAlvo,
  RefineImpossivel,
  safeLimit,
  solveRefine,
  type RefineOptions,
} from '../src/engine/refine';
import { chanceAte, percentis, simulateCampaign } from '../src/engine/simulate';
import {
  avaliarEstoque,
  chanceDoEstoque,
  emMateriais,
  estoqueRecomendado,
  ondeAcaba,
  zenyParaChance,
} from '../src/engine/estoque';
import { calcular, orcamentoDe } from '../src/engine/plan';
import type { CalcInput } from '../src/engine/types';

const opts = (over: Partial<RefineOptions> = {}): RefineOptions => ({
  kind: 'w4',
  precos: PRECOS_FIXOS,
  evento: false,
  usarBencaoFerreiro: true,
  usarMineriosEspeciais: true,
  perdaAceitavel: true,
  precoItem: 10_000_000,
  refinoReposicao: 0,
  ...over,
});

const input = (over: Partial<CalcInput> = {}): CalcInput => ({
  kind: 'w4',
  precoItem: 10_000_000,
  refinoAtual: 0,
  refinoAlvo: 10,
  grauAtual: 'none',
  grauAlvo: 'none',
  evento: false,
  precos: PRECOS_FIXOS,
  usarBencaoFerreiro: true,
  usarMineriosEspeciais: true,
  perdaAceitavel: true,
  ...over,
});

describe('tabelas oficiais de chance', () => {
  it('reproduz os limites seguros documentados', () => {
    // https://ro.gnjoyamericas.com/pt/news/probability/2 — a faixa de 100%
    expect(safeLimit('w1')).toBe(7);
    expect(safeLimit('w2')).toBe(6);
    expect(safeLimit('w3')).toBe(5);
    expect(safeLimit('w4')).toBe(4);
    expect(safeLimit('a1')).toBe(4);
    expect(safeLimit('w5')).toBe(3);
    expect(safeLimit('a2')).toBe(3);
  });

  it('limita Equipamentos Sombrios ao +10', () => {
    expect(maxRefine('shadowW')).toBe(10);
    expect(maxRefine('shadowA')).toBe(10);
    expect(maxRefine('w4')).toBe(20);
    expect(maxRefine('a2')).toBe(20);
  });

  it('dá chance maior durante o evento, nunca menor', () => {
    for (const kind of ['w1', 'w2', 'w3', 'w4', 'w5', 'a1', 'a2'] as const) {
      for (let r = 1; r <= 20; r++) {
        for (const especial of [false, true]) {
          const fora = chanceOf(kind, r, especial, false);
          const dentro = chanceOf(kind, r, especial, true);
          if (fora === null || dentro === null) continue;
          expect(dentro, `${kind} +${r} especial=${especial}`).toBeGreaterThanOrEqual(fora);
        }
      }
    }
  });

  it('cobre toda a faixa +1..+20 com pelo menos um minério', () => {
    for (const kind of ['w1', 'w2', 'w3', 'w4', 'w5', 'a1', 'a2'] as const) {
      for (let de = 0; de < 20; de++) {
        expect(oresFor(kind, de).length, `${kind} +${de}`).toBeGreaterThan(0);
      }
    }
  });

  it('dá a cada sombrio o minério certo, e só ele', () => {
    // A Manopla Sombria refina com Oridecon; o Equipamento Sombrio, com Elunium. Antes de
    // separar as duas categorias, o motor oferecia os dois para qualquer sombrio
    // e escolhia pelo preço — o que dava a estratégia errada.
    const arma = oresFor('shadowW', 0).map((o) => o.id);
    const armadura = oresFor('shadowA', 0).map((o) => o.id);
    expect(arma).toContain('oridecon');
    expect(arma).not.toContain('elunium');
    expect(armadura).toContain('elunium');
    expect(armadura).not.toContain('oridecon');
  });

  it('cobre o sombrio até o +10, que é o teto dele', () => {
    for (const kind of ['shadowW', 'shadowA'] as const) {
      for (let de = 0; de < 10; de++) {
        expect(oresFor(kind, de).length, `${kind} +${de}`).toBeGreaterThan(0);
      }
    }
  });

  it('aplica a Bênção do Ferreiro só de +7 a +13', () => {
    expect(blessingCost('w4', 6)).toBeNull();
    expect(blessingCost('w4', 7)).toBe(1);
    expect(blessingCost('w4', 13)).toBe(22);
    expect(blessingCost('w4', 14)).toBeNull();
    expect(blessingCost('shadowW', 7)).toBeNull();
    expect(blessingCost('shadowA', 7)).toBeNull();
  });
});

describe('o que cada minério faz', () => {
  /**
   * A tabela conferida uma a uma na descrição LATAM do item (`npm run
   * descricoes`). Os dois efeitos são independentes, e o nome do minério não diz
   * qual ele tem: o Oridecon Enriquecido aumenta a chance e ainda destrói o item
   * na falha; o Oridecon Perfeito faz o contrário — só protege; e os de Éter
   * marcados "com maior chance" fazem os dois.
   */
  const EFEITOS: Record<string, { chanceAumentada: boolean; penalidade: string }> = {
    fracon: { chanceAumentada: false, penalidade: 'break' },
    emveretarcon: { chanceAumentada: false, penalidade: 'break' },
    oridecon: { chanceAumentada: false, penalidade: 'break' },
    bradium: { chanceAumentada: false, penalidade: 'down3' },
    eteridecon: { chanceAumentada: false, penalidade: 'down3' },
    'bradium-eter': { chanceAumentada: false, penalidade: 'break' },
    'oridecon-enriquecido': { chanceAumentada: true, penalidade: 'break' },
    'oridecon-perfeito': { chanceAumentada: false, penalidade: 'down1' },
    'bradium-perfeito': { chanceAumentada: false, penalidade: 'down1' },
    'eteridecon-enriquecido': { chanceAumentada: true, penalidade: 'down1' },
    'eteridecon-perfeito': { chanceAumentada: true, penalidade: 'break' },
    'bradium-eter-perfeito': { chanceAumentada: true, penalidade: 'break' },
    elunium: { chanceAumentada: false, penalidade: 'break' },
    carnium: { chanceAumentada: false, penalidade: 'down3' },
    eterium: { chanceAumentada: false, penalidade: 'down3' },
    'carnium-eter': { chanceAumentada: false, penalidade: 'break' },
    'elunium-enriquecido': { chanceAumentada: true, penalidade: 'break' },
    'elunium-perfeito': { chanceAumentada: false, penalidade: 'down1' },
    'carnium-perfeito': { chanceAumentada: false, penalidade: 'down1' },
    'eterium-enriquecido': { chanceAumentada: true, penalidade: 'down1' },
    'eterium-perfeito': { chanceAumentada: true, penalidade: 'break' },
    'carnium-eter-perfeito': { chanceAumentada: true, penalidade: 'break' },
  };

  it('separa aumentar a chance de proteger contra a quebra', () => {
    expect(ORES.map((o) => o.id).sort()).toEqual(Object.keys(EFEITOS).sort());
    for (const ore of ORES) {
      const esperado = EFEITOS[ore.id]!;
      expect(ore.chanceAumentada, `${ore.id}: chanceAumentada`).toBe(esperado.chanceAumentada);
      expect(ore.penalidade, `${ore.id}: penalidade`).toBe(esperado.penalidade);
    }
  });

  it('não confunde "é especial" com "aumenta a chance"', () => {
    // Ser especial é sobre acesso (JoyCoins / receita cara) e controla o que o
    // jogador destrava no formulário. Aumentar a chance é sobre efeito. Nenhum
    // dos quatro Perfeitos de Oridecon/Elunium/Bradium/Carnium aumenta chance
    // nenhuma — todos são especiais.
    for (const id of ['oridecon-perfeito', 'elunium-perfeito', 'bradium-perfeito', 'carnium-perfeito']) {
      const ore = ORE_BY_ID.get(id)!;
      expect(ore.especial, id).toBe(true);
      expect(ore.chanceAumentada, id).toBe(false);
    }

    // E o Enriquecido é o oposto: aumenta a chance e não protege de nada.
    for (const id of ['oridecon-enriquecido', 'elunium-enriquecido']) {
      const ore = ORE_BY_ID.get(id)!;
      expect(ore.chanceAumentada, id).toBe(true);
      expect(ore.penalidade, id).toBe('break');
    }
  });

  it('nunca paga por um Perfeito onde o minério comum dá a mesma coisa', () => {
    // O caso que motivou tudo isto: com Bênção, "Oridecon Perfeito" e "Oridecon"
    // têm a MESMA chance e o MESMO destino de falha — a proteção do Perfeito
    // vira letra morta e só sobra o preço dele. A poda de dominadas garante que
    // a versão cara nem chegue ao otimizador.
    for (let de = 7; de <= 9; de++) {
      const acoes = actionsAt(de, opts({ kind: 'w4' })).filter((a) => a.bencaos > 0);
      const perfeito = acoes.filter((a) => a.ore.id === 'oridecon-perfeito');
      expect(perfeito, `+${de}`).toEqual([]);
    }
  });

  it('registra onde discordar da tabela oficial muda número', () => {
    // A tabela oficial joga todo minério especial na coluna alta. Onde o motor
    // segue a descrição do item e diz "chance comum", as duas leituras podem dar
    // números diferentes — e é bom saber exatamente onde, porque é aí que a
    // divergência vale zeny e o plano precisa avisar.
    const divergem = new Set<string>();
    for (const ore of ORES) {
      if (!ore.especial || ore.chanceAumentada) continue;
      for (const kind of ore.kinds) {
        for (let de = ore.refinaDe[0]; de <= ore.refinaDe[1]; de++) {
          for (const evento of [false, true]) {
            if (chanceOf(kind, de + 1, true, evento) !== chanceOf(kind, de + 1, false, evento)) {
              divergem.add(`${ore.id} ${kind}`);
            }
          }
        }
      }
    }

    // Os Perfeitos de Oridecon e Elunium pegam a faixa +8..+10, em que as duas
    // colunas são bem diferentes (20% x 40% na tentativa do +8, numa arma nv4).
    // Os de Bradium e Carnium ficam do +11 para cima, onde a tabela oficial
    // repete a coluna comum na especial — lá a divergência não custa nada.
    expect([...divergem].sort()).toEqual([
      'elunium-perfeito a1',
      'elunium-perfeito shadowA',
      'oridecon-perfeito shadowW',
      'oridecon-perfeito w1',
      'oridecon-perfeito w2',
      'oridecon-perfeito w3',
      'oridecon-perfeito w4',
    ]);
  });

  it('dá ao Perfeito a chance comum, como o jogo confirmou', () => {
    // A tabela oficial agrupa todo especial na coluna alta; a descrição do item só
    // promete proteção. Conferido in-game em 2026-09-04: vale a descrição, e só os
    // Enriquecidos aumentam a chance. O motor já lia assim, então o que mudou foi o
    // aviso de "as fontes discordam", que saiu junto com a dúvida.
    const acoes = actionsAt(7, opts({ kind: 'w4', usarBencaoFerreiro: false }));
    const perfeito = acoes.find((a) => a.ore.id === 'oridecon-perfeito')!;
    expect(perfeito.chance).toBe(chanceOf('w4', 8, false, false));

    const r = calcular(
      input({ kind: 'w4', refinoAtual: 7, refinoAlvo: 9, usarBencaoFerreiro: false }),
      { tempoMs: 0 },
    );
    expect(r.fases.flatMap((f) => f.trechos).some((t) => t.minerioItemId === 6240)).toBe(true);
    expect(r.avisos.some((a) => a.texto.includes('as fontes discordam'))).toBe(false);
  });

  it('descarta a ação cara quando outra faz exatamente o mesmo', () => {
    // Mesma chance e mesmo destino de falha = mesma linha da matriz de
    // transição. Duas dessas na lista só serviriam para o plano poder exibir a
    // mais cara num empate — foi o que fez "Oridecon Perfeito + Bênção"
    // aparecer ao lado de um Enriquecido que dava a mesma coisa.
    for (const kind of ['w1', 'w2', 'w3', 'w4', 'w5', 'a1', 'a2'] as const) {
      for (let de = 0; de < 20; de++) {
        const chaves = actionsAt(de, opts({ kind })).map(
          (a) => `${a.chance}|${a.falhaVaiPara ?? 'quebra'}`,
        );
        expect(new Set(chaves).size, `${kind} +${de}`).toBe(chaves.length);
      }
    }
  });

  it('explica a Bênção que acompanha um minério que já protege sozinho', () => {
    // Numa Arma nv4 até o +11 o plano usa Oridecon Perfeito com Bênção: a
    // proteção do minério fica ociosa e só a chance dele é aproveitada. É
    // legítimo, mas parece erro de quem lê — e por isso vira aviso.
    const r = calcular(input({ refinoAlvo: 11, precoItem: 30_000_000 }), { tempoMs: 0 });
    const trechos = r.fases.flatMap((f) => f.trechos);

    const ociosos = trechos.filter((t) => t.bencaos > 0 && t.minerioProtege);
    expect(ociosos.length).toBeGreaterThan(0);
    expect(ociosos.every((t) => t.naFalha.includes('já não quebraria o item'))).toBe(true);
    expect(r.avisos.some((a) => a.texto.includes('já não destruiriam o equipamento'))).toBe(true);
  });
});

describe('preços', () => {
  // Tabela fixa: estes testes checam a lógica de cotação, não os preços de
  // partida — que mudam conforme o mercado do servidor.
  const P = { 756: 40_000, 984: 250_000 };

  it('escolhe a via mais barata entre mercado e receita do NPC', () => {
    // Oridecon: 250k no mercado, ou 5x Minério de Oridecon (5 x 40k = 200k) no NPC.
    expect(unitCost(984, P)).toBe(200_000);
  });

  it('prefere o mercado quando ele é mais barato que fabricar', () => {
    expect(unitCost(984, { ...P, 984: 150_000 })).toBe(150_000);
  });

  it('cota itens fabricáveis mesmo sem preço de mercado', () => {
    // Bradium: 50k + 3 Oridecon (3 x 200k), sem preço próprio informado.
    expect(unitCost(6224, P)).toBe(50_000 + 3 * 200_000);
  });

  it('devolve Infinity quando não há preço nem receita', () => {
    expect(unitCost(984, {})).toBe(Infinity);
  });
});

describe('lista de compras', () => {
  // Elunium a 50k, Pó de Éter a 68k: o Eterium (10k no balcão + 1 de cada) sai
  // por 128k fabricado, e é assim que o motor o cota.
  const P = { 985: 50_000, 1000322: 68_000 };
  const ETERIUM = 1000331;

  it('desmonta o que vale a pena fabricar até o que se compra de verdade', () => {
    const lista = listaDeCompras({ [ETERIUM]: 10 }, P);
    expect(lista.compras.map((l) => l.itemId).sort((a, b) => a - b)).toEqual([985, 1000322]);
    expect(lista.compras.every((l) => l.qtd === 10)).toBe(true);
    expect(lista.zenyNpc).toBe(10 * 10_000);
  });

  it('fecha com o custo unitário que o motor usa na conta', () => {
    // Se a lista e a cotação divergissem, o orçamento da tela não bateria com
    // o que a pessoa gasta seguindo a própria lista.
    expect(listaDeCompras({ [ETERIUM]: 10 }, P).total).toBe(10 * unitCost(ETERIUM, P));
  });

  it('deixa no mercado o que sai mais barato pronto', () => {
    const barato = { ...P, [ETERIUM]: 1_000 };
    const lista = listaDeCompras({ [ETERIUM]: 10 }, barato);
    expect(lista.compras).toEqual([{ itemId: ETERIUM, qtd: 10, custoUnitario: 1_000, total: 10_000 }]);
    expect(lista.zenyNpc).toBe(0);
  });

  it('soma o mesmo material vindo de receitas diferentes', () => {
    // Eterium e Eterium Enriquecido puxam Pó de Éter cada um: 1 e 2 por unidade.
    const lista = listaDeCompras({ [ETERIUM]: 3, 1000333: 2 }, { ...P, 7619: 2_500_000 });
    const po = lista.compras.find((l) => l.itemId === 1000322);
    expect(po?.qtd).toBe(3 * 1 + 2 * 2);
  });
});

describe('árvore de compras', () => {
  // Os mesmos preços da lista achatada: Eterium sai por 128k fabricado
  // (10k de balcão + 1 Elunium a 50k + 1 Pó de Éter a 68k) e não tem cotação
  // própria, então fabricar é a única via.
  const P = { 985: 50_000, 1000322: 68_000 };
  const ETERIUM = 1000331;

  it('soma o mesmo total da lista achatada', () => {
    // As duas leem a mesma decisão de `unitCost`. Se divergissem, o total da
    // tela deixaria de bater com o diagrama de custo, que lê a achatada.
    const itens = { [ETERIUM]: 10, 985: 3 };
    const arvore = arvoreDeCompras(itens, P);
    expect(arvore.reduce((s, l) => s + l.total, 0)).toBe(listaDeCompras(itens, P).total);
  });

  it('abre a receita embaixo do minério que vale a pena fabricar', () => {
    const [eterium] = arvoreDeCompras({ [ETERIUM]: 10 }, P);
    expect(eterium!.via).toBe('npc');
    expect(eterium!.fabricacao!.zenyBalcao).toBe(10 * 10_000);
    expect(eterium!.fabricacao!.insumos.map((i) => [i.itemId, i.qtd])).toEqual(
      expect.arrayContaining([
        [1000322, 10],
        [985, 10],
      ]),
    );
  });

  it('diz quanto fabricar economiza contra comprar pronto', () => {
    // Com o Eterium cotado a 200k, fabricar (128k) poupa 72k por unidade — e é
    // esse número, e não o custo, que decide se a viagem ao NPC se paga.
    const arvore = arvoreDeCompras({ [ETERIUM]: 10 }, { ...P, [ETERIUM]: 200_000 });
    const eterium = arvore.find((l) => l.itemId === ETERIUM)!;
    expect(eterium.via).toBe('npc');
    expect(eterium.economia).toBe(10 * (200_000 - 128_000));
  });

  it('diz quanto comprar pronto economiza contra fabricar', () => {
    // A mesma pergunta ao contrário: barato no mercado, a receita é que perde.
    const arvore = arvoreDeCompras({ [ETERIUM]: 10 }, { ...P, [ETERIUM]: 100_000 });
    const eterium = arvore.find((l) => l.itemId === ETERIUM)!;
    expect(eterium.via).toBe('mercado');
    expect(eterium.fabricacao).toBeNull();
    expect(eterium.economia).toBe(10 * (128_000 - 100_000));
  });

  it('não promete economia onde não há escolha', () => {
    // Ninguém vende Eterium: a economia é 0 porque não existe a outra via, e
    // não porque as duas empataram.
    const eterium = arvoreDeCompras({ [ETERIUM]: 10 }, P)[0]!;
    expect(eterium.precoMercado).toBeNull();
    expect(eterium.economia).toBe(0);
    // E o Elunium, que só se compra, também não finge ter alternativa.
    const elunium = arvoreDeCompras({ 985: 4 }, P)[0]!;
    expect(elunium.custoFabricado).toBeNull();
    expect(elunium.economia).toBe(0);
  });

  it('desce a decisão até o fim da receita', () => {
    // Elunium a partir de 5 Minérios de Elunium sai mais barato que os 50k
    // cotados: o insumo do Eterium precisa abrir de novo, ou a lista mandaria
    // comprar pronto o que o custo já cotou como fabricado.
    const arvore = arvoreDeCompras({ [ETERIUM]: 10 }, { ...P, 757: 1_000 });
    const elunium = arvore[0]!.fabricacao!.insumos.find((i) => i.itemId === 985)!;
    expect(elunium.via).toBe('npc');
    expect(elunium.fabricacao!.insumos).toEqual([
      expect.objectContaining({ itemId: 757, qtd: 50, total: 50_000 }),
    ]);
  });
});

describe('cópias do item-base', () => {
  it('conta a que você já tem mais uma para cada quebra', () => {
    const r = calcular(input({ refinoAlvo: 12, usarBencaoFerreiro: false }), { tempoMs: 150 });
    expect(r.itensQuebrados).toBeGreaterThan(0);
    expect(r.copiasItem).toBeCloseTo(1 + r.itensQuebrados, 9);
  });

  it('é só a sua quando nada quebra no caminho', () => {
    // w4 refina com 100% até o +4: não há como perder o item.
    const r = calcular(input({ refinoAlvo: 4 }), { tempoMs: 150 });
    expect(r.copiasItem).toBeCloseTo(1, 9);
    expect(r.simulacao!.quebras.p99).toBe(0);
  });
});

describe('refino abaixo do limite seguro', () => {
  it('custa o preço dos minérios mais a taxa, sem risco', () => {
    // w4 é 100% até o +4: quatro Oridecons, nada mais. Preço fixo aqui para o
    // teste não depender dos preços de partida.
    const precos = { 984: 200_000 };
    const plan = solveRefine(0, 4, opts({ kind: 'w4', precos }));
    expect(plan.custoEsperado).toBeCloseTo(4 * (200_000 + TAXA_REFINO.w4), 6);
    expect(plan.recursos.taxas).toBeCloseTo(4 * TAXA_REFINO.w4, 6);
    expect(plan.recursos.itensQuebrados).toBeCloseTo(0, 9);
    expect(plan.recursos.tentativas).toBeCloseTo(4, 9);
    expect(plan.politica.slice(0, 4).every((p) => p.acao.chance === 1)).toBe(true);
  });
});

describe('taxa do refinador', () => {
  it('cobra por categoria de item, com as nove conferidas no balcão', () => {
    // Levantadas uma a uma no NPC em 2026-09-04. O iROwiki, que servia de fonte
    // antes, errava sete das nove — nenhum valor dele sobreviveu.
    expect(TAXA_REFINO.w1).toBe(1_000);
    expect(TAXA_REFINO.w2).toBe(2_000);
    expect(TAXA_REFINO.w3).toBe(10_000);
    expect(TAXA_REFINO.w4).toBe(10_000);
    expect(TAXA_REFINO.w5).toBe(75_000);
    expect(TAXA_REFINO.a1).toBe(10_000);
    expect(TAXA_REFINO.a2).toBe(45_000);
    expect(TAXA_REFINO.shadowW).toBe(10_000);
    expect(TAXA_REFINO.shadowA).toBe(10_000);
  });

  it('isenta minério de Cash Shop nas armas nv1 a nv4, e só lá', () => {
    // A isenção existe e é assimétrica: Oridecon Enriquecido sai por 0z de taxa em
    // qualquer arma, e Elunium Enriquecido paga os 10k cheios em qualquer equipamento.
    // Não é o que o iROwiki descreve, é o que o NPC cobra.
    const oridecon = ORE_BY_ID.get('oridecon')!;
    const orideconEnriquecido = ORE_BY_ID.get('oridecon-enriquecido')!;
    const eluniumEnriquecido = ORE_BY_ID.get('elunium-enriquecido')!;
    const eterideconEnriquecido = ORE_BY_ID.get('eteridecon-enriquecido')!;

    expect(taxaDaTentativa('w1', orideconEnriquecido)).toBe(0);
    expect(taxaDaTentativa('w4', orideconEnriquecido)).toBe(0);
    expect(taxaDaTentativa('w4', oridecon)).toBe(TAXA_REFINO.w4);
    expect(taxaDaTentativa('a1', eluniumEnriquecido)).toBe(TAXA_REFINO.a1);
    // Os dois sombrios pagam a mesma taxa e usam a mesma coluna de chances, e mesmo
    // assim só a Manopla isenta: é o par que mostra que a linha é arma x equipamento.
    expect(taxaDaTentativa('shadowW', orideconEnriquecido)).toBe(0);
    expect(taxaDaTentativa('shadowA', eluniumEnriquecido)).toBe(TAXA_REFINO.shadowA);
    // Os Enriquecidos de Éter são especiais, mas vêm do NPC, não de JoyCoins: pagam.
    expect(taxaDaTentativa('w5', eterideconEnriquecido)).toBe(TAXA_REFINO.w5);
  });

  it('não isenta ninguém no Equipamento nv1', () => {
    const acoes = actionsAt(8, opts({ kind: 'a1', usarBencaoFerreiro: false }));
    const usados = acoes.map((a) => a.ore.id);
    expect(usados).toContain('elunium');
    expect(usados).toContain('elunium-enriquecido');
    expect(usados).toContain('elunium-perfeito');
    for (const acao of acoes) {
      expect(acao.taxa, acao.ore.id).toBe(TAXA_REFINO.a1);
    }
  });

  it('conta a taxa de refino por tentativa de verdade, não por tentativa média', () => {
    // Uma campanha que mistura minério isento e não isento não pode ter a taxa
    // calculada como `tentativas x valor fixo` — foi assim que ela nasceu, com
    // um campo único no formulário, e é o erro que a soma vinda do motor evita.
    const o = opts({ kind: 'w4', precoItem: 30_000_000 });
    const plan = solveRefine(0, 10, o);

    const isentas = plan.politica.slice(0, 10).filter((p) => p.acao.taxa === 0).length;
    expect(isentas).toBeGreaterThan(0); // a estratégia usa minério de Cash Shop
    expect(plan.recursos.taxas).toBeLessThan(plan.recursos.tentativas * TAXA_REFINO.w4);
    expect(plan.recursos.taxas).toBeGreaterThan(0);
  });

  it('entra no custo que a estratégia compara, não só no relatório', () => {
    // Se a taxa ficasse de fora de `custo`, o otimizador escolheria o minério
    // errado sempre que a diferença de preço fosse menor que a taxa.
    const precos = { 984: 100_000, 7620: 150_000, 6240: 150_000 };
    const acoes = actionsAt(7, opts({ kind: 'w4', precos, usarBencaoFerreiro: false }));

    const comum = acoes.find((a) => a.ore.id === 'oridecon')!;
    const cashShop = acoes.find((a) => a.ore.id === 'oridecon-enriquecido')!;

    expect(comum.custo).toBe(100_000 + TAXA_REFINO.w4);
    expect(cashShop.custo).toBe(150_000);

    // O Enriquecido custa 50k a mais no mercado, mas economiza os 10k de taxa: a
    // diferença real é 40k, e é essa que o otimizador precisa enxergar.
    expect(cashShop.custo - comum.custo).toBe(40_000);
  });
});

describe('cálculo exato x simulação', () => {
  // O custo esperado sai de uma cadeia de Markov resolvida por iteração de valor;
  // a simulação percorre a mesma cadeia por amostragem. São dois caminhos
  // independentes até o mesmo número, então divergir aqui significa bug real.
  const casos: { nome: string; de: number; para: number; o: Partial<RefineOptions> }[] = [
    { nome: 'w4 +0 → +10', de: 0, para: 10, o: { kind: 'w4' } },
    { nome: 'w4 +7 → +12', de: 7, para: 12, o: { kind: 'w4' } },
    { nome: 'a1 +0 → +9 sem especiais', de: 0, para: 9, o: { kind: 'a1', usarMineriosEspeciais: false } },
    { nome: 'w5 +0 → +11', de: 0, para: 11, o: { kind: 'w5' } },
    { nome: 'a2 +4 → +12 em evento', de: 4, para: 12, o: { kind: 'a2', evento: true } },
  ];

  for (const caso of casos) {
    it(`bate para ${caso.nome}`, () => {
      const o = opts(caso.o);
      const plan = solveRefine(caso.de, caso.para, o);
      const sim = simulateCampaign(
        [
          {
            tipo: "refino",
            rotulo: caso.nome,
            de: caso.de,
            para: caso.para,
            politica: plan.politica,
            tentativas: plan.recursos.tentativas,
            recursos: plan.recursos,
          },
        ],
        o,
        { execucoes: 60_000, seed: 12345 },
      );
      // 2% de folga cobre o erro de Monte Carlo numa distribuição de cauda longa.
      expect(sim.custoMedio).toBeGreaterThan(plan.custoEsperado * 0.94);
      expect(sim.custoMedio).toBeLessThan(plan.custoEsperado * 1.06);
      expect(sim.mediaQuebras).toBeGreaterThan(plan.recursos.itensQuebrados * 0.9 - 0.01);
      expect(sim.mediaQuebras).toBeLessThan(plan.recursos.itensQuebrados * 1.1 + 0.01);
    });
  }
});

describe('Bênção do Ferreiro na simulação', () => {
  // A Bênção é uma DECISÃO tomada nível a nível, não um item que a campanha
  // liga de uma vez: a simulação percorre a mesma política do cálculo exato e
  // só gasta Bênção onde ela foi escolhida. Se um dia a simulação passar a
  // proteger toda tentativa da faixa +7..+13, o custo cai calado e os percentis
  // saem otimistas — é esse regresso que estes testes pegam.
  const simular = (over: Partial<CalcInput>) =>
    calcular(input({ refinoAlvo: 12, ...over }), { execucoes: 20_000, tempoMs: 3_000 });

  const trechosDe = (r: ReturnType<typeof simular>) => r.fases.flatMap((f) => f.trechos);

  it('deixa níveis da faixa sem Bênção quando ela não compensa neles', () => {
    // Bênção cara o bastante para só valer no topo, onde a falha custa mais.
    const r = simular({ precos: { ...PRECOS_FIXOS, [BLESSING_ITEM_ID]: 100_000_000 } });
    const naFaixa = trechosDe(r).filter((t) => t.de >= 7 && t.de <= 13);
    expect(naFaixa.some((t) => t.bencaos > 0)).toBe(true);
    expect(naFaixa.some((t) => t.bencaos === 0)).toBe(true);
  });

  it('consome na amostragem a mesma quantidade que a política prevê', () => {
    const r = simular({ precos: { ...PRECOS_FIXOS, [BLESSING_ITEM_ID]: 100_000_000 } });
    const exato = r.recursos.itens[BLESSING_ITEM_ID]!;
    expect(exato).toBeGreaterThan(0);
    // Proteger toda a faixa custaria muito mais Bênção do que a política pede;
    // a folga de 10% é erro de Monte Carlo, não espaço para outra estratégia.
    expect(r.simulacao!.mediaItens[BLESSING_ITEM_ID]).toBeGreaterThan(exato * 0.9);
    expect(r.simulacao!.mediaItens[BLESSING_ITEM_ID]).toBeLessThan(exato * 1.1);
  });

  it('não gasta Bênção nenhuma quando a opção está desmarcada', () => {
    const r = simular({ usarBencaoFerreiro: false });
    expect(trechosDe(r).every((t) => t.bencaos === 0)).toBe(true);
    expect(r.recursos.itens[BLESSING_ITEM_ID]).toBeUndefined();
    expect(r.simulacao!.mediaItens[BLESSING_ITEM_ID]).toBeUndefined();
  });

  it('não gasta Bênção em Equipamento Sombrio, onde ela não funciona', () => {
    const r = simular({ kind: 'shadowW', refinoAlvo: 10 });
    expect(trechosDe(r).every((t) => t.bencaos === 0)).toBe(true);
    expect(r.simulacao!.mediaItens[BLESSING_ITEM_ID]).toBeUndefined();
  });

  it('bate material a material com o cálculo exato, inclusive nas fases de grau', () => {
    // A campanha de grau reconquista o refino a cada degrau, então é aqui que um
    // desencontro entre a política e o laço da simulação apareceria maior.
    const r = calcular(input({ kind: 'w5', refinoAlvo: 11, grauAlvo: 'A' }), {
      execucoes: 20_000,
      tempoMs: 3_000,
    });
    expect(r.recursos.itens[BLESSING_ITEM_ID]).toBeGreaterThan(0);
    for (const [id, exato] of Object.entries(r.recursos.itens)) {
      const amostrado = r.simulacao!.mediaItens[Number(id)] ?? 0;
      expect(amostrado, `item ${id}`).toBeGreaterThan(exato * 0.9);
      expect(amostrado, `item ${id}`).toBeLessThan(exato * 1.1);
    }
  });
});

describe('escolha de estratégia', () => {
  it('protege com Bênção do Ferreiro quando o item é caro', () => {
    const plan = solveRefine(7, 10, opts({ kind: 'w4', precoItem: 5_000_000_000 }));
    const usouBencao = plan.politica.slice(7, 10).some((p) => p.acao.bencaos > 0);
    expect(usouBencao).toBe(true);
  });

  it('não gasta Bênção quando ela custa mais do que protege', () => {
    const precos = { ...PRECOS_FIXOS, 6635: 1e12 };
    const plan = solveRefine(7, 10, opts({ kind: 'w4', precos }));
    const usouBencao = plan.politica.slice(7, 10).some((p) => p.acao.bencaos > 0);
    expect(usouBencao).toBe(false);
  });

  it('vale a Bênção mesmo com item barato, porque quebrar joga o refino fora', () => {
    // Um item de 1 zeny ainda carrega todo o refino já pago. Com minério caro e
    // Bênção barata, proteger o PROGRESSO compensa mesmo sem valor no item —
    // é este o mecanismo, e não o preço do equipamento.
    const precos = { 984: 5_000_000, 6635: 200_000 };
    const plan = solveRefine(7, 10, opts({ kind: 'w4', precoItem: 1, precos }));
    expect(plan.politica.slice(7, 10).some((p) => p.acao.bencaos > 0)).toBe(true);
  });


  it('nunca fica mais caro com minérios especiais liberados', () => {
    const restrito = solveRefine(0, 12, opts({ usarMineriosEspeciais: false }));
    const livre = solveRefine(0, 12, opts({ usarMineriosEspeciais: true }));
    expect(livre.custoEsperado).toBeLessThanOrEqual(restrito.custoEsperado + 1e-6);
  });

  it('nunca fica mais caro durante o evento de refino', () => {
    const fora = solveRefine(0, 12, opts({ evento: false }));
    const dentro = solveRefine(0, 12, opts({ evento: true }));
    expect(dentro.custoEsperado).toBeLessThanOrEqual(fora.custoEsperado + 1e-6);
  });

  it('cobra mais para alvos mais altos', () => {
    let anterior = 0;
    for (let alvo = 1; alvo <= 15; alvo++) {
      const c = solveRefine(0, alvo, opts()).custoEsperado;
      expect(c, `+${alvo}`).toBeGreaterThan(anterior);
      anterior = c;
    }
  });
});

describe('campanha de grau', () => {
  it('exige um degrau por letra', () => {
    expect(stepsBetween('none', 'A')).toHaveLength(4);
    expect(stepsBetween('C', 'A')).toHaveLength(2);
    expect(stepsBetween('A', 'A')).toHaveLength(0);
  });

  it('recusa grau em item que não suporta', () => {
    expect(() => calcular(input({ kind: 'w4', grauAlvo: 'D' }), { execucoes: 200 })).toThrow(/Grau/i);
  });

  it('monta uma fase de refino antes de cada degrau', () => {
    const r = calcular(input({ kind: 'w5', refinoAlvo: 11, grauAlvo: 'C' }), { execucoes: 2_000 });
    const graus = r.fases.filter((f) => f.tipo === 'grau');
    const refinos = r.fases.filter((f) => f.tipo === 'refino');
    expect(graus).toHaveLength(2); // none→D, D→C
    expect(refinos).toHaveLength(3); // preparo de cada degrau + refino final
  });

  it('fica mais caro a cada letra a mais', () => {
    const custos = (['none', 'D', 'C', 'B', 'A'] as const).map(
      (g) => calcular(input({ kind: 'w5', refinoAlvo: 11, grauAlvo: g }), { execucoes: 500 }).custoEsperado,
    );
    for (let i = 1; i < custos.length; i++) {
      expect(custos[i]!, `grau ${i}`).toBeGreaterThan(custos[i - 1]!);
    }
  });

  it('só existe a partir do +11, em todos os degraus', () => {
    // A tabela oficial começa no +11, e o NPC recusa o item abaixo disso
    // (conferido in-game). Antes o motor seguia as tabelas de wiki, que listavam
    // chance desde o +9, e chegava a propor Grau D no +9 — plano que o jogo não
    // aceita.
    expect(REFINO_MINIMO_GRAU).toBe(11);

    for (const step of ['toD', 'toC', 'toB', 'toA'] as const) {
      expect(gradeChanceOf('w5', 9, step, false), `+9 ${step}`).toBeNull();
      expect(gradeChanceOf('w5', 10, step, false), `+10 ${step}`).toBeNull();
      expect(gradeChanceOf('w5', 11, step, false), `+11 ${step}`).toBeGreaterThan(0);
      expect(gradeChanceOf('a2', 11, step, false), `+11 ${step} (equip)`).toBeGreaterThan(0);
    }
  });

  it('nunca tenta o grau abaixo do +11, nem quando sairia mais barato', () => {
    // Com o processo seguro a falha não destrói nada, então chance baixa custa
    // só repetição de material — e um Grau D a 10% no +9 chegava a vencer os 70%
    // do +11, porque o trecho +9→+11 de uma arma nv5 é caríssimo. Era um plano
    // que o jogo não aceita, e hoje nem a tabela nem o piso o permitem.
    const o = opts({ kind: 'w5', precoItem: 50_000_000 });
    const campanha = solveGradeCampaign('none', 'A', 0, o);

    for (const degrau of campanha.degraus) {
      expect(degrau.refino, degrau.step.key).toBeGreaterThanOrEqual(11);
    }
  });

  it('bate com a simulação na campanha completa', () => {
    const r = calcular(input({ kind: 'w5', refinoAlvo: 11, grauAlvo: 'B' }), { execucoes: 40_000 });
    expect(r.simulacao!.custoMedio).toBeGreaterThan(r.custoEsperado * 0.9);
    expect(r.simulacao!.custoMedio).toBeLessThan(r.custoEsperado * 1.1);
  });
});

describe('orçamento da simulação', () => {
  // O trabalho da simulação é execuções x tentativas por execução, e o teto vem
  // do TEMPO que quem chama libera, convertido em tentativas. O teste guarda o
  // orçamento de trabalho, não o relógio, para não ficar instável conforme a
  // máquina.
  const ALVOS = [10, 14, 16, 18, 20];
  const TEMPO = 150;
  const ORCAMENTO = orcamentoDe(TEMPO);

  it('deriva o teto do orçamento, em vez de escolher os dois à parte', () => {
    // Se um alvo passa raspando pelo teto, o pior caso ainda tem de caber no
    // orçamento: teto x execuções mínimas <= orçamento.
    const r = calcular(
      input({ refinoAtual: 10, refinoAlvo: 13, usarBencaoFerreiro: false, usarMineriosEspeciais: false }),
      { tempoMs: TEMPO },
    );
    if (r.simulacao) {
      expect(r.simulacao.execucoes * r.simulacao.tentativasMedias).toBeLessThan(ORCAMENTO * 1.2);
    }
  });

  for (const alvo of ALVOS) {
    it(`mantém o trabalho limitado no +${alvo}`, () => {
      const r = calcular(input({ refinoAlvo: alvo }), { tempoMs: TEMPO });
      if (r.simulacao === null) {
        // Alvo declarado inalcançável: é este o resultado honesto.
        expect(r.tentativasEsperadas).toBeGreaterThan(ORCAMENTO / 300);
        return;
      }
      // A folga cobre o ruído da média amostral.
      const trabalho = r.simulacao.execucoes * r.simulacao.tentativasMedias;
      expect(trabalho).toBeLessThan(ORCAMENTO * 1.2);
      expect(r.simulacao.execucoes).toBeGreaterThanOrEqual(300);
    });
  }

  it('mais tempo compra mais precisão nos alvos caros', () => {
    // O +16 custa milhares de tentativas por campanha: é justamente aí que o
    // orçamento maior vira mais execuções, em vez de bater no teto de amostras.
    const curto = calcular(input({ refinoAlvo: 16 }), { tempoMs: 100 });
    const longo = calcular(input({ refinoAlvo: 16 }), { tempoMs: 1_000 });
    expect(longo.simulacao!.execucoes).toBeGreaterThan(curto.simulacao!.execucoes * 5);
  });

  it('mais tempo alcança alvos que o orçamento curto declara fora de alcance', () => {
    // O +17 pede ~35 mil tentativas por campanha: não cabe num passe rápido,
    // mas cabe nos segundos do passe preciso. É a razão de o tempo ser um
    // parâmetro, e não um número fixo no motor.
    const alvo = input({ refinoAlvo: 17 });
    expect(calcular(alvo, { tempoMs: 150 }).simulacao).toBeNull();
    expect(calcular(alvo, { tempoMs: 3_000 }).simulacao).not.toBeNull();
  });

  it('desiste de simular e avisa quando o alvo é inalcançável', () => {
    // +20 numa arma nível 4 pede da ordem de 10^8 tentativas. Nem com o
    // orçamento cheio dá para simular: truncar seria mentir, e o honesto é
    // dizer que não dá.
    const r = calcular(input({ refinoAlvo: 20 }), { tempoMs: 3_000 });
    expect(r.simulacao).toBeNull();
    expect(r.tentativasEsperadas).toBeGreaterThan(1_000_000);
    expect(r.avisos.some((a) => a.nivel === 'perigo' && a.texto.includes('inalcançável'))).toBe(true);
  });

  it('usa a precisão cheia nos alvos comuns', () => {
    const r = calcular(input({ refinoAlvo: 10 }), { tempoMs: TEMPO });
    expect(r.simulacao!.execucoes).toBeGreaterThan(5_000);
  });

  it('para no relógio quando a máquina é mais lenta que a calibragem', () => {
    // O orçamento de trabalho é uma estimativa de tempo; numa máquina lenta ele
    // erraria para mais. O relógio é o teto duro, e o resultado tem de dizer
    // que foi ele quem cortou — em vez de anunciar uma precisão que não teve.
    const o = opts({ kind: 'w4' });
    const plan = solveRefine(0, 12, o);
    const sim = simulateCampaign(
      [
        {
          tipo: 'refino',
          rotulo: '+0 → +12',
          de: 0,
          para: 12,
          politica: plan.politica,
          tentativas: plan.recursos.tentativas,
          recursos: plan.recursos,
        },
      ],
      o,
      { execucoes: 50_000_000, tempoMs: 30 },
    );
    expect(sim.limitadoPorTempo).toBe(true);
    expect(sim.execucoes).toBeLessThan(50_000_000);
    expect(sim.execucoes).toBeGreaterThan(0);
    expect(sim.duracaoMs).toBeLessThan(1_000);
    // O corte encurta a amostra, não falseia o número: a média continua batendo.
    expect(sim.custoMedio).toBeGreaterThan(plan.custoEsperado * 0.8);
    expect(sim.custoMedio).toBeLessThan(plan.custoEsperado * 1.2);
  });
});

describe('resultado completo', () => {
  it('ordena os percentis e coloca a média acima da mediana', () => {
    const r = calcular(input({ refinoAlvo: 12 }), { execucoes: 20_000 });
    const { p50, p75, p90, p95, p99 } = r.simulacao!.custo;
    expect(p50).toBeLessThanOrEqual(p75);
    expect(p75).toBeLessThanOrEqual(p90);
    expect(p90).toBeLessThanOrEqual(p95);
    expect(p95).toBeLessThanOrEqual(p99);
    // Cauda longa à direita: é exatamente por isso que planejar pela média falha.
    expect(r.custoEsperado).toBeGreaterThan(p50);
  });

  it('lê a distribuição ao contrário: que fatia cabe num orçamento qualquer', () => {
    // É a conta que o cursor faz sobre a curva de custo. Ela precisa fechar com
    // os percentis nos dois sentidos — se a busca binária errar por um, a tela
    // dirá uma chance que o motor não sustenta.
    const r = calcular(input({ refinoAlvo: 12 }), { execucoes: 20_000 });
    const custos = Float64Array.from(r.simulacao!.amostras.custo).sort();
    const { p50, p90, p99 } = r.simulacao!.custo;

    expect(chanceAte(custos, p50)).toBeCloseTo(0.5, 2);
    expect(chanceAte(custos, p90)).toBeCloseTo(0.9, 2);
    expect(chanceAte(custos, p99)).toBeCloseTo(0.99, 2);
    // Fora das pontas não há campanha nenhuma: nada custa menos que a campanha
    // mais barata, e o pior caso simulado cobre a amostra inteira.
    expect(chanceAte(custos, custos[0]! - 1)).toBe(0);
    expect(chanceAte(custos, custos[custos.length - 1]!)).toBe(1);

    // O valor lido entra na conta, não fica de fora dela: num custo repetido —
    // e num alvo barato quase todo custo é repetido, porque cada quebra soma o
    // preço de um item inteiro — a fatia tem de incluir as campanhas que
    // custaram exatamente aquilo.
    const repetido = Float64Array.from([1, 2, 2, 2, 5]);
    expect(chanceAte(repetido, 2)).toBe(0.8);
    expect(chanceAte(repetido, 1.9)).toBe(0.2);
  });

  it('soma preço de entrada e custo do caminho no valor justo', () => {
    const r = calcular(input({ refinoAlvo: 9 }), { execucoes: 1_000 });
    expect(r.valorJusto).toBeCloseTo(r.input.precoItem + r.custoEsperado, 6);
  });

  it('avisa sobre risco de quebra quando ele existe', () => {
    const r = calcular(input({ kind: 'w4', refinoAlvo: 10, precoItem: 1 }), { execucoes: 2_000 });
    expect(r.avisos.some((a) => a.nivel === 'perigo')).toBe(true);
  });

  it('não inventa custo quando não há o que fazer', () => {
    const r = calcular(input({ refinoAtual: 5, refinoAlvo: 5 }), { execucoes: 100 });
    expect(r.custoEsperado).toBe(0);
    expect(r.fases).toHaveLength(0);
  });
});

describe('simular com o que já se tem', () => {
  // Poucas execuções de propósito: abaixo do teto de amostras guardadas, o que
  // a tela recebe é a simulação INTEIRA, e os dois lados têm de bater na casa
  // decimal — é o que garante que o veredito do estoque não seja outra conta.
  const planoEstoque = () => calcular(input({ refinoAlvo: 11 }), { tempoMs: 300, execucoes: 1_000 });

  /** Uma mochila com material e cópias de sobra, para isolar o caixa. */
  const mochilaCheia = (c: ReturnType<typeof emMateriais>) => ({
    itens: Object.fromEntries(c.materiais.map((m) => [m.itemId, 1e9])),
    copias: 1_000,
  });

  it('guarda as execuções cruas para a pergunta do estoque', () => {
    const r = planoEstoque();
    const sim = r.simulacao!;
    expect(sim.amostras.execucoes).toBe(sim.execucoes);
    expect([...sim.amostras.itemIds].sort()).toEqual(Object.keys(sim.itens).map(Number).sort());
    expect(percentis(sim.amostras.custo)).toEqual(sim.custo);
  });

  it('separa do custo o zeny que não se carrega na mochila', () => {
    const r = planoEstoque();
    const c = emMateriais(r.simulacao!.amostras, r.input.precos, r.input.precoItem);

    // O zeny puro é o custo menos o preço de TUDO o que é material: minério e
    // cópias de reposição. O que resta é taxa do refinador e balcão do NPC.
    for (let i = 0; i < c.execucoes; i++) {
      let material = c.quebras[i]! * c.precoItem;
      for (let col = 0; col < c.materiais.length; col++) {
        material += c.consumo[col * c.execucoes + i]! * c.materiais[col]!.preco;
      }
      expect(c.zenyPuro[i]!).toBeCloseTo(c.custo[i]! - material, 3);
      expect(c.zenyPuro[i]!).toBeGreaterThan(0);
      expect(c.zenyPuro[i]!).toBeLessThan(c.custo[i]!);
    }

    // E é uma parcela pequena: a campanha é minério, não taxa.
    const v = avaliarEstoque(c, { zeny: 0, ...mochilaCheia(c) });
    expect(v.zenyNecessario.p50).toBeLessThan(r.simulacao!.custo.p50 * 0.1);
    expect(v.zenyNecessario.p50).toBeGreaterThanOrEqual(r.simulacao!.taxas.p50);
  });

  it('não deixa o zeny comprar minério que falta', () => {
    const r = planoEstoque();
    const c = emMateriais(r.simulacao!.amostras, r.input.precos, r.input.precoItem);

    // Caixa de sobra e mochila vazia: nenhuma campanha fecha, por mais zeny que
    // haja. É a diferença entre este painel e o orçamento — lá tudo se compra
    // na hora, aqui a viagem ao mercado não está no plano.
    expect(avaliarEstoque(c, { zeny: 1e15, itens: {}, copias: 1_000 }).chance).toBe(0);

    // O mesmo caixa, com a mochila cheia, fecha tudo.
    expect(avaliarEstoque(c, { zeny: 1e15, ...mochilaCheia(c) }).chance).toBe(1);
  });

  it('responde a chance pela distribuição da taxa quando só falta caixa', () => {
    const r = planoEstoque();
    const c = emMateriais(r.simulacao!.amostras, r.input.precos, r.input.precoItem);
    const cheia = mochilaCheia(c);

    // Com material de sobra, o único recurso que pode acabar é o zeny — então a
    // chance é, por definição, o percentil do zeny puro em que se parou.
    for (const q of [0.5, 0.9]) {
      const v = avaliarEstoque(c, { zeny: zenyParaChance(c, q), ...cheia });
      expect(v.chance).toBeGreaterThanOrEqual(q);
      expect(v.chance).toBeLessThan(q + 0.05);
    }
  });

  it('nunca piora a chance quando o estoque cresce', () => {
    const r = planoEstoque();
    const c = emMateriais(r.simulacao!.amostras, r.input.precos, r.input.precoItem);
    const cheia = mochilaCheia(c);

    let anterior = -1;
    for (const zeny of [0, 1e6, 1e7, 1e8, 1e9]) {
      const chance = avaliarEstoque(c, { zeny, ...cheia }).chance;
      expect(chance).toBeGreaterThanOrEqual(anterior);
      anterior = chance;
    }
    expect(anterior).toBe(1);

    // E o mesmo no eixo do material, com o caixa fixo no que cobre tudo.
    const zeny = Math.ceil(c.zenyPuroOrdenado[c.execucoes - 1]!);
    let anteriorMaterial = -1;
    for (const k of [0, 0.5, 1, 2, 10]) {
      const chance = avaliarEstoque(c, {
        zeny,
        copias: 1_000,
        itens: Object.fromEntries(c.materiais.map((m) => [m.itemId, Math.ceil(k * m.maximo)])),
      }).chance;
      expect(chance).toBeGreaterThanOrEqual(anteriorMaterial);
      anteriorMaterial = chance;
    }
    expect(anteriorMaterial).toBe(1);
  });

  it('pede o estoque no que se compra, não em minério fabricado', () => {
    const r = planoEstoque();
    const c = emMateriais(r.simulacao!.amostras, r.input.precos, r.input.precoItem);
    const ids = c.materiais.map((m) => m.itemId);

    // O plano de uma arma nv4 usa Bradium, que ninguém compra pronto: fabrica a
    // partir de Oridecon. Quem tem Oridecon na mochila tem o que a conta pede.
    expect(r.simulacao!.itens[6224]).toBeDefined();
    expect(ids).toContain(984);
    expect(ids).not.toContain(6224);

    // A conversão fecha com a lista de compras da mesma campanha média.
    const lista = listaDeCompras(r.simulacao!.mediaItens, r.input.precos);
    for (const linha of lista.compras) {
      const material = c.materiais.find((m) => m.itemId === linha.itemId)!;
      expect(material).toBeDefined();
      expect(material.media).toBeCloseTo(linha.qtd, 6);
    }
  });

  it('trata o piso como a fronteira do impossível', () => {
    const r = planoEstoque();
    const c = emMateriais(r.simulacao!.amostras, r.input.precos, r.input.precoItem);
    const cheia = mochilaCheia(c);
    const zenyDeSobra = Math.ceil(c.zenyPuroOrdenado[c.execucoes - 1]!);

    for (const m of c.materiais) {
      expect(m.minimo).toBeGreaterThan(0);
      expect(m.minimo).toBeLessThanOrEqual(m.media);
      expect(m.media).toBeLessThanOrEqual(m.maximo);
      expect(c.piso.itens[m.itemId]).toBe(Math.ceil(m.minimo));

      // Uma unidade abaixo do piso e não sobra campanha nenhuma — nem a mais
      // sortuda das mil —, por mais zeny e cópias que haja.
      const v = avaliarEstoque(c, {
        ...cheia,
        zeny: zenyDeSobra,
        itens: { ...cheia.itens, [m.itemId]: c.piso.itens[m.itemId]! - 1 },
      });
      expect(v.chance).toBe(0);
      expect(v.materiais.find((x) => x.itemId === m.itemId)!.fracaoFaltou).toBe(1);
    }

    // O piso do caixa e o das cópias respondem igual.
    expect(avaliarEstoque(c, { ...cheia, zeny: c.piso.zeny - 1 }).chance).toBe(0);
    expect(avaliarEstoque(c, { ...cheia, zeny: c.piso.zeny }).chance).toBeGreaterThan(0);
    // O piso das cópias é a reposição da campanha mais sortuda, mais a que já
    // está em mãos. Ele só passa de 1 quando NENHUMA campanha atravessa sem
    // quebrar; aqui uma em seis passa inteira, então o piso é a própria cópia.
    const noPiso = {
      zeny: zenyDeSobra,
      itens: Object.fromEntries(c.materiais.map((m) => [m.itemId, Math.ceil(m.maximo)])),
    };
    expect(c.piso.copias).toBe(1 + Math.ceil(Math.min(...c.quebras)));
    expect(c.piso.copias).toBe(1);
    expect(avaliarEstoque(c, { ...noPiso, copias: c.piso.copias }).chance).toBeGreaterThan(0);
  });

  it('preenche o estoque que dá a chance pedida, e não o percentil de cada coisa', () => {
    const r = planoEstoque();
    const c = emMateriais(r.simulacao!.amostras, r.input.precos, r.input.precoItem);

    for (const alvo of [0.1, 0.5, 0.9, 0.99]) {
      const e = estoqueRecomendado(c, alvo);
      const chance = avaliarEstoque(c, e).chance;
      expect(chance).toBeGreaterThanOrEqual(alvo);
      expect(chance).toBeLessThan(alvo + 0.06);

      // O caminho ingênuo — o percentil `alvo` de cada recurso, lido em
      // separado — fica ABAIXO do alvo, e é por isso que a busca existe.
      expect(e.zeny).toBeGreaterThanOrEqual(zenyParaChance(c, alvo));
      for (const m of c.materiais) {
        expect(e.itens[m.itemId]!).toBeGreaterThanOrEqual(c.piso.itens[m.itemId]!);
      }
      expect(e.copias).toBeGreaterThanOrEqual(c.piso.copias);
    }

    // Mirar mais alto nunca pede menos de nada.
    const menor = estoqueRecomendado(c, 0.5);
    const maior = estoqueRecomendado(c, 0.9);
    expect(maior.zeny).toBeGreaterThanOrEqual(menor.zeny);
    expect(maior.copias).toBeGreaterThanOrEqual(menor.copias);
    for (const m of c.materiais) {
      expect(maior.itens[m.itemId]!).toBeGreaterThanOrEqual(menor.itens[m.itemId]!);
    }
  });

  it('lê a chance rápida e a completa como a mesma conta', () => {
    const r = planoEstoque();
    const c = emMateriais(r.simulacao!.amostras, r.input.precos, r.input.precoItem);

    for (const alvo of [0.25, 0.75, 0.99]) {
      const e = estoqueRecomendado(c, alvo);
      expect(chanceDoEstoque(c, e)).toBe(avaliarEstoque(c, e).chance);
    }
  });

  it('fecha a conta na taxa do refinador quando o estoque cobre o resto', () => {
    // Equipamento Sombrio usa minério que se compra pronto, sem balcão de NPC no
    // meio, e nenhum minério dele é isento. Com material e cópias de sobra, o que
    // sobra a pagar é exatamente a taxa: um múltiplo redondo de 10.000z. É o teste
    // mais duro da separação — qualquer parcela que o estoque não soubesse
    // explicar apareceria aqui como um resto quebrado.
    const r = calcular(input({ kind: 'shadowA', refinoAlvo: 9, precoItem: 5_000_000 }), {
      tempoMs: 300,
      execucoes: 1_000,
    });
    const c = emMateriais(r.simulacao!.amostras, r.input.precos, r.input.precoItem);
    const cheia = mochilaCheia(c);
    const v = avaliarEstoque(c, { zeny: 0, ...cheia });
    expect(v.zenyNecessario.p99).toBeGreaterThan(0);
    expect(v.zenyNecessario.p99 % TAXA_REFINO.shadowA).toBe(0);
    expect(v.chance).toBe(0); // sem zeny nenhum, nem a taxa dá para pagar

    const comZeny = avaliarEstoque(c, { zeny: v.zenyNecessario.p99, ...cheia });
    expect(comZeny.chance).toBeGreaterThanOrEqual(0.99);
  });

  it('conta as cópias do item que ainda faltam', () => {
    const r = calcular(input({ refinoAlvo: 12, precoItem: 1_000_000 }), {
      tempoMs: 300,
      execucoes: 1_000,
    });
    const c = emMateriais(r.simulacao!.amostras, r.input.precos, r.input.precoItem);

    const sozinha = avaliarEstoque(c, { zeny: 0, itens: {}, copias: 1 });
    expect(sozinha.fracaoSemCopias).toBeCloseTo(1 - r.simulacao!.chanceSemQuebra, 6);
    expect(sozinha.copiasFaltantes.p90).toBeCloseTo(r.simulacao!.quebras.p90, 6);

    const caixa = avaliarEstoque(c, { zeny: 0, itens: {}, copias: 6 });
    expect(caixa.copiasFaltantes.p50).toBeLessThanOrEqual(sozinha.copiasFaltantes.p50);
    // O zeny de taxa é da campanha, não do estoque: ter mais cópias não o muda.
    expect(caixa.zenyNecessario.p50).toBe(sozinha.zenyNecessario.p50);
  });

  it('guarda a trajetória, e ela fecha com o total no último marco', () => {
    const r = planoEstoque();
    const a = r.simulacao!.amostras;

    // Uma campanha de refino puro tem um marco por degrau, e nada mais.
    expect(a.marcos.map((m) => m.rotulo)).toEqual(
      Array.from({ length: 11 }, (_, i) => `+${i + 1}`),
    );
    expect(a.marcos.every((m) => m.tipo === 'refino')).toBe(true);
    // A trajetória é uma amostra menor que a dos totais, de propósito.
    expect(a.execucoesMarcos).toBeLessThanOrEqual(a.execucoes);

    // O último marco É o fim da campanha: o acumulado ali tem de ser o total.
    const c = emMateriais(a, r.input.precos, r.input.precoItem);
    const nM = c.execucoesMarcos;
    const ultimo = c.marcos.length - 1;
    for (let i = 0; i < nM; i++) {
      for (let col = 0; col < c.materiais.length; col++) {
        expect(c.progresso[(ultimo * c.materiais.length + col) * nM + i]).toBe(
          c.consumo[col * c.execucoes + i],
        );
      }
      expect(c.progressoZenyPuro[ultimo * nM + i]).toBeCloseTo(c.zenyPuro[i]!, 6);
      expect(c.progressoQuebras[ultimo * nM + i]).toBe(c.quebras[i]);
    }
  });

  it('só avança o marco na primeira chegada ao degrau', () => {
    const r = planoEstoque();
    const c = emMateriais(r.simulacao!.amostras, r.input.precos, r.input.precoItem);
    const nM = c.execucoesMarcos;
    const nCol = c.materiais.length;

    // O consumo acumulado nunca decresce ao longo do caminho — é o que torna
    // "o primeiro marco em que falta" bem definido. Se um retorno ao mesmo
    // degrau remarcasse o ponto, a curva andaria para trás.
    for (let i = 0; i < Math.min(nM, 200); i++) {
      for (let col = 0; col < nCol; col++) {
        for (let m = 1; m < c.marcos.length; m++) {
          expect(c.progresso[(m * nCol + col) * nM + i]!).toBeGreaterThanOrEqual(
            c.progresso[((m - 1) * nCol + col) * nM + i]!,
          );
        }
      }
      for (let m = 1; m < c.marcos.length; m++) {
        expect(c.progressoZenyPuro[m * nM + i]!).toBeGreaterThanOrEqual(
          c.progressoZenyPuro[(m - 1) * nM + i]!,
        );
      }
    }
  });

  it('localiza onde a campanha para, e concorda com a chance', () => {
    const r = planoEstoque();
    const c = emMateriais(r.simulacao!.amostras, r.input.precos, r.input.precoItem);
    const cheio = estoqueRecomendado(c, 0.9);

    // Estoque de sobra: não há onde travar.
    expect(ondeAcaba(c, { ...cheio, zeny: 1e15, copias: 1_000, itens: Object.fromEntries(c.materiais.map((m) => [m.itemId, 1e9])) })).toBeNull();

    for (const k of [0.6, 0.4, 0.25]) {
      const e = {
        zeny: Math.round(cheio.zeny * k),
        copias: cheio.copias,
        itens: Object.fromEntries(
          Object.entries(cheio.itens).map(([id, q]) => [Number(id), Math.round(q * k)]),
        ),
      };
      const t = ondeAcaba(c, e)!;
      expect(t).not.toBeNull();

      // Travar é o complemento de chegar. As duas leituras saem do mesmo
      // processo — no último marco o acumulado é o total —, e só divergem pelo
      // tamanho da amostra: 1 mil trajetórias contra 5 mil totais.
      expect(1 - t.fracaoQueTrava).toBeCloseTo(avaliarEstoque(c, e).chance, 1);

      // Os quartis são índices de marco, em ordem.
      expect(t.marcoP25).toBeLessThanOrEqual(t.marcoP50);
      expect(t.marcoP50).toBeLessThanOrEqual(t.marcoP75);
      expect(t.marcos[t.marcoP50]).toBeDefined();

      // O histograma é uma distribuição sobre os marcos.
      expect(t.porMarco).toHaveLength(t.marcos.length);
      expect(t.porMarco.reduce((s, x) => s + x, 0)).toBeCloseTo(1, 10);

      // E a culpa também: cada campanha que trava tem exatamente um primeiro
      // recurso a acabar.
      expect(t.culpados.reduce((s, x) => s + x.fracao, 0)).toBeCloseTo(1, 10);
      expect(t.culpados[0]!.fracao).toBeGreaterThanOrEqual(t.culpados[t.culpados.length - 1]!.fracao);
    }
  });

  it('aponta o recurso que de fato acabou, e não outro', () => {
    const r = planoEstoque();
    const c = emMateriais(r.simulacao!.amostras, r.input.precos, r.input.precoItem);

    // Tudo de sobra menos um material: ele tem de ser o culpado de todas.
    const escasso = c.materiais[0]!;
    const t = ondeAcaba(c, {
      zeny: 1e15,
      copias: 1_000,
      itens: Object.fromEntries(
        c.materiais.map((m) => [m.itemId, m.itemId === escasso.itemId ? c.piso.itens[m.itemId]! : 1e9]),
      ),
    })!;
    expect(t.culpados).toHaveLength(1);
    expect(t.culpados[0]!.recurso).toEqual({ tipo: 'material', itemId: escasso.itemId });

    // O mesmo pelo lado do caixa: material de sobra e zeny no piso.
    const soZeny = ondeAcaba(c, {
      zeny: c.piso.zeny,
      copias: 1_000,
      itens: Object.fromEntries(c.materiais.map((m) => [m.itemId, 1e9])),
    })!;
    expect(soZeny.culpados).toHaveLength(1);
    expect(soZeny.culpados[0]!.recurso).toEqual({ tipo: 'zeny' });
  });

  it('nomeia os marcos de uma campanha de grau pelo caminho inteiro', () => {
    const r = calcular(input({ kind: 'w5', refinoAtual: 0, refinoAlvo: 8, grauAlvo: 'D' }), {
      tempoMs: 800,
      execucoes: 1_000,
    });
    const marcos = r.simulacao!.amostras.marcos;

    // Subir de grau zera o refino, então o `+7` acontece duas vezes — uma no
    // preparo, outra no refino final. É o `faseRotulo` que os separa.
    const graus = marcos.filter((m) => m.tipo === 'grau');
    expect(graus).toHaveLength(1);
    expect(graus[0]!.rotulo).toBe('Grau D');
    expect(marcos[marcos.length - 1]!.rotulo).toBe('+8');
    const repetidos = marcos.filter((m) => m.rotulo === '+1');
    expect(repetidos.length).toBeGreaterThan(1);
    expect(new Set(repetidos.map((m) => m.faseRotulo)).size).toBe(repetidos.length);
  });

  it('diz quantas campanhas travaram só no caixa', () => {
    const r = planoEstoque();
    const c = emMateriais(r.simulacao!.amostras, r.input.precos, r.input.precoItem);
    const cheia = mochilaCheia(c);

    // Material e cópias de sobra: tudo o que não fecha, não fecha por zeny.
    const meio = avaliarEstoque(c, { zeny: zenyParaChance(c, 0.5), ...cheia });
    expect(meio.chance + meio.fracaoSoPorZeny).toBeCloseTo(1, 10);

    // Sem material nenhum, o caixa deixa de ser a explicação: nenhuma campanha
    // chegou perto o bastante para o zeny ser o que faltava.
    const semNada = avaliarEstoque(c, { zeny: 0, itens: {}, copias: 1 });
    expect(semNada.fracaoSoPorZeny).toBe(0);
  });
});

describe('equipamento que não pode ser perdido', () => {
  // Com carta e encanto dentro, quebrar não é um custo alto — é inaceitável.
  // A opção vira restrição no espaço de ações: o plano só anda por tentativas
  // que não destroem o item, mesmo que o caminho arriscado saia mais barato.
  const seguro = (over: Partial<CalcInput> = {}) =>
    calcular(input({ kind: 'w4', refinoAtual: 7, refinoAlvo: 12, perdaAceitavel: false, ...over }), {
      execucoes: 5_000,
      tempoMs: 1_000,
    });

  it('acha o piso de cada categoria', () => {
    // Arma nv4: abaixo do +7 todo minério quebra, e a Bênção só cobre do +7.
    expect(pisoSeguro(12, opts({ kind: 'w4', perdaAceitavel: false }))).toBe(7);
    // Arma nv5: o Eteridecon derruba 3 refinos, mas nunca destrói o item.
    expect(pisoSeguro(12, opts({ kind: 'w5', perdaAceitavel: false }))).toBe(0);
    // Sombrio não aceita Bênção, e o Perfeito derruba para uma faixa que quebra.
    expect(pisoSeguro(10, opts({ kind: 'shadowW', perdaAceitavel: false }))).toBe(10);
    // Aceitando a perda o piso é sempre o +0: nada está fora do alcance.
    expect(pisoSeguro(12, opts({ kind: 'w4', perdaAceitavel: true }))).toBe(0);
  });

  it('separa o alvo que só derruba o refino do que pode destruir o item', () => {
    // A lista de alvos precisa dizer QUAL das duas coisas a falha faz: são a
    // mesma palavra ("arriscado") e decisões opostas — perder um refino custa
    // mais uma tentativa, perder o item custa o item e tudo que já foi pago.
    const cond = { precos: PRECOS_FIXOS, evento: false, usarBencaoFerreiro: true, usarMineriosEspeciais: true };

    // Arma nv4 saindo do +0: até o +4 nada falha; do +5 em diante o caminho
    // atravessa a faixa em que todo minério quebra o equipamento.
    const doZero = riscoPorAlvo(0, { kind: 'w4', ...cond });
    expect(doZero[4]).toBe('nenhuma');
    expect(doZero[10]).toBe('quebra');

    // O MESMO +10, saindo do +7, nunca destrói o item: dali para cima a Bênção
    // segura, e é por isso que o risco não pode ser lido só do alvo.
    expect(riscoPorAlvo(7, { kind: 'w4', ...cond })[10]).toBe('derruba');

    // Arma nv5: o Eteridecon derruba 3 refinos e nunca quebra, então o caminho
    // é seguro desde o +0 — até o +14. Acima disso a Bênção não alcança e todo
    // minério da faixa destrói o item.
    const nv5 = riscoPorAlvo(0, { kind: 'w5', ...cond });
    expect(nv5[14]).toBe('derruba');
    expect(nv5[15]).toBe('quebra');

    // Sem Bênção do Ferreiro não existe rede: o que era queda vira quebra.
    expect(riscoPorAlvo(7, { kind: 'w4', ...cond, usarBencaoFerreiro: false })[10]).toBe('quebra');
  });

  it('não escolhe nenhuma tentativa que possa destruir o item', () => {
    const r = seguro();
    expect(r.fases.flatMap((f) => f.trechos).every((t) => !t.arriscaQuebrar)).toBe(true);
    expect(r.itensQuebrados).toBe(0);
    expect(r.copiasItem).toBe(1);
    expect(r.simulacao!.chanceSemQuebra).toBe(1);
    expect(r.simulacao!.quebras.p99).toBe(0);
  });

  it('obriga a Bênção no piso, que é a única saída segura de lá', () => {
    // No +7 o Perfeito derrubaria o item para o +6, onde só há minério que
    // quebra — então a Bênção deixa de ser escolha e vira a única ação legal.
    const trecho = seguro().fases.flatMap((f) => f.trechos).find((t) => t.de === 7);
    expect(trecho!.bencaos).toBeGreaterThan(0);
  });

  it('recusa o alvo, explicando o piso, quando o item começa abaixo dele', () => {
    expect(() => seguro({ refinoAtual: 0 })).toThrow(RefineImpossivel);
    expect(() => seguro({ refinoAtual: 0 })).toThrow(/\+7/);
  });

  it('recusa a categoria em que não existe caminho seguro nenhum', () => {
    expect(() => seguro({ kind: 'shadowW', refinoAtual: 7, refinoAlvo: 10 })).toThrow(
      RefineImpossivel,
    );
    // Sem Bênção a Arma nv4 também não tem como segurar o item.
    expect(() => seguro({ usarBencaoFerreiro: false })).toThrow(RefineImpossivel);
  });

  it('nunca sai mais barato que o plano que aceita o risco', () => {
    // A restrição só tira opções da mesa, então o custo ótimo não pode cair.
    for (const alvo of [9, 10, 11, 12]) {
      for (const precoItem of [500_000, 30_000_000]) {
        const livre = calcular(
          input({ kind: 'w4', refinoAtual: 7, refinoAlvo: alvo, precoItem }),
          { execucoes: 500, tempoMs: 200 },
        );
        const protegido = seguro({ refinoAlvo: alvo, precoItem });
        expect(protegido.custoEsperado, `+${alvo} @ ${precoItem}`).toBeGreaterThanOrEqual(
          livre.custoEsperado - 1e-6,
        );
      }
    }
  });

  it('põe preço na garantia, comparando com o plano que aceita o risco', () => {
    // Item barato: aceitando o risco compensa tentar com Oridecon comum e
    // recomprar quando quebra, então a garantia tem preço e o aviso o mostra.
    const aviso = seguro({ refinoAlvo: 9, precoItem: 100_000 }).avisos.find((a) =>
      a.texto.startsWith('Nenhuma tentativa'),
    );
    expect(aviso).toBeDefined();
    expect(aviso!.texto).toMatch(/a garantia custa/);
  });

  it('reconhece quando a garantia não custa nada', () => {
    // Item caro o bastante e o plano ótimo já não arriscava: aí o aviso não
    // pode inventar um preço para a garantia.
    const aviso = seguro({ refinoAlvo: 9, precoItem: 30_000_000 }).avisos.find((a) =>
      a.texto.startsWith('Nenhuma tentativa'),
    );
    expect(aviso!.texto).toMatch(/não custa nada/);
  });

  it('só usa o processo seguro nos degraus de grau', () => {
    const r = calcular(
      input({ kind: 'w5', refinoAtual: 0, refinoAlvo: 11, grauAlvo: 'D', perdaAceitavel: false }),
      { execucoes: 2_000, tempoMs: 500 },
    );
    const graus = r.fases.filter((f) => f.grau);
    expect(graus.length).toBeGreaterThan(0);
    expect(graus.every((f) => f.grau!.seguro)).toBe(true);
    expect(graus.every((f) => f.grau!.refinoReposicao === null)).toBe(true);
    expect(r.itensQuebrados).toBe(0);
  });

  it('não muda nada quando a perda é aceitável', () => {
    // A opção ligada tem que devolver exatamente o plano de sempre.
    const antes = calcular(input({ refinoAlvo: 12 }), { execucoes: 2_000, tempoMs: 500 });
    expect(antes.custoEsperado).toBeGreaterThan(0);
    expect(solveRefine(0, 12, opts()).piso).toBe(0);
  });
});

describe('o plano seguro oferecido ao lado do arriscado', () => {
  // O motor minimiza a MÉDIA; a tela destaca um PERCENTIL. Aceitar a quebra
  // sempre baixa a média — o otimizador só ganha ações —, mas o que ele compra
  // com isso é cauda, e num percentil alto o plano seguro pode ser o mais
  // barato dos dois. `Resultado.alternativa` existe para a página não exibir o
  // número pior calada. Ver `AlternativaSegura`, em engine/plan.ts.
  const arriscado = (over: Partial<CalcInput> = {}, comparar = true) =>
    calcular(input({ kind: 'w4', refinoAtual: 7, refinoAlvo: 11, precoItem: 200_000, ...over }), {
      execucoes: 2_000,
      tempoMs: 30_000,
      comparar,
    });

  it('só é resolvido quando alguém pede a comparação', () => {
    // Uma campanha inteira a mais não pode entrar na conta que roda a cada
    // tecla digitada: quem paga por ela é o passe preciso, no Worker.
    expect(arriscado({}, false).alternativa).toBeNull();
  });

  it('não existe para quem já está no plano seguro', () => {
    // O plano JÁ é o alternativo: comparar seria mostrar o mesmo número duas vezes.
    expect(arriscado({ perdaAceitavel: false }).alternativa).toBeNull();
  });

  it('não existe quando este plano já não arrisca o item', () => {
    // Item caro o bastante e o ótimo com o risco liberado não usa o risco.
    // Sendo viável sob a restrição, ele continua ótimo lá — os dois planos são
    // um só, e comparar mostraria o mesmo número duas vezes.
    const r = arriscado({ precoItem: 500_000 });
    expect(r.fases.flatMap((f) => f.trechos).some((t) => t.arriscaQuebrar)).toBe(false);
    expect(r.alternativa).toBeNull();
  });

  it('não existe quando não há caminho seguro nenhum até o alvo', () => {
    // Sombrio não aceita Bênção: aqui a opção não é cara, é inexistente, e quem
    // diz isso é o aviso de quebra que já está na tela.
    expect(arriscado({ kind: 'shadowW', refinoAtual: 7, refinoAlvo: 10 }).alternativa).toBeNull();
  });

  it('custa mais na média e não destrói item nenhum', () => {
    const r = arriscado();
    expect(r.alternativa).not.toBeNull();
    // A restrição só tira opções da mesa: a média do plano seguro não pode cair.
    expect(r.alternativa!.custoEsperado).toBeGreaterThanOrEqual(r.custoEsperado - 1e-6);
    expect(r.alternativa!.itensQuebrados).toBe(0);
    expect(r.itensQuebrados).toBeGreaterThan(0);
  });

  it('confere com o plano que sai de desmarcar a opção', () => {
    // O bloco da tela manda desmarcar "posso perder o item" para ver o plano por
    // inteiro. Se os dois números divergissem, o conselho levaria a outra tela
    // que não a prometida.
    const r = arriscado();
    const desmarcado = arriscado({ perdaAceitavel: false });
    expect(r.alternativa!.custoEsperado).toBeCloseTo(desmarcado.custoEsperado, 6);
    expect(r.alternativa!.custo!.p90).toBeCloseTo(desmarcado.simulacao!.custo.p90, 6);
  });

  it('registra o cruzamento que motivou tudo isto: média menor, percentil maior', () => {
    // Arma nv5 com Evento, +6 Sem Grau → +9 Grau D, item barato. Com a Bênção
    // do Ferreiro a 6 mi, aceitar a quebra faz o motor largá-la no +10→+11: o
    // item passa a poder explodir ali, a média cai 1,8% e a CAUDA engorda. No
    // p90 — a margem que a página recomenda — o plano seguro sai 12% mais
    // barato, e era esse plano melhor que a tela escondia atrás de uma opção
    // marcada para abrir caminhos, não para fechá-los.
    //
    // A janela de preço é estreita de propósito: abaixo dela o otimizador compra
    // a Bênção mesmo aceitando o risco (planos iguais, nada a comparar) e acima
    // ela fica cara demais para o plano seguro competir em qualquer margem.
    const alvo = input({
      kind: 'w5',
      precoItem: 200_000,
      refinoAtual: 6,
      refinoAlvo: 9,
      grauAlvo: 'D',
      evento: true,
      precos: { ...PRECOS_FIXOS, 6635: 6_000_000 },
    });
    // Teto de execuções bem abaixo do que o tempo permite: assim é o teto que
    // encerra a amostragem, e não o relógio, e o percentil sai igual em qualquer
    // máquina (a semente da simulação é fixa).
    const orcamento = { execucoes: 4_000, tempoMs: 30_000 };
    const com = calcular(alvo, { ...orcamento, comparar: true });
    const sem = calcular({ ...alvo, perdaAceitavel: false }, orcamento);

    // O plano que aceita o risco larga a Bênção no +10; o seguro a mantém.
    const bencaoNo10 = (r: typeof com) =>
      r.fases.flatMap((f) => f.trechos).find((t) => t.de === 10)!.bencaos;
    expect(bencaoNo10(com)).toBe(0);
    expect(bencaoNo10(sem)).toBeGreaterThan(0);

    // A média confirma que o motor não errou: aceitar o risco é mais barato nela.
    expect(com.custoEsperado).toBeLessThan(sem.custoEsperado);
    // E o percentil confirma que a média não era a resposta que a tela dá.
    expect(com.simulacao!.custo.p90).toBeGreaterThan(sem.simulacao!.custo.p90 * 1.05);
    expect(com.alternativa!.custo!.p90).toBeLessThan(com.simulacao!.custo.p90);
  });
});
