// Varre o Divine Pride inteiro e regrava src/data/items.json.
//
//   npm run data:items                    varredura incremental (o que roda no CI)
//   npm run data:items -- --forcar        reconfere a ficha de todo mundo
//   npm run data:items -- --so=shadow     uma categoria só
//   npm run data:items -- --limite=50     teto de fichas, para experimentar
//
// A base cobre as três categorias que podem conter algo refinável: armas,
// equipamentos (sem acessório, sem visual) e sombrios. São ~7.100 linhas de
// listagem, das quais ~80% têm nome em português — o resto não chegou ao LATAM
// e fica de fora, porque sem nome ninguém acha o item na busca.
//
// O gasto está nas fichas, não nas listagens. A listagem resolve os sombrios
// sozinha; arma, armadura e chapéu exigem abrir a ficha (~20 KB comprimidos)
// para saber nível e posição. Por isso a varredura é INCREMENTAL: quem já está
// na base com categoria resolvida não é baixado de novo. A primeira execução
// leva ~18 min; as seguintes, o tempo de baixar as listagens mais as fichas do
// que entrou na semana.
//
// `--forcar` existe porque o incremental tem um ponto cego: se o Divine Pride
// corrigir o nível de uma arma já cadastrada, só uma reconferência completa vê.

import { classificar, classificarPelaListagem } from '../src/data/itemKinds';
import {
  CATEGORIAS,
  lerBase,
  pegarFichas,
  salvarBase,
  varrer,
  type Categoria,
  type ItemSalvo,
  type Resultado,
} from './divinepride';

const args = process.argv.slice(2);
const num = (nome: string, padrao: number) =>
  Number(args.find((a) => a.startsWith(`--${nome}=`))?.split('=')[1] ?? padrao);

const forcar = args.includes('--forcar');
const limite = num('limite', Infinity);
// ~5 requisições por segundo. O Divine Pride aguenta muito mais, mas é um site
// comunitário e gratuito, e a varredura completa roda uma vez por semana.
const concorrencia = num('concorrencia', 3);
const pausa = num('pausa', 300);
const so = args.find((a) => a.startsWith('--so='))?.split('=')[1]?.split(',') as
  | Categoria[]
  | undefined;

const categorias = so ?? (Object.keys(CATEGORIAS) as Categoria[]);
for (const c of categorias) {
  if (!(c in CATEGORIAS)) {
    console.error(`Categoria desconhecida: ${c}. Use ${Object.keys(CATEGORIAS).join(', ')}.`);
    process.exit(1);
  }
}

const guardar = (r: Resultado, c: ReturnType<typeof classificar>): ItemSalvo =>
  c.refinavel
    ? { id: r.id, nome: r.nome, slots: r.slots, kind: c.kind }
    : { id: r.id, nome: r.nome, slots: r.slots, naoRefinavel: c.motivo };

// ------------------------------------------------------------------ listagens

const base = await lerBase();
const anteriores = base.size;
const linhas: Resultado[] = [];

for (const categoria of categorias) {
  process.stdout.write(`${categoria}: `);
  const r = await varrer(categoria, (pagina, paginas, achadas) => {
    if (pagina % 20 === 0 || pagina === paginas) {
      process.stdout.write(`${pagina}/${paginas} (${achadas}) `);
    }
  });
  linhas.push(...r.linhas);
  console.log(`\n  ${r.linhas.length} com nome, ${r.semNome} sem tradução, ${r.total} no site`);
}

if (linhas.length === 0) {
  console.error('Nenhuma linha veio das listagens. Não vou apagar a base com isso.');
  process.exit(1);
}

// ---------------------------------------------------------- o que a ficha deve

// A varredura reconstrói a base do zero a partir do que o site lista hoje:
// item que sumiu da listagem sai daqui também. Só o que a listagem não decide
// sozinha é procurado no cache antes de virar requisição.
const resolvidos = new Map<number, ItemSalvo>();
const pendentes: Resultado[] = [];
let daListagem = 0;
let doCache = 0;

for (const linha of linhas) {
  const c = classificarPelaListagem(linha);
  if (c) {
    resolvidos.set(linha.id, guardar(linha, c));
    daListagem++;
    continue;
  }

  const salvo = base.get(linha.id);
  if (salvo && !forcar) {
    // Nome e slots vêm sempre da listagem de hoje — é ela que carrega a
    // tradução mais recente. Do cache aproveita-se só a categoria, que é a
    // parte cara.
    resolvidos.set(linha.id, { ...salvo, nome: linha.nome, slots: linha.slots });
    doCache++;
    continue;
  }
  pendentes.push(linha);
}

