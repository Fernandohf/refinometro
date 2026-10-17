import { useMemo, type ReactNode } from 'react';

import { nomeDoItem } from '../data/nomes';
import type { CampanhaEmMateriais } from '../engine/estoque';
import type { Resultado as ResultadoPlano } from '../engine/plan';
import { avaliarSorte, type Relato, type Sorte } from '../engine/sorte';
import { porcento, zeny, zenyExato } from '../format';
import { BotaoCompartilhar } from './Compartilhar';
import { CurvaDeCusto } from './CurvaDeCusto';
import { assinaturaDoPlano } from './Estoque';
import { SlotItem } from './ItemNoJogo';
import { MARGENS } from './Resultado';
import {
  BotaoDoPainel,
  Campo,
  Info,
  NumeroComPasso,
  Painel,
  Pastilha,
  passoDe,
  TituloDeSecao,
} from './ui';

/** O relato guardado, com a pergunta a que ele responde. */
export interface RelatoSalvo extends Relato {
  /**
   * O plano contra o qual o relato foi escrito (ver `assinaturaDoPlano`). Mudou
   * o item, o alvo ou a lista de minérios, o relato deixa de valer: "gastei 300
   * Eterium" não diz nada sobre outro alvo.
   */
  assinatura: string;
}

export const RELATO_VAZIO: RelatoSalvo = { itens: {}, quebras: 0, assinatura: '' };

const inteiro = (n: number) => Math.max(0, Math.round(n)).toLocaleString('pt-BR');

/**
 * "Já refinei": a pessoa conta quanto gastou e a tela diz quanta sorte ela teve.
 *
 * É a terceira leitura das mesmas campanhas simuladas — depois de "quanto
 * custa" e "dá com o que eu tenho?" — e por isso responde na hora, sem o
 * Worker rodar de novo. A conta está em `src/engine/sorte.ts`.
 */
