import {
  useEffect,
  useId,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type PointerEvent as PointerEventReact,
  type ReactNode,
} from 'react';

/*
  Peças da interface, no vocabulário do Material Design 3.

  O que o Material acrescenta aqui não é aparência: é que superfície, elevação,
  camada de estado e forma passam a ser decididas UMA vez, no componente, em vez
  de a cada `className` copiado de outra tela. Antes o mesmo botão existia em
  quatro tamanhos e três cores, e um `<select>` focado ficava diferente de um
  `<input>` focado. Os tokens estão em `index.css`.
*/

/* ────────────────────────────────────────────────────────── ondulação (ripple) */

/**
 * A ondulação do Material: o círculo que nasce onde o dedo tocou.
 *
 * Ela é montada em DOM cru, e não em estado do React, porque é pura
 * consequência do gesto — nada na tela depende de saber que ela existe, e
 * re-renderizar um botão inteiro a cada clique só para animar um círculo seria
 * pagar caro por nada.
 *
 * O `host` é um `<span>` vazio que o React renderiza e nunca mais toca: é ele
 * que recebe os círculos. Anexá-los direto no botão colocaria nós estranhos no
 * meio de filhos que o React administra.
 */
function useOndulacao() {
  const host = useRef<HTMLSpanElement>(null);

  const ondular = (ev: PointerEventReact<HTMLElement>) => {
    const caixa = host.current;
    if (!caixa) return;
    const r = caixa.getBoundingClientRect();
    // Dobro da maior dimensão: garante que o círculo cubra o alvo inteiro
    // mesmo quando o toque cai num canto.
    const lado = Math.max(r.width, r.height) * 2;
    const onda = document.createElement('span');
    onda.className = 'ondulacao';
    onda.style.width = `${lado}px`;
    onda.style.height = `${lado}px`;
    onda.style.left = `${ev.clientX - r.left - lado / 2}px`;
    onda.style.top = `${ev.clientY - r.top - lado / 2}px`;
    caixa.appendChild(onda);
    onda.addEventListener('animationend', () => onda.remove());
  };

  const Ondas = () => (
    <span
      ref={host}
      aria-hidden
      className="pointer-events-none absolute inset-0 overflow-hidden rounded-[inherit]"
    />
  );

  return { ondular, Ondas };
}

/* ─────────────────────────────────────────────────────────────────── ícones */

/** Ícone do botão informativo. Desenhado aqui para não pesar uma fonte inteira. */
function IconeInfo() {
  return (
    <svg viewBox="0 0 24 24" className="size-[1.15em]" fill="currentColor" aria-hidden>
      <path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Zm0 18a8 8 0 1 1 0-16 8 8 0 0 1 0 16Zm-1-12h2v2h-2V8Zm0 4h2v6h-2v-6Z" />
    </svg>
  );
}

/** Seta do `<select>` e dos painéis que abrem. Gira 180° quando aberto. */
function IconeSeta({ aberto }: { aberto?: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={
        'size-[1.15em] transition-transform duration-200 ease-padrao ' +
        (aberto ? 'rotate-180' : '')
      }
      fill="currentColor"
      aria-hidden
    >
      <path d="M7.4 8.6 12 13.2l4.6-4.6L18 10l-6 6-6-6 1.4-1.4Z" />
    </svg>
  );
}

/** O visto do botão segmentado selecionado, como no Material. */
function IconeVisto() {
  return (
    <svg viewBox="0 0 24 24" className="size-[1.1em] shrink-0" fill="currentColor" aria-hidden>
      <path d="M9 16.2 4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4L9 16.2Z" />
    </svg>
  );
}

/* ──────────────────────────────────────────────────────────────────── botões */

/**
 * Botão, nas quatro ênfases do Material.
 *
 * A ênfase não é gosto: ela diz o peso da ação. `preenchido` é a ação
 * principal de uma tela e só pode haver uma; `tonal` é a segunda mais
 * importante; `contornado` é alternativa legítima mas não recomendada; `texto`
 * é o que não deve competir com o conteúdo.
 */
