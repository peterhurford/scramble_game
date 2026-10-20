// Which of the best genome's changes matter? Revert each changed gene alone and measure the drop.
const S = require('./strategy.js'); const B = S.loadGenome(process.env.GENOME || __dirname + '/best_genome.json'); const X = S.expertGenome();
const seeds = Array.from({ length: +(process.argv[2] || 1500) }, (_, i) => 700000 + i);
const base = S.evaluate(B, seeds), ex = S.evaluate(X, seeds);
console.log(`best ${(100 * base.win).toFixed(1)}%  expert ${(100 * ex.win).toFixed(1)}%`);
const keys = S.genes(B).filter(k => JSON.stringify(B[k]) !== JSON.stringify(X[k]));
const rows = keys.map(k => { const G = Object.assign({}, B, { [k]: X[k] }); const r = S.evaluate(G, seeds); return [k, X[k], B[k], base.win - r.win]; }).sort((a, b) => b[3] - a[3]);
rows.forEach(r => { if (Math.abs(r[3]) >= 0.005) console.log(`${(100 * r[3]).toFixed(1).padStart(5)} pts  ${r[0]}: ${JSON.stringify(r[1])} -> ${typeof r[2] === 'number' ? Math.round(r[2] * 100) / 100 : JSON.stringify(r[2])}`); });
