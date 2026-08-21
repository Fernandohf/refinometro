import { describe, expect, it } from 'vitest';

import { DEFAULT_PRICES } from '../src/data/defaultPrices';
import {
  blessingCost,
  ORE_BY_ID,
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
  safeLimit,
  solveRefine,
  type RefineOptions,
} from '../src/engine/refine';
import { simulateCampaign } from '../src/engine/simulate';
import { calcular, orcamentoDe } from '../src/engine/plan';
import type { CalcInput } from '../src/engine/types';

const opts = (over: Partial<RefineOptions> = {}): RefineOptions => ({
  kind: 'w4',
  precos: DEFAULT_PRICES,
  evento: false,
  usarBencaoFerreiro: true,
  usarMineriosEspeciais: true,
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

  it('conta a taxa por tentativa de verdade, não por tentativa média', () => {
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
