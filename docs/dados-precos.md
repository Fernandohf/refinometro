# Preços

Os preços de minérios são de mercado e mudam por servidor e por semana, então são
informados por você na interface e ficam salvos no navegador. Trocá-los pelo que você está
vendo no jogo é o que faz o resultado valer alguma coisa — nada abaixo muda isso.

O que muda é a qualidade do palpite que já vem no campo. O site oficial publica o **histórico
de transações** das lojas de jogador, por servidor e por janela de 1, 7 ou 30 dias:

```bash
npm run precos                        # FREYA, média de 30 dias conferida contra a de 7
npm run precos -- --servidor=NIDHOGG  # NIDHOGG ou YGGDRASIL
npm run precos -- --tolerancia=2      # aceitar mais divergência entre as janelas
npm run precos -- --simular           # mostra a tabela e não grava
```

A tabela marca cada linha com a origem: `ok` e `~` vieram da média das janelas, `med` da mediana
ponderada, e `!!`, `?` e `—` foram recusados.

O script regrava `src/data/precos.json`, que é de onde os preços saem.
[`defaultPrices.ts`](../src/data/defaultPrices.ts) lê esse arquivo e o aplica por cima de uma
tabela de chutes escritos à mão — a cotação vence onde existe, o chute cobre o resto. O rodapé
do site credita a fonte, o servidor e a data da última execução.

Duas datas, de propósito. `_geradoEm` é quando o script rodou; `cotadoEm`, por item, pode ser mais
antiga — item que ninguém negociou nesta semana **mantém a cotação boa da semana passada** em vez
de sumir, e é a data velha que denuncia isso. Cada linha guarda também o volume que sustentou o
número e de onde ele veio:

```json
[6635, 3770000, "2026-08-26", 112146, "janelas"]
[6223,    1990, "2026-08-26",   1116, "mediana"]
```

Duas travas antes de gravar: se mais de um quarto das consultas falhar, ou se menos de oito
cotações passarem na conferência, o script sai com erro e preserva o arquivo. É o modo de falha
que a varredura do Divine Pride já mostrou — o site muda, o parser passa a devolver vazio, nada
estoura, e o commit grava a base zerada. Aqui seria pior: uma tabela vazia não parece quebrada,
parece mercado parado.

A página é Next.js e o resultado vem no payload do React Server Components, remontado a partir
dos pedaços de `self.__next_f.push` — não há API pública, e as Server Actions dependem de um id
de build que muda a cada deploy. [`scripts/latam.ts`](../scripts/latam.ts) faz a leitura;
`tests/mercadoLatam.test.ts` trava o formato contra uma cópia congelada do payload, e
`tests/precos.test.ts` confere o arquivo gerado.

Os testes do motor **não** usam esses preços: usam os congelados de `tests/precosFixos.ts`. Boa
parte das asserções é sobre a forma do plano, e várias dessas escolhas se decidem na margem —
com a primeira cotação real o Oridecon foi de 20.000 para 21.100, passou a compensar fabricá-lo a
partir do minério, e a lista de compras mudou de item. O motor estava certo; o teste é que não
podia depender de uma venda em Prontera.

## Por que a média de 30 dias não é copiada direto

O site publica `avgItemPrice`, e a tentação é usá-lo como está. É média aritmética crua sobre a
janela, sem descarte de extremo: em item líquido isso é inofensivo, em item raso uma venda solta
decide o número sozinha. Medido em 26/08/2026, em FREYA:

| item | transações (30d) | média 7d | média 30d | |
| --- | ---: | ---: | ---: | --- |
| Oridecon | 82.899 | 22.113 | 21.145 | estável |
| Bênção do Ferreiro | 112.514 | 3.159.391 | 3.774.213 | estável |
| Carnium | 1.101 | 8.821 | 495.977 | 56x |
| Minério de Oridecon | 2.141 | 3.030 | 32.931 | 11x |

