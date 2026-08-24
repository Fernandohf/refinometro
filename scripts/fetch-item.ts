// Resolve itens por ID pela página PÚBLICA do Divine Pride e junta em items.json.
//
//   npm run item -- 1867 5031
//   npm run item -- https://www.divine-pride.net/database/item/1867/
//
// Para achar o ID a partir do nome, use `npm run buscar -- "nome do item"`.
//
// Por que não a API: a API oficial exige chave e não tem endpoint de listagem.
// A página pública não exige nada e já traz o nome em português do servidor LATAM.
//
// Para popular a base não é aqui: `npm run data:items` varre as três categorias
// inteiras. Este script existe para o caso pontual — um item recém-lançado que a
// varredura semanal ainda não pegou, ou um que voltou sem nome em português e só
// pode ser cadastrado pelo ID.

import { classificar } from '../src/data/itemKinds';
import { lerBase, pegarFicha, salvarBase, sleep, type ItemSalvo } from './divinepride';

const alvos = process.argv.slice(2).flatMap((arg) => {
  const m = arg.match(/(\d+)/g);
  return m ? m.map(Number) : [];
});

if (alvos.length === 0) {
  console.error(
    'Uso: npm run item -- <id ou url> [mais ids...]\n' +
      '  npm run item -- 1867 5031\n' +
      '  npm run item -- https://www.divine-pride.net/database/item/1867/\n' +
      '\nProcurando pelo nome? npm run buscar -- "Espingarda"',
  );
  process.exit(1);
}

const porId = await lerBase();

for (const id of alvos) {
  const ficha = await pegarFicha(id);
  if (!ficha) {
    console.log(`  ${id}: sem ficha em nenhum servidor conhecido — pulando`);
    continue;
  }

  const c = classificar(ficha);
  const salvo: ItemSalvo = { id, nome: ficha.nome, slots: ficha.slots };
  if (c.refinavel) salvo.kind = c.kind;
  else salvo.naoRefinavel = c.motivo;

  porId.set(id, salvo);
  const forasteiro = ficha.servidor.startsWith('LATAM') ? '' : `  [${ficha.servidor}]`;
  console.log(
    `  ${id}: ${ficha.nome}${ficha.slots ? ` [${ficha.slots}]` : ''} — ` +
      `${ficha.tipo}/${ficha.subtipo}` +
      (ficha.posicao ? ` (${ficha.posicao})` : '') +
      ` => ${c.refinavel ? c.kind : `NÃO REFINÁVEL (${c.motivo})`}` +
      forasteiro,
  );

  await sleep(400); // a página é pesada; não convém martelar o servidor deles
}

console.log(`OK -> src/data/items.json (${await salvarBase(porId)} itens na base)`);