const alvos = pendentes.slice(0, limite === Infinity ? undefined : limite);
console.log(
  `\n${linhas.length} itens: ${daListagem} pela listagem, ${doCache} já na base, ` +
    `${alvos.length} ficha(s) a baixar${alvos.length < pendentes.length ? ` (de ${pendentes.length}, limitado)` : ''}.`,
);

// ---------------------------------------------------------------------- fichas

const porId = new Map(alvos.map((l) => [l.id, l]));
let falhas = 0;

if (alvos.length > 0) {
  const inicio = Date.now();
  const fichas = await pegarFichas(
    alvos.map((l) => l.id),
    (feitos, total) => {
      if (feitos % 100 === 0 || feitos === total) {
        const s = (Date.now() - inicio) / 1000;
        const falta = ((s / feitos) * (total - feitos)) / 60;
        console.log(`  ${feitos}/${total} fichas — ${s.toFixed(0)}s, faltam ~${falta.toFixed(0)} min`);
      }
    },
    concorrencia,
    pausa,
  );

  for (const [id, ficha] of fichas) {
    const linha = porId.get(id)!;
    if (!ficha) {
      // Ficha que não veio não vira entrada: sem ela a categoria seria um chute,
      // e deixar o item de fora faz a próxima execução tentar de novo.
      falhas++;
      continue;
    }
    // A classificação sai da ficha, que é quem sabe nível e posição; nome e
    // slots saem da listagem, que é quem traz a tradução do LATAM — a ficha cai
    // para o cartão em inglês quando o item ainda não foi traduzido.
    resolvidos.set(id, guardar(linha, classificar(ficha)));
  }
}

// ----------------------------------------------------------------- fechamento

// O que não foi resolvido nesta passada volta do arquivo anterior — ficha que
// falhou ou que o --limite não alcançou não pode apagar um item já cadastrado.
//
// Sumir da listagem é o único jeito de sair da base, e só uma varredura das três
// categorias tem autoridade para dizer isso: com --so, o que não foi varrido
// fica intocado, senão pedir "só os sombrios" apagaria todas as armas.
const vistos = new Set(linhas.map((l) => l.id));
const podePodar = !so;
let mantidos = 0;
let sumidos = 0;

for (const [id, salvo] of base) {
  if (resolvidos.has(id)) continue;
  if (podePodar && !vistos.has(id)) {
    sumidos++;
    continue;
  }
  resolvidos.set(id, salvo);
  mantidos++;
}

// Duas travas contra o modo de falha que já aconteceu de verdade: o site mudou a
// caixa do rótulo de servidor, `extrairFicha` passou a devolver `null` para tudo,
// e a varredura seguiu até o fim sem um único erro de HTTP — gravando uma base
// só com os sombrios, que são os que não precisam de ficha. Nada quebrou, nada
// avisou, e o CI teria comitado aquilo.
if (alvos.length >= 20 && falhas > alvos.length * 0.2) {
  console.error(
    `\n${falhas} de ${alvos.length} fichas não puderam ser lidas (${((100 * falhas) / alvos.length).toFixed(0)}%).\n` +
      'Isso não é rede: é o HTML do Divine Pride tendo mudado. Conserte `extrairFicha`\n' +
      'antes de gravar — a base atual foi preservada.',
  );
  process.exit(1);
}

if (anteriores > 100 && resolvidos.size < anteriores * 0.8) {
  console.error(
    `\nA base cairia de ${anteriores} para ${resolvidos.size} itens. É queda demais para\n` +
      'ser rotatividade do jogo; algo na varredura falhou. A base atual foi preservada.',
  );
  process.exit(1);
}

const total = await salvarBase(resolvidos);
const porClasse = new Map<string, number>();
for (const i of resolvidos.values()) {
  const k = i.kind ?? `não refina (${i.naoRefinavel})`;
  porClasse.set(k, (porClasse.get(k) ?? 0) + 1);
}

console.log(`\nOK -> src/data/items.json — ${total} itens (antes: ${anteriores})`);
for (const [k, n] of [...porClasse].sort((a, b) => b[1] - a[1])) console.log(`  ${String(n).padStart(5)}  ${k}`);
if (mantidos > 0) {
  console.log(`  (${mantidos} mantidos da base anterior, não reconferidos nesta passada)`);
}
if (sumidos > 0) console.log(`  (${sumidos} saíram: o site não lista mais)`);
if (falhas > 0) console.log(`\n${falhas} ficha(s) não vieram; a próxima execução tenta de novo.`);
