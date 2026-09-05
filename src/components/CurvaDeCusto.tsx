import { useId, useMemo, useState, type KeyboardEvent, type PointerEvent } from 'react';

import { chanceAte } from '../engine/simulate';
import { porcento, zeny, zenyExato } from '../format';
import { Info } from './ui';

/**
 * Largura do desenho em unidades do viewBox. O SVG é responsivo — o número só
 * fixa a proporção entre as partes.
 */
const LARGURA = 400;
/** Topo e base da área do gráfico. Acima do topo mora o rótulo do ponto. */
const TOPO = 28;
const BASE = 98;
const ALTURA_VB = 126;

/** Faixas do histograma dentro da escala. */
const N_FAIXAS = 48;
/** Bloco solto na ponta direita: tudo que passa do limite da escala. */
const L_CAUDA = 10;
/** Respiro entre a curva e a cauda — é ali que a escala se rompe. */
const VAO = 4;
/** Onde o custo limite cai no desenho. */
const X_LIMITE = LARGURA - L_CAUDA - VAO;

/** O ponto desliza de uma margem à outra: o pulo entre elas é a informação. */
const TRANSICAO = 'transform 220ms cubic-bezier(0.22, 1, 0.36, 1)';

/**
 * Quanto uma seta do teclado anda pela escala: uma faixa do histograma.
 *
 * No cursor a leitura é contínua, porque o dedo e o mouse já apontam onde
 * querem. No teclado ela precisa de um passo, e a faixa é o único passo com
 * significado no desenho — é a menor diferença que ele chega a mostrar.
 */
const PASSO_TECLA = X_LIMITE / N_FAIXAS;

/** A margem escolhida, já resolvida em chance e em zeny. */
export interface PontoDaCurva {
  /** Como a margem se chama na tela: "Mediana", "90%". */
  rotulo: string;
  /** Fração das campanhas que ela cobre. */
  chance: number;
  /** Custo naquele percentil. */
  valor: number;
}

/**
 * A distribuição do custo, desenhada — e a margem escolhida como um ponto sobre ela.
 *
 * O painel já diz o número da margem, mas um número sozinho não mostra o que é
 * caro nesta calculadora: a distribuição do custo de refino é torta, com uma
 * cauda longa à direita. É daí que vêm a média acima da mediana e o salto
 * desproporcional de 90% para 99% — duas coisas que se veem de relance no
 * desenho e não se deduzem de cinco números numa fila.
 *
 * Como toda faixa tem a mesma largura, ÁREA é probabilidade: a parte acesa, à
 * esquerda do ponto, é literalmente a fatia das campanhas que o orçamento
 * escolhido cobre. Trocar a margem move o ponto e a fronteira da área junto.
 *
 * Desenhado à mão em SVG pelo mesmo motivo do Sankey (ver `SankeyCusto`): uma
 * biblioteca de gráficos pesaria mais que a calculadora inteira.
 */
