import { useMemo, useState } from 'react';

import { nomeDoItem } from '../data/nomes';
import { avaliarEstoque, emMateriais, type Estoque, type VereditoEstoque } from '../engine/estoque';
import type { Resultado as ResultadoPlano } from '../engine/plan';
import { porcento, zeny, zenyExato } from '../format';
import { MARGENS, type MargemKey } from './Resultado';
import { Campo, NumeroQtd, NumeroZeny, Painel } from './ui';

export const ESTOQUE_VAZIO: Estoque = { zeny: 0, itens: {}, copias: 1 };

/**
 * Contagem inteira. Aqui nada é média: o que a pessoa tem na mochila e o que
 * ainda falta comprar são unidades contadas, e "7,0 Bênção" só atrapalha.
 */
const inteiro = (n: number) => Math.max(0, Math.ceil(n)).toLocaleString('pt-BR');

/** `true` quando o jogador ainda não informou nada — a tela então só convida. */
export function estoqueEmBranco(e: Estoque): boolean {
  return e.zeny === 0 && e.copias <= 1 && Object.values(e.itens).every((q) => !q);
}

/**
 * Simulador de estoque: em vez de dizer quanto a campanha custa, responde se o
 * que a pessoa já tem chega ao alvo.
 *
 * A conta não é outra simulação — são as mesmas campanhas já sorteadas, lidas de
 * outro jeito (ver `src/engine/estoque.ts`). É por isso que a resposta acompanha
 * a digitação: o Worker não precisa rodar de novo a cada minério informado.
 */
export function SimuladorDeEstoque({
  plano,
  margem,
  estoque,
  onChange,
}: {
  plano: ResultadoPlano;
  margem: MargemKey;
  estoque: Estoque;
  onChange: (e: Estoque) => void;
}) {
  const [aberto, setAberto] = useState(() => !estoqueEmBranco(estoque));

  const campanha = useMemo(() => {
    const sim = plano.simulacao;
    if (!sim) return null;
    return emMateriais(sim.amostras, plano.input.precos, plano.input.precoItem);
  }, [plano]);

  const veredito = useMemo(
    () => (campanha ? avaliarEstoque(campanha, estoque) : null),
    [campanha, estoque],
  );

  return (
    <Painel
      titulo="Dá com o que eu tenho?"
      aside={
        <button
          type="button"
          className="text-xs text-realce hover:underline"
          onClick={() => setAberto((a) => !a)}
        >
          {aberto ? 'esconder' : 'simular'}
        </button>
      }
    >
      {!aberto ? (
        <p className="text-sm leading-relaxed text-suave">
          Diga quanto zeny e quantos minérios já estão na sua mochila e veja a chance de chegar ao
          alvo com isso — sem contar com uma reposição que talvez não venha.
          {veredito && !estoqueEmBranco(estoque) && (
            <>
              {' '}
              Hoje:{' '}
              <strong className={corDaChance(veredito.chance)}>
                {chanceLegivel(veredito.chance)}
              </strong>
              .
            </>
          )}
        </p>
      ) : !campanha || !veredito ? (
        <p className="text-sm leading-relaxed text-suave">
          Este alvo é caro demais para simular, e sem campanhas simuladas não há como dizer a chance
          de chegar lá com um estoque. Escolha um refino ou grau mais baixo.
        </p>
      ) : (
        <div className="space-y-5">
          <div className="grid gap-3 sm:grid-cols-2">
            <Campo label="Zeny em caixa" dica="O que você pode gastar na campanha inteira.">
              <NumeroZeny value={estoque.zeny} onChange={(v) => onChange({ ...estoque, zeny: v })} />
            </Campo>
            <Campo
              label="Cópias do item"
              dica={`Contando a sua, no +${plano.input.refinoAtual}. As de reposição entram no +0.`}
            >
              <NumeroQtd
                value={estoque.copias}
                placeholder="1"
                onChange={(v) => onChange({ ...estoque, copias: Math.max(1, v) })}
              />
            </Campo>
          </div>

          <div>
            <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
              <h3 className="text-xs font-semibold tracking-wide text-suave uppercase">
                O que você já tem
              </h3>
              <div className="flex gap-3 text-xs">
                <button
                  type="button"
                  className="text-realce hover:underline"
                  onClick={() =>
                    onChange({
                      ...estoque,
                      itens: Object.fromEntries(
                        campanha.materiais.map((m) => [m.itemId, Math.ceil(m.minimo)]),
                      ),
                    })
                  }
                >
                  preencher com o mínimo
                </button>
                <button
                  type="button"
                  className="text-suave hover:underline"
                  onClick={() => onChange({ ...estoque, itens: {} })}
                >
                  zerar
                </button>
              </div>
            </div>

            <div className="space-y-2">
              {campanha.materiais.map((m) => (
                <div key={m.itemId} className="flex items-center gap-2">
                  <span className="flex-1 text-sm">{nomeDoItem(m.itemId)}</span>
                  <span className="text-xs text-suave tabular-nums">
                    mín. {inteiro(m.minimo)}
                  </span>
                  <div className="w-28">
                    <NumeroQtd
                      rotulo={nomeDoItem(m.itemId)}
                      value={estoque.itens[m.itemId] ?? 0}
                      placeholder="0"
                      onChange={(v) => onChange({ ...estoque, itens: { ...estoque.itens, [m.itemId]: v } })}
                    />
                  </div>
                </div>
              ))}
            </div>

            <p className="mt-2 text-xs leading-relaxed text-suave">
              Só aparecem os materiais que o plano usa, já desmontados até o que se compra de
              verdade — quem fabrica Bradium tem <strong className="text-texto">Oridecon</strong> na
              mochila, não Bradium. O mínimo é o que a campanha mais sortuda consumiu: abaixo dele
              não existe caminho que não precise comprar mais.
            </p>
          </div>

          <Veredito veredito={veredito} estoque={estoque} margem={margem} plano={plano} />
        </div>
      )}
    </Painel>
  );
}

