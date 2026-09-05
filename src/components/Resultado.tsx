import { useState, type ReactNode } from 'react';

import { nomeDoItem } from '../data/nomes';
import { arvoreDeCompras, sourcingOf, type ItemDaLista } from '../engine/pricing';
import { fluxoDeCusto, quantidadesNaMargem } from '../engine/fluxoDeCusto';
import type { Aviso, PlanoDeFase, Resultado as ResultadoPlano } from '../engine/plan';
import type { Percentis } from '../engine/types';
import type { Grade } from '../data/grade';
import { ROTULO_GRAU, rotuloCurto } from '../data/rotulos';
import { CartaoItem, SlotItem } from './ItemNoJogo';
import { Percurso, TabelaDeEstados } from './Cadeia';
import { CurvaDeCusto } from './CurvaDeCusto';
import { ResumoDoFluxo, SankeyCusto } from './SankeyCusto';
import { porcento, quantidade, zeny, zenyExato } from '../format';
import {
  Abas,
  BotaoDoPainel,
  Divisor,
  Info,
  Painel,
  Pastilha,
  Segmentado,
  TituloDeSecao,
} from './ui';

export type MargemKey = keyof Percentis;

/**
 * As abas são os três níveis de prioridade da página, não uma divisão nova: o
 * que se FAZ, o que se COMPRA, e se dá com o que já se tem.
 */
type AbaKey = 'plano' | 'compras' | 'estoque';

/**
 * As margens oferecidas. `chance` é a mesma coisa que o percentil, em número:
 * o gráfico da distribuição precisa dela para dizer que fatia das campanhas a
 * área acesa cobre, e ler isso de volta da chave ('p90' → 0,9) seria um parse
 * inútil de um dado que já se sabe aqui.
 */
export const MARGENS: { key: MargemKey; rotulo: string; chance: number; explica: string }[] = [
  { key: 'p50', rotulo: 'Mediana', chance: 0.5, explica: 'metade das tentativas custa menos que isso' },
  { key: 'p75', rotulo: '75%', chance: 0.75, explica: 'cobre 3 de cada 4 tentativas' },
  { key: 'p90', rotulo: '90%', chance: 0.9, explica: 'cobre 9 de cada 10 tentativas' },
  { key: 'p95', rotulo: '95%', chance: 0.95, explica: 'cobre 19 de cada 20 tentativas' },
  { key: 'p99', rotulo: '99%', chance: 0.99, explica: 'só 1 em 100 estoura este orçamento' },
];

