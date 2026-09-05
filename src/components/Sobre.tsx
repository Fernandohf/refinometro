import { FAQ, PAGINAS, PERGUNTA_DAS_FONTES } from '../data/seo';
import { Fontes } from './Fontes';
import { Botao, BotaoDoPainel, IconePergunta } from './ui';

/**
 * O id da seção, que o atalho do cabeçalho persegue.
 *
 * Mora aqui, junto do que ele aponta, e não no cabeçalho: âncora quebrada não
 * dá erro nem aviso — a página simplesmente não rola, e ninguém descobre.
 */
const ANCORA = 'perguntas';

/**
 * As perguntas frequentes, recolhidas.
 *
 * Elas existem para quem ainda não chegou: alguém que digitou "calculadora de
 * refino ragnarok latam" num buscador cai aqui sem saber o que é isto, e a
 * página inteira, do jeito que ela é, responde uma pergunta que essa pessoa
 * ainda não fez — ela vê um orçamento pronto de um item que não escolheu.
 *
 * O parágrafo de abertura fica à vista e as respostas ficam atrás do botão,
 * pelo mesmo motivo do rodapé: é texto para ser lido uma vez, e oito respostas
 * abertas empurrariam a calculadora para longe de quem já sabe usá-la. Fechado,
 * o conteúdo continua no documento — encontrável pelo Ctrl+F e lido pelo
 * rastreador, que renderiza a página antes de indexá-la.
 *
 * O texto vem de `data/seo.ts`, e não daqui, porque as mesmas respostas são
 * declaradas ao buscador como dados estruturados. Duas cópias divergiriam, e a
 * cópia errada seria justamente a que o Google mostra.
 *
 * A proveniência dos números é uma destas perguntas, e não uma seção à parte:
 * ela tinha rodapé próprio, com título e botão de abrir só seu, logo abaixo
 * daqui — dois blocos recolhidos em sequência respondendo ao mesmo tipo de
 * dúvida. Quem quer saber de onde vêm os números procura na lista de
 * perguntas; ter uma segunda lista embaixo só fazia a primeira parecer
 * incompleta.
 *
 * O `aberto` vem de fora, e é o preço de ter um atalho no cabeçalho: um botão
 * que rola até um painel FECHADO entrega um clique e cobra outro, e é assim
 * que um atalho fica pior do que não existir. Quem guarda o estado é o `App`,
 * porque são as duas pontas da página — o cabeçalho e esta seção — que
 * precisam concordar sobre ele.
 */
export function Sobre({
  aberto,
  onAlternar,
}: {
  aberto: boolean;
  onAlternar: () => void;
}) {
  return (
    <section
      id={ANCORA}
      // `scroll-mt` para a seção não colar na borda de cima quando o atalho rola.
      className="md-corpo-p mt-6 scroll-mt-4 rounded-2xl bg-superficie-baixa p-4 text-suave"
    >
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <h2 className="md-rotulo-p text-texto">Perguntas frequentes</h2>
        <BotaoDoPainel aberto={aberto} onClick={onAlternar}>
          {aberto ? 'esconder' : `ver as ${FAQ.length} respostas`}
        </BotaoDoPainel>
      </div>

      <p className="mt-1.5">
        O Refinômetro é uma calculadora e um simulador de refino do{' '}
        <strong className="text-texto">Ragnarok Latam</strong>: você diz o item, o refino atual e
        aonde quer chegar, e ele responde quanto zeny, quantos minérios e quantas cópias do
        equipamento a campanha custa — de graça, no navegador, sem cadastro.
      </p>

      <dl hidden={!aberto} className="mt-4 space-y-3">
        {FAQ.map((f) => (
          <div key={f.pergunta}>
            <dt className="md-corpo-m font-semibold text-texto">{f.pergunta}</dt>
            <dd className="mt-0.5">
              {f.resposta}
              {f.pergunta === PERGUNTA_DAS_FONTES && <Fontes />}
            </dd>
          </div>
        ))}
      </dl>

      <Referencias />
    </section>
  );
}

/**
 * O atalho para as perguntas, no cabeçalho.
 *
 * Ele ABRE a seção além de rolar até ela, e não é um detalhe: as respostas
 * ficam recolhidas, então um atalho que só rolasse entregaria uma caixa
 * fechada a quem acabou de pedir para lê-la — dois cliques para uma vontade
 * só. É por isso que ele recebe `onAbrir` em vez de ser um `<a href>` puro.
 *
 * Vem na ênfase `texto`, e o `Apoiar` ao lado é o contornado: são dois pesos
 * diferentes de propósito. Duas pastilhas iguais no alto de uma calculadora
 * viram barra de navegação, e uma página que responde uma pergunta só não tem
 * para onde navegar.
 */
export function LinkDasPerguntas({ onAbrir }: { onAbrir: () => void }) {
  return (
    <Botao href={`#${ANCORA}`} variante="texto" tamanho="pequeno" onClick={onAbrir}>
      <IconePergunta />
      Perguntas
    </Botao>
  );
}

/**
 * Os links para as tabelas de referência.
 *
 * Ficam à vista, e não atrás do botão, por duas razões que apontam para o mesmo
 * lugar. Para quem lê: a pessoa que chegou aqui procurando "chance de refino
 * +12" quer a tabela, não um orçamento, e escondê-la atrás de um clique é
 * mandá-la de volta para o buscador. Para quem indexa: uma página que só o
 * sitemap conhece é rastreada com má vontade e some do índice na primeira
 * faxina — o que a mantém viva é link de dentro do site apontando para ela, e a
 * calculadora é a página com mais autoridade para emprestar.
 *
 * `BASE_URL` é o que o Vite resolve: `/refinometro/` no build, `/` em dev. Um
 * link escrito à mão como `/tabela-de-refino/` funcionaria em dev e cairia num
 * 404 em produção, que é a espécie de erro que só aparece depois de publicado.
 */
function Referencias() {
  return (
    <p className="mt-3 border-t border-borda pt-3">
      <span className="text-texto">Tabelas de referência:</span>{' '}
      {PAGINAS.map((pagina, i) => (
        <span key={pagina.slug}>
          {i > 0 && ' · '}
          <a className="text-realce hover:underline" href={`${import.meta.env.BASE_URL}${pagina.slug}/`}>
            {pagina.rotulo}
          </a>
        </span>
      ))}
    </p>
  );
}
