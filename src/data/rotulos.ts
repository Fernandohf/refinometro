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
  { key: 'shadowW', rotulo: 'Manopla Sombria', curto: 'Manopla Sombria' },
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

/**
 * Cor da letra do Grau, como o jogo a desenha.
 *
 * Os valores não são escolha de design: são a cor dominante de cada ícone
 * `itemgrade_*.png` do Browiki (https://browiki.org/wiki/Grau), amostrada do
 * PNG. Sem isso o Grau viraria só uma letra, e no jogo a cor é o que se
 * reconhece de longe.
 */
export const COR_GRAU: Record<Grade, { letra: string; forte: string; claro: string } | null> = {
  none: null,
  D: { letra: 'D', forte: '#BF5159', claro: '#FF968F' },
  C: { letra: 'C', forte: '#CF9400', claro: '#F1CD00' },
  B: { letra: 'B', forte: '#249000', claro: '#9BD300' },
  A: { letra: 'A', forte: '#7E6E8F', claro: '#D0CCE2' },
};

/**
 * O nome do item como ele aparece no jogo: `+10 [B] Adaga [2]`.
 *
 * O prefixo do Grau entre colchetes é o formato documentado no Browiki; o `+N`
 * vem antes, e os slots depois, como no cliente. As partes voltam separadas
 * porque cada uma é pintada de um jeito.
 */
export function nomeNoJogo(
  nome: string,
  refino: number,
  grau: Grade,
  slots = 0,
): { refino: string | null; grau: string | null; nome: string; slots: string | null } {
  return {
    refino: refino > 0 ? `+${refino}` : null,
    grau: grau === 'none' ? null : `[${grau}]`,
    nome,
    slots: slots > 0 ? `[${slots}]` : null,
  };
}