export function Resultado({
  plano,
  itemNome,
  itemId = null,
  itemSlots = 0,
  margem,
  onMargem,
  afinando = false,
  precisao,
  moduloEstoque,
}: {
  plano: ResultadoPlano;
  /** Nome do item escolhido na busca, quando houve um. */
  itemNome?: string | null;
  /** ID no Divine Pride, quando houve busca — é dele que vem a arte. */
  itemId?: number | null;
  itemSlots?: number;
  margem: MargemKey;
  onMargem: (m: MargemKey) => void;
  /** O passe preciso ainda está rodando: este resultado é o do passe rápido. */
  afinando?: boolean;
  /** De quantas campanhas simuladas vieram os percentis — rodapé do painel. */
  precisao?: ReactNode;
  /**
   * Simulador de estoque: a terceira aba. "Dá com o que eu tenho?" é a pergunta
   * que vem depois de "o que comprar", e ela lê as mesmas quantidades. Ausente,
   * a aba não existe.
   */
  moduloEstoque?: ReactNode;
}) {
  const sim = plano.simulacao;
  const margemInfo = MARGENS.find((m) => m.key === margem)!;
  // Um aviso que muda a decisão (o item quebra, o alvo não fecha, um preço está
  // zerado) precisa ser lido ANTES do número que ele desmente. O que é só
  // contexto pode esperar o fim da página.
  const criticos = plano.avisos.filter((a) => a.nivel !== 'info');
  const informativos = plano.avisos.filter((a) => a.nivel === 'info');
  // O mesmo fluxo que a lista de compras soma: os dois painéis são leituras da
  // mesma `listaDeCompras`, no mesmo percentil (ver `fluxoDeCusto`).
  const fluxo = fluxoDeCusto(plano, margem);
  const temCompras = Object.keys(plano.recursos.itens).length > 0;

  // Fora das abas fica o que governa as TRÊS: os avisos, o item, o orçamento e
  // a margem. A margem, em especial, muda número na lista de compras e no
  // simulador de estoque — deixá-la dentro da primeira aba seria pôr o controle
  // numa tela e o efeito em outra.
  const [aba, setAba] = useState<AbaKey>('plano');

  const abas: { key: AbaKey; rotulo: string; conteudo: ReactNode }[] = [
    {
      key: 'plano',
      rotulo: 'O plano',
      conteudo: (
        <Estrategia
          plano={plano}
          informativos={informativos}
          itemId={itemId}
          itemNome={itemNome}
          itemSlots={itemSlots}
        />
      ),
    },
  ];

  if (fluxo.total > 0 || temCompras) {
    abas.push({
      key: 'compras',
      rotulo: 'O que comprar',
      conteudo: (
        <div className="space-y-4">
          {/* O diagrama fica colado na lista porque os dois totais são o MESMO
              número: ele é a lista relida por natureza do gasto. Encostá-lo no
              orçamento, que é o percentil do total, poria dois totais
              diferentes um embaixo do outro — e é essa divergência que a página
              já gasta dois textos explicando. */}
          {fluxo.total > 0 && (
            <Painel
              titulo="Para onde vai o zeny"
              info={
                <Info titulo="Para onde vai o zeny">
                  As mesmas quantidades da lista de compras logo abaixo, agrupadas pela natureza do
                  gasto em vez de pelo nome do material. É o desenho que mostra que a maior parte de
                  uma campanha cara não é minério — é proteção contra a quebra e reposição do
                  equipamento destruído.
                </Info>
              }
            >
              <SankeyCusto fluxo={fluxo} />
              <ResumoDoFluxo fluxo={fluxo} />
            </Painel>
          )}

          {temCompras && <PainelDeCompras plano={plano} margem={margem} />}
        </div>
      ),
    });
  }

  // O rótulo é curto, e não a pergunta inteira: ela já é o título do painel
  // logo abaixo, e a aba repetindo-a punha a mesma frase duas vezes seguidas.
  if (moduloEstoque) {
    abas.push({ key: 'estoque', rotulo: 'O que eu tenho', conteudo: moduloEstoque });
  }

  // Um alvo já alcançado não tem o que comprar, e o simulador de estoque é
  // opcional: a aba escolhida pode deixar de existir entre um cálculo e outro.
  const ativa = abas.some((a) => a.key === aba) ? aba : abas[0]!.key;

  return (
    <div className="space-y-4">
      {criticos.length > 0 && (
        <ul className="space-y-2">
          {criticos.map((a, i) => (
            <AvisoLinha key={i} aviso={a} />
          ))}
        </ul>
      )}

      <Painel
        titulo="Quanto vai custar"
        aside={
          sim ? (
            <Segmentado
              rotulo="Margem de segurança"
              value={margem}
              onChange={onMargem}
              opcoes={MARGENS.map((m) => ({ key: m.key, rotulo: m.rotulo, dica: m.explica }))}
            />
          ) : undefined
        }
      >
        <Trajetoria plano={plano} itemNome={itemNome} itemId={itemId} itemSlots={itemSlots} />

        {/* O orçamento é a resposta; média e valor justo são apoio. Antes os
            três vinham do mesmo tamanho, o que punha a média — que o próprio
            texto desaconselha usar — no mesmo peso da recomendação. */}
        <div className="mt-4">
          <div className="md-rotulo-p flex items-center gap-1 text-suave">
            Orçamento recomendado
            <Info titulo="Orçamento recomendado">
              O custo total da campanha no percentil que você escolheu ao lado. Numa margem de 90%,
              nove de cada dez campanhas simuladas fecharam gastando isto ou menos — é quanto
              separar para começar sem depender de sorte.
            </Info>
          </div>
          {sim ? (
            <>
              <div
                className="md-display mt-1 text-realce tabular-nums"
                title={zenyExato(sim.custo[margem])}
              >
                {zeny(sim.custo[margem])}
              </div>
              <div className="md-corpo-m mt-1 text-suave">
                Margem de {margemInfo.rotulo.toLowerCase()} — {margemInfo.explica}.
              </div>
            </>
          ) : (
            <>
              {/* Um alvo caro não cabe no passe rápido, mas pode caber no
                  preciso. Chamá-lo de inalcançável antes da hora seria dar um
                  veredito que a simulação longa ainda pode desmentir. */}
              <div className={'md-display mt-1 ' + (afinando ? 'text-suave' : 'text-perigo')}>
                {afinando ? 'calculando…' : 'fora de alcance'}
              </div>
              <div className="md-corpo-m mt-1 text-suave">
                Este alvo pede ~{Math.round(plano.tentativasEsperadas).toLocaleString('pt-BR')}{' '}
                tentativas de refino
                {afinando
                  ? '. A simulação longa está tentando; pode ser que nem ela alcance.'
                  : '. Não há margem que faça sentido calcular.'}
              </div>
            </>
          )}
        </div>

        <SemRisco plano={plano} margem={margem} />

        {sim && (
          <Distribuicao
            custo={sim.custo}
            amostras={sim.amostras.custo}
            media={plano.custoEsperado}
            margem={margem}
            onMargem={onMargem}
          />
        )}

        <div className="mt-5 grid gap-4 border-t border-borda pt-4 sm:grid-cols-3">
          <Copias plano={plano} margem={margem} />
          <Secundario
            rotulo="Custo médio"
            valor={zeny(plano.custoEsperado)}
            titulo={zenyExato(plano.custoEsperado)}
            nota="A média é puxada pelos azarados. Planejar por ela dá errado em quase metade das vezes."
          />
          <Secundario
            rotulo="Valor do item pronto"
            valor={zeny(plano.valorJusto)}
            titulo={zenyExato(plano.valorJusto)}
            nota={`Preço no +0 (${zeny(plano.input.precoItem)}) mais o custo médio do caminho. Se alguém vender o item já refinado por menos que isso, comprar pronto sai mais barato — e sem o risco.`}
          />
        </div>

        {precisao && <div className="mt-4 text-right">{precisao}</div>}
      </Painel>

      {/* As abas vêm DEPOIS do orçamento, e não no lugar dele: a resposta da
          página é uma só, e as três abas são os três jeitos de continuar a
          pergunta — como eu faço, o que eu compro, dá com o que eu tenho. */}
      <Abas rotulo="O que ver do plano" value={ativa} onChange={setAba} abas={abas} />
    </div>
  );
}

/**
 * O plano que não pode destruir o item, posto ao lado deste.
 *
 * O motor minimiza a MÉDIA, e o número grande da tela é um PERCENTIL. Aceitar a
 * quebra sempre baixa a média — o otimizador ganha ações, nunca perde —, mas o
 * que ele compra com isso é cauda: campanhas em que o item explode no +10 e a
 * escalada recomeça do zero. Num percentil alto essa cauda pode custar mais do
 * que a média economizou, e aí o plano seguro é o mais barato dos dois JUSTAMENTE
 * na margem que a página recomenda usar.
 *
 * Sem este bloco, marcar "posso perder o item" — que só deveria abrir caminhos —
 * conseguia PIORAR o orçamento exibido, sem nenhum sinal de que o plano melhor
 * estava a um clique de distância. Ver `AlternativaSegura`, no motor.
 */
