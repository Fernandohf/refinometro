# Boas primeiras contribuições

Tarefas pequenas, com começo e fim claros, cada uma já apontando para o arquivo. Se você
nunca mexeu no projeto, comece por aqui. O caminho geral está em
[CONTRIBUTING.md](../CONTRIBUTING.md).

## Sem escrever código

**Confirmar um número in-game.** É o que mais falta ao projeto, e rende: a tabela de taxa do
refinador foi levantada assim, e derrubou os nove valores que vinham de um wiki de fora. Sobraram
três coisas, e todas travaram por falta de um item no estado certo — não por falta de vontade:

- **Quanto o refinador cobra do +10 para cima?** A tabela de taxas foi medida com minério da
  faixa +0 a +9; ninguém tentou com Bradium, Carnium, os de Éter da faixa alta ou os Perfeitos.
  Basta ter um item no +10 e abrir a janela de refino para ler o valor — não precisa refinar.
  → [Os dados](dados.md#o-que-a-medição-não-alcançou-a-faixa-do-10-para-cima)
- **Quanto custa cada degrau de grau?** Só o primeiro foi medido (sem grau → D: 150.000z no
  normal, 750.000z no seguro), e o wiki errava os dois. D → C, C → B e B → A ainda vêm do wiki, e
  para conferir é preciso ter em mãos uma Arma nv5 ou Equipamento nv2 **já com grau D, C ou B**.
  É só abrir a janela do NPC e ler o valor. → [Os dados](dados.md#o-que-ainda-não-foi-conferido)
- **Bradium e Carnium quebram?** O Hazy Forest diz que há uma chance rara de destruir o item;
  o Browiki e a descrição do LATAM só citam a queda de 3 refinos, e quem jogou não viu acontecer.
  Fica de fora do cálculo, mas "não vi" não é "não acontece" — aqui não adianta uma consulta, só
  volume de tentativas do +11 para cima.
  → [Chances e custos](dados-chances.md#bradium-e-carnium)

Abra uma issue contando o que você viu, com print se der. Não precisa ser conclusivo — dez
tentativas já dizem mais do que temos hoje.

**Reportar um item que a busca erra.** Item que não aparece, que aparece com nível errado, ou
que ganha plano de refino sem ser refinável. Diga o nome e, se souber, o id do Divine Pride.

**Achar um preço absurdo** no campo que já vem preenchido. Diga o item, o valor mostrado e o
que o mercado do seu servidor pratica.

## Código, em ordem de dificuldade

**1. Um rótulo confuso.** `src/data/rotulos.ts` e `src/data/nomes.ts` guardam o texto de tela.
Se um nome de coluna, de opção ou de aviso não é claro para quem joga, troque — o teste
`tests/nomeNoJogo.test.ts` cobre a parte que não pode mudar.

**2. Um texto de ajuda que falta.** A explicação longa mora nos balões do componente `Info`
([`src/components/ui.tsx`](../src/components/ui.tsx)), ancorada no que ela explica. Se um
número da tela ainda gera dúvida e não tem balão, escrever um é uma contribuição de tamanho
ideal. Ver [A interface](interface.md#o-botão-informativo) — inclusive a armadilha do
`overflow-x-auto`.

**3. Um caso de teste do classificador.** `src/data/itemKinds.ts` decide o que refina e o que
não. Se você conhece um item que ele erraria — um chapéu de Meio, um acessório sombrio, um
equipamento de aluguel —, um caso novo em `tests/itemKinds.test.ts` é fácil de escrever e
difícil de sobrar. Ver [Itens](dados-itens.md#o-que-não-é-refinável).

**4. Uma trava de dado.** A taxa do refinador foi transcrita à mão, sem parser para avisar se
a fonte mudar; `npm test` é quem confere. O mesmo vale para qualquer constante escrita à mão
em `src/data/`. Achou uma que nenhum teste trava? Trave.

**5. Acessibilidade da tela.** Foco visível, rótulo em campo, contraste, navegação por
teclado nos painéis que abrem. `tests/render.test.tsx` monta a tela e é o lugar de encaixar a
asserção.

## O que não é boa primeira contribuição

Não porque a ajuda não sirva, mas porque o retrabalho é grande se o rumo não for combinado
antes — abra uma issue primeiro:

- Mexer em `src/engine/refine.ts`, `grade.ts` ou `plan.ts`. As decisões do motor são
  acopladas e têm [especificação formal](matematica.md); mudança lá começa por lá.
- Trocar a estratégia de simulação, o gerador aleatório ou o orçamento de tempo.
- Reescrever a interface em outra biblioteca, ou trocar o Material Design 3 por outro sistema.
- Comitar `src/data/items.json` à mão: ele se atualiza sozinho toda semana. Ver
  [Publicação](publicacao.md).
