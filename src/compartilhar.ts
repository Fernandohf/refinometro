/*
  O link de uma simulação.

  A pergunta inteira — item, alvo, condições, preços e o que se tem na mochila —
  viaja no fragmento do endereço, `#s=…`, comprimida. Não há servidor: o site é
  estático, e o fragmento nem chega a ser pedido ao GitHub Pages. Quem abre o
  link roda a mesma conta, com a mesma semente, e vê os mesmos números.

  Os preços vão TODOS, e não só os que a pessoa mexeu. A cotação de partida
  muda todo dia (`precos.yml`), e um link que levasse só as diferenças daria
  outro orçamento na semana seguinte — que é exatamente quando alguém volta a
  ele para conferir. Congelados, comprimem bem: as 84 cotações cabem em ~450
  bytes.

  O formato tem versão (`v`). Campo que a calculadora ganhar depois cai no valor
  inicial, como já acontece com o `localStorage`; o que mudar de sentido pede
  um `v: 2` e um leitor para o `v: 1`.
*/

import { COTACAO } from './data/defaultPrices';
import { GRADE_ORDER } from './data/grade';
import { CATEGORIAS } from './data/rotulos';
import { CHAVE_ESTOQUE, CHAVE_STORAGE, INICIAL, type Estado } from './estado';
import type { EstoqueSalvo } from './components/Estoque';
import type { PriceTable } from './engine/types';

const VERSAO = 1;

/** O começo do fragmento. Âncoras da página (`#apoie`) não começam assim. */
const PREFIXO = '#s=';

/**
 * Teto do que se aceita ler. Um link de verdade tem ~1 KB comprimido e ~3 KB
 * aberto; os tetos existem para um link forjado não fazer o navegador
 * descomprimir megabytes antes de a página aparecer.
 */
const MAX_CODIGO = 16_000;
const MAX_ABERTO = 200_000;

interface Pacote {
  v: number;
  /** A pergunta. */
  e: Estado;
  /** A mochila do "Dá com o que eu tenho?". */
  k: EstoqueSalvo;
  /** A cotação de partida de quem compartilhou, para a tela dizer de quando são os preços. */
  c: string;
}

/** O que a tela precisa saber de uma simulação que chegou por link. */
export interface Compartilhada {
  /** Data da cotação de partida de quem compartilhou (ISO). */
  cotacao: string;
}

export async function codificar(estado: Estado, estoque: EstoqueSalvo): Promise<string> {
  const pacote: Pacote = { v: VERSAO, e: estado, k: estoque, c: COTACAO.geradoEm };
  const bytes = await transformar(new TextEncoder().encode(JSON.stringify(pacote)), new CompressionStream('deflate-raw'));
  // Sem teto, `transformar` nunca desiste.
  return paraBase64Url(bytes!);
}

/** Devolve `null` para qualquer coisa que não seja um link válido desta calculadora. */
export async function decodificar(codigo: string): Promise<Pacote | null> {
  if (codigo.length === 0 || codigo.length > MAX_CODIGO) return null;
  try {
    const bytes = await transformar(deBase64Url(codigo), new DecompressionStream('deflate-raw'), MAX_ABERTO);
    if (!bytes) return null;
    const bruto: unknown = JSON.parse(new TextDecoder().decode(bytes));
    if (!objeto(bruto) || bruto.v !== VERSAO) return null;
    return {
      v: VERSAO,
      e: sanearEstado(bruto.e),
      k: sanearEstoque(bruto.k),
      c: typeof bruto.c === 'string' && /^\d{4}-\d{2}-\d{2}/.test(bruto.c) ? bruto.c : COTACAO.geradoEm,
    };
  } catch {
    return null;
  }
}

/** O endereço desta página com a simulação no fragmento. */
export function linkDe(codigo: string): string {
  return `${location.origin}${location.pathname}${PREFIXO}${codigo}`;
}

/**
 * Lê a simulação do endereço, se houver uma, e a põe no lugar da salva.
 *
 * Roda ANTES de o React montar (`main.tsx`): o app lê o `localStorage` no
 * inicializador do `useState`, e escrever ali primeiro é o que faz a
 * simulação compartilhada aparecer já no primeiro quadro, sem mostrar por um
 * instante a que estava salva. Sobrescrever a salva é decisão, não descuido —
 * abrir o link é pedir para ver aquela conta.
 *
 * O fragmento sai do endereço depois de lido. Ficando, um F5 depois de mexer
 * em qualquer campo desfaria a mudança, e o link copiado da barra seria o de
 * quem mandou, não o da conta que está na tela.
 */
export async function lerDoEndereco(): Promise<Compartilhada | null> {
  if (!location.hash.startsWith(PREFIXO)) return null;
  const pacote = await decodificar(location.hash.slice(PREFIXO.length));
  history.replaceState(null, '', location.pathname + location.search);
  if (!pacote) return null;
  try {
    localStorage.setItem(CHAVE_STORAGE, JSON.stringify(pacote.e));
    localStorage.setItem(CHAVE_ESTOQUE, JSON.stringify(pacote.k));
  } catch {
    // Sem armazenamento (aba privada com cota zero) não há como passar a conta ao app.
    return null;
  }
  return { cotacao: pacote.c };
}

