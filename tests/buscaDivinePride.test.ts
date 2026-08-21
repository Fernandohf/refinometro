import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import { parsearBusca } from '../scripts/divinepride';
import { classificar } from '../src/data/itemKinds';

const fixture = (nome: string) =>
  readFileSync(resolve(import.meta.dirname, 'fixtures', nome), 'utf8');

// HTML real do Divine Pride, recortado para as partes que o parser lê. Se o site
// mudar o layout, estes testes continuam passando (é uma cópia congelada) — quem
// avisa da mudança é o `throw` do parser quando roda de verdade. O papel deles é
// travar o comportamento diante do HTML que já vimos.
const NOMEADA = fixture('busca-nomeada.html');
const SEM_NOME = fixture('busca-sem-nome.html');

describe('parser da busca', () => {
  it('lê id, nome e tipo de cada linha', () => {
    const { linhas, total, semNome } = parsearBusca(NOMEADA);

    expect(total).toBe(4);
    expect(semNome).toBe(0);
    expect(linhas).toEqual([
      { id: 15247, nome: 'Armadura de Caça', tipo: 'Armor', subtipo: 'Armor' },
      { id: 22169, nome: 'Botas de Caça', tipo: 'Armor', subtipo: 'Shoes' },
      { id: 20903, nome: 'Manto de Caça', tipo: 'Armor', subtipo: 'Garment' },
    ]);
  });

  it('decodifica as entidades HTML do nome', () => {
    // "Ca&#xE7;a" precisa virar "Caça", senão a base fica com lixo e a busca do
    // site não casa com a busca da interface.
    expect(parsearBusca(NOMEADA).linhas[0]!.nome).toContain('ç');
  });

  it('descarta o item que não tem nome em português', () => {
    // O Divine Pride mantém um cartão LATAM em branco para item não traduzido, e
    // a listagem sai com a célula de nome vazia. São itens que não chegaram ao
    // LATAM: sem nome não há como reconhecê-los nem procurá-los na interface.
    const { linhas, semNome } = parsearBusca(SEM_NOME);

    expect(linhas).toEqual([]);
    expect(semNome).toBe(3);
  });

  it('trata "[1]" sozinho como ausência de nome, não como nome', () => {
    // Alguns itens sem tradução ainda trazem o marcador de slots na célula. Se
    // isso passasse como nome, a base ficaria com uma entrada chamada "[1]".
    expect(parsearBusca(SEM_NOME).linhas.some((l) => l.id === 2193)).toBe(false);
  });

  it('não confunde tudo-sem-nome com o HTML tendo mudado', () => {
    // A página do fixture tem 3 linhas, todas sem nome. O parser precisa saber a
    // diferença entre "li 3 linhas e nenhuma servia" e "não consegui ler nada",
    // senão uma busca legítima explodiria como se o site tivesse sido remodelado.
    expect(() => parsearBusca(SEM_NOME)).not.toThrow();
  });

  it('descobre quantas páginas existem', () => {
    expect(parsearBusca(SEM_NOME).paginas).toBe(160);
    // O total é o que o site anuncia, antes do filtro — é ele que diz se a busca
    // foi truncada.
    expect(parsearBusca(SEM_NOME).total).toBe(3197);
    // Sem barra de paginação, é uma página só.
    expect(parsearBusca(NOMEADA).paginas).toBe(1);
  });

  it('quebra em vez de devolver lista vazia quando o HTML muda', () => {
    // O modo de falha perigoso é silencioso: um site remodelado devolveria
    // "nenhum item encontrado" para tudo, e ninguém notaria.
    expect(() => parsearBusca('<html>sem contagem</html>')).toThrow(/contagem/i);
    expect(() => parsearBusca('<span>12 results</span><table></table>')).toThrow(/12 resultados/);
  });

  it('aceita a página legítima de zero resultados', () => {
    const vazia = parsearBusca('<span class="text-muted">0 results</span>');
    expect(vazia).toEqual({ linhas: [], total: 0, semNome: 0, paginas: 1 });
  });
});

describe('filtro da busca', () => {
  it('as linhas de armadura passam pelo classificador sem surpresa', () => {
    // A busca filtra por subTypes na origem (sem Acessório, sem Costume), mas o
    // veredito final é sempre do classificador, com a ficha completa em mãos —
    // headgear de Meio/Baixo só é pego lá, porque a listagem não traz a posição.
    for (const linha of parsearBusca(NOMEADA).linhas) {
      const c = classificar({
        id: linha.id,
        nome: linha.nome,
        tipo: linha.tipo,
        subtipo: linha.subtipo,
        posicao: null,
        nivelArma: null,
        nivelArmadura: null,
        slots: 0,
      });
      expect(c).toEqual({ refinavel: true, kind: 'a1' });
    }
  });
});