function corDaChance(chance: number): string {
  if (chance >= 0.9) return 'text-ok';
  if (chance >= 0.5) return 'text-atencao';
  return 'text-perigo';
}

/** Percentual da chance, com casa decimal só quando arredondar mentiria. */
function chanceLegivel(chance: number): string {
  if (chance > 0 && chance < 0.01) return porcento(chance, 1);
  if (chance > 0.99 && chance < 1) return porcento(chance, 1);
  return porcento(chance);
}

function Veredito({
  veredito,
  estoque,
  margem,
  plano,
}: {
  veredito: VereditoEstoque;
  estoque: Estoque;
  margem: MargemKey;
  plano: ResultadoPlano;
}) {
  const margemInfo = MARGENS.find((m) => m.key === margem)!;
  const faltaAgora = Math.max(0, veredito.zenyNecessario.p50 - estoque.zeny);
  const faltaNaMargem = Math.max(0, veredito.zenyNecessario[margem] - estoque.zeny);
  const copiasFaltantes = Math.ceil(veredito.copiasFaltantes[margem]);
  // O veredito sai das execuções guardadas cruas, que num alvo barato são menos
  // que as simuladas. Dizer isso evita que os dois números pareçam brigar.
  const amostradas = veredito.execucoes < (plano.simulacao?.execucoes ?? 0);

  return (
    <div className="rounded-lg border border-borda bg-fundo/40 p-4">
      <div className="text-xs tracking-wide text-suave uppercase">Chance de chegar ao alvo</div>
      <div className={'mt-1 text-4xl font-semibold tabular-nums ' + corDaChance(veredito.chance)}>
        {chanceLegivel(veredito.chance)}
      </div>
      <p className="mt-2 text-sm leading-relaxed text-suave">
        {veredito.chance === 0
          ? `Nenhuma das ${veredito.execucoes.toLocaleString('pt-BR')} campanhas simuladas chegou ao alvo com o que você tem.`
          : veredito.chance === 1
            ? `Todas as ${veredito.execucoes.toLocaleString('pt-BR')} campanhas simuladas chegaram ao alvo com o que você tem.`
            : `${Math.round(veredito.chance * veredito.execucoes).toLocaleString('pt-BR')} das ${veredito.execucoes.toLocaleString('pt-BR')} campanhas simuladas chegaram ao alvo com o que você tem.`}{' '}
        O que faltar no meio do caminho entra como compra, pelos preços informados: a resposta é
        sobre o caixa, e o minério parado na mochila conta pelo que ele deixa de custar.
        {amostradas && (
          <>
            {' '}
            Esta conta lê uma amostra das campanhas, não todas as{' '}
            {plano.simulacao!.execucoes.toLocaleString('pt-BR')} que deram os percentis acima:
            responder a cada tecla digitada exige tê-las cruas em mãos, e {veredito.execucoes.toLocaleString('pt-BR')}{' '}
            bastam para a chance errar por menos de um ponto percentual.
          </>
        )}
      </p>

      {faltaNaMargem > 0 && (
        <p className="mt-3 text-sm leading-relaxed">
          Falta zeny:{' '}
          <strong className="text-perigo tabular-nums" title={zenyExato(faltaNaMargem)}>
            {zeny(faltaNaMargem)}
          </strong>{' '}
          para a margem de {margemInfo.rotulo.toLowerCase()} ({margemInfo.explica})
          {margem !== 'p50' && (
            <>
              , e{' '}
              <span className="tabular-nums" title={zenyExato(faltaAgora)}>
                {zeny(faltaAgora)}
              </span>{' '}
              para a campanha mediana
            </>
          )}
          .
        </p>
      )}

      {copiasFaltantes > 0 && (
        <p className="mt-2 text-sm leading-relaxed">
          Nessa margem o equipamento quebra: {copiasFaltantes === 1 ? 'é' : 'são'}{' '}
          <strong className="text-perigo">
            {copiasFaltantes} {copiasFaltantes === 1 ? 'cópia' : 'cópias'}
          </strong>{' '}
          a mais para comprar no +0, já dentro do zeny acima. Você fica parado se elas não
          estiverem à venda.
        </p>
      )}

      {(veredito.materiais.some((m) => m.tem > 0) || estoque.copias > 1) && (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-borda text-left text-xs tracking-wide text-suave uppercase">
                <th className="pb-2 font-medium">Material</th>
                <th className="pb-2 text-right font-medium">Você tem</th>
                <th className="pb-2 text-right font-medium">Acaba em</th>
                <th className="pb-2 text-right font-medium">Comprar ({margemInfo.rotulo})</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-borda/60">
              {veredito.materiais.map((m) => (
                <tr key={m.itemId}>
                  <td className="py-2">{nomeDoItem(m.itemId)}</td>
                  <td className="py-2 text-right tabular-nums">{inteiro(m.tem)}</td>
                  <td
                    className={
                      'py-2 text-right tabular-nums ' +
                      (m.fracaoFaltou > 0.5 ? 'text-atencao' : 'text-suave')
                    }
                  >
                    {porcento(m.fracaoFaltou)} das campanhas
                  </td>
                  <td className="py-2 text-right font-medium tabular-nums">
                    {inteiro(m.falta[margem])}
                  </td>
                </tr>
              ))}
              {plano.recursos.itensQuebrados > 0 && (
                <tr>
                  <td className="py-2">Cópias do item</td>
                  <td className="py-2 text-right tabular-nums">{inteiro(estoque.copias)}</td>
                  <td className="py-2 text-right text-suave tabular-nums">
                    {porcento(veredito.fracaoSemCopias)} das campanhas
                  </td>
                  <td className="py-2 text-right font-medium tabular-nums">{copiasFaltantes}</td>
                </tr>
              )}
            </tbody>
          </table>
          <p className="mt-3 text-xs leading-relaxed text-suave">
            &ldquo;Acaba em&rdquo; é a fração das campanhas em que o seu estoque daquele material
            termina antes do alvo; &ldquo;comprar&rdquo; é quanto ainda faltaria na margem
            escolhida. Ficar sem material não trava a campanha enquanto houver zeny para repor — por
            isso a chance lá em cima olha o caixa, e esta tabela diz onde ele vai ser gasto.
          </p>
        </div>
      )}
    </div>
  );
}
