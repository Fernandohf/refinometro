import { useMemo, useState } from 'react';

import type { Grade } from '../data/grade';
import type { PlanoDeFase } from '../engine/plan';
import type { PolicyEntry } from '../engine/types';
import { porcento, zeny, zenyExato } from '../format';
import { NomeNoJogo, SlotItem } from './ItemNoJogo';
import { BotaoDoPainel, Painel } from './ui';

/**
 * A cadeia de decisões, estado por estado.
 *
 * O painel "Melhor estratégia" agrupa os degraus que usam o mesmo minério, e é
 * assim que se lê um plano. Mas a política é uma cadeia de Markov: cada refino
 * é um estado com uma decisão própria, e agrupar esconde justamente o que a
 * decisão pesa — que no +9 uma falha custa três níveis, que o custo esperado
 * dali até o alvo é quase todo o orçamento, que a Bênção entra por causa disso
 * e não por causa da chance.
 *
 * Duas leituras da mesma política: a tabela, que mostra todos os estados de uma
 * vez, e o percurso, que anda um passo por vez, sorteando de verdade. A segunda
 * é a que responde "por que isso custa tanto se a chance é 40%?" — porque a
 * pessoa vê o item cair de +9 para +6 e refazer o caminho.
 */
export function CadeiaDeDecisoes({
  fases,
  itemId,
  itemNome,
  grau,
  slots,
}: {
  fases: PlanoDeFase[];
  itemId: number | null;
  itemNome: string;
  grau: Grade;
  slots: number;
}) {
  const [aberto, setAberto] = useState(false);
  // Só as fases de refino têm política: a de Grau é uma tentativa só, repetida,
  // e o painel de estratégia já a descreve inteira.
  const comPolitica = fases.filter((f) => f.politica && f.politica.length > 0);
  const [fase, setFase] = useState(0);

  const escolhida = comPolitica[Math.min(fase, comPolitica.length - 1)];

  if (comPolitica.length === 0) return null;

  return (
    <Painel
      titulo="A cadeia de decisões"
      aside={
        <BotaoDoPainel aberto={aberto} onClick={() => setAberto((a) => !a)}>
          {aberto ? 'esconder' : 'abrir'}
        </BotaoDoPainel>
      }
    >
      {!aberto ? (
        <p className="text-sm leading-relaxed text-suave">
          Cada refino é um estado com uma decisão própria: qual minério, quantas Bênçãos, o que
          acontece ao falhar e quanto ainda falta gastar dali até o alvo. Abra para ver a política
          estado por estado — ou para percorrer a cadeia sorteando de verdade.
        </p>
      ) : (
        <div className="space-y-4">
          {comPolitica.length > 1 && (
            <div className="flex flex-wrap gap-1">
              {comPolitica.map((f, i) => (
                <BotaoDoPainel key={i} onClick={() => setFase(i)}>
                  {i === Math.min(fase, comPolitica.length - 1) ? `▸ ${f.rotulo}` : f.rotulo}
                </BotaoDoPainel>
              ))}
            </div>
          )}

          <TabelaDeEstados politica={escolhida!.politica!} alvo={escolhida!.para ?? 0} />

          <Percurso
            politica={escolhida!.politica!}
            de={escolhida!.de ?? 0}
            alvo={escolhida!.para ?? 0}
            itemId={itemId}
            itemNome={itemNome}
            grau={grau}
            slots={slots}
          />
        </div>
      )}
    </Painel>
  );
}

/**
 * Onde a falha joga o item, dito como o jogo diz.
 *
 * Num degrau de 100% não há falha: o motor ainda registra a penalidade do
 * minério, mas anunciá-la seria inventar um risco que a tabela de chances não
 * tem.
 */
function destinoDaFalha(e: PolicyEntry): { texto: string; perigo: boolean } {
  if (e.acao.chance >= 1) return { texto: 'não falha', perigo: false };
  const para = e.acao.falhaVaiPara;
  if (para === null) return { texto: 'quebra', perigo: true };
  if (para === e.de) return { texto: 'nada muda', perigo: false };
  return { texto: `cai para +${para}`, perigo: false };
}

