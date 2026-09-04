# Chances e custos — a divulgação oficial

As tabelas de chance de refino e de grau saem da **divulgação oficial da GNJOY Americas**, que
é a operadora do Ragnarok Latam, e ficam versionadas no repositório. Os minérios (o que cada um
faz na falha) e os custos de NPC continuam vindo do Browiki: a página oficial publica chances,
não custos.

```bash
npm run data:fetch   # baixa as tabelas oficiais para data-raw/
npm run data:parse   # gera src/data/refineChances.json e gradeChances.json
```

O parser falha alto se o formato da tabela mudar, em vez de gerar números errados em
silêncio: ele casa cada tabela pela legenda ("Tabela 3: Minério Especial (Fora do período do
Evento de Refino)"), exige as 20 linhas de refino e recusa a tabela de Grau se ela deixar de
começar no +11 — que é o valor assumido em `REFINO_MINIMO_GRAU`.

Fontes: [Refinamento](https://ro.gnjoyamericas.com/pt/news/probability/2) ·
[Grau](https://ro.gnjoyamericas.com/pt/news/probability/27)

O que fica em `data-raw/` é a região do artigo com os atributos `style` removidos — o texto e a
estrutura das tabelas saem intactos, e some só a folha de estilo inline que faria o arquivo
passar de 900 KB sem acrescentar um dado.

## Por que a fonte deixou de ser o Browiki

Até 2026-09 as tabelas vinham do [Browiki](https://browiki.org/wiki/Refinamento), o wiki do
LATAM. Trocar por quem opera o servidor mexeu em oito números, e cada um deles era um erro de
verdade:

| Onde | Browiki | Oficial |
| --- | --- | --- |
| Sombrio, tentativa do +10 | 10% | 9% |
| Arma nv3 em evento, +11 e +12 | 35% | 40% |
| Arma nv3 em evento, +13 e +14 | 30% | 35% |
| Arma nv3 em evento, +15 e +16 | 25% | 30% |

E, no Grau, o Browiki listava chances a partir do +9 — linhas que a tabela oficial não tem. Ver
[Grau só a partir do +11](#grau-só-a-partir-do-11).

A tabela oficial também é quem diz que o **Oridecon Enriquecido e o Perfeito servem em armas
nv1 a nv4**, não só nv3 e nv4. Isso explica uma coisa que antes não fechava: as colunas de Arma
nv1 e nv2 na tabela de minério especial só existem porque há um especial que as refina.

Uma surpresa das tabelas, que a leitura confirma: para Arma nv5 e Equipamento nv2, **todo
minério acima do +10 destrói o item**, até os Perfeitos. É o inverso do padrão dos níveis 1–4, e
é assim mesmo.

## As divergências registradas

### "Especial" não quer dizer "chance maior" — e o jogo deu razão à ficha

A tabela oficial põe todos os minérios especiais na mesma coluna de chances aumentadas. As
descrições dos itens no Divine Pride dizem outra coisa, e com uma consistência que não parece
descuido: quem aumenta a chance **anuncia isso**, e quem só protege descreve só a proteção.

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

**É o único ponto em que o motor não segue a fonte oficial** — e foi conferido in-game em
2026-09-04: em Oridecon e Elunium, só o Enriquecido aumenta a chance; nas categorias de Éter
(Arma nv5 e Equipamento nv2) o especial aumenta, como a descrição deles anuncia. A leitura da
ficha estava certa, e o aviso de "as fontes discordam" que aparecia na tela saiu junto com a
dúvida.

A escolha de projeto que sobreviveu é a que vale registrar: aqui a pergunta não é "como a
mecânica funciona" e sim "o que este item faz", que é exatamente onde o datamine ganha de um
agrupamento de tabela. `npm run descricoes` imprime as descrições dos 22 minérios, em todos os
servidores, para reconferir quando o texto do jogo mudar.

A diferença entre as duas leituras só valia zeny do +7 ao +10, com Oridecon e Elunium Perfeito:
do +11 para cima a tabela oficial repete a coluna comum na especial.

### Faixa do Carnium de Éter

A descrição LATAM diz "+16 até +20", mas a tabela oficial, o Browiki, o texto coreano do mesmo
item e a descrição do gêmeo de arma (Bradium de Éter) dizem "+11 até +20". Quatro fontes contra
uma tradução que repete a faixa do *Carnium de Éter Perfeito*: o motor fica com +11..+20.

### Bradium e Carnium

O [Hazy Forest](https://hazyforest.com/equipment:refine), wiki não-oficial do kRO, diz que além
da queda de 3 refinos existe uma chance **rara** de destruir o item. O Browiki e a descrição do
item no LATAM só citam a queda, e quem jogou não viu isso acontecer — então a quebra rara **não
é modelada**. Fica como nota de rodapé no plano, para quem quiser margem: "não vi acontecer" não
é a mesma coisa que "não acontece", e se ela existir por aqui o custo real é um pouco maior.

## Grau só a partir do +11

A tabela oficial de Grau começa no +11, e o NPC recusa o item abaixo disso — **conferido
in-game em 2026-09-04**. Isso fecha uma questão que ficou aberta por um tempo, e que valia
dinheiro: as tabelas do Browiki e do Hazy Forest listavam chance desde o +9, então o motor
propunha tentar o Grau D logo no +9 com o processo seguro, o que saía 22% mais barato numa
campanha completa de arma nv5. Era um plano que o jogo não aceita, e o `REFINO_MINIMO_GRAU`
subiu para 11.

---

Ver também: [Os dados](dados.md) · [Itens](dados-itens.md) · [Preços](dados-precos.md)
