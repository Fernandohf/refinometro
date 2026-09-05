// Cota os materiais de refino pelo histórico de transações do site do LATAM e
// regrava `src/data/precos.json`, que é de onde saem os preços de partida.
//
//   npm run precos                          FREYA, 7d contra 30d, 1d por cima
//   npm run precos -- --servidor=NIDHOGG    outro servidor
//   npm run precos -- --tolerancia=2        aceitar mais divergência entre as janelas
//   npm run precos -- --simular             só mostra a tabela, não grava
//
// O arquivo gravado carrega a data da execução (`_geradoEm`) e a data de cada
// cotação (`cotadoEm`) — as duas são diferentes de propósito: item que ninguém
// negociou nesta semana mantém a cotação boa da semana passada em vez de sumir,
// e a data antiga é o que denuncia isso.
//
// `src/data/defaultPrices.ts` lê esse arquivo e o usa por cima dos chutes
// escritos à mão. Nada disso decide o cálculo: são os valores que aparecem no
// campo antes de o jogador digitar o preço que ele está vendo.
//
// ------------------------------------------------------------------ o cuidado
//
// O site publica `avgItemPrice`, e a tentação é copiar direto. Não dá: é média
// aritmética crua sobre a janela, sem descarte de extremo. Em item líquido isso
// é inofensivo; em item raso, uma venda solta decide o número sozinha.
//
// Medido em 26/08/2026, FREYA, comparando as janelas de 7 e de 30 dias:
//
//   Oridecon             82.899 transações    22.113  →     21.145    estável
//   Bênção do Ferreiro  112.514 transações 3.159.391  →  3.774.213    estável
//   Carnium               1.101 transações     8.821  →    495.977    56x
//   Minério de Oridecon   2.141 transações     3.030  →     32.931    11x
//
// O Minério de Oridecon a 32.931 é impossível: cinco minérios viram um Oridecon,
// que sai a 21.145. Uma venda a 4.000.000 (o `max` do período) puxou a média
// sozinha, e o chute que já estava no arquivo — 4.000 — era mais honesto que a
// "média de 30 dias" do site.
//
// Daí a regra: a média de 30 dias só é aceita se a de 7 dias concordar com ela
// dentro de `--tolerancia`. Não é sofisticado, mas separa preço de anedota.
//
// ------------------------------------------------------------- o erro oposto
//
// A regra acima cuida do item raso, onde uma venda solta decide a média. O erro
// contrário mora no item líquido: a média de 30 dias continua certa sobre o mês
// e errada sobre hoje, porque carrega com peso de mês o preço de antes da alta.
// Medido em 05/09/2026, FREYA:
//
//                  transações 30d    média 30d    média 7d    transações 1d   média 1d
//   Pó de Éter          1.380.959      104.070     158.304           66.127    145.677
//   Oridecon              103.524       27.217      22.039            3.025     22.069
//
// O Pó de Éter subiu 40% e o mês ainda não sabe. O Oridecon nem subiu: o mês
// dele é que está errado, e é aí que a defesa da janela longa cai. Ela não é
// mais robusta por ser longa — junta trinta vezes mais transações, mas junta
// também trinta vezes mais vendas fora da curva, e nem 103 mil transações
// impediram o mês de fechar 24% acima do que a semana e o dia cobraram. O que
// protege uma média é o volume DENTRO da janela, e mil transações num dia
// protegem tanto quanto mil num mês.
//
// Daí `VOLUME_DIARIO` e `OSCILACAO`: volume suficiente para a média do dia não
// ser anedota, e distância suficiente entre o dia e a janela longa para valer
// trocar o número mais estável pelo número de agora. Item líquido e parado
// continua cotado pela janela longa — mesmo preço, muito mais transações.
//
// Para quem a regra recusa há uma segunda opinião. O histórico dia a dia — que
// só existe atrás de uma Server Action, ver `serieDiaria` — traz o VOLUME de
// cada dia, e com ele dá para perguntar em que preço metade das unidades foi
// negociada. O Carnium sai de 495.977 para ~2.000, que é o que os dias de 300
// unidades cobraram, e as três vendas milionárias de uma a três unidades cada
// deixam de decidir sozinhas. Nos itens líquidos a mediana quase não muda nada
// (Oridecon: 21.149 contra 19.941), o que é o teste de que ela não distorce o
// que já estava bom.
//
// A mediana não entra no caminho normal, e por dois motivos: ela custa uma
// requisição por item num endpoint interno e frágil, e ser imune a outlier não é
// ser imune à falta de mercado — com três dias de histórico ela devolve um dos
// três números. Daí `DIAS_MINIMOS` e `UNIDADES_MINIMAS`.

import { readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { DEFAULT_PRICES, PRICE_FIELDS } from '../src/data/defaultPrices';
import {
  consultar,
  medianaPonderada,
  PERIODOS,
  serieDiaria,
  SERVIDORES,
  sleep,
  type Cotacao,
  type DiaDeMercado,
  type Periodo,
  type Servidor,
} from './latam';

// --------------------------------------------------------------------- ajustes

const PRECOS_JSON = resolve(dirname(fileURLToPath(import.meta.url)), '../src/data/precos.json');

/** Abaixo disto, a cotação sai marcada: agrega poucas transações. */
const LIQUIDEZ_MINIMA = 1_000;

/** A janela de um dia, que é de onde sai a média diária. Não é configurável. */
const DIARIA: Periodo = 1;

/**
 * Transações num único dia para a média daquele dia valer como cotação.
 *
 * É de propósito o mesmo número de `LIQUIDEZ_MINIMA`: a linha entre cotação e
 * anedota não muda de lugar por a janela ser mais curta. Neste mercado mil
 * negócios em 24 horas é volume alto de verdade — dos 34 materiais do
 * formulário, oito chegam lá, e o Pó de Éter faz isso sessenta vezes.
 *
 * O que o piso não cobre: um dia com mil transações E uma venda no teto da
 * plataforma (10.000.000, que aparece no `max` de vários itens) sai com a média
 * ~15% alta, e a regra a publicaria. É o preço de partida de um campo que o
 * jogador edita, dura um dia, e vale menos que o erro do lado oposto — publicar
 * o preço do mês passado todo dia, para sempre.
 */
const VOLUME_DIARIO = LIQUIDEZ_MINIMA;

/**
 * Distância entre o dia e o mês para o dia valer mais que o mês.
 *
 * Abaixo disto o item está parado, e a média longa é o número melhor: ela vê o
 * mesmo preço com trinta vezes mais transações. Acima, o preço andou, e a média
 * longa está descrevendo um mercado que não existe mais.
 */
const OSCILACAO = 1.15;

/**
 * Piso de cotações aceitas para o arquivo poder ser regravado.
 *
 * A varredura do Divine Pride já mostrou o modo de falha que importa: o site
 * muda, o parser passa a devolver vazio, nada estoura, e o commit automático
 * grava a base zerada. Aqui seria pior ainda, porque uma tabela vazia não parece
 * quebrada — parece mercado parado.
 */
const MINIMO_PARA_GRAVAR = 8;

/**
 * Piso para a mediana ponderada valer como cotação.
 *
 * A mediana é imune a uma venda fora da curva, não à falta de mercado: com dois
 * dias de histórico ela devolve um dos dois números, e a robustez é ilusão. O
 * Topázio de Éter tem 3 dias e 17 unidades em 30 dias — para ele nenhum
 * estimador serve, e o chute escrito à mão continua sendo a resposta honesta.
 */
const DIAS_MINIMOS = 5;
const UNIDADES_MINIMAS = 100;

/**
 * Itens que não são vendidos avulsos, só em caixa fechada.
 *
 * O Oridecon e o Elunium Enriquecido vêm de JoyCoins e chegam ao mercado como
 * `Cx ... [10]`; procurar pelo nome do minério não devolve nada. O preço
 * unitário sai da caixa dividida, e é uma cotação pior que as outras: são poucas
 * caixas negociadas, e quem compra a caixa inteira não paga o mesmo por unidade.
 */
const CAIXAS: Record<number, { itemId: number; termo: string; unidades: number }> = {
  7620: { itemId: 22598, termo: 'Cx Oridecon Enriquecido', unidades: 10 },
  7619: { itemId: 22599, termo: 'Cx Elunium Enriquecido', unidades: 10 },
};

// ----------------------------------------------------------------- argumentos

const args = process.argv.slice(2);
const opcao = (nome: string) => args.find((a) => a.startsWith(`--${nome}=`))?.split('=')[1];

const servidor = (opcao('servidor')?.toUpperCase() ?? 'FREYA') as Servidor;
const curto = Number(opcao('curto') ?? 7) as Periodo;
const longo = Number(opcao('longo') ?? 30) as Periodo;
const tolerancia = Number(opcao('tolerancia') ?? 1.5);
const pausa = Number(opcao('pausa') ?? 300);
const simular = args.includes('--simular');

if (!SERVIDORES.includes(servidor)) {
  console.error(`Servidor desconhecido: ${servidor}. Use ${SERVIDORES.join(', ')}.`);
  process.exit(1);
}
for (const [rotulo, p] of [['--curto', curto], ['--longo', longo]] as const) {
  if (!PERIODOS.includes(p)) {
    console.error(`${rotulo}=${p} não existe no site. Use ${PERIODOS.join(', ')}.`);
    process.exit(1);
  }
}
if (curto === longo) {
  console.error('--curto e --longo iguais: sem duas janelas não há contraprova nenhuma.');
  process.exit(1);
}
if (!(tolerancia > 1)) {
  console.error('--tolerancia precisa ser maior que 1 (é uma razão entre as duas janelas).');
  process.exit(1);
}

// -------------------------------------------------------------------- consulta

const alvos = PRICE_FIELDS.flatMap((g) => g.itens.map((i) => ({ ...i, grupo: g.grupo })));

// A busca é por trecho do nome, então o nome inteiro é o termo mais previsível:
// devolve o item e, de brinde, os parentes dele. Termos-raiz ("Oridecon") dariam
// menos requisições ao custo de adivinhar o agrupamento, que é justamente a
// parte que quebra quando o site renomeia alguma coisa.
const termos = [...new Set([...alvos.map((a) => a.nome), ...Object.values(CAIXAS).map((c) => c.termo)])];

/** Consulta todos os termos numa janela e indexa tudo que voltar por `itemId`. */
async function varrerJanela(periodo: Periodo): Promise<Map<number, Cotacao>> {
  const porId = new Map<number, Cotacao>();
  let falhas = 0;

  for (const [n, termo] of termos.entries()) {
    const r = await consultar(termo, servidor, periodo);
    if (r === null) {
      falhas++;
    } else {
      // Primeiro a chegar fica: o mesmo item aparece em várias buscas, sempre
      // com os mesmos números para a janela.
      for (const c of r.cotacoes) if (!porId.has(c.itemId)) porId.set(c.itemId, c);
    }
    if (n % 10 === 9 || n === termos.length - 1) {
      console.log(`  ${periodo}d: ${n + 1}/${termos.length} termos, ${porId.size} itens`);
    }
    if (n < termos.length - 1) await sleep(pausa);
  }

  // Rede ruim derruba um termo ou outro; derrubar metade é outra coisa, e seguir
  // em frente produziria uma tabela cheia de "sem dados" que parece mercado
  // parado. Melhor não imprimir nada do que imprimir isso.
  if (falhas > termos.length / 4) {
    console.error(
      `\n${falhas} de ${termos.length} consultas falharam na janela de ${periodo} dias.\n` +
        'Não vou cotar em cima disso — o resultado pareceria mercado vazio.',
    );
    process.exit(1);
  }
  return porId;
}

console.log(
  `Cotando ${alvos.length} materiais em ${servidor}, janelas de ${DIARIA}, ${curto} e ${longo} dias.\n`,
);
const janelas = {
  diario: await varrerJanela(DIARIA),
  curto: await varrerJanela(curto),
  longo: await varrerJanela(longo),
};

// ------------------------------------------------------------------- veredito

type Veredito =
  | 'ok'
  | 'raso'
  | 'diaria'
  | 'mediana'
  | 'instavel'
  | 'sem contraprova'
  | 'sem dados';

interface Linha {
  itemId: number;
  nome: string;
  grupo: string;
  /** De onde saiu a cotação, quando não foi do próprio item. */
  via?: string;
  curto?: Cotacao;
  longo?: Cotacao;
  diario?: Cotacao;
  veredito: Veredito;
  /** Só existe quando o veredito aceita o número. */
  sugerido?: number;
  /** Como o número foi obtido, para o arquivo poder dizer de onde ele veio. */
  origem?: Origem;
  /** Série diária, quando foi preciso recorrer a ela. */
  dias?: DiaDeMercado[];
}

/**
 * De onde saiu o preço.
 *
 * - `janelas`: a média do site na janela longa, conferida contra a curta.
 * - `diaria`: a média do último dia, para o material de volume muito alto cujo
 *   preço andou o bastante para a média longa estar descrevendo outro mercado.
 * - `mediana`: mediana ponderada pelo volume sobre o histórico dia a dia, usada
 *   só onde a conferência entre as janelas recusou o número.
 */
type Origem = 'janelas' | 'diaria' | 'mediana';

/**
 * Arredonda para três algarismos significativos.
 *
 * 21.145 vira 21.100. A precisão perdida é ruído — a média muda todo dia, e
 * escrever `21_145` no arquivo sugere uma exatidão que a fonte não tem.
 */
function arredondar(v: number): number {
  if (v <= 0) return 0;
  const escala = 10 ** Math.max(0, Math.floor(Math.log10(v)) - 2);
  return Math.round(v / escala) * escala;
}

/** Acha a cotação do item, ou a da caixa que o contém, já dividida. */
function cotar(itemId: number, janela: Map<number, Cotacao>): { c: Cotacao; via?: string } | null {
  const direto = janela.get(itemId);
  if (direto) return { c: direto };

  const caixa = CAIXAS[itemId];
  const emCaixa = caixa && janela.get(caixa.itemId);
  if (!caixa || !emCaixa) return null;
  return {
    via: `${emCaixa.nome} ÷ ${caixa.unidades}`,
    c: {
      ...emCaixa,
      min: emCaixa.min / caixa.unidades,
      media: emCaixa.media / caixa.unidades,
      max: emCaixa.max / caixa.unidades,
    },
  };
}

const linhas: Linha[] = alvos.map(({ itemId, nome, grupo }): Linha => {
  const c = cotar(itemId, janelas.curto);
  const l = cotar(itemId, janelas.longo);
  const base: Linha = {
    itemId,
    nome,
    grupo,
    via: l?.via ?? c?.via,
    curto: c?.c,
    longo: l?.c,
    veredito: 'sem dados',
  };

  // A janela longa é a que fornece o número — é ela que o site chama de média do
  // período. A curta só opina sobre se dá para confiar nele.
  if (!l) return base;
  if (!c) return { ...base, veredito: 'sem contraprova' };

  const razao = l.c.media / c.c.media;
  if (!Number.isFinite(razao) || razao > tolerancia || razao < 1 / tolerancia) {
    return { ...base, veredito: 'instavel' };
  }
  return {
    ...base,
    veredito: l.c.transacoes < LIQUIDEZ_MINIMA ? 'raso' : 'ok',
    sugerido: arredondar(l.c.media),
    origem: 'janelas',
  };
});

// ------------------------------------------- primeira correção: a média do dia
//
// A conferência entre as janelas cuida do item raso, onde uma venda solta decide
// a média. Aqui é o problema contrário: no item de volume muito alto a média de
// 30 dias está certa sobre o mês e velha sobre hoje — ela carrega, com peso de
// mês, o preço de antes da alta. O Pó de Éter fechou 30 dias em 104.070 no dia
// em que o mercado estava cobrando 145.677.
//
// Duas condições, e as duas importam. Volume, porque a média do dia é tão crua
// quanto a do mês e só o número de transações a protege do extremo. E distância
// entre o dia e o número longo, porque item líquido e parado é melhor cotado
// pelo mês: mesmo preço, trinta vezes mais transações, menos ruído.
//
// Vem antes da mediana de propósito. Item que oscila muito faz as duas janelas
// discordarem, cai em `instavel`, e a mediana do histórico o cotaria pelo preço
// em que metade do volume DO MÊS passou — que é justamente o preço velho. Para
// quem tem mercado grosso todo dia, o dia é a resposta melhor.

for (const l of linhas) {
  const d = cotar(l.itemId, janelas.diario);
  if (!d) continue;
  l.diario = d.c;
  if (d.c.transacoes < VOLUME_DIARIO) continue;

  const dia = arredondar(d.c.media);
  if (l.sugerido != null) {
    const razao = dia / l.sugerido;
    // Parado: a janela longa vê o mesmo preço com muito mais transações.
    if (razao < OSCILACAO && razao > 1 / OSCILACAO) continue;
  }
  l.sugerido = dia;
  l.veredito = 'diaria';
  l.origem = 'diaria';
}

const pelaDiaria = linhas.filter((l) => l.veredito === 'diaria');
if (pelaDiaria.length > 0) {
  console.log(`
${pelaDiaria.length} cotados pela média do dia — volume alto e preço andando.`);
}

// -------------------------------------------------- segunda opinião: a mediana
//
// Só para quem a conferência entre as janelas recusou. A média do site não
// descarta extremo, e é exatamente aí que ela quebra — mas o histórico dia a dia
// traz o VOLUME de cada dia, e com ele dá para perguntar outra coisa: em que
// preço metade das unidades foi negociada. O Carnium sai de 495.977 para ~2.000,
// que é o que os dias de 300 unidades cobraram; as três vendas milionárias, de
// uma a três unidades cada, deixam de decidir sozinhas.
//
// Fica de fora quem não apareceu em janela nenhuma: sem um resultado de busca
// não há `svrId` para pedir a série, e item sem uma única transação em 30 dias
// não teria histórico de qualquer forma.

const duvidosas = linhas.filter(
  (l) => (l.veredito === 'instavel' || l.veredito === 'sem contraprova') && (l.longo ?? l.curto),
);

if (duvidosas.length > 0) {
  console.log(`
A conferência recusou ${duvidosas.length}. Buscando o histórico diário deles.`);

  for (const [n, l] of duvidosas.entries()) {
    const ref = l.longo ?? l.curto!;
    // Para item vendido em caixa, a série é a da caixa — o preço unitário sai
    // dividido, como no resto do script.
    const porUnidade = CAIXAS[l.itemId]?.unidades ?? 1;

    const dias = await serieDiaria(ref.itemId, ref.svrId);
    if (dias === null) {
      console.log(`  ${l.nome}: série indisponível`);
    } else {
      l.dias = dias;
      const unidades = dias.reduce((s, d) => s + d.unidades, 0);
      const med = medianaPonderada(dias);
      if (med !== null && dias.length >= DIAS_MINIMOS && unidades >= UNIDADES_MINIMAS) {
        l.sugerido = arredondar(med / porUnidade);
        l.veredito = 'mediana';
        l.origem = 'mediana';
      } else {
        console.log(
          `  ${l.nome}: ${dias.length} dia(s), ${unidades} unidade(s) — pouco para uma mediana`,
        );
      }
    }
    if (n < duvidosas.length - 1) await sleep(pausa);
  }
}

// --------------------------------------------------------------------- tabela

const MARCA: Record<Veredito, string> = {
  ok: '  ok',
  raso: '   ~',
  diaria: ' dia',
  mediana: ' med',
  instavel: '  !!',
  'sem contraprova': '   ?',
  'sem dados': '   —',
};

const MOTIVO: Record<Veredito, string> = {
  ok: 'ok',
  raso: 'pouco negociado',
  diaria: 'média do último dia — volume alto e preço em movimento',
  mediana: 'mediana ponderada do histórico diário',
  instavel: `as janelas de ${curto}d e ${longo}d discordam acima de ${tolerancia}x`,
  'sem contraprova': `nada negociado na janela de ${curto}d`,
  'sem dados': `nada negociado em ${longo} dias`,
};

const N = (v: number | undefined) => (v == null ? '—' : Math.round(v).toLocaleString('pt-BR'));
const col = (v: string | number, l: number) => String(v).padStart(l);

const lg = Math.max(...linhas.map((l) => l.nome.length));
console.log(
  `\n${'item'.padEnd(lg)}  ${col(`n ${longo}d`, 9)}  ${col(`n ${DIARIA}d`, 8)}  ` +
    `${col(`méd ${DIARIA}d`, 11)}  ${col(`méd ${curto}d`, 11)}  ${col(`méd ${longo}d`, 11)}  ` +
    `${col('', 4)}  ${col('atual', 11)}  ${col('cotado', 11)}`,
);
console.log('-'.repeat(lg + 89));

for (const l of linhas) {
  const atual = DEFAULT_PRICES[l.itemId];
  // Só vale apontar a mudança onde ela é grande o bastante para mexer no plano;
  // 5% de diferença numa média que oscila todo dia não é notícia.
  const mudou =
    l.sugerido != null && atual != null && (l.sugerido / atual > 1.25 || l.sugerido / atual < 0.8);
  console.log(
    `${l.nome.padEnd(lg)}  ${col(N(l.longo?.transacoes), 9)}  ${col(N(l.diario?.transacoes), 8)}  ` +
      `${col(N(l.diario?.media), 11)}  ${col(N(l.curto?.media), 11)}  ` +
      `${col(N(l.longo?.media), 11)}  ${col(MARCA[l.veredito], 4)}  ${col(N(atual), 11)}  ` +
      `${col(N(l.sugerido), 11)}${mudou ? '  <-' : ''}${l.via ? `  (${l.via})` : ''}`,
  );
}

const conta = (v: Veredito) => linhas.filter((l) => l.veredito === v).length;
console.log(
  `\n  ok  ${conta('ok')} pela média de ${longo}d, conferida contra a de ${curto}d` +
    `\n   ~  ${conta('raso')} idem, com menos de ${LIQUIDEZ_MINIMA.toLocaleString('pt-BR')} transações` +
    `\n dia  ${conta('diaria')} pela média do dia: mais de ${VOLUME_DIARIO.toLocaleString('pt-BR')} transações em ${DIARIA}d,` +
    `\n      e o dia a mais de ${Math.round((OSCILACAO - 1) * 100)}% da média longa` +
    `\n med  ${conta('mediana')} recuperados pela mediana ponderada do histórico diário` +
    `\n  !!  ${conta('instavel')} recusados: as janelas discordam acima de ${tolerancia}x e o histórico não salvou` +
    `\n   ?  ${conta('sem contraprova')} sem negócio na janela de ${curto}d — nada para conferir contra` +
    `\n   —  ${conta('sem dados')} não negociados no período` +
    `\n  <-  muda mais de 25% em relação ao que está no arquivo hoje`,
);

// ------------------------------------------------------------------- gravação

/** Uma linha de `precos.json`. */
type LinhaCotada = [
  itemId: number,
  zeny: number,
  cotadoEm: string,
  transacoes: number,
  origem: Origem,
];

interface Arquivo {
  _fonte: string;
  _servidor: string;
  _janela: string;
  _geradoEm: string;
  _campos: string[];
  precos: LinhaCotada[];
}

const hoje = new Date().toISOString().slice(0, 10);

const anterior: LinhaCotada[] = await readFile(PRECOS_JSON, 'utf8')
  .then((t) => (JSON.parse(t) as Arquivo).precos)
  // Arquivo ausente ou corrompido não impede uma cotação nova de nascer; só
  // significa que não há nada para carregar adiante.
  .catch(() => []);
// O arquivo da versão anterior não tinha a coluna de origem. Ler sem ela é
// melhor que descartar a cotação: o que falta é a procedência, não o preço.
const antes = new Map(
  anterior.map((l) => [l[0], [l[0], l[1], l[2], l[3], l[4] ?? 'janelas'] as LinhaCotada]),
);

const aceitas: LinhaCotada[] = [];
const carregadas: { linha: LinhaCotada; de: Linha }[] = [];

for (const l of linhas) {
  if (l.sugerido != null) {
    // O volume gravado é sempre o que sustenta o número, e cada origem tira o
    // dela de um lugar: a mediana, das unidades do histórico sobre as quais foi
    // tirada; a média do dia, das transações daquele dia — gravar o mês ao lado
    // de um preço de um dia diria que o preço é mais firme do que é.
    const volume =
      l.origem === 'mediana'
        ? (l.dias ?? []).reduce((s, d) => s + d.unidades, 0)
        : l.origem === 'diaria'
          ? l.diario!.transacoes
          : l.longo!.transacoes;
    aceitas.push([l.itemId, l.sugerido, hoje, volume, l.origem!]);
    continue;
  }
  // Recusado hoje, mas cotado em algum dia bom: o valor antigo continua valendo
  // mais que um chute, e a data velha é o que denuncia que ele envelheceu.
  // Apagar a linha porque o mercado ficou raro nesta semana seria uma piora.
  const velha = antes.get(l.itemId);
  if (velha) carregadas.push({ linha: velha, de: l });
}

const precos = [...aceitas, ...carregadas.map((c) => c.linha)].sort((a, b) => a[0] - b[0]);

if (simular) {
  console.log(
    `\n--simular: ${PRECOS_JSON} ficaria com ${precos.length} preços ` +
      `(${aceitas.length} de hoje, ${carregadas.length} mantidos). Nada foi gravado.`,
  );
  process.exit(0);
}

// A trava que importa: se o site mudar o formato e o parser passar a devolver
// vazio, nada estoura sozinho — a tabela sai cheia de "sem dados", que parece
// mercado parado. Gravar isso apagaria uma cotação boa por causa de um bug.
if (aceitas.length < MINIMO_PARA_GRAVAR) {
  console.error(
    `\nSó ${aceitas.length} cotações passaram na conferência (mínimo ${MINIMO_PARA_GRAVAR}).\n` +
      'Isso não é mercado parado, é o site ou o parser tendo mudado.\n' +
      `${PRECOS_JSON} foi preservado.`,
  );
  process.exit(1);
}

// Uma linha por preço: o diff do commit precisa mostrar qual valor mudou e
// quando, não um bloco só.
const corpo = precos.map((l) => `    ${JSON.stringify(l)}`).join(',\n');
await writeFile(
  PRECOS_JSON,
  `{
  "_fonte": "https://ro.gnjoylatam.com/pt/intro/shop-search/market-price",
  "_servidor": ${JSON.stringify(servidor)},
  "_janela": ${JSON.stringify(
    `media de ${longo} dias conferida contra a de ${curto}, ` +
      `e media do dia nos materiais de giro muito alto`,
  )},
  "_geradoEm": ${JSON.stringify(hoje)},
  "_campos": ["itemId", "zeny", "cotadoEm", "transacoes", "origem"],
  "precos": [
${corpo}
  ]
}
`,
  'utf8',
);

console.log(`\nOK -> src/data/precos.json — ${precos.length} preços, atualizado em ${hoje}`);
console.log(`  ${aceitas.length} lidos do mercado agora`);
if (carregadas.length > 0) {
  console.log(`  ${carregadas.length} mantidos de uma cotação anterior:`);
  for (const { linha, de } of carregadas) {
    console.log(`    ${de.nome.padEnd(lg)}  ${col(N(linha[1]), 11)}  de ${linha[2]} — ${MOTIVO[de.veredito]}`);
  }
}
