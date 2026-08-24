// A base de itens: nome, slots e categoria de refino de tudo que o Divine Pride
// lista como arma, equipamento ou sombrio no servidor LATAM.
//
// O arquivo é gerado por `npm run data:items` e versionado — ver
// `scripts/atualizar-base.ts` para o porquê de não ser consultado ao vivo.
//
// Ele é grande (milhares de itens), então entra por `import()` dinâmico: quem
// abre a calculadora para fazer uma conta não baixa a base junto; ela chega
// quando a busca é usada pela primeira vez.

import type { ItemKind } from './ores';
import { EXPLICACAO, type MotivoNaoRefinavel } from './itemKinds';
import meta from './itemsMeta.json';

/**
 * De onde veio a base e quando. É o par do `items.json`, separado justamente
 * para poder ser importado direto: creditar a fonte e datar a varredura não pode
 * custar o download de milhares de itens.
 */
export const META: { fonte: string; servidor: string; geradoEm: string; total: number } = meta;

/** Ficha pública do item no Divine Pride — a origem de tudo que a base afirma. */
export const fichaNoDivinePride = (id: number) =>
  `https://www.divine-pride.net/database/item/${id}`;

export interface ItemDb {
  id: number;
  nome: string;
  slots: number;
  /** Categoria de refino. Ausente quando o item não pode ser refinado. */
  kind?: ItemKind;
  /** Por que o item não é refinável, quando for o caso. */
  naoRefinavel?: MotivoNaoRefinavel;
}

/** Linha crua do items.json: `[id, nome, slots, classe]`. */
export type LinhaSalva = [number, string, number, string];

export interface BaseItens {
  itens: ItemDb[];
  /** Busca por nome, tolerante a acento e maiúscula. */
  buscar(termo: string, limite?: number): ItemDb[];
}

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

/** Monta a base a partir das linhas cruas. Exportada para os testes poderem
 *  exercitar a ordenação com um punhado de itens conhecidos. */
export function montarBase(linhas: LinhaSalva[]): BaseItens {
  const itens = linhas.map(([id, nome, slots, classe]): ItemDb =>
    classe.startsWith('!')
      ? { id, nome, slots, naoRefinavel: classe.slice(1) as MotivoNaoRefinavel }
      : { id, nome, slots, kind: classe as ItemKind },
  );
  const indice = itens.map((item) => ({ item, chave: chave(item.nome) }));

  return {
    itens,
    buscar(termo, limite = 20) {
      const t = chave(termo.trim());
      if (t.length < 2) return [];
      const termos = t.split(/\s+/);

      // Com milhares de itens, "espada" casa com dezenas — a ordem é que decide
      // se a busca serve. Quem começa com o que foi digitado vem primeiro, depois
      // quem tem uma PALAVRA começando com ele ("Espada Flamejante" antes de
      // "Grande Espada"), e só então o resto. Empate vai para o nome mais curto,
      // que é quase sempre o item base em vez de uma variante.
      const achados: { item: ItemDb; posto: number }[] = [];
      for (const { item, chave: c } of indice) {
        if (!termos.every((parte) => c.includes(parte))) continue;
        const posto = c.startsWith(t) ? 0 : c.includes(` ${t}`) ? 1 : 2;
        achados.push({ item, posto });
      }

      achados.sort(
        (a, b) =>
          a.posto - b.posto ||
          a.item.nome.length - b.item.nome.length ||
          a.item.nome.localeCompare(b.item.nome, 'pt-BR'),
      );
      return achados.slice(0, limite).map((a) => a.item);
    },
  };
}

let promessa: Promise<BaseItens> | null = null;

/**
 * Carrega a base sob demanda. Chamadas repetidas dividem o mesmo download.
 *
 * Uma falha esquece a promessa em vez de guardá-la: senão uma queda de rede na
 * primeira tentativa condenaria a busca pelo resto da visita.
 */
export function carregarBase(): Promise<BaseItens> {
  promessa ??= import('./items.json').then(
    (m) => {
      // O TypeScript infere `(string | number)[][]` do JSON e não tem como saber
      // que cada linha tem exatamente quatro posições — quem garante isso é o
      // `salvarBase` que escreveu o arquivo.
      const db = (m.default ?? m) as unknown as { itens: LinhaSalva[] };
      return montarBase(db.itens);
    },
    (erro) => {
      promessa = null;
      throw erro;
    },
  );
  return promessa;
}
