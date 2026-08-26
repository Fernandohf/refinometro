// Acesso à busca de preço de mercado do site oficial do LATAM.
//
//   https://ro.gnjoylatam.com/pt/intro/shop-search/market-price
//
// É o histórico de transações reais das lojas de jogador, por servidor e por
// janela de tempo (1, 7 ou 30 dias). Usado por `scripts/precos-latam.ts`.
//
// Diferente do Divine Pride, aqui não há HTML de tabela para parsear: a página é
// Next.js e o resultado vem no payload do React Server Components, empurrado em
// pedaços por `self.__next_f.push([1,"..."])`. Os pedaços são cortados em
// posições arbitrárias — o objeto que interessa pode começar em um e terminar em
// outro —, então a leitura junta TODOS eles antes de procurar qualquer coisa.
//
// Não há API pública: varrendo os chunks de JS do site, as únicas rotas são
// `/api/apiauth/*` e `/api/logs`. O resto passa por Server Actions, que dependem
// de um id de build que muda a cada deploy. A página server-rendered é a
// superfície estável, e é nela que este módulo se apoia por padrão.
//
// A exceção é `serieDiaria`, no fim do arquivo: o histórico dia a dia só existe
// atrás de uma Server Action, e é o único jeito de cotar um item cuja média o
// site deixa dominada por uma venda fora da curva. Ela é a segunda opinião, não
// o caminho normal — ver o comentário em `descobrirAcaoDetalhe`.
//
// Nada daqui roda no navegador: o site não manda `Access-Control-Allow-Origin`.

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/126.0 Safari/537.36';

const BASE = 'https://ro.gnjoylatam.com/pt/intro/shop-search/market-price';

/** Servidores do LATAM. O site aceita um por consulta. */
export const SERVIDORES = ['FREYA', 'NIDHOGG', 'YGGDRASIL'] as const;
export type Servidor = (typeof SERVIDORES)[number];

/** Janelas que o site oferece, em dias. Qualquer outro valor volta vazio. */
export const PERIODOS = [1, 7, 30] as const;
export type Periodo = (typeof PERIODOS)[number];

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Uma linha do resultado: um item, agregado sobre a janela consultada. */
export interface Cotacao {
  itemId: number;
  /**
   * Número interno do servidor. Só serve para pedir a série diária, que exige
   * o id numérico e não o nome — ver `serieDiaria`.
   */
  svrId: number;
  nome: string;
  /**
   * Transações no período.
   *
   * É o que separa uma cotação de uma anedota: `media` é média aritmética crua,
   * sem descarte de extremo, então com poucas transações uma venda fora da curva
   * responde por quase todo o valor. Ver `veredito` em `precos-latam.ts`.
   */
  transacoes: number;
  min: number;
  media: number;
  max: number;
}

/** O que a página devolveu para uma consulta. */
export interface Resposta {
  cotacoes: Cotacao[];
  /** Total anunciado pelo site, para conferir contra o que foi parseado. */
  total: number;
}

/** O registro cru, como vem no payload. */
interface RegistroCru {
  svrId: number;
  itemId: number;
  itemName: string;
  totalItemCnt: number;
  minItemPrice: number;
  avgItemPrice: number;
  maxItemPrice: number;
}

/**
 * Remonta o payload do RSC a partir dos pedaços empurrados no HTML.
 *
 * Cada pedaço é um literal de string JSON, então `JSON.parse` resolve o escape
 * (`\"`, `\n`, `\uXXXX`) de graça. A concatenação é o ponto: procurar dentro de
 * um pedaço isolado perde todo objeto que atravessa a fronteira entre dois.
 */