export function Botao({
  variante = 'texto',
  tamanho = 'normal',
  iconeAoFim,
  children,
  className = '',
  ...props
}: {
  variante?: 'preenchido' | 'tonal' | 'contornado' | 'texto';
  tamanho?: 'normal' | 'pequeno';
  /** Ícone à direita do rótulo — a seta de um painel que abre, por exemplo. */
  iconeAoFim?: ReactNode;
  children: ReactNode;
} & ButtonHTMLAttributes<HTMLButtonElement>) {
  const { ondular, Ondas } = useOndulacao();

  const pele = {
    preenchido: 'bg-realce text-no-realce shadow-e1 hover:shadow-e2',
    tonal: 'bg-realce-container text-no-realce-container',
    contornado: 'border border-contorno text-realce',
    texto: 'text-realce',
  }[variante];

  // 40px de altura é o alvo de toque mínimo do Material; o pequeno vive em
  // cabeçalho de painel, onde 32px com folga lateral ainda passa dos 24px.
  const medida =
    tamanho === 'pequeno' ? 'h-8 px-3 text-xs gap-1.5' : 'h-10 px-5 md-corpo-m gap-2';

  return (
    <button
      type="button"
      onPointerDown={ondular}
      className={
        'estado inline-flex shrink-0 cursor-pointer items-center justify-center overflow-hidden ' +
        'rounded-full font-medium whitespace-nowrap transition-shadow duration-200 ease-padrao ' +
        'disabled:pointer-events-none disabled:opacity-40 ' +
        `${pele} ${medida} ${className}`
      }
      {...props}
    >
      <Ondas />
      {children}
      {iconeAoFim}
    </button>
  );
}

/**
 * Botão de canto de painel: o que abre, fecha ou preenche uma seção.
 *
 * É um botão de texto do Material, na medida pequena. Existia copiado em
 * quatro arquivos, com pequenas divergências de tamanho e cor. É discreto de
 * propósito — fica no cabeçalho, ao lado do título, e não deve competir com o
 * conteúdo do painel.
 */
export function BotaoDoPainel({
  children,
  onClick,
  aberto,
  discreto,
}: {
  children: ReactNode;
  onClick: () => void;
  /** Quando o botão controla uma seção que abre e fecha. */
  aberto?: boolean;
  /** Ação secundária ("zerar", "restaurar padrão"): sai do dourado. */
  discreto?: boolean;
}) {
  return (
    <Botao
      tamanho="pequeno"
      variante="texto"
      aria-expanded={aberto}
      onClick={onClick}
      className={discreto ? 'text-suave' : ''}
      iconeAoFim={aberto === undefined ? undefined : <IconeSeta aberto={aberto} />}
    >
      {children}
    </Botao>
  );
}

/**
 * Botão informativo: a explicação que só aparece para quem a pede.
 *
 * Este é o componente que enxugou a página. Antes, cada campo, cada número e
 * cada tabela carregavam embaixo um parágrafo cinza explicando de onde vinham —
 * texto correto, escrito para ser lido UMA vez, que depois disso só afastava os
 * números uns dos outros. Nada foi apagado: o que era parágrafo virou o
 * conteúdo deste botão, a um clique de distância e ancorado exatamente no que
 * explica.
 *
 * O conteúdo fica no documento mesmo fechado, escondido pelo atributo `hidden`.
 * É de graça (é texto), e é o que mantém a explicação encontrável pelo Ctrl+F
 * do navegador e pela busca de quem chega pelo Google.
 *
 * ATENÇÃO ao onde: o balão é posicionado em relação ao botão, e por isso um
 * ancestral com `overflow-x-auto` — toda tabela larga desta página tem um — o
 * recorta na borda da rolagem, deixando um retângulo cortado no lugar da
 * explicação. Explicar uma coluna, então, é explicar a seção: o botão sobe para
 * o `TituloDeSecao` acima da tabela, fora do trecho que rola.
 */
export function Info({
  titulo,
  alinhar = 'esquerda',
  children,
}: {
  /** O que está sendo explicado. Vira o cabeçalho do balão e o nome acessível. */
  titulo: string;
  /** `direita` quando o botão vive na borda direita e o balão sairia da tela. */
  alinhar?: 'esquerda' | 'direita';
  /** Só conteúdo em linha: o balão é um `<span>` e não pode conter parágrafos. */
  children: ReactNode;
}) {
  const [aberto, setAberto] = useState(false);
  const id = useId();
  const caixa = useRef<HTMLSpanElement>(null);

  // Um balão aberto se fecha com Esc ou com um clique em qualquer outro lugar —
  // as duas saídas que qualquer camada temporária do Material precisa ter.
  useEffect(() => {
    if (!aberto) return;
    const fora = (ev: PointerEvent) => {
      if (!caixa.current?.contains(ev.target as Node)) setAberto(false);
    };
    const tecla = (ev: KeyboardEvent) => {
      if (ev.key === 'Escape') setAberto(false);
    };
    document.addEventListener('pointerdown', fora);
    document.addEventListener('keydown', tecla);
    return () => {
      document.removeEventListener('pointerdown', fora);
      document.removeEventListener('keydown', tecla);
    };
  }, [aberto]);

  return (
    <span ref={caixa} className="relative inline-flex align-middle">
      <button
        type="button"
        aria-expanded={aberto}
        aria-controls={id}
        aria-label={`O que é: ${titulo}`}
        onClick={() => setAberto((a) => !a)}
        className={
          'estado inline-flex size-6 shrink-0 cursor-pointer items-center justify-center ' +
          'rounded-full text-base leading-none transition-colors duration-200 ease-padrao ' +
          (aberto ? 'text-realce' : 'text-suave/70 hover:text-realce')
        }
      >
        <IconeInfo />
      </button>

      <span
        id={id}
        role="note"
        hidden={!aberto}
        className={
          'md-corpo-p absolute top-full z-30 mt-2 w-72 max-w-[min(20rem,72vw)] rounded-xl ' +
          'border border-contorno bg-camada p-3 text-left font-normal tracking-normal ' +
          'normal-case text-suave shadow-e3 ' +
          (alinhar === 'direita' ? 'right-0' : 'left-0')
        }
      >
        <span className="md-titulo-m mb-1 block text-texto">{titulo}</span>
        {children}
      </span>
    </span>
  );
}

