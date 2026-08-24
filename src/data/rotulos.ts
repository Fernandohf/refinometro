import type { Grade } from './grade';
import type { ItemKind } from './ores';

/**
 * Nomes das categorias e dos graus, num só lugar.
 *
 * A tela escreve a mesma categoria em três contextos — no `<select>`, no
 * resultado da busca e no cabeçalho do resultado — e cada um pede um
 * comprimento diferente. Manter as duas formas juntas evita que elas passem a
 * discordar ("Armadura nível 1" numa tela, "Equip. nv1" na outra).
 */
export const CATEGORIAS: { key: ItemKind; rotulo: string; curto: string }[] = [
  { key: 'w1', rotulo: 'Arma nível 1', curto: 'Arma nv1' },
  { key: 'w2', rotulo: 'Arma nível 2', curto: 'Arma nv2' },
  { key: 'w3', rotulo: 'Arma nível 3', curto: 'Arma nv3' },
  { key: 'w4', rotulo: 'Arma nível 4', curto: 'Arma nv4' },
  { key: 'w5', rotulo: 'Arma nível 5', curto: 'Arma nv5' },
  { key: 'a1', rotulo: 'Armadura / Equipamento nível 1', curto: 'Equip. nv1' },
  { key: 'a2', rotulo: 'Armadura / Equipamento nível 2', curto: 'Equip. nv2' },
  { key: 'shadowW', rotulo: 'Arma Sombria', curto: 'Arma Sombria' },
  { key: 'shadowA', rotulo: 'Equipamento Sombrio', curto: 'Equip. Sombrio' },
];

const POR_KIND = new Map(CATEGORIAS.map((c) => [c.key, c]));

export function rotuloCurto(kind: ItemKind): string {
  return POR_KIND.get(kind)?.curto ?? kind;
}

export const ROTULO_GRAU: Record<Grade, string> = {
  none: 'Sem grau',
  D: 'Grau D',
  C: 'Grau C',
  B: 'Grau B',
  A: 'Grau A',
};
