# Como a interface se organiza

A tela segue o **Material Design 3**, e não por gosto: um projeto com quatro painéis que abrem,
seis tabelas e um punhado de botões precisa de uma regra externa para não divergir sozinho — foi
o que aconteceu antes, com o mesmo botão existindo em quatro tamanhos e um `<select>` focado
ficando diferente de um `<input>` focado.

Os tokens moram em [`src/index.css`](../src/index.css), com o papel do Material anotado ao lado
de cada um. As duas decisões que mais mudam a aparência:

- **Elevação é tom, não sombra.** No escuro, uma sombra preta sobre fundo preto não separa
  camadas. As superfícies formam uma escada de luminosidade — `fundo`, `superficie-baixa`,
  `painel`, `superficie-alta`, `superficie-topo` — e a sombra (`shadow-e1`…`e3`) só reforça.
- **Estado é película, não outra cor.** Todo alvo de toque carrega a classe `.estado`: ao pairar,
  focar ou pressionar, ele ganha uma camada da própria cor de conteúdo, em opacidade fixa. É o
  que faz o mesmo botão funcionar sobre qualquer superfície sem uma cor de hover por fundo.

## Claro e escuro

O escuro é o tema da casa e mora no `@theme`; o claro é a mesma lista de tokens com outros
valores, sob `:root[data-tema='claro']`. Nenhum componente sabe qual tema está ativo — todos leem
`var(--color-…)`. As poucas cores fixas que precisam mudar (o texto do Pix, a letra do Grau) usam
a variante `claro:` do Tailwind.

Quem escolhe é um script curto embutido no `<head>` (`SCRIPT_DO_TEMA`, em
[`src/data/tema.ts`](../src/data/tema.ts)), que roda antes da primeira pintura para o claro não
piscar no escuro a cada carregamento. Sem escolha salva, segue o sistema — inclusive se ele mudar
com a página aberta. O botão do cabeçalho fixa a escolha no `localStorage`, e as páginas de
referência leem a mesma chave. Sem script, tudo abre no escuro.

No claro a lógica de elevação se inverte: a página é a superfície mais clara, cada container
escurece um degrau e a sombra volta a fazer o trabalho. O dourado vira ocre — o do escuro, sobre
branco, dá 1,8:1. [`tests/tema.test.ts`](../tests/tema.test.ts) confere que todo token tem o par
no outro tema e que as cores copiadas para as páginas de referência continuam iguais.

## O botão informativo

`Info`, em [`src/components/ui.tsx`](../src/components/ui.tsx), é a peça que enxugou a página.
Antes, cada campo, cada número e cada tabela carregavam embaixo um parágrafo cinza explicando de
onde vinham — texto correto, escrito para ser lido **uma** vez, que depois disso só afastava os
números uns dos outros.

Nada foi apagado: o que era parágrafo virou o conteúdo de um balão ancorado exatamente no que
explica. O conteúdo continua no documento mesmo fechado, escondido pelo atributo `hidden` — é de
graça, é texto, e é o que mantém a explicação encontrável pelo Ctrl+F e pelos buscadores.

O que **fica** à vista é o que muda a decisão agora: um risco de quebra, um estado do campo, o
número que a margem escolheu. O que vale para sempre — de onde vem um dado, por que a média
engana, o que a coluna significa — vai para o balão.

Uma armadilha, anotada no próprio componente: o balão é posicionado em relação ao botão, então um
ancestral com `overflow-x-auto` (toda tabela larga desta página tem um) o recorta na borda da
rolagem. Explicar uma coluna é, na prática, explicar a seção — o botão sobe para o
`TituloDeSecao` acima da tabela.

## Para quem chega pela primeira vez

O balão serve a quem volta. Quem chega não sabe por onde começar, então a página tem um guia
**"Como usar"** acima das colunas: quatro passos, com o mesmo número que cada painel do
formulário leva no título, e uma linha dizendo onde a resposta aparece. Fechado em "Entendi",
ele não volta sozinho (a chave `refinometro:guia:v1` no `localStorage`); o botão "Como usar" do
cabeçalho o reabre.

O resultado fala a língua de quem joga, não a do motor:

- **A margem se chama pelo que garante.** *Arriscado, Moderado, Seguro, Muito seguro, Quase
  certo*, com o percentil em letra pequena. "Mediana" e "90%" sozinhos eram o primeiro controle
  do resultado e o menos legível. Há um seletor só para a página inteira — a aba de estoque tinha
  o dela, de 10% a 99%, e preenchia números diferentes para o mesmo minério.
