// Para onde vai o zeny: a lista de compras relida como fluxo.
//
// A tabela responde "o que eu compro e quanto custa cada linha". Ela não
// responde a pergunta que decide se vale a pena começar: quanto do orçamento é
// minério, quanto é proteção e quanto é o próprio equipamento sendo consumido.
// Nos preços padrão, dois terços do orçamento de um +10 não são minério — e
// isso não se lê numa lista ordenada por valor.
//
// Os números são EXATAMENTE os da lista de compras: as duas leem o mesmo kit
// (ver `kit.ts`) pela mesma função (`listaDeCompras`). Um diagrama que
// discordasse da tabela ao lado não valeria nada.

import { BLESSING_ITEM_ID } from '../data/ores';
import { ETHER_BLESSING_ITEM_ID } from '../data/grade';
import { nomeDoItem } from '../data/nomes';
import { listaDeCompras } from './pricing';
import type { Kit } from './kit';
import type { Resultado as ResultadoPlano } from './plan';

/**
 * A que se destina cada zeny gasto.
 *
 * A divisão não é por tipo de item, é por natureza do gasto — e cada grupo
 * responde a uma decisão diferente do jogador: procurar fornecedor mais barato
 * (materiais), desmarcar "posso usar Bênção" (proteção), desmarcar "posso
 * perder o item" (reposição).
 *
 * Os dois gastos com NPC ficam separados de propósito, porque são NPCs
 * diferentes fazendo coisas diferentes:
 *
 * - `fabricacao` é o balcão que **refina o minério**: 5 Minério de Oridecon
 *   viram 1 Oridecon, 3 Oridecon mais 50.000z viram 1 Bradium. É custo de
 *   PREPARAR o material, e some inteiro se o minério pronto for comprado no
 *   mercado — a calculadora escolhe a via mais barata sozinha.
 * - `refino` é a taxa do refinador: o que se paga por **tentativa no
 *   equipamento**. Não depende de fornecedor nenhum, cresce com o número de
 *   tentativas e some nos minérios de Cash Shop das armas nv1 a nv4.
 *
 * Juntá-los escondia que um se resolve comprando melhor e o outro não se
 * resolve de jeito nenhum.
 */
export type CategoriaCusto =
  | 'protecao'
  | 'materiais'
  | 'fabricacao'
  | 'refino'
  | 'item';

export interface FolhaCusto {
  id: string;
  rotulo: string;
  valor: number;
  /** Unidades, quando a linha é contável. O balcão e a reposição não são. */
  qtd?: number;
  categoria: CategoriaCusto;
}

export interface GrupoCusto {
  categoria: CategoriaCusto;
  rotulo: string;
  valor: number;
  folhas: FolhaCusto[];
}

export interface FluxoDeCusto {
  /** Soma de todos os grupos. É o total da lista de compras, não o orçamento. */
  total: number;
  grupos: GrupoCusto[];
}

const ROTULO_CATEGORIA: Record<CategoriaCusto, string> = {
  protecao: 'Proteção',
  materiais: 'Minérios e materiais',
  fabricacao: 'Refino dos minérios',
  refino: 'Refino do equipamento',
  item: 'Reposição do item',
};

/** Ordem de leitura dos grupos, quando empatam em valor. */
const ORDEM: CategoriaCusto[] = ['protecao', 'item', 'materiais', 'fabricacao', 'refino'];

/**
 * Quantas linhas um grupo mostra antes de dobrar a cauda em "outras".
 *
 * Uma campanha de Grau A abre oito minérios fabricados, e os quatro últimos
 * somam menos de 1% cada: viram fios de cabelo com o rótulo empurrado para
 * longe, e o desenho passa a atrapalhar a leitura que ele existe para dar. O
 * total nunca muda — a tabela ao lado continua com a conta linha a linha.
 */
const MAX_FOLHAS = 6;

