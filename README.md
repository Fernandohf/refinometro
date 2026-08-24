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

O motor trata isso como um processo de decisão de Markov e resolve o custo esperado de forma
exata, escolhendo o minério ótimo de cada nível em vez de seguir uma receita fixa — os
detalhes de como estão em [Como o motor funciona](#como-o-motor-funciona).

Em cima disso roda uma simulação de Monte Carlo, que dá os percentis: a distribuição tem
cauda longa e quem se planeja pela média fica sem recursos no meio do caminho quase metade
das vezes. As quantidades médias de material vêm sempre do cálculo exato, nunca da
amostragem; da simulação sai só o que a média não sabe responder — os percentis.

Na faixa de quebra o próprio equipamento vira consumo, então ele entra na conta como
material: a tela mostra quantas cópias separar na margem escolhida (a sua mais uma por
quebra), e não só quanto zeny levar.

E há a pergunta inversa, que é a que a maioria das pessoas tem de fato: *com o que já está
na minha mochila, qual a chance de eu chegar lá?* Ela tem um painel próprio — ver
[As decisões](#as-decisões-e-o-que-cada-uma-muda-na-tela), e o detalhe formal está em
[docs/matematica.md §9](docs/matematica.md#9-a-pergunta-inversa-o-painel-de-estoque).

## Como o motor funciona

Todo o cálculo vive em `src/engine/` e não depende de React: entra um `CalcInput` (categoria,
refino e grau atuais, alvos, preços, se pode usar Bênção e minério especial, se dá para perder
o item) e sai um `Resultado` com plano, custo, materiais, percentis e avisos. A interface só
desenha o que ele devolve.

Esta seção é o mapa: o que o motor decide, em que ordem, e o que cada decisão muda na tela. A
formalização — o MDP, as demonstrações, o erro de cada aproximação e as referências de cada
resultado usado — está em **[docs/matematica.md](docs/matematica.md)**, e os ponteiros `→ §x`
abaixo levam para lá.

### O caminho de um cálculo

`calcular()` (`src/engine/plan.ts`) é o maestro, e faz sempre a mesma sequência:

1. **Valida** o alvo contra a categoria — refino acima do máximo da coluna, grau em item que
   não tem grau, alvo abaixo do atual.
2. **Quebra a campanha em fases.** Subir de grau reseta o refino, então "Grau A +11" vira
   `refinar → grau D → refinar → grau C → … → refinar até +11`. Sem grau, é uma fase só. → §1.2
3. **Resolve cada fase de refino** como uma cadeia de Markov (`solveRefine`), e cada degrau de
   grau por busca exaustiva sobre as três decisões que ele tem (`solveGradeStep`). → §2–4, §6
4. **Agrega os recursos** somando os números exatos de cada fase — zeny, minérios, bênçãos,
   tentativas, taxas, quebras. → §3.2
5. **Simula**, se o alvo couber no orçamento de tempo, só para extrair os percentis. → §8
6. **Gera os avisos**, lendo o plano já pronto: risco de quebra, processo de grau normal,
   Bradium sem Bênção, grau abaixo do +11, simulação curta ou truncada.

O passo 4 é deliberadamente independente do 5. Todo número de material que a tela mostra como
média vem da álgebra, não da amostragem — inclusive quando a simulação nem chega a rodar.

### As decisões, e o que cada uma muda na tela

**Que minério usar em cada nível** → §2–4. Uma falha pode destruir o item, derrubar 1 refino ou
derrubar 3, então a melhor escolha em cada nível depende do custo esperado dos vizinhos —
inclusive dos que ficam _abaixo_ de onde você começou. O motor resolve isso como um processo de
decisão de Markov e de forma exata (sistema linear, não iteração truncada); a política que sai é
o que a tela mostra como estratégia por faixa. A taxa do refinador entra por tentativa, e não
como constante da campanha: minério de Cash Shop é isento, e é isso que faz o Enriquecido
competir de igual para igual com o Oridecon numa arma nv4.

**Quebrar custa, e devolve o item ao +0** → §2.1. Quando a falha destrói o equipamento, o modelo
cobra `precoItem` — o preço do item **sem refino** — e recomeça do +0. Repor no refino atual
criaria um atalho falso, e o otimizador aprenderia a quebrar de propósito. Na tela isso vira
`copiasItem = 1 + itensQuebrados`: quantas cópias separar, e não só quanto zeny levar.

**Quando perder o item não é uma opção** → §5. Com carta, encanto ou item de evento, a quebra
deixa de ser um custo que o otimizador pondera e vira **restrição** — nenhum `precoItem` alto
modela isso direito, porque qualquer valor finito ainda aceita a troca. O motor deriva o **piso**
(o refino mais baixo de onde ainda há caminho até o alvo sem nunca arriscar o equipamento) e
resolve o problema só dali para cima. Numa Arma nv4 o piso é o +7; numa nv5 é o +0, porque o
Eteridecon derruba 3 refinos mas nunca quebra; num Sombrio não existe piso, e o alvo é recusado
com essa explicação. Quanto a garantia custa varia demais para virar regra de bolso, então o
motor resolve o mesmo alvo dos dois jeitos e põe a diferença num aviso.

**Grau: três decisões acopladas** → §6. Em que refino tentar, processo seguro ou normal, e
quantos pontos de chance comprar com Bênção de Éter. Como o sucesso zera o refino, subir além do
necessário é dinheiro que evapora — e a regra de bolso "suba até o +11 antes de tentar" às vezes
é falsa, quando o trecho até lá é caro o bastante. A busca é exaustiva sobre um espaço pequeno,
com cache dos trechos de refino que os degraus repetem.

**Comprar ou fabricar** → §7. Metade dos minérios ninguém compra pronto: fabrica no NPC.
`unitCost()` devolve o menor entre o preço de mercado informado e o da receita, recursivamente;
sem preço nem receita o custo é infinito e o motor descarta toda estratégia que dependeria do
item. A lista de compras desmonta a conta seguindo **exatamente** a mesma decisão — se
divergisse, o total mostrado não fecharia com o orçamento.

**Os percentis** → §8. A média de um refino engana: a distribuição tem cauda longa à direita, e
quem se planeja por ela fica sem recursos no meio do caminho quase metade das vezes. A simulação
de Monte Carlo existe só para dar os percentis. O gerador é determinístico (mesma entrada, mesma
tela, sem números dançando a cada tecla), a campanha é compilada em arrays tipados antes do laço,
e execução cortada — por tempo ou pelo teto de tentativas — é contada e vira aviso, porque
falseia o custo para baixo.

**Dá com o que eu tenho?** → §9. O painel de estoque responde o inverso: dado o zeny em caixa, os
minérios na mochila e as cópias do equipamento, qual a chance de chegar ao alvo. Não é uma
simulação nova — a de sempre guarda 5 mil execuções **cruas**, e o veredito relê aquelas mesmas
campanhas a cada tecla digitada. Precisa ser assim porque os percentis são marginais: faltar
Oridecon e faltar zeny na *mesma* campanha não é a soma dos dois azares, e só a distribuição
conjunta responde.

Os campos pedem o estoque **no que se compra de verdade**, não em minério pronto — a mesma
expansão da lista de compras, pela mesma razão. O painel tem alvo próprio (10% a 99%) e dois
botões, que são a mesma equação resolvida para lados opostos: **preencher mochila e caixa** põe o
piso de material e o zeny que esse piso ainda exige; **só o material, com o meu zeny** mantém o
caixa informado e resolve a mochila. O segundo tem teto, e ele é a resposta ao caso que mais
confunde: taxa do refinador, balcão do NPC e cópia de reposição se pagam em zeny, e minério
nenhum os cobre.

### O orçamento é de tempo

`calcular(input, { tempoMs })` não recebe número de execuções — recebe tempo, e converte em
**trabalho** (tentativas de refino, a 40.000/ms, calibrado com `npm run perf`). Converter tempo
em trabalho deixa o resultado determinístico: o mesmo alvo produz o mesmo número de execuções em
qualquer máquina, e o relógio de dentro da simulação fica só como rede de segurança para máquinas
mais lentas que a da calibragem. → §8.5, §10.3

### Dois passes

Simulação boa custa segundos, e segundos de laço síncrono congelam a aba — o campo de preço para
de aceitar tecla, o select não abre. Então o cálculo roda duas vezes: um **passe rápido** (80 ms,
síncrono) para a tela nunca ficar vazia enquanto se digita, e um **passe preciso** (3 s, num Web
Worker) que substitui o resultado quando fica pronto.

O Worker é recriado a cada entrada nova de propósito: `terminate()` é a única forma de cancelar
um laço já em andamento. E cada resposta traz de volta o `id` do pedido, para que o resultado de
uma entrada já superada seja descartado em vez de piscar na tela.

### Alvos inalcançáveis

Acima do +14 a Bênção do Ferreiro para de funcionar e cada falha derruba 3 refinos, então o custo
explode: levar uma arma nível 4 do +0 ao +20 exige da ordem de 10⁸ tentativas de refino. Nesses
casos a calculadora não simula — percentis truncados subestimariam o custo em ordens de grandeza
—, mostra o custo exato e diz que o alvo está fora de alcance. O corte nunca é uma escolha à
parte: é o orçamento dividido pelo número mínimo de campanhas simuladas, e por isso o passe
preciso alcança alvos que o passe rápido recusa. → §8.5

### Mapa do motor

| Arquivo | O que faz |
| --- | --- |
| `plan.ts` | Orquestra tudo: valida, monta as fases, agrega recursos, chama a simulação, gera os avisos |
| `refine.ts` | O MDP de refino: ações disponíveis, piso seguro, iteração de política, avaliação exata, contagem de recursos |
| `grade.ts` | Os degraus de Grau: escolhe refino, processo e Bênção de Éter; encadeia a campanha |
| `linear.ts` | LU com pivotamento parcial — o solucionador que avalia cada política |
| `pricing.ts` | Comprar × fabricar, custo unitário recursivo e lista de compras |
| `simulate.ts` | Monte Carlo da campanha compilada, de onde saem os percentis |
| `estoque.ts` | Relê as campanhas simuladas do outro lado: a chance de chegar ao alvo com o que já se tem |
| `worker.ts` | O passe preciso, fora da thread da página |
| `types.ts` | `CalcInput`, `ResourceUsage`, `Percentis` e companhia |

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

Os comandos que atualizam os dados versionados (`data:fetch`, `data:parse`, `data:items`, `item`) estão
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
servidor LATAM. A base inteira é varrida e versionada em `src/data/items.json`:

```bash
npm run data:items                  # varredura incremental
npm run data:items -- --forcar      # reconfere a ficha de todo mundo
npm run data:items -- --so=shadow   # uma categoria só
```

A varredura roda sozinha toda segunda-feira pela Action `base-itens.yml`, que comita o
arquivo quando algo mudou e chama o deploy em seguida (ver [Publicação](#publicação)). Item
novo no LATAM entra na busca em no máximo uma semana, sem ninguém rodar nada.

`scripts/buscar.ts` e `scripts/fetch-item.ts` continuam existindo para inspeção manual — ver
um item específico sem esperar a varredura semanal:

```bash
npm run buscar -- "Espingarda"                 # lista o que achou
npm run buscar -- Caça --cat=armor             # weapon | armor | shadow
npm run item -- 1867                           # cadastra por ID
```

#### Por que a base é varrida, e não consultada ao vivo

A pergunta óbvia é por que não pesquisar no Divine Pride na hora em que a pessoa digita, em
vez de carregar uma base inteira. A resposta é que o navegador **não consegue**:

| Tentativa | O que acontece |
| --- | --- |
| `fetch` direto do site | Sem `Access-Control-Allow-Origin` — nas páginas e na `/api/` |
| Buscar sem o cookie de idioma | `0 results` para qualquer termo em português |
| Passar o idioma por query (`?language=`, `?lang=`) | Não existe; é só cookie |
| Proxies públicos de CORS | allorigins e codetabs devolvem 522, corsproxy.io exige plano pago |
| `r.jina.ai` | Responde, mas não repassa cookie (`0 results`) e devolve markdown |

Ou seja: busca ao vivo exigiria um proxy **próprio** que repassasse `Cookie` e devolvesse
CORS — um serviço a manter, um ponto a mais para cair, e uma requisição ao Divine Pride por
tecla digitada de cada visitante. A varredura semanal troca isso por um arquivo estático:
busca instantânea, funciona offline, e o site continua sendo só HTML no GitHub Pages.

O custo da varredura é bem menor do que parece à primeira vista. A ficha pesa ~400 KB cru,
mas **20 KB comprimidos**, e o `fetch` do Node pede gzip sozinho. Somando:

| | Requisições | Tráfego |
| --- | --- | --- |
| Listagens (357 páginas, 3 categorias) | 357 | ~5 MB |
| Fichas de arma, equipamento e chapéu | ~4.700 | ~95 MB |
| Sombrios | 0 — a listagem já basta | — |

A ~5 requisições por segundo, isso dá ~20 minutos, uma vez. Depois disso a varredura é
**incremental**: quem já está na base com categoria resolvida não é baixado de novo, e a
execução semanal gasta pouco mais que as listagens. `--forcar` existe para o ponto cego desse
esquema — se o Divine Pride corrigir o nível de uma arma já cadastrada, só a reconferência
completa enxerga.

Os sombrios (mil e poucos) saem de graça porque `classificarPelaListagem` decide a categoria
deles só com tipo e subtipo. Arma e armadura não têm essa sorte, e a função devolve `null` em
vez de chutar: a listagem não traz nível de equipamento, e responder "nível 1" por omissão
esconderia os de nível 2 — os de Éter, justamente os que têm Grau.

**O arquivo é grande, então não entra no bundle.** `src/data/items.ts` carrega
`items.json` por `import()` dinâmico, na primeira vez que alguém mexe na busca; quem só quer
fazer uma conta escolhendo a categoria à mão nunca paga esse download. A data da varredura e
a contagem ficam num arquivo separado (`itemsMeta.json`), para o rodapé poder creditar a
fonte sem baixar a base junto.

#### Duas armadilhas da busca

**Os cookies decidem se a busca funciona.** O Divine Pride guarda idioma e região em
`dp_language` / `dp_region`, e o padrão é coreano. Sem eles, `?query=Espingarda` devolve
*"0 results"* — não um erro, apenas nada, como se o item não existisse. `scripts/divinepride.ts`
manda `dp_language=portuguese; dp_region=LATAM` em toda requisição.

**Item sem tradução aparece com o nome em branco.** O site mantém um cartão LATAM vazio para
esses casos, e a listagem sai com a célula de nome vazia — às vezes contendo só o marcador de
slots, `[1]`, que sozinho não é nome; outras vezes com o nome coreano original, que passa no
teste de "tem nome" mas ninguém vai procurar em português. São ~1.350 dos 7.100 itens
listados, e `lerNome` descarta os três casos: sem nome utilizável não há como reconhecê-los
nem procurá-los na interface. Eles continuam cadastráveis pelo ID (`npm run item -- <id>`),
aí sim com o nome vindo do servidor em inglês.

**O colchete do fim é slot; o do começo, não.** `[Aluguel] Machado TE` não tem cartas, e
`Livro nv1 [4]` tem quatro. Só o colchete final vira `slots`.

**A ficha falha em silêncio quando o site muda.** Isto não é hipótese: durante este trabalho o
Divine Pride passou a escrever `LATAM - Portuguese` onde escrevia `LATAM - portuguese`, e o
`indexOf` sensível a caixa fez `extrairFicha` devolver `null` para **todas** as 4.689 fichas —
sem um único erro de HTTP, porque as páginas baixaram perfeitamente. A varredura foi até o
fim, gravou uma base só com os sombrios (os únicos que não precisam de ficha) e saiu com
código 0.

Por isso `atualizar-base.ts` tem duas travas, e elas abortam **sem gravar**:

- mais de 20% das fichas ilegíveis → "isso não é rede, é o HTML que mudou";
- a base encolher mais de 20% de uma execução para a outra.

O parser da busca tem a mesma filosofia (`parsearBusca` estoura quando o total anunciado não
bate com o que conseguiu ler). A regra geral é: **num scraper, o modo de falha perigoso é o
silencioso** — devolver lista vazia parece "nada encontrado", e ninguém investiga isso.

Os fixtures em `tests/fixtures/ficha-*.html` são HTML real congelado justamente desse episódio.

Cuidado com um detalhe ao mexer nisso: o aviso de "truncado" compara o total anunciado com as
linhas **lidas**, não com as aproveitadas. Comparar com as aproveitadas faria toda busca que
topasse com um item sem tradução parecer truncada.

O filtro é aplicado **na origem**: a busca de armaduras manda
`subTypes=Headgear,Armor,Shield,Garment,Shoes`, o que já exclui os Acessórios, e as categorias
`costume`, `card` e `consumable` nem são consultadas. Mas o veredito final é sempre do
classificador, com a ficha completa em mãos — a listagem não traz nível de arma nem posição na
cabeça, e sem isso não dá para saber se um headgear é de Topo.

A API oficial resolveria isso de forma mais limpa, mas exige `DIVINE_PRIDE_API_KEY`, não tem
endpoint de listagem (só consulta por ID) e também não manda CORS — não serve nem para a
varredura nem para o navegador.

#### O que não é refinável

`src/data/itemKinds.ts` decide a categoria e recusa o que o jogo não deixa refinar:

| Situação | Refina? |
| --- | --- |
| A descrição diz *"Não pode ser refinado"* | não — e essa linha vence todas as outras |
| Equipamento de cabeça no **Topo** (`Location: Upper`) | sim |
| Equipamento de cabeça só no **Meio** e/ou **Baixo** | não |
| Acessório comum | não |
| **Acessório sombrio** (Brinco, Colar) | sim |
| Item visual (Costume) | não |
| Armadura, escudo, calçado, capa | sim |

A primeira linha existe porque um equipamento de aluguel é `Armor/Armor` com tudo no lugar —
a "Armadura de Caça" (15247) passa por todas as regras acima e ganharia um plano de refino
completo. A própria descrição do jogo desmente isso, e ela é fonte melhor que qualquer regra
nossa, então `negaRefino` é checado antes de tudo.

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

## O que não é considerado

- Cartas nos itens
- Encantamentos e bônus aleatórios
- Pergaminhos, Cubos e Martelos de Refino, que pulam direto para um refino fixo

As hipóteses do modelo — o que ele assume sobre chances, preços, liquidez e risco, e o que
muda se cada uma for falsa — estão tabeladas em
[docs/matematica.md §11](docs/matematica.md#11-hipóteses-do-modelo-e-o-que-elas-deixam-de-fora).

## Publicação

`.github/workflows/deploy.yml` roda os testes, faz o build e publica no GitHub Pages a cada
push na `main`. O `base` do Vite está em `/refinometro/`; se o repositório tiver outro nome,
ajuste em `vite.config.ts`.

`.github/workflows/base-itens.yml` revarre o Divine Pride toda segunda-feira e comita
`src/data/items.json` quando algo mudou. Se nada mudou, não há commit e nada sobe. O passo de
testes roda **antes** do commit: a base é entrada do cálculo, e item classificado errado vira
orçamento errado.

Depois de comitar, ele **chama o deploy explicitamente** (`gh workflow run deploy.yml`). Isso
não é redundância: push feito com o `GITHUB_TOKEN` não dispara outros workflows — o GitHub
corta aí para evitar recursão infinita — então o `on: push` do deploy ficaria mudo e a base
nova nunca chegaria ao site. `workflow_dispatch` é a exceção documentada dessa regra.

## Estrutura

```
scripts/     coleta e conversão dos dados de origem
data-raw/    wikitext bruto do Browiki, versionado
src/data/    tabelas geradas, catálogos escritos à mão (minérios, grau, preços)
             e a classificação de itens (itemKinds.ts)
src/engine/  o cálculo: Markov, simulação, otimização de estratégia
src/         interface
tests/       testes do motor
docs/        a matemática do motor, em detalhe (matematica.md)
```
