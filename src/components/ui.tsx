import {
  useEffect,
  useId,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type KeyboardEvent as KeyboardEventReact,
  type MouseEventHandler,
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

/**
 * Ícone do atalho para as perguntas frequentes.
 *
 * Traçado, e não preenchido como o `IconeInfo` ao lado: um "?" cheio de 15px
 * vira um borrão, e o que sobra dele é a bolinha. O círculo em volta é o que
 * faz o glifo ler como ícone em vez de pontuação perdida no meio do rótulo.
 */
export function IconePergunta() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="size-[1.15em] shrink-0"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      aria-hidden
    >
      <circle cx="12" cy="12" r="9" />
      <path strokeLinecap="round" d="M9.6 9.4a2.4 2.4 0 1 1 3.2 2.26c-.6.22-.9.72-.9 1.34v.9" />
      <circle cx="11.9" cy="16.3" r=".2" strokeWidth="1.9" />
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

/**
 * A caneca do Buy Me a Coffee, desenhada aqui.
 *
 * O botão oficial deles é um PNG servido do CDN da própria Buy Me a Coffee, e
 * usá-lo custaria a única requisição a terceiro da página inteira: o CDN
 * passaria a ver o IP de todo mundo que abre a calculadora, tendo clicado ou
 * não. Desenhada, ela entra no bundle, fica nítida em qualquer zoom e não
 * entrega visitante nenhum.
 *
 * Exportada porque ela aparece duas vezes: no botão amarelo do bloco de apoio
 * e no atalho do cabeçalho, que precisa da MESMA caneca — um ícone diferente
 * ali faria o atalho parecer levar a outro lugar.
 */
export function IconeCafe() {
  return (
    <svg viewBox="0 0 24 24" className="size-[1.25em] shrink-0" aria-hidden>
      {/* Corpo, alça e apoio da caneca. */}
      <path
        fill="currentColor"
        d="M4 9h12v6a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5V9Zm12 2h1.4a2.6 2.6 0 0 1 0 5.2H16v-2h1.4a.6.6 0 0 0 0-1.2H16V11ZM4 21.2h16v1.6H4v-1.6Z"
      />
      {/* Vapor. São dois fios finos, e são eles que fazem a caneca ler como
          café quente em vez de balde. */}
      <path
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        d="M8 1.4c-.9 1-.9 2 0 3s.9 2 0 3M12 1.4c-.9 1-.9 2 0 3s.9 2 0 3"
      />
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
 *
 * Com `href` ele vira uma âncora, e é a mesma pele: um botão que NAVEGA tem
 * que ser um `<a>` — é o que o teclado tabula, o que o leitor de tela anuncia
 * como link e o que o botão do meio do mouse abre em outra aba. Sai o
 * `disabled`, que não existe em link, e entram `target`/`rel`, que quem chama
 * decide, porque link para fora e âncora da mesma página não querem o mesmo.
 */
export function Botao({
  variante = 'texto',
  tamanho = 'normal',
  href,
  alvoExterno,
  iconeAoFim,
  onClick,
  children,
  className = '',
  ...props
}: {
  variante?: 'preenchido' | 'tonal' | 'contornado' | 'texto';
  tamanho?: 'normal' | 'pequeno';
  /** Presente, troca o `<button>` por um `<a>`. */
  href?: string;
  /** Só com `href`: abre em outra aba, sem entregar a página de origem. */
  alvoExterno?: boolean;
  /** Ícone à direita do rótulo — a seta de um painel que abre, por exemplo. */
  iconeAoFim?: ReactNode;
  /**
   * Alargado para `HTMLElement` porque o mesmo botão pode sair como `<a>`:
   * o tipo do `<button>` recusaria o manipulador da âncora, e o inverso
   * obrigaria todo chamador a dizer de que elemento é o clique dele.
   */
  onClick?: MouseEventHandler<HTMLElement>;
  children: ReactNode;
} & Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'onClick'>) {
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

  const classe =
    'estado inline-flex shrink-0 cursor-pointer items-center justify-center overflow-hidden ' +
    'rounded-full font-medium whitespace-nowrap transition-shadow duration-200 ease-padrao ' +
    'disabled:pointer-events-none disabled:opacity-40 ' +
    `${pele} ${medida} ${className}`;

  const dentro = (
    <>
      <Ondas />
      {children}
      {iconeAoFim}
    </>
  );

  if (href !== undefined) {
    return (
      <a
        href={href}
        onPointerDown={ondular}
        onClick={onClick}
        className={classe}
        {...(alvoExterno ? { target: '_blank', rel: 'noreferrer noopener' } : {})}
      >
        {dentro}
      </a>
    );
  }

  return (
    <button type="button" onPointerDown={ondular} onClick={onClick} className={classe} {...props}>
      {dentro}
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
 * O botão do Buy Me a Coffee.
 *
 * O amarelo e o preto são da marca, e por isso são os únicos valores de cor
 * fixos da interface — não saem de `index.css` e não viram token de propósito.
 * Um botão de marca que troca de cor com o tema deixa de ser reconhecível, e
 * ser reconhecível é a única coisa que ele tem a oferecer; por isso ele também
 * não escurece no tema escuro. O amarelo carrega texto preto nas duas peles,
 * então o contraste não depende do tema.
 *
 * O resto é o `Botao` preenchido: mesma altura, mesma forma, mesma ondulação,
 * mesma película de estado. Ele é um botão desta tela, não um enxerto colado no
 * rodapé.
 */
export function BotaoCafe({ href, children }: { href: string; children: ReactNode }) {
  const { ondular, Ondas } = useOndulacao();

  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer noopener"
      onPointerDown={ondular}
      className={
        'estado inline-flex h-10 shrink-0 cursor-pointer items-center justify-center gap-2 ' +
        'overflow-hidden rounded-full bg-[#FFDD00] px-5 text-black md-corpo-m font-medium ' +
        'whitespace-nowrap shadow-e1 transition-shadow duration-200 ease-padrao hover:shadow-e2'
      }
    >
      <Ondas />
      <IconeCafe />
      {children}
    </a>
  );
}

/**
 * O ícone do botão do Pix: uma prancheta que vira visto depois de copiar.
 *
 * NÃO é a marca do Pix. O losango do Banco Central é marca registrada, e
 * redesenhá-lo de memória produziria uma imitação torta ao lado de uma caneca
 * bem desenhada. O que o botão precisa dizer é o que ele FAZ — copiar —, e o
 * nome "Pix" já está escrito por extenso ao lado.
 */
function IconeCopia({ copiado }: { copiado: boolean }) {
  return (
    <svg viewBox="0 0 24 24" className="size-[1.15em] shrink-0" fill="currentColor" aria-hidden>
      {copiado ? (
        <path d="M9 16.2 4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4L9 16.2Z" />
      ) : (
        <path d="M15.5 1H4.5A1.5 1.5 0 0 0 3 2.5V17h2V3h10.5V1Zm4 4h-11A1.5 1.5 0 0 0 7 6.5v15A1.5 1.5 0 0 0 8.5 23h11a1.5 1.5 0 0 0 1.5-1.5v-15A1.5 1.5 0 0 0 19.5 5ZM19 21H9V7h10v14Z" />
      )}
    </svg>
  );
}

/**
 * Copia um texto para a área de transferência, com o plano B de sempre.
 *
 * `navigator.clipboard` é a via boa e a que existe em produção — o site é
 * servido por HTTPS. Ela não existe em contexto inseguro (um `http://` de rede
 * local, que é como alguém testa o build antes de publicar) e recusa em alguns
 * navegadores embutidos de aplicativo; nesses, o `<textarea>` fora da tela com
 * `execCommand` ainda funciona. Devolve se deu certo, porque o botão só pode
 * dizer "copiado" quando foi.
 */
async function copiarTexto(texto: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(texto);
    return true;
  } catch {
    try {
      const campo = document.createElement('textarea');
      campo.value = texto;
      // Fora da tela, mas não `display:none`: o que não é renderizado não pode
      // ser selecionado, e sem seleção não há o que copiar.
      campo.setAttribute('readonly', '');
      campo.style.cssText = 'position:fixed;top:-1000px;opacity:0';
      document.body.appendChild(campo);
      campo.select();
      const deu = document.execCommand('copy');
      campo.remove();
      return deu;
    } catch {
      return false;
    }
  }
}

/**
 * O botão que copia o código Pix.
 *
 * Copiar é a interação certa aqui, e não um QR: quem está no celular não tem
 * como fotografar a própria tela, e quem está no computador cola o código no
 * aplicativo do banco pelo "Pix Copia e Cola". Um QR desenhado exigiria um
 * codificador inteiro no bundle para servir só ao caso mais raro.
 *
 * O verde-água é a cor do Pix e fica fixo pelo mesmo motivo do amarelo do
 * `BotaoCafe`: é a única coisa que faz o botão ser reconhecido de relance. Vem
 * contornado, e não preenchido, porque o café é o pedido principal — dois
 * botões preenchidos lado a lado não têm principal nenhum.
 *
 * Quando a cópia falha, o rótulo diz que falhou em vez de mentir "copiado", e
 * o código continua à vista no bloco de apoio para ser selecionado à mão.
 */
export function BotaoPix({ codigo }: { codigo: string }) {
  const { ondular, Ondas } = useOndulacao();
  const [estado, setEstado] = useState<'parado' | 'copiado' | 'falhou'>('parado');

  // O aviso volta ao normal sozinho: um botão que fica "copiado" para sempre
  // não diz nada no segundo clique.
  useEffect(() => {
    if (estado === 'parado') return;
    const t = setTimeout(() => setEstado('parado'), 2400);
    return () => clearTimeout(t);
  }, [estado]);

  const rotulo = {
    parado: 'Copiar código Pix',
    copiado: 'Código Pix copiado',
    falhou: 'Copie o código abaixo',
  }[estado];

  return (
    <button
      type="button"
      onPointerDown={ondular}
      onClick={() => {
        void copiarTexto(codigo).then((deu) => setEstado(deu ? 'copiado' : 'falhou'));
      }}
      // A mudança de rótulo é a resposta ao clique, e leitor de tela precisa
      // ouvi-la: sem isto, o botão parece não ter feito nada.
      aria-live="polite"
      className={
        'estado inline-flex h-10 shrink-0 cursor-pointer items-center justify-center gap-2 ' +
        'overflow-hidden rounded-full border border-[#32BCAD] px-5 text-[#32BCAD] md-corpo-m ' +
        'font-medium whitespace-nowrap transition-shadow duration-200 ease-padrao'
      }
    >
      <Ondas />
      <IconeCopia copiado={estado === 'copiado'} />
      {rotulo}
    </button>
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

/*
  A mesma pele, em erro. É uma constante à parte, e não `campoBase` com um
  `border-perigo` acrescentado no fim: duas utilidades de cor de borda no mesmo
  elemento não se resolvem pela ordem em que aparecem no `className`, e sim pela
  ordem delas na folha gerada — o campo em erro perdia o vermelho justamente ao
  receber o foco, que é quando a pessoa está mexendo nele.
*/
const campoEmErro =
  'w-full rounded-lg border border-perigo bg-fundo px-3 py-2.5 text-perigo outline-none ' +
  'transition-[border-color,box-shadow] duration-200 ease-padrao ' +
  'hover:border-perigo focus:border-perigo focus:shadow-[inset_0_0_0_1px_var(--color-perigo)] ' +
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

/** Menos e mais dos passos: dois traços, para não pesar uma fonte de ícones. */
function IconePasso({ mais }: { mais?: boolean }) {
  return (
    <svg viewBox="0 0 24 24" className="size-[1.35em]" fill="currentColor" aria-hidden>
      <path d={mais ? 'M11 5h2v6h6v2h-6v6h-2v-6H5v-2h6V5Z' : 'M5 11h14v2H5v-2Z'} />
    </svg>
  );
}

/**
 * Um passo que se repete enquanto o botão estiver pressionado.
 *
 * Sem isso, ajustar 400 Elunium de dez em dez seriam quarenta cliques. A pausa
 * antes da repetição é o que preserva o clique único: quem quer +10 solta antes
 * dos 400ms e recebe exatamente um passo.
 *
 * O valor sai de uma função (e não do fecho) porque a repetição vive num timer:
 * ler `value` capturado no primeiro disparo faria todo o resto da rajada somar
 * sobre o mesmo número de partida.
 */
function useRepeticao(passo: () => void) {
  const timers = useRef<{ atraso?: number; ritmo?: number }>({});
  // O timer dispara o passo MAIS RECENTE, não o que existia quando o dedo
  // desceu. Sem esta indireção, toda a rajada somaria sobre o mesmo valor de
  // partida e o campo andaria uma única casa por mais que se segurasse.
  const atual = useRef(passo);
  atual.current = passo;

  const parar = () => {
    clearTimeout(timers.current.atraso);
    clearInterval(timers.current.ritmo);
    timers.current = {};
  };

  useEffect(() => parar, []);

  const comecar = () => {
    parar();
    atual.current();
    timers.current.atraso = window.setTimeout(() => {
      timers.current.ritmo = window.setInterval(() => atual.current(), 60);
    }, 400);
  };

  return { comecar, parar };
}

function BotaoDePasso({
  aoAcionar,
  mais,
  rotulo,
  desabilitado,
}: {
  aoAcionar: () => void;
  mais?: boolean;
  rotulo: string;
  desabilitado?: boolean;
}) {
  const { comecar, parar } = useRepeticao(aoAcionar);

  return (
    <button
      type="button"
      aria-label={rotulo}
      title={rotulo}
      disabled={desabilitado}
      className={
        'estado flex h-10 w-10 shrink-0 cursor-pointer items-center justify-center rounded-lg ' +
        'border border-contorno bg-fundo text-suave transition-colors duration-200 ease-padrao ' +
        'hover:border-texto hover:text-texto disabled:pointer-events-none disabled:opacity-30'
      }
      onPointerDown={(ev) => {
        // O ponteiro fica preso ao botão: arrastar o dedo um pixel para fora
        // não deve interromper uma rajada em andamento.
        ev.currentTarget.setPointerCapture(ev.pointerId);
        comecar();
      }}
      onPointerUp={parar}
      onPointerCancel={parar}
      onLostPointerCapture={parar}
      // O teclado não repete por conta própria aqui: `Enter` num `<button>` já
      // dispara `click`, e o `onPointerDown` não roda. Sem isto, o campo seria
      // inalcançável sem mouse.
      onKeyDown={(ev) => {
        if (ev.key === 'Enter' || ev.key === ' ') {
          ev.preventDefault();
          aoAcionar();
        }
      }}
    >
      <IconePasso mais={mais} />
    </button>
  );
}

/**
 * Quantidade discreta, com os dois botões de passo ao lado.
 *
 * Minério se conta em unidades, e a pessoa que abre o painel de estoque não
 * está digitando um número novo: está ajustando o que a tela já sugeriu, quase
 * sempre para baixo, algumas dezenas por vez. Por isso o passo não é 1 fixo — é
 * proporcional à ordem de grandeza do campo (ver `passoDe`), e o teclado
 * (setas para cima e para baixo) anda no mesmo passo.
 *
 * Abaixo de `minimo` o campo fica vermelho: não é um aviso de formatação, é a
 * campanha que deixou de ter caminho: nem a mais sortuda das simuladas fecha
 * com menos que aquilo.
 */
export function NumeroComPasso({
  value,
  onChange,
  passo,
  rotulo,
  minimo,
  sufixo,
  minimoDoCampo = 0,
}: {
  value: number;
  onChange: (v: number) => void;
  /** Quanto cada toque nos botões soma ou subtrai. */
  passo: number;
  /** Nome do campo para leitores de tela. */
  rotulo: string;
  /** Abaixo disto a campanha não tem caminho — o campo fica em vermelho. */
  minimo?: number;
  /** Unidade colada no fim do campo, como o `z` do zeny. */
  sufixo?: string;
  /** Piso absoluto do campo: 0 para material, 1 para as cópias do item. */
  minimoDoCampo?: number;
}) {
  const invalido = minimo !== undefined && value < minimo;
  const andar = (delta: number) =>
    onChange(Math.max(minimoDoCampo, Math.round(value + delta)));

  return (
    <div className="flex items-stretch gap-1.5">
      <BotaoDePasso
        aoAcionar={() => andar(-passo)}
        rotulo={`${rotulo}: menos ${passo.toLocaleString('pt-BR')}`}
        desabilitado={value <= minimoDoCampo}
      />
      <div className="relative min-w-0 flex-1">
        <input
          type="text"
          inputMode="numeric"
          aria-label={rotulo}
          aria-invalid={invalido}
          className={
            (invalido ? campoEmErro : campoBase) +
            ' text-right tabular-nums' +
            (sufixo ? ' pr-7' : '')
          }
          value={value === 0 ? '' : value.toLocaleString('pt-BR')}
          placeholder={String(minimoDoCampo)}
          onChange={(e) => {
            const digitos = e.target.value.replace(/\D/g, '');
            onChange(digitos === '' ? minimoDoCampo : Math.max(minimoDoCampo, Number(digitos)));
          }}
          onKeyDown={(e) => {
            if (e.key === 'ArrowUp') {
              e.preventDefault();
              andar(passo);
            } else if (e.key === 'ArrowDown') {
              e.preventDefault();
              andar(-passo);
            }
          }}
        />
        {sufixo && (
          <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-sm text-suave">
            {sufixo}
          </span>
        )}
      </div>
      <BotaoDePasso
        mais
        aoAcionar={() => andar(passo)}
        rotulo={`${rotulo}: mais ${passo.toLocaleString('pt-BR')}`}
      />
    </div>
  );
}

/**
 * Passo de um campo de contagem, pela ordem de grandeza do que ele guarda.
 *
 * Um passo fixo erra dos dois lados: 1 unidade é inútil num campo de 400
 * Elunium, e 50 é grosseiro demais num de 3 Bênçãos. Os cortes são potências
 * arredondadas — o passo é sempre um número que se conta de cabeça, e nunca
 * passa de ~5% do campo.
 */
export function passoDe(referencia: number): number {
  const n = Math.abs(referencia);
  if (n <= 20) return 1;
  if (n <= 100) return 5;
  if (n <= 500) return 10;
  if (n <= 2_000) return 50;
  if (n <= 10_000) return 100;
  return 1_000;
}

/**
 * O mesmo, em zeny: aqui a ordem de grandeza varia de milhões a bilhões, e um
 * passo tabelado não acompanha. O passo é a potência de dez uma casa abaixo do
 * valor — entre 1% e 10% dele, ou seja, dezenas de toques para atravessar o
 * campo inteiro —, com 100 mil de piso para não virar um passo de moeda.
 */
export function passoDeZeny(referencia: number): number {
  const n = Math.abs(referencia);
  if (n < 1_000_000) return 100_000;
  return Math.max(100_000, Math.pow(10, Math.floor(Math.log10(n)) - 1));
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
