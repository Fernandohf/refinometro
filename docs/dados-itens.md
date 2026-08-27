# Itens — Divine Pride

A base de itens serve só para descobrir a categoria do equipamento (Arma nv1–5, Equipamento
nv1–2, Sombrio) e se ele é refinável — é a única coisa que o cálculo precisa saber sobre o
item. Preço não sai daqui: o Divine Pride não guarda cotação — ver [Preços](dados-precos.md).

Os dados vêm da **página pública**, que não exige chave e já traz o nome em português do
servidor LATAM. A base inteira é varrida e versionada em `src/data/items.json`:

```bash
npm run data:items                  # varredura incremental
npm run data:items -- --forcar      # reconfere a ficha de todo mundo
npm run data:items -- --so=shadow   # uma categoria só
```

A varredura roda sozinha toda segunda-feira pela Action `base-itens.yml`, que comita o
arquivo quando algo mudou e chama o deploy em seguida (ver [Publicação](publicacao.md)). Item
novo no LATAM entra na busca em no máximo uma semana, sem ninguém rodar nada.

[`scripts/buscar.ts`](../scripts/buscar.ts) e [`scripts/fetch-item.ts`](../scripts/fetch-item.ts)
continuam existindo para inspeção manual — ver um item específico sem esperar a varredura
semanal:

```bash
npm run buscar -- "Espingarda"                 # lista o que achou
npm run buscar -- Caça --cat=armor             # weapon | armor | shadow
npm run item -- 1867                           # cadastra por ID
```

## Por que a base é varrida, e não consultada ao vivo

A pergunta óbvia é por que não pesquisar no Divine Pride na hora em que a pessoa digita, em
vez de carregar uma base inteira. A resposta é que o navegador **não consegue**:

| Tentativa | O que acontece |
| --- | --- |
| `fetch` direto do site | Sem `Access-Control-Allow-Origin` — nas páginas e na `/api/` |
| Buscar sem o cookie de idioma | `0 results` para qualquer termo em português |
| Passar o idioma por query (`?language=`, `?lang=`) | Não existe; é só cookie |
| Proxies públicos de CORS | allorigins e codetabs devolvem 522, corsproxy.io exige plano pago |
| `r.jina.ai` | Responde, mas não repassa cookie (`0 results`) e devolve markdown |

Ou seja: busca ao vivo exigiria um proxy **próprio** que repassasse `Cookie` e devolvesse
CORS — um serviço a manter, um ponto a mais para cair, e uma requisição ao Divine Pride por
tecla digitada de cada visitante. A varredura semanal troca isso por um arquivo estático:
busca instantânea, funciona offline, e o site continua sendo só HTML no GitHub Pages.

O custo da varredura é bem menor do que parece à primeira vista. A ficha pesa ~400 KB cru,
mas **20 KB comprimidos**, e o `fetch` do Node pede gzip sozinho. Somando:

| | Requisições | Tráfego |
| --- | --- | --- |
| Listagens (357 páginas, 3 categorias) | 357 | ~5 MB |
| Fichas de arma, equipamento e chapéu | ~4.700 | ~95 MB |
| Sombrios | 0 — a listagem já basta | — |

A ~5 requisições por segundo, isso dá ~20 minutos, uma vez. Depois disso a varredura é
**incremental**: quem já está na base com categoria resolvida não é baixado de novo, e a
execução semanal gasta pouco mais que as listagens. `--forcar` existe para o ponto cego desse
esquema — se o Divine Pride corrigir o nível de uma arma já cadastrada, só a reconferência
completa enxerga.

Os sombrios (mil e poucos) saem de graça porque `classificarPelaListagem` decide a categoria
deles só com tipo e subtipo. Arma e armadura não têm essa sorte, e a função devolve `null` em
vez de chutar: a listagem não traz nível de equipamento, e responder "nível 1" por omissão
esconderia os de nível 2 — os de Éter, justamente os que têm Grau.

**O arquivo é grande, então não entra no bundle.** [`src/data/items.ts`](../src/data/items.ts)
carrega `items.json` por `import()` dinâmico, na primeira vez que alguém mexe na busca; quem só
quer fazer uma conta escolhendo a categoria à mão nunca paga esse download. A data da varredura
e a contagem ficam num arquivo separado (`itemsMeta.json`), para o rodapé poder creditar a
fonte sem baixar a base junto.

## Duas armadilhas da busca

