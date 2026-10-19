import { useMemo, useState, type ReactNode } from 'react';

import { nomeDoItem } from '../data/nomes';
import { TOLERANCIA_FABRICAR, arvoreDeCompras, sourcingOf, type ItemDaLista } from '../engine/pricing';
import { fluxoDeCusto } from '../engine/fluxoDeCusto';
import {
  campanhaDoKit,
  fabricacoesDoPlano,
  montarKits,
  type Fabricacao,
  type Kit,
} from '../engine/kit';
import type { Aviso, PlanoDeFase, Resultado as ResultadoPlano } from '../engine/plan';
import type { CampanhaEmMateriais } from '../engine/estoque';
import type { Percentis } from '../engine/types';
import type { Grade } from '../data/grade';
import { nomeNoJogo, rotuloCurto } from '../data/rotulos';
import { CartaoItem, SlotItem } from './ItemNoJogo';
import { Percurso, TabelaDeEstados } from './Cadeia';
import { CurvaDeCusto } from './CurvaDeCusto';
import { ResumoDoFluxo, SankeyCusto } from './SankeyCusto';
import { porcento, quantidade, zeny, zenyExato } from '../format';
import {
  Abas,
  BotaoDoPainel,
  Divisor,
  NumeroZeny,
  Info,
  Painel,
  Pastilha,
  Recolhivel,
  Segmentado,
  TituloDeSecao,
} from './ui';

export type MargemKey = keyof Percentis;

/**
 * As abas são os três níveis de prioridade da página, não uma divisão nova: o
 * que se FAZ, o que se COMPRA, e se dá com o que já se tem.
 */
export type AbaKey = 'plano' | 'compras' | 'estoque' | 'sorte';

/**
 * As margens oferecidas. `chance` é a mesma coisa que o percentil, em número:
 * o gráfico da distribuição precisa dela para dizer que fatia das campanhas a
 * área acesa cobre, e ler isso de volta da chave ('p90' → 0,9) seria um parse
 * inútil de um dado que já se sabe aqui.
 *
 * O `rotulo` diz quão seguro é o orçamento, não o percentil: "90%" sozinho é
 * vocabulário de estatística, e era o primeiro controle que quem chega via no
 * resultado. O número continua em `pct`, para quem o quer e para os textos que
 * precisam ser exatos. `explica` fala em "vezes", e não em "tentativas": no jogo
 * tentativa é cada clique no refinador, não a campanha inteira.
 */
