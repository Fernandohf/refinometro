import type { ReactNode } from 'react';

import { nomeDoItem } from '../data/nomes';
import { listaDeCompras, sourcingOf } from '../engine/pricing';
import { fluxoDeCusto, quantidadesNaMargem } from '../engine/fluxoDeCusto';
import type { Aviso, PlanoDeFase, Resultado as ResultadoPlano } from '../engine/plan';
import type { Percentis } from '../engine/types';
import { ROTULO_GRAU, rotuloCurto } from '../data/rotulos';
import { CartaoItem } from './ItemNoJogo';
import { CadeiaDeDecisoes } from './Cadeia';
import { CurvaDeCusto } from './CurvaDeCusto';
import { ResumoDoFluxo, SankeyCusto } from './SankeyCusto';
import { porcento, quantidade, zeny, zenyExato } from '../format';
import { Painel, PainelRecolhivel, Segmentado } from './ui';

export type MargemKey = keyof Percentis;

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
   * Simulador de estoque, encaixado logo depois da lista de compras: "dá com o
   * que eu tenho?" é a pergunta que vem depois de "o que comprar", e ela lê as
   * mesmas quantidades.
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
          <div className="text-xs tracking-wide text-suave uppercase">Orçamento recomendado</div>
          {sim ? (
            <>
              <div
                className="mt-1 text-4xl font-semibold text-realce tabular-nums sm:text-5xl"
                title={zenyExato(sim.custo[margem])}
              >
                {zeny(sim.custo[margem])}
              </div>
              <div className="mt-1 text-sm text-suave">
                Margem de {margemInfo.rotulo.toLowerCase()} — {margemInfo.explica}.
              </div>
            </>
          ) : (
            <>
              {/* Um alvo caro não cabe no passe rápido, mas pode caber no
                  preciso. Chamá-lo de inalcançável antes da hora seria dar um
                  veredito que a simulação longa ainda pode desmentir. */}
              <div
                className={
                  'mt-1 text-4xl font-semibold sm:text-5xl ' +
                  (afinando ? 'text-suave' : 'text-perigo')
                }
              >
                {afinando ? 'calculando…' : 'fora de alcance'}
              </div>
              <div className="mt-1 text-sm text-suave">
                Este alvo pede ~{Math.round(plano.tentativasEsperadas).toLocaleString('pt-BR')}{' '}
                tentativas de refino
                {afinando
                  ? '. A simulação longa está tentando; pode ser que nem ela alcance.'
                  : '. Não há margem que faça sentido calcular.'}
              </div>
            </>
          )}
        </div>

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

      {Object.keys(plano.recursos.itens).length > 0 && (
        <Painel titulo="Lista de compras">
          <Compras plano={plano} margem={margem} />
        </Painel>
      )}

      {moduloEstoque}

      <Painel titulo="Melhor estratégia">
        <ol className="space-y-3">
          {plano.fases.map((fase, i) => (
            // Uma campanha de Grau repete o mesmo preparo de refino a cada
            // degrau. Detalhar a sequência idêntica quatro vezes só afoga o
            // resto do plano, então da segunda vez em diante mostramos só o
            // cabeçalho e o custo.
            <Fase key={i} fase={fase} repetida={ehRepeticao(plano.fases, i)} />
          ))}
        </ol>
        {plano.fases.length === 0 && (
          <p className="text-sm text-suave">Nada a fazer: o item já está no alvo.</p>
        )}
      </Painel>

      <CadeiaDeDecisoes
        fases={plano.fases}
        itemId={itemId}
        itemNome={itemNome ?? rotuloCurto(plano.input.kind)}
        grau={plano.input.grauAlvo}
        slots={itemSlots}
      />

      {/* Consumo por minério é conferência, não decisão: quem vai ao jogo leva a
          lista de compras. Fica recolhido para não competir com ela — e para os
          dois totais divergentes não aparecerem lado a lado sem necessidade. */}
      <PainelRecolhivel
        titulo="Minérios e materiais"
        resumo={
          <>
            O consumo material por material, antes de a lista de compras desmontar em receita de
            NPC o que compensa fabricar. Média de{' '}
            {Math.round(plano.recursos.tentativas).toLocaleString('pt-BR')} tentativas de refino.
          </>
        }
      >
        <Materiais plano={plano} margem={margem} />
      </PainelRecolhivel>

      {informativos.length > 0 && (
        <Painel titulo="Notas sobre este plano">
          <ul className="space-y-2">
            {informativos.map((a, i) => (
              <AvisoLinha key={i} aviso={a} />
            ))}
          </ul>
        </Painel>
      )}
    </div>
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