export function CurvaDeCusto({
  amostras,
  media,
  escolhida,
  margens,
}: {
  /** Custo de cada campanha simulada, cru — ver `AmostrasCampanha`. */
  amostras: Float64Array;
  /** Custo médio exato, da cadeia de Markov. Não sai da amostragem. */
  media: number;
  /** A margem selecionada: é onde o ponto pousa. */
  escolhida: PontoDaCurva;
  /** Todas as margens oferecidas, para marcar no eixo aonde o ponto pode pular. */
  margens: number[];
}) {
  const id = useId();
  /** A escala termina no maior percentil oferecido: além dele fica a cauda. */
  const limite = Math.max(...margens, escolhida.valor);
  const piso = Math.min(...margens);

  const curva = useMemo(() => histograma(amostras, limite), [amostras, limite]);

  /**
   * Onde o cursor está lendo, em unidades do viewBox — `null` quando ninguém
   * aponta e o desenho volta a mostrar a margem escolhida.
   */
  const [lidoX, setLidoX] = useState<number | null>(null);

  // Ordenar uma vez. A leitura responde "quantas campanhas custaram até aqui?"
  // a cada movimento do cursor, e numa amostra ordenada isso é uma busca
  // binária; reordenar as 5 mil a cada pixel percorrido custaria mil vezes mais
  // que a resposta.
  const ordenado = useMemo(() => Float64Array.from(amostras).sort(), [amostras]);

  // Dentro do limite seguro da categoria nenhuma tentativa falha, então toda
  // campanha custa exatamente o mesmo. Um gráfico de uma barra só não diria
  // nada; a frase diz.
  if (limite <= 0 || amostras.length === 0 || limite <= piso) {
    return (
      <p className="md-corpo-p mt-4 text-suave">
        Não há distribuição a desenhar: neste alvo nenhuma tentativa pode falhar, então toda
        campanha custa os mesmos {zenyExato(limite)}. A margem de segurança só tem o que fazer
        quando existe azar.
      </p>
    );
  }

  const escala = (v: number) => Math.max(0, Math.min(X_LIMITE, (v / limite) * X_LIMITE));
  const xMedia = escala(media);
  const mediaAlemDaEscala = media > limite;
  const { area, linha } = caminhos(curva);

  // O ponto tem dois donos: a margem escolhida no painel e, enquanto alguém
  // aponta, o cursor. É o mesmo ponto nos dois casos — apontar não abre uma
  // leitura paralela ao lado, move a que já estava lá. Assim não há nada novo a
  // aprender: o rótulo continua dizendo um orçamento e a fatia que ele cobre.
  const lendo = lidoX !== null;
  const xPonto = lendo ? lidoX : escala(escolhida.valor);
  const valor = lendo ? (lidoX / X_LIMITE) * limite : escolhida.valor;
  const chance = lendo ? chanceAte(ordenado, valor) : escolhida.chance;

  /** Onde o ponteiro caiu, na régua do viewBox. */
  const xDoPonteiro = (ev: PointerEvent<SVGSVGElement>) => {
    const caixa = ev.currentTarget.getBoundingClientRect();
    // O SVG preserva a proporção do viewBox, então largura desenhada e largura
    // do viewBox são a mesma régua em escalas diferentes — uma divisão basta.
    return Math.max(0, Math.min(X_LIMITE, ((ev.clientX - caixa.left) / caixa.width) * LARGURA));
  };

  const teclado = (ev: KeyboardEvent<SVGSVGElement>) => {
    const atual = lidoX ?? escala(escolhida.valor);
    // Sair pelo Esc devolve o desenho à margem escolhida: a leitura é uma
    // visita, e toda camada temporária desta interface tem essa saída.
    const destino =
      ev.key === 'ArrowRight' ? Math.min(X_LIMITE, atual + PASSO_TECLA)
      : ev.key === 'ArrowLeft' ? Math.max(0, atual - PASSO_TECLA)
      : ev.key === 'Home' ? 0
      : ev.key === 'End' ? X_LIMITE
      : ev.key === 'Escape' ? null
      : undefined;
    if (destino === undefined) return;
    // As setas rolariam a página por baixo da leitura.
    ev.preventDefault();
    setLidoX(destino);
  };

  // O rótulo acompanha o ponto, então perto das bordas ele precisa virar para
  // dentro — senão sai do desenho justamente nas margens extremas.
  const ancora = xPonto < 70 ? 'start' : xPonto > LARGURA - 90 ? 'end' : 'middle';
  const dx = ancora === 'start' ? -5 : ancora === 'end' ? 5 : 0;

  return (
    <figure className="m-0 mt-5">
      {/* Continua sendo uma imagem para quem lê por leitor de tela — o `title`
          abaixo já conta a distribuição inteira em uma frase. O `tabIndex` é
          para quem navega por teclado poder correr a leitura com as setas; um
          `slider` seria mentira, porque apontar aqui não muda nada, só lê.

          `touch-pan-y` deixa a rolagem vertical passar direto: no celular o
          dedo arrastado de lado lê o gráfico, e arrastado para cima rola a
          página, como faria em qualquer outro trecho dela. */}
      <svg
        viewBox={`0 0 ${LARGURA} ${ALTURA_VB}`}
        className="h-auto w-full cursor-crosshair touch-pan-y"
        role="img"
        tabIndex={0}
        aria-labelledby={`${id}-t`}
        preserveAspectRatio="xMidYMid meet"
        onPointerMove={(ev) => setLidoX(xDoPonteiro(ev))}
        onPointerDown={(ev) => {
          // Capturar o ponteiro segura a leitura mesmo quando o dedo passa da
          // borda do desenho — arrastar até o fim da cauda é o gesto natural.
          ev.currentTarget.setPointerCapture(ev.pointerId);
          setLidoX(xDoPonteiro(ev));
        }}
        onPointerUp={(ev) => {
          ev.currentTarget.releasePointerCapture(ev.pointerId);
          // O mouse continua pousado sobre o desenho e segue lendo; o dedo, ao
          // soltar, não está mais em lugar nenhum, e uma leitura congelada ali
          // mentiria sobre a margem escolhida no painel de baixo.
          if (ev.pointerType !== 'mouse') setLidoX(null);
        }}
        onPointerLeave={() => setLidoX(null)}
        onPointerCancel={() => setLidoX(null)}
        onKeyDown={teclado}
        onBlur={() => setLidoX(null)}
      >
        <title id={`${id}-t`}>
          {`Distribuição do custo em ${amostras.length.toLocaleString('pt-BR')} campanhas simuladas. ` +
            `A margem escolhida, ${escolhida.rotulo.toLowerCase()}, cai em ${zenyExato(escolhida.valor)} ` +
            `e cobre ${porcento(escolhida.chance)} delas. O custo médio é ${zenyExato(media)}. ` +
            'Aponte o desenho, ou use as setas, para ler qualquer outro orçamento.'}
        </title>

        {/* A parte acesa é a mesma curva recortada na altura do ponto, e o
            recorte anda com ele: uma transformação só move a fronteira e a marca. */}
        <clipPath id={`${id}-ate`}>
          <rect
            x={-LARGURA}
            y={0}
            width={LARGURA}
            height={ALTURA_VB}
            style={{ transform: `translateX(${xPonto}px)`, transition: lendo ? 'none' : TRANSICAO }}
          />
        </clipPath>

        <path d={area} fill="var(--color-realce)" opacity={0.12} />
        <path d={area} fill="var(--color-realce)" opacity={0.42} clipPath={`url(#${id}-ate)`} />
        <path d={linha} fill="none" stroke="var(--color-realce)" strokeWidth={1} opacity={0.75} />

        {/* A cauda não cabe na escala — esticá-la até o pior caso achataria todo
            o resto num traço. Fica como um bloco à parte, depois do vão: são
            poucas campanhas, e nenhuma margem da tela as cobre. */}
        {curva.cauda > 0 && (
          <rect
            x={X_LIMITE + VAO}
            y={BASE - (curva.cauda / curva.pico) * (BASE - TOPO)}
            width={L_CAUDA}
            height={(curva.cauda / curva.pico) * (BASE - TOPO)}
            fill="var(--color-perigo)"
            opacity={0.45}
          >
            <title>{`${porcento(curva.cauda, 1)} das campanhas custam mais que ${zenyExato(limite)}`}</title>
          </rect>
        )}

        <line x1={0} x2={LARGURA} y1={BASE} y2={BASE} stroke="var(--color-borda)" strokeWidth={0.8} />

        {/* Onde estão as outras margens: mostra de antemão o pulo que cada uma
            representa — e por que as últimas ficam tão espremidas. A escolhida
            fica acesa entre elas, porque enquanto o cursor lê outro ponto ela é
            a única coisa no desenho que ainda diz o que o painel selecionou. */}
        {margens.map((v) => {
          const daVez = v === escolhida.valor;
          return (
            <line
              key={v}
              x1={escala(v)}
              x2={escala(v)}
              y1={BASE}
              y2={BASE + (daVez ? 5 : 3.5)}
              stroke={daVez ? 'var(--color-realce)' : 'var(--color-borda)'}
              strokeWidth={daVez ? 1.2 : 0.8}
            />
          );
        })}

        {/* O custo médio, para poder ser comparado com a mediana sem sair da tela. */}
        <g style={{ transform: `translateX(${xMedia}px)` }}>
          <line
            x1={0}
            x2={0}
            y1={TOPO + 4}
            y2={BASE}
            stroke="var(--color-texto)"
            strokeWidth={0.9}
            strokeDasharray="2 3"
            opacity={0.55}
          >
            <title>{`Custo médio: ${zenyExato(media)}`}</title>
          </line>
          <text
            x={0}
            y={109}
            textAnchor={xMedia > LARGURA - 40 ? 'end' : xMedia < 24 ? 'start' : 'middle'}
            className="fill-[var(--color-suave)] text-[8px]"
          >
            {mediaAlemDaEscala ? 'média →' : 'média'}
          </text>
        </g>

        <text x={0} y={121} className="fill-[var(--color-suave)] text-[9px]">
          0
        </text>
        {/* Na margem de 99% o ponto pousa no fim da escala e já diz este mesmo
            número — repeti-lo logo abaixo só duplicaria a leitura. */}
        {xPonto < X_LIMITE - 40 && (
          <text x={X_LIMITE} y={121} textAnchor="end" className="fill-[var(--color-suave)] text-[9px]">
            {zeny(limite)}
          </text>
        )}

        {/* O ponto: a leitura — do painel ou do cursor — sobre a distribuição.
            Pulando entre margens ele desliza, porque o pulo é a informação;
            seguindo o cursor ele não pode deslizar, ou chegaria sempre um passo
            atrás do dedo. */}
        <g style={{ transform: `translateX(${xPonto}px)`, transition: lendo ? 'none' : TRANSICAO }}>
          <line x1={0} x2={0} y1={22} y2={BASE} stroke="var(--color-realce)" strokeWidth={1.2} />
          <circle cx={0} cy={22} r={3.5} fill="var(--color-realce)" />
          <text
            x={dx}
            y={12}
            textAnchor={ancora}
            className="fill-[var(--color-realce)] text-[11px] font-semibold"
          >
            {zeny(valor)}
            {/* `dx` e não um espaço no texto: o SVG colapsa espaços, e os dois
                números coloriam um só bloco ilegível ("450,1 mi z 99%"). */}
            <tspan dx={5} className="fill-[var(--color-suave)] font-normal">
              {porcento(chance)}
            </tspan>
          </text>
        </g>
      </svg>

      {/* O rótulo do ponto é um número desenhado, e desenho não se lê em voz
          alta: quem corre a curva pelas setas precisa ouvir onde chegou. */}
      <p className="sr-only" aria-live="polite">
        {lendo ? `${zenyExato(valor)} cobre ${porcento(chance)} das campanhas.` : ''}
      </p>

      {/* A legenda explica o desenho, e um desenho explicado uma vez fica
          explicado. Impressa, ela ocupava mais altura que o gráfico — e o
          gráfico é que responde a pergunta. */}
      <figcaption className="md-corpo-p mt-1 flex items-center gap-1 text-suave">
        A área acesa cobre {porcento(chance)} das campanhas simuladas.
        <Info titulo="Como ler esta curva">
          Cada faixa é a fatia das campanhas simuladas que custou aquilo. A área acesa vai até o
          orçamento escolhido: são {porcento(escolhida.chance)} das campanhas, e é exatamente isso
          que a margem compra. Apontar o desenho — com o cursor, com o dedo ou com as setas do
          teclado — lê qualquer outro orçamento, e não só as cinco margens da lista.{' '}
          {!curva.alisada && (
            <>
              Os degraus separados são os itens destruídos: cada quebra soma o preço de um item de
              uma vez só, e os custos que ficam no vão entre um degrau e o seguinte não acontecem.{' '}
            </>
          )}
          {curva.cauda > 0 ? (
            <>
              O bloco solto na ponta é a cauda — {porcento(curva.cauda, 1)} das campanhas passam de{' '}
              {zeny(limite)}, algumas muito além, e é ela que puxa a média para a direita da
              mediana.
            </>
          ) : (
            <>É a cauda à direita que puxa a média para longe da mediana.</>
          )}
        </Info>
      </figcaption>
    </figure>
  );
}

