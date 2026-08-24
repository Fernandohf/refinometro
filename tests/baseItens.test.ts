import { describe, expect, it } from 'vitest';

import { carregarBase, META, montarBase, type LinhaSalva } from '../src/data/items';

// A base é gerada por varredura (`npm run data:items`), então os testes se
// dividem em dois: a ordenação da busca, exercitada com itens inventados para
// não depender do que o Divine Pride publicou hoje, e as invariantes do arquivo
// de verdade, que travam o contrato entre o gerador e a interface.

const LINHAS: LinhaSalva[] = [
  [1, 'Espada', 0, 'w1'],
  [2, 'Espada Flamejante', 2, 'w3'],
  [3, 'Grande Espada', 1, 'w4'],
  [4, '[Aluguel] Espada', 0, 'w1'],
  [5, 'Elmo de Ferro', 0, '!cabeca-meio-baixo'],
  [6, 'Óculos Escuros', 1, 'a1'],
];

describe('base de itens', () => {
  const base = montarBase(LINHAS);

  it('decodifica a linha compacta em item', () => {
    expect(base.itens[0]).toEqual({ id: 1, nome: 'Espada', slots: 0, kind: 'w1' });
  });

  it('lê o "!" como motivo de não refinar, não como categoria', () => {
    // É o que separa "não sei refinar isso" de uma categoria chamada
    // "!cabeca-meio-baixo" — que faria a interface tentar calcular com ela.
    expect(base.itens[4]).toEqual({
      id: 5,
      nome: 'Elmo de Ferro',
      slots: 0,
      naoRefinavel: 'cabeca-meio-baixo',
    });
    expect(base.itens[4]!.kind).toBeUndefined();
  });

  it('põe o nome exato antes das variantes', () => {
    // Com milhares de itens, quem digita "espada" quer a Espada, não a primeira
    // coisa que contém a palavra.
    expect(base.buscar('espada').map((i) => i.nome)).toEqual([
      'Espada',
      'Espada Flamejante',
      'Grande Espada',
      '[Aluguel] Espada',
    ]);
  });

  it('ignora acento e maiúscula', () => {
    expect(base.buscar('oculos').map((i) => i.nome)).toEqual(['Óculos Escuros']);
    expect(base.buscar('ÓCULOS').map((i) => i.nome)).toEqual(['Óculos Escuros']);
  });

  it('exige todas as palavras digitadas', () => {
    expect(base.buscar('espada flamejante').map((i) => i.nome)).toEqual(['Espada Flamejante']);
    expect(base.buscar('espada inexistente')).toEqual([]);
  });

  it('não busca com menos de dois caracteres', () => {
    // Senão a primeira tecla já despeja a base inteira na tela.
    expect(base.buscar('e')).toEqual([]);
  });

  it('respeita o limite', () => {
    expect(base.buscar('espada', 2)).toHaveLength(2);
  });
});

describe('arquivo gerado', () => {
  it('todo item tem categoria ou motivo, nunca os dois nem nenhum', () => {
    // O gerador escreve a classe num campo só (`kind` ou `!motivo`); se essa
    // codificação quebrar, a interface passa a oferecer itens que não refinam.
    return carregarBase().then((base) => {
      expect(base.itens.length).toBeGreaterThan(0);
      for (const item of base.itens) {
        expect(Boolean(item.kind) !== Boolean(item.naoRefinavel)).toBe(true);
        expect(item.nome).not.toBe('');
        expect(item.slots).toBeGreaterThanOrEqual(0);
      }
    });
  });

  it('os metadados batem com o arquivo que a interface baixa', () => {
    // O rodapé credita a fonte e mostra a contagem sem baixar a base. Se os dois
    // arquivos saírem de sincronia, a página passa a mentir o tamanho dela.
    return carregarBase().then((base) => {
      expect(META.total).toBe(base.itens.length);
      expect(META.servidor).toBe('LATAM');
      expect(META.fonte).toContain('divine-pride.net');
      expect(META.geradoEm).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });
  });
});
