import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';

import { DEFAULT_PRICES, PRICE_FIELDS } from './data/defaultPrices';
import { GRADE_ORDER, type Grade } from './data/grade';
import type { ItemKind } from './data/ores';
import { calcular, type Resultado as ResultadoPlano } from './engine/plan';
import type { PedidoSimulacao, RespostaSimulacao } from './engine/worker';
import { maxRefine, safeLimit } from './engine/refine';
import { suportaGrau } from './engine/grade';
import type { CalcInput, PriceTable } from './engine/types';
import { MARGENS, Resultado, type MargemKey } from './components/Resultado';
import { BuscaItem } from './components/BuscaItem';
import { Campo, NumeroZeny, Painel, Select, Toggle } from './components/ui';
import { zeny } from './format';

const CATEGORIAS: { key: ItemKind; rotulo: string }[] = [
  { key: 'w1', rotulo: 'Arma nível 1' },
  { key: 'w2', rotulo: 'Arma nível 2' },
  { key: 'w3', rotulo: 'Arma nível 3' },
  { key: 'w4', rotulo: 'Arma nível 4' },
  { key: 'w5', rotulo: 'Arma nível 5' },
  { key: 'a1', rotulo: 'Armadura / Equipamento nível 1' },
  { key: 'a2', rotulo: 'Armadura / Equipamento nível 2' },
  { key: 'shadowW', rotulo: 'Arma Sombria' },
  { key: 'shadowA', rotulo: 'Equipamento Sombrio' },
];

const ROTULO_GRAU: Record<Grade, string> = {
  none: 'Sem grau',
  D: 'Grau D',
  C: 'Grau C',
  B: 'Grau B',
  A: 'Grau A',
};

interface Estado {
  /** Nome do item escolhido na busca, só para exibição. */
  itemNome: string | null;
  kind: ItemKind;
  precoItem: number;
  refinoAtual: number;
  refinoAlvo: number;
  grauAtual: Grade;
  grauAlvo: Grade;
  evento: boolean;
  usarBencaoFerreiro: boolean;
  usarMineriosEspeciais: boolean;
  precos: PriceTable;
  margem: MargemKey;
}

const INICIAL: Estado = {
  itemNome: null,
  kind: 'w4',
  precoItem: 30_000_000,
  refinoAtual: 0,
  refinoAlvo: 10,
  grauAtual: 'none',
  grauAlvo: 'none',
  evento: false,
  usarBencaoFerreiro: true,
  usarMineriosEspeciais: true,
  precos: DEFAULT_PRICES,
  margem: 'p90',
};

const CHAVE_STORAGE = 'refinometro:v1';

function carregar(): Estado {
  try {
    const bruto = localStorage.getItem(CHAVE_STORAGE);
    if (!bruto) return INICIAL;
    // Mescla com o inicial para não quebrar quando a calculadora ganhar campos novos.
    const salvo = JSON.parse(bruto) as Partial<Estado>;
    return { ...INICIAL, ...salvo, precos: { ...DEFAULT_PRICES, ...salvo.precos } };
  } catch {
    return INICIAL;
  }
}

