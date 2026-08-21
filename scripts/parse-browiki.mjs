// Converte o wikitext bruto do Browiki nas tabelas de chance usadas pelo motor de cálculo.
// Saída: src/data/refineChances.json
import { readFile, writeFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

// Colunas das 4 tabelas, na ordem em que aparecem no wiki.
const COLUMNS = ['w1', 'w2', 'w3', 'w4', 'w5', 'a1', 'a2', 'shadow'];

// Abas do <tabber> -> chave no JSON.
const TABS = {
  'Minérios Comuns': 'normal',
  'Minérios Comuns (Evento)': 'normalEvent',
  'Minérios Especiais': 'special',
  'Minérios Especiais (Evento)': 'specialEvent',
};

/** Remove markup de célula (`style=... |`) e devolve o texto útil. */
function cellText(raw) {
  let s = raw.trim();
  // Uma célula pode ter atributos antes de um único `|`: `style="..." | 60%`
  const bar = s.indexOf('|');
  if (bar !== -1 && /(?:style|colspan|rowspan|class)\s*=/.test(s.slice(0, bar))) {
    s = s.slice(bar + 1);
  }
  return s.trim();
}

/** "60%" -> 0.6 ; "-" -> null (refino não existe para essa coluna). */
function parseChance(text) {
  if (text === '-' || text === '') return null;
  const m = text.match(/^(\d+(?:[.,]\d+)?)\s*%$/);
  if (!m) throw new Error(`Chance não reconhecida: ${JSON.stringify(text)}`);
  return Number(m[1].replace(',', '.')) / 100;
}

/** Extrai as linhas `+N | a || b || ...` de uma tabela wikitable. */
function parseChanceTable(body, tabName) {
  const rows = {};
  // Cada linha de dados começa com `! +N` e a linha seguinte traz as células.
  const re = /^!\s*\+(\d+)\s*$\n^\|(.*)$/gm;
  let m;
  while ((m = re.exec(body)) !== null) {
    const refine = Number(m[1]);
    const cells = m[2].split('||').map(cellText);
    if (cells.length !== COLUMNS.length) {
      throw new Error(`${tabName} +${refine}: esperava ${COLUMNS.length} colunas, veio ${cells.length}`);
    }
    const row = {};
    COLUMNS.forEach((col, i) => {
      row[col] = parseChance(cells[i]);
    });
    rows[refine] = row;
  }
  if (Object.keys(rows).length === 0) throw new Error(`${tabName}: nenhuma linha encontrada`);
  return rows;
}

const wiki = await readFile(resolve(ROOT, 'data-raw/refinamento.wiki'), 'utf8');

// Isola o bloco <tabber>...</tabber> da seção "Chances de sucesso".
const tabber = wiki.match(/<tabber>([\s\S]*?)<\/tabber>/);
if (!tabber) throw new Error('Bloco <tabber> das chances não encontrado');

// Divide nas abas: `|-| Nome da aba =`
const parts = tabber[1].split(/^\|-\|\s*(.+?)\s*=\s*$/m).slice(1);
const chances = {};
for (let i = 0; i < parts.length; i += 2) {
  const tabName = parts[i].trim();
  const key = TABS[tabName];
  if (!key) throw new Error(`Aba inesperada no wiki: ${JSON.stringify(tabName)}`);
  chances[key] = parseChanceTable(parts[i + 1], tabName);
}

for (const key of Object.values(TABS)) {
  if (!chances[key]) throw new Error(`Aba ausente no wiki: ${key}`);
}

const out = {
  _fonte: 'https://browiki.org/wiki/Refinamento',
  _geradoEm: new Date().toISOString().slice(0, 10),
  _colunas: COLUMNS,
  chances,
};

const dest = resolve(ROOT, 'src/data/refineChances.json');
await writeFile(dest, JSON.stringify(out, null, 2), 'utf8');

const refines = Object.keys(chances.normal).map(Number).sort((a, b) => a - b);
console.log(`OK -> src/data/refineChances.json`);
console.log(`  abas: ${Object.keys(chances).join(', ')}`);
console.log(`  refinos: +${refines[0]} a +${refines[refines.length - 1]} (${refines.length} linhas)`);

// ---------------------------------------------------------------------------
// Grau — https://browiki.org/wiki/Grau
// A tabela de Grau usa uma célula por linha (`| 70%`) em vez de `||`, e as
// colunas são os degraus de grau. A chance depende do refino atual do item.
// ---------------------------------------------------------------------------

const GRADE_STEPS = ['toD', 'toC', 'toB', 'toA'];

const GRADE_TABS = {
  Armas: 'weapon',
  'Armas (Evento)': 'weaponEvent',
  Equipamentos: 'armor',
  'Equipamentos (Evento)': 'armorEvent',
};

function parseGradeTable(body, tabName) {
  const rows = {};
  // `! +N` seguido de 4 linhas de célula, até a próxima linha `|-`.
  // Para em `|-` (nova linha da tabela) e em `|}` (fim da tabela).
  const re = /^!\s*\+(\d+)\s*$\n((?:^\|(?![-}]).*$\n?)+)/gm;
  let m;
  while ((m = re.exec(body)) !== null) {
    const refine = Number(m[1]);
    const cells = m[2]
      .split('\n')
      .filter((l) => l.startsWith('|'))
      .map((l) => cellText(l.slice(1)));
    if (cells.length !== GRADE_STEPS.length) {
      throw new Error(
        `Grau ${tabName} +${refine}: esperava ${GRADE_STEPS.length} colunas, veio ${cells.length}`,
      );
    }
    const row = {};
    GRADE_STEPS.forEach((step, i) => {
      row[step] = parseChance(cells[i]);
    });
    rows[refine] = row;
  }
  if (Object.keys(rows).length === 0) throw new Error(`Grau ${tabName}: nenhuma linha encontrada`);
  return rows;
}

const grauWiki = await readFile(resolve(ROOT, 'data-raw/grau.wiki'), 'utf8');
const grauTabber = grauWiki.match(/<tabber>([\s\S]*?)<\/tabber>/);
if (!grauTabber) throw new Error('Bloco <tabber> das chances de Grau não encontrado');

const grauParts = grauTabber[1].split(/^\|-\|\s*(.+?)\s*=\s*$/m).slice(1);
const gradeChances = {};
for (let i = 0; i < grauParts.length; i += 2) {
  const tabName = grauParts[i].trim();
  const key = GRADE_TABS[tabName];
  if (!key) throw new Error(`Aba de Grau inesperada: ${JSON.stringify(tabName)}`);
  gradeChances[key] = parseGradeTable(grauParts[i + 1], tabName);
}

for (const key of Object.values(GRADE_TABS)) {
  if (!gradeChances[key]) throw new Error(`Aba de Grau ausente: ${key}`);
}

const grauOut = {
  _fonte: 'https://browiki.org/wiki/Grau',
  _geradoEm: new Date().toISOString().slice(0, 10),
  _degraus: GRADE_STEPS,
  chances: gradeChances,
};

await writeFile(resolve(ROOT, 'src/data/gradeChances.json'), JSON.stringify(grauOut, null, 2), 'utf8');

const grauRefines = Object.keys(gradeChances.weapon).map(Number).sort((a, b) => a - b);
console.log(`OK -> src/data/gradeChances.json`);
console.log(`  abas: ${Object.keys(gradeChances).join(', ')}`);
console.log(
  `  refinos: +${grauRefines[0]} a +${grauRefines[grauRefines.length - 1]} (${grauRefines.length} linhas)`,
);
