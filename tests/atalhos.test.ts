import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import { extrairMelhoria, extrairReformas } from '../scripts/divinepride';
import {
  atalhosDoItem,
  CATALOGO,
  PERGAMINHOS_DE_ARMA,
  PERGAMINHOS_DE_ARMADURA,
  TODOS_OS_ATALHOS,
} from '../src/data/atalhos';
import gerado from '../src/data/atalhos.json';
import { TODOS_OS_CAMPOS } from '../src/data/defaultPrices';
import { nomeDoItem } from '../src/data/nomes';
import { actionsAt, destinosDe, pisoSeguro, solveRefine, type RefineOptions } from '../src/engine/refine';
import { calcular } from '../src/engine/plan';
import type { CalcInput } from '../src/engine/types';
import { PRECOS_FIXOS } from './precosFixos';

const fixture = (nome: string) =>
  readFileSync(resolve(import.meta.dirname, 'fixtures', nome), 'utf8');

// Itens de verdade da base, escolhidos por terem um atalho cada.
const ARMADURA_TEMPORAL = 15278; // a1 — Cubo de Refino Temporal, +11
const COMBO_ILUSIONAL = 1846; // w4 — Cubo e Super Cubo do Gelo, sorteados
const PUNHO_CONSERTADO = 560030; // w5 — Martelo de Refino do Relógio, +1 com 14 Bênçãos
const MALHA_SOMBRIA = 24000; // shadowA — os dois Martelos Sombrios

const CUBO_TEMPORAL = 100268;
const CUBO_GELO = 9785;
const SUPER_CUBO_GELO = 100416;
const MARTELO_RELOGIO = 101390;
const MARTELO_SOMBRIO_9 = 23926;
const PERGAMINHO_ARMA_7 = 6230;
const PERGAMINHO_ARMA_9 = 6228;

const input = (over: Partial<CalcInput> = {}): CalcInput => ({
  kind: 'w4',
  precoItem: 20_000_000,
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
  usarAtalhos: true,
  ...over,
});

const opts = (over: Partial<RefineOptions> = {}): RefineOptions => ({
  kind: 'w4',
  precos: PRECOS_FIXOS,
  evento: false,
  usarBencaoFerreiro: true,
  usarMineriosEspeciais: true,
  perdaAceitavel: true,
  precoItem: 20_000_000,
  refinoReposicao: 0,
  atalhos: [],
  ...over,
});

