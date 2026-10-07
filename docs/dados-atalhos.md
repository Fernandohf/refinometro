# Cubos, martelos e pergaminhos de refino

Alguns itens mudam o refino de um equipamento sem uma tentativa no refinador: um cubo que leva a
Armadura Temporal direto ao +11, um martelo que soma +1 a uma Arma Consertada, um pergaminho que
deixa qualquer arma nv1–4 no +9. O motor trata cada um como **uma ação a mais** no mesmo processo
de decisão que escolhe o minério — ninguém decide à mão quando usar o cubo; o otimizador compara o
preço dele com o custo esperado do caminho que ele pula. Ver [O motor](motor.md#as-decisões-e-o-que-cada-uma-muda-na-tela).

O nome que o código usa para os três é **atalho** (`src/data/atalhos.ts`).

## Os três mecanismos

| Efeito | Quem | O que acontece com o refino |
| --- | --- | --- |
| **Fixo** | Cubos do Hollgrehenn (Temporal, OS, Bioarma, Mora…), Martelo Sombrio +9, Tickets Nobre/Ilustre/Grácil, Pergaminhos de Arma/Armadura +5 a +19 | Passa a ser exatamente o do item, sem chance de falha |
| **Sorteado** | Cubos Ilusionais (normal e Super), Martelo de Refino Sombrio | Passa a ser um valor aleatório da tabela — **substitui** o atual, e pode baixá-lo |
| **Somado** | Martelos de Refino (Relógio, Vivatus, Primordial, COR…) | +1 garantido por uso, numa faixa, cobrando materiais além do martelo |

Nenhum deles destrói o item nem cobra taxa do refinador. Todos são consumidos no uso.

## De onde vem cada coisa

**O que cada atalho faz** é escrito à mão em [`src/data/atalhos.ts`](../src/data/atalhos.ts):

- as chances dos sorteados são as da seção "Refino" da
  [página de Combinação do Browiki](https://browiki.org/wiki/Combina%C3%A7%C3%A3o):

  | | +1 | +2 | +3 | +4 | +5 | +6 | +7 | +8 | +9 | +10 | +11 | +12 |
  | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
  | Martelo de Refino Sombrio | 4,40% | 8,79% | 17,03% | 35,16% | 17,58% | 8,79% | 4,40% | 2,20% | 1,10% | 0,55% | | |
  | Cubo Ilusional | | | | | | | 65% | 22% | 10% | 3% | | |
  | Super Cubo Ilusional | | | | | | | | | 65% | 28,5% | 5% | 1,5% |

- o refino dos fixos está na descrição de cada um ("Refina um item temporal para o +11"), e o
  gerador confere que continua lá a cada execução.

**Para quem serve e a partir de que refino** vem do Divine Pride, gerado por:

```bash
npm run data:atalhos              # baixa as ~55 páginas e regrava src/data/atalhos.json
npm run data:atalhos -- --simular # só mostra o que leu
```

A página de cada cubo e martelo no Divine Pride tem, além da descrição, uma aba **estruturada**
com os equipamentos aceitos — com link, e portanto com id:

- **"This box can upgrade"** (melhoria, os cubos): os alvos e o refino mínimo exigido. O
  Ilusional exige +4; os cubos que só existem no LATAM vêm com `-` na coluna, lido como "sem
  exigência".
- **"Can be used to reform"** (reforma, os martelos): por alvo, a faixa aceita (`+9 ~ +11`), a
  mudança (`+1`) e os materiais (`Bênção do Ferreiro ×14`). A mesma aba tem uma segunda seção,
  "Required material for reforming", com reformas de **outro** item que usa o martelo como
  material — no kRO, um NPC que leva do +0~+4 ao +7. Ela fica de fora.

É essa lista com link que torna a coisa viável. A descrição diz "Armas OS" ou "Thanos Dagger", e
casar isso com a base por nome seria adivinhar tradução.

O gerador aborta sem gravar se um martelo tiver regras diferentes por alvo, se um alvo virar
outro item (aí não é martelo de refino, é reforma de verdade), se o +N de um cubo fixo não
aparecer em descrição nenhuma, ou se menos de 80% das páginas forem lidas.

### O teto: quando o atalho deixa de ser aceito

Os cubos não publicam o refino **máximo** aceito. A regra usada é a mesma em todo lugar onde ele
é publicado: o item é recusado a partir do maior refino que o atalho pode dar. É assim no banco
do rAthena (`laphine_upgrade.yml`: o Temporal, que dá +11, aceita até o +10; o Ilusional, que
sorteia até o +10, aceita até o +9) e no Mestre do Refino ("este item já está refinado tanto
quanto o pergaminho"). Os martelos publicam a faixa, e ela vale.

### Os Pergaminhos de Arma e Armadura

Não têm lista de alvos: quem os aplica é o **Mestre do Refino** (Prontera 184, 177 — a descrição
LATAM do item aponta para ele), e a regra dele é por categoria. Ela não está em página nenhuma do
Divine Pride; vem do script do NPC no rAthena
([`npc/re/merchants/ticket_refiner.txt`](https://github.com/rathena/rathena/blob/master/npc/re/merchants/ticket_refiner.txt)):

- Pergaminho de **Arma**: arma de nível 1 a 4;
- Pergaminho de **Armadura**: equipamento de nível 1;
- só com o refino atual **menor** que o do pergaminho.

Arma nv5 e Equipamento nv2 (os de Éter, com Grau) ficam de fora, e Sombrio também.

O que se vende no mercado é quase sempre a **Caixa de Arma +X** do Cash Shop, que entrega um
Pergaminho de Arma +X ao ser aberta — o par caixa → pergaminho é o `getitem` de cada caixa no
`item_db_usable.yml` do rAthena. A cotação procura o pergaminho e, sem ele, usa a caixa.

## Preço

`npm run precos` cota cada atalho negociável no mercado do LATAM, junto com os minérios — ver
[Preços](dados-precos.md). As caixas entram pelo mesmo mecanismo dos Enriquecidos vendidos em
caixa de 10: a Cx. Martelo de Refino Sombrio (3) vira preço de um martelo dividindo por três.

Três itens ficam **sem preço de propósito**: os Tickets de Refino Nobre, Ilustre e Grácil, e o
Cubo de Refino de Cinzas +11. São presos na conta, então não há mercado para cotar. Sem preço, o
motor não os considera — a mesma regra do minério sem preço nem receita — e a tela avisa que o
item os aceita. Quem tem um digita quanto ele vale para si (0, se não pretende vendê-lo).

## O que fica de fora

- **Caixa Selecionável** (sombrio já refinado, +7 a +10 sorteado): não refina o seu item, entrega
  outro. É uma compra, não um atalho.
- **Martelo Conversor**: troca uma arma refinada por um pergaminho — o caminho inverso.
- **Caixa de Alto/Baixo Refino** e **Envelopes de Refino**: sorteiam *qual* pergaminho vem, e
  nenhuma fonte publica as chances.
- **Cubos Reforçados**: trocam o item por uma versão mais forte e derrubam o refino para +7. É
  reforma, não refino.

## Hipóteses

- O resultado acima do alvo da fase conta como chegar no alvo. Num preparo de Grau, um cubo que dá
  +12 quando o plano pedia +11 tenta o Grau com o item no +11 — a chance de Grau só cresce com o
  refino, então a conta é pessimista, nunca otimista.
- O Pergaminho +10 entra embora o script do rAthena não o liste no Mestre do Refino: a caixa e o
  pergaminho existem no LATAM com a mesma descrição dos outros. É a suposição desta tabela.
- A lista de alvos é a do Divine Pride. Um alvo que não está na base de itens (não chegou ao
  LATAM) simplesmente nunca aparece; um item do LATAM que o Divine Pride esqueceu de listar fica
  sem o atalho, e a correção é no site deles.
