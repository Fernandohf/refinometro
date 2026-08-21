// Gera src/data/items.json a partir do banco do Divine Pride.
//
//   DIVINE_PRIDE_API_KEY=xxxx npm run data:items
//
// A API não tem endpoint de listagem, só consulta por id, então o script varre
// as faixas de id de equipamento uma a uma. É demorado na primeira vez; o cache
// em data-raw/divinepride-cache.json faz as execuções seguintes retomarem de onde
// pararam, inclusive depois de um Ctrl+C.
//
// Saída (contrato consumido por src/data/items.ts):
//   { "_fonte": ..., "_servidor": ..., "itens": [ { "id", "nome", "kind", "slots" } ] }
// onde `kind` é a mesma categoria usada pelo motor: w1..w5, a1, a2, shadow.

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const CACHE = resolve(ROOT, 'data-raw/divinepride-cache.json');
const DEST = resolve(ROOT, 'src/data/items.json');

const API_KEY = process.env.DIVINE_PRIDE_API_KEY;
const SERVER = process.env.DIVINE_PRIDE_SERVER ?? 'bRO';
/** Pausa entre chamadas, em ms. Subir isso é mais educado que apanhar de 429. */
const DELAY = Number(process.env.DIVINE_PRIDE_DELAY ?? 120);

if (!API_KEY) {
  console.error(
    'Falta DIVINE_PRIDE_API_KEY.\n' +
      'Gere uma em https://www.divine-pride.net/ (perfil → API) e rode:\n' +
      '  DIVINE_PRIDE_API_KEY=sua-chave npm run data:items',
  );
  process.exit(1);
}

/**
 * Faixas de id onde moram armas e equipamentos.
 * Ajuste conforme o servidor for ganhando conteúdo novo.
 */
const FAIXAS = [
  [1101, 1499], // espadas, adagas, machados
  [1501, 1699], // maças, cajados
  [1701, 1999], // arcos, flechas
  [2101, 2999], // escudos, elmos, armaduras clássicas
  [13000, 13499], // adagas e revólveres
  [15000, 15999], // armaduras
  [16000, 16999], // maças
  [18000, 18999], // arcos e chapéus
  [20000, 20999], // mantos
  [21000, 21999], // espadas de duas mãos
  [22000, 22999], // sapatos
  [24000, 24999], // acessórios e sombrios
  [28000, 28999], // acessórios novos
  [32000, 32999], // armas novas
  [1000000, 1001500], // conteúdo de Éter (arma nv5 / armadura nv2)
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Cache em disco: id -> resposta crua da API, ou null quando o id não existe. */
let cache = {};
try {
  cache = JSON.parse(await readFile(CACHE, 'utf8'));
  console.log(`cache: ${Object.keys(cache).length} ids já consultados`);
} catch {
  // primeira execução
}

async function salvarCache() {
  await mkdir(dirname(CACHE), { recursive: true });
  await writeFile(CACHE, JSON.stringify(cache), 'utf8');
}

async function buscar(id) {
  if (id in cache) return cache[id];

  const url = `https://www.divine-pride.net/api/database/Item/${id}?apiKey=${API_KEY}&server=${SERVER}`;
  const res = await fetch(url);

  if (res.status === 404) {
    cache[id] = null;
    return null;
  }
  if (res.status === 429) {
    console.log('429 — esperando 30s');
    await sleep(30_000);
    return buscar(id);
  }
  if (!res.ok) throw new Error(`item ${id}: HTTP ${res.status} ${await res.text()}`);

  cache[id] = await res.json();
  await sleep(DELAY);
  return cache[id];
}

/**
 * Traduz a resposta da API para a categoria que o motor usa.
 *
 * ATENÇÃO: este mapeamento ainda não foi conferido contra uma resposta real da
 * API — sem chave não dá para ver o formato exato. Rode com `--inspecionar` para
 * imprimir a resposta crua de alguns ids e ajuste os nomes de campo aqui se
 * preciso. Os campos abaixo são os que a API documenta hoje.
 */
function categoriaDe(item) {
  const tipo = String(item.itemType ?? item.type ?? '').toLowerCase();
  const subtipo = String(item.itemSubType ?? item.subType ?? '').toLowerCase();
  const nivel = Number(item.weaponLevel ?? item.armorLevel ?? item.level ?? 0);

  if (subtipo.includes('shadow') || tipo.includes('shadow')) return 'shadow';

  if (tipo.includes('weapon')) {
    if (nivel >= 1 && nivel <= 5) return `w${nivel}`;
    return null; // sem nível conhecido: melhor ficar de fora do que chutar
  }

  if (tipo.includes('armor') || tipo.includes('defence') || tipo.includes('defense')) {
    if (nivel === 2) return 'a2';
    return 'a1'; // equipamentos sem nível declarado são nível 1
  }

  return null; // consumíveis, cartas, etc.
}

if (process.argv.includes('--inspecionar')) {
  // Modo de conferência: imprime a resposta crua de uma arma e de uma armadura,
  // para validar os nomes de campo usados em categoriaDe().
  for (const id of [1101, 2101, 1000000]) {
    console.log(`\n--- ${id} ---`);
    console.log(JSON.stringify(await buscar(id), null, 2));
  }
  await salvarCache();
  process.exit(0);
}

const itens = [];
let consultados = 0;

for (const [inicio, fim] of FAIXAS) {
  for (let id = inicio; id <= fim; id++) {
    const item = await buscar(id);
    consultados++;
    if (consultados % 250 === 0) {
      await salvarCache();
      console.log(`  ${consultados} ids, ${itens.length} equipamentos`);
    }
    if (!item) continue;

    const kind = categoriaDe(item);
    if (!kind) continue;

    itens.push({
      id,
      nome: item.name ?? `Item ${id}`,
      kind,
      slots: Number(item.slots ?? 0),
    });
  }
}

await salvarCache();

itens.sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));

await writeFile(
  DEST,
  JSON.stringify(
    {
      _fonte: 'https://www.divine-pride.net/',
      _servidor: SERVER,
      _geradoEm: new Date().toISOString().slice(0, 10),
      itens,
    },
    null,
    2,
  ),
  'utf8',
);

console.log(`OK -> src/data/items.json (${itens.length} equipamentos, ${consultados} ids consultados)`);
