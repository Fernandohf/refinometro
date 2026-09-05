import { listaDeCompras } from './pricing';
import { percentis, quantilOrdenado, type AmostrasCampanha, type Marco } from './simulate';
import type { Percentis, PriceTable } from './types';

/**
 * O que o jogador já tem em mãos antes de começar.
 *
 * Os materiais vêm na moeda da lista de compras — o que se acha no mercado —, e
 * não em minério pronto: ninguém guarda Eterium na mochila, guarda Elunium e Pó
 * de Éter e fabrica na hora. É a mesma expansão que a lista de compras faz, pela
 * mesma razão: se o estoque falasse numa unidade e a conta em outra, o
 * abatimento não fecharia com o orçamento.
 */
export interface Estoque {
  /**
   * Zeny em caixa.
   *
   * Só paga o que não se carrega na mochila: taxa do refinador, taxa de cada
   * tentativa de Grau e balcão do NPC que fabrica os minérios intermediários.
   * Ele **não** compra minério que faltar — ver `avaliarEstoque`.
   */
  zeny: number;
  /** Quanto você tem de cada material, por id de item. */
  itens: Record<number, number>;
  /** Cópias do equipamento em mãos, contando a que já está no refino atual. */
  copias: number;
}

export interface MaterialDaCampanha {
  itemId: number;
  /** Preço unitário de mercado — o mesmo que o motor usou para cotar a campanha. */
  preco: number;
  /**
   * Consumo da campanha mais sortuda entre as simuladas. É o mínimo que faz
   * sentido ter: abaixo disso não existe campanha nenhuma que feche, porque o
   * que falta de minério não se resolve com zeny.
   */
  minimo: number;
  /** Consumo médio entre as campanhas simuladas. */
  media: number;
  /** Consumo do pior azar simulado — acima dele, mais minério não muda nada. */
  maximo: number;
}

/**
 * O menor estoque que ainda pode dar certo: abaixo de qualquer um destes
 * números, nem a campanha mais sortuda das simuladas chega ao alvo.
 *
 * É o que a tela mostra em vermelho. Não é uma recomendação — é o chão do
 * possível, e ficar nele é apostar em ter a melhor sorte de cinco mil.
 */
export interface PisoDoEstoque {
  zeny: number;
  copias: number;
  itens: Record<number, number>;
}

/**
 * As campanhas simuladas, convertidas de minério pronto para o que se compra.
 *
 * A conversão é feita uma vez por plano; responder "dá com o que eu tenho?" para
 * um estoque qualquer depois disso é só varrer estas colunas, e sai barato o
 * bastante para acompanhar a digitação.
 */
export interface CampanhaEmMateriais {
  materiais: MaterialDaCampanha[];
  /** Achatado: `consumo[i * execucoes + n]` unidades do material `i`. */
  consumo: Float64Array;
  /** O mesmo `consumo`, com cada coluna ordenada — para os quantis. */
  consumoOrdenado: Float64Array;
  /** Zeny total de cada execução, com tudo comprado a preço de mercado. */
  custo: Float64Array;
  /**
   * A parte do custo que só se paga em zeny, execução a execução: taxa do
   * refinador, taxa das tentativas de Grau e balcão do NPC.
   *
   * É o custo total menos o preço de tudo o que se carrega — minério e cópias de
   * reposição. Não depende do estoque: o material é consumido de qualquer jeito,
   * a diferença é só se ele saiu da mochila ou do bolso.
   */
  zenyPuro: Float64Array;
  /** `zenyPuro` ordenado, para o quantil do recomendado. */
  zenyPuroOrdenado: Float64Array;
  /** Itens-base destruídos em cada execução. */
  quebras: Float64Array;
  /** `quebras` ordenado, para o quantil do recomendado. */
  quebrasOrdenado: Float64Array;
  execucoes: number;
  /** Preço do item sem refino, cobrado a cada quebra. */
  precoItem: number;
  /** O chão do possível em cada recurso (ver `PisoDoEstoque`). */
  piso: PisoDoEstoque;

  /*
    O caminho, e não só o destino.

    Tudo acima responde *se* o estoque dá. O que vem abaixo responde **até onde**
    ele leva — o consumo acumulado a cada ponto de progresso da campanha, nas
    mesmas colunas de material. É uma amostra menor que a do total (ver
    `MAX_MARCOS_GUARDADOS`), porque a pergunta é grossa: um degrau de refino.
  */

