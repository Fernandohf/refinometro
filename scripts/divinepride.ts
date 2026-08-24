// Acesso às páginas públicas do Divine Pride: busca, varredura e ficha de item.
//
// Usado por `scripts/atualizar-base.ts` (a varredura que gera a base),
// `scripts/buscar.ts` e `scripts/fetch-item.ts`.
//
// Nada daqui roda no navegador, e não é por escolha: o site não manda
// `Access-Control-Allow-Origin` em página nenhuma, nem na API oficial, e a busca
// depende de um cookie de idioma que proxy genérico não repassa. Por isso a base
// é varrida por CLI e versionada — o README detalha as medições em "Por que a
// base é varrida, e não consultada ao vivo".

import { readFile, writeFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { DivinePrideItem } from '../src/data/itemKinds';

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const ITEMS_JSON = resolve(ROOT, 'src/data/items.json');
/** Data e tamanho da base, separados para a interface poder creditar a fonte
 *  sem baixar os milhares de itens junto. */
export const ITEMS_META_JSON = resolve(ROOT, 'src/data/itemsMeta.json');

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/126.0 Safari/537.36';

/**
 * Idioma e região do site.
 *
 * Sem isto a busca roda em coreano e devolve "0 results" para qualquer termo em
 * português — silenciosamente, como se o item não existisse. É a diferença entre
 * a busca funcionar e não funcionar, não um detalhe de cortesia.
 *
 * O site define estes cookies via POST em /account/set-preference; mandá-los
 * direto poupa o round-trip. A ficha de item não é afetada: ela traz o cartão de
 * todos os servidores de qualquer forma.
 */
const COOKIES = 'dp_language=portuguese; dp_region=LATAM';

const BASE = 'https://www.divine-pride.net';

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Baixa uma página, insistindo quando a falha parece passageira.
 *
 * A varredura completa são milhares de requisições contra um site atrás de
 * Cloudflare: 429 e 5xx acontecem, e desistir na primeira faz a base perder
 * itens em silêncio. 404 e 403 não são tentados de novo — não vão melhorar.
 */
async function baixar(url: string, tentativas = 3): Promise<string | null> {
  for (let tentativa = 1; ; tentativa++) {
    let status: number;
    try {
      const res = await fetch(url, { headers: { 'User-Agent': UA, Cookie: COOKIES } });
      if (res.ok) return res.text();
      status = res.status;
      if (status < 429) {
        console.error(`  HTTP ${status} em ${url}`);
        return null;
      }
    } catch (erro) {
      status = 0;
      if (tentativa >= tentativas) console.error(`  rede: ${(erro as Error).message} em ${url}`);
    }
    if (tentativa >= tentativas) {
      console.error(`  desisti de ${url} após ${tentativas} tentativas (último: ${status || 'rede'})`);
      return null;
    }
    await sleep(1000 * 2 ** (tentativa - 1));
  }
}

export function textoDe(html: string): string {
  return html
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/\s+/g, ' ')
    .trim();
}

// ---------------------------------------------------------------------- busca

/** Uma linha da tabela de resultados. Não traz nível nem posição. */
export interface Resultado {
  id: number;
  /** Nome em português. Nunca vazio — ver `semNome` em `Pagina`. */
  nome: string;
  tipo: string;
  subtipo: string;
  /** Cartas, lido do sufixo "[N]" do nome. */
  slots: number;
}

/**
 * Separa o nome da célula em nome limpo e número de slots.
 *
 * A célula traz as cartas grudadas no fim ("Livro nv1 [4]") e às vezes um
 * prefixo entre colchetes que NÃO é slot ("[Aluguel] Machado TE"), então só o
 * colchete final conta. Devolve `null` quando não sobra nome nenhum.
 */
