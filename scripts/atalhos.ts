// Lê no Divine Pride para que equipamentos serve cada cubo e martelo de refino, e regrava
// `src/data/atalhos.json`.
//
//   npm run data:atalhos              baixa as ~55 páginas e grava
//   npm run data:atalhos -- --simular só mostra o que leu, não grava
//
// O QUE cada atalho faz (refino fixo, sorteado ou +1) é escrito à mão em `src/data/atalhos.ts`,
// com as chances do Browiki. Daqui sai o resto, e tudo da página de cada item:
//
// - a lista de equipamentos aceitos, com o id de cada um — a aba "This box can upgrade" dos cubos
//   e a "Can be used to reform" dos martelos. É essa lista com link que torna a coisa viável: a
//   descrição diz "Armas OS" ou "Thanos Dagger", e casar isso com a base por nome seria adivinhar
//   tradução;
// - o refino mínimo exigido (o Ilusional só aceita do +4 para cima);
// - nos martelos, a faixa aceita e os materiais de cada uso (14 Bênçãos do Ferreiro, quase sempre).
//
// O script também confere a parte escrita à mão onde dá: um cubo de refino fixo precisa citar o
// refino que o catálogo diz que ele dá, e um martelo precisa somar o que o catálogo diz que ele
// soma. Divergência aborta sem gravar — é o tipo de erro que daria um orçamento falso calado.

import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { CATALOGO, type AtalhoCatalogado, type AtalhoGerado } from '../src/data/atalhos';
import {
  descricaoDoServidor,
  extrairMelhoria,
  extrairReformas,
  lerBase,
  pegarPagina,
  ROOT,
  sleep,
} from './divinepride';

const ATALHOS_JSON = resolve(ROOT, 'src/data/atalhos.json');

const simular = process.argv.includes('--simular');

/** Descrições onde procurar o refino prometido, na ordem: o LATAM manda. */
const SERVIDORES = ['LATAM - Portuguese', 'LATAM - English', 'bRO - Portuguese'];

/** Um problema que impede gravar. */
const problemas: string[] = [];

/** Lê um atalho da página dele. `null` quando a página não serviu. */
function ler(c: AtalhoCatalogado, html: string): AtalhoGerado | null {
  if (c.efeito.tipo === 'soma') {
    const reformas = extrairReformas(c.itemId, html);
    if (!reformas || reformas.length === 0) {
      problemas.push(`${c.nome} (${c.itemId}): a página não tem a aba de reforma.`);
      return null;
    }
    // A faixa, a mudança e os materiais são iguais para todo alvo de um martelo. Se um dia não
    // forem, o formato do json não dá conta, e é melhor saber do que gravar o primeiro.
    const assinatura = (r: (typeof reformas)[number]) =>
      `${r.refinoMinimo}-${r.refinoMaximo}|${r.mudanca}|${r.materiais.map((m) => `${m.itemId}x${m.qtd}`).join(',')}`;
    const distintas = new Set(reformas.map(assinatura));
    if (distintas.size > 1) {
      problemas.push(`${c.nome} (${c.itemId}): alvos com regras diferentes — ${[...distintas].join(' / ')}`);
      return null;
    }
    const r = reformas[0]!;
    if (r.mudanca !== c.efeito.refinos) {
      problemas.push(`${c.nome} (${c.itemId}): o site diz +${r.mudanca} por uso, o catálogo diz +${c.efeito.refinos}.`);
      return null;
    }
    const mudaDeItem = reformas.filter((x) => x.base !== x.resultado);
    if (mudaDeItem.length > 0) {
      problemas.push(`${c.nome} (${c.itemId}): ${mudaDeItem.length} alvos viram OUTRO item — não é martelo de refino.`);
      return null;
    }
    return {
      minimo: r.refinoMinimo,
      maximo: r.refinoMaximo,
      materiais: r.materiais,
      alvos: [...new Set(reformas.map((x) => x.base))].sort((a, b) => a - b),
    };
  }

  const alvos = extrairMelhoria(html);
  if (!alvos || alvos.length === 0) {
    problemas.push(`${c.nome} (${c.itemId}): a página não tem a aba de melhoria.`);
    return null;
  }
  const minimos = new Set(alvos.map((a) => a.refinoMinimo));
  if (minimos.size > 1) {
    problemas.push(`${c.nome} (${c.itemId}): refinos mínimos diferentes por alvo (${[...minimos].join(', ')}).`);
    return null;
  }

  // O refino fixo prometido tem de aparecer na descrição: "+11", "+9".
  if (c.efeito.tipo === 'fixo') {
    const alvo = `+${c.efeito.refino}`;
    const promete = SERVIDORES.some((s) =>
      descricaoDoServidor(html, s).some((l) => new RegExp(`\\${alvo}(?!\\d)`).test(l)),
    );
    if (!promete) {
      problemas.push(`${c.nome} (${c.itemId}): nenhuma descrição cita ${alvo}, que é o que o catálogo diz.`);
      return null;
    }
  }

  return {
    minimo: [...minimos][0]!,
    maximo: null,
    materiais: [],
    alvos: [...new Set(alvos.map((a) => a.id))].sort((a, b) => a - b),
  };
}