  /** Os pontos de progresso, na ordem em que a campanha os atravessa. */
  marcos: Marco[];
  /** Consumo acumulado: `progresso[(m * materiais + col) * execucoesMarcos + i]`. */
  progresso: Float64Array;
  /** Zeny de taxa e balcão acumulado: `[m * execucoesMarcos + i]`. */
  progressoZenyPuro: Float64Array;
  /** Cópias destruídas até ali: `[m * execucoesMarcos + i]`. */
  progressoQuebras: Float64Array;
  /** Execuções que sustentam o progresso. */
  execucoesMarcos: number;
}

/** Um recurso que pode acabar no meio do caminho. */
export type Recurso =
  | { tipo: 'material'; itemId: number }
  | { tipo: 'zeny' }
  | { tipo: 'copias' };

export interface CulpadoDoTravamento {
  recurso: Recurso;
  /** Fração das campanhas que travam em que ele é o primeiro a faltar. */
  fracao: number;
  /** Marco mediano em que ele acaba, entre essas campanhas. */
  marco: number;
}

/**
 * Onde a campanha para, quando ela para.
 *
 * A chance sozinha diz que você provavelmente não chega; ela não diz se o
 * problema é o último degrau ou o terceiro. Com 30% de chance, saber que metade
 * das campanhas morre já no primeiro Grau é o que separa "compro mais minério"
 * de "escolho outro alvo".
 */
export interface Travamento {
  /** Execuções que sustentam esta leitura — menos que as do veredito. */
  execucoes: number;
  /** Fração dessas execuções que não chegam ao alvo. */
  fracaoQueTrava: number;
  /** Quartis do marco em que a campanha para, entre as que travam. */
  marcoP25: number;
  marcoP50: number;
  marcoP75: number;
  /** Fração das campanhas que travam que param em cada marco. Soma 1. */
  porMarco: number[];
  /** Quem acaba primeiro, do mais frequente ao menos. */
  culpados: CulpadoDoTravamento[];
  marcos: Marco[];
}

export interface FaltaDeMaterial extends MaterialDaCampanha {
  /** Quanto o estoque informado tem deste material. */
  tem: number;
  /** Fração das campanhas em que o que você tem acaba antes do alvo. */
  fracaoFaltou: number;
  /** Quanto ainda seria preciso ter, por percentil. */
  falta: Percentis;
}

export interface VereditoEstoque {
  /** Fração das campanhas simuladas que chegam ao alvo com este estoque. */
  chance: number;
  /** Campanhas que sustentam a resposta — quanto menos, mais grosseira ela é. */
  execucoes: number;
  /** Zeny de taxa e balcão que a campanha exige, por percentil. */
  zenyNecessario: Percentis;
  /**
   * O que a campanha cobrou em zeny puro, execução a execução, cru e fora de
   * ordem. Os percentis acima são cinco cortes desta amostra.
   */
  zenyPorCampanha: Float64Array;
  materiais: FaltaDeMaterial[];
  /** Fração das campanhas em que as cópias do item não bastam. */
  fracaoSemCopias: number;
  /** Cópias do equipamento que ainda faltariam, por percentil. */
  copiasFaltantes: Percentis;
  /** Fração das campanhas barradas só pelo caixa — material e cópias bastavam. */
  fracaoSoPorZeny: number;
}

/** Uma coluna ordenada de `consumoOrdenado`. */
function coluna(c: CampanhaEmMateriais, col: number): Float64Array {
  return c.consumoOrdenado.subarray(col * c.execucoes, (col + 1) * c.execucoes);
}

/**
 * Desmonta o consumo simulado até o que se compra de verdade.
 *
 * Minério com receita de NPC entra desmontado, exatamente como na lista de
 * compras: o custo que o motor cotou já é o da receita sempre que fabricar sai
 * mais barato, então o estoque precisa falar dos mesmos materiais. O balcão do
 * NPC continua sendo zeny — quem fabrica Bradium paga os 50 mil de qualquer
 * forma, tendo Oridecon na mochila ou não.
 */
