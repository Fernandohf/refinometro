import { useId, useMemo } from 'react';

import type { CategoriaCusto, FluxoDeCusto } from '../engine/fluxoDeCusto';
import { porcento, zeny, zenyExato } from '../format';

/** Fatia pequena: "0%" para 320.000z seria falso, e some com a linha. */
const fatia = (p: number) => (p > 0 && p < 0.01 ? '<1%' : porcento(p));

/**
 * Diagrama de Sankey do custo: total → natureza do gasto → linha comprada.
 *
 * Desenhado à mão em SVG porque a árvore é pequena e o projeto não tem
 * dependência de runtime além do React — uma biblioteca de gráficos aqui
 * pesaria mais que a calculadora inteira.
 *
 * O fluxo é uma ÁRVORE, não um grafo qualquer: cada folha pertence a um grupo
 * só. Isso dispensa o algoritmo de ordenação que um Sankey geral exige e
 * garante que nenhuma fita cruze — as faixas ficam empilhadas na mesma ordem
 * nas três colunas, e a leitura é sempre de cima para baixo.
 */
export function SankeyCusto({ fluxo }: { fluxo: FluxoDeCusto }) {
  const id = useId();
  const layout = useMemo(() => calcular(fluxo), [fluxo]);

  if (layout === null) return null;

  const { altura, faixas, grupos, raiz } = layout;

  return (
    <figure className="m-0">
      <svg
        viewBox={`0 0 ${LARGURA} ${altura}`}
        className="h-auto w-full"
        role="img"
        aria-labelledby={`${id}-t`}
        preserveAspectRatio="xMidYMid meet"
      >
        <title id={`${id}-t`}>
          {`Para onde vai o zeny: ${fluxo.grupos
            .map((g) => `${g.rotulo}, ${zeny(g.valor)}`)
            .join('; ')}.`}
        </title>

        {/* Fitas do total para cada natureza de gasto. */}
        {grupos.map((g) => (
          <path
            key={`fita-${g.categoria}`}
            d={fita(X_RAIZ + L_BARRA, g.topo, X_GRUPO, g.topo, g.altura)}
            fill={`var(${COR[g.categoria]})`}
            opacity={0.4}
          />
        ))}

        {/* Fitas de cada natureza para as linhas que a compõem. */}
        {faixas.map((f) => (
          <path
            key={`fita-${f.id}`}
            d={fita(X_GRUPO + L_BARRA, f.topo, X_FOLHA, f.topo, f.altura)}
            fill={`var(${COR[f.categoria]})`}
            opacity={0.32}
          />
        ))}

        {/* Barra do total. */}
        <rect
          x={X_RAIZ}
          y={raiz.topo}
          width={L_BARRA}
          height={raiz.altura}
          fill="var(--color-realce)"
        />

        {grupos.map((g) => (
          <g key={g.categoria}>
            <rect
              x={X_GRUPO}
              y={g.topo}
              width={L_BARRA}
              height={g.altura}
              fill={`var(${COR[g.categoria]})`}
            />
            {/* O rótulo do grupo só cabe dentro da faixa se a faixa for alta o
                bastante; abaixo disso ele iria por cima do vizinho. */}
            {g.altura >= 22 && (
              <text
                x={X_GRUPO + L_BARRA + 6}
                y={g.topo + g.altura / 2}
                className="fill-[var(--color-texto)] text-[11px] font-medium"
                dominantBaseline="middle"
              >
                {g.rotulo}
                <tspan className="fill-[var(--color-suave)]">
                  {'  '}
                  {fatia(g.valor / fluxo.total)}
                </tspan>
              </text>
            )}
          </g>
        ))}

        {faixas.map((f) => {
          const centro = f.topo + f.altura / 2;
          return (
            <g key={f.id}>
              <rect
                x={X_FOLHA}
                y={f.topo}
                width={L_BARRA}
                height={f.altura}
                fill={`var(${COR[f.categoria]})`}
              />
              {/* Faixa fina empurra o rótulo para longe do próprio bloco; o fio
                  diz de qual bloco ele fala. */}
              {Math.abs(f.rotuloY - centro) > 2 && (
                <polyline
                  points={`${X_FOLHA + L_BARRA},${centro} ${X_FOLHA + L_BARRA + 3},${f.rotuloY} ${X_FOLHA + L_BARRA + 5},${f.rotuloY}`}
                  fill="none"
                  stroke="var(--color-borda)"
                  strokeWidth={0.7}
                />
              )}
              <text
                x={X_FOLHA + L_BARRA + 6}
                y={f.rotuloY}
                className="fill-[var(--color-texto)] text-[11px]"
                dominantBaseline="middle"
              >
                {f.rotulo}
                <tspan className="fill-[var(--color-suave)]"> {zeny(f.valor)}</tspan>
              </text>
            </g>
          );
        })}

        <text
          x={X_RAIZ}
          y={raiz.topo - 6}
          className="fill-[var(--color-texto)] text-[11px] font-medium"
        >
          {zeny(fluxo.total)}
        </text>
      </svg>
    </figure>
  );
}