export function JaRefinei({
  plano,
  campanha,
  relato,
  onChange,
  nomeDoAlvo,
  gerarLink,
}: {
  plano: ResultadoPlano;
  /** As campanhas em minério inteiro — a unidade que o jogador lembra. */
  campanha: CampanhaEmMateriais | null;
  relato: RelatoSalvo;
  onChange: (r: RelatoSalvo) => void;
  /** O item e o alvo numa linha, para a frase que acompanha o link. */
  nomeDoAlvo: string;
  gerarLink: (r: RelatoSalvo) => Promise<string>;
}) {
  const assinatura = assinaturaDoPlano(plano.input, 0, campanha?.materiais.map((m) => m.itemId) ?? []);
  // Derivado, como no estoque: relato de outra pergunta some sem precisar de
  // um efeito que o apague, e o primeiro quadro já sai certo.
  const efetivo: RelatoSalvo = relato.assinatura === assinatura ? relato : { ...RELATO_VAZIO, assinatura };
  const mexer = (mudanca: Partial<Relato>) => onChange({ ...efetivo, ...mudanca });

  const sorte = useMemo(
    () => (campanha ? avaliarSorte(campanha, plano.input.kind, efetivo) : null),
    [campanha, plano.input.kind, efetivo],
  );

  const sim = plano.simulacao;
  const n = campanha?.execucoes ?? 0;
  const podeQuebrar = !!campanha && campanha.quebrasOrdenado[n - 1]! > 0;
  const preenchido = efetivo.quebras > 0 || Object.values(efetivo.itens).some((q) => q > 0);
  const algumAbaixoDoPiso =
    !!campanha &&
    !!sorte &&
    sorte.porMaterial.some((l, col) => l.usado > 0 && l.usado < campanha.consumoOrdenado[col * n]!);

  return (
    <Painel
      titulo="Já refinei: quanta sorte eu tive?"
      info={
        <Info titulo="Quanta sorte eu tive?">
          Conte quanto gastou e a calculadora diz onde a sua campanha cai entre as{' '}
          {n.toLocaleString('pt-BR')} que ela simulou para este mesmo alvo. Não é outra simulação: são
          as mesmas campanhas do orçamento, lidas de outro jeito. A sua campanha vira zeny pelos
          mesmos preços do plano — minério, cópias destruídas e taxas — e a sorte é a fatia das
          simuladas que saiu mais cara que ela.
        </Info>
      }
      aside={
        preenchido ? (
          <BotaoDoPainel discreto onClick={() => onChange({ ...RELATO_VAZIO, assinatura })}>
            zerar
          </BotaoDoPainel>
        ) : undefined
      }
    >
      {!campanha || !sim ? (
        <p className="md-corpo-m text-suave">
          Este alvo é caro demais para simular, e sem campanhas simuladas não há com o que comparar a
          sua. Escolha um refino ou grau mais baixo.
        </p>
      ) : (
        <div className="space-y-5">
          <p className="md-corpo-m text-suave">
            Chegou ao alvo? Diga quanto gastou de cada minério
            {podeQuebrar ? ' e quantas vezes o item quebrou' : ''}. A taxa do refinador não precisa:
            ela sai do minério.
          </p>

          <div>
            <TituloDeSecao
              info={
                <Info titulo="O que você gastou">
                  Os minérios que passaram pelo refinador, como você os usou — Eterium, e não o Pó de
                  Éter que o fabricou. Só aparecem os que o plano usa. O{' '}
                  <strong className="text-texto">típico</strong> é o consumo da campanha do meio,
                  entre as simuladas.
                </Info>
              }
            >
              O que você gastou
            </TituloDeSecao>

            <div className="space-y-2">
              {campanha.materiais.map((m, col) => {
                const linha = sorte!.porMaterial[col]!;
                // A campanha mais sortuda das simuladas. Abaixo dela o número não
                // é sorte, é conta errada — ou um caminho que o plano não faz,
                // como o Grau seguro, que gasta 5 materiais por tentativa.
                const piso = campanha.consumoOrdenado[col * n]!;
                const abaixoDoPiso = linha.usado > 0 && linha.usado < piso;
                return (
                  <div key={m.itemId} className="flex flex-wrap items-center gap-x-3 gap-y-2">
                    <SlotItem id={m.itemId} tamanho="mini" />
                    <span className="min-w-[7rem] flex-1">
                      <span className="md-corpo-m block">{nomeDoItem(m.itemId)}</span>
                      <span className="md-corpo-p block text-suave">
                        típico: {inteiro(linha.tipico)}
                        {abaixoDoPiso ? (
                          <span className="text-perigo">
                            {' · '}a mais sortuda gastou {inteiro(piso)}
                          </span>
                        ) : linha.usado > 0 && (
                          <>
                            {' · '}
                            <SorteCurta p={linha.maisSorteQue} />
                          </>
                        )}
                      </span>
                    </span>
                    <div className="w-full shrink-0 sm:w-48">
                      <NumeroComPasso
                        rotulo={nomeDoItem(m.itemId)}
                        value={efetivo.itens[m.itemId] ?? 0}
                        onChange={(v) => mexer({ itens: { ...efetivo.itens, [m.itemId]: v } })}
                        passo={passoDe(linha.tipico || m.media)}
                        minimo={linha.usado > 0 ? piso : undefined}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {podeQuebrar && (
            <Campo
              label="Vezes que o item quebrou"
              dica="Cada quebra conta o preço de uma cópia nova no +0, o mesmo preço do item que está no painel de preços."
            >
              <div className="sm:w-48">
                <NumeroComPasso
                  rotulo="Vezes que o item quebrou"
                  value={efetivo.quebras}
                  onChange={(v) => mexer({ quebras: v })}
                  passo={1}
                />
              </div>
            </Campo>
          )}

          {!preenchido ? null : sorte!.faltando.length > 0 ? (
            <p className="md-corpo-m rounded-xl bg-superficie-baixa p-3.5 text-suave">
              Falta preencher{' '}
              <strong className="text-texto">{sorte!.faltando.map(nomeDoItem).join(', ')}</strong>:
              toda campanha simulada usou pelo menos um. Sem isso a conta sai barata demais e
              qualquer um parece sortudo.
            </p>
          ) : (
            <Veredito
              sorte={sorte!}
              plano={plano}
              execucoes={n}
              abaixoDoPiso={algumAbaixoDoPiso}
              compartilhar={
                <BotaoCompartilhar
                  destaque
                  rotulo="compartilhar meu resultado"
                  gerar={() => gerarLink(efetivo)}
                  texto={`Refinei ${nomeDoAlvo} e tive ${fraseDaSorte(sorte!.maisSorteQue, n).toLowerCase()}. Veja no Refinômetro:`}
                />
              }
            />
          )}

          <p className="md-corpo-p border-t border-borda pt-3 text-suave">
            A comparação assume que você seguiu o plano da calculadora: os mesmos minérios, a Bênção
            onde ela manda, a mesma ordem. Quem refinou de outro jeito mede aqui sorte e estratégia
            misturadas. A taxa é a que o minério informado cobra — cada um é uma tentativa, e cada
            tentativa paga a taxa dele.
          </p>
        </div>
      )}
    </Painel>
  );
}

function Veredito({
  sorte,
  plano,
  execucoes,
  abaixoDoPiso,
  compartilhar,
}: {
  sorte: Sorte;
  plano: ResultadoPlano;
  execucoes: number;
  /** Algum material ficou abaixo do que a campanha mais sortuda gastou. */
  abaixoDoPiso: boolean;
  compartilhar: ReactNode;
}) {
  const sim = plano.simulacao!;
  const p = sorte.maisSorteQue;
  const { rotulo, tom } = classe(p);

  return (
    <div className="rounded-xl border border-borda p-4" aria-live="polite">
      <Pastilha tom={tom}>{rotulo}</Pastilha>
      <p className="md-titulo-g mt-2 text-texto">{fraseDaSorte(p, execucoes)}.</p>
      <p className="md-corpo-m mt-2 text-suave">
        Você gastou{' '}
        <strong className="text-texto tabular-nums" title={zenyExato(sorte.total)}>
          {zeny(sorte.total)}
        </strong>
        : {zeny(sorte.materiais)} de minério
        {sorte.reposicoes > 0 ? `, ${zeny(sorte.reposicoes)} em cópias destruídas` : ''} e{' '}
        {zeny(sorte.taxas)} de taxa. A campanha típica deste alvo custa{' '}
        <strong className="text-texto tabular-nums" title={zenyExato(sorte.tipico)}>
          {zeny(sorte.tipico)}
        </strong>
        .
      </p>
      {abaixoDoPiso && (
        <p className="md-corpo-m mt-2 rounded-lg bg-atencao-container p-3 text-no-atencao-container">
          O que está em vermelho acima ficou abaixo do que gastou a mais sortuda das campanhas
          simuladas. Confira a conta: ou faltou contar alguma coisa, ou o caminho não foi o do plano.
        </p>
      )}

      <CurvaDeCusto
        amostras={sim.amostras.custo}
        media={plano.custoEsperado}
        escolhida={{ rotulo: 'você', chance: 1 - p, valor: sorte.total }}
        margens={MARGENS.map((m) => sim.custo[m.key])}
        marca="você"
        legenda={<>A área acesa são as campanhas que custaram menos que a sua: {porcento(1 - p)}.</>}
      />

      <div className="mt-4">{compartilhar}</div>
    </div>
  );
}

/** A sorte de um material só, curta o bastante para caber embaixo do nome. */
function SorteCurta({ p }: { p: number }) {
  // Nas pontas, "melhor que 100%" arredonda uma coisa que não é verdade.
  const quanto = (q: number) => (q >= 0.995 ? 'todas' : porcento(q));
  return p >= 0.5 ? (
    <span className="text-ok">melhor que {quanto(p)}</span>
  ) : (
    <span className="text-atencao">pior que {quanto(1 - p)}</span>
  );
}

/**
 * A frase do veredito, sempre do lado em que a pessoa está.
 *
 * "Mais sorte que 12%" é verdade e não diz nada; "mais azar que 88%" diz. Nas
 * pontas o percentual arredondado mentiria — "mais sorte que 100%" —, e ali a
 * frase passa a falar das campanhas simuladas inteiras.
 */
export function fraseDaSorte(p: number, execucoes: number): string {
  const todas = `todas as ${execucoes.toLocaleString('pt-BR')} campanhas simuladas`;
  if (p >= 0.995) return `Mais sorte que ${todas}`;
  if (p <= 0.005) return `Mais azar que ${todas}`;
  return p >= 0.5
    ? `Mais sorte que ${porcento(p)} das campanhas simuladas`
    : `Mais azar que ${porcento(1 - p)} das campanhas simuladas`;
}

function classe(p: number): { rotulo: string; tom: 'ok' | 'neutro' | 'atencao' | 'perigo' } {
  if (p >= 0.9) return { rotulo: 'Sorte grande', tom: 'ok' };
  if (p >= 0.6) return { rotulo: 'Teve sorte', tom: 'ok' };
  if (p > 0.4) return { rotulo: 'Na média', tom: 'neutro' };
  if (p > 0.1) return { rotulo: 'Teve azar', tom: 'atencao' };
  return { rotulo: 'Azar grande', tom: 'perigo' };
}
