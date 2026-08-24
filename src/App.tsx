import { useDeferredValue, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

import { DEFAULT_PRICES, PRICE_FIELDS } from './data/defaultPrices';
import { GRADE_ORDER, type Grade } from './data/grade';
import type { ItemKind } from './data/ores';
import { CATEGORIAS, ROTULO_GRAU } from './data/rotulos';
import { calcular, type Resultado as ResultadoPlano } from './engine/plan';
import type { PedidoSimulacao, RespostaSimulacao } from './engine/worker';
import { maxRefine, riscoPorAlvo, safeLimit } from './engine/refine';
import { suportaGrau } from './engine/grade';
import type { CalcInput, PriceTable } from './engine/types';
import type { Estoque } from './engine/estoque';
import { Resultado, type MargemKey } from './components/Resultado';
import { ESTOQUE_VAZIO, SimuladorDeEstoque } from './components/Estoque';
import { BuscaItem } from './components/BuscaItem';
import { META } from './data/items';
import { BotaoDoPainel, Campo, NumeroZeny, Painel, Select, Toggle } from './components/ui';
import { rotuloDoAlvo, TrilhaRefino } from './components/TrilhaRefino';
import { zeny } from './format';

interface Estado {
  /** Nome do item escolhido na busca, só para exibição. */
  itemNome: string | null;
  /** ID no Divine Pride do item escolhido, para poder linkar a ficha de origem. */
  itemId: number | null;
  /** Slots do item, só para escrever o nome como o jogo escreve: `Adaga [2]`. */
  itemSlots: number;
  kind: ItemKind;
  precoItem: number;
  refinoAtual: number;
  refinoAlvo: number;
  grauAtual: Grade;
  grauAlvo: Grade;
  evento: boolean;
  usarBencaoFerreiro: boolean;
  usarMineriosEspeciais: boolean;
  perdaAceitavel: boolean;
  precos: PriceTable;
  margem: MargemKey;
}

const INICIAL: Estado = {
  itemNome: null,
  itemId: null,
  itemSlots: 0,
  kind: 'w4',
  precoItem: 30_000_000,
  refinoAtual: 0,
  refinoAlvo: 10,
  grauAtual: 'none',
  grauAlvo: 'none',
  evento: false,
  usarBencaoFerreiro: true,
  usarMineriosEspeciais: true,
  perdaAceitavel: true,
  precos: DEFAULT_PRICES,
  margem: 'p90',
};

const CHAVE_STORAGE = 'refinometro:v1';

/**
 * O estoque fica fora de `Estado` de propósito: ele não entra no cálculo, e
 * misturá-lo faria cada tecla digitada num campo de minério refazer o passe
 * rápido à toa. O veredito sai das campanhas já simuladas (ver
 * `engine/estoque.ts`), então basta guardá-lo à parte.
 */
const CHAVE_ESTOQUE = 'refinometro:estoque:v1';

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

function carregarEstoque(): Estoque {
  try {
    const bruto = localStorage.getItem(CHAVE_ESTOQUE);
    if (!bruto) return ESTOQUE_VAZIO;
    return { ...ESTOQUE_VAZIO, ...(JSON.parse(bruto) as Partial<Estoque>) };
  } catch {
    return ESTOQUE_VAZIO;
  }
}

export default function App() {
  const [e, setE] = useState<Estado>(carregar);
  const set = <K extends keyof Estado>(k: K, v: Estado[K]) => setE((a) => ({ ...a, [k]: v }));
  const [estoque, setEstoque] = useState<Estoque>(carregarEstoque);

  useEffect(() => {
    localStorage.setItem(CHAVE_STORAGE, JSON.stringify(e));
  }, [e]);

  useEffect(() => {
    localStorage.setItem(CHAVE_ESTOQUE, JSON.stringify(estoque));
  }, [estoque]);

  const max = maxRefine(e.kind);
  const limite = safeLimit(e.kind);
  const temGrau = suportaGrau(e.kind);

  /**
   * O que uma falha pode fazer no caminho até cada alvo da lista.
   *
   * Não entra no `useMemo` do plano porque não é resultado da conta: é a
   * legenda da própria lista, precisa estar pronta antes de qualquer escolha e
   * não pode esperar o valor adiado — a lista ficaria marcando o alvo anterior.
   */
  const riscos = useMemo(
    () =>
      riscoPorAlvo(e.refinoAtual, {
        kind: e.kind,
        precos: e.precos,
        evento: e.evento,
        usarBencaoFerreiro: e.usarBencaoFerreiro,
        usarMineriosEspeciais: e.usarMineriosEspeciais,
      }),
    [e.refinoAtual, e.kind, e.precos, e.evento, e.usarBencaoFerreiro, e.usarMineriosEspeciais],
  );
  const riscoDoAlvo = riscos[e.refinoAlvo] ?? 'nenhuma';

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
      perdaAceitavel: adiado.perdaAceitavel,
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
                idSelecionado={e.itemId}
                onSelecionar={(item) =>
                  // A busca só chama isto para itens refináveis, mas o tipo é
                  // opcional na base: sem o guarda, um item não refinável zeraria
                  // a categoria escolhida.
                  item.kind &&
                  setE((a) => ({
                    ...a,
                    kind: item.kind!,
                    itemNome: item.nome,
                    itemId: item.id,
                    itemSlots: item.slots,
                  }))
                }
              />

              <Campo
                label="Categoria"
                dica="Escolhida sozinha quando o item vem da busca. Ela define a tabela de chances."
              >
                <Select value={e.kind} onChange={(v) => set('kind', v as ItemKind)}>
                  {CATEGORIAS.map((c) => (
                    <option key={c.key} value={c.key}>
                      {c.rotulo}
                    </option>
                  ))}
                </Select>
              </Campo>
            </div>
          </Painel>

          {/* O alvo é a pergunta da calculadora, então tem painel próprio e vem
              antes de preço e condições: mudar o +10 para +12 muda a resposta em
              ordens de grandeza, mudar o preço de um minério muda alguns por
              cento. */}
          <Painel titulo="Aonde você quer chegar">
            <div className="space-y-4">
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
                    {/* A marca separa as duas coisas que "arriscado" mistura: o
                        alvo que só derruba o refino na falha e o que pode
                        destruir o item. Antes um ⚠ só cobria os dois, e o mais
                        caro dos dois erros — mirar um alvo achando que o item
                        sobrevive — era o que ele deixava passar. */}
                    {Array.from({ length: max + 1 }, (_, i) => (
                      <option key={i} value={i}>
                        {rotuloDoAlvo(i, riscos[i] ?? 'nenhuma')}
                      </option>
                    ))}
                  </Select>
                </Campo>
              </div>

              <TrilhaRefino
                atual={e.refinoAtual}
                alvo={e.refinoAlvo}
                max={max}
                limite={limite}
                risco={riscoDoAlvo}
              />

              {/* Grau só existe em duas categorias. Dois campos permanentemente
                  desligados ocupariam o lugar mais nobre do formulário para não
                  dizer nada; fora dessas categorias sobra uma linha de texto. */}
              {temGrau ? (
                <div className="grid grid-cols-2 gap-3">
                  <Campo label="Grau atual">
                    <Select value={e.grauAtual} onChange={(v) => set('grauAtual', v as Grade)}>
                      {GRADE_ORDER.map((g) => (
                        <option key={g} value={g}>
                          {ROTULO_GRAU[g]}
                        </option>
                      ))}
                    </Select>
                  </Campo>
                  <Campo label="Grau alvo" dica="Cada degrau de Grau zera o refino de volta ao +0.">
                    <Select value={e.grauAlvo} onChange={(v) => set('grauAlvo', v as Grade)}>
                      {graus.map((g) => (
                        <option key={g} value={g}>
                          {ROTULO_GRAU[g]}
                        </option>
                      ))}
                    </Select>
                  </Campo>
                </div>
              ) : (
                <p className="text-xs text-suave">
                  Grau não se aplica: só Arma nv5 e Armadura nv2 têm.
                </p>
              )}
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
              <Toggle
                label="Posso perder o item"
                dica="Desmarque para equipamento insubstituível — com carta, encanto ou de evento. O plano passa a usar só tentativas que não podem destruí-lo, e o preço do item deixa de ser o que se arrisca."
                checked={e.perdaAceitavel}
                onChange={(v) => set('perdaAceitavel', v)}
              />
            </div>
          </Painel>

          <Precos
            precos={e.precos}
            onChange={(p) => set('precos', p)}
            precoItem={e.precoItem}
            onPrecoItem={(v) => set('precoItem', v)}
          />
        </div>

        <div className="min-w-0">
          {erro ? (
            // Um pedido impossível (alvo abaixo do atual, grau em item que não
            // tem) merece o mesmo lugar que os avisos: no topo, sozinho, sem
            // números velhos ao lado sugerindo que ainda valem.
            <Painel titulo="Não dá para calcular isso">
              <p className="text-perigo">{erro}</p>
              <p className="mt-2 text-sm text-suave">
                Ajuste o alvo à esquerda e a conta volta sozinha.
              </p>
            </Painel>
          ) : exibido ? (
            <div className={calculando ? 'opacity-60 transition-opacity' : undefined}>
              <Resultado
                plano={exibido}
                itemNome={e.itemNome}
                itemId={e.itemId}
                itemSlots={e.itemSlots}
                margem={e.margem}
                onMargem={(m) => set('margem', m)}
                afinando={preciso.afinando}
                precisao={<Precisao afinando={preciso.afinando} plano={exibido} />}
                moduloEstoque={
                  <SimuladorDeEstoque
                    plano={exibido}
                    margem={e.margem}
                    estoque={estoque}
                    onChange={setEstoque}
                  />
                }
              />
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
    <span className="text-xs text-suave" aria-live="polite">
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
    </span>
  );
}

function Precos({
  precos,
  onChange,
  precoItem,
  onPrecoItem,
}: {
  precos: PriceTable;
  onChange: (p: PriceTable) => void;
  precoItem: number;
  onPrecoItem: (v: number) => void;
}) {
  const [aberto, setAberto] = useState(false);
  const padrao = PRICE_FIELDS.every(
    (g) => g.itens.every((i) => (precos[i.itemId] ?? 0) === (DEFAULT_PRICES[i.itemId] ?? 0)),
  );

  return (
    <Painel
      titulo="Preços do mercado"
      aside={
        <div className="flex gap-3">
          {!padrao && (
            <BotaoDoPainel discreto onClick={() => onChange(DEFAULT_PRICES)}>
              restaurar padrão
            </BotaoDoPainel>
          )}
          <BotaoDoPainel aberto={aberto} onClick={() => setAberto((a) => !a)}>
            {aberto ? 'esconder' : 'editar'}
          </BotaoDoPainel>
        </div>
      }
    >
      {/* O preço do item mora aqui, e não junto do refino, porque é da mesma
          natureza do resto deste painel: uma cotação de mercado que só você
          conhece. Fica de fora do trecho recolhível por ser o único que muda
          de item para item — e o que decide quanto custa cada quebra. */}
      <Campo
        label="Preço do item sem refino"
        dica="Quanto custa comprar outro igual, no +0. É o que você perde a cada quebra."
      >
        <NumeroZeny value={precoItem} onChange={onPrecoItem} />
      </Campo>

      {!aberto && (
        <p className="mt-4 text-sm leading-relaxed text-suave">
          Os preços dos minérios são um chute — ajuste para o que você está vendo no jogo, senão o
          orçamento não vale nada. Oridecon está em {zeny(precos[984] ?? 0)}, Bênção do Ferreiro em{' '}
          {zeny(precos[6635] ?? 0)}.
        </p>
      )}

      {aberto && (
        <div className="mt-5 space-y-5">
          <p className="text-xs leading-relaxed text-suave">
            Deixe em 0 o que você prefere fabricar no NPC: a calculadora cota pela receita e escolhe
            sozinha a via mais barata entre comprar pronto e fabricar.
          </p>

          {PRICE_FIELDS.map((grupo) => (
            <div key={grupo.grupo}>
              <h3 className="mb-2 text-xs font-semibold tracking-wide text-suave uppercase">{grupo.grupo}</h3>
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

/** Uma fonte da tabela de créditos: o que ela fornece e de onde. */
function Fonte({
  o_que,
  href,
  nome,
  children,
}: {
  o_que: string;
  /** Ausente quando a fonte não é um site — o próprio usuário, por exemplo. */
  href?: string;
  nome: string;
  children?: ReactNode;
}) {
  return (
    <div className="grid gap-x-3 gap-y-0.5 sm:grid-cols-[10rem_minmax(0,1fr)]">
      <dt className="font-semibold text-texto">{o_que}</dt>
      <dd>
        {href ? (
          <a
            className="text-realce hover:underline"
            href={href}
            target="_blank"
            rel="noreferrer noopener"
          >
            {nome}
          </a>
        ) : (
          <strong className="text-texto">{nome}</strong>
        )}
        {children}
      </dd>
    </div>
  );
}

function Rodape() {
  return (
    <footer className="mt-6 space-y-4 rounded-xl border border-borda bg-painel/40 p-4 text-xs leading-relaxed text-suave">
      <section>
        <h2 className="mb-2 text-xs font-semibold tracking-wide text-texto uppercase">De onde vêm os números</h2>
        <dl className="space-y-2">
          <Fonte
            o_que="Chances e minérios"
            href="https://browiki.org/wiki/Refinamento"
            nome="Browiki — Refinamento"
          >
            {' '}
            e{' '}
            <a className="text-realce hover:underline" href="https://browiki.org/wiki/Grau">
              Browiki — Grau
            </a>
            . Daí saem as chances de cada nível, os minérios, as penalidades de falha e o que o NPC
            cobra pelos materiais.
          </Fonte>

          <Fonte
            o_que="Taxa do refinador"
            href="https://irowiki.org/wiki/Refinement_System"
            nome="iROwiki"
          >
            {' '}
            — única fonte que publica a taxa por tentativa. Ainda não foi conferida in-game.
          </Fonte>

          <Fonte
            o_que="Itens da busca"
            href={META.fonte}
            nome={`Divine Pride — servidor ${META.servidor}`}
          >
            {' '}
            — nome, cartas e categoria de refino de{' '}
            <strong className="text-texto">{META.total.toLocaleString('pt-BR')}</strong> itens,
            varridos das páginas públicas em {META.geradoEm.split('-').reverse().join('/')}. A
            calculadora usa a ficha só para saber a categoria; o que ela afirma sobre um item pode
            ser conferido clicando no link da ficha.
          </Fonte>

          <Fonte o_que="Preços de mercado" nome="Você">
            {' '}
            — nada de cotação vem de fora. Os valores padrão são um chute inicial, e o resultado só
            vale o que valerem os preços que você colocar.
          </Fonte>
        </dl>
      </section>

      <p>
        <strong className="text-texto">O que a calculadora não considera:</strong> cartas nos itens.
        Também não considera encantamentos, bônus aleatórios, nem Pergaminhos, Cubos e Martelos de
        Refino — que pulam direto para um refino fixo em vez de tentar.
      </p>
      <p>
        Projeto de fã, sem vínculo com a Gravity, a Level Up! Games ou o Divine Pride. As chances são
        as do Browiki; se o seu servidor rodar valores diferentes, o resultado sai diferente.
      </p>
    </footer>
  );
}
