# Documentação do Refinômetro

O [README](../README.md) diz o que a calculadora faz e como rodá-la. Aqui fica o resto: por
que o cálculo é assim, de onde vem cada número e o que já foi descoberto — e registrado — no
caminho.

## O cálculo

| Documento | O que tem lá |
| --- | --- |
| [Como o motor funciona](motor.md) | O que o motor decide, em que ordem, e o que cada decisão muda na tela. Comece por aqui. |
| [A matemática do motor](matematica.md) | A especificação formal: o MDP, as demonstrações, o erro de cada aproximação e as referências. |

## A tela

| Documento | O que tem lá |
| --- | --- |
| [Como a interface se organiza](interface.md) | Material Design 3 como regra, o botão informativo e a lista de compras. |
| [Ser encontrado](seo.md) | O que a página faz para aparecer numa busca por "calculadora de refino ragnarok latam" — e as duas coisas que o repositório não faz sozinho. |

## Os dados

| Documento | O que tem lá |
| --- | --- |
| [Os dados](dados.md) | A ordem das fontes, a taxa do refinador e a proveniência de cada arquivo. |
| [Chances e custos](dados-chances.md) | As tabelas oficiais da GNJOY, o parser e as divergências registradas. |
| [Itens](dados-itens.md) | A base do Divine Pride: varredura semanal, armadilhas do scraper e o que não é refinável. |
| [Preços](dados-precos.md) | A cotação do mercado LATAM e por que a média de 30 dias não serve. |

## O repositório

| Documento | O que tem lá |
| --- | --- |
| [Publicação](publicacao.md) | Os dois workflows do GitHub Actions, e por que um chama o outro. |
| [Como contribuir](../CONTRIBUTING.md) | Ambiente, comandos, convenções, testes e pull request. |
| [Boas primeiras contribuições](primeiras-contribuicoes.md) | Tarefas pequenas, cada uma apontando para o arquivo certo. |

## Perguntas frequentes, e onde elas são respondidas

- *Por que o plano escolhe Enriquecido em vez de Perfeito?* →
  [Chances e custos](dados-chances.md#especial-não-quer-dizer-chance-maior)
- *Por que a média não basta?* → [O motor](motor.md#as-decisões-e-o-que-cada-uma-muda-na-tela)
- *Por que o item conta como material?* → [O motor](motor.md#as-decisões-e-o-que-cada-uma-muda-na-tela)
- *Por que a busca não acha um item que existe?* →
  [Itens](dados-itens.md#duas-armadilhas-da-busca)
- *De onde veio o preço que já estava no campo?* → [Preços](dados-precos.md)
- *O que a calculadora não considera?* → [O motor](motor.md#o-que-não-é-considerado)
