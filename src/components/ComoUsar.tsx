import { useState } from 'react';

import { COTACAO } from '../data/defaultPrices';
import { dataBR } from '../format';
import { Botao, NumeroDoPasso } from './ui';

/**
 * Onde a escolha de fechar o guia fica guardada. Um valor qualquer basta: a
 * chave existir é o que diz "já vi".
 */
const CHAVE_GUIA = 'refinometro:guia:v1';

/**
 * Os passos são os painéis do formulário, com o mesmo número que eles levam no
 * título — o guia é a legenda da coluna da esquerda, não um tutorial à parte.
 */
const PASSOS: { titulo: string; texto: string }[] = [
  { titulo: 'Escolha o item', texto: 'Busque pelo nome, ou escolha só a categoria.' },
  { titulo: 'Diga aonde quer chegar', texto: 'O refino e o grau de agora, e os que você quer.' },
  {
    titulo: 'Marque o que pode usar',
    texto: 'Bênção do Ferreiro, minérios especiais, e se aceita perder o item.',
  },
  {
    titulo: 'Confira os preços',
    texto: `Vêm do mercado do LATAM em ${dataBR(COTACAO.geradoEm)}. Ajuste se estiverem diferentes.`,
  },
];

function jaViu(): boolean {
  try {
    return localStorage.getItem(CHAVE_GUIA) !== null;
  } catch {
    return false;
  }
}

/**
 * Se o guia está aberto, e os dois gestos que o mudam.
 *
 * Mora no App, e não no guia, porque são duas pontas: o "Entendi" do guia
 * fecha, o botão do cabeçalho reabre. Fechar é lembrado; reabrir não apaga a
 * lembrança — quem pediu o guia de novo não quer vê-lo a cada visita outra vez.
 */
export function useGuia() {
  const [visivel, setVisivel] = useState(() => !jaViu());

  const fechar = () => {
    try {
      localStorage.setItem(CHAVE_GUIA, '1');
    } catch {
      // Sem armazenamento o guia só volta na próxima visita.
    }
    setVisivel(false);
  };

  return {
    visivel,
    fechar,
    alternar: () => (visivel ? fechar() : setVisivel(true)),
  };
}

/** O atalho do cabeçalho: abre o guia, e fecha quando ele já está aberto. */
export function BotaoDoGuia({ aberto, onAlternar }: { aberto: boolean; onAlternar: () => void }) {
  return (
    <Botao
      variante="texto"
      tamanho="pequeno"
      aria-expanded={aberto}
      aria-controls={aberto ? ID_GUIA : undefined}
      onClick={() => {
        onAlternar();
        // O guia mora logo abaixo do cabeçalho, mas quem clica pode estar no
        // fim da página — e um guia aberto fora da vista parece botão quebrado.
        if (!aberto) window.scrollTo({ top: 0, behavior: 'smooth' });
      }}
    >
      <IconeGuia />
      Como usar
    </Botao>
  );
}

const ID_GUIA = 'guia';

/** Um mapa com a rota marcada: é o "por onde começo", não o "o que é isso". */
function IconeGuia() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="size-[1.15em] shrink-0"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M9 4 3 6v14l6-2 6 2 6-2V4l-6 2-6-2Z" />
      <path d="M9 4v14M15 6v14" />
    </svg>
  );
}

/**
 * O guia de quem chega pela primeira vez.
 *
 * A página explica cada campo num balão (ver `Info`), e isso serve a quem
 * volta: quem chega não sabe por onde começar, nem que a resposta aparece
 * sozinha do outro lado. Quatro passos e uma linha sobre o resultado bastam; o
 * resto continua nos balões. Fechado uma vez, não volta sozinho — quem já usou
 * não precisa dele a cada visita, e quem precisar o reabre pelo cabeçalho.
 */
export function ComoUsar({ visivel, onFechar }: { visivel: boolean; onFechar: () => void }) {
  if (!visivel) return null;

  return (
    <section
      id={ID_GUIA}
      aria-labelledby="como-usar"
      className="mb-4 rounded-2xl bg-painel p-4 shadow-e1 sm:p-5"
    >
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
        <h2 id="como-usar" className="md-titulo-m">
          Como usar
        </h2>
        <Botao tamanho="pequeno" variante="tonal" onClick={onFechar}>
          Entendi
        </Botao>
      </div>

      <ol className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {PASSOS.map((p, i) => (
          <li key={p.titulo} className="flex gap-2">
            <NumeroDoPasso n={i + 1} />
            <span className="md-corpo-m">
              <strong className="block text-texto">{p.titulo}</strong>
              <span className="text-suave">{p.texto}</span>
            </span>
          </li>
        ))}
      </ol>

      <p className="md-corpo-m mt-3 text-suave">
        A resposta aparece sozinha ao lado (no celular, logo abaixo): quanto zeny separar, o passo a
        passo do refino e o que comprar. Na dúvida, o <span aria-hidden>ⓘ</span>
        <span className="sr-only">botão de informação</span> ao lado de cada campo explica o que ele
        faz.
      </p>
    </section>
  );
}