/* ─────────────────────────────────────────────────────── superfícies e cartões */

/**
 * Cartão do Material, na variante preenchida.
 *
 * A elevação vem do TOM da superfície, não da sombra — é assim que o Material
 * distingue camadas no escuro, onde uma sombra preta sobre fundo preto não
 * distingue nada. A sombra fica como reforço.
 */
export function Painel({
  titulo,
  aside,
  info,
  nivel = 'normal',
  children,
}: {
  titulo?: string;
  aside?: ReactNode;
  /** Explicação do painel inteiro, ao lado do título. */
  info?: ReactNode;
  /** `alto` para o que flutua sobre outro cartão. */
  nivel?: 'normal' | 'alto';
  children: ReactNode;
}) {
  return (
    <section
      className={
        'rounded-2xl p-4 shadow-e1 sm:p-5 ' +
        (nivel === 'alto' ? 'bg-superficie-alta' : 'bg-painel')
      }
    >
      {titulo && (
        <header className="mb-4 flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
          <h2 className="md-rotulo-p flex items-center gap-1 text-suave">
            {titulo}
            {info}
          </h2>
          {aside}
        </header>
      )}
      {children}
    </section>
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
  info,
  abreComo = 'fechado',
  children,
}: {
  titulo: string;
  /** Uma linha que responde o essencial sem precisar abrir. */
  resumo?: ReactNode;
  info?: ReactNode;
  abreComo?: 'aberto' | 'fechado';
  children: ReactNode;
}) {
  const [aberto, setAberto] = useState(abreComo === 'aberto');

  return (
    <Painel
      titulo={titulo}
      info={info}
      aside={
        <BotaoDoPainel aberto={aberto} onClick={() => setAberto((a) => !a)}>
          {aberto ? 'esconder' : 'ver detalhe'}
        </BotaoDoPainel>
      }
    >
      {aberto ? children : resumo ? <div className="md-corpo-m text-suave">{resumo}</div> : null}
    </Painel>
  );
}

/** Linha de separação entre blocos de um mesmo cartão. */
export function Divisor() {
  return <hr className="my-4 border-0 border-t border-borda" />;
}

/**
 * Cabeçalho de uma seção dentro de um cartão, com a explicação ao lado.
 *
 * Existe para que "título + botão de informação" tenha uma forma só: eram sete
 * lugares montando a mesma dupla à mão, e três deles já discordavam do tamanho.
 */