function SemRisco({ plano, margem }: { plano: ResultadoPlano; margem: MargemKey }) {
  const alt = plano.alternativa;
  if (!alt) return null;

  const margemInfo = MARGENS.find((m) => m.key === margem)!;
  const extraMedia = alt.custoEsperado - plano.custoEsperado;

  const aqui = plano.simulacao?.custo[margem] ?? null;
  const la = alt.custo?.[margem] ?? null;

  // Dois percentis saídos de amostragens diferentes não empatam nem quando os
  // planos são igualmente bons. Abaixo de 1% a diferença é ruído da simulação, e
  // anunciá-la como economia faria o texto trocar de lado a cada recálculo.
  const maisBarato = aqui !== null && la !== null && la < aqui * 0.99;

  const linhas: { rotulo: string; aqui: string; la: string }[] = [];
  if (aqui !== null && la !== null) {
    linhas.push({ rotulo: `Orçamento (${margemInfo.rotulo.toLowerCase()})`, aqui: zeny(aqui), la: zeny(la) });
  }
  linhas.push({
    rotulo: 'Custo médio',
    aqui: zeny(plano.custoEsperado),
    la: zeny(alt.custoEsperado),
  });
  linhas.push({
    rotulo: 'Itens destruídos',
    aqui: quantidade(plano.itensQuebrados),
    la: quantidade(alt.itensQuebrados),
  });

  return (
    <div
      className={
        'mt-4 rounded-xl p-3.5 ' +
        (maisBarato ? 'bg-atencao-container text-no-atencao-container' : 'bg-superficie-baixa')
      }
    >
      <div className="md-rotulo-p flex items-center gap-1">
        {maisBarato
          ? 'Nesta margem, o plano sem risco de quebra sai mais barato'
          : 'Dá para fazer isto sem nenhum risco de quebrar o item'}
        <Info titulo="Plano sem risco de quebra">
          O mesmo alvo resolvido sem nenhuma tentativa que possa destruir o equipamento. A
          calculadora escolhe a estratégia de menor custo MÉDIO, e aceitar a quebra sempre baixa a
          média — mas paga por ela com campanhas desastrosas, que é o que os percentis altos medem.
          Quando o orçamento do plano seguro é o menor dos dois, é ele que responde à pergunta que
          a página faz.
        </Info>
      </div>

      <dl className="mt-2.5 space-y-1">
        {linhas.map((l) => (
          <div key={l.rotulo} className="md-corpo-m flex items-baseline gap-2">
            <dt className="min-w-0 flex-1 truncate opacity-80">{l.rotulo}</dt>
            <dd className="tabular-nums opacity-80">{l.aqui}</dd>
            <dd aria-hidden className="opacity-50">
              →
            </dd>
            <dd className="tabular-nums font-semibold">{l.la}</dd>
          </div>
        ))}
      </dl>

      <p className="md-corpo-m mt-2.5">
        {maisBarato ? (
          <>
            Aceitar a quebra economiza {zeny(extraMedia)} na média, mas engorda a cauda: nas
            campanhas ruins o item explode e a escalada recomeça do +0. Neste orçamento, o plano
            seguro é o mais barato dos dois.
          </>
        ) : (
          <>
            A média sobe {zeny(extraMedia)}, e em troca nenhuma tentativa pode destruir o
            equipamento.
          </>
        )}{' '}
        Desmarque <strong>“posso perder o item”</strong> para ver esse plano por inteiro.
      </p>
    </div>
  );
}

/**
 * A sequência que a calculadora escolheu, fase por fase.
 *
 * É a primeira aba porque é o que se FAZ: a lista de compras é derivada dela, e
 * o simulador de estoque é conferência das duas. A ordem já foi outra — a lista
 * vinha antes da estratégia que a gera —, e a leitura só fazia sentido para
 * quem já sabia o que ia encontrar.
 */
function Estrategia({
  plano,
  informativos,
  itemId,
  itemNome,
  itemSlots,
}: {
  plano: ResultadoPlano;
  /** Os avisos que só contextualizam: viram as notas do balão do painel. */
  informativos: Aviso[];
  itemId?: number | null;
  itemNome?: string | null;
  itemSlots?: number;
}) {
  return (
    <Painel
      titulo="Melhor estratégia"
      info={
        <Info
          titulo="Melhor estratégia"
          largura={informativos.length > 0 ? 'larga' : 'normal'}
          contagem={informativos.length || undefined}
        >
          A sequência que a calculadora escolheu: em cada faixa de refino, qual minério usar e
          quantas Bênçãos somar. Não é a de maior chance, é a de menor custo esperado até o alvo —
          às vezes vale pagar caro num degrau para não cair três níveis nele.
          {informativos.length > 0 && (
            <>
              <Divisor />
              <span className="md-titulo-m mb-1.5 block text-texto">Notas sobre este plano</span>
              <span className="block space-y-1.5">
                {informativos.map((a, i) => (
                  <span key={i} className="flex gap-2">
                    <span aria-hidden className="text-realce">
                      ·
                    </span>
                    <span>{a.texto}</span>
                  </span>
                ))}
              </span>
            </>
          )}
        </Info>
      }
    >
      <ol className="space-y-3">
        {plano.fases.map((fase, i) => (
          // Uma campanha de Grau repete o mesmo preparo de refino a cada
          // degrau. Detalhar a sequência idêntica quatro vezes só afoga o
          // resto do plano, então da segunda vez em diante mostramos só o
          // cabeçalho e o custo.
          <Fase
            key={i}
            fase={fase}
            repetida={ehRepeticao(plano.fases, i)}
            itemId={itemId ?? null}
            itemNome={itemNome ?? rotuloCurto(plano.input.kind)}
            grau={plano.input.grauAlvo}
            slots={itemSlots ?? 0}
          />
        ))}
      </ol>
      {plano.fases.length === 0 && (
        <p className="text-sm text-suave">Nada a fazer: o item já está no alvo.</p>
      )}
    </Painel>
  );
}

