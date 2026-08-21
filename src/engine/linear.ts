/**
 * Solucionador linear denso pequeno, por decomposição LU com pivotamento parcial.
 *
 * A cadeia de refino tem no máximo 20 estados, então resolver o sistema exato é
 * barato — e muito melhor que iterar até convergir: nos alvos altos (+16 em
 * diante) o custo esperado passa de 10^10 zeny e a iteração de valor precisaria
 * de centenas de milhares de passos, devolvendo números truncados que pareciam
 * plausíveis mas estavam errados.
 */

export interface LU {
  n: number;
  /** Matriz fatorada, L abaixo da diagonal e U na diagonal e acima. */
  m: Float64Array;
  /** Permutação de linhas aplicada pelo pivotamento. */
  piv: Int32Array;
  singular: boolean;
}

/** Fatora `a` (n x n, linha-maior). O conteúdo de `a` é consumido. */
export function fatorarLU(a: Float64Array, n: number): LU {
  const piv = new Int32Array(n);
  for (let i = 0; i < n; i++) piv[i] = i;
  let singular = false;

  for (let col = 0; col < n; col++) {
    // Pivotamento parcial: leva a maior magnitude da coluna para a diagonal.
    let melhor = col;
    let maior = Math.abs(a[col * n + col]!);
    for (let linha = col + 1; linha < n; linha++) {
      const v = Math.abs(a[linha * n + col]!);
      if (v > maior) {
        maior = v;
        melhor = linha;
      }
    }

    if (maior === 0) {
      singular = true;
      continue;
    }

    if (melhor !== col) {
      for (let k = 0; k < n; k++) {
        const t = a[col * n + k]!;
        a[col * n + k] = a[melhor * n + k]!;
        a[melhor * n + k] = t;
      }
      const t = piv[col]!;
      piv[col] = piv[melhor]!;
      piv[melhor] = t;
    }

    const diag = a[col * n + col]!;
    for (let linha = col + 1; linha < n; linha++) {
      const fator = a[linha * n + col]! / diag;
      a[linha * n + col] = fator;
      if (fator === 0) continue;
      for (let k = col + 1; k < n; k++) {
        a[linha * n + k] = a[linha * n + k]! - fator * a[col * n + k]!;
      }
    }
  }

  return { n, m: a, piv, singular };
}

/** Resolve A x = b para a fatoração já pronta. Vários `b` reaproveitam o mesmo LU. */
export function resolverLU(lu: LU, b: Float64Array): Float64Array {
  const { n, m, piv } = lu;
  const x = new Float64Array(n);

  // Aplica a permutação e faz a substituição para frente (L y = P b).
  for (let i = 0; i < n; i++) {
    let soma = b[piv[i]!]!;
    for (let j = 0; j < i; j++) soma -= m[i * n + j]! * x[j]!;
    x[i] = soma;
  }

  // Substituição para trás (U x = y).
  for (let i = n - 1; i >= 0; i--) {
    let soma = x[i]!;
    for (let j = i + 1; j < n; j++) soma -= m[i * n + j]! * x[j]!;
    const diag = m[i * n + i]!;
    x[i] = diag === 0 ? Infinity : soma / diag;
  }

  return x;
}
