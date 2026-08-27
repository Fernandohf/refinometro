# TODO
- [x] Conferir se o BSB (Bênção do Ferreiro) não está sempre sendo usada nas simulações
  - Conferido: não está. A Bênção é uma ação por nível dentro da política de Markov, e a
    simulação percorre exatamente essa política — o consumo amostrado bate com o exato
    (< 1% de diferença). Ela some quando a opção é desmarcada, quando o preço não compensa
    e em Equipamento Sombrio. Que ela apareça em toda a faixa +7..+13 nos preços padrão é
    resultado, não atalho: sem ela o mesmo alvo custa ~40x mais. Travado por testes em
    `tests/engine.test.ts` (describe 'Bênção do Ferreiro na simulação').
- [x] Permitir simular outro módulo:
  - Usuário coloca a quantidade que possui de cada minérios necessário ou o zeny, ver suas chances de chegar no refino/grau desejado
  - Feito: painel "Dá com o que eu tenho?" (`src/components/Estoque.tsx`), com a conta em
    `src/engine/estoque.ts`. Não é uma simulação nova — a de sempre passou a guardar 5 mil
    execuções cruas (`AmostrasCampanha`) e o veredito relê essas campanhas, abatendo do custo o que o estoque cobre; por isso a chance responde a cada tecla sem o Worker rodar de novo. Os percentis não serviriam: são marginais, e faltar minério e faltar zeny na mesma campanha não é a soma dos dois azares. Os campos listam só os materiais que o plano usa, já
    desmontados até o que se compra (Oridecon, não Bradium), com o mínimo da campanha mais
    sortuda ao lado. Travado por testes em `tests/engine.test.ts` (describe 'simular com o que já se tem') e `tests/render.test.tsx`.
- [x] Remover o banco de base dos itens e, ao vivo, pesquisar usando o parser os resultados do
      divine pride dados a entrada do usuário.
  - Feito ao contrário do enunciado, e de propósito: a base ficou, mas deixou de ser curada à
    mão (eram 17 itens) e passou a ser **varrida inteira** — 5,7 mil itens em
    `src/data/items.json`, gerados por `npm run data:items` (`scripts/atualizar-base.ts`) e
    revarridos toda segunda pela Action `base-itens.yml`.
  - Ao vivo não dá, e isso foi medido, não suposto: o Divine Pride não manda
    `Access-Control-Allow-Origin` em página nenhuma (nem na API), e a busca só responde em
    português com o cookie `dp_language` — que nenhum proxy genérico repassa. Os públicos
    testados devolveram 522 (allorigins, codetabs), 403/plano pago (corsproxy.io) ou markdown
    sem cookie (r.jina.ai). Restaria hospedar um proxy próprio: um serviço a manter, mais um
    ponto para cair, e uma requisição ao site deles por tecla digitada de cada visitante. A
    tabela com as medições está em docs/dados-itens.md, em "Por que a base é varrida, e
    não consultada ao vivo".
  - O que tornou a varredura viável foi descobrir que a ficha pesa 20 KB comprimidos, não os
    400 KB crus que assustavam o script antigo, e que os ~1.060 sombrios se classificam só
    pela listagem (`classificarPelaListagem`). Sobram ~4.700 fichas, ~20 min, uma vez — depois
    é incremental.
  - A base grande não entra no bundle: `items.json` vem por `import()` dinâmico na primeira
    vez que alguém mexe na busca, e a data/contagem ficam num `itemsMeta.json` à parte para o
    rodapé creditar a fonte sem baixar nada. Travado por `tests/baseItens.test.ts`.
  - Achado no caminho, e o mais caro: o Divine Pride mudou `LATAM - portuguese` para
    `LATAM - Portuguese`, e o `indexOf` sensível a caixa fazia `extrairFicha` devolver `null`
    para **todas** as fichas — sem um erro de HTTP sequer, porque as páginas baixavam bem. A
    primeira varredura foi até o fim e gravou uma base só com sombrios, saindo com código 0.
    Corrigido, congelado em `tests/fixtures/ficha-*.html`, e agora a varredura **aborta sem
    gravar** se mais de 20% das fichas vierem ilegíveis ou se a base encolher mais de 20%.
  - Outro achado: a descrição da ficha às vezes diz "Não pode ser refinado" (itens de aluguel,
    alguns de evento). Por tipo e subtipo eles passam por equipamento comum — a "Armadura de
    Caça" ganhava um plano de refino inteiro. Agora essa linha vence todas as regras nossas.
