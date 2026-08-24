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
[Dá com o que eu tenho?](#dá-com-o-que-eu-tenho).

## Como o motor funciona

Todo o cálculo vive em `src/engine/` e não depende de React: entra um `CalcInput` (categoria,
refino e grau atuais, alvos, preços, se pode usar Bênção e minério especial, se dá para perder
o item) e sai um `Resultado` com plano, custo, materiais, percentis e avisos. A interface só
desenha o que ele devolve.

### O caminho de um cálculo

`calcular()` (`src/engine/plan.ts`) é o maestro, e faz sempre a mesma sequência:

1. **Valida** o alvo contra a categoria — refino acima do máximo da coluna, grau em item que
   não tem grau, alvo abaixo do atual.
2. **Quebra a campanha em fases.** Subir de grau reseta o refino, então "Grau A +11" vira
   `refinar → grau D → refinar → grau C → … → refinar até +11`. Sem grau, é uma fase só.
3. **Resolve cada fase de refino** como uma cadeia de Markov (`solveRefine`), e cada degrau de
   grau por busca exaustiva sobre as três decisões que ele tem (`solveGradeStep`).
4. **Agrega os recursos** somando os números exatos de cada fase — zeny, minérios, bênçãos,
   tentativas, taxas, quebras.
5. **Simula**, se o alvo couber no orçamento de tempo, só para extrair os percentis.
6. **Gera os avisos**, lendo o plano já pronto: risco de quebra, processo de grau normal,
   Bradium sem Bênção, grau abaixo do +11, simulação curta ou truncada.

O passo 4 é deliberadamente independente do 5. Todo número de material que a tela mostra como
média vem da álgebra, não da amostragem — inclusive quando a simulação nem chega a rodar.

### O problema de decisão

Cada fase de refino é um processo de decisão de Markov com no máximo 21 estados: os refinos
`piso..alvo`, sendo `alvo` absorvente. A faixa começa abaixo do refino atual — normalmente no 0
— porque uma falha pode empurrar o item para baixo do ponto de partida, e o custo de voltar de
lá faz parte da conta. Quem é o `piso` está em [Quando perder o item não é uma
opção](#quando-perder-o-item-não-é-uma-opção).

Uma **ação** é um par (minério, com ou sem Bênção do Ferreiro). `actionsAt()` monta a lista de
cada nível e descarta o que não dá para usar: minério bloqueado pelas opções, chance nula
naquele nível, item sem preço nem receita. Cada ação carrega chance, custo (minério + bênçãos
+ taxa do NPC) e para onde a falha leva — `down1`, `down3`, ou `null` para quebra.

O valor de um estado é a equação de Bellman de custo mínimo:

```
E[r] = min sobre as ações a de:
       custo(a) + (1−p)·quebra(a)·precoItem + p·E[r+1] + (1−p)·E[destino_da_falha(a)]

E[alvo] = 0
```

A taxa do refinador entra dentro de `custo(a)`, por ação e não como constante da campanha:
minério de Cash Shop é isento, e é isso que faz o Enriquecido competir de igual para igual com
o Oridecon numa arma nv4.

### Iteração de política, e por que não iteração de valor

`solveRefine()` resolve por **iteração de política**:

1. Chuta a política inicial pelo menor custo imediato de cada nível — barato e válido.
2. **Avalia exatamente**: monta `(I − P)·E = m` com a política fixa e resolve o sistema.
3. **Melhora**: em cada estado, troca pela ação de menor valor dado o `E` recém-calculado.
4. Repete até nenhum estado mudar (`MAX_ITER = 200` existe só como trava contra dois empates
   alternando para sempre).

Iteração de valor não serve aqui. Nos alvos altos o custo esperado passa de 10¹³ zeny, e ela
precisaria de centenas de milhares de passos para convergir — entregando números truncados que
parecem plausíveis. Com no máximo 20 estados, resolver o sistema exato sai barato:
`src/engine/linear.ts` faz decomposição LU com pivotamento parcial, O(n³) sobre n ≤ 20.

**A mesma fatoração conta os materiais.** Trocar o custo pela quantidade de um minério muda só
o lado direito do sistema — a matriz de transições é a mesma. Então o LU é fatorado uma vez por
avaliação e reaproveitado para cada contagem: `b = 1` em todo estado devolve o número esperado
de tentativas; `b = 1` só onde a política usa aquele minério devolve quantas unidades dele;
`b = (1−p)` nas ações que quebram devolve quantos itens se espera destruir. É daí que sai "380
Eterium e 2,3 cópias do item" sem sortear nada.

### Quebra e reposição

Quando a falha destrói o item, o modelo cobra `precoItem` e devolve o jogador ao **+0**, não ao
refino em que ele estava. Isso é escolha de modelagem, e importa: repor no refino atual criaria
um atalho falso — quebrar sairia barato e ainda adiantaria o caminho — e o otimizador
aprenderia a quebrar de propósito. Por isso `refinoReposicao: 0` está fixo em `plan.ts`, e
`precoItem` é o preço do item **sem refino**.

O outro lado disso aparece na tela: na faixa de quebra o equipamento vira consumo, então
`copiasItem = 1 + itensQuebrados` diz quantas cópias separar — a sua mais uma por quebra
esperada — e não só quanto zeny levar.

### Quando perder o item não é uma opção

Um equipamento com carta, encanto ou vindo de evento não tem preço de reposição de verdade: se
quebrar, acabou. Para esse caso `perdaAceitavel: false` muda a natureza do problema — a quebra
deixa de ser um custo que o otimizador pondera e vira uma **restrição** sobre as ações. Não dá
para modelar isso com um `precoItem` altíssimo: o número escolhido decidiria a resposta, e
qualquer valor finito ainda aceita a troca por um caminho suficientemente barato.

A restrição não é só "não use minério que quebra". Uma tentativa que apenas derruba o refino
também é proibida quando o nível de destino é um beco — um lugar de onde só se sai arriscando o
item. É por isso que existe o **piso**: o refino mais baixo a partir do qual há caminho até o
alvo sem nunca arriscar o equipamento.

`pisoSeguro()` resolve isso de baixo para cima, numa passada só. Um nível é seguro quando tem
alguma ação que não destrói o item e cuja falha cai em outro nível seguro — a Bênção do
Ferreiro, que segura o refino no lugar, sempre serve. O piso é o começo do trecho seguro que
encosta no alvo: um nível seguro isolado lá embaixo não adianta se, para chegar até ele, o item
tiver que atravessar um beco.

O resultado é que o motor **deduz** a estratégia que a comunidade usa em item insubstituível,
em vez de tê-la escrita em algum lugar. Numa Arma nv4 o piso é o +7: abaixo dele todo minério
da categoria pode destruir o item, e no próprio +7 o Perfeito derrubaria o equipamento para o
+6 — então a única ação legal ali é Perfeito **com** Bênção. Numa Arma nv5 o piso é o +0,
porque o Eteridecon derruba 3 refinos mas nunca quebra. Num Sombrio não há piso nenhum: a
Bênção não funciona e o Perfeito derruba para uma faixa que quebra, então o alvo é recusado com
essa explicação.

Nos degraus de grau a mesma restrição elimina o processo normal, que destrói o item na falha, e
deixa só o seguro. E como o plano não arrisca nada, `itensQuebrados` fica em 0 e `copiasItem`
em 1 — a garantia se paga em minério e Bênção, não em cópias do equipamento.

O que essa garantia custa varia demais para virar regra de bolso — de nada, quando o plano mais
barato já não arriscava o item, a +36% num alvo baixo com equipamento barato —, então o motor
resolve o mesmo alvo dos dois jeitos e põe a diferença num aviso.

### Grau: três decisões no mesmo laço

Só Arma nv5 e Equipamento nv2 têm Grau, e cada degrau (`solveGradeStep`) decide três coisas que
não dá para separar, porque interagem:

- **Em que refino tentar.** A chance sobe em degraus até o +16, mas o sucesso zera o refino —
  subir além do necessário é dinheiro que evapora. Só vale testar o **menor refino de cada
  chance distinta** (`refinosCandidatos`): entre dois níveis de mesma chance, o mais baixo vence
  sempre, porque o preparo custa estritamente mais a cada refino.
- **Processo seguro ou normal.** O seguro cobra 5× o material (10× no B→A) e não perde nada na
  falha; o normal cobra 1× e destrói o item com todo o refino investido.
- **Quantos pontos de Bênção de Éter comprar**, de 0 a 10 pontos percentuais, a
  `bencaosPorPonto` bênçãos cada (1 no D, 3 no C, 5 no B, 7 no A).

São poucas combinações, então a busca é exaustiva e o valor de cada uma é fechado:

```
tentativas_esperadas = (custo_da_tentativa + (1−p)·custo_da_falha) / p
custo_da_falha       = 0 no seguro
                     = precoItem + custo de refinar a reposição até lá, no normal
```

O preparo de cada candidato é um `solveRefine` inteiro, e os degraus repetem muito trecho —
todo degrau depois do primeiro parte do +0, e todos avaliam os mesmos refinos candidatos. Um
cache `de->para` por campanha (`CacheRefino`) evita resolver a mesma cadeia dezenas de vezes.

### Comprar ou fabricar

Metade dos minérios ninguém compra pronto: fabrica no NPC. `unitCost()` (`src/engine/pricing.ts`)
devolve o menor entre o preço de mercado informado e o da receita, recursivamente e com memo —
o Eterium Enriquecido vale um Elunium Enriquecido mais 2 Pó de Éter mais o balcão, e é assim que
ele entra no custo final. Um item marcado como "em progresso" com `Infinity` durante a recursão
impede que uma receita cíclica em dados novos vire laço infinito; sem preço nem receita o custo
é `Infinity`, e o motor simplesmente descarta toda estratégia que dependeria dele.

A lista de compras (`listaDeCompras`) desmonta a conta seguindo **exatamente** a mesma decisão,
via `sourcingOf`, até chegar no que se acha no mercado. Precisa ser a mesma: se a lista
expandisse uma receita que o custo cotou como compra pronta, o total mostrado não fecharia com o
orçamento.

### A simulação

O cálculo exato dá a média, e a média de um refino engana: a distribuição tem cauda longa à
direita, e quem se planeja por ela fica sem recursos no meio do caminho quase metade das vezes.
Os percentis é que respondem "quanto preciso ter em caixa" — `simulateCampaign()`
(`src/engine/simulate.ts`) existe só para isso.

Ela percorre as mesmas fases, com a política já escolhida, e a cada execução sorteia sucesso ou
falha tentativa a tentativa. Alguns detalhes que valem saber:

- **A campanha é compilada antes do laço.** Cada trecho de refino vira arrays tipados indexados
  por nível (chance, custo, taxa, destino da falha, índice do minério) e cada material vira um
  índice fixo num vetor de contagem. Sem isso, uma consulta de `Map` por tentativa domina o
  tempo da página.
- **O gerador é determinístico** (mulberry32, semente fixa): a mesma entrada produz o mesmo
  resultado na tela, sem números dançando a cada tecla.
- **Dois cortes de segurança.** O relógio é conferido a cada 256 execuções ou 100 mil
  tentativas, o que vier primeiro — só contar execuções chegaria tarde numa campanha cara. E
  cada execução tem teto próprio de tentativas (20× a campanha esperada), para uma execução
  azarada não travar a aba. Execução cortada falseia o custo para baixo, então o resultado
  devolve `truncadas` e o plano vira aviso quando esse número é maior que zero.
- **Só os percentis são aproveitados.** As médias que a simulação também produz servem de
  conferência contra a álgebra; o que vai para a tela é sempre o número exato.

### Dá com o que eu tenho?

O resto da calculadora responde "quanto vou gastar". O painel de estoque responde o inverso:
dado o zeny em caixa, os minérios na mochila e as cópias do equipamento, **qual a chance de
chegar ao alvo com isso**. `src/engine/estoque.ts` é quem faz essa conta.

Ela não é uma simulação nova. Poderia ser — mas seriam três segundos de Worker a cada
minério digitado, e a resposta é justamente a que a pessoa quer ajustar tentando números.
Então a simulação de sempre passou a guardar as execuções **cruas** (`AmostrasCampanha`), e o
veredito relê essas mesmas campanhas.

Reler é preciso porque os percentis não sabem responder: eles são marginais, e faltar Oridecon
e faltar zeny na *mesma* campanha não é a soma dos dois azares. A pergunta do estoque depende
da distribuição conjunta, e a distribuição conjunta só existe nas execuções inteiras. São
guardadas 5 mil delas — como as execuções são independentes e igualmente distribuídas, as
primeiras são uma amostra tão boa quanto qualquer outra, e 5 mil deixam a chance errar por
menos de um ponto percentual sem pesar na resposta que atravessa o Worker.

**O abatimento fecha porque o custo é uma soma.** O que a simulação registra como custo de uma
execução é exatamente

```
custo = Σ (unidades de cada material × preço unitário)
      + taxa do refinador + balcão do NPC
      + quebras × preço do item
```

então o que já está na mochila é, ao pé da letra, o valor que deixa de sair do bolso: abate-se
`min(precisa, tem) × preço` de cada material, mais o preço das cópias de reposição que a pessoa
já tem. Sobra o zeny que ainda precisa existir — e a campanha chega ao alvo quando ele cabe no
caixa. Com a mochila vazia, a conta devolve o custo da campanha inteira, e a chance vira a
distribuição de custo lida ao contrário: levar o percentil 90 em caixa cobre 90% das campanhas,
por definição.

Comparar o **total** basta, e não é atalho: o consumo só cresce ao longo da campanha, então
quem aguenta o total aguenta cada passo do caminho, e quem não aguenta trava em algum ponto —
não importa exatamente onde.

Duas coisas o modelo assume, e vale saber quais são:

- **O que faltar pode ser comprado** pelo preço informado, a qualquer momento. É a mesma
  suposição do resto da página. É por isso que ficar sem minério no meio não derruba a campanha
  enquanto houver zeny: a chance olha o caixa, e a tabela do painel é que diz em que material
  ele vai ser gasto.
- **O plano é o ótimo**, o mesmo que a calculadora recomenda. Uma pilha de Elunium parada não
  muda a estratégia que o motor escolhe; a resposta é a chance de atravessar *aquele* plano com
  estes recursos.

Os campos pedem o estoque **no que se compra de verdade**, não em minério pronto: ninguém guarda
Eterium na mochila, guarda Elunium e Pó de Éter e fabrica na hora. A expansão é a mesma da lista
de compras, pela mesma razão — se o estoque falasse numa unidade e a conta em outra, o
abatimento não fecharia. O balcão do NPC continua sendo zeny: quem fabrica Bradium paga os 50
mil tendo Oridecon ou não.

Ao lado de cada campo aparece um mínimo, que é o consumo da campanha mais sortuda entre as
simuladas. Serve de piso: abaixo dele não existe caminho que chegue ao alvo sem comprar mais
material no meio.

### O orçamento é de tempo

`calcular(input, { tempoMs })` não recebe número de execuções — recebe tempo, e converte:

```
orçamento de tentativas = tempoMs × TENTATIVAS_POR_MS    (40.000, calibrado com npm run perf)
execuções               = orçamento ÷ tentativas por campanha, preso entre 300 e 200.000
```

Converter tempo em *trabalho* deixa o resultado determinístico: o mesmo alvo produz o mesmo
número de execuções em qualquer máquina, e o relógio de dentro da simulação fica só como rede de
segurança para máquinas mais lentas que a da calibragem.

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
explode. Levar uma arma nível 4 do +0 ao +20 exige da ordem de 10⁸ tentativas de refino. Nesses
casos a calculadora não simula: percentis truncados subestimariam o custo em ordens de grandeza.
Ela mostra o custo exato e diz que o alvo está fora de alcance.

Onde fica esse corte depende do orçamento de tempo — o passe preciso alcança alvos que o passe
rápido declara fora de alcance —, mas ele nunca é uma escolha à parte: é o orçamento dividido
pelo número mínimo de campanhas simuladas (`limiteSimulavel`). Um teto escolhido à mão deixaria o
pior caso estourar o orçamento em silêncio.

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
