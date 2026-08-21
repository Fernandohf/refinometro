// Busca itens pelo nome no Divine Pride, já filtrando o que pode ser refinado.
//
//   npm run buscar -- "Espingarda"            lista o que achou
//   npm run buscar -- "Espingarda" --salvar   resolve e grava em items.json
//   npm run buscar -- Caça --cat=armor        só uma categoria
//   npm run buscar -- Sombrio --paginas=5     mais resultados (20 por página)
//
// A listagem sai de uma requisição leve (~40 KB) por categoria. Ela traz nome,
// tipo e subtipo, mas NÃO traz nível de arma nem posição na cabeça — e sem isso
// não dá para dizer a categoria de refino. Por isso `--salvar` abre a ficha
// completa de cada item, que é a parte cara.

import { classificar } from '../src/data/itemKinds';
import {
  buscar,
  CATEGORIAS,
  lerBase,
  pegarFicha,
  salvarBase,
  sleep,
  type Categoria,
  type Resultado,
} from './divinepride';

/** Acima disso, `--salvar` recusa: cada ficha pesa ~400 KB e leva 400 ms. */
const MAX_SALVAR = 40;

const args = process.argv.slice(2);
const salvar = args.includes('--salvar');
const maxPaginas = Number(args.find((a) => a.startsWith('--paginas='))?.split('=')[1] ?? 2);
const catArg = args.find((a) => a.startsWith('--cat='))?.split('=')[1];
const termo = args.filter((a) => !a.startsWith('--')).join(' ').trim();

if (!termo) {
  console.error(
    'Uso: npm run buscar -- "<nome>" [--salvar] [--cat=weapon|armor|shadow] [--paginas=N]\n' +
      '  npm run buscar -- "Espingarda"\n' +
      '  npm run buscar -- Caça --cat=armor --salvar',
  );
  process.exit(1);
}

const categorias = (catArg ? [catArg] : Object.keys(CATEGORIAS)) as Categoria[];
for (const c of categorias) {
  if (!(c in CATEGORIAS)) {
    console.error(`Categoria desconhecida: ${c}. Use ${Object.keys(CATEGORIAS).join(', ')}.`);
    process.exit(1);
  }
}

const achados: Resultado[] = [];
let truncou = false;
let semNome = 0;

for (const categoria of categorias) {
  const r = await buscar(categoria, termo, maxPaginas);
  achados.push(...r.linhas);
  semNome += r.semNome;
  if (r.vistos < r.total) {
    truncou = true;
    console.log(
      `  ${categoria}: mostrando ${r.vistos} de ${r.total} — use --paginas=${maxPaginas + 2} para ver mais`,
    );
  }
  await sleep(400);
}

if (semNome > 0) {
  // Itens que ainda não chegaram ao LATAM: o Divine Pride guarda um cartão em
  // branco para eles. Sem nome não dá para reconhecê-los, então ficam de fora.
  console.log(`  ${semNome} item(ns) sem nome em português — ignorados.`);
}

if (achados.length === 0) {
  console.log(
    semNome > 0
      ? `Os ${semNome} resultados de "${termo}" não têm nome em português — nenhum deles\n` +
        'chegou ao LATAM. Se precisar mesmo de um, cadastre pelo ID:\n' +
        '  npm run item -- <id>'
      : `Nada encontrado para "${termo}".\n` +
        'A busca cobre armas, equipamentos refináveis e sombrios — acessórios comuns\n' +
        'e visuais são excluídos na origem, porque não refinam.',
  );
  process.exit(0);
}

const larguraNome = Math.min(46, Math.max(...achados.map((r) => r.nome.length)));
const larguraTipo = Math.min(
  42,
  Math.max(...achados.map((r) => r.tipo.length + r.subtipo.length + 1)),
);
const linha = (r: Resultado, sufixo: string) =>
  `  ${String(r.id).padStart(7)}  ${r.nome.padEnd(larguraNome)}  ` +
  `${`${r.tipo}/${r.subtipo}`.padEnd(larguraTipo)}${sufixo ? '  ' + sufixo : ''}`;

if (!salvar) {
  for (const r of achados) console.log(linha(r, ''));
  console.log(
    `\n${achados.length} item(ns)${truncou ? ' (truncado)' : ''}. Para cadastrar:\n` +
      `  npm run item -- ${achados.slice(0, 8).map((r) => r.id).join(' ')}\n` +
      `Ou de uma vez: npm run buscar -- "${termo}" --salvar`,
  );
  process.exit(0);
}

if (achados.length > MAX_SALVAR) {
  console.error(
    `\n${achados.length} resultados é demais para --salvar (limite ${MAX_SALVAR}).\n` +
      'Cada item exige abrir a ficha completa, que pesa ~400 KB. Refine a busca\n' +
      'ou use --cat= para uma categoria só.',
  );
  process.exit(1);
}

const porId = await lerBase();
let novos = 0;

for (const r of achados) {
  const ficha = await pegarFicha(r.id);
  if (!ficha) {
    console.log(`  ${r.id}: ${r.nome} — sem ficha utilizável, pulando`);
    continue;
  }

  const c = classificar(ficha);
  if (!porId.has(r.id)) novos++;
  porId.set(
    r.id,
    c.refinavel
      ? { id: r.id, nome: ficha.nome, slots: ficha.slots, kind: c.kind }
      : { id: r.id, nome: ficha.nome, slots: ficha.slots, naoRefinavel: c.motivo },
  );

  const forasteiro = ficha.servidor.startsWith('LATAM') ? '' : `  [${ficha.servidor}]`;
  console.log(
    linha(
      { ...r, nome: ficha.nome },
      `=> ${c.refinavel ? c.kind : `não refina (${c.motivo})`}${forasteiro}`,
    ),
  );

  await sleep(400);
}

console.log(
  `\nOK -> src/data/items.json (${await salvarBase(porId)} itens na base, ${novos} novo(s))`,
);
