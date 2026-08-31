/*
  O sistema de Grau, publicado.

  Quem procura por isto costuma estar decidindo se vale a pena começar, e a
  informação que decide não é a chance: é a regra de que SUBIR DE GRAU ZERA O
  REFINO. Ir de "sem grau" até o Grau A não é uma campanha com quatro tentativas
  no fim — são quatro campanhas de refino inteiras, cada uma começando do +0.
  Essa frase é o conteúdo desta página; as tabelas são o apoio dela.

  Como nas outras páginas de referência, as tabelas saem dos dados
  (`gradeChances.json`, `GRADE_STEPS`, `GRADE_RECIPES`) e não de uma cópia.
*/

import gradeChances from '../data/gradeChances.json';
import {
  GRADE_ATK_PER_REFINE,
  GRADE_RECIPES,
  GRADE_STEPS,
  GRADE_ORDER,
  MAX_BLESSING_BONUS,
  REFINO_MINIMO_GRAU,
  type GradeStepKey,
} from '../data/grade';
import { REFERENCIAS } from '../data/seo';
import { ROTULO_GRAU } from '../data/rotulos';
import { porcento, zenyExato } from '../format';
import { externo, p, secao, tabela, type Celula, type PaginaDeConteudo } from './documento';

type TabelaDeGrau = Record<string, Record<GradeStepKey, number | null>>;
const CHANCES = gradeChances.chances as unknown as Record<string, TabelaDeGrau>;

const DEGRAUS: GradeStepKey[] = ['toD', 'toC', 'toB', 'toA'];
const ROTULO_DEGRAU: Record<GradeStepKey, string> = {
  toD: 'Sem grau → D',
  toC: 'D → C',
  toB: 'C → B',
  toA: 'B → A',
};

/**
 * A chance de cada degrau, por refino do item.
 *
 * Uma tabela só para arma e armadura: as duas listas são idênticas na base — o
 * que difere entre Arma nível 5 e Armadura nível 2 é o refino que elas
 * alcançam, não a chance do grau. Publicar duas tabelas iguais lado a lado
 * sugeriria uma diferença que não existe.
 */
function tabelaDeChances(qual: 'weapon' | 'weaponEvent', legenda: string): string {
  const tab = CHANCES[qual]!;
  const linhas: Celula[][] = Object.keys(tab)
    .map(Number)
    .sort((a, b) => a - b)
    .map((refino) => [
      `+${refino}`,
      ...DEGRAUS.map((d) => {
        const v = tab[String(refino)]![d];
        return v === null ? null : porcento(v);
      }),
    ]);

  return tabela(legenda, ['Refino do item', ...DEGRAUS.map((d) => ROTULO_DEGRAU[d])], linhas);
}

/** Materiais e zeny de cada degrau, no processo normal e no seguro. */
function tabelaDeCustos(): string {
  const linhas: Celula[][] = GRADE_STEPS.map((s) => [
    ROTULO_DEGRAU[s.key],
    `${s.normal.material.qtd}× ${s.normal.material.nome}`,
    zenyExato(s.normal.zeny),
    `${s.seguro.material.qtd}× ${s.seguro.material.nome}`,
    zenyExato(s.seguro.zeny),
  ]);

  return tabela(
    'Custo de cada degrau de Grau, nos dois processos',
    ['Degrau', 'Material (normal)', 'Zeny (normal)', 'Material (seguro)', 'Zeny (seguro)'],
    linhas,
  );
}

/** Quantas Bênçãos de Éter custam +1 ponto percentual em cada degrau. */
function tabelaDeBencaos(): string {
  const linhas: Celula[][] = GRADE_STEPS.map((s) => [
    ROTULO_DEGRAU[s.key],
    s.bencaosPorPonto,
    s.bencaosPorPonto * (MAX_BLESSING_BONUS * 100),
  ]);

  return tabela(
    'Bênção de Éter por ponto percentual de chance',
    ['Degrau', 'Bênçãos por +1%', `Bênçãos para o teto de +${MAX_BLESSING_BONUS * 100}%`],
    linhas,
  );
}

/** As receitas dos materiais de Grau no NPC. */
function tabelaDeReceitas(): string {
  const linhas: Celula[][] = Object.values(GRADE_RECIPES).map((r) => [
    r.nome,
    zenyExato(r.zeny),
    r.materiais.map((m) => `${m.qtd}× ${m.nome}`).join(' + '),
  ]);

  return tabela('Receitas dos materiais de Grau no NPC', ['Material', 'Zeny', 'Materiais'], linhas);
}

/** O que o Grau faz pelo item: ATQ/ATQM ganho por nível de refino. */
function tabelaDeGanho(): string {
  const linhas: Celula[][] = GRADE_ORDER.map((g) => [
    ROTULO_GRAU[g],
    GRADE_ATK_PER_REFINE[g].toString().replace('.', ','),
  ]);

  return tabela(
    'ATQ / ATQM ganho por nível de refino, conforme o Grau',
    ['Grau', 'Por nível de refino'],
    linhas,
  );
}