export default function App() {
  const [e, setE] = useState<Estado>(carregar);
  const set = <K extends keyof Estado>(k: K, v: Estado[K]) => setE((a) => ({ ...a, [k]: v }));

  useEffect(() => {
    localStorage.setItem(CHAVE_STORAGE, JSON.stringify(e));
  }, [e]);

  const max = maxRefine(e.kind);
  const limite = safeLimit(e.kind);
  const temGrau = suportaGrau(e.kind);

  // Manter o estado coerente quando a categoria muda: Sombrio só vai até o +10,
  // e só Arma nv5 / Armadura nv2 têm Grau.
  useEffect(() => {
    setE((a) => ({
      ...a,
      refinoAtual: Math.min(a.refinoAtual, max),
      refinoAlvo: Math.min(a.refinoAlvo, max),
      grauAtual: temGrau ? a.grauAtual : 'none',
      grauAlvo: temGrau ? a.grauAlvo : 'none',
    }));
  }, [max, temGrau]);

  // Alvos extremos (+18, +20) levam ~1s para simular. Adiar o cálculo mantém a
  // digitação fluida: em vez de recalcular a cada tecla, recalcula uma vez
  // quando a pessoa para de digitar, exibindo o resultado anterior enquanto isso.
  const adiado = useDeferredValue(e);
  const calculando = adiado !== e;

  const { input, plano, erro } = useMemo(() => {
    const input: CalcInput = {
      kind: adiado.kind,
      precoItem: adiado.precoItem,
      refinoAtual: adiado.refinoAtual,
      refinoAlvo: adiado.refinoAlvo,
      grauAtual: adiado.grauAtual,
      grauAlvo: adiado.grauAlvo,
      evento: adiado.evento,
      precos: adiado.precos,
      usarBencaoFerreiro: adiado.usarBencaoFerreiro,
      usarMineriosEspeciais: adiado.usarMineriosEspeciais,
    };
    try {
      // Passe rápido: orçamento curto, síncrono, só para a tela nunca ficar
      // vazia. Quem dá a palavra final é o passe preciso, no Worker.
      return {
        input,
        plano: calcular(input, { tempoMs: TEMPO_PASSE_RAPIDO_MS }) as ResultadoPlano | null,
        erro: null as string | null,
      };
    } catch (err) {
      return { input, plano: null, erro: err instanceof Error ? err.message : String(err) };
    }
  }, [adiado]);

  const preciso = usePlanoPreciso(input, plano !== null);
  const exibido = preciso.plano ?? plano;

  const graus = GRADE_ORDER.filter((g) => GRADE_ORDER.indexOf(g) >= GRADE_ORDER.indexOf(e.grauAtual));

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      <header className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight">
          Refinô<span className="text-realce">metro</span>
        </h1>
        <p className="mt-1 text-suave">
          Quanto custa, de verdade, refinar uma arma ou equipamento no Ragnarok Latam.
        </p>
      </header>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)] lg:items-start">
        <div className="min-w-0 space-y-4">
          <Painel titulo="O item">
            <div className="space-y-4">
              <BuscaItem
                selecionado={e.itemNome}
                onSelecionar={(item) =>
                  // A busca só chama isto para itens refináveis, mas o tipo é
                  // opcional na base: sem o guarda, um item não refinável zeraria
                  // a categoria escolhida.
                  item.kind &&
                  setE((a) => ({ ...a, kind: item.kind!, itemNome: item.nome }))
                }
              />

              <Campo
                label="Categoria"
                dica={`Refina com 100% de sucesso até +${limite}. Máximo +${max}.`}
              >
                <Select value={e.kind} onChange={(v) => set('kind', v as ItemKind)}>
                  {CATEGORIAS.map((c) => (
                    <option key={c.key} value={c.key}>
                      {c.rotulo}
                    </option>
                  ))}
                </Select>
              </Campo>

              <Campo
                label="Preço do item sem refino"
                dica="Quanto custa comprar outro igual, no +0. É o que você perde a cada quebra."
              >
                <NumeroZeny value={e.precoItem} onChange={(v) => set('precoItem', v)} />
              </Campo>

              <div className="grid grid-cols-2 gap-3">
                <Campo label="Refino atual">
                  <Select
                    value={String(e.refinoAtual)}
                    onChange={(v) => set('refinoAtual', Number(v))}
                  >
                    {Array.from({ length: max + 1 }, (_, i) => (
                      <option key={i} value={i}>
                        +{i}
                      </option>
                    ))}
                  </Select>
                </Campo>
                <Campo label="Refino alvo">
                  <Select value={String(e.refinoAlvo)} onChange={(v) => set('refinoAlvo', Number(v))}>
                    {Array.from({ length: max + 1 }, (_, i) => (
                      <option key={i} value={i}>
                        +{i}
                      </option>
                    ))}
                  </Select>
                </Campo>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <Campo label="Grau atual">
                  <Select
                    value={e.grauAtual}
                    disabled={!temGrau}
                    onChange={(v) => set('grauAtual', v as Grade)}
                  >
                    {GRADE_ORDER.map((g) => (
                      <option key={g} value={g}>
                        {ROTULO_GRAU[g]}
                      </option>
                    ))}
                  </Select>
                </Campo>
                <Campo
                  label="Grau alvo"
                  dica={temGrau ? undefined : 'Só Arma nv5 e Armadura nv2 têm Grau.'}
                >
                  <Select
                    value={e.grauAlvo}
                    disabled={!temGrau}
                    onChange={(v) => set('grauAlvo', v as Grade)}
                  >
                    {graus.map((g) => (
                      <option key={g} value={g}>
                        {ROTULO_GRAU[g]}
                      </option>
                    ))}
                  </Select>
                </Campo>
              </div>
            </div>
          </Painel>

          <Painel titulo="Condições">
            <div className="space-y-2">
              <Toggle
                label="Evento de Refino ativo"
                dica="Chances maiores nos NPCs de forja. O evento de Grau anda junto."
                checked={e.evento}
                onChange={(v) => set('evento', v)}
              />
              <Toggle
                label="Posso usar Bênção do Ferreiro"
                dica="Segura o item e o refino na falha, do +7 ao +14."
                checked={e.usarBencaoFerreiro}
                onChange={(v) => set('usarBencaoFerreiro', v)}
              />
              <Toggle
                label="Posso usar minérios especiais"
                dica="Enriquecidos e Perfeitos, comprados com JoyCoins ou de outros jogadores."
                checked={e.usarMineriosEspeciais}
                onChange={(v) => set('usarMineriosEspeciais', v)}
              />
            </div>

            <div className="mt-4">
              <Campo label="Margem de segurança">
                <Select value={e.margem} onChange={(v) => set('margem', v as MargemKey)}>
                  {MARGENS.map((m) => (
                    <option key={m.key} value={m.key}>
                      {m.rotulo} — {m.explica}
                    </option>
                  ))}
                </Select>
              </Campo>
            </div>
          </Painel>

          <Precos precos={e.precos} onChange={(p) => set('precos', p)} />
        </div>

        <div className="min-w-0">
          {erro ? (
            <Painel>
              <p className="text-perigo">{erro}</p>
            </Painel>
          ) : exibido ? (
            <div className={calculando ? 'opacity-60 transition-opacity' : undefined}>
              <Precisao afinando={preciso.afinando} plano={exibido} />
              <Resultado plano={exibido} margem={e.margem} afinando={preciso.afinando} />
            </div>
          ) : null}

          <Rodape />
        </div>
      </div>
    </div>
  );
}

