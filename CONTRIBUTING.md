# Como contribuir

Obrigado por aparecer. Este é um projeto de fã, feito para jogador de Ragnarok LATAM, e a
contribuição mais valiosa que ele recebe **não é código**: é alguém dizendo "refinei isso
in-game e a conta não fechou". Se você tem isso para contar, [abra uma
issue](https://github.com/Fernandohf/refinometro/issues/new/choose) — não precisa saber
TypeScript nem clonar nada.

O que serve, em ordem de quanto ajuda:

1. **Um número que não bate com o jogo** — chance, taxa do refinador, receita de NPC, faixa de
   um minério. Diga o que você viu e onde.
2. **Um item que a busca não acha**, ou que ela classifica errado (nível de arma, posição,
   refinável quando não é).
3. **Preço fora da realidade** no campo que já vem preenchido.
4. **Bug de interface**, tela quebrada no celular, texto confuso.
5. **Código** — correção, teste, componente, documentação.

Se é a sua primeira vez, [Boas primeiras contribuições](docs/primeiras-contribuicoes.md) tem
tarefas pequenas e delimitadas, cada uma já apontando para o arquivo certo.

Toda participação segue o [Código de conduta](CODE_OF_CONDUCT.md).

## Antes de abrir uma issue

Duas conferências que economizam a viagem:

- **O número está mesmo errado, ou é a fonte que discorda?** Quatro divergências conhecidas
  entre o Browiki e o Divine Pride já estão documentadas e resolvidas de propósito, em
  [Chances e custos](docs/dados-chances.md#as-divergências-registradas). Se a sua for uma
  delas, o que ajuda é confirmação in-game — é exatamente o que falta lá.
- **É preço, ou é a sua cotação?** Os preços do campo são um palpite lido do mercado oficial;
  o número que entra na conta é o que **você** digita. Ver [Preços](docs/dados-precos.md).

Ao relatar, diga sempre: **servidor**, **categoria e nível do item**, **refino de origem e
alvo**, e o que você esperava contra o que apareceu. Print ajuda muito.

## O ambiente

Precisa de **Node.js 22 ou mais novo** (é a versão que o CI usa) e do npm que vem junto.

```bash
git clone https://github.com/Fernandohf/refinometro.git
cd refinometro
npm install
npm run dev        # http://localhost:5173
```

Nada mais: sem banco, sem chave de API, sem variável de ambiente. Os dados que o site usa
estão versionados no repositório, e o cálculo roda inteiro no navegador.

## Os comandos do projeto

### Desenvolver

| Comando | O que faz |
| --- | --- |
| `npm run dev` | Servidor de desenvolvimento, com recarga a cada arquivo salvo |
| `npm test` | Testes, uma passada — é o que o CI roda |
| `npm run test:watch` | Testes reexecutando a cada alteração |
| `npm run typecheck` | Só o TypeScript, sem gerar nada |
| `npm run build` | Build de produção em `dist/` (roda `tsc -b` antes do Vite) |
| `npm run preview` | Serve o `dist/` em `http://localhost:4173/refinometro/` |

### Inspecionar pelo terminal

Sem abrir o navegador:

```bash
npm run demo     # imprime planos de exemplo por extenso
npm run perf     # mede os dois passes e calibra TENTATIVAS_POR_MS
npm run buscar -- "Espingarda"   # procura itens no Divine Pride
npm run precos   # cota os materiais de refino no mercado do LATAM
```

O `--` antes dos argumentos é obrigatório nos scripts que recebem parâmetros (`buscar`,
`item`, `precos`): sem ele o npm engole o resto da linha. `demo` e `perf` rodam offline;
`buscar` e `item` falam com o Divine Pride, `precos` fala com o site do LATAM, e os três
precisam de conexão.

### Atualizar os dados versionados

Não são necessários para rodar o site — os arquivos gerados já estão no repositório.

| Comando | O que atualiza | Documentação |
| --- | --- | --- |
| `npm run data:fetch` / `data:parse` | Chances e custos, do Browiki | [Chances e custos](docs/dados-chances.md) |
| `npm run data:items` | A base de itens, do Divine Pride | [Itens](docs/dados-itens.md) |
| `npm run precos` | A cotação inicial dos minérios | [Preços](docs/dados-precos.md) |
| `npm run descricoes` | Imprime as descrições dos 22 minérios, para reconferir | [Chances e custos](docs/dados-chances.md) |

`npm run data:items` roda sozinho toda segunda-feira pelo GitHub Actions — ver
[Publicação](docs/publicacao.md). Não é preciso comitar a base à mão.

## Estrutura do repositório

```
scripts/     coleta e conversão dos dados de origem
data-raw/    wikitext bruto do Browiki, versionado
src/data/    tabelas geradas, catálogos escritos à mão (minérios, grau, preços)
             e a classificação de itens (itemKinds.ts)
src/engine/  o cálculo: Markov, simulação, otimização de estratégia
src/         interface
tests/       testes do motor
docs/        a documentação longa: motor, matemática, interface, dados
```

Onde mexer, por tipo de mudança:

| Se você quer mudar… | Comece por | Leia antes |
| --- | --- | --- |
| Uma chance, um custo de NPC, um minério | `src/data/` (ou o parser em `scripts/`) | [Chances e custos](docs/dados-chances.md) |
| A taxa do refinador | `src/data/ores.ts` | [Os dados](docs/dados.md#taxa-do-refinador--fora-do-latam) |
| Como o plano é escolhido | `src/engine/refine.ts`, `grade.ts`, `plan.ts` | [O motor](docs/motor.md) e [A matemática](docs/matematica.md) |
| A simulação e os percentis | `src/engine/simulate.ts`, `estoque.ts` | [O motor](docs/motor.md#as-decisões-e-o-que-cada-uma-muda-na-tela) |
| A tela | `src/App.tsx`, `src/components/` | [A interface](docs/interface.md) |
| A classificação de itens | `src/data/itemKinds.ts` | [Itens](docs/dados-itens.md#o-que-não-é-refinável) |
| O scraper do Divine Pride | `scripts/divinepride.ts`, `atualizar-base.ts` | [Itens](docs/dados-itens.md#duas-armadilhas-da-busca) |

## Convenções

**Português.** Nomes, comentários, mensagens de commit e texto de tela são em português — com
exceção do que veio do domínio do jogo em inglês e já está estabelecido no código (`Ore`,
`ItemKind`, `CalcInput`). Não renomeie um por causa do outro: siga o que o arquivo já usa.

**Comentários explicam o porquê, não o quê.** O padrão do projeto é anotar a decisão e a
armadilha — por que a quebra devolve o item ao +0, por que o balão sobe para o título da
seção. Um comentário que repete a linha abaixo dele não passa.

**O motor não conhece React.** `src/engine/` recebe um `CalcInput` e devolve um `Resultado`.
Nada de DOM, de hook ou de formatação de número lá dentro; formatação mora em
`src/format.ts`.

**Falha alto, nunca em silêncio.** Em parser e scraper, devolver lista vazia parece "nada
encontrado" e ninguém investiga. Se a fonte mudou de formato, o certo é estourar — e é o que
as travas de `atualizar-base.ts` e `precos-latam.ts` fazem. Ver
[Itens](docs/dados-itens.md#duas-armadilhas-da-busca).

**Média vem da álgebra; da simulação saem só os percentis.** Se você precisar de um número
médio novo, ele sai da contagem exata de recursos, não da amostragem.

**Teste com preço congelado.** As asserções do motor usam `tests/precosFixos.ts`, nunca
`src/data/precos.json` — várias escolhas de plano se decidem na margem, e o teste não pode
depender de uma venda em Prontera.

## Testes

```bash
npm test
```

O que já está coberto, para você saber onde encaixar o seu:

| Arquivo | Cobre |
| --- | --- |
| `tests/engine.test.ts` | O plano: política, custos, recursos, grau, lista de compras |
| `tests/fluxoDeCusto.test.ts` | A decomposição do custo mostrada na tela |
| `tests/itemKinds.test.ts` | Categoria e o que refina ou não |
| `tests/baseItens.test.ts` | As travas da varredura |
| `tests/buscaDivinePride.test.ts`, `fichaDivinePride.test.ts` | Os parsers, contra HTML real congelado em `tests/fixtures/` |
| `tests/mercadoLatam.test.ts`, `precos.test.ts` | A leitura do mercado e o arquivo gerado |
| `tests/nomeNoJogo.test.ts` | Os rótulos |
| `tests/render.test.tsx` | Que a tela monta |

Regras práticas:

- **Correção de dado vem com teste que trava o valor.** A taxa do refinador é transcrita à
  mão, sem parser para avisar — quem confere é `npm test`.
- **Mudança em parser vem com fixture.** HTML real congelado em `tests/fixtures/`, não HTML
  inventado: o episódio que motivou as travas foi uma mudança de maiúscula no site real.
- **Mudança de plano vem com o número esperado.** "Ficou mais barato" não é asserção; o custo
  esperado do alvo, sim.

## Pull request

1. Abra a partir de um branch seu (`git switch -c assunto-curto`), não da `main`.
2. `npm test` e `npm run typecheck` passando. O CI roda os dois — mais o `npm run build` — em
   todo push e em todo pull request, e o resultado aparece no próprio PR
   ([Testes](https://github.com/Fernandohf/refinometro/actions/workflows/ci.yml)). Rodar
   antes de subir só economiza a ida e volta.
3. Um assunto por PR. Correção de dado, mudança de motor e mexida na tela em PRs separados
   revisam muito melhor.
4. Se mudou o comportamento do cálculo, diga **quanto** mudou: o custo do alvo antes e depois.
5. Se mudou algo que a documentação afirma, atualize o documento no mesmo PR. A pasta `docs/`
   é a explicação de por que o código é assim; documentação que mente é pior que documentação
   que falta.

**Mensagem de commit.** O padrão do repositório é `Assunto: o que mudou`, em português e no
presente — por exemplo `Minérios: separar aumentar a chance de proteger da quebra`. O assunto
é a área tocada (Motor, Preços, Interface, Documentação…). Nada de imperativo em inglês.

**Sobre arquivos gerados.** `src/data/items.json`, `precos.json`, `refineChances.json`,
`gradeChances.json` e `data-raw/` são saída de script. Se o seu PR os toca, diga qual comando
os gerou. A base de itens em particular se atualiza sozinha toda semana — em geral não precisa
entrar no seu PR.

## Uma dúvida antes de codar?

Abra uma issue descrevendo o que pretende fazer antes de escrever muito código, principalmente
se a mudança encosta no motor. O cálculo tem uma
[especificação formal](docs/matematica.md) e as decisões dele são acopladas — é melhor
combinar o rumo antes que refazer depois.