describe('catálogo de atalhos', () => {
  it('soma 100% em todo sorteio', () => {
    // As tabelas do Browiki somam 100 no papel. Uma que somasse 99 faria o motor
    // "perder" 1% das campanhas num estado que não existe.
    for (const a of CATALOGO) {
      if (a.efeito.tipo !== 'sorteio') continue;
      const soma = a.efeito.resultados.reduce((s, r) => s + r.p, 0);
      expect(soma, a.nome).toBeCloseTo(1, 9);
    }
  });

  it('tem alvos lidos do Divine Pride para todo atalho catalogado', () => {
    const atalhos = (gerado as unknown as { atalhos: Record<string, { alvos: number[] }> }).atalhos;
    for (const a of CATALOGO) {
      expect(atalhos[a.itemId]?.alvos.length ?? 0, a.nome).toBeGreaterThan(0);
    }
  });

  it('não repete id entre atalhos', () => {
    const ids = TODOS_OS_ATALHOS.map((a) => a.itemId);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('casa cada pergaminho com a caixa do mesmo refino', () => {
    // Quinze por categoria, do +5 ao +19, ids sem repetição. A ordem das caixas
    // no Cash Shop não acompanha a dos refinos (a +10 tem id fora da série), e é
    // exatamente o tipo de troca que passaria despercebida.
    for (const lista of [PERGAMINHOS_DE_ARMA, PERGAMINHOS_DE_ARMADURA]) {
      expect(lista.map((p) => p.refino)).toEqual([5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19]);
      expect(new Set(lista.map((p) => p.caixa)).size).toBe(15);
    }
    expect(PERGAMINHOS_DE_ARMA.find((p) => p.refino === 9)).toEqual({ itemId: 6228, refino: 9, caixa: 22913 });
    expect(PERGAMINHOS_DE_ARMA.find((p) => p.refino === 10)?.caixa).toBe(22944);
  });

  it('oferece ao item só o que serve para ele', () => {
    const nomes = (id: number | null, kind: Parameters<typeof atalhosDoItem>[1]) =>
      atalhosDoItem(id, kind).map((a) => a.itemId);

    expect(nomes(ARMADURA_TEMPORAL, 'a1')).toContain(CUBO_TEMPORAL);
    expect(nomes(COMBO_ILUSIONAL, 'w4')).toEqual(expect.arrayContaining([CUBO_GELO, SUPER_CUBO_GELO]));
    expect(nomes(PUNHO_CONSERTADO, 'w5')).toContain(MARTELO_RELOGIO);
    // Sem item da busca sobram só os pergaminhos da categoria — e só onde o Mestre
    // do Refino os aceita: arma nv1 a nv4 e equipamento nv1.
    expect(atalhosDoItem(null, 'w4').every((a) => a.grupo === 'pergaminho')).toBe(true);
    expect(nomes(null, 'w4')).toContain(PERGAMINHO_ARMA_9);
    expect(nomes(null, 'a1')).not.toContain(PERGAMINHO_ARMA_9);
    for (const kind of ['w5', 'a2', 'shadowW', 'shadowA'] as const) expect(nomes(null, kind)).toEqual([]);
    // O Martelo Sombrio é do sombrio, e só com o item.
    expect(nomes(MALHA_SOMBRIA, 'shadowA')).toContain(MARTELO_SOMBRIO_9);
  });

  it('dá nome e campo de preço a todo atalho negociável', () => {
    const campos = new Set(TODOS_OS_CAMPOS.flatMap((g) => g.itens.map((i) => i.itemId)));
    for (const a of TODOS_OS_ATALHOS) {
      expect(nomeDoItem(a.itemId), String(a.itemId)).toBe(a.nome);
      // Preso na conta não tem mercado: não tem o que cotar.
      if (!a.presoNaConta) expect(campos, a.nome).toContain(a.itemId);
    }
  });

  it('pede preço dos materiais que os martelos cobram', () => {
    // O Martelo de Refino COR cobra Núcleo COR e Sombridecon. Sem campo para
    // eles, o martelo ficaria sem custo e sairia do plano calado.
    const campos = new Set(TODOS_OS_CAMPOS.flatMap((g) => g.itens.map((i) => i.itemId)));
    for (const a of atalhosDoItem(400261, 'a2')) {
      for (const m of a.materiais) expect(campos, m.nome).toContain(m.itemId);
    }
  });
});

describe('cubo de refino fixo', () => {
  const temporal = (over: Partial<CalcInput> = {}) =>
    input({
      kind: 'a1',
      itemId: ARMADURA_TEMPORAL,
      refinoAlvo: 11,
      precos: { ...PRECOS_FIXOS, [CUBO_TEMPORAL]: 60_000_000 },
      ...over,
    });

  it('vira o plano inteiro quando é mais barato que refinar', () => {
    const r = calcular(temporal(), { execucoes: 2_000 });

    expect(r.custoEsperado).toBe(60_000_000);
    expect(r.itensQuebrados).toBe(0);
    expect(r.recursos.itens).toEqual({ [CUBO_TEMPORAL]: 1 });
    // Um trecho só, do +0 ao +11, e nenhum degrau intermediário: o item não passa
    // por eles, e listar Oridecon para o +5 seria mandar comprar o que não se usa.
    expect(r.fases[0]!.trechos).toHaveLength(1);
    expect(r.fases[0]!.trechos[0]).toMatchObject({ de: 0, para: 11, minerioItemId: CUBO_TEMPORAL });
    expect(r.simulacao!.custo.p99).toBe(60_000_000);
  });

  it('conta o resultado acima do alvo como chegar nele', () => {
    // O cubo dá +11; quem quer +10 também pode usá-lo, e para no alvo.
    const r = calcular(temporal({ refinoAlvo: 10 }), { tempoMs: 0 });
    expect(r.custoEsperado).toBeLessThanOrEqual(60_000_000);
  });

  it('fica de fora sem preço, desligado ou num item que não é dele', () => {
    const semAtalho = calcular(temporal({ usarAtalhos: false }), { tempoMs: 0 }).custoEsperado;

    expect(calcular(temporal({ precos: PRECOS_FIXOS }), { tempoMs: 0 }).custoEsperado).toBe(semAtalho);
    expect(semAtalho).toBeGreaterThan(60_000_000);
    // Mesma categoria, outro item: o cubo do Temporal não serve.
    expect(calcular(temporal({ itemId: 2301 }), { tempoMs: 0 }).custoEsperado).toBe(semAtalho);
  });

  it('nunca encarece o plano', () => {
    // Atalho é uma ação a mais: o conjunto de escolhas só cresce.
    for (const preco of [1, 60_000_000, 2_000_000_000]) {
      const com = calcular(temporal({ precos: { ...PRECOS_FIXOS, [CUBO_TEMPORAL]: preco } }), { tempoMs: 0 });
      const sem = calcular(temporal({ usarAtalhos: false }), { tempoMs: 0 });
      expect(com.custoEsperado).toBeLessThanOrEqual(sem.custoEsperado + 1e-6);
    }
  });
});

describe('cubo de refino sorteado', () => {
  const ilusional = (over: Partial<CalcInput> = {}) =>
    input({
      itemId: COMBO_ILUSIONAL,
      refinoAtual: 4,
      refinoAlvo: 10,
      precos: { ...PRECOS_FIXOS, [CUBO_GELO]: 5_000_000, [SUPER_CUBO_GELO]: 30_000_000 },
      ...over,
    });

  it('só aceita o item a partir do +4', () => {
    const o = opts({ atalhos: atalhosDoItem(COMBO_ILUSIONAL, 'w4'), precos: ilusional().precos });
    const usaCubo = (de: number) => actionsAt(de, o).some((a) => a.tipo === 'atalho');
    expect(usaCubo(3)).toBe(false);
    expect(usaCubo(4)).toBe(true);
  });

  it('substitui o refino, e pode baixá-lo', () => {
    // No +9, o Cubo do Gelo sorteia de +7 a +10: três dos quatro resultados
    // descem. O motor precisa saber disso para não usá-lo ali por engano.
    const o = opts({ atalhos: atalhosDoItem(COMBO_ILUSIONAL, 'w4'), precos: ilusional().precos });
    const cubo = actionsAt(9, o).find((a) => a.tipo === 'atalho' && a.atalho.itemId === CUBO_GELO)!;
    expect(destinosDe(cubo, 9).map((d) => d.refino)).toEqual([7, 8, 9, 10]);
  });

  it('bate o custo exato com a média simulada', () => {
    // O sorteio entra no sistema linear e na simulação por caminhos diferentes;
    // se um dos dois errasse a distribuição, as médias se afastariam.
    const r = calcular(ilusional(), { execucoes: 40_000, tempoMs: 30_000 });
    const sem = calcular(ilusional({ usarAtalhos: false }), { tempoMs: 0 });

    expect(r.fases.flatMap((f) => f.trechos).some((t) => t.atalho?.sorteado)).toBe(true);
    expect(r.custoEsperado).toBeLessThan(sem.custoEsperado);
    expect(r.simulacao!.custoMedio / r.custoEsperado).toBeGreaterThan(0.98);
    expect(r.simulacao!.custoMedio / r.custoEsperado).toBeLessThan(1.02);
    for (const [id, media] of Object.entries(r.recursos.itens)) {
      expect(r.simulacao!.mediaItens[Number(id)]! / media, id).toBeCloseTo(1, 1);
    }
    // E avisa que o refino que sai é sorteado.
    expect(r.avisos.some((a) => a.texto.includes('SORTEIA'))).toBe(true);
  });

  it('quando o pior resultado já é o alvo, custa exatamente um cubo', () => {
    // Do +4 ao +7 com o Cubo do Gelo: todo resultado (+7 a +10) chega.
    const r = calcular(ilusional({ refinoAlvo: 7, precos: { ...PRECOS_FIXOS, [CUBO_GELO]: 1_000 } }), {
      tempoMs: 0,
    });
    expect(r.custoEsperado).toBe(1_000);
  });
});

describe('martelo de refino (+1 com materiais)', () => {
  const consertado = (over: Partial<CalcInput> = {}) =>
    input({
      kind: 'w5',
      itemId: PUNHO_CONSERTADO,
      refinoAtual: 9,
      refinoAlvo: 12,
      precos: { ...PRECOS_FIXOS, [MARTELO_RELOGIO]: 1_000_000 },
      ...over,
    });

  it('cobra o martelo e as 14 Bênçãos a cada +1', () => {
    const r = calcular(consertado(), { tempoMs: 0 });

    expect(r.recursos.itens[MARTELO_RELOGIO]).toBeCloseTo(3, 9);
    expect(r.recursos.itens[6635]).toBeCloseTo(42, 9);
    expect(r.custoEsperado).toBeCloseTo(3 * (1_000_000 + 14 * PRECOS_FIXOS[6635]!), 0);
    // Três usos seguidos do mesmo martelo são um trecho só.
    expect(r.fases[0]!.trechos).toEqual([
      expect.objectContaining({ de: 9, para: 12, minerioItemId: MARTELO_RELOGIO }),
    ]);
  });

  it('respeita a faixa publicada (+9 a +11)', () => {
    const o = opts({
      kind: 'w5',
      atalhos: atalhosDoItem(PUNHO_CONSERTADO, 'w5'),
      precos: consertado().precos,
    });
    const usaMartelo = (de: number) => actionsAt(de, o).some((a) => a.tipo === 'atalho');
    expect([8, 9, 10, 11, 12].map(usaMartelo)).toEqual([false, true, true, true, false]);
  });

  it('fica de fora quando falta o preço de um material', () => {
    const precos = { ...consertado().precos };
    delete precos[6635];
    const o = opts({ kind: 'w5', atalhos: atalhosDoItem(PUNHO_CONSERTADO, 'w5'), precos });
    expect(actionsAt(9, o).some((a) => a.tipo === 'atalho')).toBe(false);
  });
});

describe('atalhos e a perda do item', () => {
  it('abre caminho seguro onde todo minério quebraria', () => {
    // Arma nv4: do +4 ao +6 todo minério pode destruir o item, e sem aceitar a
    // perda o alvo era recusado a partir do +0. O Pergaminho +7 pula a faixa.
    const precos = { ...PRECOS_FIXOS, [PERGAMINHO_ARMA_7]: 5_000_000 };
    const alvo = input({ refinoAlvo: 12, perdaAceitavel: false, precos });

    expect(() => calcular({ ...alvo, usarAtalhos: false }, { tempoMs: 0 })).toThrow(/\+7/);
    const r = calcular(alvo, { tempoMs: 0 });
    expect(r.itensQuebrados).toBe(0);
    expect(r.fases[0]!.trechos[0]).toMatchObject({ de: 0, para: 7, minerioItemId: PERGAMINHO_ARMA_7 });
    expect(pisoSeguro(12, opts({ perdaAceitavel: false, precos, atalhos: atalhosDoItem(null, 'w4') }))).toBe(0);
  });

  it('não conta o degrau de 100% como risco de quebra', () => {
    // Na Arma nv1 do +0 ao +6 toda tentativa passa. O minério "quebra" no papel,
    // mas com chance 1 não há falha — e o piso ficava no +7 por isso, recusando
    // um +10 que nunca arriscou o item.
    expect(pisoSeguro(10, opts({ kind: 'w1', perdaAceitavel: false }))).toBe(0);
    expect(() => calcular(input({ kind: 'w1', perdaAceitavel: false, usarAtalhos: false }), { tempoMs: 0 })).not.toThrow();
  });

  it('salta os marcos do caminho de uma vez, com o mesmo gasto', () => {
    // O painel de estoque lê o consumo a cada refino alcançado. Um cubo do +0 ao
    // +11 alcança os onze no mesmo passo — e nenhum pode ficar sem fotografia.
    const r = calcular(
      input({
        kind: 'a1',
        itemId: ARMADURA_TEMPORAL,
        refinoAlvo: 11,
        precos: { ...PRECOS_FIXOS, [CUBO_TEMPORAL]: 60_000_000 },
      }),
      { execucoes: 500 },
    );
    const a = r.simulacao!.amostras;
    expect(a.marcos.map((m) => m.rotulo)).toEqual(Array.from({ length: 11 }, (_, i) => `+${i + 1}`));
    for (let m = 0; m < a.marcos.length; m++) {
      expect(a.progressoCusto[m * a.execucoesMarcos]).toBe(60_000_000);
    }
  });
});

describe('o mesmo plano, por outro caminho', () => {
  it('usa o martelo nos preparos de uma campanha de Grau', () => {
    // A Arma Consertada tem Grau; o martelo de +1 funciona no preparo até o +11.
    const r = calcular(
      input({
        kind: 'w5',
        itemId: PUNHO_CONSERTADO,
        refinoAlvo: 0,
        grauAlvo: 'D',
        precos: { ...PRECOS_FIXOS, [MARTELO_RELOGIO]: 1 },
      }),
      { tempoMs: 0 },
    );
    const sem = calcular(
      input({ kind: 'w5', itemId: PUNHO_CONSERTADO, refinoAlvo: 0, grauAlvo: 'D', usarAtalhos: false }),
      { tempoMs: 0 },
    );
    expect(r.custoEsperado).toBeLessThan(sem.custoEsperado);
    expect(r.fases.flatMap((f) => f.trechos).some((t) => t.minerioItemId === MARTELO_RELOGIO)).toBe(true);
  });

  it('resolve igual pelo solver direto', () => {
    const o = opts({
      kind: 'a1',
      atalhos: atalhosDoItem(ARMADURA_TEMPORAL, 'a1'),
      precos: { ...PRECOS_FIXOS, [CUBO_TEMPORAL]: 60_000_000 },
    });
    expect(solveRefine(0, 11, o).custoEsperado).toBe(60_000_000);
  });
});

describe('leitura das abas do Divine Pride', () => {
  it('lê os alvos e o refino mínimo de um cubo', () => {
    expect(extrairMelhoria(fixture('cubo-melhoria.html'))).toEqual([
      { id: 1846, nome: 'Combo Ilusional [2]', refinoMinimo: 4 },
      { id: 13337, nome: 'Nevasca Ilusional [2]', refinoMinimo: 4 },
    ]);
  });

  it('lê "-" na coluna de refino mínimo como sem exigência', () => {
    // Os cubos que só existem no LATAM vêm assim. Exigir número fazia a tabela
    // inteira sumir, e o cubo sair da base como se não servisse para nada.
    expect(extrairMelhoria(fixture('cubo-melhoria-sem-minimo.html'))).toEqual([
      { id: 1438, nome: 'Lança de Cinzas [1]', refinoMinimo: 0 },
    ]);
  });

  it('lê faixa, mudança e materiais de um martelo, e só os dele', () => {
    // A mesma aba lista, em "Required material for reforming", uma reforma de
    // OUTRO item (um NPC do kRO que leva ao +7 cobrando o martelo). Ela não é
    // o martelo funcionando, e não pode virar uma regra dele.
    expect(extrairReformas(MARTELO_RELOGIO, fixture('martelo-reforma.html'))).toEqual([
      {
        base: 700050,
        nome: 'Arco Consertado',
        resultado: 700050,
        refinoMinimo: 9,
        refinoMaximo: 11,
        mudanca: 1,
        materiais: [{ itemId: 6635, nome: 'Bênção do Ferreiro', qtd: 14 }],
      },
    ]);
  });

  it('diferencia página sem a aba de aba vazia', () => {
    expect(extrairMelhoria('<html></html>')).toBeNull();
    expect(extrairReformas(1, '<html></html>')).toBeNull();
  });
});
