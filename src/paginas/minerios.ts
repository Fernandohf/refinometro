/*
  O catálogo de minérios, publicado.

  A pergunta que traz alguém para cá quase nunca é "quais minérios existem": é
  "o Oridecon Perfeito aumenta a chance?" — e a resposta, que é NÃO, contraria o
  que a palavra "perfeito" sugere e o que a maioria dos guias repete. O projeto
  já tinha essa distinção conferida item a item na descrição do jogo (ver o
  comentário de `data/ores.ts`); esta página é o lugar onde ela fica legível
  para quem não vai abrir o código.

  Como na tabela de chances, nada aqui é copiado: as linhas saem de `ORES`, e os
  três grupos são CALCULADOS a partir dos campos, e não escritos à mão. Uma
  lista escrita à mão passaria a mentir no dia em que um minério fosse corrigido.
*/

import {
  blessingCost,
  ORES,
  TAXA_REFINO,
  type FailureMode,
  type ItemKind,
  type Ore,
} from '../data/ores';
import { REFERENCIAS } from '../data/seo';
import { CATEGORIAS, rotuloCurto } from '../data/rotulos';
import { zenyExato } from '../format';
import { cru, externo, p, secao, tabela, type Celula, type PaginaDeConteudo } from './documento';

/** O que a falha faz, em palavras — e na cor que separa perder de perder tudo. */
const NA_FALHA: Record<FailureMode, string> = {
  break: 'Destrói o item',
  down3: 'Cai 3 refinos',
  down1: 'Cai 1 refino',
};

/**
 * Destruir o item e derrubar o refino são as duas metades da tabela, e a cor é
 * o que as separa de relance — por isso esta célula é HTML e não texto.
 */
function naFalha(o: Ore): Celula {
  const classe = o.penalidade === 'break' ? 'quebra' : 'segura';
  return cru(`<span class="${classe}">${NA_FALHA[o.penalidade]}</span>`);
}

/** As categorias em que o minério serve, escritas curto. */
function serveEm(o: Ore): string {
  return o.kinds.map(rotuloCurto).join(', ');
}

/**
 * A tabela principal.
 *
 * `refinaDe` é a faixa do refino ATUAL, e a coluna diz isso: um minério de
 * "+0 a +9" é o que se usa para tentar do +0 ao +9, produzindo +1 a +10. Chamar
 * essa coluna de "faixa de refino" sem dizer qual dos dois refinos ela nomeia
 * seria a mesma ambiguidade que a tabela de chances tem que desfazer.
 */
function tabelaDeMinerios(): string {
  const linhas: Celula[][] = ORES.map((o) => [
    o.nome,
    serveEm(o),
    `+${o.refinaDe[0]} a +${o.refinaDe[1]}`,
    o.chanceAumentada ? 'Aumentada' : 'Comum',
    naFalha(o),
    o.npc ? 'NPC da refinaria' : 'JoyCoins',
  ]);

  return tabela(
    'Todos os minérios de refino do Ragnarok Latam',
    ['Minério', 'Serve em', 'Refino atual', 'Chance', 'Se a tentativa falhar', 'Onde se consegue'],
    linhas,
  );
}

/** O que o NPC cobra por cada minério que ele fabrica. */
function tabelaDeReceitas(): string {
  const linhas: Celula[][] = ORES.filter((o) => o.npc).map((o) => [
    o.nome,
    o.npc!.zeny > 0 ? zenyExato(o.npc!.zeny) : '—',
    o.npc!.materiais.length
      ? o.npc!.materiais.map((m) => `${m.qtd}× ${m.nome}`).join(' + ')
      : 'só a taxa',
  ]);

  return tabela('O que o NPC da refinaria cobra por minério', ['Minério', 'Zeny', 'Materiais'], linhas);
}

/**
 * Os três grupos, calculados dos campos.
 *
 * `chanceAumentada` e `penalidade` são independentes na base — e é justamente
 * essa independência que a página existe para mostrar. Derivar as listas em vez
 * de escrevê-las garante que a prosa não sobreviva a uma correção nos dados.
 */
function grupos(): { titulo: string; ores: Ore[]; explica: string }[] {
  const aumenta = (o: Ore) => o.chanceAumentada;
  const protege = (o: Ore) => o.penalidade !== 'break';

  return [
    {
      titulo: 'Só aumentam a chance — e continuam destruindo o item',
      ores: ORES.filter((o) => aumenta(o) && !protege(o)),
      explica:
        'A tentativa passa mais vezes, mas a falha continua sendo a perda do equipamento. ' +
        'São os minérios que mais enganam: o nome sugere segurança e o efeito é o oposto.',
    },
    {
      titulo: 'Só protegem — a chance é a mesma do minério comum',
      ores: ORES.filter((o) => !aumenta(o) && protege(o)),
      explica:
        'A tentativa tem exatamente a chance da tabela comum; o que muda é que a falha deixa ' +
        'de destruir o item e passa a derrubar o refino. Vale pelo que evita, não pelo que ' +
        'acelera.',
    },
    {
      titulo: 'Fazem as duas coisas',
      ores: ORES.filter((o) => aumenta(o) && protege(o)),
      explica:
        'Chance da tabela aumentada e falha que não destrói o item. São os mais caros, e nem ' +
        'sempre os melhores: acima de um certo preço, duas tentativas comuns saem mais baratas ' +
        'que uma protegida.',
    },
    {
      titulo: 'Nenhuma das duas',
      ores: ORES.filter((o) => !aumenta(o) && !protege(o)),
      explica:
        'Chance da tabela comum e, na falha, a perda do equipamento. É o caso mais duro, e é ' +
        'onde a maioria das campanhas começa: são os minérios básicos das faixas baixas.',
    },
  ].filter((g) => g.ores.length > 0);
}

