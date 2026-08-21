# Refinômetro

Calculadora de custo de refino para o Ragnarok Latam. Diz quanto zeny, quantos minérios e
quantas cópias do próprio equipamento você precisa ter em caixa para levar uma arma ou
equipamento até um refino e um grau alvo, qual a melhor estratégia de minérios em cada
faixa, e quanto o item vale no fim.

## Por que não basta multiplicar

Um refino não é uma sequência de tentativas independentes. Uma falha pode destruir o item,
derrubar 1 refino ou derrubar 3, dependendo do minério — então a melhor escolha em cada
nível depende do custo esperado dos níveis vizinhos, inclusive dos que ficam _abaixo_ de
onde você começou. E cada subida de Grau **zera o refino de volta para +0**, o que
transforma "quero Grau A +11" em cinco subidas de refino, não uma.

O motor trata isso como um processo de decisão de Markov e resolve por **iteração de
política**: avalia a política atual resolvendo o sistema linear de forma exata (LU, no
máximo 20 estados), melhora estado a estado e repete. Iteração de valor não serve aqui —
nos alvos altos o custo esperado passa de 10¹³ zeny, e ela precisaria de centenas de
milhares de passos para convergir, entregando números truncados que parecem plausíveis.

Em cima disso roda uma simulação de Monte Carlo, que dá os percentis: a distribuição tem
cauda longa e quem se planeja pela média fica sem recursos no meio do caminho quase metade
das vezes. As quantidades médias de material vêm sempre do cálculo exato, nunca da
amostragem; da simulação sai só o que a média não sabe responder — os percentis.

Na faixa de quebra o próprio equipamento vira consumo, então ele entra na conta como
material: a tela mostra quantas cópias separar na margem escolhida (a sua mais uma por
quebra), e não só quanto zeny levar.

### Dois passes

Simulação boa custa segundos, e segundos de laço síncrono congelam a aba. Então o cálculo
roda duas vezes: um **passe rápido** (~80ms, síncrono) para a tela nunca ficar vazia
enquanto se digita, e um **passe preciso** (até 3s, num Web Worker) que substitui o
resultado quando fica pronto. O orçamento é de tempo: `calcular(input, { tempoMs })`
converte tempo em tentativas de refino (ver `TENTATIVAS_POR_MS`, calibrado com
`npm run perf`) e daí decide quantas campanhas simular.

### Comprar ou fabricar

Metade dos minérios ninguém compra pronto: fabrica no NPC. O custo de cada item é o menor
entre o preço de mercado informado e o da receita, recursivamente — o Eterium Enriquecido
vale um Elunium Enriquecido mais 2 Pó de Éter mais o balcão, e é assim que ele entra no
custo final. A lista de compras desmonta a conta seguindo exatamente a mesma decisão, até
chegar no que se acha no mercado.

### Alvos inalcançáveis

Acima do +14 a Bênção do Ferreiro para de funcionar e cada falha derruba 3 refinos, então o
custo explode. Levar uma arma nível 4 do +0 ao +20 exige da ordem de 10⁸ tentativas de
refino. Nesses casos a calculadora não simula: percentis truncados subestimariam o custo em
ordens de grandeza. Ela mostra o custo exato e diz que o alvo está fora de alcance.

Onde fica esse corte depende do orçamento de tempo — o passe preciso alcança alvos que o
passe rápido declara fora de alcance —, mas ele nunca é uma escolha à parte: é o orçamento
dividido pelo número mínimo de campanhas simuladas.

## Rodando

Precisa de **Node.js 22 ou mais novo** (é a versão que o CI usa) e do npm que vem junto. Na
raiz do repositório:

```bash
npm install       # só na primeira vez, e quando o package.json mudar
npm run dev       # servidor de desenvolvimento em http://localhost:5173
```

O `npm run dev` fica em modo watch: salvou um arquivo, a página atualiza sozinha. Para parar,
`Ctrl+C`.

### Testes e build

```bash
npm test            # testes do motor de cálculo (uma passada, é o que o CI roda)
npm run test:watch  # reexecuta a cada alteração, para desenvolver
npm run typecheck   # só o TypeScript, sem gerar nada
npm run build       # build de produção em dist/
npm run preview     # serve o dist/ para conferir o build antes de publicar
```