/** As Bênçãos não são material de refino: são o que se paga para não perder. */
const PROTECAO = new Set([BLESSING_ITEM_ID, ETHER_BLESSING_ITEM_ID]);

export function fluxoDeCusto(plano: ResultadoPlano, kit: Kit): FluxoDeCusto {
  const lista = listaDeCompras(kit.itens, plano.input.precos);
  const quebras = kit.reposicoes;
  const { refino, grau, balcao } = kit.zenyPorTipo;

  const folhas: FolhaCusto[] = [];

  for (const linha of lista.compras) {
    if (linha.total <= 0) continue;
    folhas.push({
      id: `item-${linha.itemId}`,
      rotulo: nomeDoItem(linha.itemId),
      valor: linha.total,
      qtd: linha.qtd,
      categoria: PROTECAO.has(linha.itemId) ? 'protecao' : 'materiais',
    });
  }

  if (quebras > 0 && plano.input.precoItem > 0) {
    folhas.push({
      id: 'reposicao',
      rotulo: 'Cópias novas, no +0',
      valor: quebras * plano.input.precoItem,
      qtd: quebras,
      categoria: 'item',
    });
  }

  // O kit leva o fabricado desmontado e paga o balcão em zeny, num número só.
  // Ele se abre por receita na proporção da campanha média — é o nome que diz
  // qual delas vale a pena procurar pronto no mercado.
  const receitas = listaDeCompras(plano.recursos.itens, plano.input.precos).fabricacao;
  const balcaoMedio = receitas.reduce((s, f) => s + f.zeny, 0);
  if (balcao > 0 && balcaoMedio > 0) {
    let resto = balcao;
    receitas.forEach((f, i) => {
      const valor = i === receitas.length - 1 ? resto : (balcao * f.zeny) / balcaoMedio;
      resto -= valor;
      if (valor <= 0) return;
      folhas.push({
        id: `balcao-${f.itemId}`,
        rotulo: `Fabricar ${nomeDoItem(f.itemId)}`,
        valor,
        qtd: f.qtd,
        categoria: 'fabricacao',
      });
    });
  }

  if (refino > 0) {
    folhas.push({
      id: 'taxa',
      rotulo: 'Taxas de Refino',
      valor: refino,
      qtd: Math.round(plano.recursos.tentativas),
      categoria: 'refino',
    });
  }
  if (grau > 0) {
    folhas.push({ id: 'taxa-grau', rotulo: 'Taxas para Grau', valor: grau, categoria: 'refino' });
  }

  const grupos: GrupoCusto[] = [];
  for (const categoria of ORDEM) {
    const minhas = folhas
      .filter((f) => f.categoria === categoria)
      .sort((a, b) => b.valor - a.valor);
    if (minhas.length === 0) continue;

    const valor = minhas.reduce((s, f) => s + f.valor, 0);

    // Só dobra se sobrar mais de uma na cauda: trocar a última linha por
    // "+1 outra" não economiza espaço nenhum e ainda esconde um nome.
    let exibidas = minhas;
    if (minhas.length > MAX_FOLHAS + 1) {
      const cauda = minhas.slice(MAX_FOLHAS);
      exibidas = [
        ...minhas.slice(0, MAX_FOLHAS),
        {
          id: `outros-${categoria}`,
          rotulo: `+${cauda.length} outras linhas`,
          valor: cauda.reduce((s, f) => s + f.valor, 0),
          categoria,
        },
      ];
    }

    grupos.push({
      categoria,
      rotulo:
        categoria === 'refino' && grau > 0 ? 'Refino e Grau do equipamento' : ROTULO_CATEGORIA[categoria],
      valor,
      folhas: exibidas,
    });
  }

  // Grupo mais caro primeiro: a resposta de "para onde vai o zeny" é a primeira
  // faixa do desenho, não uma que se procura.
  grupos.sort((a, b) => b.valor - a.valor);

  return { total: grupos.reduce((s, g) => s + g.valor, 0), grupos };
}