export function lerNome(celula: string): { nome: string; slots: number } | null {
  const bruto = textoDe(celula);
  const m = bruto.match(/^(.*?)\s*\[(\d)\]$/);
  const nome = (m?.[1] ?? bruto).trim();
  const slots = Number(m?.[2] ?? 0);

  // Item sem tradução sai com a célula vazia — ou contendo só o marcador de
  // slots, que sozinho não é nome nenhum. São itens que não chegaram ao LATAM.
  if (!nome) return null;

  // O cartão em português de alguns itens vem preenchido com o nome coreano ou
  // japonês original. Passa pelo teste de "tem nome", mas ninguém vai procurar
  // por ele na interface, e ter Hangul na lista só suja a busca.
  if (/[぀-ヿ㐀-䶿一-鿿가-힯]/.test(nome)) return null;

  return { nome, slots };
}

/**
 * Categorias de busca do Divine Pride que podem conter algo refinável.
 *
 * `costume` fica de fora porque visual nunca refina, e `card`/`consumable`/
 * `ammo`/`other` porque não são equipamento. Dentro de `armor`, a lista de
 * subtipos exclui os Acessórios — o filtro é aplicado na origem, então o que
 * volta já é só candidato de verdade.
 *
 * Acessórios SOMBRIOS continuam entrando, pela categoria `shadow`: são a exceção
 * da regra dos acessórios e realmente refinam.
 */
export const CATEGORIAS = {
  weapon: {} as Record<string, string[]>,
  armor: { subTypes: ['Headgear', 'Armor', 'Shield', 'Garment', 'Shoes'] },
  shadow: {} as Record<string, string[]>,
};

export type Categoria = keyof typeof CATEGORIAS;

function urlDaBusca(categoria: Categoria, termo: string, pagina: number): string {
  const p = new URLSearchParams();
  p.set('query', termo);
  for (const [chave, valores] of Object.entries(CATEGORIAS[categoria])) {
    for (const v of valores) p.append(chave, v);
  }
  if (pagina > 1) p.set('page', String(pagina));
  return `${BASE}/database/item/${categoria}?${p}`;
}

/** Uma página de resultados, já parseada. */
export interface Pagina {
  /** Linhas aproveitáveis, já sem as que não têm nome em português. */
  linhas: Resultado[];
  /** Total anunciado pelo site, antes de qualquer filtro. */
  total: number;
  /** Quantas linhas foram descartadas por não terem nome traduzido. */
  semNome: number;
  paginas: number;
}

/**
 * Lê a tabela de resultados.
 *
 * Falha alto se o total anunciado não bater com o que foi possível parsear: se o
 * Divine Pride mudar o HTML, é melhor quebrar do que devolver uma lista vazia que
 * parece "nenhum item encontrado".
 */
export function parsearBusca(html: string, url = '<html>'): Pagina {
  const total = Number(html.match(/([\d.,]+)\s*results?/i)?.[1]?.replace(/[.,]/g, '') ?? NaN);
  if (!Number.isFinite(total)) {
    throw new Error(`Não achei a contagem de resultados em ${url} — o HTML do site mudou?`);
  }

  const paginas = Number(html.match(/Page\s+\d+\s+of\s+([\d.,]+)/i)?.[1]?.replace(/[.,]/g, '') ?? 1);

  const linhas: Resultado[] = [];
  const re =
    /window\.location='\/database\/item\/(\d+)'[\s\S]*?<a href="\/database\/item\/\d+"[^>]*>([\s\S]*?)<\/a>[\s\S]*?<span class="badge[^"]*">([\s\S]*?)<\/span>\s*<\/td>\s*<td>([\s\S]*?)<\/td>/g;
  let vistas = 0;
  let semNome = 0;

  for (const m of html.matchAll(re)) {
    vistas++;
    // Sem nome aproveitável não há como reconhecer nem procurar o item na
    // interface, então ele fica de fora — ver `lerNome`.
    const lido = lerNome(m[2]!);
    if (!lido) {
      semNome++;
      continue;
    }
    linhas.push({
      id: Number(m[1]),
      nome: lido.nome,
      tipo: textoDe(m[3]!),
      subtipo: textoDe(m[4]!),
      slots: lido.slots,
    });
  }

  if (total > 0 && vistas === 0) {
    throw new Error(`${url} anuncia ${total} resultados mas nenhuma linha foi parseada.`);
  }
  return { linhas, total, semNome, paginas };
}

