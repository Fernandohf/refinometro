import { Botao, BotaoCafe, BotaoPix, IconeCafe } from './ui';

/*
  O pedido de apoio: o café, o Pix e o link discreto do topo.

  Mora num arquivo só porque as duas pontas — a do topo e a do fim — precisam
  concordar sobre o mesmo âncora e o mesmo texto. Espalhado, o link do
  cabeçalho apontaria para um id que alguém renomeou no rodapé, e ninguém
  descobriria: um âncora quebrado não dá erro, só não rola.
*/

/** O id que o link do topo persegue. */
const ANCORA = 'apoiar';

/**
 * A chave Pix (aleatória) e o código "copia e cola" que a carrega.
 *
 * São a MESMA doação por dois caminhos: quem prefere digitar usa a chave, quem
 * prefere colar usa o código. O código é um payload EMV estático — sem valor,
 * para a pessoa escolher quanto —, e o `6636` do fim é o CRC dele: mexer em
 * qualquer caractere daqui sem recalcular o CRC produz um código que o
 * aplicativo do banco recusa sem dizer por quê.
 *
 * Exportado para o teste poder conferir o CRC: o código nunca chega ao HTML —
 * ele só existe dentro do clique que copia —, então não há como pescá-lo da
 * tela renderizada, e um caractere trocado aqui só apareceria no aplicativo do
 * banco de quem tentou doar.
 */
export const PIX = {
  chave: 'dede1a1e-bbe2-48ca-b972-00e26b7b217c',
  nome: 'Fernando H Fernandes',
  // prettier-ignore
  codigo: '00020101021126580014br.gov.bcb.pix0136dede1a1e-bbe2-48ca-b972-00e26b7b217c5204000053039865802BR5920FERNANDO H FERNANDES6013PAU DOS FERRO62070503***63046636',
} as const;

/**
 * O bloco de apoio, no fim da página.
 *
 * Ele era uma linha no rodapé, embaixo das ressalvas de proveniência: um
 * parágrafo e um botão, no lugar onde a página já tinha acabado. Agora é um
 * cartão próprio, com título, porque o pedido é a última coisa que a página
 * pede e não pode parecer nota de rodapé de outra coisa.
 *
 * "Um pouco mais de destaque" é literal, e o limite também: o cartão não tem
 * cor de fundo diferente, não pisca, não abre sozinho e continua DEPOIS do
 * resultado, das perguntas e das fontes. Quem veio pela conta rola até aqui
 * por vontade própria; quem não rolar não perde nada.
 *
 * As duas opções não têm o mesmo peso de propósito. O café é o botão
 * preenchido — é o caminho que aceita cartão de qualquer lugar. O Pix é
 * contornado: serve a quem está no Brasil, que é quase todo mundo aqui, e por
 * isso está presente, mas dois botões preenchidos lado a lado só fariam a
 * pessoa parar para escolher.
 */
export function Apoie() {
  return (
    <section
      id={ANCORA}
      // `scroll-mt` para o link do topo não encostar o cartão na borda da tela.
      className="md-corpo-p mt-6 scroll-mt-4 rounded-2xl bg-superficie-baixa p-4 text-suave"
    >
      <h2 className="md-rotulo-p text-texto">Apoie o Refinômetro</h2>

      <p className="mt-1.5">
        Sem anúncio, sem cadastro e sem custo — e vai continuar assim. Se a conta te poupou zeny,
        dá para retribuir por aqui:
      </p>

      <div className="mt-3 flex flex-wrap items-center gap-3">
        <BotaoCafe href="https://buymeacoffee.com/fernandohf">Me pague um café</BotaoCafe>
        <BotaoPix codigo={PIX.codigo} />
      </div>

      {/*
        A chave fica à vista, e não só dentro do botão, por dois motivos. Quem
        desconfia de um botão que copia algo invisível pode conferir o que vai
        colar; e quando a cópia falha — navegador embutido de aplicativo, um
        `http://` de rede local — esta linha é o plano B, selecionável à mão.
      */}
      <p className="md-corpo-m mt-2.5">
        Chave Pix aleatória:{' '}
        <code className="font-mono text-texto select-all">{PIX.chave}</code> ·{' '}
        {PIX.nome}
      </p>
    </section>
  );
}

/**
 * O atalho de apoio no cabeçalho.
 *
 * Fica no topo porque quem quer apoiar não deveria ter que rolar a página
 * inteira para descobrir que dá. E ele não leva para fora: rola até o bloco do
 * fim, onde as duas opções estão explicadas — mandar alguém direto para um
 * checkout a partir do topo de uma calculadora que a pessoa ainda não usou
 * seria pedir antes de entregar.
 *
 * É o `Botao` do sistema, contornado e na medida pequena — a mesma peça do
 * "editar" de cada painel, com a mesma altura, a mesma ondulação e a mesma
 * película de estado. A primeira versão era texto cinza solto com um emoji de
 * caneca na frente, e ficava esquisito por três motivos de uma vez: o emoji é
 * colorido no meio de uma interface cujos ícones todos são desenhados em
 * `currentColor`; cinza sobre o cabeçalho não parecia clicável; e sem caixa
 * nem altura ele não tinha alvo de toque, só um punhado de letras. Agora é
 * pequeno E é um botão, que são coisas diferentes.
 */
export function LinkDeApoio() {
  return (
    <Botao href={`#${ANCORA}`} variante="contornado" tamanho="pequeno">
      <IconeCafe />
      Apoiar
    </Botao>
  );
}