export function emMateriais(
  amostras: AmostrasCampanha,
  precos: PriceTable,
  precoItem: number,
): CampanhaEmMateriais {
  const n = amostras.execucoes;

  const colunas = new Map<number, number>();
  const receitas = amostras.itemIds.map((itemId) =>
    // Uma unidade de cada minério, desmontada pela mesma decisão de comprar ou
    // fabricar que o custo usou.
    listaDeCompras({ [itemId]: 1 }, precos).compras.map((linha) => {
      let coluna = colunas.get(linha.itemId);
      if (coluna === undefined) {
        coluna = colunas.size;
        colunas.set(linha.itemId, coluna);
      }
      return { coluna, qtd: linha.qtd, preco: linha.custoUnitario };
    }),
  );

  const nCol = colunas.size;
  const bruto = new Float64Array(nCol * n);
  const precoPorColuna = new Float64Array(nCol);

  for (let o = 0; o < receitas.length; o++) {
    for (const { coluna, qtd, preco } of receitas[o]!) {
      precoPorColuna[coluna] = preco;
      for (let i = 0; i < n; i++) bruto[coluna * n + i]! += amostras.consumo[o * n + i]! * qtd;
    }
  }

  const itemIds = [...colunas.keys()];
  const achados: { material: MaterialDaCampanha; coluna: number }[] = [];

  for (let col = 0; col < nCol; col++) {
    let minimo = Infinity;
    let maximo = 0;
    let soma = 0;
    for (let i = 0; i < n; i++) {
      const v = bruto[col * n + i]!;
      if (v < minimo) minimo = v;
      if (v > maximo) maximo = v;
      soma += v;
    }
    const media = soma / n;
    // Material que a estratégia escolhida nunca toca não vira campo na tela.
    if (media <= 0) continue;
    achados.push({
      material: {
        itemId: itemIds[col]!,
        preco: precoPorColuna[col]!,
        minimo: Number.isFinite(minimo) ? minimo : 0,
        media,
        maximo,
      },
      coluna: col,
    });
  }

  // Do que mais se usa para o que menos se usa: é a ordem em que a tela pede o
  // estoque, e a mesma da tabela de materiais.
  achados.sort((a, b) => b.material.media - a.material.media);

  const consumo = new Float64Array(achados.length * n);
  for (let novo = 0; novo < achados.length; novo++) {
    const antigo = achados[novo]!.coluna;
    for (let i = 0; i < n; i++) consumo[novo * n + i] = bruto[antigo * n + i]!;
  }

  const materiais = achados.map((a) => a.material);
  // Da coluna crua para a coluna já ordenada e filtrada — `undefined` no
  // material que a estratégia nunca toca e que por isso não virou campo.
  const novaColuna: (number | undefined)[] = new Array(nCol).fill(undefined);
  achados.forEach((a, novo) => (novaColuna[a.coluna] = novo));

  // O zeny que sobra depois de descontar TUDO o que se carrega. O `max(0, ...)`
  // é só contra o resíduo de ponto flutuante da soma de milhares de parcelas:
  // por construção o custo nunca é menor que o preço do que ele consumiu.
  const zenyPuro = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    let material = amostras.quebras[i]! * precoItem;
    for (let col = 0; col < materiais.length; col++) {
      material += consumo[col * n + i]! * materiais[col]!.preco;
    }
    zenyPuro[i] = Math.max(0, amostras.custo[i]! - material);
  }

  const consumoOrdenado = new Float64Array(consumo.length);
  for (let col = 0; col < materiais.length; col++) {
    const fatia = consumo.slice(col * n, (col + 1) * n).sort();
    consumoOrdenado.set(fatia, col * n);
  }

  /*
    O progresso passa pela MESMA expansão do consumo — é a mesma transformação
    linear, aplicada a cada foto em vez de só ao total. Precisa ser a mesma, ou
    a trajetória falaria de Bradium enquanto os campos da tela falam de Oridecon.
  */
  const nM = amostras.execucoesMarcos;
  const nMarcos = amostras.marcos.length;
  const progresso = new Float64Array(nMarcos * materiais.length * nM);
  const progressoZenyPuro = new Float64Array(nMarcos * nM);

  for (let m = 0; m < nMarcos; m++) {
    for (let o = 0; o < receitas.length; o++) {
      for (const { coluna, qtd } of receitas[o]!) {
        const col = novaColuna[coluna];
        if (col === undefined) continue;
        for (let i = 0; i < nM; i++) {
          progresso[(m * materiais.length + col) * nM + i]! +=
            amostras.progresso[(m * receitas.length + o) * nM + i]! * qtd;
        }
      }
    }
    for (let i = 0; i < nM; i++) {
      let material = amostras.progressoQuebras[m * nM + i]! * precoItem;
      for (let col = 0; col < materiais.length; col++) {
        material += progresso[(m * materiais.length + col) * nM + i]! * materiais[col]!.preco;
      }
      progressoZenyPuro[m * nM + i] = Math.max(0, amostras.progressoCusto[m * nM + i]! - material);
    }
  }

  let minimoZeny = Infinity;
  let minimoQuebras = Infinity;
  for (let i = 0; i < n; i++) {
    if (zenyPuro[i]! < minimoZeny) minimoZeny = zenyPuro[i]!;
    if (amostras.quebras[i]! < minimoQuebras) minimoQuebras = amostras.quebras[i]!;
  }

  return {
    materiais,
    consumo,
    consumoOrdenado,
    custo: amostras.custo,
    zenyPuro,
    zenyPuroOrdenado: zenyPuro.slice().sort(),
    quebras: amostras.quebras,
    quebrasOrdenado: amostras.quebras.slice().sort(),
    execucoes: n,
    precoItem,
    piso: {
      zeny: Math.ceil(Number.isFinite(minimoZeny) ? minimoZeny : 0),
      copias: 1 + Math.ceil(Number.isFinite(minimoQuebras) ? minimoQuebras : 0),
      itens: Object.fromEntries(materiais.map((m) => [m.itemId, Math.ceil(m.minimo)])),
    },
    marcos: amostras.marcos,
    progresso,
    progressoZenyPuro,
    progressoQuebras: amostras.progressoQuebras,
    execucoesMarcos: nM,
  };
}