export const MARGENS: {
  key: MargemKey;
  rotulo: string;
  pct: string;
  chance: number;
  explica: string;
  /** A mesma chance para encaixar numa frase: "em 9 de cada 10 vezes". */
  fracao: string;
}[] = [
  { key: 'p50', rotulo: 'Arriscado', pct: '50%', chance: 0.5, explica: 'dá em metade das vezes', fracao: 'metade das' },
  { key: 'p75', rotulo: 'Moderado', pct: '75%', chance: 0.75, explica: 'dá em 3 de cada 4 vezes', fracao: '3 de cada 4' },
  { key: 'p90', rotulo: 'Seguro', pct: '90%', chance: 0.9, explica: 'dá em 9 de cada 10 vezes', fracao: '9 de cada 10' },
  { key: 'p95', rotulo: 'Muito seguro', pct: '95%', chance: 0.95, explica: 'dá em 19 de cada 20 vezes', fracao: '19 de cada 20' },
  { key: 'p99', rotulo: 'Quase certo', pct: '99%', chance: 0.99, explica: 'só 1 em 100 vezes passa disso', fracao: '99 de cada 100' },
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
  compartilhar,
  moduloEstoque,
  moduloSorte,
  abaInicial = 'plano',
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
  /** O botão de compartilhar, no canto do painel do orçamento — é a resposta que se compartilha. */
  compartilhar?: ReactNode;
  /**
   * Simulador de estoque: a terceira aba. "Dá com o que eu tenho?" é a pergunta
   * que vem depois de "o que comprar", e ela parte do mesmo kit — por isso
   * recebe o kit em vez de montá-lo de novo. Ausente, a aba não existe.
   */
  moduloEstoque?: (kit: Kit) => ReactNode;
  /**
   * "Já refinei": a quarta aba, que pergunta o que a campanha gastou em vez do
   * que ela vai gastar. Recebe as campanhas no que se compra, as mesmas do
   * kit — é o que a pessoa comprou de fato.
   */
  moduloSorte?: (campanha: CampanhaEmMateriais | null) => ReactNode;
  /** A aba aberta de saída — a de "Já refinei", para quem chega por um resultado compartilhado. */
  abaInicial?: AbaKey;
}) {
  const sim = plano.simulacao;
  // Um aviso que muda a decisão (o item quebra, o alvo não fecha, um preço está
  // zerado) precisa ser lido ANTES do número que ele desmente. O que é só
  // contexto pode esperar o fim da página.
  const criticos = plano.avisos.filter((a) => a.nivel !== 'info');
  const informativos = plano.avisos.filter((a) => a.nivel === 'info');
  // O kit é a única fonte de quantidades da página: o "o que ter em mãos" do
  // topo, a lista de compras, o diagrama e o simulador de estoque leem dele.
  // A campanha no que se compra não depende da margem, então sobrevive à troca
  // dela. Os cinco níveis saem de um descasque só, e por isso trocar a margem
  // não refaz conta nenhuma. "Já refinei" lê a mesma campanha.
  const campanhaKit = useMemo(() => campanhaDoKit(plano), [plano]);
  const kits = useMemo(
    () => montarKits(plano, campanhaKit, MARGENS.map((m) => m.chance)),
    [plano, campanhaKit],
  );
  const kit = kits[MARGENS.findIndex((m) => m.key === margem)]!;
  const fluxo = fluxoDeCusto(plano, kit);
  const temCompras = Object.keys(plano.recursos.itens).length > 0;

  // Fora das abas fica o que governa as TRÊS: os avisos, o item, o orçamento e
  // a margem. A margem, em especial, muda número na lista de compras e no
  // simulador de estoque — deixá-la dentro da primeira aba seria pôr o controle
  // numa tela e o efeito em outra.
  const [aba, setAba] = useState<AbaKey>(abaInicial);

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
          {/* A lista vem primeiro: é o que o nome da aba promete, e o que se
              leva ao jogo. O diagrama fica colado nela porque os dois totais
              são o MESMO número — ele é a lista relida por natureza do gasto —,
              e vem depois porque responde outra pergunta: para onde vai o
              zeny, e não o que comprar. */}
          {temCompras && <PainelDeCompras plano={plano} kit={kit} margem={margem} />}

          {fluxo.total > 0 && (
            <Painel
              titulo="Para onde vai o zeny"
              info={
                <Info titulo="Para onde vai o zeny">
                  As mesmas quantidades da lista de compras logo acima, agrupadas pela natureza do
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
        </div>
      ),
    });
  }

  // O rótulo é curto, e não a pergunta inteira: ela já é o título do painel
  // logo abaixo, e a aba repetindo-a punha a mesma frase duas vezes seguidas.
  if (moduloEstoque) {
    abas.push({ key: 'estoque', rotulo: 'O que eu tenho', conteudo: moduloEstoque(kit) });
  }

  // Sem nada a refinar não há campanha para ter tido sorte.
  if (moduloSorte && temCompras) {
    abas.push({ key: 'sorte', rotulo: 'Já refinei', conteudo: moduloSorte(campanhaKit) });
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

      <Painel titulo="Quanto vai custar" aside={compartilhar}>
        <Trajetoria plano={plano} itemNome={itemNome} itemId={itemId} itemSlots={itemSlots} />

        {/* Duas respostas, porque há dois jeitos de jogar: quem volta ao
            mercado quando o minério acaba e quem leva tudo de uma vez ao
            refinador. Antes a página dava só a primeira em zeny, e a segunda
            vivia espalhada em três tabelas que discordavam entre si. O nível
            de segurança vem antes das duas porque governa as duas. */}
        {sim ? (
          <>
            <NivelDeSeguranca margem={margem} onMargem={onMargem} />
            <DoisModos
              plano={plano}
              kit={kit}
              margem={margem}
              onVerLista={() => {
                setAba('compras');
                document.getElementById(ID_ABAS)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
              }}
            />
            <Quebra plano={plano} kit={kit} />
          </>
        ) : (
          <div className="mt-4">
            <div className="md-rotulo-p text-suave">Quanto separar</div>
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
          </div>
        )}

        <SemRisco plano={plano} margem={margem} />

        {sim && (
          <Distribuicao
            custo={sim.custo}
            amostras={sim.amostras.custo}
            media={plano.custoEsperado}
            margem={margem}
            kit={kit.chance !== null ? kit.valor : undefined}
          />
        )}

        {sim && plano.fases.length > 0 && (
          <ComprarPronto plano={plano} itemNome={itemNome} itemSlots={itemSlots} />
        )}

        {/* A frase de cima já diz o que estes dois decidem — quanto separar e
            se o item quebra. Abertos, eram números grandes disputando com o
            orçamento. */}
        <div className="mt-5 border-t border-borda pt-3">
          <Recolhivel rotulo="mais números" aside={precisao}>
            <div className="grid gap-4 sm:grid-cols-2">
              <Copias plano={plano} margem={margem} />
              <Secundario
                rotulo="Custo médio"
                valor={zeny(plano.custoEsperado)}
                titulo={zenyExato(plano.custoEsperado)}
                nota="A média é puxada pelos azarados. Planejar por ela dá errado em quase metade das vezes."
              />
            </div>
          </Recolhivel>
        </div>
      </Painel>

      {/* As abas vêm DEPOIS do orçamento, e não no lugar dele: a resposta da
          página é uma só, e as três abas são os três jeitos de continuar a
          pergunta — como eu faço, o que eu compro, dá com o que eu tenho. */}
      <div id={ID_ABAS} className="scroll-mt-4">
        <Abas rotulo="O que ver do plano" value={ativa} onChange={setAba} abas={abas} />
      </div>
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
    linhas.push({ rotulo: `Orçamento (${margemInfo.pct})`, aqui: zeny(aqui), la: zeny(la) });
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
          ? `No nível ${margemInfo.rotulo}, o plano sem risco de quebra sai mais barato`
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
 *
 * O ponto de partida não é repetido aqui: ele está no formulário ao lado, e a
 * linha "Saindo do +0 e do sem grau" só afastava o item do orçamento.
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

  return (
    <CartaoItem
      itemId={itemId ?? null}
      itemNome={itemNome ?? null}
      kind={i.kind}
      refino={i.refinoAlvo}
      grau={i.grauAlvo}
      slots={itemSlots ?? 0}
      preco={i.precoItem}
    />
  );
}

