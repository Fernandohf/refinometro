// Acesso às páginas públicas do Divine Pride: busca e ficha de item.
//
// Usado por `scripts/buscar.ts` e `scripts/fetch-item.ts`. Nada daqui roda no
// navegador — o site não manda CORS, então a base de itens é montada por CLI e
// versionada no repositório.

import { readFile, writeFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { DivinePrideItem } from '../src/data/itemKinds';

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const ITEMS_JSON = resolve(ROOT, 'src/data/items.json');

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

async function baixar(url: string): Promise<string | null> {
  const res = await fetch(url, { headers: { 'User-Agent': UA, Cookie: COOKIES } });
  if (!res.ok) {
    console.error(`  HTTP ${res.status} em ${url}`);
    return null;
  }
  return res.text();
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
    // Item sem tradução sai com a célula de nome vazia — ou contendo só o
    // marcador de slots, "[1]", que sozinho não é nome nenhum. São itens que não
    // chegaram ao LATAM; sem nome não há como reconhecê-los nem procurá-los na
    // interface, então ficam de fora.
    const nome = textoDe(m[2]!);
    if (/^(\[\d\])?$/.test(nome)) {
      semNome++;
      continue;
    }
    linhas.push({
      id: Number(m[1]),
      nome,
      tipo: textoDe(m[3]!),
      subtipo: textoDe(m[4]!),
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

// ---------------------------------------------------------------------- ficha

export type Ficha = DivinePrideItem & { servidor: string };

/**
 * Servidores cuja ficha serve, em ordem de preferência.
 *
 * O LATAM é o alvo do projeto. Os outros entram como reserva porque conteúdo
 * novo costuma chegar ao Divine Pride antes de chegar ao LATAM — melhor cadastrar
 * o item com nome em inglês do que não cadastrar.
 */
const SERVIDORES = [
  'LATAM - portuguese',
  'bRO - portuguese',
  'dpRO - english',
  'iRO - english',
  'kROS - english',
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
  let cartao = '';
  let servidor = '';
  let nome = '';
  for (const s of SERVIDORES) {
    const i = html.indexOf(s);
    if (i === -1) continue;
    const bloco = html.slice(i, i + 4000);
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

  return {
    id,
    servidor,
    nome,
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

// ------------------------------------------------------------ base de itens

export interface ItemSalvo {
  id: number;
  nome: string;
  slots: number;
  kind?: string;
  naoRefinavel?: string;
}

export async function lerBase(): Promise<Map<number, ItemSalvo>> {
  const base = JSON.parse(await readFile(ITEMS_JSON, 'utf8')) as { itens: ItemSalvo[] };
  return new Map(base.itens.map((i) => [i.id, i]));
}

export async function salvarBase(porId: Map<number, ItemSalvo>): Promise<number> {
  const itens = [...porId.values()].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
  await writeFile(
    ITEMS_JSON,
    JSON.stringify(
      {
        _fonte: 'https://www.divine-pride.net/ (páginas públicas, servidor LATAM)',
        _servidor: 'LATAM',
        _geradoEm: new Date().toISOString().slice(0, 10),
        itens,
      },
      null,
      2,
    ) + '\n',
    'utf8',
  );
  return itens.length;
}
