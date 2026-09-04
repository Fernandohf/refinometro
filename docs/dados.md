# Os dados

Este documento é a porta de entrada dos dados que alimentam o cálculo: de onde cada número
vem, qual fonte ganha quando duas discordam, e onde está o detalhe de cada uma.

| Documento | O que tem lá |
| --- | --- |
| [Chances e custos](dados-chances.md) | As tabelas oficiais da GNJOY, o parser e as divergências registradas |
| [Itens](dados-itens.md) | A base do Divine Pride: varredura semanal, armadilhas do scraper e o que não é refinável |
| [Preços](dados-precos.md) | A cotação do mercado LATAM, a mediana ponderada e por que a média de 30 dias não serve |

Nenhum desses comandos é necessário para rodar o site: os arquivos gerados estão versionados
no repositório.

## A ordem das fontes

O alvo é o **Ragnarok Latin America**, e é isso que decide o que serve de referência. As fontes
não valem todas o mesmo, e a ordem abaixo é a regra do projeto — quando duas discordam, ganha a
de cima, e a discordância vira um aviso na tela em vez de sumir na conta.

1. **[Divulgação de chances da GNJOY Americas](https://ro.gnjoyamericas.com/pt/news/probability/2)**
   — a operadora do servidor publicando as próprias probabilidades. É a fonte das chances de
   refino e de grau, e de quais minérios servem a cada categoria. Não publica custos.
2. **[Browiki](https://browiki.org/wiki/Refinamento)** — o wiki do LATAM ("O fã site brasileiro
   de *Ragnarök Online Latin America*"). É a referência para o que a página oficial não cobre:
   penalidades de falha, receitas e custos de NPC, materiais de Grau. Onde ele contradiz a
   divulgação oficial, perde — foi o que aconteceu com oito chances e com o Grau no +9, ver
   [Chances e custos](dados-chances.md#por-que-a-fonte-deixou-de-ser-o-browiki).
3. **[Divine Pride](https://www.divine-pride.net/), servidor LATAM** — datamine do cliente do
   jogo, não texto escrito à mão, e por isso mais confiável sobre o que um item **é**: id, nome,
   categoria, faixa de refino, descrição. A ressalva é que a descrição é uma string do cliente:
   ela pode estar desatualizada ou traduzida errado (o Carnium de Éter é um caso — ver
   [Chances e custos](dados-chances.md#as-divergências-registradas)).
4. **O jogo, conferido no balcão** — quando nenhuma das três publica o número, ou quando o que
   elas publicam pode ser conferido. É de onde vem a tabela inteira de taxa do refinador, o custo
   do primeiro degrau de grau, e a confirmação de que o NPC de Grau recusa item abaixo do +11.
   Onde o balcão contradiz um wiki, ganha o balcão.
5. **Outros wikis** ([iROwiki](https://irowiki.org/wiki/Refinement_System),
   [Hazy Forest](https://hazyforest.com/equipment:refine)) — servem só onde nada acima diz nada,
   e o que vier de lá fica marcado como não confirmado no LATAM. Não é fonte para contradizer as
   de cima, e hoje nenhum número do projeto vem daqui: o iROwiki era a fonte da taxa do
   refinador até ela ser medida no jogo, e errava sete das nove categorias.

Preço tem uma quarta fonte, de outra natureza: a
[consulta de preço de mercado](https://ro.gnjoylatam.com/pt/intro/shop-search/market-price) do
site oficial, que publica o histórico de transações das lojas de jogador. Ela não decide nada no
cálculo — a cotação que entra na conta é a sua, sempre. Ela decide o número que está no campo
antes de você digitar o seu, e é atualizada por `npm run precos`. Ver [Preços](dados-precos.md).

Hoje quase nada está no nível 5: a taxa do refinador saiu de lá para o nível 4 quando foi
medida, e o que sobra de terceiro é o custo de três degraus de grau, que ninguém conferiu. Na
base de itens, o **nome** é
sempre o do LATAM (item sem tradução nem entra na busca); só a *categoria* de um item
recém-lançado pode vir do cartão em inglês, porque nível de arma e posição não mudam de
servidor.

## Taxa do refinador — medida no balcão

O NPC cobra um valor em zeny por tentativa, além do minério, e ninguém publica quanto: nem a
divulgação oficial (que traz chances, não custos), nem o Browiki, nem a ficha do item. É o único
lugar do projeto sem fonte publicada — então foi levantado no jogo, categoria por categoria, em
2026-09-04.

| Categoria | Taxa por tentativa | Com minério de Cash Shop |
| --- | --- | --- |
| Arma nv1 | 1.000z | **0z** |
| Arma nv2 | 2.000z | **0z** |
| Arma nv3 | 10.000z | **0z** |
| Arma nv4 | 10.000z | **0z** |
| Arma nv5 | 75.000z | não tem minério de Cash Shop |
| Manopla Sombria | 10.000z | **0z** |
| Equipamento nv1 | 10.000z | 10.000z |
| Equipamento nv2 | 45.000z | não tem minério de Cash Shop |
| Equipamento Sombrio | 10.000z | 10.000z |

Todas as nove foram medidas no NPC, com minério comum e, onde ele existe, com o de Cash Shop —
**na faixa do +0 ao +9**. Ver a ressalva logo abaixo.

O [iROwiki](https://irowiki.org/wiki/Refinement_System) servia de fonte para essa tabela até
agora, e **errou sete das nove**: Arma nv1 (50z), nv2 (200z), nv3 (5.000z), nv4 (20.000z), nv5
(50.000z), Equipamento nv1 (2.000z), nv2 (30.000z). Sombrio ele nem listava, e o projeto usava 0.
Nenhum valor dele sobreviveu à conferência, e é por isso que ele deixou de ser citado como fonte
aqui.

**A taxa não muda com o refino do item** dentro da faixa medida: é a mesma do +0 ao +9,
conferido.

### O que a medição não alcançou: a faixa do +10 para cima

Todo minério testado é da faixa do +0 ao +9 — Fracon, Emveretarcon, Oridecon, Elunium,
Eteridecon, Eterium e os especiais deles. **Nenhuma tentativa foi feita com Bradium, Carnium,
Bradium de Éter, Carnium de Éter, nem com os Perfeitos que só valem do +10 para cima**
(Bradium Perfeito, Carnium Perfeito, Eteridecon Perfeito, Eterium Perfeito e os de Éter
perfeitos).

Do +10 em diante, portanto, a calculadora **extrapola**: assume a mesma taxa da categoria e a
mesma regra de isenção. É uma suposição razoável — a taxa não variou em nada dentro da faixa
medida —, mas é suposição, e ela cai justamente onde a campanha fica cara. Nas categorias de
Éter isso pesa: 75.000z por tentativa numa arma nv5, num trecho em que cada tentativa tem 8% de
chance.

### A isenção do Cash Shop separa arma de equipamento

Refinar uma **arma** com Oridecon Enriquecido custa **0z de taxa** — nv1 a nv4 e também a Manopla
Sombria. Refinar um **equipamento** com Elunium Enriquecido, ou Perfeito, custa a taxa cheia —
nv1 e Sombrio. O mesmo tipo de minério isenta de um lado e não isenta do outro.

O par de sombrios é o que fecha a leitura: Manopla e Equipamento Sombrio cobram os mesmos
10.000z, usam a mesma coluna de chances, e mesmo assim só a Manopla sai por 0z com o
Enriquecido. Não é diferença de balcão nem de faixa: é arma × equipamento.

O iROwiki descreve a isenção sem ressalva de categoria ("If the player is using Enriched Oridecon
/ Enriched Elunium / HD Oridecon / HD Elunium from the Kafra Shop, the fee is 0z"), e nenhuma
fonte explica a diferença — mas é o que o NPC cobra. As categorias de Éter ficam fora da questão:
o especial delas é fabricado no NPC, não comprado com JoyCoins, e paga taxa cheia (conferido com
Eteridecon Enriquecido na arma nv5 e Eterium Enriquecido no equipamento nv2).

É por isso que a taxa é calculada por **ação**, e não por campanha: ela entra no custo que o
otimizador compara, então numa arma nv4 um Enriquecido 50k mais caro que o Oridecon é, na
prática, só 40k mais caro. Pela mesma razão o total de taxas **não** é `tentativas × valor
fixo`; ele vem somado do motor, tentativa a tentativa.

Na prática a taxa pesa pouco no total: 0,3% do custo de um equipamento nv1 até o +10 e ~3% numa
campanha de Grau A, com os preços de partida. O que ela muda de verdade é a escolha na margem.

Esta tabela foi transcrita à mão, ao contrário das de chance: não há parser para avisar se ela
mudar, e quem trava os valores é o `npm test`.

Itens fabricáveis no NPC podem ficar em 0: a calculadora cota pela receita e escolhe
sozinha a via mais barata entre comprar pronto e fabricar.

## Custos de Grau — meio medidos

O zeny de cada processo de grau vem do [Browiki](https://browiki.org/wiki/Grau), e só o primeiro
degrau deu para conferir no NPC: **sem grau → D custa 150.000z no normal e 750.000z no seguro**,
contra os 100.000z e 500.000z que o wiki diz. Os outros três degraus continuam com o número do
wiki e ficam **suspeitos** — o único que deu para medir estava errado.

O que a medição confirmou foi a *estrutura*: o processo seguro custa 5× o normal e consome 5× o
material. As receitas dos materiais de grau (`GRADE_RECIPES`) vêm do mesmo lugar e carregam a
mesma ressalva.

## O que ainda não foi conferido

A lista fechada do que hoje **não** tem número medido nem fonte do LATAM. Cada item diz o que
precisa para ser testado, porque é isso que trava: quem levantou o resto não tinha em mãos um
item no estado necessário.

| O que falta | Onde entra | Precisa de |
| --- | --- | --- |
| A taxa do refinador **do +10 para cima** — com Bradium, Carnium, os de Éter da faixa alta e os Perfeitos | `TAXA_REFINO`, `taxaDaTentativa` | um item no +10 ou acima; é só abrir a janela do refino e ler o valor |
| Custo dos degraus **D → C**, **C → B** e **B → A** | `GRADE_STEPS` | um item de Arma nv5 ou Equipamento nv2 **já com grau D, C ou B**, para abrir a janela do NPC |
| Bradium e Carnium destroem o item numa falha rara? | `penalidade` dos dois | volume de tentativas do +11 para cima, não uma consulta — é um evento raro |

Os três degraus de grau estão com o valor do [Browiki](https://browiki.org/wiki/Grau), e o único
degrau que deu para medir (o D) estava errado em 50% — então esses três são **estimativas
suspeitas**, e uma campanha de Grau A pode custar mais do que a tela diz. A taxa acima do +10 é
extrapolada da faixa medida. As duas são hipóteses registradas em
[A matemática do motor](matematica.md#11-hipóteses-do-modelo-e-o-que-elas-deixam-de-fora).

Não é preciso ser conclusivo para ajudar: abrir a janela do NPC e ler o valor já resolve as duas
primeiras linhas.

## Proveniência e licença dos dados

O código está sob a [licença MIT](../LICENSE). Os **dados** não são meus e seguem a licença de
quem os publicou: `data-raw/gnjoy-*.html` são as tabelas publicadas pela
[GNJOY Americas](https://ro.gnjoyamericas.com/pt/news/probability/2), e
`src/data/items.json` vem das páginas públicas do
[Divine Pride](https://www.divine-pride.net/). Ragnarok Online é da Gravity; este é um projeto
de fã, sem vínculo com a Gravity, a GNJOY Latam ou o Divine Pride.

---

Ver também: [Como o motor funciona](motor.md) · [A matemática do motor](matematica.md)