/** Uma distribuição já contada em faixas de mesma largura. */
interface Histograma {
  /** Fração das campanhas em cada faixa. */
  faixas: Float64Array;
  /** Maior fração — é ela que vira a altura cheia do desenho. */
  pico: number;
  /** Fração das campanhas acima do limite da escala. */
  cauda: number;
  /** `true` quando as faixas foram alisadas — ver `VAZIAS_PARA_ALISAR`. */
  alisada: boolean;
}

/**
 * Quanta faixa vazia ainda passa por distribuição contínua.
 *
 * Custo de campanha não é contínuo: cada item destruído soma o preço de um item
 * de uma vez só, então o custo se junta em blocos — "não quebrou nenhum",
 * "quebrou um", "quebrou dois" — separados por valores que simplesmente não
 * acontecem. Num alvo barato os blocos são estreitos e o vão entre eles é
 * enorme: no +7 de uma arma nível 4, 30 das 48 faixas ficam vazias e o desenho
 * vira uma cerca de estacas. Num alvo caro os blocos se encavalam até virar uma
 * curva de verdade — do +8 para cima medi no máximo três faixas vazias, e ainda
 * assim lá na cauda.
 *
 * O corte separa os dois casos com uma folga larga: 6% de faixas vazias de um
 * lado, 63% do outro. Ele decide se cabe alisar, e a distinção importa: no caso
 * denso o serrilhado é ruído de amostragem e alisar não perde nada; no caso
 * ralo os degraus SÃO a informação, e alisar desenharia uma rampa contínua por
 * cima de custos impossíveis.
 */
