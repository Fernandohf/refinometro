// Mede os dois passes do motor.
//
// O passe rápido roda de forma síncrona na thread da página a cada tecla: acima
// de ~150ms a digitação engasga. O passe preciso roda num Worker com segundos de
// orçamento — o que importa nele é não estourar o tempo pedido, já que é dele
// que sai a calibragem de TENTATIVAS_POR_MS.
import { DEFAULT_PRICES } from '../src/data/defaultPrices';
import { calcular } from '../src/engine/plan';
import type { CalcInput } from '../src/engine/types';

const base: CalcInput = {
  kind: 'w4',
  precoItem: 30_000_000,
  refinoAtual: 0,
  refinoAlvo: 10,
  grauAtual: 'none',
  grauAlvo: 'none',
  evento: false,
  precos: DEFAULT_PRICES,
  usarBencaoFerreiro: true,
  usarMineriosEspeciais: true,
};

const casos: [string, Partial<CalcInput>][] = [
  ['w4 +0→+10', {}],
  ['w4 +0→+20', { refinoAlvo: 20 }],
  ['w5 +0→+20', { kind: 'w5', refinoAlvo: 20 }],
  ['w5 +0→+11 Grau A', { kind: 'w5', refinoAlvo: 11, grauAlvo: 'A' }],
  ['w5 +0→+20 Grau A', { kind: 'w5', refinoAlvo: 20, grauAlvo: 'A' }],
];

const RAPIDO = 120;
const PRECISO = 3_000;

const medir = (input: CalcInput, tempoMs: number) => {
  const t0 = performance.now();
  const r = calcular(input, { tempoMs });
  const gasto = performance.now() - t0;
  const s = r.simulacao;
  const execucoes = s ? s.execucoes.toLocaleString('pt-BR') : '—';
  return `${gasto.toFixed(0).padStart(5)}ms ${execucoes.padStart(9)} exec${
    s?.limitadoPorTempo ? ' (tempo)' : ''
  }`;
};

console.log(`${''.padEnd(22)} ${'rápido (120ms)'.padEnd(24)} preciso (3s)`);
for (const [nome, over] of casos) {
  const input = { ...base, ...over };
  calcular(input, { tempoMs: 20 }); // aquece
  console.log(`${nome.padEnd(22)} ${medir(input, RAPIDO).padEnd(24)} ${medir(input, PRECISO)}`);
}