/**
 * O que está sendo calculado, antes de qualquer número.
 *
 * O item aparece como vai FICAR — no refino e no grau alvo, com a arte e o nome
 * no formato do jogo. É o que o orçamento logo abaixo está comprando, e ver
 * `+10 [B] Adaga [2]` pronto é o que dá sentido ao número.
 */
function Trajetoria({
  plano,
  itemNome,
  itemId,
  itemSlots,
}: {
  plano: ResultadoPlano;
  itemNome?: string | null;
  itemId?: number | null;
  itemSlots?: number;
}) {
  const i = plano.input;
  const mudaGrau = i.grauAlvo !== i.grauAtual;

  return (
    <div className="space-y-2">
      <CartaoItem
        itemId={itemId ?? null}
        itemNome={itemNome ?? null}
        kind={i.kind}
        refino={i.refinoAlvo}
        grau={i.grauAlvo}
        slots={itemSlots ?? 0}
        preco={i.precoItem}
      />
      <p className="text-sm leading-relaxed text-suave">
        Saindo do <strong className="text-texto tabular-nums">+{i.refinoAtual}</strong>
        {mudaGrau && (
          <>
            {' '}
            e do <strong className="text-texto">{ROTULO_GRAU[i.grauAtual].toLowerCase()}</strong>
          </>
        )}
        .
      </p>
    </div>
  );
}

/**
 * Número de apoio: menor que o orçamento, com a ressalva a um clique.
 *
 * A ressalva de cada um destes números é longa e vale para sempre — a média
 * engana, o valor justo compara com comprar pronto. Impressas embaixo dos três,
 * elas ocupavam mais linhas que os números que explicavam.
 */
function Secundario({
  rotulo,
  valor,
  titulo,
  nota,
}: {
  rotulo: string;
  valor: string;
  titulo?: string;
  nota: ReactNode;
}) {
  return (
    <div>
      <div className="md-rotulo-p flex items-center gap-1 text-suave">
        {rotulo}
        <Info titulo={rotulo}>{nota}</Info>
      </div>
      <div className="md-titulo-g mt-1 tabular-nums" title={titulo}>
        {valor}
      </div>
    </div>
  );
}

/**
 * Cópias do equipamento a separar antes de começar.
 *
 * Orçamento em zeny não é o bastante: numa faixa de quebra o item vira consumo,
 * e quem só comprou um trava no meio da campanha esperando repor. O número da
 * margem é o que responde "quantos preciso ter".
 *
 * O refino de cada cópia é dito por extenso porque as duas pontas não estão no
 * mesmo lugar: a sua está no refino inicial, e toda reposição entra no +0 — é o
 * preço que o formulário pede, e o caminho até o alvo é refeito do zero.
 */
function Copias({ plano, margem }: { plano: ResultadoPlano; margem: MargemKey }) {
  const naMargem = plano.simulacao ? plano.simulacao.quebras[margem] + 1 : null;
  const reposicoes = naMargem === null ? plano.itensQuebrados : naMargem - 1;
  const inicial = plano.input.refinoAtual;

  return (
    <div>
      <div className="md-rotulo-p flex items-center gap-1 text-suave">
        Cópias do item
        <Info titulo="Cópias do item">
          Orçamento em zeny não é o bastante: numa faixa de quebra o equipamento vira consumo, e
          quem só comprou um trava no meio da campanha esperando repor. Toda reposição entra no{' '}
          <strong className="text-texto">+0</strong> — é o preço que o formulário pede — e o caminho
          até o alvo é refeito desde o zero: quebrar não devolve o refino que já estava pago.
        </Info>
      </div>
      <div className="md-titulo-g mt-1 tabular-nums">
        {naMargem === null ? quantidade(plano.copiasItem) : quantidade(naMargem)}
      </div>
      <div className="md-corpo-p mt-1 text-suave">
        {reposicoes <= 0 ? (
          <>Nessa margem o item não quebra.</>
        ) : (
          <>
            A sua, no <strong className="text-texto">+{inicial}</strong>, mais{' '}
            {quantidade(reposicoes)} de reposição
            {naMargem === null ? ' (média)' : ''}.
          </>
        )}
      </div>
    </div>
  );
}

/**
 * Onde a margem escolhida cai dentro da distribuição do custo.
 *
 * Antes isto era uma barra: a fração preenchida dizia o percentil, e o traço
 * claro, a média. Dizia onde, mas não dizia de quê — a forma da distribuição,
 * que é o que explica o preço de cada margem, ficava de fora. O desenho a
 * mostra inteira (ver `CurvaDeCusto`), com o ponto pousado na margem atual.
 *
 * A legenda dos cinco percentis é clicável: ela já mostra o valor de cada
 * margem, então é o lugar em que comparar e escolher são o mesmo gesto — em vez
 * de escolher às cegas num campo e só depois ver no que deu. Clicar move o
 * ponto no gráfico logo acima.
 */
