import type { ReactNode } from 'react';

import { COTACAO } from '../data/defaultPrices';
import { META } from '../data/items';
import { dataBR } from '../format';

/** Uma fonte da tabela de créditos: o que ela fornece e de onde. */
function Fonte({
  o_que,
  href,
  nome,
  children,
}: {
  o_que: string;
  /** Ausente quando a fonte não é um site — o próprio usuário, por exemplo. */
  href?: string;
  nome: string;
  children?: ReactNode;
}) {
  return (
    <div className="grid gap-x-3 gap-y-0.5 sm:grid-cols-[10rem_minmax(0,1fr)]">
      <dt className="font-semibold text-texto">{o_que}</dt>
      <dd>
        {href ? (
          <a
            className="text-realce hover:underline"
            href={href}
            target="_blank"
            rel="noreferrer noopener"
          >
            {nome}
          </a>
        ) : (
          <strong className="text-texto">{nome}</strong>
        )}
        {children}
      </dd>
    </div>
  );
}

/**
 * A proveniência de cada número da tela, aberta dentro da pergunta que a pede.
 *
 * Isto foi um rodapé próprio, com título e botão de abrir só seu, logo abaixo
 * das perguntas frequentes — dois blocos recolhidos em sequência, cada um
 * pedindo um clique, respondendo à mesma dúvida de quem chega de fora. Agora é
 * a resposta longa de uma pergunta da lista: a mesma coisa dita uma vez.
 *
 * O texto curto NÃO está aqui — ele é a resposta em `FAQ`, porque a mesma
 * frase é declarada ao buscador como dado estruturado. O que mora neste
 * arquivo é o que não cabe em texto puro: os links para cada fonte e as
 * ressalvas do que a conta não considera.
 */
export function Fontes() {
  return (
    <div className="mt-3 space-y-4">
      <section>
        <p className="mb-3">
          O alvo é o <strong className="text-texto">Ragnarok Latin America</strong>, e as fontes
          seguem essa ordem: a divulgação de chances da GNJOY Americas, que é a operadora do
          servidor; o Browiki, que é o wiki do LATAM; o Divine Pride no servidor LATAM, que é
          datamine do cliente do jogo; e, só onde nenhum dos três diz nada, o que der para
          conferir no jogo — ou um wiki de fora, sempre marcado como não confirmado por aqui.
        </p>
        <dl className="space-y-2">
          <Fonte
            o_que="Chances de refino e de grau"
            href="https://ro.gnjoyamericas.com/pt/news/probability/2"
            nome="GNJOY Americas — Refinamento"
          >
            {' '}
            e{' '}
            <a
              className="text-realce hover:underline"
              href="https://ro.gnjoyamericas.com/pt/news/probability/27"
            >
              GNJOY Americas — Grau
            </a>
            . É a <strong className="text-texto">divulgação oficial da operadora</strong>: a chance
            de cada nível, com e sem evento, e quais minérios servem a cada categoria. É ela que diz
            que o grau só existe a partir do +11.
          </Fonte>

          <Fonte
            o_que="Minérios e custos de NPC"
            href="https://browiki.org/wiki/Refinamento"
            nome="Browiki — Refinamento"
          >
            {' '}
            e{' '}
            <a className="text-realce hover:underline" href="https://browiki.org/wiki/Grau">
              Browiki — Grau
            </a>
            . A página oficial publica chances, não custos: as penalidades de falha e o que o NPC
            cobra pelos materiais vêm do wiki do LATAM. Onde a ficha do item no jogo contradiz o
            Browiki sobre o que um minério faz, vale a ficha — e o plano avisa no trecho em que
            isso muda o número.
          </Fonte>

          <Fonte
            o_que="Taxa do refinador"
            href="https://ro.gnjoylatam.com/"
            nome="o balcão do NPC"
          >
            {' '}
            — ninguém publica quanto o refinador cobra por tentativa, então as{' '}
            <strong className="text-texto">nove categorias foram conferidas no jogo</strong>: de
            1.000z na arma nv1 a 75.000z na arma nv5, sempre a mesma taxa em qualquer refino até o
            +9. Nas armas, minério de Cash Shop sai por 0z; nos equipamentos, não — lá o
            Enriquecido paga a taxa cheia. Do{' '}
            <strong className="text-texto">+10 para cima a taxa não foi conferida</strong>, e a
            conta assume que ela continua a mesma.
          </Fonte>

          <Fonte
            o_que="Itens da busca"
            href={META.fonte}
            nome={`Divine Pride — servidor ${META.servidor}`}
          >
            {' '}
            — nome, cartas e categoria de refino de{' '}
            <strong className="text-texto">{META.total.toLocaleString('pt-BR')}</strong> itens,
            varridos das páginas públicas em {dataBR(META.geradoEm)}. A
            calculadora usa a ficha só para saber a categoria; o que ela afirma sobre um item pode
            ser conferido clicando no link da ficha.
          </Fonte>

          <Fonte
            o_que="Preços de mercado"
            href={COTACAO.fonte}
            nome={`Consulta de preço — servidor ${COTACAO.servidor}`}
          >
            {' '}
            — o que as lojas de jogador cobraram, em{' '}
            <strong className="text-texto">{COTACAO.janela}</strong>, por{' '}
            <strong className="text-texto">{COTACAO.total}</strong> materiais. Atualizado em{' '}
            {dataBR(COTACAO.geradoEm)}. É só o valor de partida do campo:{' '}
            <strong className="text-texto">a cotação que entra na conta é a sua</strong>, e o
            resultado só vale o que valerem os preços que você colocar.
          </Fonte>
        </dl>
      </section>

      <p>
        <strong className="text-texto">O que a calculadora não considera:</strong> cartas nos itens.
        Também não considera encantamentos, bônus aleatórios, nem Pergaminhos, Cubos e Martelos de
        Refino — que pulam direto para um refino fixo em vez de tentar.
      </p>
      <p>
        Projeto de fã, sem vínculo com a Gravity, a GNJOY Latam ou o Divine Pride. Tudo aqui é do
        Ragnarok Latin America; se o seu servidor rodar valores diferentes, o resultado sai
        diferente.
      </p>
    </div>
  );
}
