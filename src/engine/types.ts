import type { ItemKind, Ore } from '../data/ores';
import type { Grade } from '../data/grade';
import type { Atalho } from '../data/atalhos';

/** Preço unitário em zeny, por id de item. Ausente/0 = desconhecido. */
export type PriceTable = Record<number, number>;

export interface CalcInput {
  /** Categoria do item — define a coluna da tabela de chances. */
  kind: ItemKind;
  /**
   * Preço do item SEM refino (+0), em zeny. É o que se paga para repor o
   * equipamento toda vez que ele quebra, e a base do "valor justo" na saída.
   */
  precoItem: number;
  refinoAtual: number;
  refinoAlvo: number;
  grauAtual: Grade;
  grauAlvo: Grade;
  /** Evento de Refino ativo (aumenta as chances). */
  evento: boolean;
  /** Preços de mercado dos minérios e materiais. */
  precos: PriceTable;
  /** Permitir gastar Bênção do Ferreiro nas tentativas em que ela funciona. */
  usarBencaoFerreiro: boolean;
  /** Permitir minérios de JoyCoins (Enriquecido / Perfeito). */
  usarMineriosEspeciais: boolean;
  /**
   * Se dá para perder o equipamento no caminho. Marque `false` quando ele é
   * insubstituível — com carta, encanto ou de evento: aí o plano só considera
   * tentativas que não podem destruí-lo, custe o que custar.
   */
  perdaAceitavel: boolean;
  /**
   * Id do item no Divine Pride, quando ele veio da busca. É o que diz quais cubos e
   * martelos servem para ele; sem o id, sobram só os Pergaminhos, que valem pela
   * categoria (ver `atalhosDoItem`).
   */
  itemId: number | null;
  /** Permitir cubos, martelos e pergaminhos de refino como alternativa ao refinador. */
  usarAtalhos: boolean;
}

/**
 * Uma ação possível num nível de refino: uma tentativa no refinador, ou o uso de um cubo,
 * martelo ou pergaminho. As duas mudam o refino; só a primeira pode falhar.
 */
export type RefineAction = TentativaDeRefino | UsoDeAtalho;

/** Uma tentativa no refinador: um minério, com ou sem Bênção. */
export interface TentativaDeRefino {
  tipo: 'minerio';
  ore: Ore;
  /** Quantas Bênçãos do Ferreiro acompanham a tentativa (0 = nenhuma). */
  bencaos: number;
  /** Chance de sucesso desta tentativa. */
  chance: number;
  /** Taxa cobrada pelo refinador nesta tentativa, já dentro de `custo`. */
  taxa: number;
  /** Custo em zeny da tentativa (minério + bênçãos + taxa do NPC). */
  custo: number;
  /** Para onde o refino vai em caso de falha; `null` = item destruído. */
  falhaVaiPara: number | null;
}

/** Para onde uma ação leva o item, e com que probabilidade. `null` = item destruído. */
export interface Destino {
  refino: number | null;
  p: number;
}

/**
 * O uso de um cubo, martelo ou pergaminho de refino (ver `src/data/atalhos.ts`).
 *
 * Não há falha, nem taxa do refinador, nem Bênção: o atalho define o refino de chegada — fixo,
 * sorteado ou somado — e cobra o próprio item mais os materiais dele. Um destino acima do alvo da
 * fase conta como chegar ao alvo.
 */
export interface UsoDeAtalho {
  tipo: 'atalho';
  atalho: Atalho;
  /** Para onde o refino vai, em refino absoluto. Nunca `null`: atalho não destrói o item. */
  destinos: Destino[];
  /** Custo em zeny de um uso: o atalho mais os materiais. */
  custo: number;
  /** Sempre 0, e existe para a taxa poder ser lida de qualquer ação sem perguntar o tipo. */
  taxa: 0;
}

/** A ação escolhida para cada nível de refino, mais o custo esperado dali em diante. */
export interface PolicyEntry {
  de: number;
  acao: RefineAction;
  /** Custo esperado em zeny para sair deste refino e chegar ao alvo. */
  custoEsperado: number;
}

/** Contagem esperada de cada recurso consumido numa campanha. */
export interface ResourceUsage {
  zeny: number;
  /** Quantidade esperada de cada minério/material, por id de item. */
  itens: Record<number, number>;
  /** Quantos itens-base se espera destruir no caminho. */
  itensQuebrados: number;
  /** Número esperado de tentativas de refino. */
  tentativas: number;
  /**
   * Zeny esperado só em taxa do refinador. Não é `tentativas x taxa`: ela some nos
   * minérios de Cash Shop das armas nv1 a nv4.
   */
  taxas: number;
}

export interface Percentis {
  p50: number;
  p75: number;
  p90: number;
  p95: number;
  p99: number;
}
