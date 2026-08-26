import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import { medianaPonderada, parsearMercado, urlDaConsulta, type DiaDeMercado } from '../scripts/latam';

const fixture = (nome: string) =>
  readFileSync(resolve(import.meta.dirname, 'fixtures', nome), 'utf8');

// Payload real da consulta de preço do LATAM (FREYA, 30 dias), recortado para o
// que o parser lê. Como nos testes do Divine Pride, é uma cópia congelada: se o
// site mudar, quem avisa é o `throw` do parser rodando de verdade. O papel destes
// testes é travar o comportamento diante do payload que já vimos.
const COM_RESULTADO = fixture('mercado-latam.html');
const VAZIO = fixture('mercado-latam-vazio.html');

/** Monta uma página com o bloco que o parser procura, para os casos de erro. */
const pagina = (bloco: Record<string, unknown>) => {
  const carga = `1a:["$","$L2b",null,${JSON.stringify({ queryParams: {}, ...bloco })}]\n`;
  return `<body><script>self.__next_f.push([1,${JSON.stringify(carga)}])</script></body>`;
};

describe('parser da consulta de preço', () => {
  it('lê item, transações e a tripla min/média/máx', () => {
    const { cotacoes, total } = parsearMercado(COM_RESULTADO);

    expect(total).toBe(2);
    expect(cotacoes).toEqual([
      {
        itemId: 6225,
        svrId: 3,
        nome: 'Carnium Perfeito',
        transacoes: 2057,
        min: 80_000,
        media: 1_044_340,
        max: 3_000_000,
      },
      {
        itemId: 6223,
        svrId: 3,
        nome: 'Carnium',
        transacoes: 1101,
        min: 99,
        media: 495_977,
        max: 10_000_000,
      },
    ]);
  });

  it('remonta o payload partido entre dois pedaços', () => {
    // O Next corta os `self.__next_f.push` em posições arbitrárias, e na fixture
    // o bloco de resultados começa em um pedaço e termina no outro. Procurar
    // dentro de um pedaço isolado devolveria zero itens — em silêncio, que é o
    // pior jeito de errar aqui.
    const pedacos = COM_RESULTADO.match(/self\.__next_f\.push/g) ?? [];
    expect(pedacos.length).toBeGreaterThan(1);
    expect(COM_RESULTADO).not.toContain('"totalCount":2}]\\n"])</script>\n<script>self');
    expect(parsearMercado(COM_RESULTADO).cotacoes).toHaveLength(2);
  });

  it('aceita busca sem resultado como resposta legítima', () => {
    // Bradium de Éter existe e simplesmente não foi negociado no período. Isso
    // precisa sair como lista vazia, não como erro: é informação — o item fica
    // cotado pela receita de NPC.
    expect(parsearMercado(VAZIO)).toEqual({ cotacoes: [], total: 0 });
  });

  it('falha alto quando o bloco de resultados sumiu', () => {
    // A falha que importa não é a página fora do ar, é o site mudar o formato e
    // o parser devolver lista vazia para tudo: isso é indistinguível de "nada
    // foi negociado", e cotaria a base inteira como mercado morto.
    const semBloco = COM_RESULTADO.replace(/queryParams/g, 'parametrosDaConsulta');

    expect(() => parsearMercado(semBloco, '<url>')).toThrow(/mudou o formato/);
  });

  it('falha alto quando o site anuncia resultados e não entrega nenhum', () => {
    // O outro jeito de o formato mudar sem ninguém perceber: o site continua
    // dizendo quantos itens achou, mas a lista passa a vir em outro lugar.
    expect(() => parsearMercado(pagina({ list: [], totalCount: 2 }), '<url>')).toThrow(
      /anuncia 2 resultados/,
    );
  });

  it('não se perde com chave ou colchete dentro do nome do item', () => {
    // "Cx Oridecon Enriquecido [10]" tem colchete no nome, e é justamente o
    // registro de onde sai o preço do Oridecon Enriquecido. Contar chaves com
    // regex quebraria aqui.
    const comColchete = COM_RESULTADO.replace(/Carnium Perfeito/, 'Cx Oridecon Enriquecido [10]');

    expect(parsearMercado(comColchete).cotacoes[0]!.nome).toBe('Cx Oridecon Enriquecido [10]');
    expect(parsearMercado(comColchete).cotacoes).toHaveLength(2);
  });
});

describe('url da consulta', () => {
  it('escapa o termo e monta os parâmetros que o site espera', () => {
    const url = new URL(urlDaConsulta('Pó de Éter', 'FREYA', 30));

    expect(url.pathname).toBe('/pt/intro/shop-search/market-price');
    expect(url.searchParams.get('searchWord')).toBe('Pó de Éter');
    expect(url.searchParams.get('serverType')).toBe('FREYA');
    expect(url.searchParams.get('period')).toBe('30');
  });
});

describe('mediana ponderada pelo volume', () => {
  const dia = (media: number, unidades: number, data = '2026-08-01'): DiaDeMercado => ({
    data,
    min: media,
    media,
    max: media,
    unidades,
  });

  it('devolve o preço em que metade das unidades foi negociada', () => {
    expect(medianaPonderada([dia(10, 1), dia(20, 1), dia(30, 1)])).toBe(20);
  });

  it('ignora a venda fora da curva que domina a média', () => {
    // O caso real do Carnium: dois dias de volume alto a ~2.000 e um dia de três
    // unidades a 10.000.000. A média do site sai em 495.977; a mediana, em 2.000.
    const dias = [dia(1_991, 339), dia(855, 317), dia(10_000_000, 3)];
    const media = dias.reduce((s, d) => s + d.media * d.unidades, 0) / 659;

    expect(medianaPonderada(dias)).toBe(1_991);
    expect(media).toBeGreaterThan(45_000);
  });

  it('pondera pelo volume, não pelo número de dias', () => {
    // Cinco dias caros de uma unidade cada não vencem um dia barato de cem: o
    // que interessa é onde o mercado esteve, não quantas vezes o site anotou.
    const dias = [dia(100, 100), ...Array.from({ length: 5 }, () => dia(9_000, 1))];

    expect(medianaPonderada(dias)).toBe(100);
  });

  it('não inventa mediana para série vazia ou sem volume', () => {
    expect(medianaPonderada([])).toBeNull();
    expect(medianaPonderada([dia(500, 0), dia(700, 0)])).toBeNull();
  });
});
