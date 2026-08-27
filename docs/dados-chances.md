# Chances e custos — Browiki

As tabelas de chance, os minérios, as penalidades de falha e os custos de Grau saem do
Browiki e ficam versionados no repositório.

```bash
npm run data:fetch   # baixa o wikitext bruto para data-raw/
npm run data:parse   # gera src/data/refineChances.json e gradeChances.json
```

O parser falha alto se o formato da tabela mudar, em vez de gerar números errados em
silêncio. Se o Browiki reorganizar as páginas, `npm run data:parse` avisa.

Fontes: [Refinamento](https://browiki.org/wiki/Refinamento) · [Grau](https://browiki.org/wiki/Grau)

Como conferência, as tabelas de minério foram comparadas com o
[Hazy Forest](https://hazyforest.com/equipment:refine), wiki não-oficial do kRO — fonte de
terceiro nível, aqui só como segunda opinião. Bateram em tudo, inclusive na parte que parecia
errada: para Arma nv5 e Equipamento nv2, **todo minério acima do +10 destrói o item**, até os
Perfeitos. É o inverso do padrão dos níveis 1–4, e é assim mesmo.

## As divergências registradas

Quatro divergências entre as fontes ficaram registradas.

### "Especial" não quer dizer "chance maior"

O Browiki põe todos os minérios especiais na mesma tabela de chances aumentadas. As descrições
dos itens no Divine Pride dizem outra coisa, e com uma consistência que não parece descuido:
quem aumenta a chance **anuncia isso**, e quem só protege descreve só a proteção.

| Minério | O que a descrição LATAM promete | Efeito |
| --- | --- | --- |
| Oridecon / Elunium **Enriquecido** | "Aumenta as chances de sucesso ao refinar uma arma" | só chance — **continua destruindo o item** |
| Oridecon / Elunium **Perfeito** | "garante a segurança […] a arma não será perdida, mas reduz 1 nível de refino" | só proteção |
| Bradium / Carnium **Perfeito** | "Em casos de falha ao refinar itens +10 ou mais, a arma não será perdida, mas reduz 1 nível de refino" | só proteção |
| Os de Éter marcados "com maior chance" | "Refina armas de nível 5, do +1 até +10, **com maior chance**" | chance **e** proteção |

Por isso o motor tem dois campos independentes: `especial` (acesso — é o que a opção do
formulário destrava) e `chanceAumentada` (efeito — é o que escolhe a tabela). Isso muda o plano
de verdade: numa Arma nv4, a tentativa do +8 vale 20% com Oridecon Perfeito, não 40%, e o
Perfeito para de aparecer acompanhado de Bênção do Ferreiro — as duas protegiam a mesma coisa, e
o Enriquecido, mais caro por unidade, sai na frente por dobrar a chance.

**É o único ponto em que o motor não segue o Browiki**, e é deliberado: aqui a pergunta não é
"como a mecânica funciona" e sim "o que este item faz", que é exatamente onde o datamine ganha
de um agrupamento de tabela feito à mão. Onde as duas leituras dão números diferentes, um aviso
aparece na tela dizendo que aquele trecho depende da divergência. `npm run descricoes` imprime
as descrições dos 22 minérios, em todos os servidores, para reconferir quando o texto do jogo
mudar.

### Faixa do Carnium de Éter

A descrição LATAM diz "+16 até +20", mas o Browiki, o texto coreano do mesmo item e a descrição
do gêmeo de arma (Bradium de Éter) dizem "+11 até +20". Três fontes contra uma tradução que
repete a faixa do *Carnium de Éter Perfeito*: o motor fica com +11..+20.

### Bradium e Carnium

O Hazy Forest diz que, além da queda de 3 refinos, existe uma chance **rara** de destruir o
item. O Browiki e a descrição do item no LATAM só citam a queda, e as duas mandam mais que uma
wiki de kRO — então a quebra rara **não é modelada**. Fica como nota de rodapé no plano, para
quem quiser margem: se ela existir de fato no LATAM, o custo real é um pouco maior que o
calculado.

### Grau abaixo do +11

O texto do Browiki afirma que o processo exige o item em +11, mas a tabela de chances da própria
página lista valores desde o +9. É o Browiki contra ele mesmo, e só por isso vale abrir uma
terceira fonte: o [Hazy Forest](https://hazyforest.com/equipment:grade) traz a mesma tabela
desde o +9, sem citar exigência nenhuma. Entre um texto e duas tabelas que concordam, o motor
segue as tabelas: Grau D vale a partir do +9, C do +10, B e A do +11 (`REFINO_MINIMO_GRAU`).
Isso não é detalhe: com o processo seguro, a falha não destrói nada, então chance baixa custa só
repetição de material — e tentar o Grau D logo no +9 sai **22% mais barato** que subir até o +11
antes, numa campanha completa de arma nv5. Quando o plano aposta nisso, um aviso aparece; falta
confirmar in-game.

---

Ver também: [Os dados](dados.md) · [Itens](dados-itens.md) · [Preços](dados-precos.md)