/** Onde as abas começam: o "ver a lista" do kit rola até elas. */
export const ID_ABAS = 'abas-do-plano';

/**
 * Quão seguro o orçamento deve ser: o único seletor da margem da página.
 *
 * Os botões não trazem mais o valor de cada nível: há dois valores por nível
 * agora, um por cartão, e só um deles no botão diria que o outro não depende
 * da escolha. O percentil fica em letra pequena, para quem o conhece.
 */
function NivelDeSeguranca({
  margem,
  onMargem,
}: {
  margem: MargemKey;
  onMargem: (m: MargemKey) => void;
}) {
  const atual = MARGENS.find((m) => m.key === margem)!;
  return (
    <div className="mt-4">
      <div className="md-rotulo-p text-suave">Quão seguro você quer estar?</div>
      {/* Uma linha só, em qualquer largura. No celular cada coluna tem uns
          60px, e "Muito seguro" não cabe nela: o botão fica só com o
          percentual, e o nome do nível escolhido vem por extenso logo abaixo.
          Em três colunas o seletor quebrava em duas linhas desiguais, e a
          segunda parecia outra escolha. */}
      <div
        role="radiogroup"
        aria-label="Margem de segurança"
        className="mt-2 grid grid-cols-5 gap-1"
      >
        {MARGENS.map((m) => {
          const ativo = m.key === margem;
          return (
            <button
              key={m.key}
              type="button"
              role="radio"
              aria-checked={ativo}
              aria-label={`${m.rotulo} (${m.pct})`}
              onClick={() => onMargem(m.key)}
              title={`${m.explica} (${m.pct})`}
              className={
                'estado flex cursor-pointer items-baseline justify-center gap-1 rounded-lg border px-1 py-1.5 text-xs sm:justify-between sm:px-2 sm:text-left ' +
                'transition-colors duration-200 ease-padrao ' +
                (ativo
                  ? 'border-transparent bg-realce-container text-no-realce-container'
                  : 'border-borda text-suave hover:text-texto')
              }
            >
              <span className="hidden font-semibold whitespace-nowrap sm:inline">{m.rotulo}</span>
              <span className={'tabular-nums sm:opacity-70 ' + (ativo ? 'font-semibold sm:font-normal' : '')}>
                {m.pct}
              </span>
            </button>
          );
        })}
      </div>
      <p className="md-corpo-p mt-1.5 text-suave sm:hidden" aria-hidden>
        <strong className="text-texto">{atual.rotulo}</strong>: {atual.explica}.
      </p>
    </div>
  );
}

/**
 * A resposta da página, em duas moedas.
 *
 * O primeiro cartão é o custo da campanha com tudo convertido em zeny —
 * minérios, balcão do NPC, a taxa de cada tentativa e as cópias que quebram —
 * no nível de segurança escolhido. O segundo é o que ter em mãos antes de
 * começar, no mesmo nível: zeny só para as taxas, e o resto em minério
 * contado. Comprado a preço de mercado, o segundo sai mais caro que o
 * primeiro, porque a mochila tem de cobrir o azar de cada minério na mesma
 * campanha e o que sobra volta para casa (matematica.md §9.7).
 */
