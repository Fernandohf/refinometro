import { listaDeCompras } from './pricing';
import { percentis, type AmostrasCampanha } from './simulate';
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
  /** Zeny em caixa. */
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
   * sentido ter: abaixo disso não existe caminho que chegue ao alvo sem comprar
   * mais material no meio.
   */
  minimo: number;
  /** Consumo médio entre as campanhas simuladas. */
  media: number;
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
  /** Zeny total de cada execução, com tudo comprado a preço de mercado. */
  custo: Float64Array;
  /** Itens-base destruídos em cada execução. */
  quebras: Float64Array;
  execucoes: number;
  /** Preço do item sem refino, cobrado a cada quebra. */
  precoItem: number;
}

export interface FaltaDeMaterial extends MaterialDaCampanha {
  /** Quanto o estoque informado tem deste material. */
  tem: number;
  /** Fração das campanhas em que o que você tem acaba antes do alvo. */
  fracaoFaltou: number;
  /** Quanto ainda seria preciso comprar, por percentil. */
  falta: Percentis;
}

export interface VereditoEstoque {
  /** Fração das campanhas simuladas que chegam ao alvo com este estoque. */
  chance: number;
  /** Campanhas que sustentam a resposta — quanto menos, mais grosseira ela é. */
  execucoes: number;
  /** Zeny que precisa estar em caixa além do que o estoque já cobre. */
  zenyNecessario: Percentis;
  materiais: FaltaDeMaterial[];
  /** Fração das campanhas em que as cópias do item não bastam. */
  fracaoSemCopias: number;
  /** Cópias do equipamento que ainda faltariam comprar, por percentil. */
  copiasFaltantes: Percentis;
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
    let soma = 0;
    for (let i = 0; i < n; i++) {
      const v = bruto[col * n + i]!;
      if (v < minimo) minimo = v;
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

  return {
    materiais: achados.map((a) => a.material),
    consumo,
    custo: amostras.custo,
    quebras: amostras.quebras,
    execucoes: n,
    precoItem,
  };
}

/**
 * Chance de chegar ao alvo com o estoque informado.
 *
 * O que o estoque cobre é abatido do custo da campanha: o motor cotou cada
 * material pelo preço de mercado, então o que já está na mochila é exatamente
 * esse valor que deixa de sair do bolso. Sobra o zeny que ainda precisa existir
 * — e a campanha chega ao alvo quando ele cabe no caixa.
 *
 * Duas coisas o modelo assume, e vale saber quais:
 *
 * - **O que faltar pode ser comprado** pelo preço informado, a qualquer momento.
 *   É a mesma suposição do resto da calculadora. Por isso basta comparar o total
 *   da campanha com o caixa: o consumo só cresce, então quem aguenta o total
 *   aguenta cada passo do caminho, e quem não aguenta trava em algum ponto — não
 *   importa exatamente onde.
 * - **O plano é o ótimo**, o mesmo que a calculadora recomenda. Ter uma pilha de
 *   Elunium parado não muda a estratégia que o motor escolhe; a resposta é a
 *   chance de atravessar *aquele* plano com estes recursos.
 */
export function avaliarEstoque(c: CampanhaEmMateriais, estoque: Estoque): VereditoEstoque {
  const n = c.execucoes;
  const nCol = c.materiais.length;

  const tem = c.materiais.map((m) => Math.max(0, estoque.itens[m.itemId] ?? 0));
  const extras = Math.max(0, Math.floor(estoque.copias) - 1);

  const zenyNecessario = new Float64Array(n);
  const faltaPorItem = new Float64Array(nCol * n);
  const faltou = new Int32Array(nCol);
  const copiasFaltantes = new Float64Array(n);

  let sucessos = 0;
  let semCopias = 0;

  for (let i = 0; i < n; i++) {
    let coberto = 0;

    for (let col = 0; col < nCol; col++) {
      const precisa = c.consumo[col * n + i]!;
      const disponivel = tem[col]!;
      coberto += Math.min(precisa, disponivel) * c.materiais[col]!.preco;
      const falta = precisa - disponivel;
      if (falta > 0) {
        faltaPorItem[col * n + i] = falta;
        faltou[col]!++;
      }
    }

    const quebras = c.quebras[i]!;
    coberto += Math.min(quebras, extras) * c.precoItem;
    const faltamCopias = Math.max(0, quebras - extras);
    copiasFaltantes[i] = faltamCopias;
    if (faltamCopias > 0) semCopias++;

    const precisa = Math.max(0, c.custo[i]! - coberto);
    zenyNecessario[i] = precisa;
    if (precisa <= estoque.zeny) sucessos++;
  }

  return {
    chance: sucessos / n,
    execucoes: n,
    zenyNecessario: percentis(zenyNecessario),
    materiais: c.materiais.map((m, col) => ({
      ...m,
      tem: tem[col]!,
      fracaoFaltou: faltou[col]! / n,
      falta: percentis(faltaPorItem.subarray(col * n, col * n + n)),
    })),
    fracaoSemCopias: semCopias / n,
    copiasFaltantes: percentis(copiasFaltantes),
  };
}