**Os cookies decidem se a busca funciona.** O Divine Pride guarda idioma e região em
`dp_language` / `dp_region`, e o padrão é coreano. Sem eles, `?query=Espingarda` devolve
*"0 results"* — não um erro, apenas nada, como se o item não existisse.
[`scripts/divinepride.ts`](../scripts/divinepride.ts) manda `dp_language=portuguese;
dp_region=LATAM` em toda requisição.

**Item sem tradução aparece com o nome em branco.** O site mantém um cartão LATAM vazio para
esses casos, e a listagem sai com a célula de nome vazia — às vezes contendo só o marcador de
slots, `[1]`, que sozinho não é nome; outras vezes com o nome coreano original, que passa no
teste de "tem nome" mas ninguém vai procurar em português. São ~1.350 dos 7.100 itens
listados, e `lerNome` descarta os três casos: sem nome utilizável não há como reconhecê-los
nem procurá-los na interface. Eles continuam cadastráveis pelo ID (`npm run item -- <id>`),
aí sim com o nome vindo do servidor em inglês.

**O colchete do fim é slot; o do começo, não.** `[Aluguel] Machado TE` não tem cartas, e
`Livro nv1 [4]` tem quatro. Só o colchete final vira `slots`.

**A ficha falha em silêncio quando o site muda.** Isto não é hipótese: durante este trabalho o
Divine Pride passou a escrever `LATAM - Portuguese` onde escrevia `LATAM - portuguese`, e o
`indexOf` sensível a caixa fez `extrairFicha` devolver `null` para **todas** as 4.689 fichas —
sem um único erro de HTTP, porque as páginas baixaram perfeitamente. A varredura foi até o
fim, gravou uma base só com os sombrios (os únicos que não precisam de ficha) e saiu com
código 0.

Por isso [`atualizar-base.ts`](../scripts/atualizar-base.ts) tem duas travas, e elas abortam
**sem gravar**:

- mais de 20% das fichas ilegíveis → "isso não é rede, é o HTML que mudou";
- a base encolher mais de 20% de uma execução para a outra.

O parser da busca tem a mesma filosofia (`parsearBusca` estoura quando o total anunciado não
bate com o que conseguiu ler). A regra geral é: **num scraper, o modo de falha perigoso é o
silencioso** — devolver lista vazia parece "nada encontrado", e ninguém investiga isso.

Os fixtures em `tests/fixtures/ficha-*.html` são HTML real congelado justamente desse episódio.

Cuidado com um detalhe ao mexer nisso: o aviso de "truncado" compara o total anunciado com as
linhas **lidas**, não com as aproveitadas. Comparar com as aproveitadas faria toda busca que
topasse com um item sem tradução parecer truncada.

O filtro é aplicado **na origem**: a busca de armaduras manda
`subTypes=Headgear,Armor,Shield,Garment,Shoes`, o que já exclui os Acessórios, e as categorias
`costume`, `card` e `consumable` nem são consultadas. Mas o veredito final é sempre do
classificador, com a ficha completa em mãos — a listagem não traz nível de arma nem posição na
cabeça, e sem isso não dá para saber se um headgear é de Topo.

A API oficial resolveria isso de forma mais limpa, mas exige `DIVINE_PRIDE_API_KEY`, não tem
endpoint de listagem (só consulta por ID) e também não manda CORS — não serve nem para a
varredura nem para o navegador.

## O que não é refinável

[`src/data/itemKinds.ts`](../src/data/itemKinds.ts) decide a categoria e recusa o que o jogo
não deixa refinar:

| Situação | Refina? |
| --- | --- |
| A descrição diz *"Não pode ser refinado"* | não — e essa linha vence todas as outras |
| Equipamento de cabeça no **Topo** (`Location: Upper`) | sim |
| Equipamento de cabeça só no **Meio** e/ou **Baixo** | não |
| Acessório comum | não |
| **Acessório sombrio** (Brinco, Colar) | sim |
| Item visual (Costume) | não |
| Armadura, escudo, calçado, capa | sim |

A primeira linha existe porque um equipamento de aluguel é `Armor/Armor` com tudo no lugar —
a "Armadura de Caça" (15247) passa por todas as regras acima e ganharia um plano de refino
completo. A própria descrição do jogo desmente isso, e ela é fonte melhor que qualquer regra
nossa, então `negaRefino` é checado antes de tudo.

Os sombrios são duas categorias, não uma: arma sombria refina com Oridecon e armadura sombria
com Elunium, embora ambas usem a mesma coluna de chances.

As duas exceções que enganam: um acessório *sombrio* refina, ao contrário do comum; e um
visual de cabeça no Topo continua não refinando.

---

Ver também: [Os dados](dados.md) · [Chances e custos](dados-chances.md) ·
[Preços](dados-precos.md)
