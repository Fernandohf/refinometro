import { useState } from 'react';

import { FAQ } from '../data/seo';
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
    </section>
  );
}