function DoisModos({
  plano,
  kit,
  margem,
  onVerLista,
}: {
  plano: ResultadoPlano;
  kit: Kit;
  margem: MargemKey;
  onVerLista: () => void;
}) {
  const sim = plano.simulacao!;
  const info = MARGENS.find((m) => m.key === margem)!;
  const linhas = arvoreDeCompras(kit.itens, plano.input.precos);
  const fabricar = fabricacoesDoPlano(plano);
  const quebra = kit.reposicoes > 0;

  return (
    <div className="mt-4 grid gap-3 sm:grid-cols-2">
      <Modo
        rotulo="Custo total em zeny"
        valor={sim.custo[margem]}
        info={
          <Info titulo="Custo total em zeny">
            Tudo o que a campanha consome, convertido em zeny pelos preços da tabela: os minérios
            pela via mais barata (comprando ou fabricando), o balcão do NPC nas conversões, a taxa do
            refinador e de Grau em cada tentativa e as cópias do item que quebrarem. É o percentil{' '}
            {info.pct}: {info.fracao} campanhas simuladas fecharam gastando isto ou menos.
          </Info>
        }
      >
        <p className="md-corpo-m text-suave">
          Minérios, conversões, a taxa de cada tentativa{quebra ? ' e as cópias que quebram' : ''}.
          Em {info.fracao} vezes o gasto fica nisso ou abaixo
          {margem === 'p50' ? (
            '.'
          ) : (
            <>
              ; normalmente, perto de{' '}
              <strong className="text-texto tabular-nums" title={zenyExato(sim.custo.p50)}>
                {zeny(sim.custo.p50)}
              </strong>
              .
            </>
          )}
        </p>
      </Modo>

      <Modo
        rotulo="O que ter em mãos"
        valor={kit.taxas}
        legenda="só de taxas"
        info={
          <Info titulo="O que ter em mãos" alinhar="direita">
            O mínimo para separar antes de começar e não voltar ao mercado. O zeny aqui é só o das
            taxas — do refinador, de Grau e do NPC que fabrica os minérios. O que vale mais a pena
            fabricar vem pela receita, e não pronto: a sobra de um insumo serve a outra receita, e
            uma folga só cobre o azar das duas. Com tudo isso, nada falta em {info.fracao} campanhas
            simuladas. Comprado a preço de mercado, sai mais caro que o custo total ao lado: a
            mochila tem de cobrir o azar de todos os materiais na mesma campanha, e o que sobra volta
            para casa. São as mesmas quantidades da lista de compras e da aba “O que eu tenho”.
          </Info>
        }
      >
        <p className="md-corpo-m text-suave">
          E no mínimo isto, para nada faltar em {info.fracao} vezes:
        </p>
        <ul className="mt-2 space-y-1.5">
          {linhas.map((l) => (
            <li key={l.itemId} className="md-corpo-m flex items-center gap-2">
              <SlotItem id={l.itemId} tamanho="mini" />
              <strong className="text-texto tabular-nums">{inteiro(l.qtd)}x</strong>
              <span className="min-w-0 truncate">{nomeDoItem(l.itemId)}</span>
            </li>
          ))}
          {quebra && (
            <li className="md-corpo-m text-perigo">
              <strong className="tabular-nums">{inteiro(kit.reposicoes)}x</strong> cópia
              {kit.reposicoes === 1 ? '' : 's'} do item, no +0
            </li>
          )}
        </ul>
        {fabricar.length > 0 && (
          <p className="md-corpo-m mt-2 text-suave">
            Para fabricar no NPC: <ListaDeFabricados fabricar={fabricar} />.
          </p>
        )}
        <div className="-ml-3 mt-1">
          <BotaoDoPainel onClick={onVerLista}>ver a lista de compras</BotaoDoPainel>
        </div>
      </Modo>
    </div>
  );
}

function Modo({
  rotulo,
  valor,
  legenda,
  info,
  children,
}: {
  rotulo: string;
  valor: number;
  /** O que o número conta, quando não é tudo: "só de taxas". */
  legenda?: string;
  info: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="rounded-xl bg-superficie-baixa p-3.5">
      <div className="md-rotulo-p flex items-center gap-1 text-suave">
        {rotulo}
        {info}
      </div>
      <div className="mt-1 flex flex-wrap items-baseline gap-x-2">
        <span className="md-display-p text-realce tabular-nums" title={zenyExato(valor)}>
          {zeny(valor)}
        </span>
        {legenda && <span className="md-corpo-m text-suave">{legenda}</span>}
      </div>
      <div className="mt-1.5">{children}</div>
    </div>
  );
}

/**
 * O que fabricar, numa frase: "Âmbar de Éter, Pedra de Éter e mais 3". Dois
 * nomes bastam para a pessoa saber que a lista vem desmontada; as receitas
 * inteiras moram na aba de compras.
 */
function ListaDeFabricados({ fabricar }: { fabricar: Fabricacao[] }) {
  const mostrados = fabricar.slice(0, 2);
  const resto = fabricar.length - mostrados.length;
  return (
    <>
      {mostrados.map((f, i) => (
        <span key={f.itemId}>
          {i > 0 && (resto > 0 ? ', ' : ' e ')}
          <strong className="text-texto">{nomeDoItem(f.itemId)}</strong>
        </span>
      ))}
      {resto > 0 && ` e mais ${resto}`}
    </>
  );
}

/** Contagem inteira: o que se separa é cópia e minério, não fração. */
const inteiro = (n: number) => Math.ceil(n).toLocaleString('pt-BR');

/**
 * O destino do item, que vale para os dois modos: a reposição está nas duas
 * contas, e quem lê só o número não sabe que parte dele é equipamento novo.
 */