/** Zeny de taxa e balcão que cobre a fração `chanceAlvo` das campanhas. */
export function zenyParaChance(c: CampanhaEmMateriais, chanceAlvo: number): number {
  return Math.ceil(quantilOrdenado(c.zenyPuroOrdenado, chanceAlvo));
}

/**
 * O estoque que a tela sugere para uma dada chance de chegar ao alvo.
 *
 * O caminho ingênuo — pegar o percentil 90 de cada recurso — erra, e erra
 * sempre para o mesmo lado: os azares são marginais, e a campanha que estoura o
 * minério não é a mesma que estoura o caixa. Levar o percentil 90 de cinco
 * coisas dá bem menos que 90% de chance de não faltar nenhuma.
 *
 * Então o que se busca é o **quantil comum** `q` em que a mochila inteira
 * fecha a fração pedida das campanhas. Como todo recurso cresce com `q` e mais
 * recurso nunca piora a chance, a conta é monótona e sai por bisseção; em `q=1`
 * o estoque cobre o pior azar simulado e a chance é 1, o que garante que a
 * busca sempre encontra um teto.
 */
export function estoqueRecomendado(
  c: CampanhaEmMateriais,
  chanceAlvo: number,
): Estoque {
  const noQuantil = (q: number): Estoque => ({
    zeny: Math.ceil(quantilOrdenado(c.zenyPuroOrdenado, q)),
    copias: 1 + Math.ceil(quantilOrdenado(c.quebrasOrdenado, q)),
    itens: Object.fromEntries(
      c.materiais.map((m, col) => [m.itemId, Math.ceil(quantilOrdenado(coluna(c, col), q))]),
    ),
  });

  // O alvo é sempre alcançável no teto, e nunca abaixo do próprio alvo: a
  // chance conjunta não passa da marginal mais apertada.
  let baixo = Math.min(0.999_999, Math.max(0, chanceAlvo));
  let alto = 1;
  if (chanceDoEstoque(c, noQuantil(baixo)) >= chanceAlvo) return noQuantil(baixo);

  // 40 passos deixam o intervalo menor que o espaçamento de duas campanhas
  // vizinhas na amostra — abaixo disso o quantil não muda mais de degrau.
  for (let passo = 0; passo < 40; passo++) {
    const meio = (baixo + alto) / 2;
    if (chanceDoEstoque(c, noQuantil(meio)) >= chanceAlvo) alto = meio;
    else baixo = meio;
  }

  return noQuantil(alto);
}

/**
 * Só a chance, sem os percentis e as tabelas que `avaliarEstoque` monta.
 *
 * Existe para a bisseção acima, que a chama dezenas de vezes e joga fora tudo o
 * mais: ordenar seis distribuições a cada passo custaria mais que a busca
 * inteira.
 */
