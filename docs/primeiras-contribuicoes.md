# Boas primeiras contribuições

Tarefas pequenas, com começo e fim claros, cada uma já apontando para o arquivo. Se você
nunca mexeu no projeto, comece por aqui. O caminho geral está em
[CONTRIBUTING.md](../CONTRIBUTING.md).

## Sem escrever código

**Confirmar um número in-game.** É o que mais falta ao projeto. Três coisas estão no ar hoje,
esperando alguém que jogue:

- **Grau a partir do +9.** O motor segue as tabelas (Grau D vale do +9), contra o texto do
  Browiki, que diz +11. Se você tentar um Grau D com o item em +9 e o NPC aceitar — ou
  recusar —, isso resolve a questão. → [Chances e custos](dados-chances.md#grau-abaixo-do-11)
- **A taxa do refinador em Sombrios.** Hoje está 0 por falta de fonte. Quanto o NPC cobra por
  tentativa num equipamento sombrio? → [Os dados](dados.md#taxa-do-refinador--fora-do-latam)
- **Bradium e Carnium quebram?** O Hazy Forest diz que há uma chance rara de destruir o item;
  o Browiki e a descrição do LATAM só citam a queda de 3 refinos, e o motor segue os dois.
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