function TabelaDeEstados({ politica, alvo }: { politica: PolicyEntry[]; alvo: number }) {
  // O custo esperado do primeiro estado é o da campanha inteira: serve de
  // escala para a barra, mostrando quanto de tudo ainda está pela frente.
  const maior = Math.max(...politica.map((e) => e.custoEsperado), 1);

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-borda text-left text-xs tracking-wide text-suave uppercase">
            <th className="pr-3 pb-2 font-medium">Estado</th>
            <th className="pr-3 pb-2 font-medium">Decisão</th>
            <th className="pr-3 pb-2 text-right font-medium">Sucesso</th>
            <th className="pr-3 pb-2 font-medium">Na falha</th>
            <th className="pb-2 text-right font-medium">Falta gastar</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-borda/40">
          {politica.map((e) => {
            const falha = destinoDaFalha(e);
            return (
              <tr key={e.de}>
                <td className="py-1.5 pr-3 font-mono text-xs whitespace-nowrap tabular-nums">
                  +{e.de} <span className="text-suave">→</span> +{e.de + 1}
                </td>
                <td className="py-1.5 pr-3">
                  {e.acao.ore.nome}
                  {e.acao.bencaos > 0 && (
                    <span className="ml-1 text-xs whitespace-nowrap text-ok">
                      +{e.acao.bencaos} Bênção
                    </span>
                  )}
                </td>
                <td className="py-1.5 pr-3">
                  <Medida
                    fracao={e.acao.chance}
                    cor="bg-ok"
                    texto={porcento(e.acao.chance)}
                  />
                </td>
                <td
                  className={
                    'py-1.5 pr-3 text-xs whitespace-nowrap ' +
                    (falha.perigo ? 'text-perigo' : 'text-suave')
                  }
                >
                  {falha.texto}
                </td>
                <td
                  className="py-1.5"
                  title={`${zenyExato(e.custoEsperado)} do +${e.de} até o +${alvo}`}
                >
                  <Medida
                    fracao={e.custoEsperado / maior}
                    cor="bg-realce"
                    texto={zeny(e.custoEsperado)}
                  />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="mt-2 text-xs leading-relaxed text-suave">
        &ldquo;Falta gastar&rdquo; é o custo esperado daquele estado até o +{alvo}, já contando as
        falhas que ainda vão acontecer. É o número que a política otimiza — e é por ele que a
        Bênção do Ferreiro compensa em degraus onde ela parece cara: ela não muda a chance, muda
        para onde a falha joga o item.
      </p>
    </div>
  );
}

/**
 * Barrinha e número, alinhados.
 *
 * O número tem largura fixa porque `justify-end` com texto de largura variável
 * empurrava a barra de linha para linha — e barras que não começam no mesmo
 * lugar não podem ser comparadas de relance, que é a única razão de existirem.
 */
function Medida({ fracao, cor, texto }: { fracao: number; cor: string; texto: string }) {
  return (
    <div className="flex items-center justify-end gap-2">
      <span className="h-2 w-12 shrink-0 overflow-hidden rounded-full bg-fundo" aria-hidden>
        <span
          className={'block h-full ' + cor}
          style={{ width: `${Math.max(0, Math.min(1, fracao)) * 100}%` }}
        />
      </span>
      <span className="w-20 text-right tabular-nums">{texto}</span>
    </div>
  );
}

/** Um passo já andado no percurso, para a lista de eventos. */
interface Passo {
  de: number;
  para: number | null;
  sucesso: boolean;
  custo: number;
}

/**
 * Percorre a cadeia sorteando cada tentativa.
 *
 * O sorteio é honesto — `Math.random()` contra a chance da política, com o
 * destino da falha que o motor calculou. Não é a simulação do orçamento (essa
 * roda no Worker, cem mil vezes); é uma campanha só, visível, para a cadeia
 * deixar de ser tabela e virar consequência.
 */
function Percurso({
  politica,
  de,
  alvo,
  itemId,
  itemNome,
  grau,
  slots,
}: {
  politica: PolicyEntry[];
  de: number;
  alvo: number;
  itemId: number | null;
  itemNome: string;
  grau: Grade;
  slots: number;
}) {
  const porEstado = useMemo(() => new Map(politica.map((e) => [e.de, e])), [politica]);
  const [refino, setRefino] = useState(de);
  const [gasto, setGasto] = useState(0);
  const [quebras, setQuebras] = useState(0);
  const [passos, setPassos] = useState<Passo[]>([]);

  const chegou = refino >= alvo;
  const atual = porEstado.get(refino);

  function tentar() {
    const e = porEstado.get(refino);
    if (!e) return;
    const sucesso = Math.random() < e.acao.chance;
    const destino = sucesso ? e.de + 1 : e.acao.falhaVaiPara;

    setGasto((g) => g + e.acao.custo);
    setPassos((p) => [{ de: e.de, para: destino, sucesso, custo: e.acao.custo }, ...p].slice(0, 12));
    if (destino === null) {
      // Quebrou: entra um item novo, no +0, e o caminho recomeça — a mesma
      // regra que o motor usa para orçar a reposição.
      setQuebras((q) => q + 1);
      setRefino(0);
    } else {
      setRefino(destino);
    }
  }

  function recomecar() {
    setRefino(de);
    setGasto(0);
    setQuebras(0);
    setPassos([]);
  }

  return (
    <div className="rounded-lg border border-borda bg-fundo/40 p-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <SlotItem id={itemId} />
          <div>
            <NomeNoJogo nome={itemNome} refino={refino} grau={grau} slots={slots} />
            <div className="mt-0.5 text-xs text-suave tabular-nums">
              {passos.length} {passos.length === 1 ? 'tentativa' : 'tentativas'} ·{' '}
              <span title={zenyExato(gasto)}>{zeny(gasto)}</span> gastos
              {quebras > 0 && (
                <span className="text-perigo">
                  {' '}
                  · {quebras} {quebras === 1 ? 'quebra' : 'quebras'}
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="flex gap-2">
          {chegou ? (
            <span className="text-sm font-medium text-ok">chegou ao +{alvo}!</span>
          ) : (
            <BotaoDoPainel onClick={tentar}>
              {atual ? `tentar +${refino} → +${refino + 1}` : 'tentar'}
            </BotaoDoPainel>
          )}
          <BotaoDoPainel onClick={recomecar}>recomeçar</BotaoDoPainel>
        </div>
      </div>

      {atual && !chegou && (
        <p className="mt-2 text-xs text-suave">
          Este passo usa <strong className="text-texto">{atual.acao.ore.nome}</strong>
          {atual.acao.bencaos > 0 && <> com {atual.acao.bencaos} Bênção do Ferreiro</>}, custa{' '}
          <span className="tabular-nums">{zeny(atual.acao.custo)}</span> e passa em{' '}
          <strong className="text-texto">{porcento(atual.acao.chance)}</strong> das vezes.{' '}
          {atual.acao.chance >= 1
            ? 'Este degrau não falha.'
            : destinoDaFalha(atual).perigo
              ? 'Uma falha aqui destrói o item.'
              : `Na falha, ${destinoDaFalha(atual).texto}.`}
        </p>
      )}

      {passos.length > 0 && (
        <ul className="mt-3 space-y-0.5 text-xs">
          {passos.map((p, i) => (
            <li key={passos.length - i} className="flex gap-2 tabular-nums">
              <span className={p.sucesso ? 'text-ok' : 'text-perigo'}>
                {p.sucesso ? '✓' : '✗'}
              </span>
              <span className="font-mono text-xs">
                +{p.de} → {p.para === null ? 'quebrou' : `+${p.para}`}
              </span>
              <span className="text-suave">{zeny(p.custo)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
