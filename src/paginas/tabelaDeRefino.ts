/*
  A tabela de chances, publicada.

  É a pergunta mais fechada que chega de um buscador — "qual a chance do +12" —
  e a calculadora responde mal a ela: para ver o número, é preciso escolher um
  item, informar preços e ler um orçamento que ninguém pediu. Aqui a resposta é
  a primeira coisa na tela.

  Os números NÃO são copiados para cá: saem de `chanceOf`, a mesma função que o
  motor consulta para montar o plano. É a única forma de a página não passar a
  mentir na primeira vez que o Browiki mudar um valor e a base for atualizada.
*/

import { REFERENCIAS } from '../data/seo';
import { CATEGORIAS } from '../data/rotulos';
import { ehSombrio, type ItemKind } from '../data/ores';
import { chanceOf, maxRefine, safeLimit } from '../engine/refine';
import { porcento } from '../format';
import { externo, p, secao, tabela, type Celula, type PaginaDeConteudo } from './documento';

/**
 * As colunas da tabela.
 *
 * São oito e não nove: arma e equipamento sombrios dividem a MESMA coluna de
 * chances — o que muda entre os dois é o minério, não a probabilidade —, e é
 * assim que o motor lê a tabela (ver `colunaDe` em `engine/refine.ts`). O
 * `shadowW` é só o representante da coluna; `shadowA` daria os mesmos números.
 */
const COLUNAS: { kind: ItemKind; rotulo: string }[] = [
  ...CATEGORIAS.filter((c) => !ehSombrio(c.key)).map((c) => ({ kind: c.key, rotulo: c.curto })),
  { kind: 'shadowW' as ItemKind, rotulo: 'Sombrio' },
];

/** O nível de refino mais alto que alguma categoria alcança. */
const TETO = Math.max(...COLUNAS.map((c) => maxRefine(c.kind)));

/**
 * Uma tabela de chances inteira, do +1 ao teto.
 *
 * A linha `+N` é a tentativa que PRODUZ o +N, e não a que parte dele. É a
 * confusão mais comum com esta tabela — quem lê "19% no +10" costuma entender
 * "chance de sair do +10" — e por isso o cabeçalho da primeira coluna diz
 * "Para" em vez de "Refino".
 */
function tabelaDeChances(legenda: string, aumentada: boolean, evento: boolean): string {
  const linhas: Celula[][] = [];

  for (let para = 1; para <= TETO; para++) {
    const chances = COLUNAS.map((c) => {
      const v = chanceOf(c.kind, para, aumentada, evento);
      return v === null ? null : porcento(v);
    });
    // Uma linha em que nenhuma categoria alcança o nível não diz nada.
    if (chances.every((c) => c === null)) continue;
    linhas.push([`+${para}`, ...chances]);
  }

  return tabela(
    legenda,
    ['Para', ...COLUNAS.map((c) => c.rotulo)],
    linhas,
    // Os três alvos por que as pessoas de fato procuram, destacados: são as
    // linhas que alguém veio ler, e num paredão de vinte elas somem.
    (linha) => (['+10', '+15', '+20'].includes(String(linha[0])) ? 'marco' : ''),
  );
}

/** Até onde cada categoria sobe, e até onde ela sobe sem poder falhar. */
function tabelaDeLimites(): string {
  const linhas = COLUNAS.map((c) => {
    const garantido = safeLimit(c.kind);
    return [c.rotulo, garantido > 0 ? `+${garantido}` : '—', `+${maxRefine(c.kind)}`] as Celula[];
  });

  return tabela(
    'Refino garantido e refino máximo, por categoria',
    ['Categoria', 'Garantido (100%)', 'Máximo'],
    linhas,
  );
}

