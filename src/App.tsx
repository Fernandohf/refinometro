import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';

import { COTACAO, DEFAULT_PRICES, PRICE_FIELDS } from './data/defaultPrices';
import { atalhosDoItem, type Atalho } from './data/atalhos';
import { GRADE_ORDER, type Grade } from './data/grade';
import type { ItemKind } from './data/ores';
import { CATEGORIAS, ROTULO_GRAU } from './data/rotulos';
import { calcular, type Resultado as ResultadoPlano } from './engine/plan';
import type { PedidoSimulacao, RespostaSimulacao } from './engine/worker';
import { maxRefine, riscoPorAlvo, safeLimit } from './engine/refine';
import { suportaGrau } from './engine/grade';
import type { CalcInput, PriceTable } from './engine/types';

import { Resultado, type MargemKey } from './components/Resultado';
import { ESTOQUE_VAZIO, SimuladorDeEstoque, type EstoqueSalvo } from './components/Estoque';
import { BuscaItem } from './components/BuscaItem';
import { BotaoDoGuia, ComoUsar, useGuia } from './components/ComoUsar';
import { LinkDasPerguntas, Sobre } from './components/Sobre';
import { Apoie, LinkDeApoio } from './components/Apoie';
import { BotaoTema } from './components/BotaoTema';
import {
  BotaoDoPainel,
  Campo,
  Info,
  NumeroZeny,
  Painel,
  Select,
  TituloDeSecao,
  Toggle,
} from './components/ui';
import { SlotItem } from './components/ItemNoJogo';
import { rotuloDoAlvo, TrilhaRefino } from './components/TrilhaRefino';
import { dataBR, zeny } from './format';

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
  usarAtalhos: boolean;
  precos: PriceTable;
  margem: MargemKey;
}

/**
 * O que a tela mostra para quem chega sem mexer em nada.
 *
 * Não é um exemplo neutro de propósito: é um alvo que gente de verdade
 * persegue — uma arma nível 5 comum de mercado, com Grau, parando no +8 em vez
 * do +11 da regra de bolso. Categoria abstrata e alvo redondo faziam a primeira
 * tela parecer uma demonstração; um item nomeado, com arte e preço plausível,
 * já responde a pergunta de alguém.
 */
const INICIAL: Estado = {
  itemNome: 'Punho Consertado',
  itemId: 560030,
  itemSlots: 2,
  kind: 'w5',
  precoItem: 500_000,
  refinoAtual: 0,
  refinoAlvo: 8,
  grauAtual: 'none',
  grauAlvo: 'C',
  evento: false,
  usarBencaoFerreiro: true,
  usarMineriosEspeciais: true,
  perdaAceitavel: true,
  usarAtalhos: true,
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
    const estado = { ...INICIAL, ...salvo, precos: { ...DEFAULT_PRICES, ...salvo.precos } };
    // O padrão tem Grau, e quem voltar com uma categoria que não tem herdaria
    // um alvo impossível: o efeito que normaliza isso só roda depois do
    // primeiro render, e o erro apareceria por um quadro.
    return suportaGrau(estado.kind)
      ? estado
      : { ...estado, grauAtual: 'none' as Grade, grauAlvo: 'none' as Grade };
  } catch {
    return INICIAL;
  }
}

function carregarEstoque(): EstoqueSalvo {
  try {
    const bruto = localStorage.getItem(CHAVE_ESTOQUE);
    if (!bruto) return ESTOQUE_VAZIO;
    return { ...ESTOQUE_VAZIO, ...(JSON.parse(bruto) as Partial<EstoqueSalvo>) };
  } catch {
    return ESTOQUE_VAZIO;
  }
}