export function chanceDoEstoque(c: CampanhaEmMateriais, estoque: Estoque): number {
  const n = c.execucoes;
  const nCol = c.materiais.length;
  const tem = c.materiais.map((m) => Math.max(0, estoque.itens[m.itemId] ?? 0));
  const extras = Math.max(0, Math.floor(estoque.copias) - 1);
  let sucessos = 0;

  for (let i = 0; i < n; i++) {
    if (c.zenyPuro[i]! > estoque.zeny) continue;
    if (c.quebras[i]! > extras) continue;
    let cabe = true;
    for (let col = 0; col < nCol; col++) {
      if (c.consumo[col * n + i]! > tem[col]!) {
        cabe = false;
        break;
      }
    }
    if (cabe) sucessos++;
  }

  return sucessos / n;
}

/**
 * Chance de chegar ao alvo com o estoque informado.
 *
 * A campanha fecha quando **nenhum** dos recursos acaba no meio: o minério de
 * cada material, as cópias de reposição e o caixa. Cada um é uma restrição
 * própria, e nenhum cobre a falta do outro.
 *
 * Em especial, o zeny aqui **não compra minério**. Ele paga o que não se
 * carrega na mochila — a taxa do refinador, a taxa de cada tentativa de Grau e
 * o balcão do NPC que fabrica os intermediários —, e é essa parcela que o
 * `zenyPuro` da campanha isola. É uma pergunta diferente da que o painel de
 * custo responde: lá tudo é comprado na hora, aqui a mochila é o que é e a
 * viagem ao mercado não está no plano.
 *
 * Duas coisas o modelo continua assumindo, e vale saber quais:
 *
 * - **O consumo só cresce.** Por isso basta comparar o total da campanha com o
 *   que se tem: quem aguenta o total aguenta cada passo do caminho, e quem não
 *   aguenta trava em algum ponto — não importa exatamente onde.
 * - **O plano é o ótimo**, o mesmo que a calculadora recomenda. Ter uma pilha de
 *   Elunium parado não muda a estratégia que o motor escolhe; a resposta é a
 *   chance de atravessar *aquele* plano com estes recursos.
 */
export function avaliarEstoque(c: CampanhaEmMateriais, estoque: Estoque): VereditoEstoque {
  const n = c.execucoes;
  const nCol = c.materiais.length;

  const tem = c.materiais.map((m) => Math.max(0, estoque.itens[m.itemId] ?? 0));
  const extras = Math.max(0, Math.floor(estoque.copias) - 1);

  const faltaPorItem = new Float64Array(nCol * n);
  const faltou = new Int32Array(nCol);
  const copiasFaltantes = new Float64Array(n);

  let sucessos = 0;
  let semCopias = 0;
  let soPorZeny = 0;

  for (let i = 0; i < n; i++) {
    let materialCabe = true;

    for (let col = 0; col < nCol; col++) {
      const falta = c.consumo[col * n + i]! - tem[col]!;
      if (falta > 0) {
        faltaPorItem[col * n + i] = falta;
        faltou[col]!++;
        materialCabe = false;
      }
    }

    const faltamCopias = Math.max(0, c.quebras[i]! - extras);
    copiasFaltantes[i] = faltamCopias;
    if (faltamCopias > 0) semCopias++;

    const caixaCabe = c.zenyPuro[i]! <= estoque.zeny;
    if (materialCabe && faltamCopias === 0) {
      if (caixaCabe) sucessos++;
      else soPorZeny++;
    }
  }

  return {
    chance: sucessos / n,
    execucoes: n,
    zenyNecessario: percentis(c.zenyPuro),
    zenyPorCampanha: c.zenyPuro,
    materiais: c.materiais.map((m, col) => ({
      ...m,
      tem: tem[col]!,
      fracaoFaltou: faltou[col]! / n,
      falta: percentis(faltaPorItem.subarray(col * n, col * n + n)),
    })),
    fracaoSemCopias: semCopias / n,
    copiasFaltantes: percentis(copiasFaltantes),
    fracaoSoPorZeny: soPorZeny / n,
  };
}