export function TituloDeSecao({
  children,
  info,
  aside,
}: {
  children: ReactNode;
  info?: ReactNode;
  aside?: ReactNode;
}) {
  return (
    <div className="mb-2 flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
      <h3 className="md-rotulo-p flex items-center gap-1 text-suave">
        {children}
        {info}
      </h3>
      {aside}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────── campos de entrada */

/**
 * Campo do Material, na variante contornada, com o rótulo acima.
 *
 * A `dica` deixou de ser um parágrafo permanente embaixo do campo e virou o
 * botão de informação ao lado do rótulo: ela é lida uma vez e depois só ocupa
 * espaço. O que precisa continuar à vista — um estado, um aviso do próprio
 * campo — entra em `apoio`, que é o "supporting text" do Material.
 */
export function Campo({
  label,
  dica,
  apoio,
  children,
}: {
  label: string;
  dica?: ReactNode;
  apoio?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="block">
      <div className="mb-1.5 flex items-center gap-1">
        <label className="md-corpo-m font-medium text-texto">{label}</label>
        {dica && <Info titulo={label}>{dica}</Info>}
      </div>
      {children}
      {apoio && <span className="md-corpo-p mt-1.5 block text-suave">{apoio}</span>}
    </div>
  );
}

/*
  Pele comum dos campos contornados. A borda engorda para 2px no foco em vez de
  ganhar um anel: é o que o Material faz, e é o que evita o campo "pular" um
  pixel quando recebe o cursor.
*/
const campoBase =
  'w-full rounded-lg border border-contorno bg-fundo px-3 py-2.5 text-texto outline-none ' +
  'transition-[border-color,box-shadow] duration-200 ease-padrao ' +
  'hover:border-texto focus:border-realce focus:shadow-[inset_0_0_0_1px_var(--color-realce)] ' +
  'disabled:pointer-events-none disabled:opacity-40';

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
    <div className="relative">
      <select
        className={campoBase + ' cursor-pointer appearance-none pr-9'}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
      >
        {children}
      </select>
      {/* A seta nativa some junto com o `appearance`, e sem ela o campo deixa
          de se anunciar como uma lista. Esta é a mesma do resto da interface. */}
      <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-suave">
        <IconeSeta />
      </span>
    </div>
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
      <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-sm text-suave">
        z
      </span>
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

/**
 * Interruptor do Material, num item de lista.
 *
 * Era uma caixa de seleção com um parágrafo de explicação embaixo, e as quatro
 * empilhadas ocupavam meia tela para dizer quatro sim-ou-não. O interruptor diz
 * ligado/desligado à distância — a pastilha anda, e o polegar cresce quando
 * liga —, e a explicação foi para o botão de informação ao lado do nome.
 */
export function Toggle({
  checked,
  onChange,
  label,
  dica,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  dica?: ReactNode;
}) {
  const { ondular, Ondas } = useOndulacao();

  return (
    <div className="flex items-center gap-2 rounded-lg py-1.5">
      <span className="md-corpo-m min-w-0 flex-1 font-medium">{label}</span>
      {dica && <Info titulo={label} alinhar="direita">{dica}</Info>}
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        onPointerDown={ondular}
        onClick={() => onChange(!checked)}
        className={
          'estado relative inline-flex h-8 w-[3.25rem] shrink-0 cursor-pointer items-center ' +
          'rounded-full border-2 transition-colors duration-200 ease-padrao ' +
          (checked ? 'border-realce bg-realce' : 'border-contorno bg-superficie-baixa')
        }
      >
        <Ondas />
        {/* O polegar cresce ao ligar: no Material o tamanho é parte do sinal,
            e não só a posição — quem não distingue as duas cores ainda vê. */}
        <span
          className={
            'pointer-events-none block rounded-full transition-all duration-200 ease-padrao ' +
            (checked
              ? 'ml-[1.375rem] size-6 bg-no-realce'
              : 'ml-1.5 size-4 bg-contorno')
          }
        />
      </button>
    </div>
  );
}

/**
 * Escolha entre poucas opções, sempre visíveis — o botão segmentado do
 * Material.
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
      className="inline-flex overflow-hidden rounded-full border border-contorno"
    >
      {opcoes.map((o, i) => {
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
              'estado inline-flex cursor-pointer items-center gap-1 px-3 py-1.5 text-xs ' +
              'font-medium transition-colors duration-200 ease-padrao ' +
              (i > 0 ? 'border-l border-contorno ' : '') +
              (ativo
                ? 'bg-realce-container text-no-realce-container'
                : 'text-suave hover:text-texto')
            }
          >
            {ativo && <IconeVisto />}
            {o.rotulo}
          </button>
        );
      })}
    </div>
  );
}

/**
 * Pastilha de apoio: um fato curto, com ícone opcional, que não é clicável.
 *
 * É o "assist chip" do Material sem a ação — serve para pendurar um dado ao
 * lado de outro (`5x Minério de Oridecon`, `+2 Bênção`) sem gastar uma linha
 * inteira de texto com ele.
 */
export function Pastilha({
  children,
  tom = 'neutro',
  titulo,
}: {
  children: ReactNode;
  tom?: 'neutro' | 'ok' | 'atencao' | 'perigo' | 'realce';
  titulo?: string;
}) {
  const pele = {
    neutro: 'bg-superficie-alta text-suave',
    ok: 'bg-ok-container text-no-ok-container',
    atencao: 'bg-atencao-container text-no-atencao-container',
    perigo: 'bg-perigo-container text-no-perigo-container',
    realce: 'bg-realce-container text-no-realce-container',
  }[tom];

  return (
    <span
      title={titulo}
      className={`inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs font-medium ${pele}`}
    >
      {children}
    </span>
  );
}