export default function App() {
  const [e, setE] = useState<Estado>(carregar);
  const set = <K extends keyof Estado>(k: K, v: Estado[K]) => setE((a) => ({ ...a, [k]: v }));
  const [estoque, setEstoque] = useState<EstoqueSalvo>(carregarEstoque);
  // Estado das perguntas frequentes: mora aqui porque o atalho do cabeçalho e a
  // seção lá embaixo são as duas pontas da página, e o atalho ABRE além de rolar.
  const [perguntas, setPerguntas] = useState(false);
  const guia = useGuia();

  useEffect(() => {
    localStorage.setItem(CHAVE_STORAGE, JSON.stringify(e));
  }, [e]);

  useEffect(() => {
    localStorage.setItem(CHAVE_ESTOQUE, JSON.stringify(estoque));
  }, [estoque]);

  const max = maxRefine(e.kind);
  const limite = safeLimit(e.kind);
  const temGrau = suportaGrau(e.kind);

  // Os cubos e martelos que servem para ESTE item. Independem da opção de usá-los:
  // os campos de preço aparecem mesmo desligados, para quem quer comparar.
  const atalhos = useMemo(() => atalhosDoItem(e.itemId, e.kind), [e.itemId, e.kind]);

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
        atalhos: e.usarAtalhos ? atalhos : [],
      }),
    [
      e.refinoAtual,
      e.kind,
      e.precos,
      e.evento,
      e.usarBencaoFerreiro,
      e.usarMineriosEspeciais,
      e.usarAtalhos,
      atalhos,
    ],
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
      itemId: adiado.itemId,
      usarAtalhos: adiado.usarAtalhos,
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
      {/*
        A linha de apoio vive DENTRO do <h1>, e não como um <p> ao lado dele.

        Visualmente é a mesma coisa — mesma medida, mesma cor, mesmo lugar. O
        que muda é o que a página declara ser: "Refinômetro" sozinho não diz
        nada a quem chegou de uma busca por "calculadora de refino do Ragnarok
        Latam", e o <h1> é a primeira coisa que o buscador lê depois do
        <title>. Um nome inventado como título de uma página que ninguém
        procura pelo nome é o jeito mais fácil de não ser encontrado.
      */}
      <header className="mb-8 flex flex-wrap items-start justify-between gap-x-4 gap-y-3">
        <h1 className="flex min-w-[13rem] flex-1 flex-wrap items-center gap-x-4 gap-y-1">
          <span className="md-titulo-g text-2xl">
            Refinô<span className="text-realce">metro</span>
          </span>
          <span className="md-corpo-m font-normal text-suave">
            Calculadora e simulador de custo de refino do Ragnarok Latam.
          </span>
        </h1>
        {/* FORA do <h1>, e é o ponto: dentro dele, o título da página passaria
            a ser "Refinômetro … Apoiar" para o buscador e para quem navega por
            cabeçalhos.

            Os botões viajam juntos, numa embalagem com `ml-auto`, e o <h1> tem
            largura mínima: enquanto todos couberem, título à esquerda e
            botões à direita; quando não couberem, os botões descem inteiros
            para a linha de baixo AINDA à direita, em vez de espremerem o
            título até quebrá-lo no meio da palavra. A primeira versão fazia o
            botão sozinho descer encostado à esquerda, e era metade do que
            havia de esquisito nele. */}
        {/* O `-mt-0.5` acerta a ótica do conjunto: 32px de botão contra os
            ~28px da linha do título deixavam o conjunto pendendo para baixo.
            Na embalagem, e não em cada botão, senão eles desalinham entre si. */}
        <div className="-mt-0.5 ml-auto flex shrink-0 items-center gap-1">
          <BotaoTema />
          <BotaoDoGuia aberto={guia.visivel} onAlternar={guia.alternar} />
          <LinkDasPerguntas onAbrir={() => setPerguntas(true)} />
          <LinkDeApoio />
        </div>
      </header>

      <ComoUsar visivel={guia.visivel} onFechar={guia.fechar} />

      <div className="grid gap-4 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)] lg:items-start">
        <div className="min-w-0 space-y-4">
          <Painel titulo="O item" passo={1}>
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
          <Painel titulo="Aonde você quer chegar" passo={2}>
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
                <p className="md-corpo-p text-suave">
                  Grau não se aplica: só Arma nv5 e Armadura nv2 têm.
                </p>
              )}
            </div>
          </Painel>

          <Painel titulo="Condições" passo={3}>
            <div className="divide-y divide-borda/60">
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
              <Toggle
                label="Posso usar cubos, martelos e pergaminhos"
                dica={dicaDosAtalhos(atalhos)}
                checked={e.usarAtalhos}
                onChange={(v) => set('usarAtalhos', v)}
              />
            </div>
          </Painel>

          <Precos
            precos={e.precos}
            onChange={(p) => set('precos', p)}
            precoItem={e.precoItem}
            onPrecoItem={(v) => set('precoItem', v)}
            atalhos={atalhos}
          />
        </div>

        <div className="min-w-0">
          {erro ? (
            // Um pedido impossível (alvo abaixo do atual, grau em item que não
            // tem) merece o mesmo lugar que os avisos: no topo, sozinho, sem
            // números velhos ao lado sugerindo que ainda valem.
            <Painel titulo="Não dá para calcular isso">
              <p className="md-corpo-m rounded-xl bg-perigo-container p-3.5 text-no-perigo-container">
                {erro}
              </p>
              <p className="md-corpo-m mt-2 text-suave">
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

          <Sobre aberto={perguntas} onAlternar={() => setPerguntas((a) => !a)} />
          <Apoie />
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
      // A comparação com o plano seguro custa uma campanha inteira a mais, então
      // é aqui que ela cabe: fora da thread da página, e uma vez só por entrada.
      opcoes: { tempoMs: TEMPO_PASSE_PRECISO_MS, comparar: true },
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
    <span className="md-corpo-p text-suave" aria-live="polite">
      {afinando ? (
        <span className="text-realce/80">afinando a simulação…</span>
      ) : sim ? (
        <>
          calculado em {sim.execucoes.toLocaleString('pt-BR')} simulações
          {sim.limitadoPorTempo ? ' (limitado pelo tempo)' : ''}
        </>
      ) : (
        'sem simulação: só o cálculo exato'
      )}
    </span>
  );
}

