# Publicação

O site é estático e mora no GitHub Pages. Três workflows cuidam do repositório, e dois deles
se chamam um ao outro de propósito.

Os selos no topo do [README](../README.md) mostram o estado dos três: se o de **Testes**
estiver vermelho, a `main` está quebrada e o deploy mais recente não subiu.

## Testes — `.github/workflows/ci.yml`

Roda `npm run typecheck`, `npm test` e `npm run build` em todo push e em todo pull request.
É o portão de quem contribui: a falha aparece no PR, antes do merge, e não só quando a `main`
já mudou.

O `deploy.yml` testa de novo, e isso não é desperdício — é ele quem decide se o site sobe, e
essa decisão não pode depender de um job que rodou em outro commit.

Um push novo no mesmo branch cancela a execução anterior (`concurrency`): só interessa o
resultado do último commit.

## Deploy — `.github/workflows/deploy.yml`

Roda os testes, faz o build e publica no GitHub Pages a cada push na `main`. O `base` do Vite
está em `/refinometro/`; se o repositório tiver outro nome, ajuste em
[`vite.config.ts`](../vite.config.ts).

O `npm test` roda **antes** do build, no mesmo job: o build é a calculadora inteira, e se as
contas quebrarem nada sobe.

### A origem do Pages precisa ser "GitHub Actions"

Em **Settings → Pages → Build and deployment**, `Source` tem de estar em **GitHub Actions** —
não em *Deploy from a branch*. Não é preferência: com a origem em branch, o GitHub roda o
builder próprio dele (aparece como `pages build and deployment`, com um passo "Build with
Jekyll") e publica a **raiz do repositório como ela está**, por cima do que o `deploy.yml`
acabou de enviar.

O modo de falha é dos silenciosos, e por isso está escrito aqui. Os dois workflows ficam
**verdes**; o que quebra é o site, e do jeito mais confuso possível: o `index.html` publicado é
o de desenvolvimento, aquele que carrega `/src/main.tsx` — arquivo que só existe no
código-fonte, e sem o prefixo `/refinometro/`. No navegador isso vira uma página em branco e
um `GET /src/main.tsx 404` no console.

Como reconhecer, sem depender do console: se a lista de execuções tem um
`pages build and deployment` ao lado de cada `Deploy no GitHub Pages`, a origem ainda está em
branch. Com a origem correta, só o segundo existe.

## Base de itens — `.github/workflows/base-itens.yml`

Revarre o Divine Pride toda segunda-feira (06:00 UTC) e comita `src/data/items.json` quando
algo mudou. Se nada mudou, não há commit e nada sobe. O passo de testes roda **antes** do
commit: a base é entrada do cálculo, e item classificado errado vira orçamento errado.

Depois de comitar, ele **chama o deploy explicitamente** (`gh workflow run deploy.yml`). Isso
não é redundância: push feito com o `GITHUB_TOKEN` não dispara outros workflows — o GitHub
corta aí para evitar recursão infinita — então o `on: push` do deploy ficaria mudo e a base
nova nunca chegaria ao site. `workflow_dispatch` é a exceção documentada dessa regra.

O workflow também aceita disparo manual, com a opção `forcar` para reconferir a ficha de todos
os itens (~20 min a mais). O `concurrency` impede duas varreduras simultâneas: as duas
gravariam o mesmo arquivo, e a segunda a comitar apagaria o que a primeira achou.

Detalhe da varredura em si — custo, incremental e travas de segurança — em
[Itens](dados-itens.md#por-que-a-base-é-varrida-e-não-consultada-ao-vivo).

## Preços — `.github/workflows/precos.yml`

Recota os materiais no mercado do LATAM **todo dia** (09:00 UTC) e comita `src/data/precos.json`
quando algum preço mudou. Mesma forma do anterior — testes antes do commit, deploy chamado à mão,
`concurrency` para não haver duas cotações escrevendo o mesmo arquivo.

Diário, e não semanal, porque é o que a cotação pede: a base de itens muda quando o jogo muda, o
preço muda quando o mercado se mexe. O Pó de Éter foi de 59.100 para 146.000 em dez dias, e com
cotação semanal metade desse tempo o campo abriria com um número que ninguém mais cobra.

O script tem as próprias travas — recusa gravar se mais de um quarto das consultas falhar ou se
menos de oito cotações passarem na conferência —, e elas importam mais aqui do que num disparo
manual: ninguém está olhando. Ver [Preços](dados-precos.md).

---

Ver também: [Os dados](dados.md) · [Como contribuir](../CONTRIBUTING.md)
