// Hill-climb a strategy genome. (1+λ): each generation mutates the parent λ times, plays every child on the
// same batch of seeds (common random numbers), and keeps the best child if it beats the parent on that batch.
// The batch rotates every ROTATE generations to limit overfitting. Usage: node sim/hillclimb.js [gens] [games] [difficulty]
const { Worker, isMainThread, parentPort } = require('worker_threads');
const S = require('./strategy.js');

if (!isMainThread) {
  parentPort.on('message', m => parentPort.postMessage({ id: m.id, r: S.evaluate(m.G, m.seeds, m.diff) }));
  return;
}
const fs = require('fs');
const GENS = +(process.argv[2] || 300), GAMES = +(process.argv[3] || 600), DIFF = process.argv[4] || 'advisor';
const LAMBDA = 12, ROTATE = 15, RUN = +(process.argv[5] || 0);
// PIN='{"seq":"together"}' holds genes fixed through the search.
const PIN = process.env.PIN ? JSON.parse(process.env.PIN) : {};
let rs = 12345 + 7919 * RUN; const rand = () => { rs = (rs * 1103515245 + 12345) & 0x7fffffff; return rs / 0x7fffffff; };
const gauss = () => Math.sqrt(-2 * Math.log(rand() + 1e-12)) * Math.cos(2 * Math.PI * rand());

function mutate(G) {
  const C = Object.assign({}, G);
  const k = 1 + Math.floor(rand() * 4);
  for (let i = 0; i < k; i++) {
    const gene = S.GENES[Math.floor(rand() * S.GENES.length)];
    if (gene.type === 'real') C[gene.key] = Math.max(gene.a, Math.min(gene.b, C[gene.key] + gauss() * 0.25 * (gene.b - gene.a)));
    else if (gene.type === 'int') C[gene.key] = Math.max(gene.a, Math.min(gene.b, C[gene.key] + (rand() < 0.5 ? -1 : 1)));
    else if (gene.type === 'bool') C[gene.key] = !C[gene.key];
    else C[gene.key] = gene.a[Math.floor(rand() * gene.a.length)];
  }
  return Object.assign(C, PIN);
}
const fit = r => r.win + r.score / 1e5;

const workers = Array.from({ length: LAMBDA }, () => new Worker(__filename));
let reqId = 0;
function run(w, G, seeds) { return new Promise(res => { const id = ++reqId; const h = m => { if (m.id === id) { w.off('message', h); res(m.r); } }; w.on('message', h); w.postMessage({ id, G, seeds, diff: DIFF }); }); }
async function evalMany(Gs, seeds) {
  // split each evaluation across all workers by seed chunks
  const chunk = Math.ceil(seeds.length / workers.length);
  const out = [];
  for (const G of Gs) {
    const parts = await Promise.all(workers.map((w, i) => run(w, G, seeds.slice(i * chunk, (i + 1) * chunk)).then(r => ({ r, n: Math.max(0, Math.min(chunk, seeds.length - i * chunk)) }))));
    const n = parts.reduce((a, p) => a + p.n, 0);
    out.push({ win: parts.reduce((a, p) => a + p.r.win * p.n, 0) / n, score: parts.reduce((a, p) => a + p.r.score * p.n, 0) / n, loc: parts.reduce((a, p) => a + p.r.loc * p.n, 0) / n });
  }
  return out;
}
const batch = b => Array.from({ length: GAMES }, (_, i) => 100000 + RUN * 50000 + b * GAMES + i);

(async () => {
  // START=genome.json seeds the search from an earlier winner; genes it lacks keep the expert's values.
  let parent = process.env.START ? Object.assign(S.expertGenome(), require(require('path').resolve(process.env.START))) : S.expertGenome();
  Object.assign(parent, PIN);
  let b = 0, seeds = batch(b);
  let pr = (await evalMany([parent], seeds))[0];
  const start = pr;
  console.log(`gen 0  parent win ${(100 * pr.win).toFixed(1)}%  score ${pr.score.toFixed(0)}`);
  const logf = __dirname + '/hillclimb.log';
  fs.writeFileSync(logf, '');
  for (let gen = 1; gen <= GENS; gen++) {
    if (gen % ROTATE === 0) { b++; seeds = batch(b); pr = (await evalMany([parent], seeds))[0]; }
    const kids = Array.from({ length: LAMBDA }, () => mutate(parent));
    const res = await evalMany(kids, seeds);
    let bi = -1; res.forEach((r, i) => { if (fit(r) > fit(bi < 0 ? pr : res[bi])) bi = i; });
    if (bi >= 0) {
      const changed = Object.keys(kids[bi]).filter(k => kids[bi][k] !== parent[k]).map(k => k + '=' + (typeof kids[bi][k] === 'number' ? Math.round(kids[bi][k] * 100) / 100 : kids[bi][k]));
      parent = kids[bi]; pr = res[bi];
      const line = `gen ${gen}  win ${(100 * pr.win).toFixed(1)}%  score ${pr.score.toFixed(0)}  loc ${(100 * pr.loc).toFixed(1)}%  changed: ${changed.join(', ')}`;
      console.log(line); fs.appendFileSync(logf, line + '\n');
      fs.writeFileSync(__dirname + '/best_genome' + (RUN ? '_run' + RUN : '') + '.json', JSON.stringify(parent, null, 1));
    }
  }
  // validate on fresh seeds neither saw
  const fresh = Array.from({ length: 4000 }, (_, i) => 900000 + i);
  const [ve, vb] = await evalMany([S.expertGenome(), parent], fresh);
  console.log(`\nVALIDATION on 4000 fresh games (${DIFF}): expert ${(100 * ve.win).toFixed(1)}% (loc ${(100 * ve.loc).toFixed(1)}%, score ${ve.score.toFixed(0)})  vs  best ${(100 * vb.win).toFixed(1)}% (loc ${(100 * vb.loc).toFixed(1)}%, score ${vb.score.toFixed(0)})`);
  void start;
  workers.forEach(w => w.terminate());
})();
