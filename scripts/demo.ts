// Inspeção rápida do motor pelo terminal: `npx vite-node scripts/demo.ts`.
// Útil para conferir se um plano faz sentido antes de olhar pela interface.
import { DEFAULT_PRICES } from '../src/data/defaultPrices';
import { calcular } from '../src/engine/plan';
import { avaliarEstoque, emMateriais } from '../src/engine/estoque';
import { nomeDoItem } from '../src/data/nomes';
import type { CalcInput } from '../src/engine/types';

const z = (n: number) => Math.round(n).toLocaleString('pt-BR') + 'z';

function run(nome: string, over: Partial<CalcInput>) {
  const input: CalcInput = {
    kind: 'w4',
    precoItem: 30_000_000,
    refinoAtual: 0,
    refinoAlvo: 12,
    grauAtual: 'none',
    grauAlvo: 'none',
    evento: false,
    precos: DEFAULT_PRICES,
    usarBencaoFerreiro: true,
    usarMineriosEspeciais: true,
    perdaAceitavel: true,
    ...over,
  };
  const r = calcular(input, { execucoes: 20_000 });
  console.log('\n===== ' + nome);
  console.log('custo esperado :', z(r.custoEsperado));
  // Alvos absurdos não são simulados: a campanha média não cabe no orçamento de
  // tentativas. O custo esperado continua exato; os percentis é que somem.
  if (r.simulacao) {
    console.log('mediana (p50)  :', z(r.simulacao.custo.p50));
    console.log('p90 / p95      :', z(r.simulacao.custo.p90), '/', z(r.simulacao.custo.p95));
  } else {
    console.log('percentis      : fora de alcance (alvo inalcançável na prática)');
  }
  console.log('itens quebrados:', r.itensQuebrados.toFixed(2));
  if (r.simulacao) {
    console.log('sem quebrar    :', (r.simulacao.chanceSemQuebra * 100).toFixed(1) + '%');
  }
  console.log('valor justo    :', z(r.valorJusto));
  for (const f of r.fases) {
    console.log(`  [${f.tipo}] ${f.rotulo} — ${z(f.custoEsperado)}`);
    for (const t of f.trechos) {
      console.log(
        `      +${t.de}→+${t.para}: ${t.minerio}` +
          (t.bencaos ? ` + ${t.bencaos} Bênção` : '') +
          ` (${(t.chance * 100).toFixed(0)}%) — na falha ${t.naFalha}`,
      );
    }
    if (f.grau) {
      console.log(
        `      tentar no +${f.grau.refino}, processo ${f.grau.seguro ? 'SEGURO' : 'normal'}, ` +
          `${f.grau.pontosBencao} p.p. de Bênção de Éter, chance ${(f.grau.chance * 100).toFixed(0)}%, ` +
          `~${f.grau.tentativasEsperadas.toFixed(1)} tentativas`,
      );
    }
  }
  for (const a of r.avisos) console.log(`  ! [${a.nivel}] ${a.texto}`);
}

/** O mesmo plano lido pelo outro lado: dá para chegar lá com o que já se tem? */
function runEstoque(nome: string, over: Partial<CalcInput>) {
  const input: CalcInput = {
    kind: 'w4',
    precoItem: 30_000_000,
    refinoAtual: 0,
    refinoAlvo: 10,
    grauAtual: 'none',
    grauAlvo: 'none',
    evento: false,
    precos: DEFAULT_PRICES,
    usarBencaoFerreiro: true,
    usarMineriosEspeciais: true,
    perdaAceitavel: true,
    ...over,
  };
  const r = calcular(input, { execucoes: 20_000 });
  console.log('\n===== estoque — ' + nome);
  if (!r.simulacao) {
    console.log('sem simulação: alvo fora de alcance');
    return;
  }

  const c = emMateriais(r.simulacao.amostras, input.precos, input.precoItem);
  console.log('materiais a ter:');
  for (const m of c.materiais) {
    console.log(
      `  ${nomeDoItem(m.itemId)}: mínimo ${Math.ceil(m.minimo)}, média ${m.media.toFixed(1)}, ${z(m.preco)} cada`,
    );
  }

  const cenarios: [string, Parameters<typeof avaliarEstoque>[1]][] = [
    ['só o orçamento médio em caixa', { zeny: r.custoEsperado, itens: {}, copias: 1 }],
    ['o p90 em caixa', { zeny: r.simulacao.custo.p90, itens: {}, copias: 1 }],
    [
      'o mínimo de cada minério + metade do custo em zeny',
      {
        zeny: r.custoEsperado / 2,
        itens: Object.fromEntries(c.materiais.map((m) => [m.itemId, Math.ceil(m.minimo)])),
        copias: 1,
      },
    ],
  ];

  for (const [rotulo, estoque] of cenarios) {
    const v = avaliarEstoque(c, estoque);
    console.log(
      `  ${rotulo}: ${(v.chance * 100).toFixed(1)}% de chance` +
        `, ainda faltam ${z(Math.max(0, v.zenyNecessario.p90 - estoque.zeny))} no p90`,
    );
  }
}

run('Arma nv4, +0 → +12', {});
run('Arma nv4, +0 → +12 (evento)', { evento: true });
run('Arma nv5, +0 → +11, sem grau', { kind: 'w5', refinoAlvo: 11 });
run('Arma nv5, +0 → +11, até Grau A', { kind: 'w5', refinoAlvo: 11, grauAlvo: 'A' });
run('Arma nv4, +7 → +12, item insubstituível', {
  refinoAtual: 7,
  refinoAlvo: 12,
  perdaAceitavel: false,
});
runEstoque('Arma nv4, +0 → +10', {});
runEstoque('Arma nv5, +0 → +11, até Grau D', { kind: 'w5', refinoAlvo: 11, grauAlvo: 'D' });
