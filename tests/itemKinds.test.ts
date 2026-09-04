import { describe, expect, it } from 'vitest';

import { classificar, type DivinePrideItem } from '../src/data/itemKinds';

/** Ficha mínima; cada teste sobrescreve só o que importa. */
const ficha = (over: Partial<DivinePrideItem>): DivinePrideItem => ({
  id: 1,
  nome: 'Item',
  tipo: 'Armor',
  subtipo: 'Armor',
  posicao: null,
  nivelArma: null,
  nivelArmadura: null,
  slots: 0,
  ...over,
});

describe('armas', () => {
  it('usa o nível da arma como categoria', () => {
    for (const nivel of [1, 2, 3, 4, 5]) {
      const c = classificar(ficha({ tipo: 'Weapon', subtipo: 'Knuckle', nivelArma: nivel }));
      expect(c).toEqual({ refinavel: true, kind: `w${nivel}` });
    }
  });

  it('recusa a arma quando a ficha não traz o nível', () => {
    const c = classificar(ficha({ tipo: 'Weapon', subtipo: 'Dagger', nivelArma: null }));
    expect(c).toEqual({ refinavel: false, motivo: 'nivel-desconhecido' });
  });
});

describe('equipamentos', () => {
  it('trata armadura, escudo, calçado e capa como nível 1', () => {
    for (const subtipo of ['Armor', 'Shield', 'Shoes', 'Garment']) {
      expect(classificar(ficha({ subtipo }))).toEqual({ refinavel: true, kind: 'a1' });
    }
  });

  it('reconhece equipamento nível 2, que é o que tem Grau', () => {
    expect(classificar(ficha({ subtipo: 'Armor', nivelArmadura: 2 }))).toEqual({
      refinavel: true,
      kind: 'a2',
    });
  });
});

describe('o que não refina', () => {
  it('recusa equipamento de cabeça que não ocupa o Topo', () => {
    for (const posicao of ['Meio', 'Baixo', 'Meio e Baixo']) {
      expect(classificar(ficha({ subtipo: 'Headgear', posicao }))).toEqual({
        refinavel: false,
        motivo: 'cabeca-meio-baixo',
      });
    }
  });

  it('aceita equipamento de cabeça de Topo', () => {
    for (const posicao of ['Topo', 'Topo e Meio', 'Topo, Meio e Baixo']) {
      expect(classificar(ficha({ subtipo: 'Headgear', posicao }))).toEqual({
        refinavel: true,
        kind: 'a1',
      });
    }
  });

  it('entende a posição também em inglês', () => {
    // Conteúdo novo costuma chegar ao Divine Pride antes do LATAM, e aí a única
    // ficha disponível é a inglesa: "Location: Upper" em vez de "Equipa em: Topo".
    expect(classificar(ficha({ subtipo: 'Headgear', posicao: 'Upper' })).refinavel).toBe(true);
    expect(classificar(ficha({ subtipo: 'Headgear', posicao: 'Middle' })).refinavel).toBe(false);
    expect(classificar(ficha({ subtipo: 'Headgear', posicao: 'Lower' })).refinavel).toBe(false);
  });

  it('admite não saber a posição em vez de chutar que não refina', () => {
    // Um falso negativo silencioso é pior que assumir a ignorância: o usuário
    // deixaria de refinar um item que refina, sem nunca saber por quê.
    expect(classificar(ficha({ subtipo: 'Headgear', posicao: null }))).toEqual({
      refinavel: false,
      motivo: 'posicao-desconhecida',
    });
  });

  it('recusa acessórios comuns', () => {
    expect(classificar(ficha({ subtipo: 'Accessory' }))).toEqual({
      refinavel: false,
      motivo: 'acessorio',
    });
  });

  it('recusa visuais, inclusive os de cabeça no Topo', () => {
    expect(classificar(ficha({ tipo: 'Costume', subtipo: 'Costume Headgear', posicao: 'Topo' }))).toEqual({
      refinavel: false,
      motivo: 'visual',
    });
    expect(classificar(ficha({ tipo: 'Costume', subtipo: 'Costume Garment' }))).toEqual({
      refinavel: false,
      motivo: 'visual',
    });
  });

  it('recusa o que não é equipamento', () => {
    for (const tipo of ['Card', 'Etc', 'Usable', 'Healing']) {
      expect(classificar(ficha({ tipo, subtipo: '' })).refinavel).toBe(false);
    }
  });
});

describe('sombrios', () => {
  it('separa a Manopla Sombria do Equipamento Sombrio', () => {
    // As duas usam a mesma coluna de chances, mas minérios diferentes: a arma
    // refina com Oridecon e a armadura com Elunium.
    for (const [tipo, subtipo] of [
      ['Shadow Equipment', 'Shadow Armor'],
      ['Shadow Equipment', 'Shadow Shoes'],
      ['Shadow Equipment', 'Shadow Garment'],
    ]) {
      expect(classificar(ficha({ tipo, subtipo }))).toEqual({ refinavel: true, kind: 'shadowA' });
    }
    expect(classificar(ficha({ tipo: 'Weapon', subtipo: 'Shadow Weapon' }))).toEqual({
      refinavel: true,
      kind: 'shadowW',
    });
  });

  it('refina acessório sombrio, que é a exceção à regra dos acessórios', () => {
    // Browiki e Hazy Forest concordam: "os acessórios sombrios (Brinco e Colar)
    // podem ser refinados" — ao contrário dos acessórios comuns.
    const c = classificar(
      ficha({ tipo: 'Shadow Equipment', subtipo: 'Shadow Accessory (Left)' }),
    );
    expect(c).toEqual({ refinavel: true, kind: 'shadowA' });
  });

  it('não deixa um visual sombrio passar como refinável', () => {
    // "Costume" é testado antes de "Shadow" justamente por causa deste caso.
    expect(classificar(ficha({ tipo: 'Costume', subtipo: 'Costume Shadow Headgear' }))).toEqual({
      refinavel: false,
      motivo: 'visual',
    });
  });
});