/* ─────────────────────────────────────────────── conferência campo a campo */

// O link é texto que qualquer um escreve. Nada dele entra na tela sem passar por
// aqui: campo desconhecido é descartado, campo de tipo errado volta ao inicial.

function objeto(x: unknown): x is Record<string, unknown> {
  return typeof x === 'object' && x !== null && !Array.isArray(x);
}

const numero = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x) && x >= 0;
const inteiro = (x: unknown): x is number => numero(x) && Number.isInteger(x);

const CATEGORIAS_VALIDAS = new Set<string>(CATEGORIAS.map((c) => c.key));
const GRAUS_VALIDOS = new Set<string>(GRADE_ORDER);
const MARGENS_VALIDAS = new Set<string>(['p50', 'p75', 'p90', 'p95', 'p99']);

function sanearEstado(x: unknown): Estado {
  const e = objeto(x) ? x : {};
  const ou = <T>(valido: boolean, v: unknown, padrao: T): T => (valido ? (v as T) : padrao);
  const bool = (k: keyof Estado) => ou(typeof e[k] === 'boolean', e[k], INICIAL[k] as boolean);

  return {
    itemNome: e.itemNome === null ? null : ou(typeof e.itemNome === 'string' && e.itemNome.length <= 200, e.itemNome, INICIAL.itemNome),
    itemId: e.itemId === null ? null : ou(inteiro(e.itemId), e.itemId, INICIAL.itemId),
    itemSlots: ou(inteiro(e.itemSlots) && e.itemSlots <= 4, e.itemSlots, INICIAL.itemSlots),
    kind: ou(CATEGORIAS_VALIDAS.has(e.kind as string), e.kind, INICIAL.kind),
    precoItem: ou(numero(e.precoItem), e.precoItem, INICIAL.precoItem),
    // O teto de cada categoria é do app: o efeito que normaliza a categoria já
    // corta o refino ao máximo dela.
    refinoAtual: ou(inteiro(e.refinoAtual) && e.refinoAtual <= 20, e.refinoAtual, INICIAL.refinoAtual),
    refinoAlvo: ou(inteiro(e.refinoAlvo) && e.refinoAlvo <= 20, e.refinoAlvo, INICIAL.refinoAlvo),
    grauAtual: ou(GRAUS_VALIDOS.has(e.grauAtual as string), e.grauAtual, INICIAL.grauAtual),
    grauAlvo: ou(GRAUS_VALIDOS.has(e.grauAlvo as string), e.grauAlvo, INICIAL.grauAlvo),
    evento: bool('evento'),
    usarBencaoFerreiro: bool('usarBencaoFerreiro'),
    usarMineriosEspeciais: bool('usarMineriosEspeciais'),
    perdaAceitavel: bool('perdaAceitavel'),
    usarAtalhos: bool('usarAtalhos'),
    precos: sanearTabela(e.precos),
    margem: ou(MARGENS_VALIDAS.has(e.margem as string), e.margem, INICIAL.margem),
  };
}

function sanearEstoque(x: unknown): EstoqueSalvo {
  const k = objeto(x) ? x : {};
  return {
    zeny: numero(k.zeny) ? k.zeny : 0,
    itens: sanearTabela(k.itens),
    copias: inteiro(k.copias) && k.copias >= 1 ? k.copias : 1,
    alvo: numero(k.alvo) && k.alvo < 1 ? k.alvo : 0.9,
    assinatura: typeof k.assinatura === 'string' ? k.assinatura : '',
  };
}

/** Id de item → quantidade ou zeny. Só chaves numéricas e valores numéricos. */
function sanearTabela(x: unknown): PriceTable {
  if (!objeto(x)) return {};
  const tabela: PriceTable = {};
  for (const [id, v] of Object.entries(x)) {
    if (/^\d{1,9}$/.test(id) && numero(v)) tabela[Number(id)] = v;
  }
  return tabela;
}

/* ─────────────────────────────────────────────────────────── bytes e texto */

/**
 * Passa os bytes por um compressor ou descompressor de fluxo. Com `teto`,
 * desiste (devolve `null`) assim que a saída passa dele.
 */
async function transformar(
  entrada: Uint8Array<ArrayBuffer>,
  fluxo: CompressionStream | DecompressionStream,
  teto = Infinity,
): Promise<Uint8Array | null> {
  const escrita = fluxo.writable.getWriter();
  void escrita.write(entrada).then(() => escrita.close()).catch(() => {});
  const leitor = fluxo.readable.getReader();
  const pedacos: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await leitor.read();
    if (done) break;
    total += value.byteLength;
    if (total > teto) {
      void leitor.cancel();
      return null;
    }
    pedacos.push(value);
  }
  const saida = new Uint8Array(total);
  let i = 0;
  for (const p of pedacos) {
    saida.set(p, i);
    i += p.byteLength;
  }
  return saida;
}

// Base64 de URL (RFC 4648 §5): `-` e `_` no lugar de `+` e `/`, sem `=`. Os três
// atravessam WhatsApp e Discord sem virar `%2B`, e o link continua clicável inteiro.

function paraBase64Url(bytes: Uint8Array): string {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function deBase64Url(texto: string): Uint8Array<ArrayBuffer> {
  const bin = atob(texto.replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}
