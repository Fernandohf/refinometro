# A matemática do motor

Este documento é a especificação formal do que `src/engine/` calcula: definições, hipóteses,
proposições com demonstração e as referências de onde cada resultado vem. O
[Como o motor funciona](motor.md) conta a mesma história em prosa e com foco em
*por que* o motor foi escrito assim; aqui o objetivo é outro — deixar cada afirmação
verificável, e cada aproximação com o erro dela declarado.

As referências numeradas — `[1]`, `[2]`, … — estão em [§12](#12-referências).

**Convenções de notação.** Fórmulas ficam em blocos de código com símbolos Unicode (`Σ`, `≤`,
`·`, `𝔼`), no mesmo estilo do restante da documentação. Vetores são colunas; `1` é o vetor de uns; `‖x‖∞ =
maxᵢ|xᵢ|`; para matrizes, `‖A‖∞` é a norma induzida (maior soma de módulos por linha).
Desigualdades entre vetores são componente a componente. `(x)₊ = max(x, 0)`.

---

## Índice

1. [O objeto modelado](#1-o-objeto-modelado)
2. [A cadeia de refino como problema de caminho mínimo estocástico](#2-a-cadeia-de-refino-como-problema-de-caminho-mínimo-estocástico)
3. [Avaliação exata de uma política, e a contagem de recursos](#3-avaliação-exata-de-uma-política-e-a-contagem-de-recursos)
4. [Iteração de política](#4-iteração-de-política)
5. [A restrição de segurança](#5-a-restrição-de-segurança)
6. [Os degraus de Grau](#6-os-degraus-de-grau)
7. [Custo de aquisição: comprar ou fabricar](#7-custo-de-aquisição-comprar-ou-fabricar)
8. [Monte Carlo: o que a média não responde](#8-monte-carlo-o-que-a-média-não-responde)
9. [A pergunta inversa: o painel de estoque](#9-a-pergunta-inversa-o-painel-de-estoque)
10. [Aritmética de ponto flutuante e complexidade](#10-aritmética-de-ponto-flutuante-e-complexidade)
11. [Hipóteses do modelo, e o que elas deixam de fora](#11-hipóteses-do-modelo-e-o-que-elas-deixam-de-fora)
12. [Referências](#12-referências)

---

## 1. O objeto modelado

### 1.1 Dados primitivos

Fixe uma **categoria** de equipamento `k ∈ 𝒦 = {w1, w2, w3, w4, w5, a1, a2, shadowW, shadowA}`
([src/data/ores.ts](../src/data/ores.ts)). Da categoria dependem:

| Símbolo | Significado | Onde vive |
| --- | --- | --- |
| `R(k)` | refino máximo alcançável | `maxRefine()` |
| `O(k, r)` | minérios utilizáveis quando o item está no refino `r` | `oresFor()` |
| `q(k, r, σ, ε) ∈ (0,1]` | chance de a tentativa `r → r+1` dar certo, na tabela `σ ∈ {comum, alta}` e evento `ε ∈ {0,1}` | `chanceOf()`, tabela `refineChances.json` |
| `τ(k, o) ≥ 0` | taxa cobrada pelo refinador na tentativa com o minério `o` | `taxaDaTentativa()` |
| `β(k, r) ∈ ℕ ∪ {⊥}` | Bênçãos do Ferreiro necessárias para proteger a tentativa que sai de `r` | `blessingCost()` |
| `π(o) ∈ {quebra, desce1, desce3}` | o que a falha faz com o item | campo `penalidade` |
| `σ(o) ∈ {comum, alta}` | qual tabela de chances o minério `o` usa | campo `chanceAumentada` |

`σ(o)` e `π(o)` são **independentes**: um minério pode aumentar a chance e ainda destruir o item
(Oridecon Enriquecido), proteger sem aumentar a chance (Oridecon Perfeito) ou fazer as duas
coisas (Eteridecon Enriquecido). Nenhum dos dois se deduz de o minério ser "especial", que é uma
questão de acesso — ver [Chances e custos](dados-chances.md#especial-não-quer-dizer-chance-maior).

E dois preços informados pelo jogador: `u(i) ∈ (0, ∞]` para cada material `i`
([§7](#7-custo-de-aquisição-comprar-ou-fabricar)), e `V₀ > 0`, o preço de reposição do item
**sem refino**.

### 1.2 Campanha e fases

Uma campanha é o par (refino alvo, grau alvo). Como **subir de grau zera o refino para +0**
([src/data/grade.ts](../src/data/grade.ts)), a campanha se decompõe numa sequência
determinística de fases:

```
refinar(r₀ → ρ₁) · grau(D) · refinar(0 → ρ₂) · grau(C) · … · refinar(0 → alvo)
```

As fases de refino são resolvidas por
[§2](#2-a-cadeia-de-refino-como-problema-de-caminho-mínimo-estocástico)–[§4](#4-iteração-de-política);
os degraus por [§6](#6-os-degraus-de-grau). `calcular()`
([src/engine/plan.ts](../src/engine/plan.ts)) monta a lista e soma.

> **Proposição 1.1 (separabilidade da campanha).** O custo esperado total é a soma dos custos
> esperados das fases, e minimizar fase a fase, na ordem, é globalmente ótimo.
>
> *Demonstração.* O estado de entrada de cada fase é **determinístico**: um sucesso de grau
> reseta o refino para 0, e é o único jeito de a fase terminar. Logo a decisão tomada dentro da
> fase `j` não altera o estado inicial da fase `j+1`, e o custo total é `Σⱼ Vⱼ(entradaⱼ)` com
> `entradaⱼ` fixa. Minimizar cada parcela isoladamente minimiza a soma. ∎

Vale destacar o que a Proposição 1.1 **não** diz: as fases não são independentes em distribuição
de nenhuma forma interessante — apenas o *estado de entrada* é fixo, o que já basta para a
aditividade das esperanças. A soma de esperanças em `agregarRecursos()` é válida por
[linearidade da esperança](https://en.wikipedia.org/wiki/Expected_value#Linearity), que não exige
independência nenhuma.

---

## 2. A cadeia de refino como problema de caminho mínimo estocástico

### 2.1 O processo de decisão de Markov

Fixe uma fase de refino com alvo `N` e piso `L` ([§5](#5-a-restrição-de-segurança); com perda
aceitável, `L = 0`). Defina o MDP `(S, A, P, c)` — na formulação padrão de [1] e [2]:

- **Estados** `S = {L, L+1, …, N}`. O estado `N` é absorvente e tem custo zero: é o destino.
- **Ações** `A(r)`, para `r < N`: pares `a = (o, b)` com `o ∈ O(k, r)` e `b ∈ {0, β(k,r)}`
  (`actionsAt()`, [src/engine/refine.ts](../src/engine/refine.ts)). A lista é filtrada: minério
  bloqueado pelas opções, chance nula naquele nível, ou material sem preço nem receita (`u = ∞`)
  saem.
- **Chance de sucesso** `pₐ = q(k, r+1, σ(o), ε) > 0`.
- **Destino da falha**

  ```
  φ(r, a) = r              se b > 0            (a Bênção segura o refino no lugar)
          = ⊥              se b = 0 e π(o) = quebra
          = max(0, r − 1)  se b = 0 e π(o) = desce1
          = max(0, r − 3)  se b = 0 e π(o) = desce3
  ```

  onde `⊥` significa "item destruído"; nesse caso o jogador compra outro **no +0** e o processo
  reinicia em `ρ = 0` (`refinoReposicao`, fixo em `plan.ts`).
- **Custo imediato**

  ```
  c(r, a) = u(minério de a) + b · u(Bênção) + τ(k, o) + 1{φ(r,a) = ⊥} · (1 − pₐ) · V₀
  ```

  O último termo é o preço esperado da reposição cobrado *na própria transição*; é assim que
  `valorDaAcao()` e `avaliarPolitica()` o tratam.

Duas escolhas de modelagem merecem registro porque mudam a resposta:

1. **A taxa entra por ação, não como constante da campanha.** Minério de Cash Shop é isento
   (`joyCoins ⇒ τ = 0`), e é isso que faz o Oridecon Enriquecido competir de igual para igual com
   o Oridecon comum numa arma nv4.
2. **A reposição volta ao +0, não ao refino corrente.** Repor no refino atual criaria um atalho
   com custo finito e progresso grátis, e o otimizador aprenderia a quebrar de propósito. Como
   `V₀` é o preço do item sem refino, o par (custo, destino) é consistente.

### 2.2 Positividade e propriedade das políticas

Uma **política estacionária determinística** é um mapa `π: S∖{N} → A` com `π(r) ∈ A(r)`. Ela é
**própria** (*proper*, [1]) quando, partindo de qualquer estado, atinge `N` com probabilidade 1.

> **Proposição 2.1 (custos estritamente positivos).** Toda ação com custo finito tem
> `c(r, a) > 0`.
>
> *Demonstração.* Por [§7.2](#72-positividade), `u(i) > 0` sempre que `u(i) < ∞`. O custo de uma
> ação é `u(minério) + (termos ≥ 0)`, e ações com `u(minério) = ∞` são descartadas em
> `actionsAt()`. ∎

> **Proposição 2.2 (toda política é própria).** Para qualquer política estacionária `π`, o tempo
> de absorção `T` satisfaz `P(T > m·(N−L)) ≤ (1 − p̄^(N−L))^m` para todo `m ∈ ℕ`, onde
> `p̄ = min_{r,a} pₐ > 0`. Em particular `T < ∞` q.c., `𝔼[T] < ∞` e todos os momentos de `T` são
> finitos.
>
> *Demonstração.* Toda ação tem `pₐ > 0` (chances nulas são filtradas) e um sucesso sempre move o
> estado de `r` para `r+1`. Logo, de qualquer estado, uma sequência de `N − L` sucessos
> consecutivos leva a `N`, e essa sequência tem probabilidade `≥ p̄^(N−L) > 0` a cada bloco de
> `N − L` tentativas, uniformemente no estado de partida. A cauda geométrica segue por Markov
> forte, bloco a bloco. ∎

A Proposição 2.2 é mais forte do que a hipótese usual de [1] (existe *alguma* política própria, e
as impróprias têm custo infinito): aqui **não existe** política imprópria. Isso simplifica tudo o
que vem a seguir — em particular, nenhuma avaliação de política pode encontrar um sistema
singular.

### 2.3 A equação de Bellman

O valor ótimo `E*: S → [0,∞)` é definido por
`E*(r) = min_π 𝔼_π[custo total até absorver | s₀ = r]`.

> **Teorema 2.3 (SSP; Bertsekas & Tsitsiklis [1], Puterman [3]).** Sob as Proposições 2.1–2.2:
> `E*` é a **única** solução do sistema de Bellman
>
> ```
> E(N) = 0
> E(r) = min_{a ∈ A(r)} { c(r,a) + pₐ·E(r+1) + (1 − pₐ)·E(φ̃(r,a)) },   r < N
> φ̃(r,a) = φ(r,a) se φ(r,a) ≠ ⊥, e 0 caso contrário
> ```
>
> existe uma política estacionária determinística ótima (basta olhar para essa classe), a
> iteração de valor converge a partir de qualquer inicialização, e a iteração de política
> converge em um número finito de passos.

É esta equação que `valorDaAcao()` implementa termo a termo. Note que o `argmin` é o objeto que a
interface chama de **estratégia**: uma escolha de minério por nível de refino, e não uma receita
fixa.

---

## 3. Avaliação exata de uma política, e a contagem de recursos

### 3.1 O sistema linear

Fixada `π`, seja `P ∈ ℝ^{n×n}` a matriz de transição **restrita aos estados transitórios**
`{L, …, N−1}` (com `n = N − L`), e `m ∈ ℝⁿ` o vetor de custos imediatos `mᵢ = c(L+i, π(L+i))`. A
linha `i` de `P` tem `pₐ` na coluna `i+1` (ausente quando `i+1 = n`, pois `N` é absorvente e vale
0) e `1 − pₐ` na coluna de `φ̃`.

> **Proposição 3.1.** `P` é substocástica com `ρ(P) < 1`; `I − P` é uma M-matriz não singular; e
>
> ```
> (I − P)⁻¹ = Σ_{t ≥ 0} Pᵗ = N_π ≥ 0
> ```
>
> onde `N_π(s, s')` é o **número esperado de visitas** a `s'` antes da absorção, partindo de `s` —
> a *matriz fundamental* da cadeia absorvente, no sentido de Kemeny & Snell [4].
>
> *Demonstração.* Pela Proposição 2.2 a absorção é q.c. a partir de todo estado, logo `Pᵗ → 0` e
> `ρ(P) < 1`; a série de Neumann converge e vale a identidade. A interpretação das entradas de
> `N_π` é a contagem clássica de visitas [4, cap. III]. `I − P` tem diagonal positiva, fora da
> diagonal entradas `≤ 0` e inversa não negativa: é uma
> [M-matriz](https://en.wikipedia.org/wiki/M-matrix) não singular. ∎

Assim, `E_π = N_π m`, ou seja: **resolver `(I − P) E = m`** — exatamente o que `avaliarPolitica()`
faz, via a fatoração LU de [src/engine/linear.ts](../src/engine/linear.ts).

### 3.2 A mesma fatoração conta materiais

> **Teorema 3.2 (recompensas acumuladas).** Para qualquer `f: S∖{N} → ℝ`, o total acumulado
> esperado até a absorção é
>
> ```
> 𝔼_π[ Σ_{t < T} f(s_t) | s₀ = s ] = (N_π f)(s) = solução de (I − P) x = f
> ```
>
> *Demonstração.* `Σ_{t<T} f(s_t) = Σ_{s'} f(s') · (visitas a s')`; tome esperança e use a
> Proposição 3.1. A troca de soma e esperança é lícita por Tonelli quando `f ≥ 0`, e por dominação
> (`𝔼[T] < ∞`, `f` limitada num espaço de estados finito) no caso geral. ∎

**Consequência prática:** trocar o lado direito, e só ele, muda a grandeza contada. A matriz é a
mesma, então o LU é fatorado **uma vez** por avaliação e reaproveitado. As contagens que o motor
extrai:

| Lado direito `f(r)` | Grandeza |
| --- | --- |
| `c(r, π(r)) + 1{quebra}·(1−p)·V₀` | custo esperado em zeny (`custoEsperado`) |
| `1` | tentativas de refino esperadas (`tentativas`) |
| `1{φ = ⊥}·(1 − p)` | itens-base destruídos esperados (`itensQuebrados`) |
| `τ(k, π(r))` | zeny esperado só em taxa (`taxas`) |
| `1{minério de π(r) = i} + 1{i = Bênção}·b` | unidades esperadas do material `i` |

É daí que sai "380 Eterium e 2,3 cópias do item" **sem sortear nada** — e é por isso que os
números de material da tela continuam existindo mesmo quando a simulação não roda
([§8.5](#85-quando-a-simulação-não-roda)).

Note também a identidade que amarra duas linhas da tabela:

```
‖N_π‖∞ = ‖N_π 1‖∞ = max_s 𝔼_π[T | s₀ = s]
```

(a norma-∞ de uma matriz não negativa é atingida no vetor `1`). O condicionamento do sistema é,
literalmente, o número esperado de tentativas — fato que reaparece em
[§4.3](#43-a-tolerância-de-1e-6) e [§10.2](#102-estabilidade-do-lu).

---

## 4. Iteração de política

### 4.1 O algoritmo

`solveRefine()` implementa a iteração de política de Howard [5] na forma padrão para SSP [1, 2]:

```
π₀(r) ← ação de menor custo imediato em A(r)          (chute inicial, sempre próprio por 2.2)
repita:
    E   ← solução de (I − P_{πₖ}) E = m_{πₖ}          (avaliação EXATA)
    πₖ₊₁(r) ← argmin_{a ∈ A(r)} Q(r, a; E)            (melhoria)
    pare quando nenhum estado mudar
```

com `Q(r,a;E) = c(r,a) + pₐ E(r+1) + (1−pₐ) E(φ̃(r,a))`.

> **Proposição 4.1 (terminação finita).** A sequência `E_{π₀} ≥ E_{π₁} ≥ …` é monótona não
> crescente componente a componente, e o algoritmo termina em no máximo `Πᵣ |A(r)|` iterações.
>
> *Esboço.* Monotonia é o argumento clássico de melhoria de política: se
> `Q(r, πₖ₊₁(r); E_{πₖ}) ≤ E_{πₖ}(r)` para todo `r`, então
> `E_{πₖ} ≥ c_{πₖ₊₁} + P_{πₖ₊₁} E_{πₖ}`; iterando essa desigualdade com `P_{πₖ₊₁} ≥ 0` e usando a
> Proposição 3.1 obtém-se `E_{πₖ} ≥ N_{πₖ₊₁} c_{πₖ₊₁} = E_{πₖ₊₁}`. Como o conjunto de políticas
> estacionárias é finito e nenhuma se repete sem que o laço pare, o algoritmo termina. Ver
> [2, vol. II, §3.4] ou [3, §8.6]. ∎

O `MAX_ITER = 200` do código não é o limite teórico: é só uma trava contra dois empates
alternando para sempre em aritmética finita.

### 4.2 Por que não iteração de valor

A iteração de valor converge linearmente, com fator assintótico `ρ(P_{π*})`. Medindo nos casos
reais (preços padrão, `w4`, `V₀ = 10⁷`):

| Alvo | `ρ(P)` medido | `𝔼[T]` do +0 | Iterações de VI para erro relativo `10⁻⁶` |
| --- | --- | --- | --- |
| +12 | 0,920484 | 49,8 | ≈ 166 |
| +16 | 0,999616 | 2 665 | ≈ 3,6 × 10⁴ |
| +20 | ≈ 1 − 6 × 10⁻⁹ | 1,62 × 10⁸ | ≈ 2 × 10⁹ |

(a linha do +20 usa a aproximação `ρ ≈ 1 − 1/𝔼[T]`, sugerida por
[§3.2](#32-a-mesma-fatoração-conta-materiais): para o +16 ela dá 0,999625 contra 0,999616
medido.)

Com `n ≤ 20`, resolver o sistema exato custa `O(n³) ≈ 8 000` operações — menos que **uma**
iteração de valor bem feita, e sem erro de truncamento. Nos alvos altos, em que o custo esperado
passa de `10¹³` zeny, uma VI parada cedo devolve números plausíveis e errados por ordens de
grandeza; foi essa a razão histórica da troca, e o motivo de `linear.ts` existir.

### 4.3 A tolerância de `1e-6`

A melhoria só troca de ação quando o ganho excede `ε = 10⁻⁶` (evita ciclos por empate numérico).
Isso significa que a política devolvida pode não ser exatamente ótima. O erro é limitado:

> **Proposição 4.2.** Seja `π` a política devolvida e `E = E_π` seu valor exato. Se nenhuma ação
> melhora o valor em mais de `ε`, então
>
> ```
> 0 ≤ E − E* ≤ ε · N_{π*} 1 ,   isto é   ‖E − E*‖∞ ≤ ε · max_s 𝔼_{π*}[T | s]
> ```
>
> *Demonstração.* `E ≥ E*` por otimalidade. Pela condição de parada, `Q(r, a; E) ≥ E(r) − ε` para
> toda ação, em particular para `a = π*(r)`: `E ≤ c_{π*} + P_{π*}E + ε1`. Subtraindo
> `E* = c_{π*} + P_{π*}E*`: `(I − P_{π*})(E − E*) ≤ ε1`. Multiplicando por
> `N_{π*} = (I − P_{π*})⁻¹ ≥ 0`, que preserva desigualdades, chega-se ao resultado. ∎

Numericamente: no pior caso do motor (arma nv4 até o +20, `𝔼[T] ≈ 1,6 × 10⁸`) o limite é `≈ 162`
zeny sobre um custo de `1,1 × 10¹⁶` — erro relativo `10⁻¹⁴`, abaixo da própria resolução do
`float64` naquela ordem de grandeza ([§10.1](#101-alcance-do-float64)). No caso comum (+16,
`𝔼[T] ≈ 2,7 × 10³`) o limite é `2,7 × 10⁻³` zeny.

Na prática o laço converge muito antes do teto: medido com os preços padrão, **1 a 3 rodadas de
melhoria** bastam (`w4` +12 e +16: 1; `w5` +14: 3; `a2` +14: 1).

---

## 5. A restrição de segurança

Quando o equipamento é insubstituível (`perdaAceitavel = false`), quebrar deixa de ser um custo e
vira uma **restrição sobre as ações admissíveis**. Isso não se modela com um `V₀` muito grande:
qualquer valor finito ainda aceita a troca por um caminho suficientemente barato, e o número
escolhido decidiria a resposta.

### 5.1 O conjunto seguro

> **Definição 5.1.** `r < N` é **seguro** quando
>
> ```
> ∃ a ∈ A(r) :  φ(r,a) ≠ ⊥   e   ( φ(r,a) = r   ou   φ(r,a) é seguro )
> ```

A definição é bem fundada porque `φ(r,a) ≤ r` sempre: falhar nunca sobe o refino. Logo a recursão
em `r` estritamente decrescente termina, o menor e o maior ponto fixo coincidem, e uma **única
passada de baixo para cima** calcula o conjunto — é o laço de `pisoSeguro()`. O caso base `φ = r`
é a Bênção do Ferreiro, que segura o refino no lugar.

> **Definição 5.2 (piso).** `L = min { r : [r, N−1] ⊆ Seguro }`, com `L = N` quando `N−1` não é
> seguro (não há caminho seguro nenhum, e o alvo é recusado com essa explicação).

O piso é o começo do **trecho seguro contíguo que encosta no alvo**: um nível seguro isolado lá
embaixo não serve se, para chegar até ele, o item tiver que atravessar um beco.

> **Proposição 5.3 (fechamento).** Restringindo `S` a `[L, N]` e `A(r)` às ações com
> `φ(r,a) ≠ ⊥` e `φ(r,a) ≥ L` (função `acaoLegal()`), o sub-MDP é fechado: nenhuma trajetória sai
> de `[L, N]` nem destrói o item.
>
> *Demonstração.* Sucesso move para `r+1 ≤ N`; falha move para `φ ≥ L` por construção do filtro;
> e `⊥` foi eliminado. ∎

### 5.2 Suficiência, e onde a construção é conservadora

A Proposição 5.3 garante **segurança** (nenhum plano devolvido arrisca o item). Ela não garante,
por si só, **completude** — que todo alvo seguramente alcançável seja aceito. O ponto delicado: a
Definição 5.1 pode testemunhar a segurança de `r` com uma ação que cai *abaixo* de `L`, e essa
ação é depois eliminada por `acaoLegal()`. Isso só pode acontecer se o conjunto seguro **não for
um intervalo**.

Verificação sobre as tabelas efetivamente distribuídas — 9 categorias × {evento, sem evento} ×
{com, sem Bênção} × {com, sem minério especial} = **72 combinações**: em todas o conjunto seguro
é um intervalo, e a restrição não perde nada. Os padrões, com as opções padrão (Bênção e
minério especial liberados, sem evento) e bit `r` = "o refino `r` é seguro", do +0 ao +19:

```
w1, w2, w3, w4, a1     0000000 1111111111111    seguro do +7 para cima: a Bênção cobre
                                                +7..+13 e o Perfeito só derruba 1 nível
w5, a2                 11111111111111 000000    seguro até o +13, porque o Eteridecon desce
                                                3 e nunca quebra; do +14 para cima, todo
                                                minério da faixa pode destruir o item
shadowW, shadowA       00000000000000000000     nunca seguro: a Bênção não funciona em
                                                Sombrio e o Perfeito derruba para a faixa
                                                que quebra
```

Se uma tabela futura quebrar a propriedade de intervalo, o solucionador não devolve plano errado:
algum nível fica sem ação legal e `solveRefine()` lança `RefineImpossivel` com a explicação do
piso. A falha é **ruidosa**, não silenciosa — que é a propriedade que interessa.

Nos degraus de grau, a mesma restrição elimina o processo normal (que destrói o item na falha) e
deixa só o seguro; como nada é arriscado, `itensQuebrados = 0` e `copiasItem = 1`.

---

## 6. Os degraus de Grau

Só `w5` e `a2` têm Grau. Cada degrau `g → g'` (`solveGradeStep()`,
[src/engine/grade.ts](../src/engine/grade.ts)) é um problema de parada com três decisões
acopladas: **em que refino tentar** (`ρ`), **processo seguro ou normal**, e **quantos pontos
percentuais comprar com Bênção de Éter** (`j ∈ {0,…,10}`, a `bencaosPorPonto` bênçãos cada).

### 6.1 O custo esperado de um degrau

Fixadas as três decisões, a chance de cada tentativa é `p = min(1, base(ρ) + j/100)` e as
tentativas são Bernoulli i.i.d.

> **Proposição 6.1.** Seja `c` o custo de uma tentativa e `f` o custo esperado de uma falha (0 no
> processo seguro; `V₀ + E*(0 → ρ)` no normal, porque a falha destrói o item e é preciso comprar
> outro e refiná-lo de volta até `ρ`). Então o número de tentativas `M` é geométrico em
> `{1,2,…}` com parâmetro `p`, e
>
> ```
> 𝔼[M] = 1/p                     𝔼[custo do degrau] = ( c + (1 − p)·f ) / p
> ```
>
> *Demonstração.* Análise de primeiro passo: `X = c + (1−p)(f + X)`, cuja solução é a fórmula
> acima; `X < ∞` porque `p > 0`. A lei de `M` é a
> [geométrica](https://en.wikipedia.org/wiki/Geometric_distribution) padrão. ∎

Para os **recursos** (e não só o zeny), `agregarRecursos()` multiplica os recursos de uma
reconquista de refino pelo número esperado de falhas `𝔼[M] − 1`. Isso é a
[identidade de Wald](https://en.wikipedia.org/wiki/Wald%27s_equation) [6]: `M` é um tempo de
parada em relação à sequência de tentativas, os custos de reconquista `R₁, R₂, …` são i.i.d. e
independentes do futuro, logo `𝔼[Σᵢ₌₁^{M−1} Rᵢ] = 𝔼[M−1]·𝔼[R]`. Sem Wald, seria preciso conhecer
a distribuição conjunta de `M` e dos `Rᵢ`.

### 6.2 A busca é exaustiva, e por quê

O espaço de decisão é pequeno, mas só depois de um argumento de dominância.

> **Lema 6.2 (monotonia do preparo).** `ρ ↦ E*(0 → ρ)` é estritamente crescente.
>
> *Demonstração.* Um sucesso move o refino de `r` para `r+1` e nada nunca sobe mais que isso; logo
> toda trajetória que atinge `ρ+1` visita `ρ` antes. Pela propriedade forte de Markov, para
> qualquer política `π`, `𝔼_π[custo até ρ+1] = 𝔼_π[custo até ρ] + 𝔼_π[custo de ρ até ρ+1]`, e o
> segundo termo é `≥ min_a c(ρ,a) > 0` pela Proposição 2.1. Tomando o mínimo em `π`:
> `E*(0→ρ+1) ≥ E*(0→ρ) + min_a c(ρ,a) > E*(0→ρ)`. ∎

> **Corolário 6.3.** Entre dois refinos `ρ < ρ'` com a **mesma** chance de grau, `ρ` domina.
>
> *Demonstração.* A chance é igual, o sucesso zera o refino nos dois casos (mesma continuação), o
> preparo é estritamente mais barato em `ρ` (Lema 6.2) e, no processo normal, o custo da falha
> `V₀ + E*(0→ρ)` também. Toda parcela da fórmula da Proposição 6.1 é menor ou igual, com pelo
> menos uma estritamente menor. ∎

Logo `refinosCandidatos()` só testa **o menor refino de cada chance distinta** — e quem decide
onde cada degrau começa é a tabela, através dos `null`. O espaço de busca fica em
`|chances distintas| × 11 × 2` combinações por degrau, cada uma exigindo um `solveRefine` de
preparo. Como todo degrau depois do primeiro parte do +0 e todos avaliam os mesmos candidatos, um
cache `de→para` por campanha (`CacheRefino`) evita resolver a mesma cadeia dezenas de vezes.

Repare no que **não** foi assumido: a regra de bolso "sempre suba até o +11 antes de tentar o
grau" não está no código. Ela às vezes é falsa — quando o trecho +9→+11 é caro o bastante, tentar
o Grau D no +9 com 10% de chance sai mais barato — e é exatamente esse tipo de troca que o
Corolário 6.3 deixa o otimizador resolver sozinho.

---

## 7. Custo de aquisição: comprar ou fabricar

### 7.1 O ponto fixo min-plus

Seja `I` o conjunto de itens e, para cada item com receita de NPC, `z_i ≥ 0` o zeny de balcão e
`q_{ij} ∈ ℕ` a quantidade do insumo `j`. Com `mercado(i) = preço informado` se positivo e `+∞`
caso contrário, o custo unitário é o **menor ponto fixo** de

```
u(i) = min( mercado(i),  z_i + Σⱼ q_{ij} · u(j) )
```

no semianel tropical `([0,∞], min, +)`. A estrutura subjacente é um
[hipergrafo direcionado](https://en.wikipedia.org/wiki/Hypergraph) (cada receita é um B-arco:
vários insumos, um produto), e o problema é o de caminho mínimo em hipergrafo — resolvido em geral
pela generalização de Dijkstra devida a Knuth [7], ou pelos algoritmos de [8].

`unitCost()` ([src/engine/pricing.ts](../src/engine/pricing.ts)) faz uma **DFS memoizada**:

- Sobre um hipergrafo **acíclico**, isso é avaliação em ordem topológica: exata, e igual ao menor
  ponto fixo. É o caso dos dados de hoje (`Pó de Éter → Pedra de Éter → Aquamarina de Éter`,
  `Minério de Oridecon → Oridecon → Bradium → Bradium de Éter`, etc. — todos DAGs).
- Sobre um hipergrafo com ciclos, a marcação temporária `memo[i] = ∞` corta a recursão e devolve
  **um** ponto fixo, que é um limite superior do menor e cujo valor pode depender da ordem de
  visita. É uma trava contra dados novos mal formados, não um algoritmo de ciclo; se receitas
  cíclicas passarem a existir, o certo é trocar por [7].

`u(i) = ∞` significa "sem preço e sem receita": o motor descarta toda estratégia que dependeria do
item, em vez de inventar um preço.

### 7.2 Positividade

> **Proposição 7.1.** `u(i) > 0` sempre que `u(i) < ∞`.
>
> *Demonstração.* Por indução na profundidade da receita. Folhas: `u = mercado(i)`, finito só
> quando o preço informado é `> 0` (preço 0 é lido como "desconhecido" e vira `∞`). Passo: toda
> receita do catálogo tem `z_i > 0` ou pelo menos um insumo com `q_{ij} ≥ 1` — daí
> `z_i + Σ q_{ij}·u(j) > 0` pela hipótese de indução. ∎

Essa proposição é o que sustenta a Proposição 2.1, e portanto a positividade dos custos do MDP.
Ela é uma propriedade **dos dados**, não do código: uma receita futura com `z = 0` e lista de
insumos vazia a quebraria.

### 7.3 A lista de compras é a mesma decisão, desenrolada

O motor raciocina em minérios prontos ("380 Eterium"), mas ninguém compra Eterium: fabrica no NPC.
`listaDeCompras()` desmonta a conta seguindo **o mesmo `argmin`** (`sourcingOf()`), até chegar no
que se acha no mercado.

> **Proposição 7.2 (consistência).** Para qualquer cesta `x` de minérios prontos,
>
> ```
> Σ_linhas (qtd × preço de mercado)  +  zeny de balcão  =  Σᵢ xᵢ · u(i)
> ```
>
> *Demonstração.* Cada expansão substitui um termo `xᵢ·u(i)` cujo `argmin` foi a receita por
> `xᵢ·z_i + Σⱼ xᵢ·q_{ij}·u(j)`, que lhe é igual por definição do `argmin`; a recursão termina nas
> folhas, onde `u = mercado`. ∎

A igualdade não é decorativa: se a lista expandisse uma receita que o custo cotou como compra
pronta (ou vice-versa), o total mostrado não fecharia com o orçamento. O teste em
[tests/engine.test.ts](../tests/engine.test.ts) ("fecha com o custo unitário que o motor usa na
conta") ancora essa identidade. É também o que permite ao painel de estoque falar na mesma moeda
([§9](#9-a-pergunta-inversa-o-painel-de-estoque)).

---

## 8. Monte Carlo: o que a média não responde

### 8.1 O estimando

A álgebra de [§3](#3-avaliação-exata-de-uma-política-e-a-contagem-de-recursos) dá `𝔼[C]`, o custo
esperado. Mas a distribuição de `C` é fortemente assimétrica à direita, e a média não é o número
com que se planeja. Medido (arma nv4, preços padrão, `V₀ = 3 × 10⁷`, 200 000 execuções):

| Alvo | `𝔼[C]` exato | mediana `p50` | `p90` | `p99` | `P(C ≤ 𝔼[C])` |
| --- | --- | --- | --- | --- | --- |
| +10 | 1,558 × 10⁸ | 1,356 × 10⁸ | 2,761 × 10⁸ | 4,501 × 10⁸ | 57,5% |
| +12 | 9,465 × 10⁸ | 8,188 × 10⁸ | 1,678 × 10⁹ | 2,782 × 10⁹ | 59,2% |
| +14 | 2,612 × 10⁹ | 2,372 × 10⁹ | 4,292 × 10⁹ | 6,589 × 10⁹ | 58,0% |

Quem leva a média em caixa fica sem recursos em ~41% das campanhas, e o `p90` é ~1,8× a média. O
papel da simulação é **só** estimar esses quantis; toda quantidade média que a tela mostra vem da
álgebra.

### 8.2 O estimador de quantil

`simulateCampaign()` gera `n` execuções i.i.d. `C₁, …, Cₙ` sob a política ótima já fixada, e
`percentis()` devolve, para o nível `q`,

```
Q̂ₙ(q) = C₍⌈q·n⌉₎         (a ⌈qn⌉-ésima estatística de ordem)
```

Esse é o **inverso da função de distribuição empírica**, o *tipo 1* da taxonomia de Hyndman & Fan
[9] — sem interpolação. A escolha do `ceil` é deliberada: cortar em 0,9 devolve um número que
cobre **pelo menos** 90% das campanhas amostradas, nunca 89,98%.

**Consistência e taxa.** Pelo teorema de
[Glivenko–Cantelli](https://en.wikipedia.org/wiki/Glivenko%E2%80%93Cantelli_theorem),
`sup_x |F̂ₙ(x) − F(x)| → 0` q.c. A taxa é *distribution-free*, pela desigualdade
[DKW](https://en.wikipedia.org/wiki/Dvoretzky%E2%80%93Kiefer%E2%80%93Wolfowitz_inequality) [10]
com a constante ótima de Massart [11]:

```
P( sup_x |F̂ₙ(x) − F(x)| > ε ) ≤ 2 e^{−2nε²}
```

Com `n = 200 000` e `α = 5%`: `ε = √(ln(2/α)/(2n)) ≈ 0,0030`. Ou seja, o `p90` estimado é, com 95%
de confiança, um quantil verdadeiro de nível entre 89,7% e 90,3%. Invertendo a banda pela
monotonia de `F`, isso vira um intervalo de confiança para o próprio quantil.

A alternativa usual — normalidade assintótica via a representação de Bahadur [12, 13],
`√n(Q̂ₙ(q) − Q(q)) ⇒ 𝒩(0, q(1−q)/f(Q(q))²)` — **não se aplica limpo aqui**: `C` é uma soma de
parcelas discretas (preços fixos vezes contagens inteiras), sua distribuição é discreta e não tem
densidade `f`. O enunciado DKW é o correto neste caso.

**Erro da média amostral.** Medido nas mesmas campanhas, o desvio-padrão de `C` é da ordem da
própria média (`sd/𝔼[C] ≈ 0,58` no +10), o que dá `SE ≈ 0,13%` com 200 000 execuções. Os desvios
observados entre a média amostral e o valor exato — −0,09%, −0,19% e −0,27% nos três alvos —
ficam dentro de 2,1 erros padrão, e o sinal negativo sistemático é o comportamento esperado sob
assimetria à direita (a média amostral fica *abaixo* da média verdadeira mais da metade das
vezes, ainda que o estimador seja não viesado).

### 8.3 O gerador pseudoaleatório

`rng()` é o **mulberry32** [15]: estado de 32 bits, incremento ímpar `0x6d2b79f5` (uma sequência
de Weyl, portanto de período exatamente `2³² ≈ 4,29 × 10⁹` no estado) seguido de uma função de
mistura com `imul` e deslocamentos — a mesma família de ideias do SplitMix [16] e dos xorshift de
Marsaglia [17].

Três consequências, todas relevantes:

1. **Determinismo é requisito de interface, não descuido.** Semente fixa ⇒ a mesma entrada produz
   a mesma tela, sem números dançando a cada tecla digitada. O custo é que o erro de Monte Carlo
   vira um viés *sistemático daquela entrada*, e não um ruído que some ao reabrir a página.
2. **O período cobre o uso.** O orçamento máximo do passe preciso (3 s × 40 000 tentativas/ms) é
   `≈ 1,2 × 10⁸` sorteios, uma ordem e meia de grandeza abaixo de `2³²`.
3. **Estado de 32 bits tem limite conhecido.** Baterias como a BigCrush do TestU01 [18] consomem
   mais de `2³⁸` valores e portanto excedem o período — nenhum gerador com 32 bits de estado passa
   por elas, por construção. Isso é aceitável aqui porque o estimando é um punhado de quantis
   unidimensionais com `n ≤ 2 × 10⁵`, e não uma integral em dimensão alta sensível a
   equidistribuição.

### 8.4 Vieses conhecidos da amostragem

Dois cortes de segurança introduzem viés, e ambos são reportados no resultado:

- **Truncamento por execução.** Cada execução tem teto `maxTentativas` (20× a campanha esperada,
  mínimo 200 000). Uma execução cortada registra menos custo do que teria: o estimador vira
  `𝔼[C ∧ orçamento] ≤ 𝔼[C]`, viés **para baixo**. Por isso o resultado carrega `truncadas`, e o
  plano vira aviso quando esse número é maior que zero.
- **Parada por relógio.** O laço pode terminar antes do teto de execuções. A decisão de parar na
  execução `n` depende apenas de `C₁,…,C_{n−1}` (o relógio é conferido *antes* de rodar a
  execução), logo `N` é um tempo de parada e, por Wald [6], `𝔼[Σ_{i<N} Cᵢ] = 𝔼[N]·𝔼[C]`. A
  **média amostral** `Σ_{i<N} Cᵢ / N`, porém, é um estimador de razão, com viés `O(1/𝔼[N])` —
  desprezível para os `N ≥ 300` do motor, mas não exatamente zero. Vale saber que o corte por
  tempo é correlacionado com campanhas caras: execuções caras consomem mais relógio.

### 8.5 Quando a simulação não roda

Uma execução da campanha custa `𝔼[T]` tentativas. Se `𝔼[T] > orçamento / 300`, a simulação
simplesmente não acontece (`limiteSimulavel()`): com o +20 de uma arma nv4 exigindo `1,6 × 10⁸`
tentativas por execução, percentis truncados subestimariam o custo em ordens de grandeza e
enganariam mais que ajudariam. O custo exato continua sendo exibido — e o que ele diz, na
prática, é que o alvo é inalcançável.

O corte é **derivado** do orçamento (`orçamento = tempoMs × 40 000`), e não escolhido à parte:
como toda simulação roda pelo menos 300 execuções, um teto independente deixaria o pior caso
estourar o orçamento em silêncio.

### 8.6 O que o otimizador não otimiza

Registro importante de honestidade: a política é escolhida para minimizar `𝔼[C]` — critério
**neutro ao risco**. Os percentis que a simulação reporta são os percentis *dessa* política, e não
os de uma política que minimizasse o `p90` ou o
[CVaR](https://en.wikipedia.org/wiki/Expected_shortfall). Em geral

```
argmin_π 𝔼_π[C]  ≠  argmin_π Q_{0,9}(C_π)
```

e otimizar quantis (VaR) ou CVaR é um problema diferente, com técnicas próprias [14]. O motor não
faz isso; ele mede a dispersão da política que escolheu.

---

## 9. A pergunta inversa: o painel de estoque

### 9.1 Formalização

Cada execução simulada `i` produz um vetor de consumo `U^{(i)} ∈ ℝᵈ` (nos materiais **que se
compram**, já desmontados por `listaDeCompras()`), um número de quebras `Q^{(i)}` e um custo total
`C^{(i)}`. O estoque é `(z, x, e)`: zeny em caixa, vetor de materiais e cópias extras do
equipamento.

O **déficit** de uma campanha, dado o estoque, é

```
Z^{(i)}(x, e) = ( C^{(i)} − Σⱼ min(U_j^{(i)}, xⱼ)·pⱼ − min(Q^{(i)}, e)·V₀ )₊
```

e a resposta do painel é

```
chance(z, x, e) = P( Z(x, e) ≤ z )   estimada por   (1/n) Σᵢ 1{ Z^{(i)}(x,e) ≤ z }
```

com `n = 5 000` execuções guardadas cruas (`AmostrasCampanha`).

**Por que o abatimento fecha.** O custo registrado por execução é, por construção,
`C = Σⱼ Uⱼ·pⱼ + taxas + balcão + Q·V₀` — uma soma linear nos preços que o motor usou para cotar a
campanha. Logo o que já está na mochila é, ao pé da letra, o valor que deixa de sair do bolso.

**Por que comparar o total basta.** O gasto acumulado é não decrescente ao longo da campanha; se o
total cabe no caixa, todo prefixo cabe, e a recíproca é imediata. Não é atalho — é equivalência,
dada a hipótese de liquidez de [§9.4](#94-hipóteses-do-painel).

### 9.2 Por que os percentis marginais não respondem

Os cinco percentis por material são **marginais**. A pergunta do estoque é conjunta: faltar
Oridecon e faltar zeny na *mesma* campanha não é a soma dos dois azares.

Quantificando, no caso `w4` +0 → +12 com preços padrão (5 materiais, 5 000 campanhas guardadas):

```
P( todo material ≤ o seu próprio p90 ) = 72,7%      (e não 90%)
```

É por isso que a simulação guarda as **execuções inteiras** em vez de só os resumos: a
distribuição conjunta só existe nas execuções. Como elas são i.i.d., guardar as 5 000 primeiras é
uma amostra tão válida quanto qualquer outra.

**Precisão dessa amostra.** A chance é uma proporção binomial sobre `n = 5 000`: o erro padrão é
no máximo `1/(2√n) ≈ 0,71` ponto percentual, e um intervalo de 95% tem semilargura de no máximo
`≈ 1,4` p.p. (pela DKW, a banda simultânea sobre todos os níveis fica em `≈ 1,9` p.p.).

### 9.3 Os dois preenchimentos, e a monotonia que os sustenta

> **Proposição 9.1 (monotonia).** `Z^{(i)}(x, e)` é não crescente em cada componente de `x` e em
> `e`; portanto `chance(z, x, e)` é não decrescente em `z`, em `x` e em `e`.
>
> *Demonstração.* `t ↦ min(U, t)` é não decrescente, `pⱼ ≥ 0`, e `(·)₊` é não decrescente. ∎

Disso saem os dois botões do painel:

- **`estoqueMinimo`** fixa o material no piso observado (`minᵢ U^{(i)}`, a campanha mais sortuda) e
  resolve o zeny: `z = Q̂(chance alvo)` sobre a amostra `{Z^{(i)}}` *desse* estoque. Os dois
  números são um só — material no chão é orçamento no alto —, e por isso o zeny sai do veredito
  com o material já abatido, e não do custo cheio da campanha, que cobraria duas vezes pelo mesmo
  minério.
- **`materialParaChance`** fixa o caixa e resolve o material. Material é um vetor e a chance é um
  escalar, então há infinitas mochilas que dão 10%: a escolhida segue a proporção do consumo
  médio, `x(k)ⱼ = ⌈k · média(Uⱼ)⌉`. Pela Proposição 9.1, `k ↦ chance(z, x(k), e)` é uma função
  escada não decrescente, então o menor `k` que atinge o alvo sai por
  [bisseção](https://en.wikipedia.org/wiki/Bisection_method) em `[0, k_teto]`. Com 40 passos, o
  intervalo final tem largura `k_teto/2⁴⁰` — muito abaixo de uma unidade de qualquer material.

`k_teto = maxⱼ maxᵢ U_j^{(i)} / média(Uⱼ)` é o fator a partir do qual a cesta já cobre a campanha
mais gastadora de todas; acima dele, mais minério não muda nada. Daí sair de lá o **teto** do que
o caixa informado permite: quando `chance(z, x(k_teto), e) < alvo`, o que falta é zeny de taxa,
balcão de NPC ou cópia de reposição — e nenhum desses se paga com minério. O painel diz isso, em
vez de encher a tela de material e continuar devolvendo 0%.

**Otimismo dentro da amostra.** `k` é escolhido para atingir o alvo na *distribuição empírica*
fixa das 5 000 execuções guardadas. Como qualquer estimador escolhido por otimização sobre a mesma
amostra que o avalia, a chance realizada tende a ficar ligeiramente abaixo da nominal. Com uma
busca de um parâmetro só sobre uma família monótona, o efeito é da ordem do erro de amostragem de
[§9.2](#92-por-que-os-percentis-marginais-não-respondem), não maior.

### 9.4 Hipóteses do painel

1. **Liquidez a preço fixo.** O que faltar pode ser comprado, a qualquer momento, pelo preço
   informado. É a mesma hipótese do resto da calculadora, e é ela que torna o critério
   "total ≤ caixa" equivalente à sobrevivência passo a passo.
2. **Substituição linear.** Material sobrando não vale nada (não é revendido) e material faltando
   custa exatamente `pⱼ` por unidade. Daí o `min(U, x)` no abatimento.
3. **A política é a ótima do motor.** Uma pilha de Elunium parada não muda a estratégia escolhida;
   a resposta é a chance de atravessar *aquele* plano com estes recursos, não a chance sob a melhor
   estratégia condicionada ao estoque. Formalmente isto é uma restrição da classe de políticas, e
   portanto a chance reportada é um **limite inferior** da chance atingível por alguém que
   replanejasse conforme o estoque.

---

## 10. Aritmética de ponto flutuante e complexidade

### 10.1 Alcance do float64

Todos os cálculos usam `Float64Array`/`number`, isto é IEEE 754 binary64: 53 bits de significando,
unidade de arredondamento `u = 2⁻⁵³ ≈ 1,11 × 10⁻¹⁶`.

Os custos esperados chegam a `1,15 × 10¹⁶` zeny no pior alvo (`w4` +0→+20), acima de
`2⁵³ ≈ 9,01 × 10¹⁵`: naquela faixa o espaçamento entre floats consecutivos é 2 zeny, e nem todo
inteiro é representável. Isso é irrelevante na prática — o número em questão comunica
"inalcançável", não um orçamento —, mas é a fronteira onde a aritmética deixa de ser exata em
zenys inteiros. Abaixo de `10¹⁵` (todo alvo realmente jogável) inteiros são exatos.

### 10.2 Estabilidade do LU

`fatorarLU()` faz eliminação gaussiana com **pivotamento parcial**, o algoritmo padrão de
[19, §3.4] e [20, aula 21]. Ele é *backward stable* na prática: a solução calculada é a solução
exata de `(A + ΔA)x = b` com `‖ΔA‖ ≲ c(n)·ρ_growth·u·‖A‖`, e o erro relativo na solução é
governado por `κ(A)·u` [21, cap. 9].

A matriz aqui é especialmente bem comportada: `I − P` é fracamente diagonal dominante por linhas
(as linhas interiores empatam, e a última é estritamente dominante porque o sucesso dali sai do
sistema) e é uma M-matriz não singular (Proposição 3.1). Para matrizes diagonal dominantes o fator
de crescimento é limitado por 2 [21, cap. 9] — o pivotamento parcial aqui é rede de segurança, não
necessidade.

Números de condicionamento medidos (`κ∞ = ‖I−P‖∞ · ‖(I−P)⁻¹‖∞`, preços padrão, política ótima):

| Instância | `κ∞(I − P)` | erro relativo esperado `≈ κ·u` |
| --- | --- | --- |
| `w1` +0→+10 | 3,3 × 10¹ | 4 × 10⁻¹⁵ |
| `w4` +0→+12 | 1,0 × 10² | 1 × 10⁻¹⁴ |
| `w4` +0→+16 | 5,3 × 10³ | 6 × 10⁻¹³ |

Como `‖(I−P)⁻¹‖∞ = max_s 𝔼[T | s]` ([§3.2](#32-a-mesma-fatoração-conta-materiais)), o
condicionamento cresce **junto com a dificuldade do alvo** — é a mesma quantidade vista de outro
ângulo. Mesmo no pior alvo simulável, o erro numérico fica ordens de grandeza abaixo da incerteza
dos preços de entrada, que é a fonte de erro que realmente domina o resultado.

`resolverLU()` reaproveita a fatoração para vários lados direitos, o que é o ponto de
[§3.2](#32-a-mesma-fatoração-conta-materiais). Quando o pivô de uma coluna é zero, a fatoração é
marcada como singular e a substituição devolve `Infinity` em vez de `NaN` — o caso não deveria
ocorrer (Proposição 3.1), e a marcação existe para falhar de forma legível se ocorrer.

### 10.3 Complexidade

Com `n = N − L ≤ 20`, `|A|` ações por nível, `d` materiais distintos, `m` execuções e `t`
tentativas por execução:

| Etapa | Custo |
| --- | --- |
| `actionsAt` por nível | `O(|ORES|)` |
| Avaliação de política | `O(n³)` (LU) + `O((4 + d)·n²)` (substituições) |
| Iteração de política | `k · (n³ + n·|A|)`, com `k` medido entre 1 e 3 |
| Degrau de grau | `O(|candidatos| · 11 · 2)` avaliações, com preparo cacheado |
| Simulação | `O(m · t)`, limitado por `orçamento = tempoMs × 40 000` |
| Veredito de estoque | `O(m · d)` por consulta; `40 · O(m·d)` na bisseção |

A conversão de **tempo** em **trabalho** (`orcamentoDe`) é o que torna o resultado determinístico
entre máquinas: o mesmo alvo produz o mesmo número de execuções em qualquer computador, e o
relógio de dentro da simulação fica só como rede de segurança para máquinas mais lentas que a da
calibragem.

---

## 11. Hipóteses do modelo, e o que elas deixam de fora

Reunidas num lugar só, na ordem em que apareceram:

| # | Hipótese | Onde entra | Se for falsa |
| --- | --- | --- | --- |
| H1 | Tentativas são Bernoulli independentes, com a chance da tabela | §2.1 | Se o servidor usar *pity*/sequência, o MDP muda de forma |
| H2 | Chances, taxas e receitas das tabelas são as do servidor | §1.1 | Erro sistemático proporcional; ver [as fontes](dados.md#a-ordem-das-fontes) |
| H3 | Preços são fixos, exógenos e iguais na compra e na venda | §7, §9.4 | O custo vira um problema com duas fontes de risco |
| H4 | Liquidez ilimitada ao preço informado, a qualquer momento | §9.1 | "Total ≤ caixa" deixa de ser equivalente à sobrevivência |
| H5 | A reposição é sempre um item +0 ao preço `V₀` | §2.1 | Repor no refino corrente incentivaria quebrar de propósito |
| H6 | Critério neutro ao risco (minimizar `𝔼[C]`) | §2.3, §8.6 | Os percentis não são os da política que os minimizaria |
| H7 | Recursos só são consumidos, nunca obtidos jogando | todo o modelo | Farmar minério muda a moeda do problema |
| H8 | Tempo não tem valor (sem desconto entre tentativas) | §2.1 | O SSP com desconto daria outra política |
| H9 | Taxa do refinador de Equipamento Sombrio = 0 | `TAXA_REFINO` | Subestima o custo de Sombrios; valor não conferido in-game |
| H10 | Grau é possível a partir do +9 (tabelas), não do +11 (texto do Browiki) | `REFINO_MINIMO_GRAU` | Alguns planos de grau "cedo" seriam ilegais in-game |

Fora do modelo por decisão de escopo: cartas, encantamentos, Pergaminhos/Cubos/Martelos de Refino
(que pulam direto para um refino fixo) e qualquer valor de revenda do item refinado além de
`V₀ + custo do caminho`.

### 11.1 Verificação numérica

Os invariantes deste documento estão codificados em
[tests/engine.test.ts](../tests/engine.test.ts), entre eles:

- média exata × Monte Carlo dentro de 10%, na campanha completa com grau (§8.1–8.2);
- consumo material a material batendo com o cálculo exato, inclusive nas fases de grau
  (Teorema 3.2);
- monotonia do custo no alvo (Lema 6.2) e nas opções liberadas (evento, minérios especiais);
- `chance` do painel não decrescente quando o estoque cresce (Proposição 9.1);
- plano seguro nunca mais barato que o plano com risco, e nenhuma ação de quebra no plano seguro
  (§5);
- `listaDeCompras` fechando com `unitCost` (Proposição 7.2);
- teto de trabalho da simulação respeitando o orçamento (§8.5).

Os números medidos citados ao longo do texto (`ρ(P)`, `κ∞`, `𝔼[T]`, percentis, cobertura conjunta
de 72,7%) foram obtidos com os preços padrão de
[src/data/defaultPrices.ts](../src/data/defaultPrices.ts) e são reproduzíveis com
`npx vite-node scripts/demo.ts` mais as fórmulas desta página.

---

## 12. Referências

**Processos de decisão de Markov e caminho mínimo estocástico**

1. D. P. Bertsekas, J. N. Tsitsiklis. *An Analysis of Stochastic Shortest Path Problems*.
   Mathematics of Operations Research 16(3):580–595, 1991.
   <https://www.mit.edu/~jnt/Papers/J034-91-bert-ssp.pdf>
2. D. P. Bertsekas. *Dynamic Programming and Optimal Control*, vol. II, 4ª ed. Athena Scientific,
   2012. (SSP: cap. 3.)
3. M. L. Puterman. *Markov Decision Processes: Discrete Stochastic Dynamic Programming*. Wiley,
   1994. (Iteração de política: §8.6.)
   <https://en.wikipedia.org/wiki/Markov_decision_process>
4. J. G. Kemeny, J. L. Snell. *Finite Markov Chains*. Van Nostrand, 1960. (Matriz fundamental de
   cadeias absorventes: cap. III.) Resumo:
   <https://en.wikipedia.org/wiki/Absorbing_Markov_chain>
5. R. A. Howard. *Dynamic Programming and Markov Processes*. MIT Press, 1960.
6. A. Wald. *On Cumulative Sums of Random Variables*. Annals of Mathematical Statistics
   15(3):283–296, 1944. <https://en.wikipedia.org/wiki/Wald%27s_equation>

**Caminho mínimo em hipergrafos (comprar × fabricar)**

7. D. E. Knuth. *A Generalization of Dijkstra's Algorithm*. Information Processing Letters
   6(1):1–5, 1977.
8. G. Gallo, G. Longo, S. Pallottino, S. Nguyen. *Directed Hypergraphs and Applications*.
   Discrete Applied Mathematics 42(2–3):177–201, 1993.
   <https://en.wikipedia.org/wiki/Hypergraph>

**Estatística da simulação e risco**

9. R. J. Hyndman, Y. Fan. *Sample Quantiles in Statistical Packages*. The American Statistician
   50(4):361–365, 1996.
   <https://en.wikipedia.org/wiki/Quantile#Estimating_quantiles_from_a_sample>
10. A. Dvoretzky, J. Kiefer, J. Wolfowitz. *Asymptotic Minimax Character of the Sample
    Distribution Function and of the Classical Multinomial Estimator*. Annals of Mathematical
    Statistics 27(3):642–669, 1956.
11. P. Massart. *The Tight Constant in the Dvoretzky–Kiefer–Wolfowitz Inequality*. Annals of
    Probability 18(3):1269–1283, 1990.
    <https://en.wikipedia.org/wiki/Dvoretzky%E2%80%93Kiefer%E2%80%93Wolfowitz_inequality>
12. R. R. Bahadur. *A Note on Quantiles in Large Samples*. Annals of Mathematical Statistics
    37(3):577–580, 1966.
13. R. J. Serfling. *Approximation Theorems of Mathematical Statistics*. Wiley, 1980. (Quantis
    amostrais: §2.3–2.5.) Ver também A. B. Owen, *Monte Carlo theory, methods and examples*:
    <https://artowen.su.domains/mc/>
14. R. T. Rockafellar, S. Uryasev. *Optimization of Conditional Value-at-Risk*. Journal of Risk
    2(3):21–41, 2000. <https://en.wikipedia.org/wiki/Expected_shortfall>

**Geradores pseudoaleatórios**

15. bryc. *PRNGs in JavaScript* — descrição e código do `mulberry32` (autoria atribuída a Tommy
    Ettinger, 2017). <https://github.com/bryc/code/blob/master/jshash/PRNGs.md>
16. G. L. Steele Jr., D. Lea, C. H. Flood. *Fast Splittable Pseudorandom Number Generators*.
    OOPSLA 2014.
17. G. Marsaglia. *Xorshift RNGs*. Journal of Statistical Software 8(14), 2003.
18. P. L'Ecuyer, R. Simard. *TestU01: A C Library for Empirical Testing of Random Number
    Generators*. ACM TOMS 33(4), art. 22, 2007. <https://en.wikipedia.org/wiki/TestU01>

**Álgebra linear numérica**

19. G. H. Golub, C. F. Van Loan. *Matrix Computations*, 4ª ed. Johns Hopkins, 2013. (§3.4:
    eliminação gaussiana com pivotamento.) <https://en.wikipedia.org/wiki/LU_decomposition>
20. L. N. Trefethen, D. Bau III. *Numerical Linear Algebra*. SIAM, 1997. (Aulas 20–22.)
21. N. J. Higham. *Accuracy and Stability of Numerical Algorithms*, 2ª ed. SIAM, 2002. (Cap. 9:
    estabilidade da eliminação gaussiana e fator de crescimento.) Ver também
    <https://en.wikipedia.org/wiki/M-matrix>

**Fontes dos dados do jogo** (chances, receitas, taxas) estão documentadas em
[Os dados](dados.md): Browiki, Divine Pride e iROwiki.
