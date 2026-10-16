/*
  Os números medidos que a §9.8 de docs/matematica.md cita.

  Compara os dois candidatos a kit — o quantil comum e o descasque por preço —
  em valor e em chance FORA da amostra: cada um é escolhido nas campanhas pares
  e conferido nas ímpares, que ele nunca viu. É o teste de que o descasque não
  compra a economia com sobreajuste.

      npx vite-node scripts/kit-numeros.ts
*/
import { DEFAULT_PRICES } from '../src/data/defaultPrices';
import {
  chanceDoEstoque,
  estoqueRecomendado,
  estoquesMaisBaratos,
  type CampanhaEmMateriais,
  type Estoque,
} from '../src/engine/estoque';
import { campanhaEmMinerios } from '../src/engine/kit';
import { calcular } from '../src/engine/plan';
import { listaDeCompras } from '../src/engine/pricing';
import type { CalcInput } from '../src/engine/types';

const base = {
  refinoAtual: 0,
  grauAtual: 'none',
  evento: false,
  precos: DEFAULT_PRICES,
  usarBencaoFerreiro: true,
  usarMineriosEspeciais: true,
  perdaAceitavel: true,
  itemId: null,
  usarAtalhos: false,
} as const;

const casos: [string, CalcInput][] = [
  [
    'w5 +0 → +8 Grau C (o padrão da página)',
    { ...base, kind: 'w5', precoItem: 500_000, refinoAlvo: 8, grauAlvo: 'C', itemId: 560030, usarAtalhos: true },
  ],
  ['w4 +0 → +12, item de 1 mi', { ...base, kind: 'w4', precoItem: 1_000_000, refinoAlvo: 12, grauAlvo: 'none' }],
  ['a2 +0 → +11 Grau A', { ...base, kind: 'a2', precoItem: 5_000_000, refinoAlvo: 11, grauAlvo: 'A' }],
  [
    'w4 +0 → +10, sem minério especial',
    { ...base, kind: 'w4', precoItem: 30_000_000, refinoAlvo: 10, grauAlvo: 'none', usarMineriosEspeciais: false },
  ],
];

const niveis = [0.5, 0.75, 0.9, 0.95, 0.99];

/** A mesma campanha, só com as execuções de uma paridade. */
function metade(c: CampanhaEmMateriais, paridade: 0 | 1): CampanhaEmMateriais {
  const n = c.execucoes;
  const idx = Array.from({ length: n }, (_, i) => i).filter((i) => i % 2 === paridade);
  const m = idx.length;
  const pega = (v: Float64Array) => Float64Array.from(idx, (i) => v[i]!);
  const consumo = new Float64Array(c.materiais.length * m);
  const consumoOrdenado = new Float64Array(c.materiais.length * m);
  c.materiais.forEach((_, col) => {
    const fatia = Float64Array.from(idx, (i) => c.consumo[col * n + i]!);
    consumo.set(fatia, col * m);
    consumoOrdenado.set(fatia.slice().sort(), col * m);
  });
  const zenyPuro = pega(c.zenyPuro);
  const quebras = pega(c.quebras);
  return {
    ...c,
    execucoes: m,
    consumo,
    consumoOrdenado,
    custo: pega(c.custo),
    zenyPuro,
    zenyPuroOrdenado: zenyPuro.slice().sort(),
    quebras,
    quebrasOrdenado: quebras.slice().sort(),
  };
}

function valor(e: Estoque, precoItem: number): number {
  const itens = Object.fromEntries(Object.entries(e.itens).filter(([, q]) => q > 0));
  return listaDeCompras(itens, DEFAULT_PRICES).total + (e.copias - 1) * precoItem + e.zeny;
}

const mi = (z: number) => `${(z / 1e6).toFixed(0)} mi`.padStart(8);
const pct = (x: number) => `${(100 * x).toFixed(1)}%`.padStart(6);

for (const [nome, input] of casos) {
  const p = calcular(input, { execucoes: 5_000, tempoMs: 4_000 });
  const c = campanhaEmMinerios(p)!;
  const treino = metade(c, 0);
  const prova = metade(c, 1);
  const baratos = estoquesMaisBaratos(c, niveis);
  const baratosTreino = estoquesMaisBaratos(treino, niveis);

  console.log(`\n${nome} — ${c.execucoes.toLocaleString('pt-BR')} campanhas, ${c.materiais.length} materiais`);
  console.log('   nível |   comum | descasque | economia | fora da amostra: comum / descasque');
  niveis.forEach((alvo, j) => {
    const vc = valor(estoqueRecomendado(c, alvo), input.precoItem);
    const vd = valor(baratos[j]!, input.precoItem);
    const fc = chanceDoEstoque(prova, estoqueRecomendado(treino, alvo));
    const fd = chanceDoEstoque(prova, baratosTreino[j]!);
    console.log(`  ${pct(alvo)} | ${mi(vc)} | ${mi(vd)}  | ${pct((vc - vd) / vc)}   | ${pct(fc)} / ${pct(fd)}`);
  });
}
