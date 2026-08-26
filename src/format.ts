// Alvos extremos chegam à casa dos quatrilhões de zeny, então a escala precisa
// ir bem além do "bi" — senão o número vira "32523 bi z" e ninguém lê.
const ESCALAS: [limite: number, sufixo: string, casas: number][] = [
  [1e15, ' qua z', 2],
  [1e12, ' tri z', 2],
  [1e9, ' bi z', 2],
  [1e6, ' mi z', 1],
];

/** Formata zeny de forma legível: 1.234.567z vira "1,2 mi z". */
export function zeny(n: number): string {
  if (!Number.isFinite(n)) return '—';
  const v = Math.round(n);
  for (const [limite, sufixo, casas] of ESCALAS) {
    if (Math.abs(v) >= limite) return (v / limite).toFixed(casas).replace('.', ',') + sufixo;
  }
  return v.toLocaleString('pt-BR') + 'z';
}

/** Zeny sem abreviar, para tooltips e para quem quer o número inteiro. */
export function zenyExato(n: number): string {
  return Math.round(n).toLocaleString('pt-BR') + 'z';
}

export function porcento(p: number, casas = 0): string {
  return (p * 100).toFixed(casas).replace('.', ',') + '%';
}

/** Quantidade de material: arredonda pra cima, porque não dá pra comprar meio minério. */
export function quantidade(n: number): string {
  if (n <= 0) return '0';
  if (n < 10) return n.toFixed(1).replace('.', ',');
  return Math.round(n).toLocaleString('pt-BR');
}

/** Data ISO ("2026-08-26") no formato de quem lê ("26/08/2026"). */
export function dataBR(iso: string): string {
  return iso.split('-').reverse().join('/');
}
