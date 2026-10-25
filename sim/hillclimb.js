// Hill-climb a strategy genome. (1+λ): each generation mutates the parent λ times, plays every child on the
// same batch of seeds (common random numbers), and keeps the best child if it beats the parent on that batch.
// The batch rotates every ROTATE generations to limit overfitting. Usage: node sim/hillclimb.js [gens] [games] [difficulty] [run]
// Racing: every child plays the first third of the batch; only those within RACE_MARGIN of the parent there play the rest.
// GROUP_P=0.3 (default) of children resample a whole S.GROUPS group, so moves that need several genes at once are reachable.
// RUNS=0,1,2 runs several searches in one process, so every run uses the code loaded at the start.
// OUT=sim/v13 writes sim/v13_run<N>.json instead of best_genome[_runN].json. START=genome.json seeds the search (START=a.json,b.json,c.json: one per run).
// KEEP (default on, KEEP=0 off): at the end the start and the final play 4000 held-out games (seeds 700000+, apart from training and
// compare.js's 900000+); the run keeps the better, so it never ends below its start.
// A lock file (the main checkout's sim/.search.lock) makes a second search wait for the first instead of splitting the cores.
const { Worker, isMainThread, parentPort } = require('worker_threads');
// The main thread loads the rules only once it holds the lock, so a queued search runs the code current when it starts.
let S = isMainThread ? null : require('./strategy.js');