function Quebra({ plano, kit }: { plano: ResultadoPlano; kit: Kit }) {
  // Média de itens destruídos: zero só quando nenhuma tentativa do plano pode
  // quebrar o item.
  const quebra = plano.itensQuebrados > 1e-9;

  return (
    <p className="md-corpo-m mt-3 text-suave">
      {!quebra ? (
        <>O item não quebra nesse plano.</>
      ) : kit.reposicoes > 0 ? (
        <>
          O item pode quebrar no caminho: as reposições estão nas duas contas — no kit, são{' '}
          <strong className="text-texto tabular-nums">
            {inteiro(kit.reposicoes)} {kit.reposicoes === 1 ? 'cópia' : 'cópias'}
          </strong>{' '}
          a mais.
        </>
      ) : (
        <>O item pode quebrar no caminho, mas nesse nível uma cópia basta.</>
      )}
    </p>
  );
}

/**
 * "Compensa comprar pronto?", respondida com o preço que a pessoa achou.
 *
 * Era um número escondido em "mais números" — o preço no +0 mais o custo
 * médio —, e ele só dizia o ponto de empate na média. Quem acha o item à
 * venda quer saber outra coisa: com ESTE preço, em quantas vezes refinar sai
 * mais barato. As campanhas simuladas respondem isso direto, e a média fica
 * como referência para quem ainda não tem um preço.
 *
 * Saindo do +0, refinar é comprar outro no +0 e levá-lo até o alvo. Saindo de
 * um refino acima, o item já é seu, e a comparação é só o caminho que falta.
 */
