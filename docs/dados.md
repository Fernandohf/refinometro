# Os dados

Este documento é a porta de entrada dos dados que alimentam o cálculo: de onde cada número
vem, qual fonte ganha quando duas discordam, e onde está o detalhe de cada uma.

| Documento | O que tem lá |
| --- | --- |
| [Chances e custos](dados-chances.md) | As tabelas do Browiki, o parser e as quatro divergências registradas |
| [Itens](dados-itens.md) | A base do Divine Pride: varredura semanal, armadilhas do scraper e o que não é refinável |
| [Preços](dados-precos.md) | A cotação do mercado LATAM, a mediana ponderada e por que a média de 30 dias não serve |

Nenhum desses comandos é necessário para rodar o site: os arquivos gerados estão versionados
no repositório.

## A ordem das fontes

O alvo é o **Ragnarok Latin America**, e é isso que decide o que serve de referência. As fontes
não valem todas o mesmo, e a ordem abaixo é a regra do projeto — quando duas discordam, ganha a
de cima, e a discordância vira um aviso na tela em vez de sumir na conta.

1. **[Browiki](https://browiki.org/wiki/Refinamento)** — o wiki do próprio servidor
   ("O fã site brasileiro de *Ragnarök Online Latin America*"). É a referência preferida para
   mecânica: chances, minérios, penalidades, custos de NPC, Grau.
2. **[Divine Pride](https://www.divine-pride.net/), servidor LATAM** — datamine do cliente do
   jogo, não texto escrito à mão, e por isso mais confiável sobre o que um item **é**: id, nome,
   categoria, faixa de refino, descrição. A ressalva é que a descrição é uma string do cliente:
   ela pode estar desatualizada ou traduzida errado (o Carnium de Éter é um caso — ver
   [Chances e custos](dados-chances.md#as-divergências-registradas)).
3. **Outros wikis** ([iROwiki](https://irowiki.org/wiki/Refinement_System),
   [Hazy Forest](https://hazyforest.com/equipment:refine)) — servem só onde as duas de cima não
   dizem nada, e o que vier de lá fica marcado como não confirmado no LATAM. Não é fonte para
   contradizer o Browiki.

Preço tem uma quarta fonte, de outra natureza: a
[consulta de preço de mercado](https://ro.gnjoylatam.com/pt/intro/shop-search/market-price) do
site oficial, que publica o histórico de transações das lojas de jogador. Ela não decide nada no
cálculo — a cotação que entra na conta é a sua, sempre. Ela decide o número que está no campo
antes de você digitar o seu, e é atualizada por `npm run precos`. Ver [Preços](dados-precos.md).

Hoje só um número está no nível 3 — a taxa que o refinador cobra por tentativa, que nenhuma
fonte do LATAM publica. Na base de itens, o **nome** é sempre o do LATAM (item sem tradução nem
entra na busca); só a *categoria* de um item recém-lançado pode vir do cartão em inglês, porque
nível de arma e posição não mudam de servidor.

## Taxa do refinador — fora do LATAM

Único número do projeto que vem de um wiki de outro servidor, e por falta de opção. O NPC cobra
um valor em zeny por tentativa, além do minério; nem o Browiki nem a ficha do item no jogo
publicam quanto. O [iROwiki](https://irowiki.org/wiki/Refinement_System) publica, e é de lá que
sai a tabela em [`src/data/ores.ts`](../src/data/ores.ts). Ignorar a taxa seria pior que usar a
de iRO — ela entra em toda tentativa e decide, na margem, qual minério compensa —, então ela
entra marcada como não confirmada, no rodapé do app e aqui:

| Categoria | Taxa de Refino por tentativa |
| --- | --- |
| Arma nv1 | 50z |
| Arma nv2 | 200z |
| Arma nv3 | 5.000z |
| Arma nv4 | 20.000z |
| Arma nv5 | 50.000z |
| Equipamento nv1 | 2.000z |
| Equipamento nv2 | 30.000z |

**Minério comprado no Cash Shop isenta a taxa** — Enriquecido e Perfeito de Oridecon, Elunium,
Bradium e Carnium saem por 0z. Por isso a taxa é calculada por *ação*, não por campanha: ela
entra no custo que o otimizador compara, então um Enriquecido 50k mais caro que o Oridecon é,
na prática, só 30k mais caro numa arma nv4. Pela mesma razão o total de taxas **não** é
`tentativas × valor fixo`; ele vem somado do motor, tentativa a tentativa.

Duas coisas ficaram como estão, à espera de confirmação in-game:

- **Sombrios não aparecem na tabela** e estão com taxa 0. Chutar sairia caro no lugar errado,
  já que a taxa entra em toda tentativa.
- A isenção segue `joyCoins` (Cash Shop), não `especial`. Os Enriquecidos e Perfeitos **de
  Éter** também são especiais, mas são fabricados no NPC, e nada na fonte indica que sejam
  isentos — então pagam.

Na prática a taxa pesa pouco: 0,01% do custo num equipamento nv1 até +10, ~2% numa campanha de
Grau A. O que ela muda de verdade é a escolha na margem.

Ao contrário das tabelas do Browiki, esta foi transcrita à mão — o iROwiki fica atrás do
Cloudflare e devolve 403 para qualquer script (a leitura saiu pelo
[Wayback Machine](https://web.archive.org/web/2026/https://irowiki.org/wiki/Refinement_System)).
Não há parser para avisar se a fonte mudar; quem confere é `npm test`, que trava os valores.

Itens fabricáveis no NPC podem ficar em 0: a calculadora cota pela receita e escolhe
sozinha a via mais barata entre comprar pronto e fabricar.

## Proveniência e licença dos dados

O código está sob a [licença MIT](../LICENSE). Os **dados** não são meus e seguem a licença de
quem os publicou: `data-raw/*.wiki` é wikitext copiado do [Browiki](https://browiki.org), e
`src/data/items.json` vem das páginas públicas do
[Divine Pride](https://www.divine-pride.net/). Ragnarok Online é da Gravity; este é um projeto
de fã, sem vínculo com a Gravity, a GNJOY Latam ou o Divine Pride.

---

Ver também: [Como o motor funciona](motor.md) · [A matemática do motor](matematica.md)