/**
 * O que a opção dos atalhos diz, conforme o item.
 *
 * Contar quantos servem é o ponto: sem item da busca sobram só os Pergaminhos, e
 * quem escolheu a categoria à mão precisa saber que o cubo do item dele só entra
 * se o item vier da busca.
 */
function dicaDosAtalhos(atalhos: Atalho[]): string {
  const doItem = atalhos.filter((a) => a.grupo !== 'pergaminho');
  const pergaminhos = atalhos.length - doItem.length;
  const partes = [
    doItem.length > 0
      ? `Para este item: ${doItem.map((a) => a.nome).join(', ')}.`
      : 'Nenhum cubo ou martelo serve para este item — ou ele não veio da busca, que é o que diz quais servem.',
    pergaminhos > 0 ? 'Valem também os Pergaminhos +5 a +19 do Mestre do Refino.' : '',
  ];
  return `${partes.filter(Boolean).join(' ')} O plano só usa um deles quando sai mais barato que refinar.`;
}

const GRUPO_DO_ITEM = 'Cubos e martelos deste item';

/**
 * Os campos de preço dos atalhos do item, em dois grupos.
 *
 * Os do item são poucos e decidem o plano, então aparecem também no painel
 * fechado. Os Pergaminhos são quinze por categoria e valem para qualquer arma ou
 * armadura — à vista, soterrariam o formulário.
 */
function gruposDeAtalho(atalhos: Atalho[]): { grupo: string; itens: { itemId: number; nome: string }[] }[] {
  const doItem: { itemId: number; nome: string }[] = atalhos.filter((a) => a.grupo !== 'pergaminho');
  const pergaminhos = atalhos.filter((a) => a.grupo === 'pergaminho');
  // O que os martelos cobram por uso e o formulário ainda não pergunta — a Bênção
  // do Ferreiro já tem campo; o Núcleo COR, não.
  const jaPerguntados = new Set(PRICE_FIELDS.flatMap((g) => g.itens.map((i) => i.itemId)));
  for (const a of atalhos) {
    for (const m of a.materiais) {
      if (!jaPerguntados.has(m.itemId) && !doItem.some((i) => i.itemId === m.itemId)) {
        doItem.push({ itemId: m.itemId, nome: m.nome });
      }
    }
  }
  return [
    { grupo: GRUPO_DO_ITEM, itens: doItem },
    { grupo: 'Pergaminhos de refino (ou a caixa que os entrega)', itens: pergaminhos },
  ].filter((g) => g.itens.length > 0);
}

