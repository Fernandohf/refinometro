import {
  useEffect,
  useId,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type KeyboardEvent as KeyboardEventReact,
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
 * O conteúdo fica no documento mesmo fechado, escondido pelo atributo `hidden`
 * — na variante `until-found`, que é a que o Ctrl+F do navegador consegue abrir
 * (ver `useRevelavelPelaBusca`). Este comentário já disse que o `hidden` seco
 * bastava para isso; não basta, e enquanto bastou a explicação fechada era
 * invisível para quem a procurava pelo nome.
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
  largura = 'normal',
  contagem,
  children,
}: {
  /** O que está sendo explicado. Vira o cabeçalho do balão e o nome acessível. */
  titulo: string;
  /** `direita` quando o botão vive na borda direita e o balão sairia da tela. */
  alinhar?: 'esquerda' | 'direita';
  /**
   * `larga` para o balão que carrega uma lista, e não uma explicação. A medida
   * estreita é boa para três linhas de texto e péssima para seis notas: vira
   * uma coluna alta e fina que se lê pior do que o parágrafo que ela substituiu.
   */
  largura?: 'normal' | 'larga';
  /**
   * Quantas notas o balão carrega. Um ícone de ajuda promete explicação, não
   * conteúdo — sem o número ao lado, o que está aqui dentro não é procurado.
   */
  contagem?: number;
  /** Só conteúdo em linha: o balão é um `<span>` e não pode conter parágrafos. */
  children: ReactNode;
}) {
  const [aberto, setAberto] = useState(false);
  const id = useId();
  const caixa = useRef<HTMLSpanElement>(null);
  const balao = useRevelavelPelaBusca<HTMLSpanElement>(!aberto, () => setAberto(true));

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
        aria-label={
          contagem ? `${titulo}: ${contagem} notas` : `O que é: ${titulo}`
        }
        onClick={() => setAberto((a) => !a)}
        className={
          'estado inline-flex h-6 shrink-0 cursor-pointer items-center justify-center gap-0.5 ' +
          'rounded-full text-base leading-none transition-colors duration-200 ease-padrao ' +
          (contagem ? 'px-1 ' : 'w-6 ') +
          (aberto || contagem ? 'text-realce' : 'text-suave/70 hover:text-realce')
        }
      >
        <IconeInfo />
        {contagem ? <span className="md-rotulo-p tabular-nums">{contagem}</span> : null}
      </button>

      {/* Duas camadas, e a divisão entre elas não é gosto: `until-found` esconde
          o CONTEÚDO do elemento, não o elemento. Com a pintura aqui fora, o
          balão fechado aparecia como uma pílula vazia — borda, fundo e sombra
          sem texto dentro. Fora fica só a posição; dentro, tudo que pinta. */}
      <span
        ref={balao}
        id={id}
        role="note"
        hidden={!aberto}
        className={
          'absolute top-full z-30 mt-2 ' +
          (largura === 'larga' ? 'w-96 max-w-[min(26rem,82vw)] ' : 'w-72 max-w-[min(20rem,72vw)] ') +
          (alinhar === 'direita' ? 'right-0' : 'left-0')
        }
      >
        <span
          className={
            'md-corpo-p block rounded-xl border border-contorno bg-camada p-3 text-left ' +
            'font-normal tracking-normal normal-case text-suave shadow-e3'
          }
        >
          <span className="md-titulo-m mb-1 block text-texto">{titulo}</span>
          {children}
        </span>
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

/* ──────────────────────────────────────────────────── o que abre e o que fecha */

/**
 * `hidden`, mas na variante que a busca do navegador consegue abrir.
 *
 * `display:none` — o que o `hidden` seco faz — não é varrido pelo Ctrl+F nem
 * pelo buscador: todo texto guardado atrás de um botão desta interface some
 * para quem o procura pelo nome. `hidden="until-found"` esconde igual, mas
 * deixa o navegador achar o trecho, abrir sozinho e avisar por um evento
 * `beforematch`. É esse aviso que este hook devolve ao React — sem ele o
 * conteúdo apareceria com o botão ainda dizendo "fechado", e o clique seguinte
 * o fecharia de novo.
 *
 * O atributo precisa ser posto à mão porque o React serializa `hidden` como
 * atributo booleano: `hidden="until-found"` sai do render como `hidden=""`. Daí
 * o efeito rodar a cada mudança de estado — o React reescreve o atributo ao
 * reesconder, e a variante tem de ser reposta por cima.
 */
function useRevelavelPelaBusca<T extends HTMLElement>(escondido: boolean, revelar: () => void) {
  const alvo = useRef<T>(null);
  // A função vem nova a cada render; guardá-la num ref evita reassinar o
  // ouvinte à toa, sem obrigar quem chama a memorizá-la. Guardada DENTRO de um
  // efeito porque escrever num ref durante o render é o que o React proíbe.
  const aoAchar = useRef(revelar);
  useEffect(() => {
    aoAchar.current = revelar;
  });

  useEffect(() => {
    const el = alvo.current;
    if (!el) return;
    if (escondido) el.setAttribute('hidden', 'until-found');
    const achou = () => aoAchar.current();
    el.addEventListener('beforematch', achou);
    return () => el.removeEventListener('beforematch', achou);
  }, [escondido]);

  return alvo;
}

/* ────────────────────────────────────────────────────────────────────── abas */

/**
 * Abas do Material, na variante primária.
 *
 * O que uma aba resolve é altura, e só vale quando os grupos respondem a
 * perguntas DIFERENTES — senão ela não organiza, esconde. O preço é real e
 * vale dito: comparar dois painéis que ficaram em abas distintas passa a
 * exigir ir e voltar, e o que está fechado não sai numa impressão.
 *
 * O que não é preço é a busca do navegador: os painéis fechados continuam no
 * documento, escondidos por `until-found`, então o Ctrl+F acha o texto e abre
 * a aba certa sozinho (ver `useRevelavelPelaBusca`).
 */
export function Abas<T extends string>({
  value,
  onChange,
  abas,
  rotulo,
}: {
  value: T;
  onChange: (v: T) => void;
  abas: { key: T; rotulo: string; conteudo: ReactNode }[];
  /** Nome do conjunto para leitores de tela. */
  rotulo: string;
}) {
  const id = useId();
  const botoes = useRef<(HTMLButtonElement | null)[]>([]);

  // Um grupo de abas é UM ponto de tabulação: dentro dele quem anda é a seta,
  // e o Tab sai para o conteúdo. É o que a especificação de ARIA pede, e é o
  // que evita que um teclado precise atravessar três abas para chegar ao painel.
  const navegar = (ev: KeyboardEventReact<HTMLButtonElement>, i: number) => {
    const passo: Record<string, number | undefined> = {
      ArrowRight: 1,
      ArrowLeft: -1,
      Home: -i,
      End: abas.length - 1 - i,
    };
    const d = passo[ev.key];
    if (d === undefined) return;
    ev.preventDefault();
    const alvo = (i + d + abas.length) % abas.length;
    onChange(abas[alvo]!.key);
    botoes.current[alvo]?.focus();
  };

  return (
    <div>
      <div
        role="tablist"
        aria-label={rotulo}
        className="flex overflow-x-auto border-b border-borda"
      >
        {abas.map((a, i) => (
          <Aba
            key={a.key}
            id={`${id}-aba-${a.key}`}
            controla={`${id}-painel-${a.key}`}
            ativa={a.key === value}
            rotulo={a.rotulo}
            aoClicar={() => onChange(a.key)}
            aoTeclar={(ev) => navegar(ev, i)}
            refBotao={(el) => {
              botoes.current[i] = el;
            }}
          />
        ))}
      </div>

      {abas.map((a) => (
        <PainelDeAba
          key={a.key}
          id={`${id}-painel-${a.key}`}
          rotuladoPor={`${id}-aba-${a.key}`}
          escondido={a.key !== value}
          revelar={() => onChange(a.key)}
        >
          {a.conteudo}
        </PainelDeAba>
      ))}
    </div>
  );
}

function Aba({
  id,
  controla,
  ativa,
  rotulo,
  aoClicar,
  aoTeclar,
  refBotao,
}: {
  id: string;
  controla: string;
  ativa: boolean;
  rotulo: string;
  aoClicar: () => void;
  aoTeclar: (ev: KeyboardEventReact<HTMLButtonElement>) => void;
  refBotao: (el: HTMLButtonElement | null) => void;
}) {
  const { ondular, Ondas } = useOndulacao();

  return (
    <button
      ref={refBotao}
      type="button"
      role="tab"
      id={id}
      aria-selected={ativa}
      aria-controls={controla}
      tabIndex={ativa ? 0 : -1}
      onPointerDown={ondular}
      onClick={aoClicar}
      onKeyDown={aoTeclar}
      className={
        'estado relative flex flex-1 cursor-pointer items-end justify-center overflow-hidden ' +
        'transition-colors duration-200 ease-padrao ' +
        (ativa ? 'text-realce' : 'text-suave hover:text-texto')
      }
    >
      <Ondas />
      {/* A coluna existe para o indicador ter a largura do RÓTULO, e não a da
          aba: é o que separa a aba primária do Material da secundária, cujo
          traço atravessa a célula inteira. O alvo de toque continua sendo o
          botão todo — a coluna só mede. */}
      <span className="flex flex-col items-stretch">
        <span className="md-corpo-m px-4 pt-3 pb-2.5 text-center font-medium whitespace-nowrap">
          {rotulo}
        </span>
        {/* A barra existe sempre, transparente, para a aba não mudar de altura
            ao ser escolhida — e é o sinal que não depende de distinguir o
            dourado do cinza. */}
        <span
          aria-hidden
          className={
            'h-[3px] rounded-t-full transition-colors duration-200 ease-padrao ' +
            (ativa ? 'bg-realce' : 'bg-transparent')
          }
        />
      </span>
    </button>
  );
}

function PainelDeAba({
  id,
  rotuladoPor,
  escondido,
  revelar,
  children,
}: {
  id: string;
  rotuladoPor: string;
  escondido: boolean;
  revelar: () => void;
  children: ReactNode;
}) {
  const alvo = useRevelavelPelaBusca<HTMLDivElement>(escondido, revelar);

  return (
    <div ref={alvo} id={id} role="tabpanel" aria-labelledby={rotuladoPor} hidden={escondido}>
      {/* O respiro vai por DENTRO pelo mesmo motivo do balão: o elemento
          escondido por `until-found` continua ocupando o que for dele, e duas
          abas fechadas somavam dois respiros de nada no fim da página. */}
      <div className="pt-4">{children}</div>
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
