// Converte as tabelas oficiais da GNJOY Americas (baixadas por `npm run data:fetch`)
// nas tabelas de chance usadas pelo motor de cálculo.
//
// Saída: src/data/refineChances.json e src/data/gradeChances.json
//
// As páginas são HTML de editor de texto: cada célula vem embrulhada em `<p><span>`,
// e o que identifica cada tabela é o parágrafo de legenda logo acima dela ("Tabela 3:
// Minério Especial (Fora do período do Evento de Refino)"). O parser casa a legenda
// com a aba esperada e explode se a página mudar de forma — é isso que faz o comando
// avisar em vez de gravar número errado em silêncio.
import { readFile, writeFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const REFINO_MAX = 20;

/** Texto útil de um trecho de HTML, sem tags nem entidades. */
function texto(html) {
  return html
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(Number(d)))
    .replace(/\s+/g, ' ')
    .trim();
}

/** "70.00%" -> 0.7 ; "-" (ou vazio) -> null, que é como a página marca "não existe". */
function parseChance(t) {
  if (t === '' || t === '-' || t === '–' || t === '—') return null;
  const m = t.match(/^(\d+(?:[.,]\d+)?)\s*%$/);
  if (!m) throw new Error(`Chance não reconhecida: ${JSON.stringify(t)}`);
  const v = Number(m[1].replace(',', '.')) / 100;
  if (!(v >= 0 && v <= 1)) throw new Error(`Chance fora de [0,1]: ${t}`);
  return v;
}

/**
 * Cada tabela da página com a legenda que a antecede, na ordem do documento.
 * A legenda é o texto que separa esta tabela da anterior.
 */
function tabelasComLegenda(html) {
  const out = [];
  let cursor = 0;
  for (const m of html.matchAll(/<table[\s\S]*?<\/table>/gi)) {
    out.push({ legenda: texto(html.slice(cursor, m.index)), html: m[0] });
    cursor = m.index + m[0].length;
  }
  return out;
}

/**
 * Linhas de dados de uma tabela: `{ [refino]: string[] }`, já sem as linhas de
 * cabeçalho (que não começam com um número de refino).
 */
function linhas(tabelaHtml, nome, colunasEsperadas) {
  const rows = {};
  for (const tr of tabelaHtml.matchAll(/<tr[\s\S]*?<\/tr>/gi)) {
    const cells = [...tr[0].matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)].map((c) => texto(c[1]));
    if (cells.length === 0) continue;
    if (!/^\d+$/.test(cells[0])) continue; // cabeçalho
    const refino = Number(cells[0]);
    const valores = cells.slice(1);
    if (valores.length !== colunasEsperadas) {
      throw new Error(`${nome} +${refino}: esperava ${colunasEsperadas} colunas, veio ${valores.length}`);
    }
    if (rows[refino]) throw new Error(`${nome}: refino +${refino} repetido`);
    rows[refino] = valores;
  }
  for (let r = 1; r <= REFINO_MAX; r++) {
    if (!rows[r]) throw new Error(`${nome}: falta a linha do +${r}`);
  }
  if (Object.keys(rows).length !== REFINO_MAX) {
    throw new Error(`${nome}: esperava ${REFINO_MAX} linhas, veio ${Object.keys(rows).length}`);
  }
  return rows;
}

/** Acha a tabela cuja legenda casa com todos os termos, e só ela. */
function acharTabela(tabelas, ...termos) {
  const alvo = tabelas.filter((t) => termos.every((termo) => termo.test(t.legenda)));
  if (alvo.length !== 1) {
    throw new Error(
      `Esperava 1 tabela casando com ${termos.join(' + ')}, achei ${alvo.length}. ` +
        `Legendas: ${tabelas.map((t) => JSON.stringify(t.legenda.slice(-80))).join(', ')}`,
    );
  }
  return alvo[0];
}

// ---------------------------------------------------------------------------
// Refino — https://ro.gnjoyamericas.com/pt/news/probability/2
//
// A página divide as chances em duas famílias de tabela, e é por isso que o
// parser junta duas fontes por aba: as tabelas 1 a 4 trazem seis categorias em
// colunas (Sombrio, Equip. nv1, Armas nv1 a nv4), com uma tabela por combinação
// de minério (comum/especial) e evento; as tabelas 5 e 6 trazem as categorias de
// Éter (Arma nv5 e Equipamento nv2), com o minério virando coluna em vez de
// tabela. O JSON de saída achata tudo em `[aba][refino][coluna]`.
// ---------------------------------------------------------------------------

const COLUNAS = ['w1', 'w2', 'w3', 'w4', 'w5', 'a1', 'a2', 'shadow'];

/** Colunas das tabelas 1 a 4, na ordem em que aparecem na página. */
const COLUNAS_SEIS = ['shadow', 'a1', 'w1', 'w2', 'w3', 'w4'];
/** Colunas das tabelas 5 e 6: Equip. nv2 e Arma nv5, cada um comum e especial. */
const COLUNAS_ETER = [
  { col: 'a2', especial: false },
  { col: 'a2', especial: true },
  { col: 'w5', especial: false },
  { col: 'w5', especial: true },
];

const FORA = /Fora do per[ií]odo/i;
const DENTRO = /Dentro do per[ií]odo/i;
const COMUM = /Min[ée]rio Comum/i;
const ESPECIAL = /Min[ée]rio Especial/i;
const ETER = /Armas? nv\.?\s*5/i;

const refinoHtml = await readFile(resolve(ROOT, 'data-raw/gnjoy-refinamento.html'), 'utf8');
const tabelasRefino = tabelasComLegenda(refinoHtml);

