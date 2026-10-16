import { useEffect, useMemo, useState } from 'react';

import { nomeDoItem } from '../data/nomes';
import {
  avaliarEstoque,
  emMateriais,
  ondeAcaba,
  type CampanhaEmMateriais,
  type Estoque,
  type Recurso,
  type Travamento,
  type VereditoEstoque,
} from '../engine/estoque';
import { estoqueDoKit, faltaParaOKit, type Kit } from '../engine/kit';
import type { Resultado as ResultadoPlano } from '../engine/plan';
import type { CalcInput } from '../engine/types';
import { porcento, zeny, zenyExato } from '../format';
import { MARGENS, type MargemKey } from './Resultado';
import {
  Botao,
  BotaoDoPainel,
  Campo,
  Info,
  NumeroComPasso,
  Painel,
  TituloDeSecao,
  passoDe,
  passoDeZeny,
} from './ui';
import { SlotItem } from './ItemNoJogo';

/**
 * O estoque como ele fica salvo entre visitas.
 *
 * Guarda, além dos números, a pergunta que os gerou: a chance mirada e a
 * assinatura do plano. É o que distingue "a pessoa quis 300 Elunium" de "a tela
 * ainda não preencheu nada" — sem isso, ou o preenchimento automático apagaria
 * o que foi digitado a cada render, ou nunca voltaria a rodar.
 */
export interface EstoqueSalvo extends Estoque {
  /** Chance que o preenchimento automático mirou — a do nível de segurança. */
  alvo: number;
  /** A pergunta que produziu estes números (ver `assinaturaDoPlano`). */
  assinatura: string;
}

export const ESTOQUE_VAZIO: EstoqueSalvo = {
  zeny: 0,
  itens: {},
  copias: 1,
  alvo: 0.9,
  assinatura: '',
};

/**
 * Contagem inteira. Aqui nada é média: o que a pessoa tem na mochila e o que
 * ainda falta são unidades contadas, e "7,0 Bênção" só atrapalha.
 */
const inteiro = (n: number) => Math.max(0, Math.ceil(n)).toLocaleString('pt-BR');

/**
 * A pergunta que o preenchimento automático responde, em uma linha.
 *
 * Muda o item, o alvo, as condições, a chance mirada ou a própria lista de
 * materiais e os números sugeridos deixam de valer — a tela repõe. O preço
 * **não** entra: ele mexe no zeny recomendado, mas quem está ajustando o preço
 * do Elunium não quer ver as quantidades que acabou de digitar sumirem a cada
 * tecla. O que entra é o efeito do preço que importa aqui — quando ele troca o
 * minério da estratégia, um campo novo apareceria zerado e vermelho sem que
 * ninguém o tivesse zerado.
 */