/**
 * As listas de cada grupo.
 *
 * Cada item diz também se o minério é especial e em que faixa ele serve, porque
 * sem isso a lista engana: "Bradium" e "Oridecon Perfeito" caem no mesmo grupo
 * — os dois protegem sem aumentar a chance — mas o primeiro é o minério comum
 * da faixa e o segundo custa JoyCoins, e ler os dois como equivalentes é
 * exatamente o erro que esta seção existe para evitar.
 */
function gruposHTML(): string {
  const item = (o: Ore) =>
    `<li><strong>${o.nome}</strong> — ${NA_FALHA[o.penalidade].toLowerCase()} na falha; ` +
    `${o.especial ? 'especial' : 'comum'}, do +${o.refinaDe[0]} ao +${o.refinaDe[1]}.</li>`;

  return grupos()
    .map(
      (g) => `<h3>${g.titulo}</h3>
      <p>${g.explica}</p>
      <ul>${g.ores.map(item).join('')}</ul>`,
    )
    .join('\n      ');
}

/** Quantas Bênçãos do Ferreiro cada tentativa consome. */
function tabelaDeBencao(): string {
  const linhas: Celula[][] = [];
  // A Bênção não depende da categoria, exceto por não funcionar em Sombrios;
  // `w4` é só um representante qualquer das categorias em que ela funciona.
  for (let de = 0; de <= 20; de++) {
    const qtd = blessingCost('w4', de);
    if (qtd !== null) linhas.push([`+${de} → +${de + 1}`, qtd]);
  }

  return tabela(
    'Bênção do Ferreiro consumida por tentativa',
    ['Tentativa', 'Bênçãos'],
    linhas,
  );
}

/** A taxa que o refinador cobra por tentativa, por categoria. */
function tabelaDeTaxas(): string {
  const linhas: Celula[][] = CATEGORIAS.map((c) => {
    const kind = c.key as ItemKind;
    const arma = kind !== 'a1' && kind !== 'a2' && kind !== 'shadowA';
    return [
      c.rotulo,
      zenyExato(TAXA_REFINO[kind]),
      // A isenção só existe onde há minério de Cash Shop para a categoria: nas de
      // Éter o especial é fabricado no NPC, e a pergunta não chega a existir.
      kind === 'w5' || kind === 'a2' ? '—' : arma ? '0z' : zenyExato(TAXA_REFINO[kind]),
    ];
  });

  return tabela(
    'Taxa do refinador por tentativa',
    ['Categoria', 'Minério comum', 'Minério de Cash Shop'],
    linhas,
  );
}

