import { useSyncExternalStore } from 'react';

import { CHAVE_TEMA, COR_DA_BARRA, type Tema } from '../data/tema';
import { Botao } from './ui';

/*
  O tema vigente é o `data-tema` do `<html>`, que o script do `<head>` já
  preencheu antes do React existir (ver `src/data/tema.ts`). O botão não guarda
  cópia dele em estado: observa o atributo. É o que mantém os dois de acordo
  quando quem muda o tema é o sistema, e não o clique — o script troca o
  atributo, e o ícone acompanha sozinho.
*/

function temaAtual(): Tema {
  return document.documentElement.dataset.tema === 'claro' ? 'claro' : 'escuro';
}

function observar(avisar: () => void) {
  const observador = new MutationObserver(avisar);
  observador.observe(document.documentElement, { attributeFilter: ['data-tema'] });
  return () => observador.disconnect();
}

/**
 * Fixa o tema e guarda a escolha. Depois do primeiro clique o sistema deixa de
 * mandar: quem escolheu o claro às 23h não quer o escuro de volta sozinho.
 *
 * Repete o que o script do `<head>` faz ao aplicar, de propósito — o script é
 * texto embutido e não exporta nada para cá.
 */
function escolher(tema: Tema) {
  document.documentElement.dataset.tema = tema;
  for (const meta of document.querySelectorAll('meta[name="theme-color"]')) {
    meta.setAttribute('content', COR_DA_BARRA[tema]);
  }
  try {
    localStorage.setItem(CHAVE_TEMA, tema);
  } catch {
    // Armazenamento bloqueado: o tema vale até a página fechar, e é só isso.
  }
}

/** Sol: o que o botão mostra no escuro, porque é para lá que ele leva. */
function IconeSol() {
  return (
    <svg viewBox="0 0 24 24" className="size-[1.25em] shrink-0" aria-hidden>
      <circle cx="12" cy="12" r="4.2" fill="currentColor" />
      <path
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        d="M12 2.5v2.2M12 19.3v2.2M2.5 12h2.2M19.3 12h2.2M5.3 5.3l1.55 1.55M17.15 17.15l1.55 1.55M5.3 18.7l1.55-1.55M17.15 6.85l1.55-1.55"
      />
    </svg>
  );
}

/** Lua, pela mesma razão: aparece no claro. */
function IconeLua() {
  return (
    <svg viewBox="0 0 24 24" className="size-[1.25em] shrink-0" aria-hidden>
      <path fill="currentColor" d="M20.5 14.6A8.6 8.6 0 0 1 9.4 3.5a8.6 8.6 0 1 0 11.1 11.1Z" />
    </svg>
  );
}

/**
 * Alterna entre o tema claro e o escuro.
 *
 * Mostra o tema para onde LEVA, e não o atual: é a convenção de quase todo
 * site, e o rótulo acessível diz a ação por extenso para não depender dela.
 * Fica no cabeçalho, ao lado de "Perguntas", como botão de texto só com ícone —
 * é preferência de quem lê, não ação da calculadora, e não deve pesar mais que
 * os vizinhos.
 */
export function BotaoTema() {
  // No servidor não há tema; o escuro é o padrão do site.
  const tema = useSyncExternalStore(observar, temaAtual, () => 'escuro' as const);
  const outro: Tema = tema === 'claro' ? 'escuro' : 'claro';
  const rotulo = outro === 'claro' ? 'Usar tema claro' : 'Usar tema escuro';

  return (
    <Botao
      variante="texto"
      tamanho="pequeno"
      onClick={() => escolher(outro)}
      aria-label={rotulo}
      title={rotulo}
      // Quadrado: sem rótulo escrito, a folga lateral do botão pequeno sobra.
      // O `!` porque o `px-3` da medida pequena vem na mesma lista, e entre
      // duas utilidades da mesma propriedade quem decide é a ordem do CSS
      // gerado, não a do `className`.
      className="w-8 px-0!"
    >
      {outro === 'claro' ? <IconeSol /> : <IconeLua />}
    </Botao>
  );
}