function ComprarPronto({
  plano,
  itemNome,
  itemSlots = 0,
}: {
  plano: ResultadoPlano;
  itemNome?: string | null;
  itemSlots?: number;
}) {
  const [preco, setPreco] = useState(0);
  const i = plano.input;
  const amostras = plano.simulacao!.amostras.custo;
  const base = i.refinoAtual === 0 ? i.precoItem : 0;
  const media = base + plano.custoEsperado;

  const partes = nomeNoJogo(itemNome ?? rotuloCurto(i.kind), i.refinoAlvo, i.grauAlvo, itemSlots);
  const nome = [partes.refino, partes.grau, partes.nome, partes.slots].filter(Boolean).join(' ');

  let refinarGanha: number | null = null;
  if (preco > 0) {
    let n = 0;
    for (let k = 0; k < amostras.length; k++) if (base + amostras[k]! <= preco) n++;
    refinarGanha = n / amostras.length;
  }

  return (
    <div className="mt-4 rounded-xl bg-superficie-baixa p-3.5">
      <div className="md-rotulo-p flex items-center gap-1 text-suave">
        Compensa comprar pronto?
        <Info titulo="Compensa comprar pronto?">
          Compara pagar o preço pedido pelo item já pronto com{' '}
          {i.refinoAtual === 0
            ? `comprar outro no +0 (${zeny(i.precoItem)}) e refiná-lo`
            : `refinar o seu, do +${i.refinoAtual}`}{' '}
          até o alvo. A porcentagem é a fração das campanhas simuladas que gastaram menos que esse
          preço. O item pronto ainda tem a vantagem de não arriscar nada — o preço é aquele, sem
          cauda.
        </Info>
      </div>
      <label className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-2">
        <span className="md-corpo-m min-w-0 flex-1">
          Quanto pedem pelo <strong className="text-texto">{nome}</strong>?
        </span>
        <span className="w-44 shrink-0">
          <NumeroZeny value={preco} onChange={setPreco} placeholder="preço à venda" />
        </span>
      </label>
      <p className="md-corpo-m mt-2 text-suave">
        {refinarGanha === null ? (
          <>
            Refinar custa, em média,{' '}
            <strong className="text-texto tabular-nums" title={zenyExato(media)}>
              {zeny(media)}
            </strong>
            . Abaixo disso, comprar pronto já ganha na média.
          </>
        ) : (
          <>
            Por <span className="tabular-nums">{zeny(preco)}</span>, refinar sai mais barato em{' '}
            <strong className={'tabular-nums ' + (refinarGanha >= 0.5 ? 'text-ok' : 'text-atencao')}>
              {porcento(refinarGanha)}
            </strong>{' '}
            das vezes
            {refinarGanha < 0.5 ? ' — comprar pronto é a aposta melhor' : ''}. Em média, refinar
            custa{' '}
            <span className="tabular-nums" title={zenyExato(media)}>
              {zeny(media)}
            </span>
            .
          </>
        )}
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
      {/* Na margem a contagem é inteira — é a cópia que se compra —, e
          `quantidade` a escreveria "1,0". A média, sem simulação, é fração de
          verdade. */}
      <div className="md-titulo-g mt-1 tabular-nums">
        {naMargem === null ? quantidade(plano.copiasItem) : naMargem.toLocaleString('pt-BR')}
      </div>
      <div className="md-corpo-p mt-1 text-suave">
        {reposicoes <= 0 ? (
          <>Com esse orçamento, o item não quebra.</>
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
 * A legenda clicável dos cinco percentis que morava aqui virou o seletor
 * `NivelDeSeguranca`, logo acima — era a mesma escolha feita em dois lugares.
 */
function Distribuicao({
  custo,
  amostras,
  media,
  margem,
  kit,
}: {
  custo: Percentis;
  /** Custo de cada campanha simulada, cru: é dele que sai a forma da curva. */
  amostras: Float64Array;
  media: number;
  margem: MargemKey;
  /** Valor do kit no mesmo nível, para marcar na mesma régua. */
  kit?: number;
}) {
  const info = MARGENS.find((m) => m.key === margem)!;

  return (
    <CurvaDeCusto
      amostras={amostras}
      media={media}
      escolhida={{ rotulo: info.pct, chance: info.chance, valor: custo[margem] }}
      margens={MARGENS.map((m) => custo[m.key])}
      kit={kit}
    />
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
function PainelDeCompras({
  plano,
  kit,
  margem,
}: {
  plano: ResultadoPlano;
  kit: Kit;
  margem: MargemKey;
}) {
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
            { key: 'compras', rotulo: 'o que comprar', dica: 'O que levar ao mercado, e o que fabricar no NPC com isso.' },
            { key: 'minerios', rotulo: 'por minério', dica: 'O consumo em minério pronto, como o motor conta — conferência do plano.' },
          ]}
        />
      }
    >
      {vista === 'compras' ? (
        <Compras plano={plano} kit={kit} margem={margem} />
      ) : (
        <Materiais plano={plano} kit={kit} />
      )}
    </Painel>
  );
}

const ROTULO_VIA: Record<string, string> = {
  mercado: 'comprar',
  npc: 'fabricar no NPC',
  indisponivel: 'sem preço',
};

function Materiais({ plano, kit }: { plano: ResultadoPlano; kit: Kit }) {
  // Sem simulação o kit É a média, e a segunda coluna só a repetiria.
  const noKit = kit.chance !== null;
  const linhas = Object.entries(plano.recursos.itens)
    .map(([id, media]) => {
      const via = sourcingOf(Number(id), plano.input.precos);
      // O que se fabrica entra desmontado no kit: não há uma quantidade dele
      // pronta para mostrar aqui, e sim a dos insumos, na outra vista.
      const naMargem = !noKit ? null : via === 'npc' ? ('receita' as const) : (kit.itens[Number(id)] ?? 0);
      return { itemId: Number(id), media, naMargem, via };
    })
    .filter((l) => l.media > 0)
    .sort((a, b) => b.media - a.media);

  // Quantas cópias do equipamento a campanha consome: a que você começa
  // segurando, mais uma para cada quebra. É o número que decide se dá para
  // começar hoje — de nada adianta ter minério se falta item para refinar.
  const copiasNaMargem = noKit ? kit.reposicoes + 1 : null;

  return (
    <div>
      {/* O balão fica FORA do `overflow-x-auto`: dentro dele, uma camada
          temporária é recortada pela borda da rolagem. */}
      <TituloDeSecao
        info={
          <Info titulo="Por minério" alinhar="direita">
            Conferência, não decisão: aqui os minérios aparecem prontos, como o motor os conta, e
            não desmontados no que se compra — quem vai ao jogo leva a outra vista. A coluna{' '}
            <strong className="text-texto">no kit</strong> é o “o que ter em mãos” do topo: o
            quanto separar de cada um para nada faltar no nível escolhido. O que se fabrica não tem
            número ali, porque entra no kit pelos insumos. A média é o consumo de uma campanha
            típica.
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
            {noKit && <th className="pb-2 text-right">No kit</th>}
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
              {l.naMargem === 'receita' ? (
                <td className="md-corpo-p py-2 text-right text-suave" title="Entra no kit pelos insumos">
                  pela receita
                </td>
              ) : (
                l.naMargem !== null && (
                  <td className="py-2 text-right font-medium tabular-nums">
                    {Math.ceil(l.naMargem).toLocaleString('pt-BR')}
                  </td>
                )
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
                {copiasNaMargem.toLocaleString('pt-BR')}
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
 * O que comprar de verdade, o que fabricar com isso, e a conta separada por NPC.
 *
 * A lista é o kit no que se compra: o que vale mais a pena fabricar vem
 * desmontado nos insumos, porque o insumo é moeda comum entre receitas — a
 * Pedra de Éter que sobrou do Topázio de Éter vai para o Âmbar de Éter. Contado
 * pronto, cada minério fabricado levava a própria folga, e o kit saía mais caro
 * sem precisar. O que montar com os insumos vem logo abaixo, receita a receita.
 *
 * Os subtotais separam o zeny pelo NPC que o cobra — refinador, Grau e o que
 * fabrica os minérios —, porque cada um se resolve de um jeito: só o último
 * some comprando pronto.
 */
function Compras({ plano, kit, margem }: { plano: ResultadoPlano; kit: Kit; margem: MargemKey }) {
  const linhas = arvoreDeCompras(kit.itens, plano.input.precos);
  const fabricar = fabricacoesDoPlano(plano);
  const materiais = linhas.reduce((s, l) => s + l.total, 0);
  const info = MARGENS.find((m) => m.key === margem)!;

  const quebras = kit.reposicoes;
  const custoReposicao = quebras * plano.input.precoItem;
  const tentativas = Math.round(plano.recursos.tentativas);
  const { refino, grau, balcao } = kit.zenyPorTipo;
  // É o valor do kit, somado pelas mesmas parcelas: o número do topo e o desta
  // lista não podem divergir em um zeny.
  const total = materiais + custoReposicao + kit.taxas;

  return (
    <>
      <TituloDeSecao
        info={
          <Info titulo="O que comprar" alinhar="direita">
            A quantidade em destaque é quanto separar de cada item na margem escolhida. O que vale
            mais a pena fabricar no NPC não aparece pronto: aparece pelo que a receita pede, e a
            receita vem logo abaixo. Assim a sobra de um insumo serve a outra receita, e o kit não
            precisa de uma folga para cada minério fabricado. Os NPCs de fabricar, de Grau e o
            refinador ficam lado a lado, então fabricar não custa viagem.
          </Info>
        }
      >
        O que comprar
      </TituloDeSecao>

      <p className="md-corpo-p text-suave">
        {kit.chance !== null ? (
          <>
            O “o que ter em mãos” do topo: com ele, nada falta em {info.fracao} vezes. O total sai
            acima do custo total em zeny, porque o kit cobre o azar de todos os materiais de uma
            vez.
          </>
        ) : (
          <>O consumo médio da campanha — sem simulação, não há margem para calcular.</>
        )}
      </p>

      <ul className="divide-y divide-borda/60">
        {linhas.map((l) => (
          <LinhaDeCompra key={l.itemId} linha={l} />
        ))}
      </ul>

      {fabricar.length > 0 && (
        <>
          <Divisor />
          <TituloDeSecao
            info={
              <Info titulo="Fabricar no NPC" alinhar="direita">
                O que montar com os insumos da lista, e o que o NPC pede por unidade. A quantidade é
                a média da campanha: o kit não fixa quantos de cada, porque a sobra de um vira o
                insumo do outro. Fabricar é a via quando sai mais barato, quando o pronto é no
                máximo {porcento(TOLERANCIA_FABRICAR)} mais barato, ou quando quase ninguém vende o
                pronto no mercado.
              </Info>
            }
          >
            Fabricar no NPC
          </TituloDeSecao>
          <ul className="divide-y divide-borda/60">
            {fabricar.map((f) => (
              <LinhaDeFabricacao key={f.itemId} fabricacao={f} />
            ))}
          </ul>
        </>
      )}

      <Divisor />

      {/* O que não é material: as taxas, por NPC, e o item destruído. Não é
          lista de compras — é o resto da conta —, então fica separado do que
          se procura numa loja. */}
      <dl className="md-corpo-m space-y-1.5">
        <LinhaDeConta rotulo="Minérios" valor={materiais} />
        {balcao > 0 && <LinhaDeConta rotulo="Taxas para Criação de Minérios" valor={balcao} />}
        {grau > 0 && <LinhaDeConta rotulo="Taxas para Grau" valor={grau} />}
        {refino > 0 && (
          <LinhaDeConta
            rotulo="Taxas de Refino"
            detalhe={`~${tentativas.toLocaleString('pt-BR')} tentativas na média`}
            valor={refino}
          />
        )}
        {quebras > 0 && (
          <LinhaDeConta
            rotulo="Reposição do item quebrado (no +0)"
            detalhe={`${quebras.toLocaleString('pt-BR')}x ${zeny(plano.input.precoItem)}`}
            valor={custoReposicao}
            perigo
          />
        )}
      </dl>

      <div className="mt-3 flex items-baseline justify-between gap-3 border-t border-borda pt-3">
        <span className="md-titulo-m">Total do kit</span>
        <span className="md-titulo-g text-realce tabular-nums" title={zenyExato(total)}>
          {zeny(total)}
        </span>
      </div>
    </>
  );
}

/**
 * Uma receita a fabricar: o que sai, o que o NPC pede por unidade, e por que
 * fabricar em vez de comprar pronto.
 */
function LinhaDeFabricacao({ fabricacao: f }: { fabricacao: Fabricacao }) {
  // Quanto o pronto custa a mais (positivo) ou a menos (negativo) que fabricar.
  const diferenca = f.precoMercado === null ? null : f.precoMercado / f.custoFabricado - 1;

  return (
    <li className="py-2.5">
      <div className="flex items-start gap-2.5">
        <SlotItem id={f.itemId} tamanho="mini" />
        <span className="min-w-0">
          <span className="flex flex-wrap items-baseline gap-x-2">
            <strong className="md-corpo-m text-texto tabular-nums" title="Média da campanha">
              ~{quantidade(f.media)}x
            </strong>
            <span className="md-corpo-m font-medium text-texto">{nomeDoItem(f.itemId)}</span>
          </span>
          <span className="md-corpo-p mt-0.5 block text-suave">
            Cada um:{' '}
            {f.materiais.map((m, i) => (
              <span key={m.itemId}>
                {i > 0 && ' + '}
                <span className="tabular-nums">{m.qtd}x</span> {nomeDoItem(m.itemId)}
              </span>
            ))}
            {f.zeny > 0 && (
              <>
                {' + '}
                <span className="tabular-nums">{zeny(f.zeny)}</span>
              </>
            )}
          </span>
          <span className="md-corpo-p mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-suave">
            {f.motivo === 'pouco-giro' ? (
              <Pastilha tom="atencao">quase ninguém vende pronto</Pastilha>
            ) : f.motivo === 'diferenca-pequena' && diferenca !== null ? (
              <Pastilha>
                <span className="tabular-nums">pronto sai só {porcento(-diferenca)} mais barato</span>
              </Pastilha>
            ) : diferenca !== null && diferenca > 0 ? (
              <Pastilha tom="ok">
                <span className="tabular-nums">
                  economiza {porcento(diferenca / (1 + diferenca))} contra o pronto
                </span>
              </Pastilha>
            ) : null}
            {f.precoMercado === null ? (
              <span>ninguém vende pronto</span>
            ) : (
              <span>
                pronto: <span className="tabular-nums">{zeny(f.precoMercado)}</span> · fabricado:{' '}
                <span className="tabular-nums">{zeny(f.custoFabricado)}</span>
              </span>
            )}
          </span>
        </span>
      </div>
    </li>
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
                {Number.isInteger(linha.qtd) ? inteiro(linha.qtd) : quantidade(linha.qtd)}x
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

      {linha.fabricacao && linha.fabricacao.insumos.length > 0 && (
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

  // Receita sem insumo é a loja do NPC (o Fracon a 200z): compra, não fábrica.
  const loja = linha.via === 'npc' && linha.fabricacao?.insumos.length === 0;
  const fabricando = linha.via === 'npc' && !loja;
  const alternativa = linha.via === 'npc' ? linha.precoMercado : linha.custoFabricado;
  const totalAlternativo = alternativa === null ? null : alternativa * linha.qtd;
  const fracao = totalAlternativo && totalAlternativo > 0 ? linha.economia / totalAlternativo : 0;

  return (
    <span className="md-corpo-p mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-suave">
      {fabricando ? (
        <span>Fabricar no NPC</span>
      ) : loja ? (
        <span>
          {raiz && 'Comprar no NPC · '}
          <span className="tabular-nums">{zeny(linha.custoUnitario)}</span> cada
        </span>
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
        {/* É a média, e diz que é: somadas, as fases dão o custo médio, não
            nenhum dos dois números do topo. */}
        <span className="md-corpo-m text-suave tabular-nums" title={zenyExato(fase.custoEsperado)}>
          {zeny(fase.custoEsperado)} na média
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
              {/* Quantas vezes, em média, a ação do trecho é usada — um minério
                  por tentativa, um cubo por uso. É o "quanto" do "o quê". */}
              {t.tentativas > 0 && (
                <strong className="tabular-nums" title="Em média, numa passada desta fase">
                  ~{quantidade(t.tentativas)}x
                </strong>
              )}
              <span className="font-medium">{t.minerio}</span>
              {/* Um cubo não tem chance nem falha: o que ele faz já é a informação
                  inteira, e "100%" ao lado dele sugeriria uma tentativa. */}
              {t.atalho && (
                <span className="md-corpo-p text-suave">— {t.naFalha}</span>
              )}
              {t.bencaos > 0 && (
                <Pastilha tom="ok">
                  +{t.bencaos} Bênção do Ferreiro por tentativa
                </Pastilha>
              )}
              {!t.atalho && (
                <span className="md-corpo-p text-suave tabular-nums">{porcento(t.chance)}</span>
              )}
              {!t.atalho && t.chance < 1 && (
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
            Cerca de {fase.grau.tentativasEsperadas.toFixed(1).replace('.', ',')} tentativas até
            passar. O sucesso zera o refino de volta para +0.
          </p>
        </div>
      )}

      <ConsumoDaFase consumo={fase.consumo} />

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
              <TabelaDeEstados politica={politica} de={fase.de ?? 0} alvo={fase.para ?? 0} />
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
 * O que a fase gasta de material, em média: a soma dos trechos de cima, mais o
 * que eles não mostram — a Bênção que o martelo cobra por uso, o refino de
 * volta depois de uma queda abaixo do refino de partida.
 */
function ConsumoDaFase({ consumo }: { consumo: Record<number, number> }) {
  const linhas = Object.entries(consumo)
    .map(([id, qtd]) => ({ itemId: Number(id), qtd }))
    .filter((l) => l.qtd > 1e-9)
    .sort((a, b) => b.qtd - a.qtd);
  if (linhas.length === 0) return null;

  return (
    <div className="md-corpo-p mt-3 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-suave">
      <span>Em média, nesta fase:</span>
      {linhas.map((l) => (
        <span key={l.itemId} className="inline-flex items-center gap-1.5">
          <SlotItem id={l.itemId} tamanho="mini" />
          <span>
            <strong className="text-texto tabular-nums">{quantidade(l.qtd)}</strong>{' '}
            {nomeDoItem(l.itemId)}
          </span>
        </span>
      ))}
    </div>
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