- **Duas respostas lado a lado, em duas moedas.** *Custo total em zeny* é o percentil do custo
  total — minérios, conversões no NPC, a taxa de cada tentativa e as cópias que quebram, tudo
  convertido em zeny. *O que ter em mãos* é o kit — a mochila que fecha a fração escolhida das
  campanhas sem voltar ao mercado —, mostrado como se separa: o zeny só das taxas, em destaque, e
  a quantidade de cada minério, com a arte de cada um. O número grande do segundo cartão não é o
  kit em zeny de propósito: somar o minério ao caixa escondia justamente as quantidades, e
  comparava com o primeiro cartão duas coisas que nunca empatam (o kit comprado a preço de
  mercado sempre sai mais caro, [matematica.md §9.7](matematica.md); esse total fica no fim da
  lista de compras). Quem chega querendo saber "quantos Eteridecon eu compro" acha a resposta sem
  abrir aba nenhuma.
- **Uma quantidade por material, na página inteira.** O cartão do kit, a lista de compras, o
  diagrama de custo e o preenchimento da aba de estoque leem o mesmo kit (`src/engine/kit.ts`).
  Antes cada um lia uma estatística — média, percentil de cada linha, quantil conjunto — e o mesmo
  minério aparecia com três números, todos "no 90%". Cópias e custo médio ficam em "mais
  números".
- **"Compensa comprar pronto?" responde com o preço que a pessoa achou.** Era o "valor do item
  pronto", escondido em "mais números": o preço no +0 mais o custo médio, que só dá o ponto de
  empate na média. Agora a pessoa digita quanto pedem pelo item pronto e a página diz em que
  fração das campanhas simuladas refinar sai mais barato que isso.
- **O plano diz quanto, não só o quê.** Cada trecho da estratégia leva o número de usos médio
  ("+5→+7 · ~40x Eteridecon Enriquecido"), e cada fase fecha com o consumo médio dela, que é onde
  aparece o que os trechos não mostram — a Bênção que o martelo cobra por uso. O custo da fase diz
  "na média": somadas, as fases dão o custo médio, não nenhum dos dois números do topo. Os usos
  por trecho vêm das visitas esperadas a cada estado, a linha da partida de (I − P)⁻¹ (ver
  `visitas`, em `src/engine/refine.ts`).
- **"Vezes", não "tentativas".** No jogo, tentativa é cada clique no refinador.
- **O risco do caminho cabe em uma linha** embaixo da trilha de refino, começando pelo mesmo
  símbolo da opção escolhida na lista (↓ ou ⚠). A conta dos degraus vai para o balão.

## A lista de compras

Ela mostra a arte de cada item, servida pelo próprio Divine Pride a partir do id (ver
`SlotItem`). Não é enfeite: é o que o jogador reconhece na loja, e "Minério de Oridecon" e
"Oridecon" são duas linhas seguidas com nomes quase iguais e sprites que não se parecem em nada.

Cada linha começa pela **quantidade**, em corpo de título e na cor de destaque: é o que se lê de
relance com a loja aberta, e o nome já se reconhece pela arte ao lado.

Depois da quantidade vem a decisão da linha — **comprar pronto ou fabricar no NPC** —, e quanto a
via escolhida poupa contra a outra: *economiza 35,5 mi z (51%)*. Onde fabricar ganha, a receita
abre **aninhada embaixo**, recuada e com fio à esquerda, até o que se acha à venda; onde comprar
ganha, a economia diz o que a receita custaria a mais. Havia uma segunda seção, "Fabricar no
balcão do NPC", com os intermediários listados à parte: virou este aninhamento, porque a receita
não é assunto separado — é o que aquela linha custa quando se escolhe fabricá-la.

A economia existe porque **o motor decide sozinho e nem sempre o jogador concorda**. O custo é
cotado pela via mais barata (ver `unitCost`), então a lista seguiria o balcão por qualquer
diferença — e fabricar 379 Eteridecon significa carregar 1.895 Minério de Oridecon do mercado ao
NPC, num jogo em que peso é limite e viagem é tempo. A lista mostra as duas coisas na mesma
linha: o que a viagem rende e o quanto ela é. Poupar 200z carregando mil minérios é decisão de
quem carrega, não do motor.