const VAZIAS_PARA_ALISAR = 0.15;

/**
 * Passadas do filtro [1,2,1] sobre as faixas.
 *
 * São 5 mil campanhas guardadas em 48 faixas — umas 100 por faixa no meio da
 * distribuição, o que dá cerca de 10% de erro de amostragem em cada uma. Esse é
 * o serrilhado que se vê. Cada passada corta o ruído em ~0,61; duas deixam em
 * torno de 4%, borrando só a escala de duas faixas, onde a distribuição não tem
 * nenhum detalhe real a perder.
 */
const PASSADAS = 2;

function histograma(amostras: Float64Array, limite: number): Histograma {
  const faixas = new Float64Array(N_FAIXAS);
  let cauda = 0;

  for (const v of amostras) {
    if (v > limite) {
      cauda++;
      continue;
    }
    const i = Math.min(N_FAIXAS - 1, Math.max(0, Math.floor((v / limite) * N_FAIXAS)));
    faixas[i]! += 1;
  }

  const total = Math.max(1, amostras.length);
  let vazias = 0;
  for (let i = 0; i < N_FAIXAS; i++) {
    if (faixas[i] === 0) vazias++;
    faixas[i]! /= total;
  }

  // Contadas ANTES de alisar: depois de uma passada quase nenhuma faixa é zero,
  // e o teste não teria mais o que medir.
  const alisada = vazias / N_FAIXAS < VAZIAS_PARA_ALISAR;
  if (alisada) for (let p = 0; p < PASSADAS; p++) alisar(faixas);

  let pico = 0;
  for (let i = 0; i < N_FAIXAS; i++) if (faixas[i]! > pico) pico = faixas[i]!;

  return { faixas, pico: pico || 1, cauda: cauda / total, alisada };
}