export const GRAU: PaginaDeConteudo = {
  pagina: REFERENCIAS.grau,
  h1: 'Grau (D, C, B e A) no Ragnarok Latam',
  resumo:
    'A chance de cada degrau de Grau conforme o refino do item, os materiais e o zeny de cada ' +
    'subida, quanto a Bênção de Éter empurra a chance — e a regra que decide tudo: cada ' +
    'subida de Grau devolve o refino do item para +0.',
  fonte: { nome: 'Browiki — Grau', url: 'https://browiki.org/wiki/Grau' },

  perguntas: [
    {
      pergunta: 'Subir de Grau apaga o refino do item?',
      resposta:
        'Apaga. Quando a subida de Grau dá certo, o refino volta para +0. É a regra que domina ' +
        'todo o planejamento: sair de "sem grau" e chegar ao Grau A significa refinar o item ' +
        'do zero quatro vezes, e não fazer quatro tentativas no fim de uma campanha só.',
    },
    {
      pergunta: 'Quais itens podem ter Grau?',
      resposta:
        'Só Armas nível 5 e Armaduras nível 2. Nenhuma outra categoria tem Grau, e por isso a ' +
        'calculadora só oferece a opção nessas duas.',
    },
    {
      pergunta: 'A partir de que refino dá para tentar subir de Grau?',
      resposta:
        'Pelas tabelas de chance, o Grau D é possível a partir do +9, o Grau C a partir do +10 ' +
        'e os Graus B e A a partir do +11. O texto do Browiki afirma que o item precisa estar ' +
        'em +11 para qualquer degrau, o que contradiz a tabela da própria página; aqui valem ' +
        'as tabelas, que concordam com as de outra fonte.',
    },
    {
      pergunta: 'Qual é a diferença entre o processo normal e o seguro?',
      resposta:
        'O processo normal gasta 1 material e destrói o item na falha. O seguro gasta 5 vezes ' +
        'o material e 5 vezes o zeny, e na falha não perde nada. A chance de sucesso é a mesma ' +
        'nos dois: o que se compra é o direito de errar.',
    },
    {
      pergunta: 'Quanto a Bênção de Éter aumenta a chance?',
      resposta:
        'Cada ponto percentual custa uma quantidade fixa de Bênçãos de Éter, que cresce a cada ' +
        'degrau — 1 no Sem grau para D e 7 no B para A. O aumento tem teto de 10 pontos ' +
        'percentuais, então nenhuma quantidade de Bênção transforma um degrau difícil em fácil.',
    },
  ],

  corpo: (base) =>
    [
      secao(
        'A regra que decide tudo: o Grau zera o refino',
        'reset',
        p(
          'Quando a subida de Grau dá certo, o refino do item volta para <strong>+0</strong>. ' +
            'É o que torna o Grau caro, e é o que quase todo planejamento erra: um alvo como ' +
            '<em>Grau A +11</em> não é uma campanha de refino com quatro tentativas no fim — ' +
            'são <strong>cinco fases de refino</strong>, quatro delas jogadas fora de propósito ' +
            'para pagar a subida seguinte.',
        ),
        p(
          'Só <strong>Armas nível 5</strong> e <strong>Armaduras nível 2</strong> têm Grau. ' +
            'Como a chance do degrau cresce com o refino, existe uma decisão real em cada fase: ' +
            'tentar cedo, num refino baixo e barato mas com chance pequena, ou subir mais o ' +
            'refino — que vai ser apagado de qualquer jeito — para tentar com chance melhor.',
        ),
      ),

      secao(
        'Chance de cada degrau, por refino',
        'chances',
        p(
          'A mesma tabela vale para Arma nível 5 e Armadura nível 2: o Grau não distingue as ' +
            'duas. O travessão marca o degrau que não é possível naquele refino — o que é ' +
            'diferente de ser possível com chance zero.',
        ),
        tabelaDeChances('weapon', 'Chance de subir de Grau, fora de evento'),
        p('Durante o evento, cada degrau ganha 10 pontos percentuais de chance:'),
        tabelaDeChances('weaponEvent', 'Chance de subir de Grau, durante o evento'),
        p(
          `As tabelas listam valores a partir do +${REFINO_MINIMO_GRAU}, enquanto o texto do ` +
            'Browiki afirma que o item precisa estar em +11. A contradição é da própria fonte, ' +
            'e aqui valem as tabelas — que concordam com as do ' +
            `${externo('https://hazyforest.com/equipment:grade', 'Hazy Forest')}. Se o NPC ` +
            'recusar a tentativa abaixo do +11 no jogo, é o texto que está certo.',
        ),
      ),

      secao(
        'Materiais e zeny de cada subida',
        'custos',
        p(
          'Cada degrau tem dois processos com a <em>mesma chance</em> de sucesso. O normal gasta ' +
            'um material e destrói o item se falhar; o seguro gasta cinco vezes o material e ' +
            'cinco vezes o zeny, e não perde nada na falha. O que o processo seguro compra não ' +
            'é chance, é o direito de errar — e para um item com carta ou encanto isso ' +
            'costuma ser a única opção defensável.',
        ),
        tabelaDeCustos(),
        p('Os materiais também saem do NPC, a partir de Pó de Éter:'),
        tabelaDeReceitas(),
      ),

      secao(
        'Bênção de Éter',
        'bencao',
        p(
          'A Bênção de Éter empurra a chance do degrau para cima, a um custo fixo por ponto ' +
            `percentual, e o aumento tem teto de <strong>${MAX_BLESSING_BONUS * 100} pontos ` +
            'percentuais</strong>. O custo por ponto cresce a cada degrau, então ela é barata ' +
            'exatamente onde faz menos falta.',
        ),
        tabelaDeBencaos(),
        p(
          'Quanta Bênção comprar é uma decisão de custo, não de teto: comprar o máximo em todo ' +
            'degrau raramente é o mais barato. A ' +
            `<a href="${base}">calculadora</a> resolve isso junto com o resto do plano — em que ` +
            'refino tentar cada subida, e quanta Bênção comprar para essa tentativa.',
        ),
      ),

      secao(
        'O que o Grau dá ao item',
        'ganho',
        p(
          'O Grau aumenta o quanto cada nível de refino rende em ATQ ou ATQM. É por isso que a ' +
            'conta compensa apesar do reset: um item Grau A ganha o dobro por refino do que um ' +
            'item sem grau.',
        ),
        tabelaDeGanho(),
      ),
    ].join('\n\n      '),
};