function Distribuicao({
  custo,
  amostras,
  media,
  margem,
  onMargem,
}: {
  custo: Percentis;
  /** Custo de cada campanha simulada, cru: é dele que sai a forma da curva. */
  amostras: Float64Array;
  media: number;
  margem: MargemKey;
  onMargem: (m: MargemKey) => void;
}) {
  const info = MARGENS.find((m) => m.key === margem)!;

  return (
    <div className="mt-5">
      <CurvaDeCusto
        amostras={amostras}
        media={media}
        escolhida={{ rotulo: info.rotulo, chance: info.chance, valor: custo[margem] }}
        margens={MARGENS.map((m) => custo[m.key])}
      />
      <div className="mt-3 grid grid-cols-2 gap-1 sm:grid-cols-5">
        {MARGENS.map((m) => (
          <button
            key={m.key}
            type="button"
            onClick={() => onMargem(m.key)}
            title={`${m.explica} — ${zenyExato(custo[m.key])}`}
            className={
              'estado cursor-pointer rounded-lg px-2 py-1.5 text-left text-xs ' +
              'transition-colors duration-200 ease-padrao ' +
              (m.key === margem
                ? 'bg-realce-container text-no-realce-container'
                : 'text-suave hover:text-texto')
            }
          >
            <span className="md-rotulo-p block">{m.rotulo}</span>
            <span className="block tabular-nums">{zeny(custo[m.key])}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

/**
 * A lista de compras e a tabela de minérios, que eram dois painéis.
 *
 * São a mesma campanha contada duas vezes: "Minérios e materiais" mostrava o
 * consumo em minério PRONTO, como o motor conta, e a lista mostra o que fazer
 * com ele — comprar pronto ou montar no balcão, com o que a escolha poupa.
 * Como painéis irmãos, a segunda tabela só parecia repetir a primeira com
 * outro total. Como duas vistas do mesmo painel, a diferença entre elas vira a
 * pergunta que se está fazendo: o que eu compro, ou quanto eu gasto de cada
 * minério na média e na margem.
 */
function PainelDeCompras({ plano, margem }: { plano: ResultadoPlano; margem: MargemKey }) {
  const [vista, setVista] = useState<'compras' | 'minerios'>('compras');

  return (
    <Painel
      titulo="Lista de compras"
      aside={
        <Segmentado
          rotulo="Como ver"
          value={vista}
          onChange={setVista}
          opcoes={[
            { key: 'compras', rotulo: 'o que comprar', dica: 'O que levar ao mercado, com a receita de NPC aberta onde fabricar sai mais barato.' },
            { key: 'minerios', rotulo: 'por minério', dica: 'O consumo em minério pronto, como o motor conta — conferência do plano.' },
          ]}
        />
      }
    >
      {vista === 'compras' ? (
        <Compras plano={plano} margem={margem} />
      ) : (
        <Materiais plano={plano} margem={margem} />
      )}
    </Painel>
  );
}

const ROTULO_VIA: Record<string, string> = {
  mercado: 'comprar',
  npc: 'fabricar no NPC',
  indisponivel: 'sem preço',
};

function Materiais({ plano, margem }: { plano: ResultadoPlano; margem: MargemKey }) {
  const linhas = Object.entries(plano.recursos.itens)
    .map(([id, media]) => ({
      itemId: Number(id),
      media,
      naMargem: plano.simulacao?.itens[Number(id)]?.[margem] ?? null,
      via: sourcingOf(Number(id), plano.input.precos),
    }))
    .filter((l) => l.media > 0)
    .sort((a, b) => b.media - a.media);

  // Quantas cópias do equipamento a campanha consome: a que você começa
  // segurando, mais uma para cada quebra. É o número que decide se dá para
  // começar hoje — de nada adianta ter minério se falta item para refinar.
  const copiasNaMargem = plano.simulacao ? plano.simulacao.quebras[margem] + 1 : null;

  return (
    <div>
      {/* O balão fica FORA do `overflow-x-auto`: dentro dele, uma camada
          temporária é recortada pela borda da rolagem. */}
      <TituloDeSecao
        info={
          <Info titulo="Por minério" alinhar="direita">
            Conferência, não decisão: aqui os minérios aparecem prontos, como o motor os conta, e
            não desmontados no que se compra — quem vai ao jogo leva a outra vista. A coluna{' '}
            <strong className="text-texto">ter em mãos</strong> é quanto separar para não ficar sem
            material no meio do caminho na margem escolhida: cada linha está no percentil dela,
            então a soma passa do orçamento — é o preço de não faltar nada de uma vez só.
          </Info>
        }
      >
        Consumo por minério · média de{' '}
        {Math.round(plano.recursos.tentativas).toLocaleString('pt-BR')} tentativas
      </TituloDeSecao>
      <div className="overflow-x-auto">
      <table className="md-corpo-m w-full">
        <thead>
          <tr className="md-rotulo-p border-b border-borda text-left text-suave">
            <th className="pb-2">Material</th>
            <th className="pb-2">Como obter</th>
            <th className="pb-2 text-right">Média</th>
            {plano.simulacao && <th className="pb-2 text-right">Ter em mãos</th>}
          </tr>
        </thead>
        <tbody className="divide-y divide-borda/60">
          {linhas.map((l) => (
            <tr key={l.itemId}>
              <td className="py-2">
                <span className="flex items-center gap-2">
                  <SlotItem id={l.itemId} tamanho="mini" />
                  {nomeDoItem(l.itemId)}
                </span>
              </td>
              <td className="md-corpo-p py-2 text-suave">{ROTULO_VIA[l.via]}</td>
              <td className="py-2 text-right tabular-nums">{quantidade(l.media)}</td>
              {l.naMargem !== null && (
                <td className="py-2 text-right font-medium tabular-nums">
                  {quantidade(Math.ceil(l.naMargem))}
                </td>
              )}
            </tr>
          ))}
          <tr className={plano.recursos.itensQuebrados > 0 ? 'text-perigo' : undefined}>
            <td className="py-2">
              Cópias do item
              {plano.input.refinoAtual > 0 ? ` (+${plano.input.refinoAtual} e reposições no +0)` : ' (+0)'}
            </td>
            <td className="md-corpo-p py-2 text-suave">{zeny(plano.input.precoItem)} cada, no +0</td>
            <td className="py-2 text-right tabular-nums">{quantidade(plano.copiasItem)}</td>
            {copiasNaMargem !== null && (
              <td className="py-2 text-right font-medium tabular-nums">
                {quantidade(copiasNaMargem)}
              </td>
            )}
          </tr>
        </tbody>
      </table>
      </div>
    </div>
  );
}

/**
 * O que comprar de verdade — e, em cada linha, se vale a pena fabricar.
 *
 * A tabela de cima fala em minérios prontos, mas metade deles ninguém compra:
 * fabrica no NPC. Esta lista é a mesma campanha na quantidade da margem
 * escolhida, com cada minério desmontado até o que se acha à venda.
 *
 * O desmonte fica ANINHADO embaixo do minério, e não achatado numa lista só,
 * porque a decisão que ele representa não é do motor: o custo diz que fabricar
 * 379 Eteridecon poupa 27 milhões, mas quem fabrica precisa carregar 1.895
 * Minério de Oridecon do mercado ao NPC. Uma lista achatada dá a conta e esconde
 * a viagem; a árvore põe as duas na mesma linha e deixa a pessoa decidir.
 */
function Compras({ plano, margem }: { plano: ResultadoPlano; margem: MargemKey }) {
  const arvore = arvoreDeCompras(quantidadesNaMargem(plano, margem), plano.input.precos);
  const materiais = arvore.reduce((s, l) => s + l.total, 0);

  const quebras = Math.ceil(
    plano.simulacao ? plano.simulacao.quebras[margem] : plano.recursos.itensQuebrados,
  );
  const custoReposicao = quebras * plano.input.precoItem;
  const tentativas = Math.round(plano.recursos.tentativas);
  // A taxa não é `tentativas x valor fixo`: ela some nos minérios de Cash Shop das
  // armas nv1 a nv4, então vem somada do motor.
  const taxas = Math.ceil(plano.simulacao?.taxas[margem] ?? plano.recursos.taxas);
  const total = materiais + custoReposicao + taxas;

  return (
    <>
      <TituloDeSecao
        info={
          <Info titulo="Comprar ou fabricar" alinhar="direita">
            A quantidade em destaque é quanto separar de cada item na margem escolhida. Onde há
            receita de NPC, a linha diz qual das duas vias sai mais barata{' '}
            <strong className="text-texto">pelos preços que você informou</strong> e quanto a
            escolhida poupa — e, quando é fabricar, abre embaixo o que ir buscar no mercado. A
            economia é só o zeny: o peso do minério e as viagens ao NPC são seus, e há caso em que
            carregar mil minérios para poupar alguns milhares não compensa. O total abaixo segue a
            via mais barata, então trocar uma linha por comprar pronto o encarece exatamente na
            economia daquela linha.
            {plano.simulacao ? (
              <>
                {' '}
                O total desta lista fica <strong className="text-texto">acima do orçamento</strong>{' '}
                porque cada linha está no seu próprio percentil — é o preço de não faltar nada de
                uma vez só. O orçamento é o percentil do custo total, em que a sorte de um material
                compensa o azar de outro.
              </>
            ) : null}
          </Info>
        }
      >
        Comprar ou fabricar
      </TituloDeSecao>

      <ul className="divide-y divide-borda/60">
        {arvore.map((l) => (
          <LinhaDeCompra key={l.itemId} linha={l} />
        ))}
      </ul>

      <Divisor />

      {/* O que não é material: taxa e o item destruído. Não é lista de compras —
          é o resto da conta —, então fica separado do que se procura numa loja.
          O balcão do NPC não entra aqui: ele já está dentro da linha do minério
          que o exigiu, e repeti-lo cobraria duas vezes pela mesma fabricação. */}
      <dl className="md-corpo-m space-y-1.5">
        <LinhaDeConta rotulo="Materiais (com o balcão do NPC)" valor={materiais} />
        {taxas > 0 && (
          <LinhaDeConta
            rotulo="Taxa do refinador"
            detalhe={`${tentativas.toLocaleString('pt-BR')} tentativas`}
            valor={taxas}
          />
        )}
        {quebras > 0 && (
          <LinhaDeConta
            rotulo="Reposição do item quebrado (no +0)"
            detalhe={`${quebras}x ${zeny(plano.input.precoItem)}`}
            valor={custoReposicao}
            perigo
          />
        )}
      </dl>

      <div className="mt-3 flex items-baseline justify-between gap-3 border-t border-borda pt-3">
        <span className="md-titulo-m">Total da lista</span>
        <span className="md-titulo-g text-realce tabular-nums" title={zenyExato(total)}>
          {zeny(total)}
        </span>
      </div>
    </>
  );
}

/**
 * Uma linha do que se compra: quanto, o quê, por qual via e o que ela custa.
 *
 * A quantidade vem antes do nome e no corpo de um título, porque é o que se lê
 * de relance com a loja aberta — o nome já se reconhece pela arte ao lado.
 *
 * A mesma função desenha a raiz e os insumos dela: um insumo é uma linha de
 * compra igual às outras, só que menor e recuada. Foi o que dispensou a seção
 * "Fabricar no balcão do NPC" que existia embaixo — a receita não é assunto à
 * parte, é o que aquela linha custa quando se escolhe fabricá-la.
 */
function LinhaDeCompra({ linha, nivel = 0 }: { linha: ItemDaLista; nivel?: number }) {
  const raiz = nivel === 0;

  return (
    <li className={raiz ? 'py-3' : 'py-1.5'}>
      <div className="flex items-start justify-between gap-3">
        <span className="flex min-w-0 items-start gap-2.5">
          <SlotItem id={linha.itemId} tamanho={raiz ? 'normal' : 'mini'} />
          <span className="min-w-0">
            <span className="flex flex-wrap items-baseline gap-x-2">
              <strong
                className={
                  'tabular-nums ' + (raiz ? 'md-titulo-g text-realce' : 'md-corpo-m text-texto')
                }
              >
                {quantidade(linha.qtd)}x
              </strong>
              <span className={(raiz ? 'md-corpo-m' : 'md-corpo-p') + ' font-medium text-texto'}>
                {nomeDoItem(linha.itemId)}
              </span>
            </span>
            <Veredito linha={linha} raiz={raiz} />
          </span>
        </span>
        <span
          className={
            'shrink-0 tabular-nums ' + (raiz ? 'md-corpo-m font-medium' : 'md-corpo-p text-suave')
          }
          title={zenyExato(linha.total)}
        >
          {zeny(linha.total)}
        </span>
      </div>

      {linha.fabricacao && (
        // O recuo com fio à esquerda é o que diz "isto é o preço da linha de
        // cima", e não mais um item da lista. Sem ele, um insumo de 3.750 Pó de
        // Éter parece uma compra a mais.
        <ul className="mt-1.5 ml-5 border-l border-borda pl-3">
          {linha.fabricacao.insumos.map((i) => (
            <LinhaDeCompra key={i.itemId} linha={i} nivel={nivel + 1} />
          ))}
          <li className="md-corpo-p flex items-baseline justify-between gap-3 py-1.5 text-suave">
            <span>
              Balcão do NPC
              {linha.fabricacao.zenyBalcao > 0 ? '' : ' — não cobra por esta troca'}
            </span>
            {linha.fabricacao.zenyBalcao > 0 && (
              <span
                className="shrink-0 tabular-nums"
                title={zenyExato(linha.fabricacao.zenyBalcao)}
              >
                {zeny(linha.fabricacao.zenyBalcao)}
              </span>
            )}
          </li>
        </ul>
      )}
    </li>
  );
}

/**
 * A via da linha e o que ela poupa: a frase que responde "fabrico ou compro?".
 *
 * O quanto vem em zeny E em porcentagem porque os dois enganam sozinhos — 200z
 * de economia é desprezível em qualquer campanha, e 3% de dois bilhões não é.
 *
 * A economia é sempre a da via ESCOLHIDA sobre a outra, nos dois sentidos: na
 * linha que se fabrica ela diz o que a viagem ao NPC rende, e na que se compra
 * pronto diz o que a receita custaria a mais. É o mesmo número lido dos dois
 * lados, e é o único da lista que não é um gasto.
 */
function Veredito({ linha, raiz }: { linha: ItemDaLista; raiz: boolean }) {
  if (linha.via === 'indisponivel') {
    return <span className="md-corpo-p block text-perigo">Sem preço informado e sem receita.</span>;
  }

  const fabricando = linha.via === 'npc';
  const alternativa = fabricando ? linha.precoMercado : linha.custoFabricado;
  const totalAlternativo = alternativa === null ? null : alternativa * linha.qtd;
  const fracao = totalAlternativo && totalAlternativo > 0 ? linha.economia / totalAlternativo : 0;

  return (
    <span className="md-corpo-p mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-suave">
      {fabricando ? (
        <span>Fabricar no NPC</span>
      ) : (
        // "Comprar pronto" é a decisão da linha, e num insumo já está dita pela
        // linha de cima: ali o preço unitário sozinho basta, e é o que a pessoa
        // confere na loja.
        <span>
          {raiz && 'Comprar pronto · '}
          <span className="tabular-nums">{zeny(linha.custoUnitario)}</span> cada
        </span>
      )}

      {linha.economia > 0 && (
        <Pastilha
          tom="ok"
          titulo={`Pela outra via, esta linha custaria ${zenyExato(totalAlternativo ?? 0)}`}
        >
          <span className="tabular-nums">
            economiza {zeny(linha.economia)} ({porcento(fracao)})
          </span>
        </Pastilha>
      )}

      {fabricando &&
        (totalAlternativo === null ? (
          <span>ninguém vende pronto</span>
        ) : (
          <span>
            comprar pronto: <span className="tabular-nums">{zeny(totalAlternativo)}</span>
          </span>
        ))}
    </span>
  );
}

/** Um gasto que não é material: balcão, taxa, reposição. */
function LinhaDeConta({
  rotulo,
  detalhe,
  valor,
  perigo,
}: {
  rotulo: string;
  detalhe?: string;
  valor: number;
  perigo?: boolean;
}) {
  return (
    <div className={'flex items-baseline justify-between gap-3 ' + (perigo ? 'text-perigo' : '')}>
      <dt>
        {rotulo}
        {detalhe && <span className="md-corpo-p ml-1.5 text-suave">{detalhe}</span>}
      </dt>
      <dd className="shrink-0 tabular-nums" title={zenyExato(valor)}>
        {zeny(valor)}
      </dd>
    </div>
  );
}

/** Assinatura de uma fase de refino, para reconhecer preparos idênticos. */
function assinatura(fase: PlanoDeFase): string | null {
  if (fase.tipo !== 'refino' || fase.trechos.length === 0) return null;
  return fase.trechos.map((t) => `${t.de}-${t.para}:${t.minerioItemId}:${t.bencaos}`).join('|');
}

function ehRepeticao(fases: PlanoDeFase[], i: number): boolean {
  const atual = assinatura(fases[i]!);
  if (atual === null) return false;
  return fases.slice(0, i).some((f) => assinatura(f) === atual);
}

/**
 * Uma fase do plano — e, a um clique, as duas leituras finas dela.
 *
 * A tabela de estados e o percurso sorteado eram um painel separado ("A cadeia
 * de decisões"), o que punha a mesma política duas vezes na página: agrupada
 * aqui, desagrupada lá. Agora abrem DENTRO da fase que explicam, que é onde a
 * pergunta nasce — "por que esta faixa custa isso?" se faz olhando a faixa.
 */
function Fase({
  fase,
  repetida,
  itemId,
  itemNome,
  grau,
  slots,
}: {
  fase: PlanoDeFase;
  repetida?: boolean;
  itemId: number | null;
  itemNome: string;
  grau: Grade;
  slots: number;
}) {
  const [tabela, setTabela] = useState(false);
  const [percurso, setPercurso] = useState(false);
  // A fase de Grau é uma tentativa só, repetida, e o texto abaixo já a descreve
  // inteira; a repetida usa a política da primeira, que continua aberta acima.
  const politica = repetida ? undefined : fase.politica;
  const temDetalhe = politica !== undefined && politica.length > 0;

  return (
    <li className="rounded-xl bg-superficie-baixa p-3.5">
      <div className="mb-2.5 flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="md-titulo-m">{fase.rotulo}</h3>
        <span className="md-corpo-m text-suave tabular-nums" title={zenyExato(fase.custoEsperado)}>
          {zeny(fase.custoEsperado)}
        </span>
      </div>

      {repetida && (
        <p className="md-corpo-m text-suave">
          Mesma sequência de minérios do preparo anterior — o Grau zerou o refino e você refaz o
          caminho.
        </p>
      )}

      {!repetida && fase.trechos.length > 0 && (
        <ul className="md-corpo-m space-y-2">
          {fase.trechos.map((t, i) => (
            <li key={i} className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <span className="w-16 shrink-0 font-mono text-xs text-suave tabular-nums">
                +{t.de}→+{t.para}
              </span>
              {/* A arte do minério é o que se procura na loja e na mochila; o
                  nome é o que se confere. Lê-lo sem ver o sprite obriga a
                  traduzir cada passo antes de executá-lo no jogo. */}
              <SlotItem id={t.minerioItemId} tamanho="mini" />
              <span className="font-medium">{t.minerio}</span>
              {t.bencaos > 0 && <Pastilha tom="ok">+{t.bencaos} Bênção do Ferreiro</Pastilha>}
              <span className="md-corpo-p text-suave tabular-nums">{porcento(t.chance)}</span>
              {t.chance < 1 && (
                <span
                  className={'md-corpo-p ' + (t.arriscaQuebrar ? 'text-perigo' : 'text-suave')}
                >
                  — na falha, {t.naFalha}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}

      {fase.grau && (
        <div className="space-y-1 text-sm">
          <p>
            Tentar com o item no <strong>+{fase.grau.refino}</strong>, processo{' '}
            {fase.grau.seguro ? (
              <span className="text-ok">seguro</span>
            ) : (
              <span className="text-perigo">normal (arrisca perder tudo)</span>
            )}
            , chance de {porcento(fase.grau.chance)}.
          </p>
          <p className="text-xs text-suave">
            {fase.grau.seguro
              ? `${fase.grau.step.seguro.material.qtd}x ${fase.grau.step.seguro.material.nome} por tentativa.`
              : `${fase.grau.step.normal.material.qtd}x ${fase.grau.step.normal.material.nome} por tentativa.`}{' '}
            {fase.grau.pontosBencao > 0
              ? `Somar ${fase.grau.qtdBencaos} Bênção de Éter para comprar +${fase.grau.pontosBencao} p.p. de chance.`
              : 'A Bênção de Éter não compensa neste degrau, pelos preços informados.'}{' '}
            Cerca de {fase.grau.tentativasEsperadas.toFixed(1)} tentativas até passar. O sucesso zera o
            refino de volta para +0.
          </p>
        </div>
      )}

      {temDetalhe && (
        <>
          <div className="mt-3 flex flex-wrap items-center gap-x-1 gap-y-2 border-t border-borda pt-3">
            <BotaoDoPainel aberto={tabela} onClick={() => setTabela((a) => !a)}>
              ver estado por estado
            </BotaoDoPainel>
            <BotaoDoPainel aberto={percurso} onClick={() => setPercurso((a) => !a)}>
              Simular — ver uma campanha acontecer
            </BotaoDoPainel>
          </div>

          {tabela && (
            <div className="mt-3">
              <TabelaDeEstados politica={politica} alvo={fase.para ?? 0} />
            </div>
          )}

          {percurso && (
            <div className="mt-3">
              <Percurso
                politica={politica}
                de={fase.de ?? 0}
                alvo={fase.para ?? 0}
                itemId={itemId}
                itemNome={itemNome}
                grau={grau}
                slots={slots}
              />
            </div>
          )}
        </>
      )}
    </li>
  );
}

/**
 * Um aviso, na superfície de estado do Material.
 *
 * O container colorido (`error-container` e parentes) existe justamente para
 * isto: dizer a gravidade pela superfície, e não tingindo o texto — que é o que
 * fazia um aviso de perigo inteiro ficar em vermelho sobre fundo escuro, no
 * limite do contraste legível.
 */
function AvisoLinha({ aviso }: { aviso: Aviso }) {
  const cor =
    aviso.nivel === 'perigo'
      ? 'bg-perigo-container text-no-perigo-container'
      : aviso.nivel === 'atencao'
        ? 'bg-atencao-container text-no-atencao-container'
        : 'bg-superficie-baixa text-suave';
  const icone = aviso.nivel === 'perigo' ? '⚠' : aviso.nivel === 'atencao' ? '!' : 'i';

  return (
    <li className={`md-corpo-m flex gap-2.5 rounded-xl p-3.5 ${cor}`}>
      <span aria-hidden className="shrink-0 font-bold">
        {icone}
      </span>
      <span>{aviso.texto}</span>
    </li>
  );
}