O Minério de Oridecon a 32.931 é impossível: cinco minérios viram um Oridecon, que sai a 21.145.
Uma venda a 4.000.000 — o `max` do período — puxou a média sozinha, e o chute que já estava no
arquivo, 4.000, era mais honesto que a "média de 30 dias" do site.

Daí a regra: a média de 30 dias só é aceita se a de 7 concordar com ela dentro da tolerância.
Não é sofisticado, mas separa preço de anedota.

## A segunda opinião: mediana ponderada pelo volume

O que a regra acima recusa não vira chute direto — ganha uma segunda chance. O site guarda um
**histórico dia a dia** com min, máx, média e o volume de cada dia. Com o volume dá para perguntar
outra coisa: *em que preço metade das unidades foi negociada*. O Carnium, dia a dia:

```
08-22   1.991    339 unidades
08-09     855    317 unidades
08-24   3.599     73 unidades
08-16   10.000.000   3 unidades   <-
08-10    6.000.000   1 unidade    <-
```

O preço real é ~2.000. As vendas milionárias, de uma a três unidades, são o que produzia a média
de 495.977. A mediana ponderada não escolhe janela nem descarta nada à mão — ela simplesmente não
enxerga o extremo, porque ele não é onde está a metade do volume:

| item | média 30d | média 7d | mediana pond. |
| --- | ---: | ---: | ---: |
| Carnium | 495.977 | 8.821 | **1.990** |
| Minério de Oridecon | 33.155 | 3.030 | **2.390** |
| Topázio | 25.552 | 13.840 | **11.400** |
| Bradium | 16.835 | 31.999 | **4.870** |
| Carnium Perfeito | 1.001.757 | 432.478 | **615.000** |
| Bradium Perfeito | 891.390 | 434.202 | **496.000** |
| Oridecon *(controle)* | 21.156 | 22.063 | 19.941 |
| Bênção do Ferreiro *(controle)* | 3.772.731 | 3.157.926 | 3.843.099 |

Os controles quase não se movem: a mediana conserta o que estava quebrado sem distorcer o que já
estava bom. Foi assim que o Minério de Oridecon passou a fechar economicamente — 5 × 2.390 =
11.950 para fabricar um Oridecon que custa 21.200.

Ela **não** é o caminho normal, por dois motivos. Custa uma requisição por item, e sai de uma
Server Action (`getDetail`) que não é API pública: o id dela muda a cada deploy do site, então
`scripts/latam.ts` o descobre em tempo de execução raspando o chunk que contém
`createServerReference(…, "getDetail")`. E ser imune a outlier não é ser imune à falta de mercado —
com três dias de histórico a mediana devolve um dos três números, e a robustez é ilusão. Daí os
pisos de 5 dias e 100 unidades.

Hoje isso recupera 6 itens que a conferência recusava, incluindo Bradium e Carnium, que não tinham
preço nenhum. Quatro continuam recusados — Bênção de Éter (10 dias, 50 unidades), Topázio de Éter
(3 e 17), Ametista de Éter (2 e 20) e Âmbar de Éter (3 e 22). Para esses nenhum estimador serve, e
o chute escrito à mão é a resposta honesta.

O que nem a mediana salva cai para a cotação anterior, se houver, e daí para o chute.

Três coisas que a consulta não cobre, e que valem saber antes de confiar no número:

- **Bradium e Carnium de Éter**, e as versões Perfeitas dos dois, não tiveram uma única
  transação em 30 dias. Ficam sem preço, cotados pela receita de NPC — que é o comportamento
  correto, não uma lacuna.
- **Oridecon e Elunium Enriquecido** não são vendidos avulsos, só em `Cx ... [10]`. O preço
  unitário sai da caixa dividida por 10, e é uma cotação pior que as outras: são poucas caixas
  negociadas, e quem compra a caixa fechada não paga o mesmo por unidade.
- **Item com menos de mil transações** sai marcado com `~`. O número passou na conferência entre
  as duas janelas, mas duas janelas concordarem sobre pouco negócio não é o mesmo que preço.

---

Ver também: [Os dados](dados.md) · [Chances e custos](dados-chances.md) ·
[Itens](dados-itens.md)
