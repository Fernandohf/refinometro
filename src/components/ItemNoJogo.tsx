import type { ReactNode } from 'react';

import type { Grade } from '../data/grade';
import { nomeDoItem } from '../data/nomes';
import { COR_GRAU, nomeNoJogo, rotuloCurto } from '../data/rotulos';
import type { ItemKind } from '../data/ores';
import { fichaNoDivinePride } from '../data/items';
import { quantidade } from '../format';
import { Pastilha } from './ui';

/**
 * Arte do item, servida pelo próprio Divine Pride.
 *
 * Não passa pela base varrida e não custa byte nenhum de dados nossos: a URL é
 * o id do item, e `<img>` não esbarra em CORS — que é o que impede a busca ao
 * vivo (ver README, "Por que a base é varrida"). Um id sem arte devolve o
 * ícone de desconhecido do próprio site, então não há estado de erro a tratar.
 */
const arteDoItem = (id: number) =>
  `https://static.divine-pride.net/images/items/collection/${id}.png`;

/**
 * Slot de inventário: a moldura quadrada em que o cliente desenha todo item.
 *
 * `.sprite` mantém o sprite em pixel cravado ao ampliar — suavizar a arte de
 * um jogo de 2002 é justamente o que faria a tela parecer não ser dele.
 */
export function SlotItem({
  id,
  tamanho = 'normal',
}: {
  id: number | null;
  /** `mini` é o que cabe dentro de uma pastilha, no meio de uma frase. */
  tamanho?: 'mini' | 'normal' | 'grande';
}) {
  // Trocar de item troca a URL, e a imagem antiga ficaria à mostra até a nova
  // baixar. A chave zera o <img> junto com o id.
  const lado = { mini: 'size-6 rounded-md', normal: 'size-10 rounded-lg', grande: 'size-16 rounded-xl' }[
    tamanho
  ];

  return (
    <span
      className={`${lado} inline-flex shrink-0 items-center justify-center border border-borda bg-fundo p-0.5`}
    >
      {id === null ? (
        <span aria-hidden className="text-lg text-suave/50">
          ?
        </span>
      ) : (
        <img
          key={id}
          src={arteDoItem(id)}
          alt=""
          loading="lazy"
          className="sprite max-h-full max-w-full"
        />
      )}
    </span>
  );
}

/**
 * Um material com a arte ao lado do nome.
 *
 * Uma lista de compras escrita só em nomes obriga a traduzir cada linha antes
 * de procurar o item no jogo — e "Minério de Oridecon" e "Oridecon" são duas
 * linhas seguidas com nomes quase iguais e sprites que não se parecem em nada.
 * A arte é o que o jogador reconhece na loja; o nome é o que ele confere.
 */
export function ItemComArte({
  itemId,
  nome,
  apoio,
}: {
  itemId: number;
  /** Sobrescreve o nome do catálogo, quando a linha precisa dizer outra coisa. */
  nome?: ReactNode;
  /** Segunda linha, menor: o preço unitário, a via de obtenção. */
  apoio?: ReactNode;
}) {
  return (
    <span className="flex min-w-0 items-center gap-2.5">
      <SlotItem id={itemId} />
      <span className="min-w-0">
        <span className="md-corpo-m block font-medium text-texto">{nome ?? nomeDoItem(itemId)}</span>
        {apoio && <span className="md-corpo-p block text-suave">{apoio}</span>}
      </span>
    </span>
  );
}

/**
 * A composição de um item: o que o NPC pede em troca de uma unidade dele.
 *
 * Cada insumo vira uma pastilha com a própria arte, e não uma linha de texto,
 * porque a pergunta que ela responde é de relance — "isto aqui vira aquilo
 * ali" — e porque uma receita de três insumos numa frase corrida some no meio
 * do resto da lista.
 *
 * O número em destaque é a PROPORÇÃO da receita, não o total: o total de cada
 * insumo já é uma linha da lista de compras logo acima, e repeti-lo aqui só
 * duplicaria o que a pessoa vai comprar. A proporção é o que explica a linha —
 * é ela que liga os 1.900 Minério de Oridecon aos 380 Oridecon do plano.
 */
export function Composicao({
  materiais,
}: {
  materiais: { itemId: number; nome: string; porUnidade: number; total: number }[];
}) {
  return (
    <ul className="flex flex-wrap items-center gap-1.5">
      {materiais.map((m) => (
        <li key={m.itemId}>
          <Pastilha titulo={`${quantidade(m.total)} no total desta campanha`}>
            <SlotItem id={m.itemId} tamanho="mini" />
            <span className="tabular-nums">{m.porUnidade}x</span>
            <span className="font-normal">{m.nome}</span>
            <span className="tabular-nums opacity-60">({quantidade(m.total)})</span>
          </Pastilha>
        </li>
      ))}
    </ul>
  );
}

/**
 * O nome como o jogo escreve: `+10 [B] Adaga [2]`.
 *
 * O `+N` em dourado e a letra do Grau na cor do ícone do cliente (ver
 * `COR_GRAU`) — no jogo é a cor, e não o texto, que se reconhece de longe.
 *
 * Usa a variante CLARA de cada grau: as duas saem do mesmo ícone do Browiki, e
 * sobre o fundo escuro da página a dominante (`forte`) fica ilegível — o verde
 * do Grau B, em especial, some.
 */
export function NomeNoJogo({
  nome,
  refino,
  grau,
  slots = 0,
  tamanho = 'normal',
}: {
  nome: string;
  refino: number;
  grau: Grade;
  slots?: number;
  tamanho?: 'normal' | 'grande';
}) {
  const partes = nomeNoJogo(nome, refino, grau, slots);
  const cor = COR_GRAU[grau];

  return (
    <span className={tamanho === 'grande' ? 'text-lg font-semibold' : 'text-sm font-medium'}>
      {partes.refino && <span className="text-realce">{partes.refino} </span>}
      {partes.grau && (
        <span style={{ color: cor?.claro }} title={`Grau ${grau}`}>
          {partes.grau}{' '}
        </span>
      )}
      <span className="text-texto">{partes.nome}</span>
      {partes.slots && <span className="text-suave"> {partes.slots}</span>}
    </span>
  );
}

/**
 * O item da campanha, com arte e nome, no topo do resultado.
 *
 * Mostra o item como ele vai ficar — no refino e no grau ALVO, não no atual. É
 * a coisa que se está comprando com o orçamento logo abaixo, e ver o nome
 * pronto é o que dá sentido ao número.
 */
export function CartaoItem({
  itemId,
  itemNome,
  kind,
  refino,
  grau,
  slots,
}: {
  itemId: number | null;
  itemNome: string | null;
  kind: ItemKind;
  refino: number;
  grau: Grade;
  slots: number;
}) {
  return (
    <div className="flex items-center gap-3">
      <SlotItem id={itemId} tamanho="grande" />
      <div className="min-w-0">
        <NomeNoJogo
          nome={itemNome ?? rotuloCurto(kind)}
          refino={refino}
          grau={grau}
          slots={slots}
          tamanho="grande"
        />
        <div className="mt-0.5 text-xs text-suave">
          {/* Sem item escolhido o nome JÁ é a categoria: repeti-la aqui só
              encheria a linha. */}
          {itemNome ? rotuloCurto(kind) : 'nenhum item escolhido na busca'}
          {itemId !== null && (
            <>
              {' · '}
              <a
                className="text-realce hover:underline"
                href={fichaNoDivinePride(itemId)}
                target="_blank"
                rel="noreferrer noopener"
              >
                ficha #{itemId}
              </a>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
