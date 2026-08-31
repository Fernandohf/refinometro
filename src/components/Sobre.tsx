import { useState } from 'react';

import { FAQ, PAGINAS } from '../data/seo';
import { BotaoDoPainel } from './ui';

/**
 * As perguntas frequentes, recolhidas.
 *
 * Elas existem para quem ainda não chegou: alguém que digitou "calculadora de
 * refino ragnarok latam" num buscador cai aqui sem saber o que é isto, e a
 * página inteira, do jeito que ela é, responde uma pergunta que essa pessoa
 * ainda não fez — ela vê um orçamento pronto de um item que não escolheu.
 *
 * O parágrafo de abertura fica à vista e as respostas ficam atrás do botão,
 * pelo mesmo motivo do rodapé: é texto para ser lido uma vez, e sete respostas
 * abertas empurrariam a calculadora para longe de quem já sabe usá-la. Fechado,
 * o conteúdo continua no documento — encontrável pelo Ctrl+F e lido pelo
 * rastreador, que renderiza a página antes de indexá-la.
 *
 * O texto vem de `data/seo.ts`, e não daqui, porque as mesmas respostas são
 * declaradas ao buscador como dados estruturados. Duas cópias divergiriam, e a
 * cópia errada seria justamente a que o Google mostra.
 */
export function Sobre() {
  const [aberto, setAberto] = useState(false);

  return (
    <section className="md-corpo-p mt-6 rounded-2xl bg-superficie-baixa p-4 text-suave">
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <h2 className="md-rotulo-p text-texto">Perguntas frequentes</h2>
        <BotaoDoPainel aberto={aberto} onClick={() => setAberto((a) => !a)}>
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
            <dd className="mt-0.5">{f.resposta}</dd>
          </div>
        ))}
      </dl>

      <Referencias />
    </section>
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
