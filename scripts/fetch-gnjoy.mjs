// Baixa as tabelas de probabilidade publicadas pela GNJOY Americas — a operadora do
// LATAM — que servem de fonte para a calculadora.
//
// São as páginas oficiais de divulgação de chances do próprio servidor, e por isso
// ganham de qualquer wiki: https://ro.gnjoyamericas.com/pt/news/probability/2 (refino)
// e .../27 (grau).
//
// O que fica em data-raw é a região do artigo (`<div class="fr-view">` até a última
// tabela) com os atributos `style` removidos. O texto e a estrutura das tabelas saem
// intactos; o que some é a folha de estilo inline que a página carrega em cada célula
// e que faria o arquivo passar de 900 KB sem acrescentar um dado sequer.
import { writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/126.0 Safari/537.36';

const PAGES = [
  { id: 2, nome: 'Refinamento', file: 'data-raw/gnjoy-refinamento.html' },
  { id: 27, nome: 'Grau', file: 'data-raw/gnjoy-grau.html' },
];

/** Recorta o corpo do artigo e joga fora o `style=` de cada elemento. */
function extrairArtigo(html, url) {
  const inicio = html.indexOf('<div class="fr-view">');
  if (inicio === -1) throw new Error(`${url}: <div class="fr-view"> não encontrado`);
  const fim = html.lastIndexOf('</table>');
  if (fim === -1 || fim < inicio) throw new Error(`${url}: nenhuma tabela no corpo do artigo`);
  return html
    .slice(inicio, fim + '</table>'.length)
    .replace(/\s+style="[^"]*"/g, '')
    .replace(/\s+class="[^"]*"/g, '');
}

for (const { id, nome, file } of PAGES) {
  const url = `https://ro.gnjoyamericas.com/pt/news/probability/${id}`;
  const res = await fetch(url, { headers: { 'User-Agent': UA } });
  if (!res.ok) throw new Error(`${nome}: HTTP ${res.status}`);
  const artigo = extrairArtigo(await res.text(), url);
  const texto = `<!-- Fonte: ${url} — baixado em ${new Date().toISOString().slice(0, 10)} -->\n${artigo}\n`;
  const out = resolve(ROOT, file);
  await mkdir(dirname(out), { recursive: true });
  await writeFile(out, texto, 'utf8');
  console.log(`${nome} -> ${file} (${texto.length} bytes)`);
}
