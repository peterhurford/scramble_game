// The shared measurement: every handoff and "landed" message quotes this. Fixed seeds, expert fill for missing genes, paired SE.
// node sim/compare.js <genome.json>... [--n 4000] [--seed 900000] [--root DIR] [--vs-root DIR] [--tune JSON] [--genes JSON]
// With only genomes: each genome's mean score ± SE, Phase 2, S, F and loss of control, on the engine at --root (default: this checkout).
// With --vs-root, --tune or --genes: also a variant (another checkout's engine, TUNE overrides, or gene overrides) on the same seeds,
// and the paired difference variant − base. Example: node sim/compare.js sim/v27_run0.json --tune '{"open":0}'
const path = require('path'), fs = require('fs');
const argv = process.argv.slice(2), opt = { n: 4000, seed: 900000, root: path.join(__dirname, '..') }, files = [];
for (let i = 0; i < argv.length; i++) { const a = argv[i]; if (a.startsWith('--')) opt[a.slice(2)] = argv[++i]; else files.push(a); }
if (!files.length) { console.log(fs.readFileSync(__filename, 'utf8').split('\n').slice(0, 5).join('\n')); process.exit(1); }
const n = +opt.n, seed0 = +opt.seed, tune = opt.tune ? JSON.parse(opt.tune) : null, genes = opt.genes ? JSON.parse(opt.genes) : null;
const load = root => ({ S: require(path.resolve(root, 'sim/strategy.js')), E: require(path.resolve(root, 'engine.js')) });
const A = load(opt.root), B = opt['vs-root'] ? load(opt['vs-root']) : A;
const variant = !!(opt['vs-root'] || tune || genes);
const merge = (t, o) => { for (const k in o) { if (o[k] && typeof o[k] === 'object' && !Array.isArray(o[k]) && t[k] && typeof t[k] === 'object') merge(t[k], o[k]); else t[k] = o[k]; } };
const clone = o => JSON.parse(JSON.stringify(o));
function play(M, G, sd) { const s = M.S.play(G, sd), r = M.E.score(s); return { sc: r.score, w: s.ending === 'phase2', S: r.grade === 'S', F: r.grade === 'F', loc: s.ending === 'loc' }; }
function stats(xs) { const m = xs.reduce((a, x) => a + x, 0) / xs.length, v = xs.reduce((a, x) => a + (x - m) * (x - m), 0) / (xs.length - 1); return { m, se: Math.sqrt(v / xs.length) }; }
const pct = (rs, k) => (100 * rs.filter(r => r[k]).length / rs.length).toFixed(1) + '%';
const line = (label, rs) => { const st = stats(rs.map(r => r.sc)); return `${label.padEnd(10)} mean ${st.m.toFixed(1)} ± ${st.se.toFixed(1)}  Phase 2 ${pct(rs, 'w')}  S ${pct(rs, 'S')}  F ${pct(rs, 'F')}  loc ${pct(rs, 'loc')}`; };
const seeds = Array.from({ length: n }, (_, i) => seed0 + i);
const commit = root => { try { return require('child_process').execSync('git rev-parse --short HEAD', { cwd: root, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim(); } catch (e) { return '?'; } };
console.log(`compare.js: ${n} games from seed ${seed0}; base ${path.basename(path.resolve(opt.root))}@${commit(opt.root)}` + (variant ? `; variant ${opt['vs-root'] ? path.basename(path.resolve(opt['vs-root'])) + '@' + commit(opt['vs-root']) : 'same engine'}${tune ? ' tune ' + JSON.stringify(tune) : ''}${genes ? ' genes ' + JSON.stringify(genes) : ''}` : ''));
for (const f of files) {
  const raw = JSON.parse(fs.readFileSync(f, 'utf8')), stamp = raw._rules; delete raw._rules;
  const stale = !stamp ? ' (no rules stamp)' : stamp.hash !== A.S.rulesStamp().hash ? ` (STALE: searched under ${stamp.commit})` : '';
  const Ga = Object.assign(A.S.expertGenome(), raw), Gb = Object.assign(B.S.expertGenome(), raw, genes || {});
  const ra = seeds.map(sd => play(A, Ga, sd));
  console.log(`${f}${stale}${/\.partial\./.test(f) ? '  (PARTIAL: search still running)' : ''}`);
  console.log('  ' + line('base', ra));
  if (!variant) continue;
  const saved = clone(B.E.TUNE); if (tune) merge(B.E.TUNE, tune);
  const rb = seeds.map(sd => play(B, Gb, sd));
  for (const k in B.E.TUNE) delete B.E.TUNE[k]; Object.assign(B.E.TUNE, saved);
  const d = stats(rb.map((r, i) => r.sc - ra[i].sc));
  console.log('  ' + line('variant', rb));
  console.log(`  ${'diff'.padEnd(10)} ${d.m >= 0 ? '+' : ''}${d.m.toFixed(1)} ± ${d.se.toFixed(1)} (paired)`);
}
