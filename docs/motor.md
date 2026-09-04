# Como o motor funciona

Todo o cálculo vive em [`src/engine/`](../src/engine/) e não depende de React: entra um
`CalcInput` (categoria, refino e grau atuais, alvos, preços, se pode usar Bênção e minério
especial, se dá para perder o item) e sai um `Resultado` com plano, custo, materiais,
percentis e avisos. A interface só desenha o que ele devolve.

Este documento é o mapa: o que o motor decide, em que ordem, e o que cada decisão muda na
tela. A formalização — o MDP, as demonstrações, o erro de cada aproximação e as referências
de cada resultado usado — está em **[A matemática do motor](matematica.md)**, e os ponteiros
`→ §x` abaixo levam para lá.

## O caminho de um cálculo

`calcular()` ([`src/engine/plan.ts`](../src/engine/plan.ts)) é o maestro, e faz sempre a
mesma sequência:

1. **Valida** o alvo contra a categoria — refino acima do máximo da coluna, grau em item que
   não tem grau, alvo abaixo do atual.
2. **Quebra a campanha em fases.** Subir de grau reseta o refino, então "Grau A +11" vira
   `refinar → grau D → refinar → grau C → … → refinar até +11`. Sem grau, é uma fase só. → §1.2
3. **Resolve cada fase de refino** como uma cadeia de Markov (`solveRefine`), e cada degrau de
   grau por busca exaustiva sobre as três decisões que ele tem (`solveGradeStep`). → §2–4, §6
4. **Agrega os recursos** somando os números exatos de cada fase — zeny, minérios, bênçãos,
   tentativas, taxas, quebras. → §3.2
5. **Simula**, se o alvo couber no orçamento de tempo, só para extrair os percentis. → §8
6. **Gera os avisos**, lendo o plano já pronto: risco de quebra, processo de grau normal,
   Bradium sem Bênção, grau abaixo do +11, simulação curta ou truncada.

O passo 4 é deliberadamente independente do 5. Todo número de material que a tela mostra como
média vem da álgebra, não da amostragem — inclusive quando a simulação nem chega a rodar.

## As decisões, e o que cada uma muda na tela

**Que minério usar em cada nível** → §2–4. Uma falha pode destruir o item, derrubar 1 refino ou
derrubar 3, então a melhor escolha em cada nível depende do custo esperado dos vizinhos —
inclusive dos que ficam _abaixo_ de onde você começou. O motor resolve isso como um processo de
decisão de Markov e de forma exata (sistema linear, não iteração truncada); a política que sai é
o que a tela mostra como estratégia por faixa. A taxa do refinador entra por tentativa, e não
como constante da campanha: nas armas nv1 a nv4 o minério de Cash Shop é isento, e é isso que faz
o Enriquecido competir de igual para igual com o Oridecon.

**Quebrar custa, e devolve o item ao +0** → §2.1. Quando a falha destrói o equipamento, o modelo
cobra `precoItem` — o preço do item **sem refino** — e recomeça do +0. Repor no refino atual
criaria um atalho falso, e o otimizador aprenderia a quebrar de propósito. Na tela isso vira
`copiasItem = 1 + itensQuebrados`: quantas cópias separar, e não só quanto zeny levar.

**Quando perder o item não é uma opção** → §5. Com carta, encanto ou item de evento, a quebra
deixa de ser um custo que o otimizador pondera e vira **restrição** — nenhum `precoItem` alto
modela isso direito, porque qualquer valor finito ainda aceita a troca. O motor deriva o **piso**
(o refino mais baixo de onde ainda há caminho até o alvo sem nunca arriscar o equipamento) e
resolve o problema só dali para cima. Numa Arma nv4 o piso é o +7; numa nv5 é o +0, porque o
Eteridecon derruba 3 refinos mas nunca quebra; num Sombrio não existe piso, e o alvo é recusado
com essa explicação. Quanto a garantia custa varia demais para virar regra de bolso, então o
motor resolve o mesmo alvo dos dois jeitos e põe a diferença num aviso.

**Grau: três decisões acopladas** → §6. Em que refino tentar, processo seguro ou normal, e
quantos pontos de chance comprar com Bênção de Éter. Como o sucesso zera o refino, subir além do
necessário é dinheiro que evapora — e a regra de bolso "suba até o +11 antes de tentar" às vezes
é falsa, quando o trecho até lá é caro o bastante. A busca é exaustiva sobre um espaço pequeno,
com cache dos trechos de refino que os degraus repetem.

**Comprar ou fabricar** → §7. Metade dos minérios ninguém compra pronto: fabrica no NPC.
`unitCost()` devolve o menor entre o preço de mercado informado e o da receita, recursivamente;
sem preço nem receita o custo é infinito e o motor descarta toda estratégia que dependeria do
item. A lista de compras desmonta a conta seguindo **exatamente** a mesma decisão — se
divergisse, o total mostrado não fecharia com o orçamento.