function remontarPayload(html: string): string {
  const pedacos = [...html.matchAll(/self\.__next_f\.push\(\[1,("(?:[^"\\]|\\.)*")\]\)/g)];
  return pedacos.map((m) => JSON.parse(m[1]!) as string).join('');
}

/**
 * Recorta o valor JSON — objeto ou array — que começa em `inicio`.
 *
 * Regex não serve aqui: os nomes de item contêm chaves e colchetes, e o payload
 * inteiro é uma string só. Contar delimitadores respeitando aspas e escape é o
 * mínimo que lê o valor certo.
 */
function recortarJson(texto: string, inicio: number): string | null {
  const abre = texto[inicio];
  const fecha = abre === '{' ? '}' : ']';
  let profundidade = 0;
  let emString = false;
  let escapado = false;

  for (let i = inicio; i < texto.length; i++) {
    const c = texto[i]!;
    if (escapado) {
      escapado = false;
    } else if (c === '\\') {
      escapado = true;
    } else if (c === '"') {
      emString = !emString;
    } else if (!emString) {
      if (c === abre) profundidade++;
      else if (c === fecha && --profundidade === 0) return texto.slice(inicio, i + 1);
    }
  }
  return null;
}

/**
 * Lê as cotações do HTML da página.
 *
 * Falha alto quando o bloco `queryParams`/`list` não aparece: a alternativa é
 * devolver lista vazia, que é indistinguível de "este item não foi negociado" —
 * e foi exatamente esse o modo de falha silenciosa que já custou uma base
 * inteira na varredura do Divine Pride. Lista vazia COM o bloco presente é
 * resposta legítima, e sai como `cotacoes: []`.
 */
export function parsearMercado(html: string, url = '<html>'): Resposta {
  const payload = remontarPayload(html);
  const marca = payload.indexOf('{"queryParams":');
  if (marca === -1) {
    throw new Error(
      `Não achei o bloco de resultados em ${url} — o site mudou o formato do payload.`,
    );
  }

  const bruto = recortarJson(payload, marca);
  if (bruto === null) throw new Error(`O bloco de resultados de ${url} está truncado.`);

  let bloco: { list?: RegistroCru[]; totalCount?: number };
  try {
    bloco = JSON.parse(bruto);
  } catch (erro) {
    throw new Error(`O bloco de resultados de ${url} não é JSON válido: ${(erro as Error).message}`);
  }

  const lista = bloco.list ?? [];
  const total = bloco.totalCount ?? lista.length;
  if (total > 0 && lista.length === 0) {
    throw new Error(`${url} anuncia ${total} resultados mas a lista veio vazia.`);
  }

  return {
    total,
    cotacoes: lista.map((r) => ({
      itemId: r.itemId,
      svrId: r.svrId,
      nome: r.itemName,
      transacoes: r.totalItemCnt,
      min: r.minItemPrice,
      media: r.avgItemPrice,
      max: r.maxItemPrice,
    })),
  };
}

export function urlDaConsulta(termo: string, servidor: Servidor, periodo: Periodo): string {
  const p = new URLSearchParams({
    serverType: servidor,
    period: String(periodo),
    searchWord: termo,
  });
  return `${BASE}?${p}`;
}

/**
 * Baixa uma página, insistindo quando a falha parece passageira.
 *
 * Mesmo critério da varredura do Divine Pride: 429 e 5xx podem melhorar na
 * próxima; 404 e 403 não vão.
 */
async function baixar(url: string, tentativas = 3): Promise<string | null> {
  for (let tentativa = 1; ; tentativa++) {
    let status: number;
    try {
      const res = await fetch(url, { headers: { 'User-Agent': UA } });
      if (res.ok) return res.text();
      status = res.status;
      if (status < 429) {
        console.error(`  HTTP ${status} em ${url}`);
        return null;
      }
    } catch (erro) {
      status = 0;
      if (tentativa >= tentativas) console.error(`  rede: ${(erro as Error).message}`);
    }
    if (tentativa >= tentativas) {
      console.error(`  desisti de ${url} após ${tentativas} tentativas (último: ${status || 'rede'})`);
      return null;
    }
    await sleep(1000 * 2 ** (tentativa - 1));
  }
}

/**
 * Consulta um termo. A busca é por trecho do nome, então um termo devolve o
 * item procurado e os parentes dele — o chamador casa por `itemId`.
 *
 * Devolve `null` só quando a requisição não completou; busca sem resultado é
 * uma `Resposta` com `cotacoes: []`.
 */
export async function consultar(
  termo: string,
  servidor: Servidor,
  periodo: Periodo,
): Promise<Resposta | null> {
  const url = urlDaConsulta(termo, servidor, periodo);
  const html = await baixar(url);
  return html === null ? null : parsearMercado(html, url);
}

// -------------------------------------------------------------- série diária

/**
 * Um dia do histórico de um item.
 *
 * `media` já é uma média do dia — um dia com uma venda de 10M e outra de 1k
 * reporta 5M. É por isso que `unidades` importa: ela é o peso que impede um dia
 * de três transações de valer o mesmo que um de trezentas.
 */
export interface DiaDeMercado {
  data: string;
  min: number;
  media: number;
  max: number;
  unidades: number;
}

/**
 * O preço em que metade das unidades do período foi negociada.
 *
 * Existe porque a média do site não descarta extremo, e em item raso uma venda
 * fora da curva decide o número sozinha: o Carnium saiu a 495.977 na média de 30
 * dias por causa de três vendas milionárias, enquanto os dias de volume alto
 * negociaram a ~2.000. A mediana ponderada não escolhe janela nem descarta nada
 * à mão — ela simplesmente não enxerga o extremo, porque ele não é onde está a
 * metade do volume.
 *
 * Devolve `null` para série vazia, que não tem mediana nenhuma.
 */
export function medianaPonderada(dias: DiaDeMercado[]): number | null {
  const total = dias.reduce((s, d) => s + d.unidades, 0);
  if (dias.length === 0 || total <= 0) return null;

  const ordenados = [...dias].sort((a, b) => a.media - b.media);
  let acumulado = 0;
  for (const d of ordenados) {
    acumulado += d.unidades;
    if (acumulado >= total / 2) return d.media;
  }
  // Inalcançável — o laço acima sempre chega à metade —, mas o tipo não sabe.
  return ordenados.at(-1)!.media;
}

/** O registro cru de um dia, como vem na resposta da Server Action. */
interface DiaCru {
  nowDate: string;
  minItemPrice: number;
  maxItemPrice: number;
  avgItemPrice: number;
  itemCnt: number;
}

/**
 * Id da Server Action que serve o detalhe do item, no build de hoje.
 *
 * Descoberto em tempo de execução, e não fixado no código, porque ele muda a
 * cada deploy do site: o Next deriva esse hash do arquivo que define a action.
 * Fixá-lo faria a série diária parar de funcionar na primeira atualização do
 * site, e — pior — parar em silêncio, com o servidor devolvendo a página inteira
 * em vez de um erro.
 *
 * É o trecho mais frágil deste módulo, e é de propósito que ele só é usado como
 * segunda opinião: a página SSR responde por todo item de mercado normal.
 */
let acaoDetalhe: string | null | undefined;

async function descobrirAcaoDetalhe(): Promise<string | null> {
  if (acaoDetalhe !== undefined) return acaoDetalhe;

  const html = await baixar(urlDaConsulta('Oridecon', 'FREYA', 30));
  const chunks = html
    ? [...new Set([...html.matchAll(/\/_next\/static\/chunks\/[^"']+?\.js/g)].map((m) => m[0]))]
    : [];

  for (const caminho of chunks) {
    const js = await baixar(`https://ro.gnjoylatam.com${caminho}`);
    const m = js?.match(/createServerReference\)?\(\s*"([0-9a-f]{40,})"[^)]*?"getDetail"/);
    if (m) {
      acaoDetalhe = m[1]!;
      return acaoDetalhe;
    }
  }

  acaoDetalhe = null;
  return null;
}

/**
 * Baixa o histórico diário de um item.
 *
 * Vem de uma Server Action (`getDetail`), não da página: é um POST com o header
 * `Next-Action`, e a resposta é um fluxo RSC com o JSON embutido. Não é API
 * pública nem documentada — ver `descobrirAcaoDetalhe`.
 *
 * `svrId` é o número interno do servidor, e sai do próprio resultado da busca:
 * pedir a série de um item que nunca apareceu numa consulta não teria como
 * saber esse número, e é mais uma razão para a série ser só segunda opinião.
 *
 * Devolve `null` quando a série não pôde ser lida, e `[]` quando o item
 * simplesmente não tem histórico.
 */
export async function serieDiaria(itemId: number, svrId: number): Promise<DiaDeMercado[] | null> {
  const acao = await descobrirAcaoDetalhe();
  if (acao === null) return null;

  let texto: string;
  try {
    const res = await fetch(urlDaConsulta('Oridecon', 'FREYA', 30), {
      method: 'POST',
      headers: {
        'User-Agent': UA,
        'Next-Action': acao,
        'Content-Type': 'text/plain;charset=UTF-8',
      },
      // O limite alto pega a janela inteira de uma vez; o site pagina de 10 em
      // 10 porque desenha uma tabela, e nós queremos a série toda.
      body: JSON.stringify([{ type: 'price', params: { itemId, svrId, page: 1, limit: 100 } }]),
    });
    if (!res.ok) return null;
    texto = await res.text();
  } catch {
    return null;
  }

  const marca = texto.indexOf('"priceDetailDayList":');
  if (marca === -1) return null;

  const bruto = recortarJson(texto, texto.indexOf('[', marca));
  if (bruto === null) return null;

  try {
    return (JSON.parse(bruto) as DiaCru[]).map((d) => ({
      data: d.nowDate,
      min: d.minItemPrice,
      media: d.avgItemPrice,
      max: d.maxItemPrice,
      unidades: d.itemCnt,
    }));
  } catch {
    return null;
  }
}
