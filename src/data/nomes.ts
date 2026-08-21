import { GRADE_RECIPES } from './grade';
import { ORES } from './ores';
import { PRICE_FIELDS } from './defaultPrices';

/**
 * Nome legível de cada item que a calculadora manipula.
 *
 * As tabelas de dados já carregam os nomes espalhados — no minério, nos
 * materiais das receitas, nos campos de preço. Reunir tudo num lugar só evita
 * que cada tela remonte o mesmo dicionário à sua maneira.
 */
const NOMES = new Map<number, string>();

for (const ore of ORES) {
  NOMES.set(ore.itemId, ore.nome);
  for (const mat of ore.npc?.materiais ?? []) if (!NOMES.has(mat.itemId)) NOMES.set(mat.itemId, mat.nome);
}
for (const [itemId, receita] of Object.entries(GRADE_RECIPES)) {
  NOMES.set(Number(itemId), receita.nome);
  for (const mat of receita.materiais) if (!NOMES.has(mat.itemId)) NOMES.set(mat.itemId, mat.nome);
}
for (const grupo of PRICE_FIELDS) {
  for (const item of grupo.itens) if (!NOMES.has(item.itemId)) NOMES.set(item.itemId, item.nome);
}

export function nomeDoItem(itemId: number): string {
  return NOMES.get(itemId) ?? `Item ${itemId}`;
}
