/*
  Tema claro e escuro.

  Quem decide o tema é o atributo `data-tema` do `<html>`, e mais nada: o CSS
  da calculadora (`src/index.css`) e o das páginas de referência
  (`src/paginas/documento.ts`) leem só ele. O escuro é o padrão — é o que vale
  sem script e o que o projeto sempre foi —, e o claro é uma troca de tokens.

  Este arquivo roda no Node também (o `<head>` é gerado no build), por isso não
  toca em `document` fora do script em texto.
*/

export type Tema = 'claro' | 'escuro';

/** Onde fica a escolha de quem clicou no botão. Sem ela, vale a do sistema. */
export const CHAVE_TEMA = 'refinometro:tema';

/**
 * A cor da barra do navegador no celular: o `--color-fundo` de cada tema, em
 * hexadecimal porque `theme-color` não entende `oklch()` em todo navegador.
 */
export const COR_DA_BARRA: Record<Tema, string> = {
  escuro: '#090d15',
  claro: '#f9fafd',
};

/*
  O script que escolhe o tema ANTES da primeira pintura.

  Vai embutido no `<head>`, síncrono e de propósito: se a escolha esperasse o
  React, quem usa o claro veria a página inteira piscar no escuro a cada
  carregamento. Pela mesma razão ele é texto, e não um módulo — um
  `type="module"` é adiado para depois do parse.

  Sem escolha salva, segue o sistema, e continua seguindo se o sistema mudar
  com a página aberta (o modo noturno que liga sozinho às 18h).
*/
export const SCRIPT_DO_TEMA = `(function () {
  var cores = ${JSON.stringify(COR_DA_BARRA)};
  var sistema = matchMedia('(prefers-color-scheme: light)');
  function salvo() {
    try {
      var t = localStorage.getItem(${JSON.stringify(CHAVE_TEMA)});
      return t === 'claro' || t === 'escuro' ? t : null;
    } catch (e) {
      return null;
    }
  }
  function aplicar() {
    var tema = salvo() || (sistema.matches ? 'claro' : 'escuro');
    document.documentElement.setAttribute('data-tema', tema);
    var metas = document.querySelectorAll('meta[name="theme-color"]');
    for (var i = 0; i < metas.length; i++) metas[i].setAttribute('content', cores[tema]);
  }
  aplicar();
  if (sistema.addEventListener) sistema.addEventListener('change', aplicar);
})();`;
