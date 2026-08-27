import { useMemo, useState } from 'react';

import { nomeDoItem } from '../data/nomes';
import {
  avaliarEstoque,
  emMateriais,
  estoqueMinimo,
  materialParaChance,
  type Estoque,
  type VereditoEstoque,
} from '../engine/estoque';
import type { Resultado as ResultadoPlano } from '../engine/plan';
import { porcento, zeny, zenyExato } from '../format';
import { MARGENS, type MargemKey } from './Resultado';
import {
  Botao,
  BotaoDoPainel,
  Campo,
  Info,
  NumeroQtd,
  NumeroZeny,
  Painel,
  Segmentado,
  TituloDeSecao,
} from './ui';
import { SlotItem } from './ItemNoJogo';

export const ESTOQUE_VAZIO: Estoque = { zeny: 0, itens: {}, copias: 1 };

/**
 * Chances que o preenchimento sabe mirar.
 *
 * Não são as margens do painel de custo, e por um motivo: lá a pergunta é
 * "quanto levar para não estourar", e ninguém orça uma campanha para dar
 * errado. Aqui a pergunta é o que a pessoa já tem, e "e se eu topar 10%?" é
 * legítima — é o jogador que aceita apostar barato, sabendo que provavelmente
 * volta ao mercado no meio do caminho.
 */
