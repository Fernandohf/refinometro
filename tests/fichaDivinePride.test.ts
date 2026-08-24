import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import { extrairFicha } from '../scripts/divinepride';
import { classificar } from '../src/data/itemKinds';

const fixture = (nome: string) =>
  readFileSync(resolve(import.meta.dirname, 'fixtures', nome), 'utf8');

// HTML real das páginas de item, recortado para o que o parser lê. Ao contrário
// dos fixtures da busca, estes nasceram de um bug: o Divine Pride passou a
// escrever "LATAM - Portuguese" onde escrevia "LATAM - portuguese", e o
// `indexOf` sensível a caixa fez TODAS as fichas voltarem vazias. A varredura
// seguiu até o fim relatando "sem ficha utilizável" para 4.689 itens, sem um
// único erro de HTTP — o modo de falha mais caro que existe.
const ARMA = fixture('ficha-arma.html');
const ALUGUEL = fixture('ficha-aluguel.html');

describe('parser da ficha', () => {
  it('lê nome, slots, tipo e nível da arma', () => {
    const ficha = extrairFicha(1101, ARMA);

    expect(ficha).toMatchObject({
      id: 1101,
      nome: 'Espada',
      tipo: 'Weapon',
      subtipo: 'Sword',
      nivelArma: 1,
      slots: 3,
    });
    expect(classificar(ficha!)).toEqual({ refinavel: true, kind: 'w1' });
  });

  it('acha o cartão do servidor sem depender da caixa do rótulo', () => {
    // O nome só existe dentro do cartão do servidor. Se a busca pelo rótulo
    // falhar, a ficha inteira vira `null` e o item some da base em silêncio.
    expect(extrairFicha(1101, ARMA)?.servidor).toBe('LATAM - Portuguese');
    expect(extrairFicha(1101, ARMA.replace(/LATAM - Portuguese/g, 'LATAM - portuguese'))?.nome).toBe(
      'Espada',
    );
  });

  it('tira os slots do título, não do nome traduzido', () => {
    // O <h1> vem no idioma original ("소드 [3]"); o nome, do cartão LATAM. São
    // duas fontes diferentes, e as cartas estão só na primeira.
    expect(extrairFicha(1101, ARMA)?.slots).toBe(3);
  });

  it('respeita a descrição quando ela nega o refino', () => {
    // Item de aluguel: por tipo e subtipo é Armor/Armor, e sem esta linha ganharia
    // um orçamento de refino inteiro para algo que o jogo não deixa refinar.
    const ficha = extrairFicha(15247, ALUGUEL);

    expect(ficha).toMatchObject({ nome: 'Armadura de Caça', tipo: 'Armor', negaRefino: true });
    expect(classificar(ficha!)).toEqual({ refinavel: false, motivo: 'ficha-nega' });
  });

  it('não inventa ficha quando a página não serve', () => {
    expect(extrairFicha(1, '<html>qualquer coisa</html>')).toBeNull();
    // Tabela de tipo presente, mas nenhum cartão de servidor conhecido.
    expect(
      extrairFicha(1, '<td class="text-muted">Type</td><td>Weapon</td><h3>Nome</h3>'),
    ).toBeNull();
  });
});
