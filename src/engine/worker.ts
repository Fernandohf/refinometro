// Passe preciso do cálculo, fora da thread da página.
//
// A simulação boa custa segundos, e segundos de laço síncrono congelam a aba:
// o campo de preço para de aceitar tecla, o select não abre. Aqui ela roda num
// Worker, a página segue viva mostrando o resultado do passe rápido, e o
// resultado preciso entra no lugar quando fica pronto.
import { calcular, type CalcOptions, type Resultado } from './plan';
import type { CalcInput } from './types';

export interface PedidoSimulacao {
  /** Ecoado na resposta, para descartar respostas de entradas já superadas. */
  id: number;
  input: CalcInput;
  opcoes: CalcOptions;
}

export type RespostaSimulacao =
  | { id: number; ok: true; plano: Resultado }
  | { id: number; ok: false; erro: string };

const ctx = globalThis as unknown as {
  postMessage: (msg: RespostaSimulacao) => void;
  onmessage: ((ev: MessageEvent<PedidoSimulacao>) => void) | null;
};

ctx.onmessage = (ev) => {
  const { id, input, opcoes } = ev.data;
  try {
    ctx.postMessage({ id, ok: true, plano: calcular(input, opcoes) });
  } catch (err) {
    ctx.postMessage({ id, ok: false, erro: err instanceof Error ? err.message : String(err) });
  }
};
