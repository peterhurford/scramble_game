// Does the best pacing mechanism depend on the game? Plays a genome as it stands, then with each mechanism forced,
// and splits the win rates by the game's hidden court climate. Usage: node sim/mechs.js [genome.json] [games]
const S = require('./strategy.js'), E = require('../engine.js');
const file = process.argv[2] || __dirname + '/best_genome.json';
const G = Object.assign(S.expertGenome(), S.loadGenome(file));
const seeds = Array.from({ length: +(process.argv[3] || 1500) }, (_, i) => 900000 + i);
const climate = c => c < 0.83 ? 'friendly' : c < 1.17 ? 'mixed' : 'hostile';
const pct = (a, n) => n ? (100 * a / n).toFixed(1) + '%' : '-';

function run(Gx) {
  const r = { win: 0, n: 0, by: {}, mech: {}, statute: 0, p1: 0 };
  for (const sd of seeds) {
    const s = S.play(Gx, sd), k = climate(s.courts), w = s.ending === 'phase2' ? 1 : 0;
    r.n++; r.win += w; (r.by[k] = r.by[k] || { win: 0, n: 0 }).n++; r.by[k].win += w;
    if (s.pacing.mech) r.mech[s.pacing.mech] = (r.mech[s.pacing.mech] || 0) + 1;
    if (s.stats.scrambleStart != null && s.phase !== 'p0') { r.p1++; if (s.flags.statute) r.statute++; }
  }
  return r;
}
const fixed = m => Object.assign({}, G, { mech: m, mechHostile: m, mechNoSign: m === 'charter' ? G.mechNoSign : m, charterMin: m === 'charter' ? 0 : G.charterMin });
const base = run(G);
console.log(`as is: win ${pct(base.win, base.n)} | mechanism chosen: ${Object.keys(base.mech).map(m => m + ' ' + pct(base.mech[m], base.n)).join(', ')} | statute in ${pct(base.statute, base.p1)} of Phase 1 games`);
console.log(`  by court climate: ${['friendly', 'mixed', 'hostile'].map(k => k + ' ' + pct(base.by[k].win, base.by[k].n)).join(', ')}`);
let best = 0;
for (const m of ['charter', 'dpa', 'license']) {
  const r = run(fixed(m)); best = Math.max(best, r.win / r.n);
  console.log(`forced ${m.padEnd(7)}: win ${pct(r.win, r.n)} (${(100 * (base.win / base.n - r.win / r.n)).toFixed(1)} pts below as-is) | ${['friendly', 'mixed', 'hostile'].map(k => k + ' ' + pct(r.by[k].win, r.by[k].n)).join(', ')}`);
}
console.log(`choosing per game is worth ${(100 * (base.win / base.n - best)).toFixed(1)} pts over the best single mechanism`);
