// Explore the UAE choice: how often it fires, and how much "leave it" helps or hurts under rule variants.
const E = require('../engine.js'); const S = require('./strategy.js');
const Gs = ['v6_run0', 'v6_run1', 'v6_run2'].map(n => require('./best_genome_' + n + '.json')).concat([S.expertGenome()]);
const seeds = Array.from({ length: +(process.argv[2] || 2000) }, (_, i) => 950000 + i);
const VARIANTS = { 'new default (2 capital; small x-risk; State -12)': {} };
const base = Object.assign({}, E.TUNE);
let fired = 0, firedP1 = 0;
for (const sd of seeds) { const s = S.play(Gs[0], sd); if (s.seen.uae) { fired++; if (s.pacing.active || s.phase === 'p1') firedP1++; } }
console.log(`UAE event fires in ${(100 * fired / seeds.length).toFixed(0)}% of optimized games (${(100 * firedP1 / seeds.length).toFixed(0)}% while paced).`);
for (const [name, v] of Object.entries(VARIANTS)) {
  Object.assign(E.TUNE, base, v);
  const diffs = Gs.map(G => S.evaluate(Object.assign({}, G, { 'ev.uae': 1 }), seeds).win - S.evaluate(Object.assign({}, G, { 'ev.uae': 0 }), seeds).win);
  const opt = diffs.slice(0, 3).reduce((a, b) => a + b, 0) / 3;
  console.log(`${name.padEnd(58)} leaving it out vs bringing it in: optimized ${(opt >= 0 ? '+' : '') + (100 * opt).toFixed(1)} pts, expert ${(diffs[3] >= 0 ? '+' : '') + (100 * diffs[3]).toFixed(1)} pts`);
}