/** Número de apoio: menor que o orçamento, com a ressalva junto. */
function Secundario({
  rotulo,
  valor,
  titulo,
  nota,
}: {
  rotulo: string;
  valor: string;
  titulo?: string;
  nota: string;
}) {
  return (
    <div>
      <div className="text-xs tracking-wide text-suave uppercase">{rotulo}</div>
      <div className="mt-1 text-xl font-semibold tabular-nums" title={titulo}>
        {valor}
      </div>
      <div className="mt-1 text-xs leading-snug text-suave">{nota}</div>
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
      <div className="text-xs tracking-wide text-suave uppercase">Cópias do item</div>
      <div className="mt-1 text-xl font-semibold tabular-nums">
        {naMargem === null ? quantidade(plano.copiasItem) : quantidade(naMargem)}
      </div>
      <div className="mt-1 text-xs leading-snug text-suave">
        {reposicoes <= 0 ? (
          <>Nessa margem o item não quebra: a sua, no +{inicial}, basta.</>
        ) : (
          <>
            A sua, no <strong className="text-texto">+{inicial}</strong>, mais{' '}
            {quantidade(reposicoes)} de reposição no{' '}
            <strong className="text-texto">+0</strong>
            {naMargem === null ? ' (média)' : ', na margem escolhida'}.
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
      <div className="mt-3 grid grid-cols-2 gap-1 text-xs sm:grid-cols-5">
        {MARGENS.map((m) => (
          <button
            key={m.key}
            type="button"
            onClick={() => onMargem(m.key)}
            title={`${m.explica} — ${zenyExato(custo[m.key])}`}
            className={
              'rounded-md px-2 py-1 text-left transition-colors ' +
              (m.key === margem
                ? 'bg-realce/10 text-realce'
                : 'text-suave hover:bg-fundo hover:text-texto')
            }
          >
            <span className="block tracking-wide uppercase">{m.rotulo}</span>
            <span className="block tabular-nums">{zeny(custo[m.key])}</span>
          </button>
        ))}
      </div>
    </div>
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
    <>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-borda text-left text-xs tracking-wide text-suave uppercase">
              <th className="pb-2 font-medium">Material</th>
              <th className="pb-2 font-medium">Como obter</th>
              <th className="pb-2 text-right font-medium">Média</th>
              {plano.simulacao && <th className="pb-2 text-right font-medium">Ter em mãos</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-borda/60">
            {linhas.map((l) => (
              <tr key={l.itemId}>
                <td className="py-2">{nomeDoItem(l.itemId)}</td>
                <td className="py-2 text-xs text-suave">{ROTULO_VIA[l.via]}</td>
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
              <td className="py-2 text-xs text-suave">{zeny(plano.input.precoItem)} cada, no +0</td>
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
      <p className="mt-3 text-xs leading-relaxed text-suave">
        {plano.simulacao ? (
          <>
            A coluna &ldquo;ter em mãos&rdquo; é quanto separar para não ficar sem material no meio
            do caminho na margem escolhida.{' '}
            {copiasNaMargem !== null && copiasNaMargem > 1 ? (
              <>
                Inclui{' '}
                <strong className="text-texto">
                  {quantidade(copiasNaMargem)} cópias do item
                </strong>
                : a sua, no +{plano.input.refinoAtual}, mais {quantidade(copiasNaMargem - 1)} de
                reposição — nessa margem o equipamento quebra no caminho. A reposição é sempre um
                item <strong className="text-texto">+0</strong>, pelo preço sem refino que você
                informou, e o caminho até o alvo é refeito desde o zero: quebrar não devolve o
                refino que já estava pago.{' '}
              </>
            ) : (
              <>Nessa margem o item não quebra: a sua, no +{plano.input.refinoAtual}, basta. </>
            )}
          </>
        ) : null}
      </p>
    </>
  );
}

/**
 * O que comprar de verdade.
 *
 * A tabela de cima fala em minérios prontos, mas metade deles ninguém compra:
 * fabrica no NPC. Aqui a conta é desmontada até o que se acha no mercado, na
 * quantidade da margem escolhida, para a lista poder ser levada ao jogo.
 */
function Compras({ plano, margem }: { plano: ResultadoPlano; margem: MargemKey }) {
  const lista = listaDeCompras(quantidadesNaMargem(plano, margem), plano.input.precos);
  const fluxo = fluxoDeCusto(plano, margem);

  const quebras = Math.ceil(
    plano.simulacao ? plano.simulacao.quebras[margem] : plano.recursos.itensQuebrados,
  );
  const custoReposicao = quebras * plano.input.precoItem;
  const tentativas = Math.round(plano.recursos.tentativas);
  // A taxa não é `tentativas x valor fixo`: ela muda com o minério e some nos de
  // Cash Shop, então vem somada do motor.
  const taxas = Math.ceil(plano.simulacao?.taxas[margem] ?? plano.recursos.taxas);
  const total = lista.total + custoReposicao + taxas;

  return (
    <>
      {/* A tabela diz o que comprar; o desenho diz o que o dinheiro É. Numa
          campanha de +10 nos preços padrão, dois terços do orçamento não são
          minério — são proteção e reposição, e isso não se lê numa lista
          ordenada por valor. */}
      {fluxo.total > 0 && (
        <div className="mb-5">
          <h3 className="mb-1 text-xs font-semibold tracking-wide text-suave uppercase">
            Para onde vai o zeny
          </h3>
          <SankeyCusto fluxo={fluxo} />
          <ResumoDoFluxo fluxo={fluxo} />
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-borda text-left text-xs tracking-wide text-suave uppercase">
              <th className="pb-2 font-medium">Comprar</th>
              <th className="pb-2 text-right font-medium">Qtd</th>
              <th className="pb-2 text-right font-medium">Preço un.</th>
              <th className="pb-2 text-right font-medium">Total</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-borda/60">
            {lista.compras.map((l) => (
              <tr key={l.itemId}>
                <td className="py-2">{nomeDoItem(l.itemId)}</td>
                <td className="py-2 text-right tabular-nums">{quantidade(l.qtd)}</td>
                <td className="py-2 text-right text-suave tabular-nums">{zeny(l.custoUnitario)}</td>
                <td className="py-2 text-right tabular-nums" title={zenyExato(l.total)}>
                  {zeny(l.total)}
                </td>
              </tr>
            ))}
            {lista.zenyNpc > 0 && (
              <tr>
                <td className="py-2">Refino dos minérios (balcão do NPC)</td>
                <td className="py-2 text-right text-suave tabular-nums">—</td>
                <td className="py-2 text-right text-suave tabular-nums">—</td>
                <td className="py-2 text-right tabular-nums" title={zenyExato(lista.zenyNpc)}>
                  {zeny(lista.zenyNpc)}
                </td>
              </tr>
            )}
            {taxas > 0 && (
              <tr>
                <td className="py-2">Taxa do refinador</td>
                <td className="py-2 text-right tabular-nums">
                  {tentativas.toLocaleString('pt-BR')}
                </td>
                <td className="py-2 text-right text-suave tabular-nums">—</td>
                <td className="py-2 text-right tabular-nums">{zeny(taxas)}</td>
              </tr>
            )}
            {quebras > 0 && (
              <tr className="text-perigo">
                <td className="py-2">Reposição do item quebrado (no +0)</td>
                <td className="py-2 text-right tabular-nums">{quebras}</td>
                <td className="py-2 text-right tabular-nums">{zeny(plano.input.precoItem)}</td>
                <td className="py-2 text-right tabular-nums" title={zenyExato(custoReposicao)}>
                  {zeny(custoReposicao)}
                </td>
              </tr>
            )}
          </tbody>
          <tfoot>
            <tr className="border-t border-borda font-medium">
              <td className="pt-2">Total da lista</td>
              <td />
              <td />
              <td className="pt-2 text-right tabular-nums" title={zenyExato(total)}>
                {zeny(total)}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
      <p className="mt-3 text-xs leading-relaxed text-suave">
        Material com receita de NPC entra desmontado: o custo dele, em toda a calculadora, é o da
        receita (materiais + balcão) sempre que fabricar sair mais barato que comprar pronto. O
        balcão vem somado numa linha só aqui; no desenho acima ele aparece aberto por minério, que
        é o que diz qual deles valeria procurar pronto no mercado.
        {plano.simulacao ? (
          <>
            {' '}
            O total desta lista fica <strong className="text-texto">acima do orçamento</strong>{' '}
            porque cada linha está no seu próprio percentil — é o preço de não faltar nada de uma vez
            só. O orçamento é o percentil do custo total, em que a sorte de um material compensa o
            azar de outro.
          </>
        ) : null}
      </p>
    </>
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

function Fase({ fase, repetida }: { fase: PlanoDeFase; repetida?: boolean }) {
  return (
    <li className="rounded-lg border border-borda bg-fundo/40 p-3">
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="font-medium">{fase.rotulo}</h3>
        <span className="text-sm text-suave tabular-nums" title={zenyExato(fase.custoEsperado)}>
          {zeny(fase.custoEsperado)}
        </span>
      </div>

      {repetida && (
        <p className="text-sm text-suave">
          Mesma sequência de minérios do preparo anterior — o Grau zerou o refino e você refaz o
          caminho.
        </p>
      )}

      {!repetida && fase.trechos.length > 0 && (
        <ul className="space-y-1.5 text-sm">
          {fase.trechos.map((t, i) => (
            <li key={i} className="flex flex-wrap items-baseline gap-x-2">
              <span className="w-20 shrink-0 font-mono text-xs text-suave tabular-nums">
                +{t.de}→+{t.para}
              </span>
              <span className="font-medium">{t.minerio}</span>
              {t.bencaos > 0 && (
                <span className="rounded bg-ok/15 px-1.5 py-0.5 text-xs text-ok">
                  + {t.bencaos} Bênção do Ferreiro
                </span>
              )}
              <span className="text-xs text-suave">{porcento(t.chance)}</span>
              {t.chance < 1 && (
                <span className={'text-xs ' + (t.arriscaQuebrar ? 'text-perigo' : 'text-suave')}>
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
    </li>
  );
}

function AvisoLinha({ aviso }: { aviso: Aviso }) {
  const cor =
    aviso.nivel === 'perigo'
      ? 'border-perigo/40 bg-perigo/10 text-perigo'
      : aviso.nivel === 'atencao'
        ? 'border-atencao/40 bg-atencao/10 text-atencao'
        : 'border-borda bg-fundo/40 text-suave';
  const icone = aviso.nivel === 'perigo' ? '⚠' : aviso.nivel === 'atencao' ? '!' : 'i';

  return (
    <li className={`flex gap-2.5 rounded-lg border p-3 text-sm leading-relaxed ${cor}`}>
      <span aria-hidden className="shrink-0 font-bold">
        {icone}
      </span>
      <span>{aviso.texto}</span>
    </li>
  );
}
