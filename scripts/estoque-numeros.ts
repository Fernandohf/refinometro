/*
  Os números medidos que a §9 de docs/matematica.md cita.

  Roda a campanha de referência, monta a amostra em materiais e compara os dois
  jeitos de preencher o estoque: o percentil de cada recurso lido em separado
  (marginal) e o quantil comum que a tela usa.

      npx vite-node scripts/estoque-numeros.ts
*/
import { DEFAULT_PRICES } from '../src/data/defaultPrices';
import {
  avaliarEstoque,
  emMateriais,
  estoqueRecomendado,
  type CampanhaEmMateriais,
} from '../src/engine/estoque';
import { calcular } from '../src/engine/plan';
import { quantilOrdenado } from '../src/engine/simulate';
import type { CalcInput } from '../src/engine/types';

const input: CalcInput = {
  kind: 'w4',
  precoItem: 1_000_000,
  refinoAtual: 0,
  refinoAlvo: 12,
  grauAtual: 'none',
  grauAlvo: 'none',
  evento: false,
  precos: DEFAULT_PRICES,
  usarBencaoFerreiro: true,
  usarMineriosEspeciais: true,
  perdaAceitavel: true,
};

const r = calcular(input, { tempoMs: 4_000 });
const c = emMateriais(r.simulacao!.amostras, r.input.precos, r.input.precoItem);

/** O preenchimento ingênuo: o percentil `q` de cada recurso, lido em separado. */
const marginal = (c: CampanhaEmMateriais, q: number) => ({
  zeny: Math.ceil(quantilOrdenado(c.zenyPuroOrdenado, q)),
  copias: 1 + Math.ceil(quantilOrdenado(c.quebrasOrdenado, q)),
  itens: Object.fromEntries(
    c.materiais.map((m, col) => [
      m.itemId,
      Math.ceil(
        quantilOrdenado(c.consumoOrdenado.subarray(col * c.execucoes, (col + 1) * c.execucoes), q),
      ),
    ]),
  ),
});

console.log(`w4 +0 → +12, ${c.execucoes.toLocaleString('pt-BR')} campanhas guardadas`);
console.log(`${c.materiais.length} materiais: ${c.materiais.map((m) => m.itemId).join(', ')}`);
console.log('');
console.log('  alvo | só material | tudo marginal | quantil comum | chance obtida');

const pct = (x: number) => `${(100 * x).toFixed(1)}%`;

for (const alvo of [0.5, 0.75, 0.9, 0.99]) {
  const m = marginal(c, alvo);
  // Só os materiais no seu próprio percentil, com caixa e cópias de sobra.
  const soMaterial = avaliarEstoque(c, {
    ...m,
    zeny: Infinity,
    copias: Infinity,
  }).chance;
  const tudoMarginal = avaliarEstoque(c, m).chance;
  const escolhido = estoqueRecomendado(c, alvo);
  const obtida = avaliarEstoque(c, escolhido).chance;
  console.log(
    `  ${pct(alvo).padStart(5)} | ${pct(soMaterial).padStart(11)} | ${pct(tudoMarginal).padStart(13)} | ${pct(obtida).padStart(13)} | ${pct(obtida)}`,
  );
}

console.log('');
console.log('piso do possível (a campanha mais sortuda das guardadas):');
console.log(`  zeny de taxa e balcão: ${c.piso.zeny.toLocaleString('pt-BR')}z`);
console.log(`  cópias: ${c.piso.copias}`);
for (const m of c.materiais) {
  console.log(
    `  item ${m.itemId}: piso ${c.piso.itens[m.itemId]}, média ${m.media.toFixed(1)}, máximo ${m.maximo}`,
  );
}
