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

Ela vem em duas partes, porque são duas tarefas diferentes no jogo:

- **Comprar no mercado** — só o que se acha à venda. Um item que *também* tem receita ganha um
  botão informativo com ela: aquele item está aqui porque comprar saiu mais barato que fabricar
  **pelos preços que você informou**, e essa decisão vira do avesso se o preço mudar amanhã.
- **Fabricar no balcão do NPC** — cada minério intermediário com a **composição** aberta ao lado,
  em pastilhas com a arte de cada insumo. O número em destaque é a proporção da receita, não o
  total: o total de cada insumo já é uma linha da lista acima, e é a proporção que liga os 1.900
  Minério de Oridecon aos 380 Oridecon do plano.

O dado vem de `listaDeCompras().fabricacaoAberta`, que inclui as receitas de balcão zerado que
`fabricacao` omite — transformar 5 Minério de Oridecon em 1 Oridecon é de graça, mas o jogador
ainda precisa saber que tem de ir ao NPC fazer isso.

---

Ver também: [Como o motor funciona](motor.md) · [Os dados](dados.md)