const CHANCES_ALVO = [
  { key: '0.1', rotulo: '10%', dica: 'aposta barata: 1 em 10 campanhas fecha com isso' },
  { key: '0.25', rotulo: '25%', dica: '1 em 4 campanhas fecha com isso' },
  { key: '0.5', rotulo: '50%', dica: 'metade das campanhas fecha com isso' },
  { key: '0.75', rotulo: '75%', dica: '3 de cada 4 campanhas' },
  { key: '0.9', rotulo: '90%', dica: '9 de cada 10 campanhas' },
  { key: '0.99', rotulo: '99%', dica: 'só 1 em 100 fica pelo caminho' },
] as const;

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
  // Aberto de saída: o painel mora atrás de uma aba, e abrir a aba já É o
  // pedido para simular. O convite recolhido fazia sentido quando ele vinha
  // no fim de uma página longa, onde ninguém tinha pedido nada.
  const [aberto, setAberto] = useState(true);

  const campanha = useMemo(() => {
    const sim = plano.simulacao;
    if (!sim) return null;
    return emMateriais(sim.amostras, plano.input.precos, plano.input.precoItem);
  }, [plano]);

  const veredito = useMemo(
    () => (campanha ? avaliarEstoque(campanha, estoque) : null),
    [campanha, estoque],
  );

  // Chance que os botões de preenchimento miram. Fica aqui, e não junto da
  // margem do painel de custo, porque é outra pergunta: a margem orça o pior
  // caso, esta escolhe o quanto se aceita apostar com o que já está em mãos.
  const [alvo, setAlvo] = useState(0.9);
  // O recado vale para o estoque que o produziu, e some sozinho quando a pessoa
  // mexe em qualquer campo: "material nenhum passa de 0%" seria mentira dois
  // segundos depois de ela digitar o zeny que faltava.
  const [recado, setRecado] = useState<{ texto: string; sobre: Estoque } | null>(null);

  /** Piso de material e o caixa que ele exige para a chance escolhida. */
  const preencherTudo = () => {
    if (!campanha) return;
    setRecado(null);
    onChange(estoqueMinimo(campanha, estoque, alvo));
  };


  /**
   * O inverso: mantém o zeny informado e resolve o material.
   *
   * Duas respostas não são um estoque e sim um recado, então não mexem na
   * mochila: quando o caixa não dá conta nem com material de sobra, e quando ele
   * já basta sozinho. Sobrescrever o que a pessoa digitou com uma cesta de zeros
   * seria trocar uma resposta por um apagamento.
   */
  const resolverMaterial = () => {
    if (!campanha) return;
    const cesta = materialParaChance(campanha, estoque, alvo);

    if (cesta.teto < alvo) {
      setRecado({
        sobre: estoque,
        texto:
          `Com ${zeny(estoque.zeny)} em caixa, material nenhum passa de ${porcento(cesta.teto)}: ` +
          `taxa do refinador, balcão do NPC e cópias de reposição se pagam em zeny. Para ${porcento(alvo)} ` +
          `seriam ${zeny(cesta.zenyDoTeto)} em caixa, já com a mochila cheia.`,
      });
      return;
    }

    if (Object.values(cesta.itens).every((q) => q === 0)) {
      setRecado({
        sobre: estoque,
        texto:
          `Esse caixa já chega a ${porcento(alvo)} sem material nenhum na mochila — o que você ` +
          `tiver é economia, não necessidade.`,
      });
      return;
    }

    // Material vem em unidades inteiras, e nos alvos baixos a menor cesta que
    // passa do alvo já passa longe dele. Dizer isso evita que os dois números
    // (o pedido e o do veredito logo abaixo) pareçam brigar.
    const novo = { ...estoque, itens: cesta.itens };
    setRecado(
      cesta.chance > alvo + 0.02
        ? {
            sobre: novo,
            texto:
              `A menor mochila equilibrada que passa de ${porcento(alvo)} já chega a ` +
              `${porcento(cesta.chance)}: minério não se compra pela metade, e uma cesta menor que ` +
              `essa não alcança o alvo.`,
          }
        : null,
    );
    onChange(novo);
  };

  return (
    <Painel
      titulo="Dá com o que eu tenho?"
      info={
        <Info titulo="Dá com o que eu tenho?">
          A conta não é outra simulação: são as mesmas campanhas já sorteadas, lidas de outro jeito
          — por isso a resposta acompanha a digitação. O que faltar no meio do caminho entra como
          compra, pelos preços informados: a resposta é sobre o caixa, e o minério parado na mochila
          conta pelo que ele deixa de custar.
        </Info>
      }
      aside={
        <BotaoDoPainel aberto={aberto} onClick={() => setAberto((a) => !a)}>
          {aberto ? 'esconder' : 'simular'}
        </BotaoDoPainel>
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

          {/* A pergunta do painel tem duas saídas, e as duas cabem aqui: com o
              material no piso, quanto zeny falta para a chance que eu topo — e,
              com o zeny que eu já tenho, quanto material ela exige. */}
          <div className="rounded-lg border border-borda bg-fundo/40 p-3">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
              <span className="text-xs font-semibold tracking-wide text-suave uppercase">
                Quero chegar com
              </span>
              <Segmentado
                rotulo="Chance que quero ter"
                value={String(alvo)}
                onChange={(v) => {
                  setAlvo(Number(v));
                  setRecado(null);
                }}
                opcoes={CHANCES_ALVO.map((c) => ({ key: c.key, rotulo: c.rotulo, dica: c.dica }))}
              />
            </div>

            <div className="mt-3 flex flex-wrap gap-2">
              <Botao variante="tonal" tamanho="pequeno" onClick={preencherTudo}>
                preencher mochila e caixa
              </Botao>
              <Botao variante="contornado" tamanho="pequeno" onClick={resolverMaterial}>
                só o material, com o meu zeny
              </Botao>
              <Info titulo="Os dois preenchimentos" alinhar="direita">
                O primeiro põe o piso de material na mochila e calcula o zeny que ele ainda exige; o
                segundo mantém o zeny que você informou e calcula o material, na proporção em que a
                campanha gasta. Os dois miram a mesma chance — material no chão é orçamento no
                alto, e é sempre um ou o outro que sobe.
              </Info>
            </div>

            {recado?.sobre === estoque && (
              <p className="md-corpo-p mt-2.5 rounded-lg bg-atencao-container p-2.5 text-no-atencao-container">
                {recado.texto}
              </p>
            )}
          </div>

          <div>
            <TituloDeSecao
              info={
                <Info titulo="O que você já tem">
                  Só aparecem os materiais que o plano usa, já desmontados até o que se compra de
                  verdade — quem fabrica Bradium tem <strong className="text-texto">Oridecon</strong>{' '}
                  na mochila, não Bradium. O <strong className="text-texto">mínimo</strong> é o que
                  a campanha mais sortuda consumiu: abaixo dele não existe caminho que não precise
                  comprar mais no meio.
                </Info>
              }
              aside={
                <BotaoDoPainel discreto onClick={() => onChange({ ...estoque, itens: {} })}>
                  zerar
                </BotaoDoPainel>
              }
            >
              O que você já tem
            </TituloDeSecao>

            <div className="space-y-2">
              {campanha.materiais.map((m) => (
                <div key={m.itemId} className="flex items-center gap-2">
                  <SlotItem id={m.itemId} tamanho="mini" />
                  <span className="md-corpo-m min-w-0 flex-1">{nomeDoItem(m.itemId)}</span>
                  <span className="md-corpo-p text-suave tabular-nums">
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
    <div className="rounded-xl bg-superficie-baixa p-4">
      <div className="md-rotulo-p flex items-center gap-1 text-suave">
        Chance de chegar ao alvo
        {amostradas && (
          <Info titulo="De onde sai esta chance">
            Esta conta lê uma amostra das campanhas, não todas as{' '}
            {plano.simulacao!.execucoes.toLocaleString('pt-BR')} que deram os percentis acima:
            responder a cada tecla digitada exige tê-las cruas em mãos, e{' '}
            {veredito.execucoes.toLocaleString('pt-BR')} bastam para a chance errar por menos de um
            ponto percentual.
          </Info>
        )}
      </div>
      <div className={'md-display mt-1 tabular-nums ' + corDaChance(veredito.chance)}>
        {chanceLegivel(veredito.chance)}
      </div>
      <p className="md-corpo-m mt-2 text-suave">
        {veredito.chance === 0
          ? `Nenhuma das ${veredito.execucoes.toLocaleString('pt-BR')} campanhas simuladas chegou ao alvo com o que você tem.`
          : veredito.chance === 1
            ? `Todas as ${veredito.execucoes.toLocaleString('pt-BR')} campanhas simuladas chegaram ao alvo com o que você tem.`
            : `${Math.round(veredito.chance * veredito.execucoes).toLocaleString('pt-BR')} das ${veredito.execucoes.toLocaleString('pt-BR')} campanhas simuladas chegaram ao alvo com o que você tem.`}
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
        <div className="mt-4">
          {/* O balão fica FORA do `overflow-x-auto` de propósito: dentro dele,
              uma camada temporária é recortada pela borda da rolagem. */}
          <TituloDeSecao
            info={
              <Info titulo="Acaba em, e comprar" alinhar="direita">
                &ldquo;Acaba em&rdquo; é a fração das campanhas em que o seu estoque daquele
                material termina antes do alvo; &ldquo;comprar&rdquo; é quanto ainda faltaria na
                margem escolhida. Ficar sem material não trava a campanha enquanto houver zeny para
                repor — por isso a chance lá em cima olha o caixa, e esta tabela diz onde ele vai
                ser gasto.
              </Info>
            }
          >
            Onde o seu estoque acaba
          </TituloDeSecao>
          <div className="overflow-x-auto">
          <table className="md-corpo-m w-full">
            <thead>
              <tr className="md-rotulo-p border-b border-borda text-left text-suave">
                <th className="pb-2">Material</th>
                <th className="pb-2 text-right">Você tem</th>
                <th className="pb-2 text-right">Acaba em</th>
                <th className="pb-2 text-right">Comprar ({margemInfo.rotulo})</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-borda/60">
              {veredito.materiais.map((m) => (
                <tr key={m.itemId}>
                  <td className="py-2">
                    <span className="flex items-center gap-2">
                      <SlotItem id={m.itemId} tamanho="mini" />
                      {nomeDoItem(m.itemId)}
                    </span>
                  </td>
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
          </div>
        </div>
      )}
    </div>
  );
}
