import { useMemo, useState } from 'react';

import { buscarItens, ITENS, motivoLegivel, TEM_BASE_DE_ITENS, type ItemDb } from '../data/items';
import { Campo } from './ui';

const ROTULO_KIND: Record<string, string> = {
  w1: 'Arma nv1',
  w2: 'Arma nv2',
  w3: 'Arma nv3',
  w4: 'Arma nv4',
  w5: 'Arma nv5',
  a1: 'Equip. nv1',
  a2: 'Equip. nv2',
  shadowW: 'Arma Sombria',
  shadowA: 'Equip. Sombrio',
};

/**
 * Busca o item na base montada a partir do Divine Pride, só para descobrir a
 * categoria dele — que é a única coisa que o cálculo precisa saber sobre o
 * equipamento. O preço continua sendo informado à mão, porque o Divine Pride não
 * guarda cotação.
 */
export function BuscaItem({
  selecionado,
  onSelecionar,
}: {
  selecionado: string | null;
  onSelecionar: (item: ItemDb) => void;
}) {
  const [termo, setTermo] = useState('');
  const [focado, setFocado] = useState(false);
  const [recusado, setRecusado] = useState<ItemDb | null>(null);

  const resultados = useMemo(() => buscarItens(termo), [termo]);
  const mostrarLista = focado && resultados.length > 0;

  if (!TEM_BASE_DE_ITENS) {
    return (
      <div className="rounded-lg border border-borda bg-fundo/40 p-3 text-xs leading-relaxed text-suave">
        <p>A base de itens ainda está vazia, então escolha a categoria à mão.</p>
        <code className="mt-1.5 block break-all text-realce">npm run item -- 1867</code>
      </div>
    );
  }

  return (
    <div>
      <Campo
        label="Buscar item"
        dica={selecionado ? `Selecionado: ${selecionado}` : `${ITENS.length} itens na base.`}
      >
        <div className="relative">
          <input
            type="text"
            className="w-full rounded-lg border border-borda bg-fundo px-3 py-2 text-texto outline-none focus:border-realce focus:ring-1 focus:ring-realce"
            placeholder="Ex.: Luva de Segurança"
            value={termo}
            onChange={(ev) => setTermo(ev.target.value)}
            onFocus={() => setFocado(true)}
            // O blur é adiado para o clique no resultado chegar antes da lista sumir.
            onBlur={() => setTimeout(() => setFocado(false), 150)}
          />

          {mostrarLista && (
            <ul className="absolute z-10 mt-1 max-h-64 w-full overflow-y-auto rounded-lg border border-borda bg-painel shadow-lg">
              {resultados.map((item) => (
                <li key={item.id}>
                  <button
                    type="button"
                    className="flex w-full items-baseline justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-fundo"
                    onClick={() => {
                      // Itens não refináveis continuam aparecendo na busca: é mais
                      // útil dizer POR QUE não dá do que fingir que não existem.
                      if (item.kind) {
                        onSelecionar(item);
                        setRecusado(null);
                      } else {
                        setRecusado(item);
                      }
                      setTermo('');
                      setFocado(false);
                    }}
                  >
                    <span className={item.kind ? undefined : 'text-suave line-through'}>
                      {item.nome}
                      {item.slots > 0 && <span className="text-suave"> [{item.slots}]</span>}
                    </span>
                    <span className="shrink-0 text-xs text-suave">
                      {item.kind ? ROTULO_KIND[item.kind] : 'não refina'}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </Campo>

      {recusado?.naoRefinavel && (
        <p className="mt-2 rounded-lg border border-atencao/40 bg-atencao/10 p-2.5 text-xs leading-relaxed text-atencao">
          <strong>{recusado.nome}</strong> não pode ser refinado.{' '}
          {motivoLegivel(recusado.naoRefinavel)}
        </p>
      )}
    </div>
  );
}
