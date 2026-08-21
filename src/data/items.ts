import itemsJson from './items.json';
import type { ItemKind } from './ores';
import { EXPLICACAO, type MotivoNaoRefinavel } from './itemKinds';

export interface ItemDb {
  id: number;
  nome: string;
  slots: number;
  /** Categoria de refino. Ausente quando o item não pode ser refinado. */
  kind?: ItemKind;
  /** Por que o item não é refinável, quando for o caso. */
  naoRefinavel?: MotivoNaoRefinavel;
}

const db = itemsJson as { itens: ItemDb[]; _geradoEm: string | null };

export const ITENS: ItemDb[] = db.itens;
export const ITENS_GERADO_EM: string | null = db._geradoEm;
export const TEM_BASE_DE_ITENS = ITENS.length > 0;

/** Texto que explica por que um item não pode ser refinado. */
export function motivoLegivel(motivo: MotivoNaoRefinavel): string {
  return EXPLICACAO[motivo] ?? 'Este item não é refinável.';
}

/** Normaliza para busca: sem acento, minúsculo. */
function chave(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();
}

const INDICE = ITENS.map((item) => ({ item, chave: chave(item.nome) }));

/** Busca por nome, tolerante a acento e maiúscula. */
export function buscarItens(termo: string, limite = 20): ItemDb[] {
  const t = chave(termo.trim());
  if (t.length < 2) return [];
  const comeca: ItemDb[] = [];
  const contem: ItemDb[] = [];
  for (const { item, chave: c } of INDICE) {
    if (c.startsWith(t)) comeca.push(item);
    else if (c.includes(t)) contem.push(item);
    if (comeca.length >= limite) break;
  }
  return [...comeca, ...contem].slice(0, limite);
}
