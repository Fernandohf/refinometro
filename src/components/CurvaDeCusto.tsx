import { useId, useMemo } from 'react';

import { porcento, zeny, zenyExato } from '../format';

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

  // Dentro do limite seguro da categoria nenhuma tentativa falha, então toda
  // campanha custa exatamente o mesmo. Um gráfico de uma barra só não diria
  // nada; a frase diz.
  if (limite <= 0 || amostras.length === 0 || limite <= piso) {
    return (
      <p className="mt-4 text-xs leading-relaxed text-suave">
        Não há distribuição a desenhar: neste alvo nenhuma tentativa pode falhar, então toda
        campanha custa os mesmos {zenyExato(limite)}. A margem de segurança só tem o que fazer
        quando existe azar.
      </p>
    );
  }

  const escala = (v: number) => Math.max(0, Math.min(X_LIMITE, (v / limite) * X_LIMITE));
  const xPonto = escala(escolhida.valor);
  const xMedia = escala(media);
  const mediaAlemDaEscala = media > limite;
  const { area, linha } = caminhos(curva);

  // O rótulo acompanha o ponto, então perto das bordas ele precisa virar para
  // dentro — senão sai do desenho justamente nas margens extremas.
  const ancora = xPonto < 70 ? 'start' : xPonto > LARGURA - 90 ? 'end' : 'middle';
  const dx = ancora === 'start' ? -5 : ancora === 'end' ? 5 : 0;

  return (
    <figure className="m-0 mt-5">
      <svg
        viewBox={`0 0 ${LARGURA} ${ALTURA_VB}`}
        className="h-auto w-full"
        role="img"
        aria-labelledby={`${id}-t`}
        preserveAspectRatio="xMidYMid meet"
      >
        <title id={`${id}-t`}>
          {`Distribuição do custo em ${amostras.length.toLocaleString('pt-BR')} campanhas simuladas. ` +
            `A margem escolhida, ${escolhida.rotulo.toLowerCase()}, cai em ${zenyExato(escolhida.valor)} ` +
            `e cobre ${porcento(escolhida.chance)} delas. O custo médio é ${zenyExato(media)}.`}
        </title>

        {/* A parte acesa é a mesma curva recortada na altura do ponto, e o
            recorte anda com ele: uma transformação só move a fronteira e a marca. */}
        <clipPath id={`${id}-ate`}>
          <rect
            x={-LARGURA}
            y={0}
            width={LARGURA}
            height={ALTURA_VB}
            style={{ transform: `translateX(${xPonto}px)`, transition: TRANSICAO }}
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
            representa — e por que as últimas ficam tão espremidas. */}
        {margens.map((v) => (
          <line
            key={v}
            x1={escala(v)}
            x2={escala(v)}
            y1={BASE}
            y2={BASE + 3.5}
            stroke="var(--color-borda)"
            strokeWidth={0.8}
          />
        ))}

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

        {/* O ponto: a leitura da margem escolhida sobre a distribuição. */}
        <g style={{ transform: `translateX(${xPonto}px)`, transition: TRANSICAO }}>
          <line x1={0} x2={0} y1={22} y2={BASE} stroke="var(--color-realce)" strokeWidth={1.2} />
          <circle cx={0} cy={22} r={3.5} fill="var(--color-realce)" />
          <text
            x={dx}
            y={12}
            textAnchor={ancora}
            className="fill-[var(--color-realce)] text-[11px] font-semibold"
          >
            {zeny(escolhida.valor)}
            {/* `dx` e não um espaço no texto: o SVG colapsa espaços, e os dois
                números coloriam um só bloco ilegível ("450,1 mi z 99%"). */}
            <tspan dx={5} className="fill-[var(--color-suave)] font-normal">
              {porcento(escolhida.chance)}
            </tspan>
          </text>
        </g>
      </svg>

      <figcaption className="mt-1 text-xs leading-relaxed text-suave">
        Cada faixa é a fatia das campanhas simuladas que custou aquilo. A área acesa vai até o
        orçamento escolhido: são {porcento(escolhida.chance)} das campanhas, e é exatamente isso que
        a margem compra.{' '}
        {curva.cauda > 0 ? (
          <>
            O bloco solto na ponta é a cauda — {porcento(curva.cauda, 1)} das campanhas passam de{' '}
            {zeny(limite)}, algumas muito além, e é ela que puxa a média para a direita da mediana.
          </>
        ) : (
          <>É a cauda à direita que puxa a média para longe da mediana.</>
        )}
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
}

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
  let pico = 0;
  for (let i = 0; i < N_FAIXAS; i++) {
    faixas[i]! /= total;
    if (faixas[i]! > pico) pico = faixas[i]!;
  }

  return { faixas, pico: pico || 1, cauda: cauda / total };
}

/**
 * O contorno do histograma em degraus, e não numa curva suavizada.
 *
 * Suavizar inventaria valores dentro de cada faixa: a amostragem não sabe o que
 * acontece lá dentro, e a escada é o que ela de fato mediu.
 */
function caminhos({ faixas, pico }: Histograma): { area: string; linha: string } {
  const passo = X_LIMITE / N_FAIXAS;
  const y = (f: number) => (BASE - (f / pico) * (BASE - TOPO)).toFixed(2);

  let degraus = '';
  for (let i = 0; i < N_FAIXAS; i++) {
    const altura = y(faixas[i]!);
    degraus += ` L${(i * passo).toFixed(2)},${altura} L${((i + 1) * passo).toFixed(2)},${altura}`;
  }

  return {
    area: `M0,${BASE}${degraus} L${X_LIMITE},${BASE} Z`,
    linha: `M0,${y(faixas[0]!)}${degraus}`,
  };
}