O dado vem de `arvoreDeCompras()`, em `src/engine/pricing.ts`: a mesma conta de `listaDeCompras`
em árvore em vez de achatada, com os dois preços — mercado e receita — guardados em cada nó. Os
totais das raízes somam exatamente o total da lista achatada, que é o que o diagrama de custo lê;
se divergissem, dois números da mesma tela deixariam de bater.

O que a árvore perde é a soma de um material que aparece sob dois pais — Pó de Éter entra na
Pedra de Éter e no Eteridecon, e cada um mostra a sua parte. A vista **por minério**, ao lado, é
onde o consumo aparece somado.

## Já refinei: quanta sorte eu tive

A quarta aba responde à pergunta de quem já terminou: a pessoa informa quanto gastou de cada
minério e quantas vezes o item quebrou, e a tela diz onde essa campanha cai entre as simuladas,
algo como "mais sorte que 82% das campanhas", com um ponto "você" sobre a curva de custo. Não é
outra simulação. São as mesmas campanhas do orçamento e do "Dá com o que eu tenho?", lidas de um
terceiro jeito. A conta fica em [`src/engine/sorte.ts`](../src/engine/sorte.ts).

- **A unidade é a que o jogador lembra:** minério inteiro, como o kit (Eterium, e não o Pó de Éter
  que o fabricou).
- **A taxa não é perguntada,** e não precisa ser. Cada minério gasto no refinador é uma tentativa
  e paga a taxa dele. No Grau, a taxa é proporcional ao material da tentativa (150 mil por
  Aquamarina de Éter, no modo normal e no seguro). A taxa da campanha é uma soma exata do que foi
  informado. [`tests/sorte.test.ts`](../tests/sorte.test.ts) reconstrói campanhas simuladas a
  partir do minério e confere que o total bate com o custo de cada uma.
- **A régua é o plano da calculadora.** A tela diz isso no fim: quem refinou de outro jeito mede
  sorte e estratégia misturadas.
- **Relato incompleto não vira sorte.** Enquanto falta um material que toda campanha simulada
  usou, a tela pede esse material em vez de dar um veredito. Um valor abaixo do que a campanha
  mais sortuda gastou fica em vermelho. No Grau seguro, por exemplo, cada tentativa gasta 5
  materiais, então 4 não é sorte, é conta errada.

O botão "compartilhar meu resultado" gera o mesmo tipo de link da seção abaixo, levando também o
relato, e quem abre cai direto nesta aba.

## Compartilhar uma simulação

O botão **compartilhar**, no canto do painel "Quanto vai custar", gera um link com a pergunta
inteira no fragmento do endereço (`#s=…`): item, alvo, condições, todos os preços e a mochila do
"Dá com o que eu tenho?". Vai em JSON, comprimido com `deflate-raw` e codificado em base64 de URL,
e ocupa ~1.100 caracteres. Não há servidor. O site é estático, e o fragmento nem chega ao GitHub
Pages. No celular, o botão abre a folha de compartilhamento do sistema; no computador, copia o
link.

Três decisões, em [`src/compartilhar.ts`](../src/compartilhar.ts):

- **Os preços vão congelados, todos.** A cotação de partida muda todo dia, e um link que levasse
  só os preços alterados daria outro orçamento na semana seguinte. Quem abre vê um aviso com a
  data da cotação de quem mandou e um botão para trocar pelos preços de hoje.
- **O link é lido antes de o React montar** (`main.tsx`) e sobrescreve a conta salva no
  `localStorage`. É de lá que o app lê o estado no `useState`, então a simulação compartilhada já
  aparece no primeiro quadro. Depois de lido, o fragmento sai do endereço: se ficasse, um F5 depois
  de qualquer ajuste desfaria o ajuste.
- **Nada do link entra sem conferência.** Ele é texto que qualquer um escreve. Cada campo é
  checado contra o tipo e os valores possíveis, um campo inválido volta ao valor inicial e um campo
  desconhecido é descartado. A descompressão tem teto. O formato tem versão (`v`), e campo que a
  calculadora ganhar depois cai no valor inicial, como já acontece com o estado salvo.

O mesmo link reproduz a mesma conta porque a simulação tem semente fixa. A ressalva é o passe
preciso: ele roda por tempo, e um aparelho mais lento faz menos execuções. Os percentis podem
variar na última casa, mas o custo médio e o plano são os mesmos.

---

Ver também: [Como o motor funciona](motor.md) · [Os dados](dados.md)
