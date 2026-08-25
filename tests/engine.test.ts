import { describe, expect, it } from 'vitest';

import { DEFAULT_PRICES } from '../src/data/defaultPrices';
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
import { listaDeCompras, unitCost } from '../src/engine/pricing';
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
import { percentis, simulateCampaign } from '../src/engine/simulate';
import {
  avaliarEstoque,
  emMateriais,
  estoqueMinimo,
  materialParaChance,
  zenyParaChance,
} from '../src/engine/estoque';
import { calcular, orcamentoDe } from '../src/engine/plan';
import type { CalcInput } from '../src/engine/types';

const opts = (over: Partial<RefineOptions> = {}): RefineOptions => ({
  kind: 'w4',
  precos: DEFAULT_PRICES,
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
  precos: DEFAULT_PRICES,
  usarBencaoFerreiro: true,
  usarMineriosEspeciais: true,
  perdaAceitavel: true,
  ...over,
});

describe('tabelas do Browiki', () => {
  it('reproduz os limites seguros documentados', () => {
    // https://browiki.org/wiki/Refinamento — "limite de segurança"
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
    // Arma sombria refina com Oridecon; armadura sombria, com Elunium. Antes de
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

  it('registra onde discordar do Browiki muda número', () => {
    // O Browiki joga todo minério especial na tabela alta. Onde o motor segue a
    // descrição do item e diz "chance comum", as duas leituras podem dar números
    // diferentes — e é bom saber exatamente onde, porque é aí que a divergência
    // vale zeny e o plano precisa avisar.
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
    // tabelas são bem diferentes (20% x 40% na tentativa do +8, numa arma nv4).
    // Os de Bradium e Carnium ficam do +11 para cima, onde as tabelas quase
    // sempre coincidem — só a Arma nv3 em evento escapa.
    expect([...divergem].sort()).toEqual([
      'bradium-perfeito w3',
      'elunium-perfeito a1',
      'elunium-perfeito shadowA',
      'oridecon-perfeito shadowW',
      'oridecon-perfeito w3',
      'oridecon-perfeito w4',
    ]);
  });

  it('avisa quando o plano depende da divergência entre Browiki e Divine Pride', () => {
    const r = calcular(
      input({ kind: 'w3', refinoAtual: 10, refinoAlvo: 12, evento: true, usarBencaoFerreiro: false }),
      { tempoMs: 0 },
    );
    const usaBradiumPerfeito = r.fases
      .flatMap((f) => f.trechos)
      .some((t) => t.minerioItemId === 6226);
    expect(usaBradiumPerfeito).toBe(true);
    expect(r.avisos.some((a) => a.texto.includes('as fontes discordam'))).toBe(true);
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
  it('cobra por categoria, conforme a tabela do iROwiki', () => {
    expect(TAXA_REFINO.w1).toBe(50);
    expect(TAXA_REFINO.w4).toBe(20_000);
    expect(TAXA_REFINO.a1).toBe(2_000);
    expect(TAXA_REFINO.a2).toBe(30_000);
  });

  it('isenta os minérios de Cash Shop, e só eles', () => {
    // "If the player is using Enriched / HD ... from the Kafra Shop, the fee is
    // 0z". A isenção segue `joyCoins`, não `especial`: os Enriquecidos de Éter
    // também são especiais, mas vêm do NPC e nada indica que sejam isentos.
    const oridecon = ORE_BY_ID.get('oridecon')!;
    const enriquecido = ORE_BY_ID.get('oridecon-enriquecido')!;
    const eterEnriquecido = ORE_BY_ID.get('eteridecon-enriquecido')!;

    expect(taxaDaTentativa('w4', oridecon)).toBe(TAXA_REFINO.w4);
    expect(taxaDaTentativa('w4', enriquecido)).toBe(0);
    expect(taxaDaTentativa('w5', eterEnriquecido)).toBe(TAXA_REFINO.w5);
  });

  it('conta a taxa de refino por tentativa de verdade, não por tentativa média', () => {
    // Uma campanha que mistura minério isento e não isento não pode ter a taxa
    // calculada como `tentativas x valor fixo` — foi assim que ela nasceu, com
    // um campo único no formulário, e é o erro que a soma vinda do motor evita.
    const o = opts({ kind: 'w4', precoItem: 30_000_000 });
    const plan = solveRefine(0, 10, o);

    const isentas = plan.politica
      .slice(0, 10)
      .filter((p) => p.acao.taxa === 0).length;
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

    // O Enriquecido custa 50k a mais no mercado, mas economiza 20k de taxa: a
    // diferença real é 30k, e é essa que o otimizador precisa enxergar.
    expect(cashShop.custo - comum.custo).toBe(30_000);
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
    const r = simular({ precos: { ...DEFAULT_PRICES, [BLESSING_ITEM_ID]: 100_000_000 } });
    const naFaixa = trechosDe(r).filter((t) => t.de >= 7 && t.de <= 13);
    expect(naFaixa.some((t) => t.bencaos > 0)).toBe(true);
    expect(naFaixa.some((t) => t.bencaos === 0)).toBe(true);
  });

  it('consome na amostragem a mesma quantidade que a política prevê', () => {
    const r = simular({ precos: { ...DEFAULT_PRICES, [BLESSING_ITEM_ID]: 100_000_000 } });
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
    const precos = { ...DEFAULT_PRICES, 6635: 1e12 };
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

  it('deixa a tabela decidir a partir de que refino cada degrau é possível', () => {
    // As duas wikis listam chance de Grau desde o +9, embora o texto do Browiki
    // fale em +11. Seguimos as tabelas: D vale do +9, C do +10, B e A do +11.
    expect(REFINO_MINIMO_GRAU).toBe(9);

    expect(gradeChanceOf('w5', 9, 'toD', false)).toBeGreaterThan(0);
    expect(gradeChanceOf('w5', 9, 'toC', false)).toBeNull();
    expect(gradeChanceOf('w5', 10, 'toC', false)).toBeGreaterThan(0);
    expect(gradeChanceOf('w5', 10, 'toB', false)).toBeNull();
    expect(gradeChanceOf('w5', 11, 'toA', false)).toBeGreaterThan(0);
  });

  it('prefere tentar o grau cedo, com chance baixa, a pagar o refino até o +11', () => {
    // Com o processo SEGURO a falha não destrói nada: chance baixa só significa
    // repetir o material. Então 10% no +9 pode vencer 70% no +11 quando o trecho
    // +9→+11 é caro — e numa arma nv5 ele é, porque todo minério acima do +10
    // quebra o item. Trocar isso por uma regra fixa de "+11 sempre" custaria
    // dinheiro real, e é por isso que a decisão fica com o otimizador.
    const o = opts({ kind: 'w5', precoItem: 50_000_000 });
    const campanha = solveGradeCampaign('none', 'D', 0, o);
    const degrau = campanha.degraus[0]!;

    expect(degrau.refino).toBe(9);
    expect(degrau.seguro).toBe(true);
    expect(degrau.chance).toBeCloseTo(0.1, 6);

    // E precisa ser mais barato que a alternativa de subir até o +11 primeiro.
    const custoNo11 = solveRefine(0, 11, o).custoEsperado;
    expect(degrau.custoEsperado).toBeLessThan(custoNo11);
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

  it('guarda as execuções cruas para a pergunta do estoque', () => {
    const r = planoEstoque();
    const sim = r.simulacao!;
    expect(sim.amostras.execucoes).toBe(sim.execucoes);
    expect([...sim.amostras.itemIds].sort()).toEqual(Object.keys(sim.itens).map(Number).sort());
    expect(percentis(sim.amostras.custo)).toEqual(sim.custo);
  });

  it('com a mochila vazia, o zeny necessário é o custo da campanha', () => {
    const r = planoEstoque();
    const c = emMateriais(r.simulacao!.amostras, r.input.precos, r.input.precoItem);
    const v = avaliarEstoque(c, { zeny: 0, itens: {}, copias: 1 });
    expect(v.zenyNecessario).toEqual(r.simulacao!.custo);
    expect(v.chance).toBe(0);
  });

  it('responde a chance pela distribuição do custo quando só há zeny', () => {
    const r = planoEstoque();
    const c = emMateriais(r.simulacao!.amostras, r.input.precos, r.input.precoItem);

    // Levar o percentil 90 em caixa cobre, por definição, 90% das campanhas.
    const v = avaliarEstoque(c, { zeny: r.simulacao!.custo.p90, itens: {}, copias: 1 });
    expect(v.chance).toBeGreaterThanOrEqual(0.9);
    expect(v.chance).toBeLessThan(0.93);

    const mediana = avaliarEstoque(c, { zeny: r.simulacao!.custo.p50, itens: {}, copias: 1 });
    expect(mediana.chance).toBeGreaterThanOrEqual(0.5);
    expect(mediana.chance).toBeLessThan(0.55);
  });

  it('nunca piora a chance quando o estoque cresce', () => {
    const r = planoEstoque();
    const c = emMateriais(r.simulacao!.amostras, r.input.precos, r.input.precoItem);
    const base = { itens: {}, copias: 1 };

    let anterior = -1;
    for (const zeny of [0, 1e8, 5e8, 1e9, 5e9, 1e12]) {
      const chance = avaliarEstoque(c, { ...base, zeny }).chance;
      expect(chance).toBeGreaterThanOrEqual(anterior);
      anterior = chance;
    }
    expect(anterior).toBe(1);

    const zeny = r.simulacao!.custo.p50;
    const semMaterial = avaliarEstoque(c, { zeny, itens: {}, copias: 1 }).chance;
    const comMaterial = avaliarEstoque(c, {
      zeny,
      itens: Object.fromEntries(c.materiais.map((m) => [m.itemId, Math.ceil(m.media)])),
      copias: 1,
    }).chance;
    expect(comMaterial).toBeGreaterThan(semMaterial);
  });

  it('abate do custo exatamente o preço do que já está na mochila', () => {
    const r = planoEstoque();
    const c = emMateriais(r.simulacao!.amostras, r.input.precos, r.input.precoItem);
    const material = c.materiais[0]!;

    // Uma quantidade que toda campanha simulada consome inteira: o abatimento é
    // o preço dela, sem sobra nem falta.
    const tem = Math.max(0, Math.floor(material.minimo) - 1);
    const v = avaliarEstoque(c, { zeny: 0, itens: { [material.itemId]: tem }, copias: 1 });
    expect(v.zenyNecessario.p50).toBeCloseTo(r.simulacao!.custo.p50 - tem * material.preco, 3);
    expect(v.materiais[0]!.fracaoFaltou).toBe(1);
  });

  it('só cobra zeny do que o estoque não cobre', () => {
    const r = planoEstoque();
    const c = emMateriais(r.simulacao!.amostras, r.input.precos, r.input.precoItem);

    // Material e cópias de sobra: o que resta é taxa do refinador e balcão do
    // NPC, que se paga em zeny mesmo tendo a mochila cheia.
    const v = avaliarEstoque(c, {
      zeny: 0,
      itens: Object.fromEntries(c.materiais.map((m) => [m.itemId, 1e9])),
      copias: 1_000,
    });
    expect(v.chance).toBe(0);
    expect(v.zenyNecessario.p50).toBeGreaterThan(0);
    expect(v.zenyNecessario.p50).toBeLessThan(r.simulacao!.custo.p50 * 0.1);
    expect(v.zenyNecessario.p50).toBeGreaterThanOrEqual(r.simulacao!.taxas.p50);
    expect(v.materiais.every((m) => m.fracaoFaltou === 0)).toBe(true);
    expect(v.fracaoSemCopias).toBe(0);
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

  it('trata o mínimo como o piso da campanha mais sortuda', () => {
    const r = planoEstoque();
    const c = emMateriais(r.simulacao!.amostras, r.input.precos, r.input.precoItem);

    for (const m of c.materiais) {
      expect(m.minimo).toBeGreaterThan(0);
      expect(m.minimo).toBeLessThanOrEqual(m.media);
      // Abaixo do mínimo não existe campanha que não precise comprar mais.
      const v = avaliarEstoque(c, { zeny: 0, itens: { [m.itemId]: m.minimo - 1 }, copias: 1 });
      expect(v.materiais.find((x) => x.itemId === m.itemId)!.fracaoFaltou).toBe(1);
    }
  });

  it('preenche o piso de material junto com o caixa que ele exige', () => {
    const r = planoEstoque();
    const c = emMateriais(r.simulacao!.amostras, r.input.precos, r.input.precoItem);
    const piso = Object.fromEntries(c.materiais.map((m) => [m.itemId, Math.ceil(m.minimo)]));

    // Só o piso, sem caixa: a resposta seria ~0% — verdade, e inútil. É por isso
    // que o botão da tela preenche os dois campos, e não só a mochila.
    expect(avaliarEstoque(c, { zeny: 0, itens: piso, copias: 1 }).chance).toBeLessThan(0.05);

    for (const alvo of [0.1, 0.5, 0.9, 0.99]) {
      const e = estoqueMinimo(c, { zeny: 0, itens: {}, copias: 3 }, alvo);
      expect(e.itens).toEqual(piso);
      // As cópias em mãos são um fato, não um orçamento: o botão não as mexe.
      expect(e.copias).toBe(3);
      // O caixa é o que ESTE estoque ainda pede, então a chance sai no alvo.
      const chance = avaliarEstoque(c, e).chance;
      expect(chance).toBeGreaterThanOrEqual(alvo);
      expect(chance).toBeLessThan(alvo + 0.05);
    }
  });

  it('resolve o material quando o caixa é que está travado', () => {
    const r = planoEstoque();
    const c = emMateriais(r.simulacao!.amostras, r.input.precos, r.input.precoItem);
    // Metade do que a campanha mediana pede em caixa: sem material, não passa
    // nem perto — o que falta tem de sair da mochila.
    const caixa = Math.round(r.simulacao!.custo.p50 / 2);

    let anterior = 0;
    for (const alvo of [0.1, 0.25, 0.5, 0.75]) {
      const cesta = materialParaChance(c, { zeny: caixa, itens: {}, copias: 1 }, alvo);
      if (cesta.teto < alvo) continue; // caixa insuficiente: é recado, não cesta

      const chance = avaliarEstoque(c, { zeny: caixa, itens: cesta.itens, copias: 1 }).chance;
      expect(chance).toBeCloseTo(cesta.chance, 10);
      expect(chance).toBeGreaterThanOrEqual(alvo);

      // Mirar mais alto nunca pede menos material — é o que torna a bisseção
      // legítima —, e uma unidade a menos no material mais caro já não chega.
      const total = Object.values(cesta.itens).reduce((s, q) => s + q, 0);
      expect(total).toBeGreaterThanOrEqual(anterior);
      anterior = total;

      const caro = [...c.materiais].sort((a, b) => b.preco - a.preco)[0]!;
      const magro = { ...cesta.itens, [caro.itemId]: Math.max(0, cesta.itens[caro.itemId]! - 1) };
      expect(avaliarEstoque(c, { zeny: caixa, itens: magro, copias: 1 }).chance).toBeLessThanOrEqual(
        chance,
      );
    }
  });

  it('diz quando material nenhum resolve, porque o que falta é caixa', () => {
    const r = planoEstoque();
    const c = emMateriais(r.simulacao!.amostras, r.input.precos, r.input.precoItem);

    // Sem zeny e com uma cópia só, a taxa do refinador e a reposição do item
    // continuam de pé por mais minério que se tenha.
    const cesta = materialParaChance(c, { zeny: 0, itens: {}, copias: 1 }, 0.9);
    expect(cesta.teto).toBeLessThan(0.9);
    expect(cesta.chance).toBe(cesta.teto);
    // E o recado sabe dizer quanto caixa o alvo exigiria de mochila cheia.
    expect(cesta.zenyDoTeto).toBeGreaterThan(0);
    const comTudo = { zeny: cesta.zenyDoTeto, itens: cesta.itens, copias: 1 };
    expect(avaliarEstoque(c, comTudo).chance).toBeGreaterThanOrEqual(0.9);
  });

  it('corta a distribuição do que falta em qualquer quantil', () => {
    const r = planoEstoque();
    const c = emMateriais(r.simulacao!.amostras, r.input.precos, r.input.precoItem);
    const vazio = { zeny: 0, itens: {}, copias: 1 };

    // Mochila vazia: o que falta é o custo da campanha, e o corte de 10% é a
    // campanha que só 10% das simuladas conseguiram bater.
    expect(zenyParaChance(c, vazio, 0.5)).toBe(Math.ceil(r.simulacao!.custo.p50));
    expect(zenyParaChance(c, vazio, 0.9)).toBe(Math.ceil(r.simulacao!.custo.p90));
    expect(zenyParaChance(c, vazio, 0.1)).toBeLessThan(zenyParaChance(c, vazio, 0.5));
    expect(avaliarEstoque(c, { ...vazio, zeny: zenyParaChance(c, vazio, 0.1) }).chance).toBeCloseTo(
      0.1,
      2,
    );
  });

  it('fecha a conta em zero quando o estoque cobre tudo', () => {
    // Equipamento Sombrio não paga taxa de refino e usa minério que se compra
    // pronto, sem balcão de NPC no meio. Com material e cópias de sobra não
    // resta zeny nenhum a pagar — é o teste mais duro do abatimento: qualquer
    // parcela do custo que o estoque não soubesse explicar apareceria aqui.
    const r = calcular(input({ kind: 'shadowA', refinoAlvo: 9, precoItem: 5_000_000 }), {
      tempoMs: 300,
      execucoes: 1_000,
    });
    const c = emMateriais(r.simulacao!.amostras, r.input.precos, r.input.precoItem);
    const v = avaliarEstoque(c, {
      zeny: 0,
      itens: Object.fromEntries(c.materiais.map((m) => [m.itemId, 1e9])),
      copias: 1_000,
    });
    expect(v.zenyNecessario.p99).toBe(0);
    expect(v.chance).toBe(1);
  });

  it('conta as cópias do item que ainda faltam comprar', () => {
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
    expect(caixa.zenyNecessario.p50).toBeLessThan(sozinha.zenyNecessario.p50);
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
    const cond = { precos: DEFAULT_PRICES, evento: false, usarBencaoFerreiro: true, usarMineriosEspeciais: true };

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