/**
 * Busca `termo` numa categoria, seguindo a paginação até `maxPaginas`.
 *
 * Devolve também o total anunciado pelo site, para o chamador poder avisar que a
 * busca foi truncada em vez de fingir que aquilo era tudo.
 */
export async function buscar(
  categoria: Categoria,
  termo: string,
  maxPaginas: number,
): Promise<{ linhas: Resultado[]; total: number; semNome: number; vistos: number }> {
  const linhas: Resultado[] = [];
  let total = 0;
  let semNome = 0;
  let vistos = 0;

  for (let pagina = 1; pagina <= maxPaginas; pagina++) {
    const url = urlDaBusca(categoria, termo, pagina);
    const html = await baixar(url);
    if (html === null) break;

    const p = parsearBusca(html, url);
    total = p.total;
    semNome += p.semNome;
    vistos += p.linhas.length + p.semNome;
    linhas.push(...p.linhas);
    if (pagina >= p.paginas) break;
    await sleep(400);
  }

  // `vistos` conta o que a paginação entregou, com ou sem nome. É ele que diz se
  // a busca foi truncada — comparar só as linhas aproveitáveis com o total faria
  // toda busca com item sem tradução parecer truncada.
  return { linhas, total, semNome, vistos };
}

/**
 * Percorre a categoria inteira, página a página.
 *
 * É `buscar` sem termo e sem teto de páginas — o que monta a base. Vai em série
 * de propósito: são ~360 páginas somando as três categorias, e paralelizar a
 * parte barata só adiantaria segundos ao custo de bater mais forte no site.
 */
export async function varrer(
  categoria: Categoria,
  aoAvancar?: (pagina: number, paginas: number, achadas: number) => void,
  pausaMs = 250,
): Promise<{ linhas: Resultado[]; total: number; semNome: number }> {
  const linhas: Resultado[] = [];
  let total = 0;
  let semNome = 0;
  let paginas = 1;

  for (let pagina = 1; pagina <= paginas; pagina++) {
    const html = await baixar(urlDaBusca(categoria, '', pagina));
    if (html === null) break;

    const p = parsearBusca(html, urlDaBusca(categoria, '', pagina));
    total = p.total;
    paginas = p.paginas;
    semNome += p.semNome;
    linhas.push(...p.linhas);
    aoAvancar?.(pagina, paginas, linhas.length);
    if (pagina < paginas) await sleep(pausaMs);
  }

  return { linhas, total, semNome };
}

// ---------------------------------------------------------------------- ficha

export type Ficha = DivinePrideItem & { servidor: string };

/**
 * Servidores cuja ficha serve, em ordem de preferência.
 *
 * O LATAM é o alvo do projeto. Os outros entram como reserva porque conteúdo
 * novo costuma chegar ao Divine Pride antes de chegar ao LATAM — melhor cadastrar
 * o item com nome em inglês do que não cadastrar.
 *
 * A comparação é feita SEM caixa de propósito. O site já escreveu estes rótulos
 * como "LATAM - portuguese" e hoje escreve "LATAM - Portuguese"; casar exato
 * fazia toda ficha voltar vazia, e o pior é que falhava em silêncio — a
 * varredura seguia até o fim relatando "sem ficha utilizável" para 100% dos
 * itens, como se o site é que estivesse fora do ar.
 */
const SERVIDORES = [
  'LATAM - Portuguese',
  'bRO - Portuguese',
  'LATAM - English',
  'dpRO - English',
  'iRO - English',
  'kROS - English',
];