/**
 * Onde a campanha para, dado o estoque — a pergunta que vem depois de uma
 * chance baixa.
 *
 * Cada recurso tem uma curva de consumo acumulado que só cresce, então "quando
 * ele acaba" é o primeiro marco em que a curva passa do que se tem. A campanha
 * para no menor desses marcos, e o recurso que o alcança primeiro é o culpado.
 *
 * A conta é a mesma de `avaliarEstoque`, lida no meio do caminho em vez de no
 * fim: no último marco o acumulado É o total, então uma campanha trava aqui se e
 * somente se ela falha lá. A diferença entre as duas frações é só de amostra —
 * esta lê menos execuções, porque guardar a trajetória inteira de cinco mil
 * campanhas custaria dez vezes mais que guardar os totais.
 *
 * Devolve `null` quando não há trajetória guardada ou quando nenhuma campanha
 * trava: aí não há o que localizar.
 */
export function ondeAcaba(c: CampanhaEmMateriais, estoque: Estoque): Travamento | null {
  const n = c.execucoesMarcos;
  const nMarcos = c.marcos.length;
  const nCol = c.materiais.length;
  if (n === 0 || nMarcos === 0) return null;

  const tem = c.materiais.map((m) => Math.max(0, estoque.itens[m.itemId] ?? 0));
  const extras = Math.max(0, Math.floor(estoque.copias) - 1);

  const paradas: number[] = [];
  // Por culpado: em quantas campanhas ele é o primeiro a faltar, e em que marcos.
  const culpaMarcos = new Map<string, number[]>();
  const recursoDe = new Map<string, Recurso>();

  for (let i = 0; i < n; i++) {
    let marcoParada = nMarcos;
    let culpado: Recurso | null = null;
    let folgaDoCulpado = Infinity;

    /** O primeiro marco em que `curva` passa de `disponivel`. */
    const cruza = (curva: (m: number) => number, disponivel: number) => {
      for (let m = 0; m < nMarcos; m++) if (curva(m) > disponivel) return m;
      return nMarcos;
    };

    const considerar = (m: number, recurso: Recurso, disponivel: number) => {
      if (m > marcoParada) return;
      // Empate no mesmo marco: fica com quem tinha menos folga, que é o que a
      // pessoa sente primeiro. Sem o critério, a ordem das colunas decidiria.
      if (m === marcoParada && disponivel >= folgaDoCulpado) return;
      marcoParada = m;
      culpado = recurso;
      folgaDoCulpado = disponivel;
    };

    for (let col = 0; col < nCol; col++) {
      const m = cruza((k) => c.progresso[(k * nCol + col) * n + i]!, tem[col]!);
      if (m < nMarcos) considerar(m, { tipo: 'material', itemId: c.materiais[col]!.itemId }, tem[col]!);
    }
    const mZeny = cruza((k) => c.progressoZenyPuro[k * n + i]!, estoque.zeny);
    if (mZeny < nMarcos) considerar(mZeny, { tipo: 'zeny' }, estoque.zeny);
    const mCopias = cruza((k) => c.progressoQuebras[k * n + i]!, extras);
    if (mCopias < nMarcos) considerar(mCopias, { tipo: 'copias' }, extras);

    if (culpado === null) continue;

    paradas.push(marcoParada);
    const chave = chaveDoRecurso(culpado);
    recursoDe.set(chave, culpado);
    const lista = culpaMarcos.get(chave);
    if (lista) lista.push(marcoParada);
    else culpaMarcos.set(chave, [marcoParada]);
  }

  if (paradas.length === 0) return null;

  paradas.sort((a, b) => a - b);
  const corte = (q: number) => paradas[Math.min(paradas.length - 1, Math.floor(q * paradas.length))]!;

  const culpados: CulpadoDoTravamento[] = [...culpaMarcos]
    .map(([chave, marcos]) => {
      marcos.sort((a, b) => a - b);
      return {
        recurso: recursoDe.get(chave)!,
        fracao: marcos.length / paradas.length,
        marco: marcos[Math.floor(marcos.length / 2)]!,
      };
    })
    .sort((a, b) => b.fracao - a.fracao);

  const porMarco = new Array<number>(nMarcos).fill(0);
  for (const m of paradas) porMarco[m]! += 1 / paradas.length;

  return {
    execucoes: n,
    fracaoQueTrava: paradas.length / n,
    marcoP25: corte(0.25),
    marcoP50: corte(0.5),
    marcoP75: corte(0.75),
    porMarco,
    culpados,
    marcos: c.marcos,
  };
}

function chaveDoRecurso(r: Recurso): string {
  return r.tipo === 'material' ? `m${r.itemId}` : r.tipo;
}
