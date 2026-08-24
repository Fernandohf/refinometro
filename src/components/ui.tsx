import { useState, type ReactNode } from 'react';

export function Painel({ titulo, aside, children }: { titulo?: string; aside?: ReactNode; children: ReactNode }) {
  return (
    <section className="rounded-xl border border-borda bg-painel/60 p-4 sm:p-5">
      {titulo && (
        <header className="mb-4 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-2">
          <h2 className="text-sm font-semibold tracking-wide text-suave uppercase">{titulo}</h2>
          {aside}
        </header>
      )}
      {children}
    </section>
  );
}

export function Campo({
  label,
  dica,
  children,
}: {
  label: string;
  dica?: string;
  children: ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-texto">{label}</span>
      {children}
      {dica && <span className="mt-1 block text-xs leading-snug text-suave">{dica}</span>}
    </label>
  );
}

const campoBase =
  'w-full rounded-lg border border-borda bg-fundo px-3 py-2 text-texto outline-none ' +
  'focus:border-realce focus:ring-1 focus:ring-realce disabled:opacity-40';

export function Select({
  value,
  onChange,
  children,
  disabled,
}: {
  value: string;
  onChange: (v: string) => void;
  children: ReactNode;
  disabled?: boolean;
}) {
  return (
    <select
      className={campoBase}
      value={value}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value)}
    >
      {children}
    </select>
  );
}

/**
 * Campo de zeny. Guarda o texto que a pessoa digitou enquanto ela digita, e só
 * formata com separador de milhar quando o campo perde o foco — formatar a cada
 * tecla faz o cursor pular.
 */
export function NumeroZeny({
  value,
  onChange,
  placeholder,
  disabled,
}: {
  value: number;
  onChange: (v: number) => void;
  placeholder?: string;
  disabled?: boolean;
}) {
  return (
    <div className="relative">
      <input
        type="text"
        inputMode="numeric"
        className={campoBase + ' pr-7 text-right tabular-nums'}
        value={value === 0 ? '' : value.toLocaleString('pt-BR')}
        placeholder={placeholder ?? '0'}
        disabled={disabled}
        onChange={(e) => {
          const digitos = e.target.value.replace(/\D/g, '');
          onChange(digitos === '' ? 0 : Number(digitos));
        }}
      />
      <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-sm text-suave">z</span>
    </div>
  );
}

/**
 * Campo de quantidade. Mesmo comportamento do de zeny — texto, separador de
 * milhar, só dígitos — sem o sufixo, porque aqui não se conta dinheiro.
 */
export function NumeroQtd({
  value,
  onChange,
  placeholder,
  rotulo,
}: {
  value: number;
  onChange: (v: number) => void;
  placeholder?: string;
  /** Nome do campo para leitores de tela, quando não há `<label>` visível. */
  rotulo?: string;
}) {
  return (
    <input
      type="text"
      inputMode="numeric"
      aria-label={rotulo}
      className={campoBase + ' text-right tabular-nums'}
      value={value === 0 ? '' : value.toLocaleString('pt-BR')}
      placeholder={placeholder ?? '0'}
      onChange={(e) => {
        const digitos = e.target.value.replace(/\D/g, '');
        onChange(digitos === '' ? 0 : Number(digitos));
      }}
    />
  );
}

export function Toggle({
  checked,
  onChange,
  label,
  dica,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  dica?: string;
}) {
  return (
    <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-borda bg-fundo/50 p-3 transition-colors hover:border-realce/50">
      <input
        type="checkbox"
        className="mt-0.5 size-4 shrink-0 accent-realce"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span>
        <span className="block text-sm font-medium">{label}</span>
        {dica && <span className="mt-0.5 block text-xs leading-snug text-suave">{dica}</span>}
      </span>
    </label>
  );
}

/**
 * Escolha entre poucas opções, sempre visíveis.
 *
 * Um `<select>` esconde as alternativas atrás de um clique — serve para listas
 * longas. Quando as opções são cinco e a escolha muda o número principal da
 * tela, deixá-las à mostra é o que permite comparar antes de escolher.
 */
export function Segmentado<T extends string>({
  value,
  onChange,
  opcoes,
  rotulo,
}: {
  value: T;
  onChange: (v: T) => void;
  opcoes: { key: T; rotulo: string; dica?: string }[];
  /** Nome do grupo para leitores de tela. */
  rotulo: string;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={rotulo}
      className="inline-flex flex-wrap gap-1 rounded-lg border border-borda bg-fundo/60 p-1"
    >
      {opcoes.map((o) => {
        const ativo = o.key === value;
        return (
          <button
            key={o.key}
            type="button"
            role="radio"
            aria-checked={ativo}
            title={o.dica}
            onClick={() => onChange(o.key)}
            className={
              'rounded-md px-2.5 py-1 text-xs font-medium transition-colors ' +
              (ativo
                ? 'bg-realce text-fundo'
                : 'text-suave hover:bg-painel hover:text-texto')
            }
          >
            {o.rotulo}
          </button>
        );
      })}
    </div>
  );
}

/**
 * Painel que abre e fecha, para detalhe que não precisa estar sempre na tela.
 *
 * O estado mora aqui porque é só aparência: nada do que está fechado deixa de
 * ser calculado, e reabrir não recalcula nada.
 */
export function PainelRecolhivel({
  titulo,
  resumo,
  abreComo = 'fechado',
  children,
}: {
  titulo: string;
  /** Uma linha que responde o essencial sem precisar abrir. */
  resumo?: ReactNode;
  abreComo?: 'aberto' | 'fechado';
  children: ReactNode;
}) {
  const [aberto, setAberto] = useState(abreComo === 'aberto');

  return (
    <Painel
      titulo={titulo}
      aside={
        <button
          type="button"
          className="text-xs text-realce hover:underline"
          aria-expanded={aberto}
          onClick={() => setAberto((a) => !a)}
        >
          {aberto ? 'esconder' : 'ver detalhe'}
        </button>
      }
    >
      {aberto ? children : resumo ? <div className="text-sm text-suave">{resumo}</div> : null}
    </Painel>
  );
}
