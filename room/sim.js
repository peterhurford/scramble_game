// node room/sim.js [games] [bot...]: plays scripted rooms through room/engine.js and prints each one's grades and endings.
// look (only when named; slow) tries every move each turn and keeps the one that plays out best.
const R = require('./engine.js');
const N = +process.argv[2] || 5000, ONLY = process.argv.slice(3);

// A bot returns { w, bold }: each table makes the move whose acts weigh most under w (ties go to the first), and bold is the bold move wanted, if on offer.
const choose = (T, w, bold) => {
  const p = { bold: bold && T.bold.some(b => b.id === bold && !b.off) ? bold : null };
  for (const tb of T.tables) {
    const sc = x => x.acts.reduce((n, a) => n + (w[a] || 0), 0);
    p[tb.id] = tb.opts.filter(x => !x.off).reduce((best, x) => sc(x) > sc(best) ? x : best).id;
  }
  return p;
};
// Race only while the IC puts the whole step short of the danger range (or, with risk, while the odds are at most that).
const safe = (s, risk, lock) => !s.knownOver && R.view(s)[lock ? 'overIfLockP' : 'overIfRaceP'] <= (risk || 0);
const seenLead = s => s.us - s.cnShown;

// One parameterised room. o: lock (race behind locked doors: 'always', or 'warn' once hackers are inside), tests, squeeze (chip controls to reach), eyes, talks (bargain from this turn),
// take (worst offer level it signs), by (turn from which it signs whatever is on the table, if at most takeLate), risk, run (run a blockade), sab (turn to sabotage).
function room(s, T, o) {
  const v = R.view(s), lvl = s.offer, tests = s.knownOver ? 9 : Math.round(Math.log2(6 / (s.hi - s.lo)));
  const go = !s.deal && lvl != null && v.willing && (lvl <= o.take || (o.by != null && s.turn >= o.by && lvl <= o.takeLate));
  const needTest = tests < (o.tests || 0) || (o.take != null && !s.national && (!v.willing || s.labs + R.TUNE.labRace < R.TUNE.labInspect));
  const w = {
    race: go || !safe(s, o.risk) ? -10 : 2, lock: go || !safe(s, o.risk, true) ? -10 : seenLead(s) >= R.TUNE.hackLead - 3 && (o.lock === 'always' || (o.lock === 'warn' && v.hackers)) ? 3 : !safe(s, o.risk) ? 1.5 : -1, test: needTest ? 4 : !safe(s, o.risk) ? 1 : 0, hold: 0, slow: 0, secret: -5,
    tighten: s.controls < (o.squeeze || 0) && !v.strait.startsWith('Beijing') && !s.blockade ? 4 : -5, carrot: o.carrot && s.controls >= 0 ? 3 : -2,
    talk: o.talks != null && s.turn >= o.talks ? 3 : 1, inspect: 4, confront: 5, tolerate: -3, backdown: o.run ? -5 : 9,
    watch: s.eyes < (o.eyes || 0) ? 3 : 0, guard: o.guard ? 5 : v.hackers ? 2.6 : 1, deter: o.deter && s.deter < o.deter ? 2.5 : 0, run: o.run ? 9 : -5 };
  // the Pentagon covers any turn the labs work in the open with a lead worth stealing
  if (o.hunt && !s.deal && w.lock < Math.max(w.race, w.test) && seenLead(s) >= R.TUNE.hackLead - 1.5) w.guard = v.hackers ? 3.5 : 2.8;
  return { w, bold: go ? 'sign' : o.sab != null && s.turn === o.sab ? 'sabotage' : o.nat != null && s.turn === o.nat ? 'national' : null };
}
const BOTS = {
  random: (s, T, i) => {
    const p = {}, b = T.bold.filter(x => !x.off), k = Math.floor(R.hash01(i, s.turn, 'bold') * b.length * 3);   // a bold move one turn in three
    for (const tb of T.tables) { const o = tb.opts.filter(x => !x.off); p[tb.id] = o[Math.floor(R.hash01(i, s.turn, tb.id) * o.length)].id; }
    p.bold = k < b.length ? b[k].id : null;
    return p;
  },
  racer: () => ({ w: { race: 5, tighten: 2, guard: 1 } }),                       // races whatever the IC says
  holder: () => ({ w: { test: 2, talk: 1, guard: 1 } }),                          // tests and talks, never signs
  dove: (s, T) => room(s, T, { take: 3, talks: 0, carrot: true }),                // signs whatever Beijing offers
  hawk: (s, T) => room(s, T, { squeeze: 3, deter: 2, run: true }),                // squeezes and races, never secures
  lead: (s, T) => room(s, T, { lock: 'always', hunt: true, tests: 2, squeeze: 2, deter: 2, eyes: 1 }),
  leadWarn: (s, T) => room(s, T, { lock: 'warn', tests: 2, squeeze: 2, deter: 2, eyes: 1 }),
  leadOpen: (s, T) => room(s, T, { tests: 2, squeeze: 2, deter: 2, guard: true }),
  leadBold: (s, T) => room(s, T, { lock: 'always', hunt: true, tests: 2, squeeze: 3, deter: 2, risk: 0.3, run: true }),
  leadSab: (s, T) => room(s, T, { lock: 'always', hunt: true, tests: 2, squeeze: 2, deter: 2, sab: 5 }),
  pause: (s, T) => room(s, T, { lock: 'always', hunt: true, tests: 2, squeeze: 2, deter: 1, eyes: 1, talks: 2, take: 0, by: 6, takeLate: 1 }),
  pauseSoft: (s, T) => room(s, T, { lock: 'always', tests: 2, eyes: 1, talks: 1, take: 1, by: 5, takeLate: 2 }),
  pauseOpen: (s, T) => room(s, T, { tests: 2, squeeze: 2, eyes: 1, talks: 2, take: 0, by: 6, takeLate: 1, guard: true }),
  pauseBlind: (s, T) => room(s, T, { lock: 'always', tests: 2, talks: 1, take: 2 }),
  mixed: (s, T) => room(s, T, { lock: 'always', hunt: true, tests: 2, squeeze: 2, deter: 1, eyes: 2, talks: 3, take: 0 }),
};