/** Extrai a ficha do item da página. Devolve `null` se a página não servir. */
export function extrairFicha(id: number, html: string): Ficha | null {
  // Tabela estruturada: Type, Sub Type, Weight...
  const ficha = new Map<string, string>();
  for (const m of html.matchAll(/<td class="text-muted">(.*?)<\/td>\s*<td>(.*?)<\/td>/gs)) {
    ficha.set(textoDe(m[1]!), textoDe(m[2]!));
  }
  const tipo = ficha.get('Type');
  if (!tipo) return null;

  // Slots saem do título, que vem no formato "Nome do Item [2]".
  const h1 = html.match(/<h1[^>]*>(.*?)<\/h1>/s);
  const slots = Number(textoDe(h1?.[1] ?? '').match(/\[(\d)\]\s*$/)?.[1] ?? 0);

  // A página traz um cartão de descrição por servidor. É dele que saem o nome
  // e as linhas de nível, então pegamos o primeiro servidor disponível na ordem
  // de preferência.
  const minusculo = html.toLowerCase();
  let cartao = '';
  let servidor = '';
  let nome = '';
  for (const s of SERVIDORES) {
    const i = minusculo.indexOf(s.toLowerCase());
    if (i === -1) continue;
    // O bloco vai até o começo do próximo cartão. Cortar por número fixo de
    // caracteres perdia o fim das descrições longas — e são justamente os itens
    // de Éter, cheios de bônus por faixa de refino, que têm as descrições longas.
    const fim = minusculo.indexOf('<div class="card"', i + 1);
    const bloco = html.slice(i, fim === -1 ? undefined : fim);
    const n = textoDe(bloco.match(/<h3[^>]*>(.*?)<\/h3>/s)?.[1] ?? '');
    if (!n) continue;
    cartao = bloco;
    servidor = s;
    nome = n;
    break;
  }
  if (!nome) return null;

  const corpo = cartao.match(/<p [^>]*>(.*?)<\/p>/s)?.[1] ?? '';
  const linhas = textoDe(corpo.replace(/<br\s*\/?>/g, '\n'))
    .split('\n')
    .map((l) => l.trim());
  // textoDe achata quebras de linha, então refazemos a divisão sobre o cru.
  const cru = corpo
    .replace(/<br\s*\/?>/g, '\n')
    .split('\n')
    .map((l) => textoDe(l))
    .filter(Boolean);
  const todas = cru.length > linhas.length ? cru : linhas;

  const acharTexto = (linhas: string[], re: RegExp): string | null => {
    for (const l of linhas) {
      const m = l.match(re);
      if (m?.[1]) return m[1].trim();
    }
    return null;
  };

  const acha = (re: RegExp): number | null => {
    for (const l of todas) {
      const m = l.match(re);
      if (m) return Number(m[1]);
    }
    return null;
  };

  // A frase vem no cartão do idioma que estivermos lendo, e `textoDe` já
  // decodificou as entidades ("N&#xE3;o" -> "Não") antes de chegar aqui.
  const negaRefino = todas.some((l) =>
    /n[ãa]o pode ser refinad|cannot be refined|no se puede refinar/i.test(l),
  );

  return {
    id,
    servidor,
    nome,
    negaRefino,
    tipo,
    subtipo: ficha.get('Sub Type') ?? '',
    // Posição do equipamento de cabeça: "Equipa em: Topo" (pt) ou
    // "Location: Upper" (en). No cartão em inglês os campos vêm colados na mesma
    // linha ("Location: Upper Weight: 40"), então o valor para no próximo rótulo.
    posicao: acharTexto(
      todas,
      /(?:Equipa em|Location)\s*:\s*(.+?)(?:\s+(?:Peso|Weight|DEF|Defense|ATQ|Attack|Classes?|Jobs)\s*:|$)/i,
    ),
    // As armas declaram "Nível da arma: N"; os equipamentos, "Nível do equip.: N".
    // Equipamento antigo não traz a linha nenhuma, e isso significa nível 1.
    nivelArma: acha(/N[íi]vel da arma:\s*(\d+)/i) ?? acha(/Weapon Level:\s*(\d+)/i),
    nivelArmadura:
      acha(/N[íi]vel do equip\.?(?:amento)?:\s*(\d+)/i) ??
      acha(/N[íi]vel da armadura:\s*(\d+)/i) ??
      acha(/(?:Armor|Equipment) Level:\s*(\d+)/i),
    slots,
  };
}

/** Baixa e parseia a ficha completa de um item. */
export async function pegarFicha(id: number): Promise<Ficha | null> {
  const html = await baixar(`${BASE}/database/item/${id}/`);
  return html === null ? null : extrairFicha(id, html);
}

