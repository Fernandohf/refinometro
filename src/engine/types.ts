import type { ItemKind, Ore } from '../data/ores';
import type { Grade } from '../data/grade';

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
}

/** Uma ação possível numa tentativa de refino: um minério, com ou sem Bênção. */
export interface RefineAction {
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
   * Zeny esperado só em taxa do refinador. Não é `tentativas x taxa`: a taxa
   * muda conforme o minério da tentativa, e some nos minérios de Cash Shop.
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