/** Tempo do passe síncrono: curto o bastante para a digitação não engasgar. */
const TEMPO_PASSE_RAPIDO_MS = 80;

/** Tempo do passe preciso, no Worker. É aqui que os percentis ficam finos. */
const TEMPO_PASSE_PRECISO_MS = 3_000;

/**
 * Refaz o cálculo num Worker, com orçamento de segundos, e devolve o resultado
 * quando ele chega.
 *
 * O Worker é recriado a cada entrada nova de propósito: `terminate()` é a única
 * forma de interromper uma simulação já rodando, e uma resposta de três segundos
 * atrás sobre preços que a pessoa acabou de mudar não vale o cuidado de
 * aproveitar.
 */
function usePlanoPreciso(
  input: CalcInput,
  calculavel: boolean,
): { plano: ResultadoPlano | null; afinando: boolean } {
  const [preciso, setPreciso] = useState<{ chave: string; plano: ResultadoPlano } | null>(null);
  const chave = JSON.stringify(input);
  const pedido = useRef(0);

  useEffect(() => {
    if (!calculavel || typeof Worker === 'undefined') return;

    const worker = new Worker(new URL('./engine/worker.ts', import.meta.url), { type: 'module' });
    const id = ++pedido.current;
    worker.onmessage = (ev: MessageEvent<RespostaSimulacao>) => {
      const r = ev.data;
      // Erro aqui não vira tela de erro: o passe rápido já mostrou algo válido.
      if (r.id === id && r.ok) setPreciso({ chave, plano: r.plano });
    };
    worker.postMessage({
      id,
      input,
      opcoes: { tempoMs: TEMPO_PASSE_PRECISO_MS },
    } satisfies PedidoSimulacao);

    return () => worker.terminate();
    // `chave` já resume `input` — comparar o objeto recriaria o Worker à toa.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chave, calculavel]);

  const atual = preciso?.chave === chave ? preciso.plano : null;
  return { plano: atual, afinando: calculavel && atual === null };
}

/** Diz de quantas campanhas simuladas vieram os percentis da tela. */
function Precisao({ afinando, plano }: { afinando: boolean; plano: ResultadoPlano }) {
  const sim = plano.simulacao;

  return (
    <p className="mb-2 text-right text-xs text-suave" aria-live="polite">
      {afinando ? (
        <span className="text-realce/80">afinando a simulação…</span>
      ) : sim ? (
        <>
          percentis de {sim.execucoes.toLocaleString('pt-BR')} campanhas simuladas
          {sim.limitadoPorTempo ? ' (limitado pelo tempo)' : ''}
        </>
      ) : (
        'sem simulação: só o cálculo exato'
      )}
    </p>
  );
}

function Precos({
  precos,
  onChange,
}: {
  precos: PriceTable;
  onChange: (p: PriceTable) => void;
}) {
  const [aberto, setAberto] = useState(false);

  return (
    <Painel
      titulo="Preços do mercado"
      aside={
        <button
          type="button"
          className="text-xs text-realce hover:underline"
          onClick={() => setAberto((a) => !a)}
        >
          {aberto ? 'esconder' : 'editar'}
        </button>
      }
    >
      {!aberto && (
        <p className="text-sm leading-relaxed text-suave">
          Os preços de partida são um chute — ajuste para o que você está vendo no jogo, senão o
          orçamento não vale nada. Oridecon está em {zeny(precos[984] ?? 0)}, Bênção do Ferreiro em{' '}
          {zeny(precos[6635] ?? 0)}.
        </p>
      )}

      {aberto && (
        <div className="space-y-5">
          <p className="text-xs leading-relaxed text-suave">
            Deixe em 0 o que você prefere fabricar no NPC: a calculadora cota pela receita e escolhe
            sozinha a via mais barata entre comprar pronto e fabricar.
          </p>

          {PRICE_FIELDS.map((grupo) => (
            <div key={grupo.grupo}>
              <h3 className="mb-2 text-xs font-semibold tracking-wide text-suave uppercase">
                {grupo.grupo}
              </h3>
              <div className="space-y-2">
                {grupo.itens.map((item) => (
                  <div key={item.itemId} className="flex items-center gap-2">
                    <span className="flex-1 text-sm">{item.nome}</span>
                    <div className="w-36">
                      <NumeroZeny
                        value={precos[item.itemId] ?? 0}
                        onChange={(v) => onChange({ ...precos, [item.itemId]: v })}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </Painel>
  );
}

function Rodape() {
  return (
    <footer className="mt-6 space-y-3 rounded-xl border border-borda bg-painel/40 p-4 text-xs leading-relaxed text-suave">
      <p>
        Chances, minérios, penalidades e custos vêm do{' '}
        <a className="text-realce hover:underline" href="https://browiki.org/wiki/Refinamento">
          Browiki — Refinamento
        </a>{' '}
        e{' '}
        <a className="text-realce hover:underline" href="https://browiki.org/wiki/Grau">
          Browiki — Grau
        </a>
        . A taxa que o refinador cobra por tentativa vem do{' '}
        <a className="text-realce hover:underline" href="https://irowiki.org/wiki/Refinement_System">
          iROwiki
        </a>
        , única fonte que a publica, e ainda não foi conferida in-game.
      </p>
      <p>
        <strong className="text-texto">O que a calculadora não considera:</strong> cartas nos itens.
        Também não considera encantamentos, bônus aleatórios, nem Pergaminhos, Cubos e Martelos de
        Refino — que pulam direto para um refino fixo em vez de tentar.
      </p>
      <p>
        Os preços de mercado são informados por você. As chances são as do Browiki; se o seu servidor
        rodar valores diferentes, o resultado sai diferente.
      </p>
    </footer>
  );
}
