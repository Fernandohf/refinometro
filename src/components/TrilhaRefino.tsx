import type { RiscoDaFalha } from '../engine/refine';

/**
 * As marcas que a lista de refino alvo põe em cada opção.
 *
 * Moram aqui, junto da trilha, porque são a mesma frase dita de duas formas: a
 * caixa do `<select>` é estreita demais para uma explicação, então a opção
 * ganha só o símbolo e é a trilha logo abaixo que o traduz em palavras. Longe
 * um do outro, o símbolo ficaria sem legenda.
 */
export const MARCA_RISCO: Record<RiscoDaFalha, string> = {
  nenhuma: '',
  derruba: '↓',
  quebra: '⚠',
};

/** O refino alvo como a lista o escreve: `+3`, `+12 ↓`, `+10 ⚠`. */
export function rotuloDoAlvo(refino: number, risco: RiscoDaFalha): string {
  const marca = MARCA_RISCO[risco];
  return marca ? `+${refino} ${marca}` : `+${refino}`;
}

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
  risco,
}: {
  atual: number;
  alvo: number;
  max: number;
  /** Último refino que ainda passa com 100% de sucesso. */
  limite: number;
  /** O que uma falha pode fazer no caminho até o alvo escolhido. */
  risco: RiscoDaFalha;
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
              <>
                <span className="text-ok">
                  Tudo dentro da faixa de 100% de sucesso (até +{limite}).
                </span>{' '}
                {/* Nenhum degrau deste caminho falha, mas a lista de alvos está
                    cheia de marcas — é aqui que elas ganham legenda, senão o
                    símbolo aparece antes de significar alguma coisa. */}
                Na lista, {MARCA_RISCO.quebra} marca os alvos que não dá para alcançar sem
                arriscar o item, e {MARCA_RISCO.derruba} os que só derrubam o refino na falha.
              </>
            ) : (
              <>
                <span className="text-atencao">
                  {arriscados} {arriscados === 1 ? 'degrau passa' : 'degraus passam'} do +{limite},
                  onde a tentativa pode falhar.
                </span>{' '}
                {/* Falhar e falhar não são a mesma coisa: perder um refino
                    custa mais uma tentativa, perder o item custa o item inteiro
                    e todo o refino já pago. É a diferença entre os dois planos
                    possíveis, e a lista de alvos marca cada um com um símbolo. */}
                {risco === 'quebra' && (
                  <span className="text-perigo">
                    {MARCA_RISCO.quebra} Não há caminho até lá sem arriscar o equipamento: alguma
                    tentativa pode destruí-lo.
                  </span>
                )}
                {risco === 'derruba' && (
                  <span className="text-atencao">
                    {MARCA_RISCO.derruba} Dá para chegar lá sem nunca arriscar o equipamento — a
                    falha derruba o refino, mas o item sobrevive.
                  </span>
                )}
              </>
            )}
          </>
        )}
      </p>
    </div>
  );
}