const chances = {};
for (const [aba, especial, evento] of [
  ['normal', false, false],
  ['normalEvent', false, true],
  ['special', true, false],
  ['specialEvent', true, true],
]) {
  const periodo = evento ? DENTRO : FORA;
  const seis = acharTabela(tabelasRefino, especial ? ESPECIAL : COMUM, periodo);
  const eter = acharTabela(tabelasRefino, ETER, periodo);
  const linhasSeis = linhas(seis.html, `Refino ${aba}`, COLUNAS_SEIS.length);
  const linhasEter = linhas(eter.html, `Refino ${aba} (Éter)`, COLUNAS_ETER.length);

  const rows = {};
  for (let r = 1; r <= REFINO_MAX; r++) {
    const lidas = {};
    COLUNAS_SEIS.forEach((col, i) => {
      lidas[col] = parseChance(linhasSeis[r][i]);
    });
    COLUNAS_ETER.forEach((c, i) => {
      if (c.especial === especial) lidas[c.col] = parseChance(linhasEter[r][i]);
    });
    // Grava sempre na ordem de `COLUNAS`, para o JSON não mudar de forma quando
    // a página trocar a ordem das colunas dela.
    const row = {};
    for (const col of COLUNAS) {
      if (!(col in lidas)) throw new Error(`Refino ${aba} +${r}: coluna ${col} não preenchida`);
      row[col] = lidas[col];
    }
    rows[r] = row;
  }
  chances[aba] = rows;
}

await writeFile(
  resolve(ROOT, 'src/data/refineChances.json'),
  JSON.stringify(
    {
      _fonte: 'https://ro.gnjoyamericas.com/pt/news/probability/2',
      _geradoEm: new Date().toISOString().slice(0, 10),
      _colunas: COLUNAS,
      chances,
    },
    null,
    2,
  ),
  'utf8',
);
console.log('OK -> src/data/refineChances.json');
console.log(`  abas: ${Object.keys(chances).join(', ')}`);
console.log(`  refinos: +1 a +${REFINO_MAX}`);

// ---------------------------------------------------------------------------
// Grau — https://ro.gnjoyamericas.com/pt/news/probability/27
//
// Uma tabela por combinação de categoria (arma/equipamento) e evento, com os
// quatro degraus em colunas. A página só lista refino +11 em diante: abaixo
// disso o processo não existe, e é a ausência da linha que diz isso.
// ---------------------------------------------------------------------------

const DEGRAUS = ['toD', 'toC', 'toB', 'toA'];
const REFINO_MINIMO_ESPERADO = 11;

const grauHtml = await readFile(resolve(ROOT, 'data-raw/gnjoy-grau.html'), 'utf8');
// A tabela 1 (bônus da Bênção de Éter) não tem coluna de refino e é descartada
// por `linhasGrau`, que só aceita linha começando por um número.
const tabelasGrau = tabelasComLegenda(grauHtml);

function linhasGrau(tabelaHtml, nome) {
  const rows = {};
  for (const tr of tabelaHtml.matchAll(/<tr[\s\S]*?<\/tr>/gi)) {
    const cells = [...tr[0].matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)].map((c) => texto(c[1]));
    if (cells.length === 0 || !/^\d+$/.test(cells[0])) continue;
    const refino = Number(cells[0]);
    const valores = cells.slice(1);
    if (valores.length !== DEGRAUS.length) {
      throw new Error(`${nome} +${refino}: esperava ${DEGRAUS.length} colunas, veio ${valores.length}`);
    }
    const row = {};
    DEGRAUS.forEach((d, i) => {
      row[d] = parseChance(valores[i]);
    });
    rows[refino] = row;
  }
  const refinos = Object.keys(rows).map(Number).sort((a, b) => a - b);
  if (refinos.length === 0) throw new Error(`${nome}: nenhuma linha encontrada`);
  if (refinos[0] !== REFINO_MINIMO_ESPERADO) {
    throw new Error(
      `${nome}: a tabela começa no +${refinos[0]}, e o motor assume +${REFINO_MINIMO_ESPERADO} ` +
        '(REFINO_MINIMO_GRAU em src/data/grade.ts). Se a página mudou, os dois têm que mudar juntos.',
    );
  }
  if (refinos[refinos.length - 1] !== REFINO_MAX) {
    throw new Error(`${nome}: a tabela termina no +${refinos[refinos.length - 1]}, esperava +${REFINO_MAX}`);
  }
  return rows;
}

const gradeChances = {};
for (const [aba, categoria, evento] of [
  ['weapon', /Armas/i, false],
  ['weaponEvent', /Armas/i, true],
  ['armor', /Equipamentos/i, false],
  ['armorEvent', /Equipamentos/i, true],
]) {
  const periodo = evento ? /Durante o Evento de Grau/i : /Fora do Evento de Grau/i;
  const tabela = acharTabela(tabelasGrau, categoria, periodo);
  gradeChances[aba] = linhasGrau(tabela.html, `Grau ${aba}`);
}

await writeFile(
  resolve(ROOT, 'src/data/gradeChances.json'),
  JSON.stringify(
    {
      _fonte: 'https://ro.gnjoyamericas.com/pt/news/probability/27',
      _geradoEm: new Date().toISOString().slice(0, 10),
      _degraus: DEGRAUS,
      chances: gradeChances,
    },
    null,
    2,
  ),
  'utf8',
);

const grauRefinos = Object.keys(gradeChances.weapon).map(Number).sort((a, b) => a - b);
console.log('OK -> src/data/gradeChances.json');
console.log(`  abas: ${Object.keys(gradeChances).join(', ')}`);
console.log(`  refinos: +${grauRefinos[0]} a +${grauRefinos[grauRefinos.length - 1]}`);