export const MINERIOS: PaginaDeConteudo = {
  pagina: REFERENCIAS.minerios,
  h1: 'Minérios de refino do Ragnarok Latam',
  resumo:
    'Em que categoria e em que faixa de refino cada minério serve, o que acontece com o item ' +
    'quando a tentativa falha, quais realmente aumentam a chance e quais só protegem — e o ' +
    'que o NPC da refinaria cobra por cada um.',
  fonte: { nome: 'GNJOY Americas — Refinamento', url: 'https://ro.gnjoyamericas.com/pt/news/probability/2' },

  perguntas: [
    {
      pergunta: 'O Oridecon Perfeito aumenta a chance de refino?',
      resposta:
        'Não. A descrição do item no jogo fala só em proteção: em caso de falha ao refinar ' +
        'itens +7, +8 ou +9, a arma não é perdida, mas cai 1 nível de refino. Nem uma palavra ' +
        'sobre chance. Quem aumenta a chance é o Oridecon Enriquecido — que, em compensação, ' +
        'continua destruindo o item na falha. O mesmo vale para o Elunium Perfeito.',
    },
    {
      pergunta: 'Qual é a diferença entre minério Enriquecido e Perfeito?',
      resposta:
        'Enriquecido aumenta a chance de sucesso; Perfeito troca a destruição do item por uma ' +
        'queda de refino. São efeitos diferentes e independentes, e o nome não diz qual é ' +
        'qual: existem minérios que fazem as duas coisas e minérios que fazem só uma.',
    },
    {
      pergunta: 'Vale a pena usar minério especial?',
      resposta:
        'Depende do preço e do nível. Minério especial vem de JoyCoins ou de receita cara, e ' +
        'acima de um certo preço duas tentativas comuns saem mais baratas que uma protegida. ' +
        'A calculadora decide isso nível a nível com os preços que você informar, em vez de ' +
        'seguir uma regra fixa.',
    },
    {
      pergunta: 'A Bênção do Ferreiro funciona em qualquer refino?',
      resposta:
        'Não. Ela só vale nas tentativas que saem do +7 até o +13, e a quantidade consumida ' +
        'cresce com o refino: 1 na tentativa do +7 e 22 na do +13. Não funciona em ' +
        'Equipamentos Sombrios.',
    },
    {
      pergunta: 'A taxa do refinador é cobrada mesmo quando a tentativa falha?',
      resposta:
        'É cobrada por tentativa, dando certo ou não, e depende da categoria do equipamento — ' +
        'de 1.000z numa Arma nível 1 a 75.000z numa Arma nível 5. Não muda com o refino do ' +
        'item. Nas armas, minério comprado no Cash Shop isenta a taxa; nos equipamentos, não. ' +
        'Ela é pequena perto do preço do minério nas faixas altas, mas é ela que decide, na ' +
        'margem, qual minério compensa.',
    },
  ],

  corpo: (base) =>
    [
      secao(
        'Todos os minérios, e o que cada um faz',
        'catalogo',
        p(
          'A coluna <strong>Refino atual</strong> é a faixa em que o minério pode ser usado, e ' +
            'não a que ele produz: um minério de "+0 a +9" serve para tentar a partir do +0 ' +
            'até o +9, ou seja, para produzir do +1 ao +10.',
        ),
        tabelaDeMinerios(),
      ),

      secao(
        'Aumentar a chance e proteger o item são coisas diferentes',
        'grupos',
        p(
          'Esta é a confusão que mais custa caro. Aumentar a chance e evitar a perda do ' +
            'equipamento são <em>duas propriedades independentes</em>, e o nome do minério não ' +
            'diz qual delas ele tem. O critério usado aqui é a descrição do item no jogo: os ' +
            'que aumentam a chance dizem isso com todas as letras — "com maior chance" —, e os ' +
            'que só protegem descrevem apenas a proteção.',
        ),
        gruposHTML(),
        p(
          'Na prática isso muda a decisão inteira: um minério que aumenta a chance mas destrói ' +
            'o item é péssimo para equipamento com carta ou encanto, e ótimo para equipamento ' +
            `barato de repor. É por isso que a <a href="${base}">calculadora</a> pergunta se a ` +
            'perda do item é aceitável antes de escolher a estratégia.',
        ),
      ),

      secao(
        'O que o NPC cobra',
        'npc',
        p(
          'Os minérios que saem do NPC da refinaria têm custo fixo em zeny mais materiais. Os ' +
            'que só vêm de JoyCoins não aparecem aqui: o preço deles é o de mercado, e é você ' +
            'quem informa.',
        ),
        tabelaDeReceitas(),
        p(
          'As receitas e o que cada falha faz com o item vêm do ' +
            `${externo('https://browiki.org/wiki/Refinamento', 'Browiki — Refinamento')}, o ` +
            'wiki do Latam: a divulgação oficial da operadora publica as chances e a faixa de ' +
            'cada minério, mas não os custos de balcão.',
        ),
      ),

      secao(
        'Bênção do Ferreiro',
        'bencao',
        p(
          'A Bênção do Ferreiro impede tanto a perda do item quanto a queda de refino: numa ' +
            'falha, o equipamento fica exatamente onde estava. Só funciona nas tentativas que ' +
            'saem do +7 ao +13, e não funciona em Equipamentos Sombrios.',
        ),
        tabelaDeBencao(),
      ),

      secao(
        'Taxa do refinador',
        'taxa',
        p(
          'Cobrada em toda tentativa, dando certo ou não, e sempre a mesma em qualquer refino ' +
            'do item.',
        ),
        tabelaDeTaxas(),
        p(
          'A isenção do Cash Shop separa <strong>arma de equipamento</strong>: refinar uma arma ' +
            'com Oridecon Enriquecido sai por 0z de taxa — inclusive a Manopla Sombria —, e ' +
            'refinar um equipamento com Elunium Enriquecido paga a taxa cheia. Manopla e ' +
            'Equipamento Sombrio cobram a mesma taxa e usam a mesma tabela de chances, e mesmo ' +
            'assim só a Manopla isenta.',
        ),
        p(
          'Estes valores são a única parte desta página que <strong>não</strong> vem de fonte ' +
            'publicada: a divulgação oficial traz as chances, não os custos. Foram medidos no ' +
            'balcão do NPC, categoria por categoria. As Armas nível 5 e os Equipamentos nível 2 ' +
            'não têm minério de Cash Shop — o especial deles é fabricado no NPC, e paga taxa ' +
            'cheia.',
        ),
      ),
    ].join('\n\n      '),
};
