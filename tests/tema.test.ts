import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { cabecalhoSEO } from '../src/data/seo';
import { CHAVE_TEMA, COR_DA_BARRA, SCRIPT_DO_TEMA } from '../src/data/tema';
import { arquivosDePagina } from '../src/paginas';

/*
  O tema claro é uma segunda cópia de cada token, e uma cópia que falta não
  quebra nada que se veja num teste: o componente que usa o token novo
  simplesmente fica com a cor do escuro no meio da tela clara. É isso que se
  confere aqui — e que as cores copiadas para as páginas de referência
  continuam as mesmas da calculadora.
*/

const css = readFileSync(new URL('../src/index.css', import.meta.url), 'utf8');

/** Os `--nome: valor` de um bloco CSS. */
function tokens(bloco: string): Map<string, string> {
  return new Map(
    [...bloco.matchAll(/(--[\w-]+):\s*([^;]+);/g)].map((m) => [m[1]!, m[2]!.trim()] as const),
  );
}

function bloco(fonte: string, abertura: string): string {
  const inicio = fonte.indexOf(abertura);
  expect(inicio, `bloco ${abertura}`).toBeGreaterThanOrEqual(0);
  return fonte.slice(inicio, fonte.indexOf('}', inicio));
}

const cores = (m: Map<string, string>) =>
  new Map([...m].filter(([nome]) => nome.startsWith('--color-')));

const escuro = cores(tokens(bloco(css, '@theme {')));
const claro = cores(tokens(bloco(css, ":root[data-tema='claro'] {")));

describe('tokens do tema', () => {
  it('toda cor do escuro tem o seu par no claro, e vice-versa', () => {
    expect(escuro.size).toBeGreaterThan(10);
    expect([...claro.keys()].sort()).toEqual([...escuro.keys()].sort());
  });

  it('as páginas de referência usam as mesmas cores da calculadora, nos dois temas', () => {
    const pagina = arquivosDePagina('/')[0]!;
    const estilo = pagina.html.slice(pagina.html.indexOf('<style>'), pagina.html.indexOf('</style>'));
    // `--superficie` de lá é a `superficie-baixa` daqui; o resto tem o mesmo nome.
    const daqui = (nome: string) => (nome === '--superficie' ? '--color-superficie-baixa' : `--color-${nome.slice(2)}`);

    for (const [abertura, tema] of [
      [':root {', escuro],
      [":root[data-tema='claro'] {", claro],
    ] as const) {
      const copiadas = tokens(bloco(estilo, abertura));
      expect(copiadas.size).toBeGreaterThan(5);
      for (const [nome, valor] of copiadas) expect(valor, nome).toBe(tema.get(daqui(nome)));
    }
  });
});

describe('script do tema', () => {
  it('vai no <head>, depois das metas de cor da barra que ele reescreve', () => {
    const html = cabecalhoSEO();
    expect(html.indexOf('<script>')).toBeGreaterThan(html.lastIndexOf('<meta name="theme-color"'));
    expect(html).toContain('content="dark light"');
  });

  /** Roda o script com um `<html>`, um armazenamento e um sistema de mentira. */
  function rodar({ salvo, sistemaClaro }: { salvo?: string; sistemaClaro: boolean }) {
    const atributos: Record<string, string> = {};
    const metas = [{ content: '' }, { content: '' }];
    const documento = {
      documentElement: { setAttribute: (k: string, v: string) => (atributos[k] = v) },
      querySelectorAll: () =>
        metas.map((m) => ({ setAttribute: (_: string, v: string) => (m.content = v) })),
    };
    const armazenamento = {
      getItem: (k: string) => (k === CHAVE_TEMA ? (salvo ?? null) : null),
    };
    const matchMedia = () => ({ matches: sistemaClaro, addEventListener: () => {} });

    new Function('document', 'localStorage', 'matchMedia', SCRIPT_DO_TEMA)(
      documento,
      armazenamento,
      matchMedia,
    );
    return { tema: atributos['data-tema'], barra: metas.map((m) => m.content) };
  }

  it('sem escolha salva, segue o sistema', () => {
    expect(rodar({ sistemaClaro: true }).tema).toBe('claro');
    expect(rodar({ sistemaClaro: false }).tema).toBe('escuro');
  });

  it('a escolha salva vence o sistema, e a barra acompanha a escolha', () => {
    const r = rodar({ salvo: 'escuro', sistemaClaro: true });
    expect(r.tema).toBe('escuro');
    expect(r.barra).toEqual([COR_DA_BARRA.escuro, COR_DA_BARRA.escuro]);
  });

  it('ignora lixo no armazenamento', () => {
    expect(rodar({ salvo: 'sepia', sistemaClaro: false }).tema).toBe('escuro');
  });
});