function Precos({
  precos,
  onChange,
  precoItem,
  onPrecoItem,
  atalhos,
}: {
  precos: PriceTable;
  onChange: (p: PriceTable) => void;
  precoItem: number;
  onPrecoItem: (v: number) => void;
  atalhos: Atalho[];
}) {
  const [aberto, setAberto] = useState(false);
  const grupos = [...PRICE_FIELDS, ...gruposDeAtalho(atalhos)];
  const padrao = grupos.every(
    (g) => g.itens.every((i) => (precos[i.itemId] ?? 0) === (DEFAULT_PRICES[i.itemId] ?? 0)),
  );
  // Os cubos e martelos do item mexem no plano tanto quanto o Oridecon: entram
  // nos destaques do painel fechado.
  const doItem = gruposDeAtalho(atalhos).find((g) => g.grupo === GRUPO_DO_ITEM)?.itens ?? [];
  const destaques = [...DESTAQUES, ...doItem].filter(
    (d, i, todos) => todos.findIndex((x) => x.itemId === d.itemId) === i,
  );

  return (
    <Painel
      titulo="Preços do mercado"
      passo={4}
      info={
        <Info titulo="Preços do mercado">
          Os valores que já vêm preenchidos são um retrato do mercado do LATAM, não uma tabela do
          jogo — <strong className="text-texto">ajuste-os para o que você está vendo</strong>, senão
          o orçamento não vale nada. Deixe em <strong className="text-texto">0</strong> o que você
          prefere fabricar no NPC: a calculadora cota pela receita e escolhe sozinha a via mais
          barata entre comprar pronto e fabricar.
        </Info>
      }
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

      {/* Fechado, o painel mostra as duas cotações que mais mexem no orçamento —
          e nada mais. O parágrafo que pedia para conferi-las virou o aviso ao
          lado: ele é lido uma vez e depois só afastava os números. */}
      {!aberto && (
        <dl className="md-corpo-m mt-4 space-y-1">
          {destaques.map((d) => (
            <div key={d.itemId} className="flex items-center justify-between gap-3">
              <dt className="flex min-w-0 items-center gap-2">
                <SlotItem id={d.itemId} tamanho="mini" />
                {d.nome}
              </dt>
              <dd className="shrink-0 text-suave tabular-nums">{zeny(precos[d.itemId] ?? 0)}</dd>
            </div>
          ))}
        </dl>
      )}

      {/* A data fica à vista, e não só no balão: ela diz a quem chega que os
          números são uma cotação, e de quando — preço velho é a causa mais
          comum de um orçamento que não bate com o jogo. */}
      <p className="md-corpo-p mt-3 text-suave">
        Cotação do mercado do LATAM em {dataBR(COTACAO.geradoEm)}.
      </p>

      {aberto && (
        <div className="mt-5 space-y-5">
          {grupos.map((grupo) => (
            <div key={grupo.grupo}>
              <TituloDeSecao>{grupo.grupo}</TituloDeSecao>
              <div className="space-y-2">
                {grupo.itens.map((item) => (
                  <div key={item.itemId} className="flex items-center gap-2">
                    <SlotItem id={item.itemId} tamanho="mini" />
                    <span className="md-corpo-m min-w-0 flex-1">{item.nome}</span>
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

/**
 * As cotações que o painel fechado mostra.
 *
 * São duas por escolha, não por falta de espaço: o Oridecon é o minério de
 * quase todo trecho comum e a Bênção do Ferreiro é o item de proteção mais
 * caro do plano. Errar qualquer uma das duas erra o orçamento inteiro; errar as
 * outras muda alguns por cento.
 */
const DESTAQUES = [
  { itemId: 984, nome: 'Oridecon' },
  { itemId: 6635, nome: 'Bênção do Ferreiro' },
];

/**
 * O fecho da página: a licença de quem a fez, e nada mais.
 *
 * Era daqui que saíam as fontes e as ressalvas, atrás de um botão de abrir só
 * seu, logo abaixo das perguntas frequentes — dois blocos recolhidos em
 * sequência respondendo à mesma dúvida. A proveniência virou uma das perguntas
 * (ver `components/Fontes.tsx`) e o pedido de apoio virou bloco próprio (ver
 * `components/Apoie.tsx`); o que sobra aqui é a linha que todo rodapé tem.
 */
function Rodape() {
  return (
    <footer className="md-corpo-p mt-6 px-1 text-suave">
      Projeto de fã, de código aberto, sem vínculo com a Gravity ou a GNJOY Latam.{' '}
      <a
        className="text-realce hover:underline"
        href="https://github.com/Fernandohf/refinometro"
        target="_blank"
        rel="noreferrer noopener"
      >
        Código no GitHub
      </a>
      .
    </footer>
  );
}