// The game as the room sees it: every hidden fact redrawn within what the room knows.
function fog(s, k) {
  const c = JSON.parse(JSON.stringify(s)), u = n => R.hash01(s.seed, s.turn, 'fog', k, n), T = R.TUNE;
  c.line = s.knownOver ? s.line : Math.max(s.us + 0.01, s.lo + (s.hi - s.lo) * u('line'));
  if (!s.eyes && !s.thefts) { const d = T.cnFog * (2 * u('cn') - 1) * 0.8; c.cn = s.cnShown + d; }
  if (s.deal && !s.caught) { c.hidden = false; c.cn = c.cnShown; }
  if (s.eyes < 2) { const f = u('floor'); c.floor = f < T.floor[0] ? 0 : f < T.floor[1] ? 1 : 2; if (s.offer != null) c.floor = Math.min(c.floor, s.offer); c.bluff = u('bluff') < T.bluff; }
  if (!s.blockade) {   // a warning means the red line is within T.warn of today's tension; no warning means it is further off
    const d = T.deter * Math.min(2, s.deter), lo = Math.max(T.red[0], s.tension - d + (s.warned ? 1 : T.warn + 0.01)), hi = Math.max(lo, s.warned ? Math.min(T.red[1], s.tension - d + T.warn) : T.red[1]);
    c.red = lo + (hi - lo) * u('red');
  }
  c.hackRate = T.hack[0] + (T.hack[1] - T.hack[0]) * u('hack');
  return c;
}
// Every combination of moves, each scored by LOOK fogged games played out by the best of the scripted rooms (A 4 to F 0).
const LOOK = 8, PTS = { A: 4, B: 3, C: 2, D: 1, F: 0 };
BOTS.look = (s, T) => {
  const base = [BOTS.pause, BOTS.pauseSoft, BOTS.lead, BOTS.leadWarn, BOTS.leadOpen], fogs = [];
  for (let k = 0; k < LOOK; k++) fogs.push(JSON.stringify(fog(s, k)));
  const ids = T.tables.map(tb => tb.opts.filter(o => !o.off).map(o => o.id)), bolds = [null].concat(T.bold.filter(b => !b.off).map(b => b.id));
  let best = null, bv = -1;
  for (const wh of ids[0]) for (const state of ids[1]) for (const pent of ids[2]) for (const bold of bolds) {
    const p = { wh, state, pent, bold }; let v = 0;
    for (const bot of base) {
      let sum = 0;
      for (const f of fogs) { const g = JSON.parse(f); R.play(g, p); while (!g.over) { const T2 = R.turn(g), b = bot(g, T2); R.play(g, choose(T2, b.w, b.bold)); } sum += PTS[g.over.grade]; }
      v = Math.max(v, sum / LOOK);
    }
    if (v > bv) { bv = v; best = p; }
  }
  return best;
};

module.exports = { BOTS, choose };
if (require.main === module) for (const [name, bot] of Object.entries(BOTS)) {
  if (ONLY.length ? !ONLY.includes(name) : name === 'look') continue;
  const how = {}, grade = {}, used = {}; let thefts = 0, deals = 0, pts = 0;
  for (let i = 0; i < N; i++) {
    const s = R.newGame(i); let deal = false;
    while (!s.over) { const T = R.turn(s), b = bot(s, T, i); R.play(s, b.w ? choose(T, b.w, b.bold) : b); deal = deal || !!s.deal; }
    how[s.over.how] = (how[s.over.how] || 0) + 1; grade[s.over.grade] = (grade[s.over.grade] || 0) + 1; thefts += s.thefts > 0; deals += deal; pts += PTS[s.over.grade];
    if (name === 'look') for (const v of s.votes) for (const k in v.picks) { const m = (k === 'bold' ? 'BOLD ' : '') + v.picks[k]; used[m] = (used[m] || 0) + 1; }
  }
  const f = o => Object.entries(o).sort((a, b) => b[1] - a[1]).map(([k, n]) => k + ' ' + Math.round(100 * n / N)).join(', ');
  console.log(name.padEnd(10), ['A', 'B', 'C', 'D', 'F'].map(g => g + ' ' + String(Math.round(100 * (grade[g] || 0) / N)).padStart(2)).join('  '), '| mean', (pts / N).toFixed(2), '| theft', Math.round(100 * thefts / N), '| deal', Math.round(100 * deals / N), '|', f(how));
  for (const [m, n] of Object.entries(used).sort((a, b) => b[1] - a[1])) console.log('  ' + m, (n / N).toFixed(2));
}