Vale saber: `npm run build` roda o `tsc -b` antes do Vite, então erro de tipo derruba o build.
E o `base` do Vite muda entre dev (`/`) e build (`/refinometro/`) — no `preview` o site abre
em `http://localhost:4173/refinometro/`, não na raiz.

### Inspeção pelo terminal

Sem abrir o navegador:

```bash
npm run demo     # imprime planos de exemplo por extenso
npm run perf     # mede os dois passes e calibra TENTATIVAS_POR_MS
npm run buscar -- "Espingarda"   # procura itens no Divine Pride
```

O `--` antes dos argumentos é obrigatório nos scripts que recebem parâmetros (`buscar`,
`item`): sem ele o npm engole o resto da linha. `demo` e `perf` rodam offline; `buscar` e
`item` falam com o Divine Pride e precisam de conexão.

Os comandos que atualizam os dados versionados (`data:fetch`, `data:parse`, `item`) estão
descritos em [Dados](#dados) — não são necessários para rodar o site.

## Dados

### Chances e custos — Browiki

As tabelas de chance, os minérios, as penalidades de falha e os custos de Grau saem do
Browiki e ficam versionados no repositório.

```bash
npm run data:fetch   # baixa o wikitext bruto para data-raw/
npm run data:parse   # gera src/data/refineChances.json e gradeChances.json
```

O parser falha alto se o formato da tabela mudar, em vez de gerar números errados em
silêncio. Se o Browiki reorganizar as páginas, `npm run data:parse` avisa.

Fontes: [Refinamento](https://browiki.org/wiki/Refinamento) · [Grau](https://browiki.org/wiki/Grau)

As tabelas de minério foram conferidas contra o [Hazy Forest](https://hazyforest.com/equipment:refine),
wiki não-oficial do kRO. Bateram em tudo — inclusive na parte que parecia errada: para Arma nv5 e
Equipamento nv2, **todo minério acima do +10 destrói o item**, até os Perfeitos. É o inverso do
padrão dos níveis 1–4, e é assim mesmo.

Duas divergências entre as fontes ficaram registradas:

**Bradium e Carnium.** O Hazy Forest diz que, além da queda de 3 refinos, existe uma chance
**rara** de destruir o item; o Browiki só cita a queda. Como nenhuma das duas fontes dá o
número, ele não é modelado — a calculadora avisa quando o plano depende desses minérios.

**Grau abaixo do +11.** O texto do Browiki afirma que o processo exige o item em +11, mas a
tabela de chances da própria página lista valores desde o +9, e o
[Hazy Forest](https://hazyforest.com/equipment:grade) traz a mesma tabela sem citar exigência
nenhuma. Entre um texto e duas tabelas que concordam, o motor segue as tabelas: Grau D vale a
partir do +9, C do +10, B e A do +11 (`REFINO_MINIMO_GRAU`). Isso não é detalhe: com o processo
seguro, a falha não destrói nada, então chance baixa custa só repetição de material — e tentar o
Grau D logo no +9 sai **22% mais barato** que subir até o +11 antes, numa campanha completa de
arma nv5. Quando o plano aposta nisso, um aviso aparece; falta confirmar in-game.

### Itens — Divine Pride

A base de itens serve só para descobrir a categoria do equipamento (Arma nv1–5, Equipamento
nv1–2, Sombrio) e se ele é refinável — é a única coisa que o cálculo precisa saber sobre o
item. O preço continua sendo informado à mão: o Divine Pride não guarda cotação.

Os dados vêm da **página pública**, que não exige chave e já traz o nome em português do
servidor LATAM.

**Buscando pelo nome:**

```bash
npm run buscar -- "Espingarda"                 # lista o que achou
npm run buscar -- "Espingarda" --salvar        # resolve e grava na base
npm run buscar -- Caça --cat=armor             # weapon | armor | shadow
npm run buscar -- Sombrio --paginas=5          # 20 resultados por página
```

**Cadastrando por ID**, quando você já sabe qual é:

```bash
npm run item -- 1867
npm run item -- https://www.divine-pride.net/database/item/1867/
npm run item -- 1867 5031 2101      # vários de uma vez
```

Cada item resolvido é acrescentado a `src/data/items.json`, que fica versionado. Sem a base,
o site funciona igual — só pede que você escolha a categoria à mão.

A base cresce sob demanda de propósito: a ficha completa pesa ~400 KB, então varrer o banco
inteiro significaria gigabytes de tráfego no servidor deles. Por isso `--salvar` recusa mais
de 40 resultados de uma vez.

#### Duas armadilhas da busca

**Os cookies decidem se a busca funciona.** O Divine Pride guarda idioma e região em
`dp_language` / `dp_region`, e o padrão é coreano. Sem eles, `?query=Espingarda` devolve
*"0 results"* — não um erro, apenas nada, como se o item não existisse. `scripts/divinepride.ts`
manda `dp_language=portuguese; dp_region=LATAM` em toda requisição.

**Item sem tradução aparece com o nome em branco.** O site mantém um cartão LATAM vazio para
esses casos, e a listagem sai com a célula de nome vazia — às vezes contendo só o marcador de
slots, `[1]`, que sozinho não é nome. São itens que não chegaram ao LATAM, e a busca os
descarta: sem nome não há como reconhecê-los nem procurá-los na interface. O rodapé diz
quantos foram ignorados, e eles continuam cadastráveis pelo ID (`npm run item -- <id>`), aí
sim com o nome vindo do servidor em inglês.

Cuidado com um detalhe ao mexer nisso: o aviso de "truncado" compara o total anunciado com as
linhas **lidas**, não com as aproveitadas. Comparar com as aproveitadas faria toda busca que
topasse com um item sem tradução parecer truncada.

O filtro é aplicado **na origem**: a busca de armaduras manda
`subTypes=Headgear,Armor,Shield,Garment,Shoes`, o que já exclui os Acessórios, e as categorias
`costume`, `card` e `consumable` nem são consultadas. Mas o veredito final é sempre do
classificador, com a ficha completa em mãos — a listagem não traz nível de arma nem posição na
cabeça, e sem isso não dá para saber se um headgear é de Topo.

Existe também `scripts/fetch-divinepride.mjs`, que usa a API oficial e conseguiria gerar a
base inteira de uma vez, mas exige `DIVINE_PRIDE_API_KEY`. Está guardado para quando fizer
sentido; o mapeamento de campos dele ainda não foi validado contra uma resposta real.

#### O que não é refinável

`src/data/itemKinds.ts` decide a categoria e recusa o que o jogo não deixa refinar:

| Situação | Refina? |
| --- | --- |
| Equipamento de cabeça no **Topo** (`Location: Upper`) | sim |
| Equipamento de cabeça só no **Meio** e/ou **Baixo** | não |
| Acessório comum | não |
| **Acessório sombrio** (Brinco, Colar) | sim |
| Item visual (Costume) | não |
| Armadura, escudo, calçado, capa | sim |

Os sombrios são duas categorias, não uma: arma sombria refina com Oridecon e armadura sombria
com Elunium, embora ambas usem a mesma coluna de chances.

As duas exceções que enganam: um acessório *sombrio* refina, ao contrário do comum; e um
visual de cabeça no Topo continua não refinando.

### Preços

Os preços de minérios são de mercado e mudam por servidor e por semana, então são
informados por você na interface e ficam salvos no navegador. Os valores que vêm
preenchidos em `src/data/defaultPrices.ts` são médias do
[Hazy Forest](https://hazyforest.com/equipment:refine), não um preço oficial.

### Taxa do refinador — iROwiki

O NPC cobra um valor em zeny por tentativa, além do minério. Nem o Browiki nem o Hazy Forest
publicam esses números; o [iROwiki](https://irowiki.org/wiki/Refinement_System) publica, e é
de lá que sai a tabela em `src/data/ores.ts`:

| Categoria | Taxa por tentativa |
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

## O que não é considerado

- Cartas nos itens
- Encantamentos e bônus aleatórios
- Pergaminhos, Cubos e Martelos de Refino, que pulam direto para um refino fixo

## Publicação

`.github/workflows/deploy.yml` roda os testes, faz o build e publica no GitHub Pages a cada
push na `main`. O `base` do Vite está em `/refinometro/`; se o repositório tiver outro nome,
ajuste em `vite.config.ts`.

## Estrutura

```
scripts/     coleta e conversão dos dados de origem
data-raw/    wikitext bruto do Browiki, versionado
src/data/    tabelas geradas, catálogos escritos à mão (minérios, grau, preços)
             e a classificação de itens (itemKinds.ts)
src/engine/  o cálculo: Markov, simulação, otimização de estratégia
src/         interface
tests/       testes do motor
```