/**
 * Baixa muitas fichas com concorrência e ritmo limitados.
 *
 * A ficha é o gargalo da base: ~20 KB comprimidos cada, e é a única fonte do
 * nível da arma, do nível do equipamento e da posição na cabeça — sem ela não
 * dá para dizer a categoria de refino. São milhares delas, então vale paralelizar
 * um pouco; mas `pausaMs` por trabalhador segura o ritmo em algo que um site
 * comunitário aguenta sem sentir. Devolve `null` na posição de quem falhou, para
 * o chamador poder tentar de novo no dia seguinte em vez de gravar lixo.
 */
export async function pegarFichas(
  ids: number[],
  aoConcluir?: (feitos: number, total: number, ficha: Ficha | null, id: number) => void,
  concorrencia = 4,
  pausaMs = 250,
): Promise<Map<number, Ficha | null>> {
  const fichas = new Map<number, Ficha | null>();
  let proximo = 0;
  let feitos = 0;

  const trabalhador = async () => {
    while (proximo < ids.length) {
      const id = ids[proximo++]!;
      const ficha = await pegarFicha(id);
      fichas.set(id, ficha);
      aoConcluir?.(++feitos, ids.length, ficha, id);
      if (proximo < ids.length) await sleep(pausaMs);
    }
  };

  await Promise.all(Array.from({ length: Math.min(concorrencia, ids.length) }, trabalhador));
  return fichas;
}

// ------------------------------------------------------------ base de itens

export interface ItemSalvo {
  id: number;
  nome: string;
  slots: number;
  kind?: string;
  naoRefinavel?: string;
}

/**
 * Uma linha da base: `[id, nome, slots, classe]`.
 *
 * `classe` é a categoria de refino (`w4`, `a1`, `shadowA`…) ou, quando o item
 * não refina, o motivo com `!` na frente (`!acessorio`). A tupla existe porque a
 * base passou de 17 itens escolhidos a mão para milhares varridos do site: em
 * objeto com chaves, os nomes dos campos repetidos sozinhos custariam mais que
 * todos os nomes de item juntos, e este arquivo é baixado por quem abre a
 * calculadora.
 */
export type LinhaSalva = [id: number, nome: string, slots: number, classe: string];

const codificar = (i: ItemSalvo): LinhaSalva => [
  i.id,
  i.nome,
  i.slots,
  i.kind ?? `!${i.naoRefinavel}`,
];

export function decodificar([id, nome, slots, classe]: LinhaSalva): ItemSalvo {
  return classe.startsWith('!')
    ? { id, nome, slots, naoRefinavel: classe.slice(1) }
    : { id, nome, slots, kind: classe };
}

export async function lerBase(): Promise<Map<number, ItemSalvo>> {
  const base = JSON.parse(await readFile(ITEMS_JSON, 'utf8')) as { itens: LinhaSalva[] };
  return new Map(base.itens.map((l) => [l[0], decodificar(l)]));
}

export async function salvarBase(porId: Map<number, ItemSalvo>): Promise<number> {
  const itens = [...porId.values()]
    .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))
    .map(codificar);

  const geradoEm = new Date().toISOString().slice(0, 10);

  // Uma linha por item: o arquivo tem milhares delas, e o diff do commit
  // semanal precisa mostrar o que entrou e o que saiu, não um bloco só.
  const corpo = itens.map((l) => `    ${JSON.stringify(l)}`).join(',\n');
  await writeFile(
    ITEMS_JSON,
    `{
  "_fonte": "https://www.divine-pride.net/ (páginas públicas, servidor LATAM)",
  "_servidor": "LATAM",
  "_geradoEm": ${JSON.stringify(geradoEm)},
  "_campos": ["id", "nome", "slots", "classe (categoria de refino, ou !motivo)"],
  "itens": [
${corpo}
  ]
}
`,
    'utf8',
  );

  // O mesmo cabeçalho, sozinho: a interface credita a fonte e mostra a data da
  // varredura no rodapé, e seria absurdo baixar milhares de itens para isso.
  await writeFile(
    ITEMS_META_JSON,
    JSON.stringify(
      {
        fonte: 'https://www.divine-pride.net/',
        servidor: 'LATAM',
        geradoEm,
        total: itens.length,
      },
      null,
      2,
    ) + '\n',
    'utf8',
  );

  return itens.length;
}
