import { useEffect, useId, useMemo, useRef, useState } from 'react';

import {
  carregarBase,
  fichaNoDivinePride,
  META,
  motivoLegivel,
  type BaseItens,
  type ItemDb,
} from '../data/items';
import { rotuloCurto } from '../data/rotulos';
import { SlotItem } from './ItemNoJogo';
import { Campo, Info, Pastilha } from './ui';
import { dataBR } from '../format';

/**
 * Busca o item na base varrida do Divine Pride, só para descobrir a categoria
 * dele — que é a única coisa que o cálculo precisa saber sobre o equipamento. O
 * preço continua sendo informado à mão, porque o Divine Pride não guarda cotação.
 *
 * A base tem milhares de itens e só é baixada quando alguém mexe na busca; até
 * lá o campo aceita digitação e mostra que está carregando. Quem só quer fazer
 * uma conta escolhendo a categoria na mão nunca paga esse download.
 */
export function BuscaItem({
  selecionado,
  idSelecionado,
  onSelecionar,
}: {
  selecionado: string | null;
  idSelecionado: number | null;
  onSelecionar: (item: ItemDb) => void;
}) {
  const [termo, setTermo] = useState('');
  const [focado, setFocado] = useState(false);
  const [recusado, setRecusado] = useState<ItemDb | null>(null);
  const [base, setBase] = useState<BaseItens | null>(null);
  const [querBase, setQuerBase] = useState(false);
  const [erro, setErro] = useState(false);
  /** Item sob o cursor do teclado; -1 = nenhum, e o Enter não faz nada. */
  const [ativo, setAtivo] = useState(-1);
  const listaId = useId();
  const lista = useRef<HTMLUListElement>(null);

  useEffect(() => {
    if (!querBase) return;
    let vivo = true;
    carregarBase().then(
      (b) => vivo && setBase(b),
      () => vivo && setErro(true),
    );
    return () => {
      vivo = false;
    };
  }, [querBase]);

  const resultados = useMemo(() => base?.buscar(termo) ?? [], [base, termo]);
  const mostrarLista = focado && resultados.length > 0;
  const carregando = querBase && !base && !erro;

  // O cursor volta ao começo a cada busca nova: manter a quinta linha marcada
  // enquanto a lista inteira mudou apontaria para um item que a pessoa nunca viu.
  useEffect(() => setAtivo(-1), [termo]);

  // Andar com o teclado tem de arrastar a lista junto, senão o cursor
  // desaparece embaixo da borda depois do sexto item.
  useEffect(() => {
    if (ativo < 0) return;
    lista.current?.children[ativo]?.scrollIntoView({ block: 'nearest' });
  }, [ativo]);

  function escolher(item: ItemDb) {
    // Itens não refináveis continuam aparecendo na busca: é mais útil dizer POR
    // QUE não dá do que fingir que não existem.
    if (item.kind) {
      onSelecionar(item);
      setRecusado(null);
    } else {
      setRecusado(item);
    }
    setTermo('');
    setFocado(false);
    setAtivo(-1);
  }

  function teclado(ev: React.KeyboardEvent<HTMLInputElement>) {
    if (ev.key === 'Escape') {
      setFocado(false);
      setAtivo(-1);
      return;
    }
    if (!mostrarLista) return;
    if (ev.key === 'ArrowDown') {
      ev.preventDefault();
      // Circular: do último volta ao primeiro, e a primeira seta para cima leva
      // ao fim da lista — é o que qualquer campo de busca faz.
      setAtivo((i) => (i + 1 >= resultados.length ? 0 : i + 1));
    } else if (ev.key === 'ArrowUp') {
      ev.preventDefault();
      setAtivo((i) => (i <= 0 ? resultados.length - 1 : i - 1));
    } else if (ev.key === 'Enter' && ativo >= 0) {
      ev.preventDefault();
      escolher(resultados[ativo]!);
    }
  }

  return (
    <div>
      <Campo
        label="Buscar item"
        dica={
          <>
            {META.total.toLocaleString('pt-BR')} itens do Divine Pride (servidor {META.servidor}),
            varridos em {dataBR(META.geradoEm)}. A busca serve só para descobrir a{' '}
            <strong className="text-texto">categoria de refino</strong> do equipamento — é a única
            coisa que o cálculo precisa saber sobre ele. Sem achar o seu item, escolha a categoria
            no campo abaixo.
          </>
        }
        apoio={
          erro ? (
            <span className="text-atencao">
              Não deu para carregar a base — escolha a categoria abaixo.
            </span>
          ) : undefined
        }
      >
        <div className="relative">
          <input
            type="text"
            role="combobox"
            aria-expanded={mostrarLista}
            aria-controls={listaId}
            aria-autocomplete="list"
            aria-activedescendant={ativo >= 0 ? `${listaId}-${ativo}` : undefined}
            className="w-full rounded-lg border border-contorno bg-fundo px-3 py-2.5 text-texto outline-none transition-[border-color,box-shadow] duration-200 ease-padrao hover:border-texto focus:border-realce focus:shadow-[inset_0_0_0_1px_var(--color-realce)]"
            placeholder="Ex.: Luva de Segurança"
            value={termo}
            onChange={(ev) => {
              setQuerBase(true);
              setTermo(ev.target.value);
            }}
            onFocus={() => {
              setQuerBase(true);
              setFocado(true);
            }}
            onKeyDown={teclado}
            // O blur é adiado para o clique no resultado chegar antes da lista sumir.
            onBlur={() => setTimeout(() => setFocado(false), 150)}
          />

          {mostrarLista && (
            <ul
              id={listaId}
              ref={lista}
              role="listbox"
              className="absolute z-10 mt-1 max-h-64 w-full overflow-y-auto rounded-xl bg-superficie-alta py-1 shadow-e3"
            >
              {resultados.map((item, i) => (
                <li
                  key={item.id}
                  id={`${listaId}-${i}`}
                  role="option"
                  aria-selected={i === ativo}
                  className={i === ativo ? 'bg-realce-container/40' : undefined}
                >
                  <button
                    type="button"
                    tabIndex={-1}
                    className="estado flex w-full cursor-pointer items-center justify-between gap-2 px-2.5 py-2 text-left text-sm"
                    onMouseEnter={() => setAtivo(i)}
                    onClick={() => escolher(item)}
                  >
                    <span className="flex min-w-0 items-center gap-2">
                      <SlotItem id={item.id} />
                      <span className={item.kind ? undefined : 'text-suave line-through'}>
                        {item.nome}
                        {item.slots > 0 && <span className="text-suave"> [{item.slots}]</span>}
                      </span>
                    </span>
                    <span className="shrink-0 text-xs text-suave">
                      {item.kind ? rotuloCurto(item.kind) : 'não refina'}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}

          {focado && !mostrarLista && termo.trim().length >= 2 && (
            <p className="md-corpo-p absolute z-10 mt-1 w-full rounded-xl bg-superficie-alta px-3 py-2.5 text-suave shadow-e3">
              {carregando
                ? 'Carregando a base do Divine Pride…'
                : 'Nenhum item com esse nome. A base cobre armas, equipamentos e sombrios do LATAM — acessórios comuns e visuais ficam de fora porque não refinam.'}
            </p>
          )}
        </div>
      </Campo>

      {selecionado && (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <Pastilha tom="realce" titulo="Item escolhido na busca">
            <SlotItem id={idSelecionado} tamanho="mini" />
            {selecionado}
          </Pastilha>
          {idSelecionado !== null && (
            <Info titulo="De onde vem esta ficha">
              Categoria e slots vêm da ficha no{' '}
              <a
                className="text-realce hover:underline"
                href={fichaNoDivinePride(idSelecionado)}
                target="_blank"
                rel="noreferrer noopener"
              >
                Divine Pride (#{idSelecionado})
              </a>
              , que é datamine do cliente do jogo. Confira se bate com o item que você tem em mãos —
              a calculadora usa a ficha só para escolher a tabela de chances.
            </Info>
          )}
        </div>
      )}

      {recusado?.naoRefinavel && (
        <p className="md-corpo-p mt-2 rounded-lg bg-atencao-container p-2.5 text-no-atencao-container">
          <strong>{recusado.nome}</strong> não pode ser refinado.{' '}
          {motivoLegivel(recusado.naoRefinavel)}
        </p>
      )}
    </div>
  );
}