/**
 * Uma passada do filtro [1,2,1] sobre as faixas, no lugar.
 *
 * Nas pontas a faixa de fora repete a de dentro em vez de valer zero. Tratá-la
 * como zero jogaria massa para fora do desenho e afundaria justamente a primeira
 * faixa — que é onde mora o piso, o custo da campanha em que nada deu errado.
 */
function alisar(faixas: Float64Array) {
  let anterior = faixas[0]!;
  for (let i = 0; i < faixas.length; i++) {
    const atual = faixas[i]!;
    const proxima = faixas[i + 1] ?? atual;
    faixas[i] = (anterior + 2 * atual + proxima) / 4;
    anterior = atual;
  }
}

/**
 * O contorno do histograma: curva onde a amostragem é densa, degraus onde não é.
 *
 * A escada é o que a amostragem de fato mediu, e onde os degraus são grandes ela
 * é a única leitura honesta — cada bloco é um item destruído a mais, e o vão
 * entre dois blocos é custo que não pode acontecer. Arredondar aquilo inventaria
 * valores impossíveis no lugar da estrutura mais importante de um alvo barato.
 *
 * Já onde as faixas se encostam, o serrilhado que sobra não é a distribuição:
 * é o erro de amostragem das 5 mil campanhas guardadas. Ali a escada desenha
 * ruído com a mesma tinta com que desenha a forma, e a curva mostra melhor o que
 * foi medido. `VAZIAS_PARA_ALISAR` decide em qual dos dois casos estamos.
 */
