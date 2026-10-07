// Imprime, lado a lado, a descrição de cada minério em cada servidor do Divine
// Pride. É a fonte do campo `chanceAumentada` em `src/data/ores.ts`: os minérios
// que aumentam a chance dizem isso na descrição, e os que só protegem não dizem.
//
// `npm run descricoes` — a saída é longa de propósito, para dar para reconferir a
// tabela inteira de uma vez quando o servidor mudar um texto.
import { ORES } from '../src/data/ores';
import { descricaoDoServidor } from './divinepride';

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/126.0 Safari/537.36';
const COOKIES = 'dp_language=portuguese; dp_region=LATAM';

/** O LATAM manda; os outros entram como contraprova. */
const SERVIDORES = ['LATAM - Portuguese', 'LATAM - English', 'bRO - Portuguese', 'kROM - Korean'];

/** As frases com que uma descrição promete chance maior, nos três idiomas. */
const CHANCE =
  /aumenta(?:m)? a[s]? chance|com maior chance|increases? the chance|with a higher chance|제련확률이 증가|높은 확률/i;

/** Uma pausa entre requisições: são 22 páginas atrás de Cloudflare. */
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

for (const ore of ORES) {
  const res = await fetch(`https://www.divine-pride.net/database/item/${ore.itemId}`, {
    headers: { 'User-Agent': UA, Cookie: COOKIES },
  });
  const html = await res.text();

  console.log(`\n===== ${ore.nome} (${ore.itemId}) — chanceAumentada: ${ore.chanceAumentada}`);
  for (const s of SERVIDORES) {
    const linhas = descricaoDoServidor(html, s);
    if (!linhas.length) continue;
    const promete = linhas.some((l) => CHANCE.test(l));
    console.log(`  [${s}]${promete ? '  <<< PROMETE CHANCE MAIOR' : ''}`);
    for (const l of linhas) console.log(`    ${l}`);
  }
  await sleep(400);
}
