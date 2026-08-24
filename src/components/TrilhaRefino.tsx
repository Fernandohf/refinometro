/**
 * A trajetória do refino, do atual ao alvo, desenhada num traço.
 *
 * Os dois `<select>` dizem os números mas não dizem a única coisa que decide o
 * tamanho da conta: quantos degraus caem depois do limite seguro. Aqui isso é
 * visível antes de o orçamento aparecer — o trecho claro refina com 100% de
 * sucesso, o escuro é onde o item começa a falhar, cair de refino e quebrar.
 */
export function TrilhaRefino({
  atual,
  alvo,
  max,
  limite,
}: {
  atual: number;
  alvo: number;
  max: number;
  /** Último refino que ainda passa com 100% de sucesso. */
  limite: number;
}) {
  // Cada degrau é uma tentativa: o degrau `n` leva de +(n-1) para +n.
  const degraus = Array.from({ length: max }, (_, i) => i + 1);
  const noCaminho = (n: number) => n > atual && n <= alvo;
  const arriscados = degraus.filter((n) => noCaminho(n) && n > limite).length;
  const total = Math.max(0, alvo - atual);

  return (
    <div>
      <div className="flex gap-px" aria-hidden>
        {degraus.map((n) => (
          <div
            key={n}
            title={`+${n - 1} → +${n}`}
            className={
              'h-2 flex-1 first:rounded-l-full last:rounded-r-full ' +
              (!noCaminho(n)
                ? 'bg-borda/50'
                : n <= limite
                  ? 'bg-ok'
                  : 'bg-atencao')
            }
          />
        ))}
      </div>
      <p className="mt-1.5 text-xs leading-snug text-suave">
        {alvo < atual ? (
          <span className="text-perigo">
            O alvo está abaixo do refino atual — refino não desce.
          </span>
        ) : total === 0 ? (
          <>O item já está no alvo.</>
        ) : (
          <>
            <strong className="text-texto tabular-nums">
              +{atual} → +{alvo}
            </strong>{' '}
            — {total} {total === 1 ? 'tentativa bem-sucedida' : 'tentativas bem-sucedidas'} no
            mínimo.{' '}
            {arriscados === 0 ? (
              <span className="text-ok">Tudo dentro da faixa de 100% de sucesso (até +{limite}).</span>
            ) : (
              <span className="text-atencao">
                {arriscados} {arriscados === 1 ? 'degrau passa' : 'degraus passam'} do +{limite},
                onde a tentativa pode falhar.
              </span>
            )}
          </>
        )}
      </p>
    </div>
  );
}
