import { useEffect, useState } from 'react';

import { dataBR } from '../format';
import { Botao, BotaoDoPainel, copiarTexto } from './ui';

/*
  As duas pontas do link de uma simulação: o botão de quem manda e o aviso de
  quem recebe. A codificação mora em `compartilhar.ts`.
*/

/**
 * No celular, a folha de compartilhamento do sistema; no computador, copiar.
 *
 * `navigator.share` existe também no Chrome e no Edge de desktop, mas lá ele
 * abre um painel do Windows que ninguém espera de um botão de site — e quem
 * está no computador quer o link na área de transferência para colar no
 * Discord. O ponteiro grosso é o que separa o dedo do mouse.
 */
function usaFolhaDoSistema(): boolean {
  return (
    typeof navigator.share === 'function' &&
    typeof matchMedia === 'function' &&
    matchMedia('(pointer: coarse)').matches
  );
}

/**
 * O botão "compartilhar", no canto do painel do orçamento.
 *
 * Fica ali, e não no cabeçalho da página, porque o que se compartilha é a
 * resposta: o botão aparece junto do número que a outra pessoa vai ver.
 *
 * `gerar` é assíncrono porque a compressão é (`CompressionStream`). O link é
 * montado no clique, e não a cada render: o estado muda a cada tecla, e
 * comprimir a pergunta inteira para um botão que quase ninguém aperta seria
 * trabalho jogado fora.
 */
export function BotaoCompartilhar({ gerar, texto }: { gerar: () => Promise<string>; texto: string }) {
  const [estado, setEstado] = useState<'parado' | 'copiado' | 'falhou'>('parado');

  useEffect(() => {
    if (estado === 'parado') return;
    const t = setTimeout(() => setEstado('parado'), 2400);
    return () => clearTimeout(t);
  }, [estado]);

  async function compartilhar() {
    const url = await gerar();
    if (usaFolhaDoSistema()) {
      try {
        await navigator.share({ title: 'Refinômetro', text: texto, url });
        return;
      } catch (err) {
        // Fechar a folha sem escolher nada não é falha: não há o que avisar.
        if (err instanceof DOMException && err.name === 'AbortError') return;
      }
    }
    if (await copiarTexto(url)) {
      setEstado('copiado');
    } else {
      // Sem área de transferência, o link precisa ao menos ficar à vista para
      // ser selecionado à mão — senão o clique simplesmente não deu em nada.
      setEstado('falhou');
      window.prompt('Copie o link da simulação:', url);
    }
  }

  return (
    <span aria-live="polite">
      <Botao
        tamanho="pequeno"
        variante="texto"
        onClick={() => void compartilhar()}
        iconeAoFim={<IconeCompartilhar copiado={estado === 'copiado'} />}
      >
        {{ parado: 'compartilhar', copiado: 'link copiado', falhou: 'copie o link' }[estado]}
      </Botao>
    </span>
  );
}

function IconeCompartilhar({ copiado }: { copiado: boolean }) {
  return (
    <svg viewBox="0 0 24 24" className="size-[1.15em] shrink-0" fill="currentColor" aria-hidden>
      {copiado ? (
        <path d="M9 16.2 4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4L9 16.2Z" />
      ) : (
        <path d="M18 16.1c-.8 0-1.4.3-2 .8l-7.1-4.2c.1-.2.1-.5.1-.7s0-.5-.1-.7L16 7.2c.5.5 1.2.8 2 .8 1.7 0 3-1.3 3-3s-1.3-3-3-3-3 1.3-3 3c0 .2 0 .5.1.7L8 8.8C7.5 8.3 6.8 8 6 8c-1.7 0-3 1.3-3 3s1.3 3 3 3c.8 0 1.5-.3 2-.8l7.1 4.2c-.1.2-.1.4-.1.6 0 1.6 1.3 2.9 2.9 2.9s2.9-1.3 2.9-2.9-1.2-2.9-2.8-2.9Z" />
      )}
    </svg>
  );
}

/**
 * O aviso de quem abriu um link: a conta na tela não é a sua, e os preços são
 * os de quem mandou.
 *
 * É o que impede o mal-entendido mais provável — achar que a cotação de hoje
 * deu aquele número, quando ela é a de outro dia, com os ajustes de outra
 * pessoa. Os preços chegam congelados de propósito (ver `compartilhar.ts`), e
 * por isso a saída para os de hoje fica a um clique, aqui mesmo.
 */
export function AvisoDeCompartilhada({
  cotacao,
  precosDiferentes,
  onUsarPrecosDeHoje,
  onFechar,
}: {
  /** Data da cotação de partida de quem compartilhou (ISO). */
  cotacao: string;
  /** Os preços na tela não são os de partida de hoje — senão o botão não teria o que trocar. */
  precosDiferentes: boolean;
  onUsarPrecosDeHoje: () => void;
  onFechar: () => void;
}) {
  return (
    <div className="md-corpo-m mb-4 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border border-realce/40 bg-painel p-3.5 text-texto shadow-e1">
      <p className="min-w-[14rem] flex-1">
        <strong>Simulação compartilhada.</strong> Os preços são os de quem a enviou, a partir da
        cotação de {dataBR(cotacao)} — por isso a conta dá o mesmo que essa pessoa viu.
      </p>
      <div className="ml-auto flex shrink-0 gap-1">
        {precosDiferentes && (
          <BotaoDoPainel onClick={onUsarPrecosDeHoje}>usar os preços de hoje</BotaoDoPainel>
        )}
        <BotaoDoPainel discreto onClick={onFechar}>
          ok
        </BotaoDoPainel>
      </div>
    </div>
  );
}
