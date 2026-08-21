import { nomeDoItem } from '../data/nomes';
import { listaDeCompras, sourcingOf } from '../engine/pricing';
import type { Aviso, PlanoDeFase, Resultado as ResultadoPlano } from '../engine/plan';
import type { Percentis } from '../engine/types';
import { porcento, quantidade, zeny, zenyExato } from '../format';
import { Painel } from './ui';

export type MargemKey = keyof Percentis;

export const MARGENS: { key: MargemKey; rotulo: string; explica: string }[] = [
  { key: 'p50', rotulo: 'Mediana', explica: 'metade das tentativas custa menos que isso' },
  { key: 'p75', rotulo: '75%', explica: 'cobre 3 de cada 4 tentativas' },
  { key: 'p90', rotulo: '90%', explica: 'cobre 9 de cada 10 tentativas' },
  { key: 'p95', rotulo: '95%', explica: 'cobre 19 de cada 20 tentativas' },
  { key: 'p99', rotulo: '99%', explica: 'só 1 em 100 estoura este orçamento' },
];

/**
 * Quantidade de cada material na margem escolhida — o número que responde
 * "quanto preciso ter em mãos". Sem simulação, sobra a média.
 */
function quantidadesNaMargem(plano: ResultadoPlano, margem: MargemKey): Record<number, number> {
  const saida: Record<number, number> = {};
  for (const [id, media] of Object.entries(plano.recursos.itens)) {
    const itemId = Number(id);
    saida[itemId] = Math.ceil(plano.simulacao?.itens[itemId]?.[margem] ?? media);
  }
  return saida;
}

export function Resultado({
  plano,
  margem,
  afinando = false,
}: {
  plano: ResultadoPlano;
  margem: MargemKey;
  /** O passe preciso ainda está rodando: este resultado é o do passe rápido. */
  afinando?: boolean;
}) {
  const sim = plano.simulacao;
  const margemInfo = MARGENS.find((m) => m.key === margem)!;

  return (
    <div className="space-y-4">
      <Painel titulo="Quanto vai custar">
        <div className="grid gap-4 sm:grid-cols-3">
          {sim ? (
            <div>
              <div className="text-xs tracking-wide text-suave uppercase">Orçamento recomendado</div>
              <div
                className="mt-1 text-3xl font-semibold text-realce tabular-nums"
                title={zenyExato(sim.custo[margem])}
              >
                {zeny(sim.custo[margem])}
              </div>
              <div className="mt-1 text-xs text-suave">
                Margem de {margemInfo.rotulo.toLowerCase()} — {margemInfo.explica}.
              </div>
            </div>
          ) : (
            <div>
              <div className="text-xs tracking-wide text-suave uppercase">Orçamento recomendado</div>
              {/* Um alvo caro não cabe no passe rápido, mas pode caber no
                  preciso. Chamá-lo de inalcançável antes da hora seria dar um
                  veredito que a simulação longa ainda pode desmentir. */}
              <div
                className={
                  'mt-1 text-3xl font-semibold ' + (afinando ? 'text-suave' : 'text-perigo')
                }
              >
                {afinando ? 'calculando…' : 'fora de alcance'}
              </div>
              <div className="mt-1 text-xs text-suave">
                Este alvo pede ~{Math.round(plano.tentativasEsperadas).toLocaleString('pt-BR')}{' '}
                tentativas de refino
                {afinando
                  ? '. A simulação longa está tentando; pode ser que nem ela alcance.'
                  : '. Não há margem que faça sentido calcular.'}
              </div>
            </div>
          )}
          <div>
            <div className="text-xs tracking-wide text-suave uppercase">Custo médio</div>
            <div className="mt-1 text-3xl font-semibold tabular-nums" title={zenyExato(plano.custoEsperado)}>
              {zeny(plano.custoEsperado)}
            </div>
            <div className="mt-1 text-xs text-suave">
              A média é puxada pelos azarados. Planejar por ela dá errado em quase metade das vezes.
            </div>
          </div>

          <Copias plano={plano} margem={margem} />
        </div>

        {sim && <Distribuicao custo={sim.custo} media={plano.custoEsperado} margem={margem} />}
      </Painel>

      <Painel titulo="Minérios e materiais">
        <Materiais plano={plano} margem={margem} />
      </Painel>

      {Object.keys(plano.recursos.itens).length > 0 && (
        <Painel titulo="Lista de compras">
          <Compras plano={plano} margem={margem} />
        </Painel>
      )}

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

      {plano.avisos.length > 0 && (
        <Painel titulo="Avisos">
          <ul className="space-y-2">
            {plano.avisos.map((a, i) => (
              <AvisoLinha key={i} aviso={a} />
            ))}
          </ul>
        </Painel>
      )}

      <Painel titulo="Valor do item">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <span className="text-2xl font-semibold text-realce tabular-nums" title={zenyExato(plano.valorJusto)}>
            {zeny(plano.valorJusto)}
          </span>
          <span className="text-sm text-suave">preço justo do item pronto</span>
        </div>
        <p className="mt-2 text-sm leading-relaxed text-suave">
          É o preço do item sem refino ({zeny(plano.input.precoItem)}) mais o custo médio de levá-lo até o
          alvo ({zeny(plano.custoEsperado)}). Se alguém vender o item já pronto por menos que isso, comprar
          pronto sai mais barato do que refinar — e sem o risco.
        </p>
      </Painel>
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
      <div className="mt-1 text-3xl font-semibold tabular-nums">
        {naMargem === null ? quantidade(plano.copiasItem) : quantidade(naMargem)}
      </div>
      <div className="mt-1 text-xs text-suave">
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

/** Barra que mostra onde a margem escolhida cai dentro da distribuição. */
function Distribuicao({ custo, media, margem }: { custo: Percentis; media: number; margem: MargemKey }) {
  const max = custo.p99 || 1;
  const pos = (v: number) => Math.min(100, (v / max) * 100);

  return (
    <div className="mt-5">
      <div className="relative h-2 rounded-full bg-fundo">
        <div
          className="absolute inset-y-0 left-0 rounded-full bg-realce/30"
          style={{ width: `${pos(custo[margem])}%` }}
        />
        <div
          className="absolute inset-y-0 w-0.5 bg-texto"
          style={{ left: `${pos(media)}%` }}
          title={`Média: ${zenyExato(media)}`}
        />
      </div>
      <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-xs sm:grid-cols-5">
        {MARGENS.map((m) => (
          <div key={m.key} className={m.key === margem ? 'text-realce' : 'text-suave'}>
            <dt className="tracking-wide uppercase">{m.rotulo}</dt>
            <dd className="tabular-nums" title={zenyExato(custo[m.key])}>
              {zeny(custo[m.key])}
            </dd>
          </div>
        ))}
      </dl>
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
        Média de {Math.round(plano.recursos.tentativas).toLocaleString('pt-BR')} tentativas de refino.
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
                <td className="py-2">Balcão do NPC (fabricação)</td>
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
        receita (materiais + balcão) sempre que fabricar sair mais barato que comprar pronto.
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
