// Baixa o wikitext bruto das páginas do Browiki que servem de fonte para a calculadora.
// O WebFetch/fetch padrão toma 403; o Browiki libera com um User-Agent de navegador.
import { writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/126.0 Safari/537.36';

const PAGES = [
  { page: 'Refinamento', file: 'data-raw/refinamento.wiki' },
  { page: 'Grau', file: 'data-raw/grau.wiki' },
];

for (const { page, file } of PAGES) {
  const url = `https://browiki.org/index.php?title=${encodeURIComponent(page)}&action=raw`;
  const res = await fetch(url, { headers: { 'User-Agent': UA } });
  if (!res.ok) throw new Error(`${page}: HTTP ${res.status}`);
  const text = await res.text();
  const out = resolve(ROOT, file);
  await mkdir(dirname(out), { recursive: true });
  await writeFile(out, text, 'utf8');
  console.log(`${page} -> ${file} (${text.length} bytes)`);
}