function caminhos({ faixas, pico, alisada }: Histograma): { area: string; linha: string } {
  const passo = X_LIMITE / N_FAIXAS;
  const y = (f: number) => BASE - (f / pico) * (BASE - TOPO);
  const corpo = alisada ? curva(faixas, passo, y) : degraus(faixas, passo, y);

  // O corpo começa com um `L` até (0, altura da primeira faixa): partindo da
  // base ele fecha o flanco esquerdo da área, e partindo do próprio ponto não
  // desenha nada. Um corpo só serve às duas.
  return {
    area: `M0,${BASE}${corpo} L${X_LIMITE},${BASE} Z`,
    linha: `M0,${y(faixas[0]!).toFixed(2)}${corpo}`,
  };
}

function degraus(faixas: Float64Array, passo: number, y: (f: number) => number): string {
  let d = '';
  for (let i = 0; i < N_FAIXAS; i++) {
    const altura = y(faixas[i]!).toFixed(2);
    d += ` L${(i * passo).toFixed(2)},${altura} L${((i + 1) * passo).toFixed(2)},${altura}`;
  }
  return d;
}

/**
 * A mesma contagem, ligada por quadráticas em vez de cantos retos.
 *
 * Cada faixa vira um ponto no seu meio — é ali que a contagem dela vale — e a
 * curva passa pelos meios-caminhos entre pontos vizinhos, usando o próprio ponto
 * como controle. Uma quadrática nunca sai do triângulo dos seus três pontos, e
 * é isso que segura o desenho: a curva não pode estourar acima do pico nem
 * mergulhar abaixo de zero entre duas faixas, que é o defeito clássico de
 * suavizar histograma com spline.
 */
function curva(faixas: Float64Array, passo: number, y: (f: number) => number): string {
  const xs = [0];
  const ys = [y(faixas[0]!)];
  for (let i = 0; i < N_FAIXAS; i++) {
    xs.push((i + 0.5) * passo);
    ys.push(y(faixas[i]!));
  }
  // Âncoras nas bordas: sem elas a meia-faixa de cada ponta ficaria de fora e a
  // área não fecharia rente ao eixo.
  xs.push(X_LIMITE);
  ys.push(y(faixas[N_FAIXAS - 1]!));

  const n = (v: number) => v.toFixed(2);
  let d = ` L${n(xs[0]!)},${n(ys[0]!)}`;
  for (let i = 1; i < xs.length - 1; i++) {
    d += ` Q${n(xs[i]!)},${n(ys[i]!)} ${n((xs[i]! + xs[i + 1]!) / 2)},${n((ys[i]! + ys[i + 1]!) / 2)}`;
  }
  return d + ` L${n(xs[xs.length - 1]!)},${n(ys[ys.length - 1]!)}`;
}