/* ------------------------------------------------------------------ layout */

const LARGURA = 620;
const L_BARRA = 10;
const X_RAIZ = 0;
const X_GRUPO = 150;
const X_FOLHA = 300;
/** Espaço entre duas linhas do mesmo grupo. */
const VAO = 3;
/** Espaço a mais entre grupos, para a divisão ser visível. */
const VAO_GRUPO = 12;
/** Altura mínima de uma faixa: abaixo disso ela some da tela. */
const MIN_FAIXA = 3;
/** Distância mínima entre dois rótulos, para nenhum pisar no outro. */
const SEPARACAO_ROTULO = 13;
const TOPO = 18;
const BASE = 8;
/** Altura de referência: cresce com o número de linhas, para o rótulo caber. */
const ALTURA_POR_FOLHA = 26;

interface Faixa {
  id: string;
  rotulo: string;
  valor: number;
  categoria: CategoriaCusto;
  topo: number;
  altura: number;
  /**
   * Onde o rótulo é desenhado. Costuma ser o centro da faixa, mas duas faixas
   * de 3px vizinhas teriam os rótulos um por cima do outro — então o texto se
   * afasta e um fio liga os dois.
   */
  rotuloY: number;
}

interface Layout {
  altura: number;
  raiz: { topo: number; altura: number };
  grupos: { categoria: CategoriaCusto; rotulo: string; valor: number; topo: number; altura: number }[];
  faixas: Faixa[];
}

/**
 * Empilha as faixas de cima para baixo, na ordem dos grupos.
 *
 * As três colunas usam a MESMA pilha: um grupo ocupa exatamente o intervalo
 * vertical das suas folhas, e o total ocupa o de todos. É o que faz as fitas
 * saírem horizontais e nenhuma cruzar com outra — a única leitura possível
 * passa a ser a certa.
 */
