// Classificação de um item do Divine Pride na categoria que o motor entende.
//
// A calculadora só precisa saber duas coisas sobre o equipamento: se ele pode
// ser refinado, e qual coluna da tabela de chances vale para ele.

import type { ItemKind } from './ores';

/** Campos extraídos da página pública do Divine Pride. */
export interface DivinePrideItem {
  id: number;
  /** Nome no servidor LATAM, em português. */
  nome: string;
  /** Campo "Type" da ficha: Weapon, Armor, Costume, Shadow Equipment, Card... */
  tipo: string;
  /** Campo "Sub Type": Knuckle, Headgear, Accessory, Costume Garment... */
  subtipo: string;
  /** Linha "Equipa em:" da descrição — Topo, Meio, Baixo, "Meio e Baixo". */
  posicao: string | null;
  /** "Nível da arma: N", quando existe. */
  nivelArma: number | null;
  /** "Nível da armadura: N", quando existe. Ausente significa nível 1. */
  nivelArmadura: number | null;
  slots: number;
}

export type MotivoNaoRefinavel =
  | 'visual'
  | 'acessorio'
  | 'cabeca-meio-baixo'
  | 'nao-equipamento'
  | 'nivel-desconhecido'
  | 'posicao-desconhecida';

export const EXPLICACAO: Record<MotivoNaoRefinavel, string> = {
  visual: 'Itens visuais (Costume) não são refináveis.',
  acessorio: 'Acessórios comuns não são refináveis — só os acessórios sombrios.',
  'cabeca-meio-baixo':
    'Equipamentos de cabeça que ocupam apenas Meio e/ou Baixo não são refináveis. Só os de Topo.',
  'nao-equipamento': 'Este item não é uma arma nem um equipamento.',
  'nivel-desconhecido':
    'Não foi possível determinar o nível da arma na ficha do Divine Pride. Escolha a categoria à mão.',
  'posicao-desconhecida':
    'A ficha não diz em que posição da cabeça este item é equipado, e isso decide se ele refina. Escolha a categoria à mão.',
};

export type Classificacao =
  | { refinavel: true; kind: ItemKind }
  | { refinavel: false; motivo: MotivoNaoRefinavel };

const contem = (s: string, termo: string) => s.toLowerCase().includes(termo.toLowerCase());

/**
 * Decide a categoria de refino de um item.
 *
 * Cuidado com duas exceções que parecem contradizer as regras gerais:
 *  - acessórios comuns não refinam, mas os SOMBRIOS refinam (o Brinco e o Colar
 *    sombrios são refináveis, conforme o Browiki);
 *  - equipamentos de cabeça só refinam quando ocupam o Topo.
 */
export function classificar(item: DivinePrideItem): Classificacao {
  const { tipo, subtipo } = item;

  // Visuais: não refinam, e vêm antes de tudo porque um "Costume Headgear"
  // também casaria com as regras de equipamento de cabeça.
  if (contem(tipo, 'costume') || contem(subtipo, 'costume')) {
    return { refinavel: false, motivo: 'visual' };
  }

  // Sombrios: categoria própria, com tabela de chances própria e teto no +10.
  // Inclui os acessórios sombrios, que são a exceção à regra dos acessórios.
  // Arma e armadura são separadas porque usam minérios diferentes.
  if (contem(tipo, 'shadow') || contem(subtipo, 'shadow')) {
    const arma = contem(tipo, 'weapon') || contem(subtipo, 'weapon');
    return { refinavel: true, kind: arma ? 'shadowW' : 'shadowA' };
  }

  if (contem(tipo, 'weapon')) {
    const nivel = item.nivelArma;
    if (nivel === null || nivel < 1 || nivel > 5) {
      return { refinavel: false, motivo: 'nivel-desconhecido' };
    }
    return { refinavel: true, kind: `w${nivel}` as ItemKind };
  }

  if (contem(tipo, 'armor')) {
    if (contem(subtipo, 'accessory')) {
      return { refinavel: false, motivo: 'acessorio' };
    }

    if (contem(subtipo, 'headgear')) {
      // "Equipa em: Topo / Meio / Baixo / Meio e Baixo" em português, ou
      // "Location: Upper / Middle / Lower" em inglês. Só refina o que ocupa o Topo.
      //
      // Sem a posição não dá para decidir: dizer "não refina" seria um falso
      // negativo silencioso, então preferimos admitir que não sabemos.
      if (!item.posicao) {
        return { refinavel: false, motivo: 'posicao-desconhecida' };
      }
      if (!contem(item.posicao, 'topo') && !contem(item.posicao, 'upper')) {
        return { refinavel: false, motivo: 'cabeca-meio-baixo' };
      }
    }

    // Armadura, escudo, calçado, capa e cabeça-de-topo: nível 1, salvo quando a
    // ficha declara nível 2 (o conteúdo de Éter, que é o que tem Grau).
    return { refinavel: true, kind: item.nivelArmadura === 2 ? 'a2' : 'a1' };
  }

  return { refinavel: false, motivo: 'nao-equipamento' };
}