const base = await lerBase();
const gerados: Record<number, AtalhoGerado> = {};

for (const [n, c] of CATALOGO.entries()) {
  const html = await pegarPagina(c.itemId);
  const g = html === null ? null : ler(c, html);
  if (html === null) problemas.push(`${c.nome} (${c.itemId}): a página não baixou.`);

  if (g) {
    gerados[c.itemId] = g;
    // Quantos alvos a busca da calculadora conhece, e de que categoria. Um alvo fora da base
    // não é erro — costuma ser item que não chegou ao LATAM —, mas um atalho com ZERO alvos
    // na base é um atalho que nunca vai aparecer, e vale ver.
    const naBase = g.alvos.map((id) => base.get(id)).filter((i) => i !== undefined);
    const kinds = [...new Set(naBase.map((i) => i.kind ?? `!${i.naoRefinavel}`))].join(' ');
    const faixa = g.maximo === null ? `+${g.minimo} ou mais` : `+${g.minimo} a +${g.maximo}`;
    const mats = g.materiais.map((m) => `${m.qtd}x ${m.nome}`).join(', ');
    console.log(
      `${String(n + 1).padStart(2)}/${CATALOGO.length} ${c.nome.padEnd(34)} ${String(g.alvos.length).padStart(5)} alvos, ` +
        `${String(naBase.length).padStart(5)} na base [${kinds}]  aceita ${faixa}${mats ? `  ${mats}` : ''}`,
    );
  }
  await sleep(400);
}

if (problemas.length > 0) {
  console.error(`\n${problemas.length} problema(s):\n  ${problemas.join('\n  ')}`);
}

// A mesma trava da varredura da base: se o site mudar e o parser passar a devolver vazio, nada
// estoura — o arquivo é que vira uma lista de atalhos sem alvo, que parece "nenhum item serve".
const lidos = Object.keys(gerados).length;
if (lidos < CATALOGO.length * 0.8) {
  console.error(`\nSó ${lidos} de ${CATALOGO.length} atalhos foram lidos. Não vou gravar.`);
  process.exit(1);
}

if (simular) {
  console.log('\n--simular: nada gravado.');
} else {
  // Atalho que falhou HOJE mantém a leitura anterior em vez de sumir — o mesmo critério dos
  // preços: uma página que não baixou não é um cubo que deixou de existir.
  const anterior = JSON.parse(await readFile(ATALHOS_JSON, 'utf8')) as {
    atalhos: Record<string, AtalhoGerado>;
  };
  const final: Record<string, AtalhoGerado> = { ...anterior.atalhos, ...gerados };
  const ids = Object.keys(final).sort((a, b) => Number(a) - Number(b));
  // Uma linha por atalho: o diff do commit precisa mostrar QUAL mudou.
  const corpo = ids.map((id) => `    ${JSON.stringify(id)}: ${JSON.stringify(final[id])}`).join(',\n');
  await writeFile(
    ATALHOS_JSON,
    `{
  "_fonte": "https://www.divine-pride.net/ (abas de melhoria e reforma de cada cubo e martelo)",
  "_geradoEm": ${JSON.stringify(new Date().toISOString().slice(0, 10))},
  "atalhos": {
${corpo}
  }
}
`,
    'utf8',
  );
  console.log(`\nGravado: ${ids.length} atalhos em src/data/atalhos.json.`);
}

if (problemas.length > 0) process.exit(1);