export const TABELA_DE_REFINO: PaginaDeConteudo = {
  pagina: REFERENCIAS.tabelaDeRefino,
  h1: 'Tabela de chances de refino do Ragnarok Latam',
  resumo:
    'A chance de a tentativa dar certo em cada nível de refino, do +1 ao +20, para cada ' +
    'categoria de equipamento — com minério comum, com minério de chance aumentada e ' +
    'durante o evento de refino. São os mesmos números que a calculadora usa.',
  fonte: { nome: 'Browiki — Refinamento', url: 'https://browiki.org/wiki/Refinamento' },

  perguntas: [
    {
      pergunta: 'A chance da tabela é por tentativa ou acumulada?',
      resposta:
        'É por tentativa, e cada tentativa é independente da anterior. 19% no +10 quer dizer ' +
        'que aquela tentativa tem 19% de dar certo — não que dez tentativas somem 100%. É por ' +
        'isso que o custo de uma campanha não é a soma das chances: uma falha pode derrubar o ' +
        'refino ou destruir o item, e o caminho até o alvo volta para trás no meio.',
    },
    {
      pergunta: 'Até que refino é garantido, sem chance de falhar?',
      resposta:
        'Depende da categoria, e o teto cai conforme o equipamento é melhor: Arma nível 1 sobe ' +
        'garantido até +7, Arma nível 4 até +4 e Arma nível 5 até +3. Acima disso toda ' +
        'tentativa pode falhar, e o que a falha faz depende do minério usado.',
    },
    {
      pergunta: 'Por que a linha diz "+10" se a chance é de sair do +9?',
      resposta:
        'A linha é a tentativa que produz aquele refino. "+10" é a chance de a tentativa feita ' +
        'com o item em +9 entregar um item +10. Ler ao contrário é o engano mais comum com ' +
        'esta tabela, e muda o planejamento de uma campanha inteira.',
    },
    {
      pergunta: 'O que muda durante o evento de refino?',
      resposta:
        'As chances sobem em todas as categorias, tanto com minério comum quanto com minério ' +
        'de chance aumentada. As penalidades de falha não mudam: o minério que destrói o item ' +
        'fora do evento continua destruindo dentro dele.',
    },
    {
      pergunta: 'Estas chances valem em outro servidor de Ragnarok?',
      resposta:
        'Não necessariamente. A tabela é a do Ragnarok Latam, tirada do Browiki, que é o wiki ' +
        'do próprio servidor. Outros servidores publicam tabelas diferentes, e um número ' +
        'trocado muda o custo esperado de uma campanha em ordens de grandeza.',
    },
  ],

  corpo: (base) =>
    [
      secao(
        'Chance por nível, fora de evento',
        'fora-de-evento',
        p(
          'A linha <strong>+N</strong> é a tentativa que <em>produz</em> o +N — ou seja, a ' +
            'tentativa feita com o item em +(N−1). A coluna é a categoria do equipamento, que ' +
            'é o que decide a chance: uma Arma nível 5 é bem mais difícil de refinar que uma ' +
            'Arma nível 1 no mesmo refino.',
        ),
        tabelaDeChances('Minério comum, fora de evento', false, false),
        p(
          'Os minérios de <strong>chance aumentada</strong> usam outra tabela. Nem todo minério ' +
            'especial está nela: alguns só protegem o item da quebra, sem melhorar a chance — ' +
            `a diferença está detalhada em <a href="${base}minerios/">minérios de refino</a>.`,
        ),
        tabelaDeChances('Minério de chance aumentada, fora de evento', true, false),
      ),

      secao(
        'Chance durante o evento de refino',
        'evento',
        p(
          'Durante o evento, as chances sobem em todas as categorias. O que <em>não</em> muda é ' +
            'a penalidade da falha: um minério que destrói o item fora do evento continua ' +
            'destruindo dentro dele, e o evento não torna seguro o que não era.',
        ),
        tabelaDeChances('Minério comum, durante o evento', false, true),
        tabelaDeChances('Minério de chance aumentada, durante o evento', true, true),
      ),

      secao(
        'Até onde cada categoria sobe',
        'limites',
        p(
          'Abaixo do refino garantido nenhuma tentativa falha, e o custo é só o dos minérios. ' +
            'Acima dele começa o problema de verdade: a falha pode derrubar o refino ou ' +
            'destruir o equipamento, e a decisão passa a ser qual minério usar em cada nível.',
        ),
        tabelaDeLimites(),
        p(
          'Equipamentos Sombrios param no +10 — e como a Bênção do Ferreiro não funciona neles, ' +
            'não há como segurar o refino no lugar numa falha.',
        ),
      ),

      secao(
        'De onde vêm estes números',
        'fonte',
        p(
          `Todos vêm do ${externo('https://browiki.org/wiki/Refinamento', 'Browiki — Refinamento')}, ` +
            'que é o wiki do próprio Ragnarok Latam, e são lidos direto da base do projeto pela ' +
            'mesma função que o motor da calculadora consulta. Não há uma cópia desta tabela ' +
            'escrita à mão nesta página: se a base mudar, a página muda no build seguinte.',
        ),
        p(
          'A chance é só metade da conta. A outra metade é o preço do minério, a taxa do ' +
            'refinador e o que uma quebra custa em cópias do equipamento — e é isso que a ' +
            `<a href="${base}">calculadora</a> resolve, escolhendo o minério ótimo de cada ` +
            'nível em vez de seguir uma receita fixa.',
        ),
      ),
    ].join('\n\n      '),
};
