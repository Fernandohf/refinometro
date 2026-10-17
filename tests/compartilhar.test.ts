import { beforeEach, describe, expect, it } from 'vitest';

import { codificar, decodificar, lerDoEndereco } from '../src/compartilhar';
import { CHAVE_ESTOQUE, CHAVE_RELATO, CHAVE_STORAGE, INICIAL, type Estado } from '../src/estado';
import { ESTOQUE_VAZIO, type EstoqueSalvo } from '../src/components/Estoque';
import { DEFAULT_PRICES } from '../src/data/defaultPrices';

const ESTADO: Estado = {
  ...INICIAL,
  itemNome: 'Adaga',
  itemId: 1201,
  itemSlots: 2,
  kind: 'w1',
  refinoAtual: 4,
  refinoAlvo: 10,
  grauAtual: 'none',
  grauAlvo: 'none',
  perdaAceitavel: true,
  margem: 'p75',
  precos: { ...DEFAULT_PRICES, 985: 42_000, 6635: 0 },
};

const ESTOQUE: EstoqueSalvo = {
  zeny: 120_000_000,
  itens: { 985: 30, 6635: 4 },
  copias: 2,
  alvo: 0.75,
  assinatura: 'w1|4|10',
};

/** O código de um pacote escrito à mão, para conferir o que o leitor faz com lixo. */
async function codigoDe(pacote: unknown): Promise<string> {
  const fluxo = new Blob([JSON.stringify(pacote)]).stream().pipeThrough(new CompressionStream('deflate-raw'));
  const bytes = new Uint8Array(await new Response(fluxo).arrayBuffer());
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

describe('link de simulação', () => {
  it('volta exatamente a mesma pergunta, com a mochila', async () => {
    const codigo = await codificar(ESTADO, ESTOQUE);
    const pacote = await decodificar(codigo);
    expect(pacote?.e).toEqual(ESTADO);
    expect(pacote?.k).toEqual(ESTOQUE);
  });

  it('congela TODOS os preços, não só os mexidos', async () => {
    // A cotação de partida muda todo dia: um link que levasse só as diferenças
    // daria outro orçamento amanhã. O zero também viaja — é "prefiro fabricar".
    const pacote = await decodificar(await codificar(ESTADO, ESTOQUE));
    expect(Object.keys(pacote!.e.precos)).toHaveLength(Object.keys(ESTADO.precos).length);
    expect(pacote!.e.precos[6635]).toBe(0);
  });

  it('cabe num link que se cola no chat', async () => {
    const codigo = await codificar(ESTADO, ESTOQUE);
    // Base64 de URL: nada que o WhatsApp ou o Discord escapem.
    expect(codigo).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(codigo.length).toBeLessThan(1500);
  });

  it('recusa o que não é link desta calculadora', async () => {
    expect(await decodificar('')).toBeNull();
    expect(await decodificar('não é base64!')).toBeNull();
    expect(await decodificar('AAAA')).toBeNull();
    expect(await decodificar('x'.repeat(20_000))).toBeNull();
    expect(await decodificar(await codigoDe({ v: 99, e: ESTADO }))).toBeNull();
    expect(await decodificar(await codigoDe([1, 2, 3]))).toBeNull();
  });

  it('confere campo a campo: tipo errado volta ao inicial, campo estranho some', async () => {
    const pacote = await decodificar(
      await codigoDe({
        v: 1,
        e: {
          kind: 'espada-lendaria',
          refinoAlvo: '12',
          refinoAtual: -1,
          evento: 'sim',
          grauAlvo: 'S',
          margem: 'p100',
          itemNome: 'x'.repeat(500),
          itemId: 1.5,
          precos: { 985: 50_000, abc: 1, 984: 'caro', 756: -3, 757: Infinity },
          intruso: '<script>',
        },
        k: { zeny: 'muito', itens: { 985: 3 }, copias: 0 },
        c: 'ontem',
      }),
    );
    expect(pacote).not.toBeNull();
    const e = pacote!.e;
    expect(e.kind).toBe(INICIAL.kind);
    expect(e.refinoAlvo).toBe(INICIAL.refinoAlvo);
    expect(e.refinoAtual).toBe(INICIAL.refinoAtual);
    expect(e.evento).toBe(INICIAL.evento);
    expect(e.grauAlvo).toBe(INICIAL.grauAlvo);
    expect(e.margem).toBe(INICIAL.margem);
    expect(e.itemNome).toBe(INICIAL.itemNome);
    expect(e.itemId).toBe(INICIAL.itemId);
    expect(e.precos).toEqual({ 985: 50_000 });
    expect(e).not.toHaveProperty('intruso');
    expect(pacote!.k).toEqual({ ...ESTOQUE_VAZIO, itens: { 985: 3 } });
    expect(pacote!.c).toMatch(/^\d{4}-\d{2}-\d{2}/);
  });
});

describe('abrir a página por um link', () => {
  let memoria: Map<string, string>;
  let endereco: { hash: string; pathname: string; search: string; origin: string };

  beforeEach(() => {
    memoria = new Map([[CHAVE_STORAGE, JSON.stringify(INICIAL)]]);
    globalThis.localStorage = {
      getItem: (k: string) => memoria.get(k) ?? null,
      setItem: (k: string, v: string) => void memoria.set(k, v),
    } as Storage;
    endereco = { hash: '', pathname: '/refinometro/', search: '', origin: 'https://x.github.io' };
    globalThis.location = endereco as unknown as Location;
    globalThis.history = {
      replaceState: (_: unknown, __: string, url: string) => {
        endereco.hash = url.includes('#') ? url.slice(url.indexOf('#')) : '';
      },
    } as History;
  });

  it('põe a simulação no lugar da salva e limpa o endereço', async () => {
    endereco.hash = '#s=' + (await codificar(ESTADO, ESTOQUE));
    const compartilhada = await lerDoEndereco();

    expect(compartilhada).not.toBeNull();
    expect(JSON.parse(memoria.get(CHAVE_STORAGE)!)).toEqual(ESTADO);
    expect(JSON.parse(memoria.get(CHAVE_ESTOQUE)!)).toEqual(ESTOQUE);
    // Ficando no endereço, um F5 desfaria o que a pessoa mexeu depois.
    expect(endereco.hash).toBe('');
  });

  it('o link de resultado leva o relato e abre no modo de sorte', async () => {
    const relato = { itens: { 985: 120 }, quebras: 2, assinatura: 'w1|4|10' };
    endereco.hash = '#s=' + (await codificar(ESTADO, ESTOQUE, relato));
    const compartilhada = await lerDoEndereco();

    expect(compartilhada?.modo).toBe('sorte');
    expect(JSON.parse(memoria.get(CHAVE_RELATO)!)).toEqual(relato);
  });

  it('o link de preparação não mexe no relato salvo', async () => {
    memoria.set(CHAVE_RELATO, 'meu');
    endereco.hash = '#s=' + (await codificar(ESTADO, ESTOQUE));
    expect((await lerDoEndereco())?.modo).toBe('plano');
    expect(memoria.get(CHAVE_RELATO)).toBe('meu');
  });

  it('deixa em paz as âncoras da página e a conta salva', async () => {
    endereco.hash = '#apoie';
    expect(await lerDoEndereco()).toBeNull();
    expect(endereco.hash).toBe('#apoie');
    expect(JSON.parse(memoria.get(CHAVE_STORAGE)!)).toEqual(INICIAL);
  });

  it('link quebrado não apaga a conta salva', async () => {
    endereco.hash = '#s=AAAA';
    expect(await lerDoEndereco()).toBeNull();
    expect(JSON.parse(memoria.get(CHAVE_STORAGE)!)).toEqual(INICIAL);
    expect(endereco.hash).toBe('');
  });
});