if (!isMainThread) {
  parentPort.on('message', m => { const recs = S.evaluateEach(m.G, m.seeds, m.diff); parentPort.postMessage({ id: m.id, recs }); });
  return;
}
const fs = require('fs'), path = require('path'), os = require('os');
const GENS = +(process.argv[2] || 300), GAMES = +(process.argv[3] || 600), DIFF = process.argv[4] || 'advisor';
const LAMBDA = 12, ROTATE = 15, GROUP_P = process.env.GROUP_P != null ? +process.env.GROUP_P : 0.3, RACE_MARGIN = process.env.RACE_MARGIN != null ? +process.env.RACE_MARGIN : 0.03;
const RUNS = (process.env.RUNS || process.argv[5] || '0').split(',').map(Number);
// PIN='{"seq":"together"}' holds genes fixed through the search.
const PIN = process.env.PIN ? JSON.parse(process.env.PIN) : {};
// Throughput peaks at about one worker per performance core (an M3 Max's 10, plus 2): more workers on the efficiency cores slow everyone.
let NW = +(process.env.NW || Math.min(12, Math.max(1, os.cpus().length - 1)));
// Cores come from cpu-slots (~/dev/dotfiles/bin), the pool every repo on this machine shares: a search holds NW slots
// (--bg, so 2 stay free for single runs) and shrinks NW to the grant. The worker count doesn't change results.
function takeSlots(bg) {
  if (process.env.CPU_SLOTS_HELD) { NW = Math.min(NW, +process.env.CPU_SLOTS_HELD); return Promise.resolve(); }
  const env = { ...process.env }; delete env.CPU_SLOTS_HELD;
  const h = require('child_process').spawn('cpu-slots', ['--hold', '--slots', String(NW), ...(bg ? ['--bg'] : [])], { stdio: ['pipe', 'pipe', 'inherit'], env });
  return new Promise(res => {
    h.on('error', () => { console.log('cpu-slots not on PATH (ln -s ~/dev/dotfiles/bin/cpu-slots ~/.local/bin/); running unpooled'); res(); });
    h.stdout.once('data', d => { const m = /granted (\d+)/.exec(d.toString()); if (m) NW = Math.min(NW, +m[1]); h.unref(); res(); });
  });
}
// One lock for every worktree of the repo (searches run from detached worktrees), kept in the main checkout's sim/.
const LOCK = (() => { try { const g = require('child_process').execSync('git rev-parse --path-format=absolute --git-common-dir', { cwd: __dirname, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim(); return path.join(path.dirname(g), 'sim', '.search.lock'); } catch (e) { return path.join(__dirname, '.search.lock'); } })();

// Fitness is mean score, so a B ending without a deal counts for something; FIT=win restores the Phase 2 rate. RACE_MARGIN is in these units (0.03 = 30 points).
const fit = process.env.FIT === 'win' ? r => r.win + r.score / 1e5 : r => r.score / 1000 + r.win / 1e5;
let workers = [];
// Exact reuse (REUSE=0 turns it off): each genome keeps its per-game results and the genes each game read. A child replays only the
// games that read a gene it changed from the current parent (PARENT); the others are the parent's games, identical move for move.
const REUSE = process.env.REUSE !== '0', RECS = new WeakMap(), REUSED = { games: 0, played: 0 };
let PARENT = null;
const recsOf = G => { let m = RECS.get(G); if (!m) RECS.set(G, m = new Map()); return m; };
// One queue of (genome, seed chunk) jobs shared by every worker, so no core waits for another genome to finish.
function evalMany(Gs, seeds) {
  const todo = Gs.map(G => {
    const own = recsOf(G), pm = REUSE && PARENT && G !== PARENT ? recsOf(PARENT) : null;
    const diff = pm ? Object.keys(G).filter(k => G[k] !== PARENT[k]) : null;
    return seeds.filter(sd => {
      if (own.has(sd)) { REUSED.games++; return false; }
      const r = pm && pm.get(sd);
      if (r && !diff.some(k => r.reads.has(k))) { own.set(sd, r); REUSED.games++; return false; }
      return true;
    });
  });
  const pending = todo.reduce((a, t) => a + t.length, 0); REUSED.played += pending;
  const nChunks = Math.max(1, Math.ceil(NW * 2 / Math.max(1, Gs.length))), jobs = [];
  todo.forEach((sds, gi) => { const size = Math.max(1, Math.ceil(sds.length / nChunks)); for (let c = 0; c * size < sds.length; c++) jobs.push({ gi, G: Gs[gi], seeds: sds.slice(c * size, (c + 1) * size) }); });
  const summary = () => Gs.map(G => { const m = recsOf(G); let w = 0, sc = 0, loc = 0; for (const sd of seeds) { const r = m.get(sd); w += r.w; sc += r.sc; loc += r.loc; } return { win: w / seeds.length, score: sc / seeds.length, loc: loc / seeds.length }; });
  let next = 0, done = 0;
  return new Promise(res => {
    if (!jobs.length) return res(summary());
    const feed = w => { if (next >= jobs.length) return; const id = next++, j = jobs[id]; w.once('message', m => { const own = recsOf(j.G); m.recs.forEach((r, i) => own.set(j.seeds[i], { w: r.w, sc: r.sc, loc: r.loc, reads: new Set(r.reads) })); if (++done === jobs.length) res(summary()); else feed(w); }); w.postMessage({ id, G: j.G, seeds: j.seeds, diff: DIFF }); };
    workers.forEach(feed);
  });
}
const RACE = { kids: 0, alive: 0 };
const merge = (a, na, b, nb) => ({ win: (a.win * na + b.win * nb) / (na + nb), score: (a.score * na + b.score * nb) / (na + nb), loc: (a.loc * na + b.loc * nb) / (na + nb) });
// Children and parent on the first third; survivors within RACE_MARGIN of the parent finish the batch. Dropped children score -Infinity.
async function evalRace(kids, parent, seeds) {
  const cut = Math.floor(seeds.length / 3), s1 = seeds.slice(0, cut), s2 = seeds.slice(cut);
  const r1 = await evalMany([parent].concat(kids), s1), p1 = r1[0];
  const alive = kids.map((_, i) => fit(r1[i + 1]) >= fit(p1) - RACE_MARGIN);
  RACE.kids += kids.length; RACE.alive += alive.filter(Boolean).length;
  const r2 = await evalMany(kids.filter((_, i) => alive[i]), s2);
  let k = 0;
  return kids.map((_, i) => alive[i] ? merge(r1[i + 1], s1.length, r2[k++], s2.length) : { win: -Infinity, score: 0, loc: 0 });
}

async function lock() {
  for (let warned = false; ; ) {
    try { fs.writeFileSync(LOCK, JSON.stringify({ pid: process.pid, cwd: process.cwd(), since: new Date().toISOString(), args: process.argv.slice(2), runs: RUNS }), { flag: 'wx' }); return; } catch (e) { if (e.code !== 'EEXIST') throw e; }
    let held = null; try { held = JSON.parse(fs.readFileSync(LOCK, 'utf8')); process.kill(held.pid, 0); } catch (e) { if (!held || e.code === 'ESRCH') { try { fs.unlinkSync(LOCK); } catch (_) {} continue; } }
    if (!warned) { console.log(`waiting: another search (pid ${held.pid}, since ${held.since}) holds ${LOCK}`); warned = true; }
    await new Promise(r => setTimeout(r, 15000));
  }
}
const unlock = () => { try { const h = JSON.parse(fs.readFileSync(LOCK, 'utf8')); if (h.pid === process.pid) fs.unlinkSync(LOCK); } catch (_) {} };
process.on('exit', unlock); process.on('SIGINT', () => process.exit(130)); process.on('SIGTERM', () => process.exit(143));

async function search(RUN) {
  let rs = 12345 + 7919 * RUN; const rand = () => { rs = (rs * 1103515245 + 12345) & 0x7fffffff; return rs / 0x7fffffff; };
  const gauss = () => Math.sqrt(-2 * Math.log(rand() + 1e-12)) * Math.cos(2 * Math.PI * rand());
  const GENE = Object.fromEntries(S.GENES.map(g => [g.key, g]));
  // One child in GROUP_P resamples a whole gene group instead (S.GROUPS); a priority gene in a group comes back switched on.
  function regroup(C) {
    for (const key of S.GROUPS[Math.floor(rand() * S.GROUPS.length)]) {
      const gene = GENE[key], u = rand();
      if (gene.type === 'real') C[key] = /^(pol|proj)\./.test(key) ? u : gene.a + u * (gene.b - gene.a);
      else if (gene.type === 'int') C[key] = gene.a + Math.floor(u * (gene.b - gene.a + 1));
      else if (gene.type === 'bool') C[key] = u < 0.5;
      else C[key] = gene.a[Math.floor(u * gene.a.length)];
    }
    return Object.assign(C, PIN);
  }
  function mutate(G) {
    const C = Object.assign({}, G);
    if (rand() < GROUP_P) return regroup(C);
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
  const batch = b => Array.from({ length: GAMES }, (_, i) => 100000 + RUN * 50000 + b * GAMES + i);
  const out = process.env.OUT ? path.resolve(process.env.OUT + '_run' + RUN + '.json') : __dirname + '/best_genome' + (RUN ? '_run' + RUN : '') + '.json';
  // the genome is written as .partial.json while the run is in progress and renamed when it ends
  const part = out.replace(/\.json$/, '.partial.json');
  const logf = process.env.OUT ? path.resolve(process.env.OUT + '_run' + RUN + '.log') : __dirname + '/hillclimb.log';
  // genes a START genome lacks keep the expert's values
  // START may list one genome per run, in RUNS order
  const starts = (process.env.START || '').split(',').filter(Boolean), start = starts[RUNS.indexOf(RUN)] || starts[0];
  let parent = start ? Object.assign(S.expertGenome(), S.loadGenome(start)) : S.expertGenome();
  delete parent._rules;
  Object.assign(parent, PIN); PARENT = parent;
  const first = parent;
  const T0 = Date.now(), stamp = S.rulesStamp();
  let b = 0, seeds = batch(b);
  let pr = (await evalMany([parent], seeds))[0];
  console.log(`run ${RUN} gen 0  parent win ${(100 * pr.win).toFixed(1)}%  score ${pr.score.toFixed(0)}`);
  fs.writeFileSync(logf, '');
  for (let gen = 1; gen <= GENS; gen++) {
    if (gen % ROTATE === 0) { b++; seeds = batch(b); pr = (await evalMany([parent], seeds))[0]; }
    const kids = Array.from({ length: LAMBDA }, () => mutate(parent));
    const res = RACE_MARGIN > 0 ? await evalRace(kids, parent, seeds) : await evalMany(kids, seeds);
    let bi = -1; res.forEach((r, i) => { if (fit(r) > fit(bi < 0 ? pr : res[bi])) bi = i; });
    if (bi >= 0) {
      const changed = Object.keys(kids[bi]).filter(k => kids[bi][k] !== parent[k]).map(k => k + '=' + (typeof kids[bi][k] === 'number' ? Math.round(kids[bi][k] * 100) / 100 : kids[bi][k]));
      parent = kids[bi]; pr = res[bi]; PARENT = parent;
      const line = `run ${RUN} gen ${gen}  win ${(100 * pr.win).toFixed(1)}%  score ${pr.score.toFixed(0)}  loc ${(100 * pr.loc).toFixed(1)}%  changed: ${changed.join(', ')}`;
      console.log(line); fs.appendFileSync(logf, line + '\n');
      fs.writeFileSync(part, JSON.stringify(Object.assign({ _rules: stamp }, parent), null, 1));
    }
  }
  const secs = ((Date.now() - T0) / 1000).toFixed(0);
  if (process.env.KEEP !== '0' && parent !== first) {
    const held = Array.from({ length: 4000 }, (_, i) => 700000 + i), [hf, hs] = await evalMany([parent, first], held);
    const line = `run ${RUN} KEEP on 4000 held-out games: final ${hf.score.toFixed(1)}, start ${hs.score.toFixed(1)}; keeping the ${fit(hs) > fit(hf) ? 'start' : 'final'}`;
    console.log(line); fs.appendFileSync(logf, line + '\n');
    if (fit(hs) > fit(hf)) parent = first;
  }
  fs.writeFileSync(out, JSON.stringify(Object.assign({ _rules: stamp }, parent), null, 1)); try { fs.unlinkSync(part); } catch (_) {}
  const reuse = `${(100 * REUSED.games / Math.max(1, REUSED.games + REUSED.played)).toFixed(0)}% of games reused`;
  if (process.env.NOVAL) { console.log(`run ${RUN}: ${GENS} generations in ${secs} s; ${RACE.alive} of ${RACE.kids} raced children finished the batch; ${reuse}`); return; }
  // validate on fresh seeds neither saw
  const fresh = Array.from({ length: 4000 }, (_, i) => 900000 + i);
  const [vb] = await evalMany([parent], fresh);
  console.log(`\nrun ${RUN} VALIDATION on 4000 fresh games (${DIFF}): best ${(100 * vb.win).toFixed(1)}% (loc ${(100 * vb.loc).toFixed(1)}%, score ${vb.score.toFixed(0)})  [${secs} s, ${out}]`);
}

(async () => {
  if (!process.env.NOLOCK) await lock(); // NOLOCK=1 only for small tests that must run beside a search
  await takeSlots(!process.env.NOLOCK); // after the search lock, so a queued search holds no cores
  S = require('./strategy.js');
  workers = Array.from({ length: NW }, () => new Worker(__filename));
  for (const RUN of RUNS) await search(RUN);
  workers.forEach(w => w.terminate());
  process.exit(0);
})();
