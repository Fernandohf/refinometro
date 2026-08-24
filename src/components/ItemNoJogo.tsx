import type { Grade } from '../data/grade';
import { COR_GRAU, nomeNoJogo, rotuloCurto } from '../data/rotulos';
import type { ItemKind } from '../data/ores';
import { fichaNoDivinePride } from '../data/items';

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
  tamanho?: 'normal' | 'grande';
}) {
  // Trocar de item troca a URL, e a imagem antiga ficaria à mostra até a nova
  // baixar. A chave zera o <img> junto com o id.
  const lado = tamanho === 'grande' ? 'size-16' : 'size-10';

  return (
    <div
      className={`${lado} flex shrink-0 items-center justify-center rounded-lg border border-borda bg-fundo p-0.5`}
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
    </div>
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