- [x] Colocar os créditos e dar destaque às fontes das informações.
  - Rodapé reescrito como "De onde vêm os números": uma linha por fonte dizendo o que ela
    fornece — Browiki (chances, minérios, penalidades), iROwiki (taxa do refinador, ainda não
    conferida in-game), Divine Pride (nome, cartas e categoria dos itens, com a contagem e a
    data da varredura) e você (os preços, que não vêm de lugar nenhum). Mais a nota de projeto
    de fã, sem vínculo com Gravity, Level Up! ou Divine Pride.
  - O item escolhido na busca mostra link para a ficha de origem no Divine Pride, para o
    número poder ser conferido em vez de aceito.
- [x] Melhorar a interface: prioridade de entrada e saída.
  - Análise: a tela tratava tudo com o mesmo peso. Na entrada, o alvo — a pergunta da
    calculadora — vinha depois do preço do item, e a margem de segurança morava no fim do
    formulário, longe do número que ela muda. Na saída, os três grandes números apareciam do
    mesmo tamanho, sendo que o texto do próprio custo médio desaconselha planejar por ele; e
    os avisos de perigo ("uma falha aí destrói o equipamento") vinham depois de quatro painéis,
    ou seja, depois do orçamento que eles desmentem.
  - Entrada, reordenada por impacto na resposta: **O item** (busca + categoria) → **Aonde você
    quer chegar** (refino atual/alvo, com a `TrilhaRefino` desenhando quantos degraus caem fora
    da faixa de 100%) → **Condições** → **Preços do mercado**. Mudar o +10 para +12 muda a
    resposta em ordens de grandeza; mudar o preço de um minério muda alguns por cento — e agora
    a ordem da tela diz isso.
  - O preço do item saiu de "O item" e foi para "Preços do mercado": é da mesma natureza do
    resto de lá, uma cotação que só o jogador conhece. O painel ganhou "restaurar padrão", que
    faltava para quem bagunçou os preços e ficou preso ao `localStorage`.
  - Os campos de Grau só existem em Arma nv5 e Armadura nv2; nas outras sete categorias eram
    dois `<select>` permanentemente desligados ocupando o melhor lugar do formulário. Agora
    somem, e sobra uma linha dizendo por quê.
  - Saída, reordenada pela sequência de perguntas: **avisos de perigo/atenção** → **quanto vai
    custar** → **lista de compras** → **dá com o que eu tenho?** → **melhor estratégia** →
    **minérios e materiais** (recolhido) → notas informativas. "Valor do item" deixou de ser um
    painel no fim da página e virou um dos números de apoio do painel de custo — é ele que
    responde "compensa comprar pronto?".
  - Hierarquia dentro do custo: o orçamento é `text-5xl`, média/cópias/valor justo caíram para
    `text-xl`. A margem de segurança virou um `Segmentado` no cabeçalho do painel, e a legenda
    dos cinco percentis virou o próprio controle — comparar e escolher passaram a ser o mesmo
    gesto, em vez de escolher às cegas num campo e só depois ver no que deu.
  - "Minérios e materiais" ficou recolhido atrás de um resumo: é conferência, não decisão, e
    duplicava a lista de compras a ponto de a página precisar de um parágrafo explicando por
    que os dois totais não batem.
  - A busca ganhou teclado (setas, Enter, Esc) e ARIA de combobox — antes só respondia a mouse.
  - `CATEGORIAS`/`ROTULO_GRAU` estavam duplicados em `App.tsx` e `BuscaItem.tsx`, com nomes
    diferentes para a mesma categoria; foram para `src/data/rotulos.ts`.
  - Travado por testes de ordem em `tests/render.test.tsx` ('põe o que muda a decisão antes do
    que só a explica', 'deixa a margem de segurança ao lado do número que ela muda').
- [x] Melhorar a interface (continuação):
   - [x] Mostrando a imagem e descrição do item (retirando do divine pride), assim como as mudanças
         no nome e cores (dos refinos/grau)
     - A **imagem** vem de `static.divine-pride.net/images/items/collection/{id}.png`, montada a
       partir do id que a base já tem. Não custa um byte de dados nossos e não esbarra em CORS —
       `<img>` não é `fetch`, que é justamente o que impede a busca ao vivo. Um id sem arte devolve
       o ícone de desconhecido do próprio site, então não há estado de erro a tratar. Aparece no
       slot de inventário (`SlotItem`, com `image-rendering: pixelated`) no topo do resultado, em
       cada linha da busca e no percurso da cadeia.
     - A **descrição** ficou de fora, por decisão de escopo: ela não está na base (que guarda id,
       nome, slots e categoria) e só entraria com uma re-varredura das 4,7 mil fichas e um arquivo
       de ~1 MB. O link para a ficha continua respondendo por ela.
     - **Nome e cores**: `nomeNoJogo()` monta `+10 [B] Adaga [2]` na ordem do cliente, omitindo o
       que o jogo omite (+0, sem grau, sem fenda). As cores do Grau não foram inventadas — são a
       cor dominante de cada `itemgrade_*.png` do Browiki, amostrada do PNG: D vermelho `#BF5159`,
       C dourado `#CF9400`, B verde `#249000`, A roxo `#7E6E8F`. O cartão mostra o item como ele
       vai FICAR (refino e grau alvo): é o que o orçamento logo abaixo está comprando.
   - [~] Deixar a interface mais inspirada no jogo — **feita e depois revertida a pedido**. O tema
         escuro original voltou; tudo o que não era tema ficou. Ver a nota no fim desta seção.
     - Pele completa do cliente, e ela cabe num arquivo: os NOMES dos tokens de cor continuaram os
       mesmos (`fundo`, `painel`, `borda`, `texto`, `suave`, `realce`, ...) e só os valores mudaram,
       então a tela inteira trocou de pele sem um `className` reescrito — e voltaria atrás trocando
       o mesmo bloco.
     - `src/index.css` ganhou o chrome: `.ro-janela` (moldura em bisel de dois tons), `.ro-cavado`
       (o inverso, para campo e área rebaixada), `.ro-titulo` (barra de título em gradiente) e
       `.ro-botao` (que afunda ao ser apertado). Tudo em sombra e borda, sem uma imagem sequer.
       Cantos quadrados, mesa quadriculada de 4px por trás das janelas.
     - Tipografia: `Pixelify Sans` no chrome — título, rótulo, botão, cabeçalho de tabela — e a
       fonte do sistema no texto corrido e nos números. Número de doze dígitos em bitmap não se lê,
       e o cliente também mistura as duas.
     - `Painel` virou janela de verdade: o título mora na barra, não solto sobre o conteúdo. Os
       botões de "esconder/editar/simular", que eram links sublinhados, viraram `BotaoJanela` na
       barra de título, onde o cliente põe os controles da janela.
   - [x] Adicionar um modo de visualização que mostra de forma iterativa as chances de cada decisão
         na cadeia de Markov das simulações
     - `PlanoDeFase` passou a expor a `politica` crua (antes só saíam os `trechos` já agrupados
       para leitura). Agrupar é o certo para ler um plano e o errado para ver a cadeia: cada refino
       é um estado com decisão, chance, destino de falha e custo-para-o-fim próprios.
     - `src/components/Cadeia.tsx` dá duas leituras da mesma política. A **tabela de estados** põe
       todos de uma vez, com barra de chance e barra de "falta gastar" — é ela que explica por que a
       Bênção do Ferreiro compensa onde parece cara: ela não muda a chance, muda para onde a falha
       joga o item. O **percurso** anda um passo por vez, sorteando de verdade (`Math.random()`
       contra a chance da política, com o destino de falha que o motor calculou), e mostra o item
       mudando de refino, o gasto acumulado e as quebras. É a parte iterativa: responde "por que
       custa tanto se a chance é 40%?" mostrando o item cair de +9 para +6 e refazer o caminho.
     - Não é a simulação do orçamento — essa continua no Worker, cem mil campanhas. Esta é uma
       campanha só, visível.
     - Achado ao conferir o desenho: num degrau de 100% a tabela anunciava "quebra" na coluna de
       falha. O motor registra a penalidade do minério mesmo quando a chance é 1; anunciá-la era
       inventar um risco que a tabela de chances não tem. Agora diz "não falha".
   - Travado por `tests/nomeNoJogo.test.ts` (formato do nome, cores dos graus, nenhum par de graus
     dividindo cor) e por quatro testes novos em `tests/render.test.tsx` (arte e nome do jogo, a
     cadeia fechada não renderizando a tabela, e as classes da pele).
- [x] Diagrama de Sankey de "para onde vai o zeny".
  - Veio de uma pergunta: trocar a visualização da cadeia de Markov por um Sankey. Medi antes de
    responder, com 200 mil campanhas do caso padrão (Arma nv4, +0 → +10): **33% de todas as
    transições da cadeia são para trás**, e a aresta mais pesada de todas é o laço `+9 → +9`
    (4,00 por campanha — a Bênção segura o item, você paga 3,5 mi e continua no mesmo lugar).
    Sankey é um DAG: não desenha laço, não desenha volta, e pressupõe conservação — que a quebra
    viola, porque um item morre e outro entra no +0. As duas coisas que ele não sabe desenhar são
    exatamente as que respondem "por que custa 276 milhões?". A cadeia ficou como está.
  - Uma preocupação minha caiu por terra na medição, e vale registrar contra o próximo palpite: eu
    esperava larguras variando em ordens de grandeza. Não variam — do estado menos ao mais visitado
    são 4x. O problema é topológico, não de escala.
  - O Sankey foi então apontado para a pergunta que ele responde bem, e que só existia como tabela:
    para onde vai o zeny. `src/engine/fluxoDeCusto.ts` relê a MESMA `listaDeCompras`, no mesmo
    percentil, e a agrupa por **natureza do gasto** — proteção, reposição do item, materiais,
    balcão e taxas. São quatro decisões diferentes (trocar de fornecedor, desmarcar "posso perder o
    item", comprar mais cópias), e cada uma mexe num pedaço só.
  - O que o desenho diz e a tabela escondia: nos preços padrão de um +10, **58% do orçamento é
    Bênção do Ferreiro e 29% é recomprar o equipamento** — 87% do gasto não é minério. Numa lista
    ordenada por valor isso não se lê.
  - `src/components/SankeyCusto.tsx` desenha em SVG à mão: o projeto não tem dependência de runtime
    além do React, e uma biblioteca de gráficos aqui pesaria mais que a calculadora. O fluxo é uma
    árvore (cada folha em um grupo só), o que dispensa o algoritmo de ordenação de um Sankey geral
    e garante que nenhuma fita cruze. As faixas nunca se movem — mover distorceria a proporção, que
    é a única coisa que o desenho afirma; quem cede é o rótulo, num passe de desempilhamento, com
    um fio ligando o texto ao seu bloco quando os dois se separam.
  - Três defeitos achados só ao olhar o desenho no navegador: o total saía cortado (`textAnchor`
    centrado numa barra em x=0), os rótulos das faixas finas se sobrepunham, e uma fatia de
    320.000z aparecia como "0%" — agora "<1%".
  - Travado por `tests/fluxoDeCusto.test.ts`. O teste que importa é o primeiro: o total do fluxo
    tem de bater **ao zeny** com o total da tabela ao lado, porque os dois ficam no mesmo painel.
    Há também um teste que falha se os preços padrão mudarem a ponto de o minério deixar de ser a
    menor parte — a hora em que o texto ao lado do desenho passaria a mentir.
  - **Correção depois de revisão**: o grupo "Balcão e taxas" juntava dois gastos que não têm nada
    a ver um com o outro. São NPCs diferentes fazendo coisas diferentes:
    - **Refino dos minérios** — o balcão que transforma 5 Minério de Oridecon em 1 Oridecon, ou 3
      Oridecon mais 50.000z em 1 Bradium. É custo de PREPARAR o material, e some inteiro se o
      minério pronto for comprado no mercado.
    - **Refino do equipamento** — a taxa cobrada por tentativa. Não depende de fornecedor nenhum e
      cresce com o número de tentativas.
    - Juntá-los escondia que um se resolve comprando melhor e o outro não se resolve de jeito
      nenhum. No caso padrão (Arma nv4 +10) a diferença é irrelevante, mas numa campanha de Grau A
      o balcão é **10% do orçamento (225 mi)** contra 2% de taxa — os dois apareciam como um bloco
      de 12%.
  - `listaDeCompras` passou a devolver `fabricacao: FabricacaoLinha[]`, o balcão aberto por minério
    fabricado. Sem isso o grupo era um bloco de 225 mi que não sugeria ação; com isso a maior linha
    é "Fabricar Pedra de Éter, 161 mi (1.610 un.)" — e aí dá para decidir procurá-la pronta.
    Receitas de balcão zero (Minério de Oridecon → Oridecon) não viram linha.
  - Grupos com cauda longa dobram as menores em "+N outras linhas": a campanha de Grau abre oito
    minérios fabricados, e os últimos viravam fios de cabelo com o rótulo empurrado para longe. O
    total do grupo não muda, e a tabela ao lado continua linha a linha.
  - Dois ajustes achados no navegador: o bronze do balcão estava em h45 e encostava no vermelho da
    reposição — duas faixas vizinhas de significado oposto não podem depender de olho treinado, foi
    para h60; e o passe de desempilhamento dos rótulos não conhecia fronteira de grupo, então a
    última linha de um grupo colava na primeira do seguinte justo na coluna de texto.
- [x] Reverter a pele de RO, mantendo as features.
  - A aposta de projeto se pagou: como só os VALORES dos tokens tinham mudado, `src/index.css` e
    `index.html` voltaram com `git checkout` e ficaram idênticos ao original, tirando duas adições
    que não são tema. O trabalho real foi separar, componente a componente, o que era pele do que
    era função.
  - Ficou de tema (saiu): `.ro-janela`, `.ro-cavado`, `.ro-titulo`, `.ro-botao`, a barra de título
    das janelas, a mesa quadriculada, os cantos quadrados e a fonte de pixel `Pixelify Sans` — com
    o `<link>` do Google Fonts, que a página não busca mais.
  - Ficou de função (permaneceu): a arte do item, o nome no formato do jogo (`+10 [B] Adaga [2]`),
    as cores dos graus, a trilha de refino, o controle segmentado da margem, a legenda de
    percentis clicável, a cadeia de decisões e o Sankey de custo.
  - Duas coisas nasceram na pele e ficaram porque não eram dela:
    - `.sprite` (`image-rendering: pixelated`) — não é decoração: suavizar a arte de um jogo feito
      em pixel mostraria uma imagem que o jogo não tem.
    - `--color-bronze` — o diagrama de custo precisa de cinco faixas distinguíveis e as quatro
      cores de estado já têm dono. Foi retunado para o fundo escuro (`oklch(0.6 0.06 55)`), longe
      do vermelho porque "reposição" e "fabricação" são faixas vizinhas de significado oposto.
  - `NomeNoJogo` passou a usar a variante CLARA das cores de grau. As duas saem do mesmo ícone do
    Browiki; sobre o fundo escuro a dominante fica ilegível — o verde do Grau B some. O teste passou
    a exigir unicidade nas duas variantes, senão uma colisão só na usada passaria despercebida.
  - `BotaoJanela` virou `BotaoDoPainel`, com a aparência de sempre (link discreto). O nome de
    janela não valia mais nada sem janelas, e o componente ficou: ele apagou a cópia do mesmo botão
    que existia solta em quatro arquivos.
  - Saiu o teste 'veste a pele do cliente': ele guardava exatamente a pele que foi removida. Os
    outros três testes desta leva (arte e nome do jogo, cadeia fechada, Sankey) continuam — eles
    cobrem feature, não tema.