**Os percentis** → §8. A média de um refino engana: a distribuição tem cauda longa à direita, e
quem se planeja por ela fica sem recursos no meio do caminho quase metade das vezes. A simulação
de Monte Carlo existe só para dar os percentis. O gerador é determinístico (mesma entrada, mesma
tela, sem números dançando a cada tecla), a campanha é compilada em arrays tipados antes do laço,
e execução cortada — por tempo ou pelo teto de tentativas — é contada e vira aviso, porque
falseia o custo para baixo.

**Dá com o que eu tenho?** → §9. O painel de estoque responde o inverso: dado o zeny em caixa, os
minérios na mochila e as cópias do equipamento, qual a chance de chegar ao alvo. Não é uma
simulação nova — a de sempre guarda 5 mil execuções **cruas**, e o veredito relê aquelas mesmas
campanhas a cada tecla digitada. Precisa ser assim porque os percentis são marginais: faltar
Oridecon e faltar zeny na *mesma* campanha não é a soma dos dois azares, e só a distribuição
conjunta responde.

Os campos pedem o estoque **no que se compra de verdade**, não em minério pronto — a mesma
expansão da lista de compras, pela mesma razão. O painel tem alvo próprio (10% a 99%) e dois
botões, que são a mesma equação resolvida para lados opostos: **preencher mochila e caixa** põe o
piso de material e o zeny que esse piso ainda exige; **só o material, com o meu zeny** mantém o
caixa informado e resolve a mochila. O segundo tem teto, e ele é a resposta ao caso que mais
confunde: taxa do refinador, balcão do NPC e cópia de reposição se pagam em zeny, e minério
nenhum os cobre.

## O orçamento é de tempo

`calcular(input, { tempoMs })` não recebe número de execuções — recebe tempo, e converte em
**trabalho** (tentativas de refino, a 40.000/ms, calibrado com `npm run perf`). Converter tempo
em trabalho deixa o resultado determinístico: o mesmo alvo produz o mesmo número de execuções em
qualquer máquina, e o relógio de dentro da simulação fica só como rede de segurança para máquinas
mais lentas que a da calibragem. → §8.5, §10.3

## Dois passes

Simulação boa custa segundos, e segundos de laço síncrono congelam a aba — o campo de preço para
de aceitar tecla, o select não abre. Então o cálculo roda duas vezes: um **passe rápido** (80 ms,
síncrono) para a tela nunca ficar vazia enquanto se digita, e um **passe preciso** (3 s, num Web
Worker) que substitui o resultado quando fica pronto.

O Worker é recriado a cada entrada nova de propósito: `terminate()` é a única forma de cancelar
um laço já em andamento. E cada resposta traz de volta o `id` do pedido, para que o resultado de
uma entrada já superada seja descartado em vez de piscar na tela.

## Alvos inalcançáveis

Acima do +14 a Bênção do Ferreiro para de funcionar e cada falha derruba 3 refinos, então o custo
explode: levar uma arma nível 4 do +0 ao +20 exige da ordem de 10⁸ tentativas de refino. Nesses
casos a calculadora não simula — percentis truncados subestimariam o custo em ordens de grandeza
—, mostra o custo exato e diz que o alvo está fora de alcance. O corte nunca é uma escolha à
parte: é o orçamento dividido pelo número mínimo de campanhas simuladas, e por isso o passe
preciso alcança alvos que o passe rápido recusa. → §8.5

## Mapa do motor

| Arquivo | O que faz |
| --- | --- |
| [`plan.ts`](../src/engine/plan.ts) | Orquestra tudo: valida, monta as fases, agrega recursos, chama a simulação, gera os avisos |
| [`refine.ts`](../src/engine/refine.ts) | O MDP de refino: ações disponíveis, piso seguro, iteração de política, avaliação exata, contagem de recursos |
| [`grade.ts`](../src/engine/grade.ts) | Os degraus de Grau: escolhe refino, processo e Bênção de Éter; encadeia a campanha |
| [`linear.ts`](../src/engine/linear.ts) | LU com pivotamento parcial — o solucionador que avalia cada política |
| [`pricing.ts`](../src/engine/pricing.ts) | Comprar × fabricar, custo unitário recursivo e lista de compras |
| [`simulate.ts`](../src/engine/simulate.ts) | Monte Carlo da campanha compilada, de onde saem os percentis |
| [`estoque.ts`](../src/engine/estoque.ts) | Relê as campanhas simuladas do outro lado: a chance de chegar ao alvo com o que já se tem |
| [`worker.ts`](../src/engine/worker.ts) | O passe preciso, fora da thread da página |
| [`types.ts`](../src/engine/types.ts) | `CalcInput`, `ResourceUsage`, `Percentis` e companhia |

## O que não é considerado

- Cartas nos itens
- Encantamentos e bônus aleatórios
- Pergaminhos, Cubos e Martelos de Refino, que pulam direto para um refino fixo

As hipóteses do modelo — o que ele assume sobre chances, preços, liquidez e risco, e o que
muda se cada uma for falsa — estão tabeladas em
[matematica.md §11](matematica.md#11-hipóteses-do-modelo-e-o-que-elas-deixam-de-fora).

---

Ver também: [A matemática do motor](matematica.md) · [A interface](interface.md) ·
[Os dados](dados.md)