export function assinaturaDoPlano(input: CalcInput, alvo: number, materiais: number[]): string {
  return [
    input.kind,
    input.refinoAtual,
    input.refinoAlvo,
    input.grauAtual,
    input.grauAlvo,
    input.evento ? 'ev' : '-',
    input.usarBencaoFerreiro ? 'bf' : '-',
    input.usarMineriosEspeciais ? 'me' : '-',
    input.perdaAceitavel ? 'perda' : 'seguro',
    alvo,
    materiais.join(','),
  ].join('|');
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
  kit,
  margem,
  estoque,
  onChange,
}: {
  plano: ResultadoPlano;
  /**
   * O kit do "o que ter em mãos", no nível de segurança da página. É o que
   * preenche os campos: a lista de compras e esta aba falam das mesmas
   * quantidades, e o nível se escolhe num lugar só.
   */
  kit: Kit;
  margem: MargemKey;
  estoque: EstoqueSalvo;
  onChange: (e: EstoqueSalvo) => void;
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

  /*
    O preenchimento automático é DERIVADO, e não um efeito que escreve estado.

    Escrito num `useEffect`, o primeiro quadro mostraria a mochila vazia e o
    segundo a preencheria — e no render de servidor, que não roda efeitos, os
    campos ficariam em zero para sempre. Derivando aqui, a tela nunca chega a
    existir despreenchida; o efeito logo abaixo só devolve o resultado ao App,
    que é quem guarda o estoque e o salva.
  */
  const margemInfo = MARGENS.find((m) => m.key === margem)!;
  const alvo = margemInfo.chance;
  const assinatura = assinaturaDoPlano(
    plano.input,
    alvo,
    campanha?.materiais.map((m) => m.itemId) ?? [],
  );
  const recomendado = useMemo(
    () => (campanha ? estoqueDoKit(kit, plano.input.precos) : null),
    [campanha, kit, plano.input.precos],
  );
  const efetivo: EstoqueSalvo =
    recomendado && assinatura !== estoque.assinatura
      ? { ...recomendado, alvo, assinatura }
      : estoque;

  useEffect(() => {
    if (efetivo !== estoque) onChange(efetivo);
  });

  const veredito = useMemo(
    () => (campanha ? avaliarEstoque(campanha, efetivo) : null),
    [campanha, efetivo],
  );

  const noRecomendado =
    !!recomendado &&
    recomendado.zeny === efetivo.zeny &&
    recomendado.copias === efetivo.copias &&
    Object.entries(recomendado.itens).every(([id, q]) => (efetivo.itens[Number(id)] ?? 0) === q);

  const mexer = (mudanca: Partial<Estoque>) => onChange({ ...efetivo, ...mudanca });

  return (
    <Painel
      titulo="Dá com o que eu tenho?"
      info={
        <Info titulo="Dá com o que eu tenho?">
          A conta não é outra simulação: são as mesmas campanhas já sorteadas, lidas de outro jeito
          — por isso a resposta acompanha a digitação. Aqui a mochila é o que é:{' '}
          <strong className="text-texto">o zeny não compra minério que faltar</strong>, ele paga só
          o que não se carrega — a taxa do refinador, a taxa de cada tentativa de Grau e o balcão do
          NPC. Faltou minério, a campanha para ali.
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
          Os campos já vêm com o kit do nível escolhido — baixe o que você não tem e veja a resposta
          mudar.
          {veredito && (
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
          {/* O nível de segurança é o do topo da página, e não um seletor
              daqui: eram dois controles para a mesma pergunta, com escalas
              diferentes, e cada um preenchia números diferentes para o mesmo
              minério. */}
          <div className="rounded-lg border border-borda bg-fundo/40 p-3">
            <p className="md-corpo-p flex flex-wrap items-center gap-x-1.5 gap-y-1 text-suave">
              <span>
                Preenchido com o kit do nível{' '}
                <strong className="text-texto">
                  {margemInfo.rotulo} ({margemInfo.pct})
                </strong>
                , escolhido lá em cima.
              </span>
              <Info titulo="De onde saem os valores preenchidos" alinhar="direita">
                É o kit do “o que ter em mãos”, desmontado até o que se compra. Não é o percentil
                de cada recurso lido em separado: a campanha que estoura o minério não é a mesma que
                estoura o caixa, e levar o percentil 90 de cinco coisas dá bem menos que 90% de
                chance de não faltar nenhuma. O kit é a mochila mais barata que, inteira, fecha a
                fração pedida — por isso a chance logo abaixo sai igual ou um pouco acima dela.
              </Info>
            </p>

            <p className="md-corpo-p mt-2.5 text-suave">
              {noRecomendado ? (
                <>Tudo abaixo está no kit recomendado. Baixe o que você não tem.</>
              ) : (
                <>
                  Você mexeu nos valores.{' '}
                  <Botao
                    variante="contornado"
                    tamanho="pequeno"
                    className="align-middle"
                    onClick={() => recomendado && onChange({ ...recomendado, alvo, assinatura })}
                  >
                    repor o recomendado
                  </Botao>
                </>
              )}
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <Campo
              label="Zeny para as taxas"
              dica="É só isso que o zeny paga aqui: a taxa do refinador, a taxa de cada tentativa de Grau e o balcão do NPC que fabrica os intermediários. Minério que faltar não sai daqui — ele tem de estar na mochila."
              apoio={<Piso valor={efetivo.zeny} piso={campanha.piso.zeny} formatar={zeny} />}
            >
              <NumeroComPasso
                rotulo="Zeny para as taxas"
                value={efetivo.zeny}
                onChange={(v) => mexer({ zeny: v })}
                passo={passoDeZeny(recomendado?.zeny || efetivo.zeny)}
                minimo={campanha.piso.zeny}
                sufixo="z"
              />
            </Campo>
            <Campo
              label="Cópias do item"
              dica={`Contando a sua, no +${plano.input.refinoAtual}. As de reposição entram no +0 — e, como o minério, elas precisam já estar em mãos.`}
              apoio={
                <Piso
                  valor={efetivo.copias}
                  piso={campanha.piso.copias}
                  formatar={(n) => `${inteiro(n)}`}
                />
              }
            >
              <NumeroComPasso
                rotulo="Cópias do item"
                value={efetivo.copias}
                onChange={(v) => mexer({ copias: v })}
                passo={1}
                minimo={campanha.piso.copias}
                minimoDoCampo={1}
              />
            </Campo>
          </div>

          <div>
            <TituloDeSecao
              info={
                <Info titulo="O que você já tem">
                  Só aparecem os materiais que o plano usa, já desmontados até o que se compra de
                  verdade — quem fabrica Bradium tem <strong className="text-texto">Oridecon</strong>{' '}
                  na mochila, não Bradium. O <strong className="text-texto">mínimo</strong> é o que
                  a campanha mais sortuda consumiu: abaixo dele não existe caminho nenhum, porque o
                  que falta de minério não se resolve com zeny.
                </Info>
              }
              aside={
                <BotaoDoPainel discreto onClick={() => mexer({ itens: {} })}>
                  zerar
                </BotaoDoPainel>
              }
            >
              O que você já tem
            </TituloDeSecao>

            <div className="space-y-2">
              {campanha.materiais.map((m) => {
                const tem = efetivo.itens[m.itemId] ?? 0;
                const piso = campanha.piso.itens[m.itemId] ?? 0;
                return (
                  // Largo, a linha inteira cabe de uma vez. Estreito, o passo
                  // cai para a linha de baixo (`w-full`) em vez de espremer o
                  // nome do minério até ele quebrar no meio da palavra.
                  <div key={m.itemId} className="flex flex-wrap items-center gap-x-3 gap-y-2">
                    <SlotItem id={m.itemId} tamanho="mini" />
                    <span className="md-corpo-m min-w-[7rem] flex-1">{nomeDoItem(m.itemId)}</span>
                    <Piso valor={tem} piso={piso} formatar={inteiro} />
                    <div className="w-full shrink-0 sm:w-48">
                      <NumeroComPasso
                        rotulo={nomeDoItem(m.itemId)}
                        value={tem}
                        onChange={(v) => mexer({ itens: { ...efetivo.itens, [m.itemId]: v } })}
                        passo={passoDe(recomendado?.itens[m.itemId] || m.media)}
                        minimo={piso}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <Veredito
            veredito={veredito}
            estoque={efetivo}
            recomendado={recomendado}
            campanha={campanha}
            margem={margem}
            plano={plano}
          />
        </div>
      )}
    </Painel>
  );
}

/**
 * O chão de um campo: discreto enquanto o valor o respeita, vermelho e explícito
 * quando não.
 *
 * Abaixo do piso a resposta é 0% — não "improvável", *impossível*: nem a mais
 * sortuda das cinco mil campanhas simuladas fecha com menos que aquilo. Dizer
 * só "0%" lá embaixo deixaria a pessoa procurando qual dos seis campos derrubou
 * a conta.
 */
function Piso({
  valor,
  piso,
  formatar,
}: {
  valor: number;
  piso: number;
  formatar: (n: number) => string;
}) {
  if (valor >= piso) {
    return <span className="md-corpo-p text-suave tabular-nums">mín. {formatar(piso)}</span>;
  }
  return (
    <span className="md-corpo-p text-perigo tabular-nums">
      impossível abaixo de {formatar(piso)}
    </span>
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
  recomendado,
  campanha,
  margem,
  plano,
}: {
  veredito: VereditoEstoque;
  estoque: Estoque;
  /** O kit desmontado, que preencheu os campos: a régua do que falta. */
  recomendado: Estoque | null;
  campanha: CampanhaEmMateriais;
  margem: MargemKey;
  plano: ResultadoPlano;
}) {
  const margemInfo = MARGENS.find((m) => m.key === margem)!;
  // Uma régua só para "o que falta": o kit. Antes cada recurso tinha a sua — o
  // percentil dele mesmo —, e a soma das faltas não devolvia chance nenhuma.
  const falta = recomendado ? faltaParaOKit(recomendado, estoque, campanha) : null;
  const faltaPorItem = new Map(falta?.itens.map((l) => [l.itemId, l.qtd]) ?? []);
  const copiasFaltantes = falta?.copias ?? 0;
  // O veredito sai das execuções guardadas cruas, que num alvo barato são menos
  // que as simuladas. Dizer isso evita que os dois números pareçam brigar.
  const amostradas = veredito.execucoes < (plano.simulacao?.execucoes ?? 0);

  // O que está abaixo do chão do possível — a explicação de um 0% que não tem
  // nada de aleatório.
  const impossiveis: string[] = [];
  if (estoque.zeny < campanha.piso.zeny) impossiveis.push('o zeny em caixa');
  if (estoque.copias < campanha.piso.copias) impossiveis.push('as cópias do item');
  for (const m of campanha.materiais) {
    if ((estoque.itens[m.itemId] ?? 0) < (campanha.piso.itens[m.itemId] ?? 0)) {
      impossiveis.push(nomeDoItem(m.itemId));
    }
  }

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

      {impossiveis.length > 0 && (
        <p className="md-corpo-m mt-3 rounded-lg bg-perigo-container p-2.5 text-no-perigo-container">
          Abaixo do mínimo em {listar(impossiveis)}: com menos que isso não existe caminho nenhum
          até o alvo, nem com a melhor sorte das {veredito.execucoes.toLocaleString('pt-BR')}{' '}
          campanhas simuladas. O campo em vermelho diz de quanto ele precisa.
        </p>
      )}

      {falta && falta.valor > 0 && (
        <div className="mt-3 rounded-lg bg-atencao-container p-3 text-no-atencao-container">
          <p className="md-corpo-m">
            Para fechar o kit do nível <strong>{margemInfo.rotulo}</strong>, falta comprar{' '}
            <strong className="tabular-nums" title={zenyExato(falta.valor)}>
              {zeny(falta.valor)}
            </strong>
            :
          </p>
          <ul className="md-corpo-m mt-2 space-y-1">
            {falta.itens.map((l) => (
              <li key={l.itemId} className="flex items-center gap-2">
                <SlotItem id={l.itemId} tamanho="mini" />
                <span className="min-w-0 flex-1">
                  <strong className="tabular-nums">{inteiro(l.qtd)}x</strong> {nomeDoItem(l.itemId)}
                </span>
                <span className="shrink-0 tabular-nums opacity-80" title={zenyExato(l.valor)}>
                  {zeny(l.valor)}
                </span>
              </li>
            ))}
            {falta.copias > 0 && (
              <li className="flex items-center gap-2">
                <span className="min-w-0 flex-1">
                  <strong className="tabular-nums">{inteiro(falta.copias)}x</strong> cópia
                  {falta.copias === 1 ? '' : 's'} do item, no +0
                </span>
                <span className="shrink-0 tabular-nums opacity-80">
                  {zeny(falta.copias * campanha.precoItem)}
                </span>
              </li>
            )}
            {falta.zeny > 0 && (
              <li className="flex items-center gap-2">
                <span className="min-w-0 flex-1">Zeny a mais para as taxas</span>
                <span className="shrink-0 tabular-nums opacity-80" title={zenyExato(falta.zeny)}>
                  {zeny(falta.zeny)}
                </span>
              </li>
            )}
          </ul>
          <p className="md-corpo-p mt-2 opacity-80">
            Com isso, a chance volta a pelo menos {margemInfo.pct}.
          </p>
        </div>
      )}

      {veredito.fracaoSoPorZeny >= 0.005 && (
        <p className="mt-2 text-sm leading-relaxed text-suave">
          Em <strong className="text-atencao">{porcento(veredito.fracaoSoPorZeny)}</strong> das
          campanhas o material e as cópias bastavam, e o que travou foi só o caixa — é a parcela que
          mais zeny resolve sozinho.
        </p>
      )}

      {/* Só quando a chance é baixa. Acima de 50% a pergunta "onde eu travo?"
          é uma curiosidade sobre a minoria azarada; abaixo dela é a pergunta
          principal, porque é ela que diz o que comprar — ou que o alvo é que
          está errado. */}
      {veredito.chance < 0.5 && <OndeTrava campanha={campanha} estoque={estoque} />}

      {copiasFaltantes > 0 && (
        <p className="mt-2 text-sm leading-relaxed">
          Nesse nível o equipamento quebra: {copiasFaltantes === 1 ? 'falta' : 'faltam'}{' '}
          <strong className="text-perigo">
            {copiasFaltantes} {copiasFaltantes === 1 ? 'cópia' : 'cópias'}
          </strong>{' '}
          a mais no +0, e elas precisam estar em mãos antes de começar. Você fica parado se elas não
          estiverem à venda.
        </p>
      )}

      {(veredito.materiais.some((m) => m.tem > 0) || estoque.copias > 1) && (
        <div className="mt-4">
          {/* O balão fica FORA do `overflow-x-auto` de propósito: dentro dele,
              uma camada temporária é recortada pela borda da rolagem. */}
          <TituloDeSecao
            info={
              <Info titulo="Acaba em, e falta" alinhar="direita">
                &ldquo;Acaba em&rdquo; é a fração das campanhas em que o seu estoque daquele
                material termina antes do alvo — e, como o zeny não repõe minério, cada uma dessas
                campanhas é uma que não fecha. &ldquo;Falta&rdquo; é quanto falta para o kit do
                nível escolhido, o mesmo que preencheu os campos.
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
                  <th className="pb-2 text-right">Falta</th>
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
                      {inteiro(faltaPorItem.get(m.itemId) ?? 0)}
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

/** "a, b e c" — a vírgula do português, com o "e" antes do último. */
function listar(itens: string[]): string {
  if (itens.length <= 1) return itens[0] ?? '';
  return `${itens.slice(0, -1).join(', ')} e ${itens[itens.length - 1]}`;
}

/**
 * Onde a campanha morre, quando a chance é baixa.
 *
 * "30%" diz que provavelmente não dá; não diz se o problema é o último degrau
 * ou o terceiro, nem o que comprar a mais. A trilha abaixo põe as campanhas que
 * travam sobre o caminho inteiro — cada marco é um degrau de refino ou um grau
 * conquistado —, e a tabela diz quem acabou primeiro.
 */
function OndeTrava({ campanha, estoque }: { campanha: CampanhaEmMateriais; estoque: Estoque }) {
  const t = useMemo(() => ondeAcaba(campanha, estoque), [campanha, estoque]);
  if (!t) return null;

  const pico = Math.max(...t.porMarco);

  return (
    <div className="mt-4">
      <TituloDeSecao
        info={
          <Info titulo="Onde a campanha para" alinhar="direita">
            Cada risco é um ponto do caminho: um degrau de refino conquistado ou um grau que passou.
            A altura diz em quantas das campanhas que travam o estoque acabou ali. Como o consumo
            só cresce, o ponto de parada é o primeiro marco em que algum recurso passa do que você
            tem — e o recurso que chega lá primeiro é o da tabela.
            <br />
            <br />
            Esta leitura vem de {t.execucoes.toLocaleString('pt-BR')} campanhas, não das 5 mil da
            chance acima: guardar a trajetória inteira custa uma matriz por execução, e a resposta
            aqui é grossa — um degrau de refino.
          </Info>
        }
      >
        Onde a campanha para
      </TituloDeSecao>

      {/* A trilha inteira, marco a marco, na ordem em que a campanha os cruza.
          Os rótulos se repetem entre fases (todo preparo passa pelo +7), então
          é a posição, e não o número, que diz onde se está. */}
      <div className="flex gap-px" aria-hidden>
        {t.porMarco.map((fracao, m) => {
          const marco = t.marcos[m]!;
          const mediana = m === t.marcoP50;
          // Um respiro onde a campanha troca de fase: sem ele, o `+11` do
          // preparo e o `+1` do refino seguinte encostam como se fossem
          // degraus vizinhos do mesmo trecho — e não são.
          const novaFase = m > 0 && marco.faseRotulo !== t.marcos[m - 1]!.faseRotulo;
          return (
            <div
              key={m}
              title={`${marco.rotulo} — ${marco.faseRotulo}: ${porcento(fracao)} das campanhas que travam`}
              className={'flex h-8 flex-1 items-end' + (novaFase ? ' ml-2' : '')}
            >
              <div
                className={
                  'w-full rounded-t-sm transition-[height] duration-200 ease-padrao ' +
                  // Marco onde ninguém para não é um risco baixo: é a linha de
                  // base do caminho, e pinta de cinza como na trilha de refino.
                  (fracao === 0
                    ? 'bg-borda'
                    : mediana
                      ? 'bg-perigo'
                      : marco.tipo === 'grau'
                        ? 'bg-atencao'
                        : 'bg-perigo/45')
                }
                style={{ height: `${Math.max(6, (100 * fracao) / (pico || 1))}%` }}
              />
            </div>
          );
        })}
      </div>
      <div className="mt-1 flex justify-between">
        <span className="md-corpo-p text-suave">{rotuloDoMarco(t, 0)}</span>
        <span className="md-corpo-p text-suave">{rotuloDoMarco(t, t.marcos.length - 1)}</span>
      </div>

      <p className="md-corpo-m mt-2 leading-relaxed">
        Metade das campanhas que não fecham para até{' '}
        <strong className="text-perigo">{rotuloDoMarco(t, t.marcoP50)}</strong>
        {t.marcoP25 !== t.marcoP50 && (
          <>
            {' '}
            — um quarto delas nem chega a {rotuloDoMarco(t, t.marcoP25)}
          </>
        )}
        .
      </p>

      <div className="mt-3 overflow-x-auto">
        <table className="md-corpo-m w-full">
          <thead>
            <tr className="md-rotulo-p border-b border-borda text-left text-suave">
              <th className="pb-2">Acaba primeiro</th>
              <th className="pb-2 text-right">Das que travam</th>
              <th className="pb-2 text-right">Normalmente em</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-borda/60">
            {t.culpados
              // Um culpado de 1% é ruído da amostra, não um recado.
              .filter((c) => c.fracao >= 0.02)
              .map((c) => (
                <tr key={chaveDoRecurso(c.recurso)}>
                  <td className="py-2">
                    <span className="flex items-center gap-2">
                      {c.recurso.tipo === 'material' && (
                        <SlotItem id={c.recurso.itemId} tamanho="mini" />
                      )}
                      {nomeDoRecurso(c.recurso)}
                    </span>
                  </td>
                  <td className="py-2 text-right font-medium tabular-nums">
                    {porcento(c.fracao)}
                  </td>
                  <td className="py-2 text-right text-suave">{rotuloDoMarco(t, c.marco)}</td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/**
 * O marco por extenso: o ponto e a fase.
 *
 * A fase não é enfeite — numa campanha de grau o `+7` acontece três vezes, uma
 * por subida, e sem dizer qual delas o número é ambíguo. Nas campanhas de uma
 * fase só, ela é omitida por não separar nada.
 */
function rotuloDoMarco(t: Travamento, m: number): string {
  const marco = t.marcos[m];
  if (!marco) return '—';
  const uma = t.marcos.every((x) => x.faseRotulo === t.marcos[0]!.faseRotulo);
  if (uma || marco.tipo === 'grau') return marco.rotulo;
  return `${marco.rotulo} (${faseCurta(marco.faseRotulo)})`;
}

/** "Refinar +0 → +11 (para o grau D)" vira "para o grau D"; o resto, "refino final". */
function faseCurta(rotulo: string): string {
  const entre = rotulo.match(/\(([^)]+)\)\s*$/);
  return entre ? entre[1]! : rotulo;
}

function nomeDoRecurso(r: Recurso): string {
  if (r.tipo === 'material') return nomeDoItem(r.itemId);
  return r.tipo === 'zeny' ? 'Zeny de taxa e balcão' : 'Cópias do item';
}

function chaveDoRecurso(r: Recurso): string {
  return r.tipo === 'material' ? `m${r.itemId}` : r.tipo;
}
