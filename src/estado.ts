import { DEFAULT_PRICES } from './data/defaultPrices';
import type { Grade } from './data/grade';
import type { ItemKind } from './data/ores';
import { suportaGrau } from './engine/grade';
import type { PriceTable } from './engine/types';
import { ESTOQUE_VAZIO, type EstoqueSalvo } from './components/Estoque';
import { RELATO_VAZIO, type RelatoSalvo } from './components/JaRefinei';
import type { MargemKey } from './components/Resultado';

/**
 * A pergunta da tela: tudo o que a pessoa preenche, e nada do que a conta devolve.
 *
 * Mora fora do `App.tsx` porque tem dois leitores — o app, que a guarda no
 * `localStorage`, e o link compartilhado (`compartilhar.ts`), que a carrega na
 * URL e precisa conferi-la campo a campo antes de deixá-la entrar.
 */
export interface Estado {
  /** Nome do item escolhido na busca, só para exibição. */
  itemNome: string | null;
  /** ID no Divine Pride do item escolhido, para poder linkar a ficha de origem. */
  itemId: number | null;
  /** Slots do item, só para escrever o nome como o jogo escreve: `Adaga [2]`. */
  itemSlots: number;
  kind: ItemKind;
  precoItem: number;
  refinoAtual: number;
  refinoAlvo: number;
  grauAtual: Grade;
  grauAlvo: Grade;
  evento: boolean;
  usarBencaoFerreiro: boolean;
  usarMineriosEspeciais: boolean;
  perdaAceitavel: boolean;
  usarAtalhos: boolean;
  precos: PriceTable;
  margem: MargemKey;
}

/**
 * O que a tela mostra para quem chega sem mexer em nada.
 *
 * Não é um exemplo neutro de propósito: é um alvo que gente de verdade
 * persegue — uma armadura nível 2 de mercado levada ao +12 Grau A. Sem perda
 * aceitável, porque a 350kk ninguém aposta a armadura. Categoria abstrata e
 * alvo redondo faziam a primeira tela parecer uma demonstração; um item
 * nomeado, com arte e preço plausível, já responde a pergunta de alguém.
 */
export const INICIAL: Estado = {
  itemNome: 'Armadura Nebulosa POD',
  itemId: 450169,
  itemSlots: 1,
  kind: 'a2',
  precoItem: 350_000_000,
  refinoAtual: 0,
  refinoAlvo: 12,
  grauAtual: 'none',
  grauAlvo: 'A',
  evento: true,
  usarBencaoFerreiro: true,
  usarMineriosEspeciais: true,
  perdaAceitavel: false,
  usarAtalhos: true,
  precos: DEFAULT_PRICES,
  margem: 'p90',
};

export const CHAVE_STORAGE = 'refinometro:v1';

/**
 * O estoque fica fora de `Estado` de propósito: ele não entra no cálculo, e
 * misturá-lo faria cada tecla digitada num campo de minério refazer o passe
 * rápido à toa. O veredito sai das campanhas já simuladas (ver
 * `engine/estoque.ts`), então basta guardá-lo à parte.
 */
export const CHAVE_ESTOQUE = 'refinometro:estoque:v1';

/** O que a pessoa contou da campanha que já fez — a aba "Já refinei". */
export const CHAVE_RELATO = 'refinometro:relato:v1';

export function carregar(): Estado {
  try {
    const bruto = localStorage.getItem(CHAVE_STORAGE);
    if (!bruto) return INICIAL;
    // Mescla com o inicial para não quebrar quando a calculadora ganhar campos novos.
    const salvo = JSON.parse(bruto) as Partial<Estado>;
    const estado = { ...INICIAL, ...salvo, precos: { ...DEFAULT_PRICES, ...salvo.precos } };
    // O padrão tem Grau, e quem voltar com uma categoria que não tem herdaria
    // um alvo impossível: o efeito que normaliza isso só roda depois do
    // primeiro render, e o erro apareceria por um quadro.
    return suportaGrau(estado.kind)
      ? estado
      : { ...estado, grauAtual: 'none' as Grade, grauAlvo: 'none' as Grade };
  } catch {
    return INICIAL;
  }
}

export function carregarRelato(): RelatoSalvo {
  try {
    const bruto = localStorage.getItem(CHAVE_RELATO);
    if (!bruto) return RELATO_VAZIO;
    return { ...RELATO_VAZIO, ...(JSON.parse(bruto) as Partial<RelatoSalvo>) };
  } catch {
    return RELATO_VAZIO;
  }
}

export function carregarEstoque(): EstoqueSalvo {
  try {
    const bruto = localStorage.getItem(CHAVE_ESTOQUE);
    if (!bruto) return ESTOQUE_VAZIO;
    return { ...ESTOQUE_VAZIO, ...(JSON.parse(bruto) as Partial<EstoqueSalvo>) };
  } catch {
    return ESTOQUE_VAZIO;
  }
}