function calcular(fluxo: FluxoDeCusto): Layout | null {
  if (fluxo.total <= 0 || fluxo.grupos.length === 0) return null;

  const nFolhas = fluxo.grupos.reduce((s, g) => s + g.folhas.length, 0);
  // Os vãos NÃO saem da altura das faixas: são somados por fora, e o SVG cresce.
  // Descontá-los faria a faixa encolher conforme o plano ganha linhas, e duas
  // margens diferentes deixariam de ser comparáveis a olho.
  const escala = Math.max(nFolhas * ALTURA_POR_FOLHA, 120) / fluxo.total;

  const faixas: Faixa[] = [];
  const grupos: Layout['grupos'] = [];
  let y = TOPO;

  for (const [i, g] of fluxo.grupos.entries()) {
    if (i > 0) y += VAO_GRUPO;
    const topoGrupo = y;

    for (const [j, f] of g.folhas.entries()) {
      if (j > 0) y += VAO;
      const altura = Math.max(MIN_FAIXA, f.valor * escala);
      faixas.push({ ...f, topo: y, altura, rotuloY: y + altura / 2 });
      y += altura;
    }

    grupos.push({
      categoria: g.categoria,
      rotulo: g.rotulo,
      valor: g.valor,
      topo: topoGrupo,
      altura: y - topoGrupo,
    });
  }

  // Passe de desempilhamento dos rótulos: de cima para baixo, cada um cede o
  // mínimo para não encostar no anterior. As FAIXAS não se mexem — mover a
  // faixa distorceria a proporção, que é a única coisa que o desenho afirma.
  let ultimo = -Infinity;
  let grupoAnterior: CategoriaCusto | null = null;
  for (const f of faixas) {
    // Na virada de grupo o rótulo abre o mesmo vão que a faixa: sem isso a
    // última linha de um grupo e a primeira do seguinte colam, e a divisão que
    // o desenho existe para mostrar desaparece justo na coluna de texto.
    const minimo =
      grupoAnterior !== null && grupoAnterior !== f.categoria
        ? SEPARACAO_ROTULO + VAO_GRUPO / 2
        : SEPARACAO_ROTULO;
    f.rotuloY = Math.max(f.rotuloY, ultimo + minimo);
    ultimo = f.rotuloY;
    grupoAnterior = f.categoria;
  }

  return {
    // O último rótulo pode ter sido empurrado para além da última faixa.
    altura: Math.max(y, ultimo + SEPARACAO_ROTULO / 2) + BASE,
    raiz: { topo: TOPO, altura: y - TOPO },
    grupos,
    faixas,
  };
}

/** Fita de ligação: uma curva suave entre dois pares de pontos. */
function fita(x0: number, y0: number, x1: number, y1: number, altura: number): string {
  const meio = (x0 + x1) / 2;
  return [
    `M${x0},${y0}`,
    `C${meio},${y0} ${meio},${y1} ${x1},${y1}`,
    `L${x1},${y1 + altura}`,
    `C${meio},${y1 + altura} ${meio},${y0 + altura} ${x0},${y0 + altura}`,
    'Z',
  ].join(' ');
}

const COR: Record<CategoriaCusto, string> = {
  // Verde: é o gasto que EVITA perda — a mesma cor que a Bênção já tem no
  // painel de estratégia.
  protecao: '--color-ok',
  // Vermelho: é o equipamento sendo destruído, e a tela inteira já pinta quebra
  // de vermelho.
  item: '--color-perigo',
  materiais: '--color-realce',
  // Bronze: preparar o minério é parente de comprá-lo, e a cor diz isso sem
  // deixar as duas faixas se confundirem.
  fabricacao: '--color-bronze',
  // Cinza: a taxa não se negocia com fornecedor nenhum, então não compete por
  // atenção com os grupos em que dá para agir.
  refino: '--color-suave',
};

/** Tabela equivalente ao desenho, para quem lê por número e não por faixa. */
export function ResumoDoFluxo({ fluxo }: { fluxo: FluxoDeCusto }) {
  return (
    <dl className="mt-2 grid gap-x-4 gap-y-1 text-xs sm:grid-cols-2">
      {fluxo.grupos.map((g) => (
        <div key={g.categoria} className="flex items-baseline justify-between gap-2">
          <dt className="flex items-center gap-1.5">
            <span
              aria-hidden
              className="inline-block size-2.5 shrink-0"
              style={{ background: `var(${COR[g.categoria]})` }}
            />
            {g.rotulo}
          </dt>
          <dd className="tabular-nums" title={zenyExato(g.valor)}>
            {zeny(g.valor)}{' '}
            <span className="text-suave">({fatia(g.valor / fluxo.total)})</span>
          </dd>
        </div>
      ))}
    </dl>
  );
}
