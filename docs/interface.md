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

---

Ver também: [Como o motor funciona](motor.md) · [Os dados](dados.md)
