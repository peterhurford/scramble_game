// node room/sim.js [games] [bot...]: plays scripted rooms through room/engine.js and prints each one's grades and endings.
// look (only when named; slow) tries every move each turn and keeps the one that plays out best.
const R = require('./engine.js');
const N = +process.argv[2] || 20000, ONLY = process.argv.slice(3);

// A bot returns { w, bold }: each table makes the move whose acts weigh most under w (ties go to the first), and bold is the bold move wanted, if on offer.
const choose = (T, w, bold) => {
  const p = { bold: bold && T.bold.some(b => b.id === bold && !b.off) ? bold : null };
  for (const tb of T.tables) {
    const sc = x => x.acts.reduce((n, a) => n + (w[a] || 0), 0);
    p[tb.id] = tb.opts.filter(x => !x.off).reduce((best, x) => sc(x) > sc(best) ? x : best).id;
  }
  return p;
};
const wants = (s, a) => s.asks.some((x, i) => x === a && s.known[i]);
// Race while the odds of ending the turn past the line are at most max.
const safe = (s, max) => !s.knownOver && R.view(s).overIfRaceP <= max;
const canPause = (s, T) => R.willing(s) && T.bold.some(b => b.id === 'summit' && !b.off);
const pentW = (s, eyes) => ({ watch: s.eyes < eyes ? 3 : 0, deter: R.view(s).warP > 0.02 ? 4 : 0, guard: s.sec < 2 ? 2 : 1, exfil: 3, burn: 2 });

// A room working toward a pause: bring the labs round, lock the weights (o.sec steps), learn Beijing's price, pay it, propose, then verify.
function pause(s, T, o) {
  const known = s.known.every(Boolean), met = R.price(s).filter(p => p.known && p.met).length;
  const go = !s.deal && canPause(s, T) && (known ? met === 2 : s.turn >= 4);
  const w = Object.assign(pentW(s, o.eyes), {
    race: go || !safe(s, o.risk) ? -10 : s.turn < o.races || s.labs + R.TUNE.labRace >= R.TUNE.labWilling ? 2 : 0, test: R.willing(s) || s.turn < o.races ? 1 : 4,   // race o.races turns, then only while the labs would still stop
    secure: s.sec < o.sec ? 3 : 0, secret: -5, offline: 3, surge: -3,
    talk: !known ? 4 : s.trust < R.TUNE.warm || s.tension >= R.TUNE.calm ? 3 : 1,
    carrot: (wants(s, 'chips') && s.controls >= 0) || s.crisis === 'ultimatum' || s.crisis === 'hardliners' ? 5 : -1,
    tighten: -3, hotline: 3, share: -1, inspect: o.verify === false ? -1 : 3, snap: o.verify === false ? -1 : 2, confront: 3, tolerate: -3 });
  return { w, bold: go ? 'summit' : null };
}
// A room trying to win the race: squeeze China, lock the weights, race up to the range, then stop.
function lead(s, T, o) {
  const w = Object.assign(pentW(s, 0), {
    race: safe(s, o.risk) ? 2 : -10, secure: s.sec < o.sec ? 4 : 0, test: (!s.national && s.labs < (o.labs || 0)) || (s.sec >= o.sec && !s.knownOver && 6 / (s.hi - s.lo) < 2 ** (o.tests || 0) - 0.01) ? 5 : 0, offline: 1, surge: safe(s, 0) ? 2 : -10,
    tighten: s.controls < (o.squeeze || 3) ? 5 : -1, talk: 1, carrot: s.crisis === 'ultimatum' && o.yield ? 6 : -5, hotline: 6, share: 4 });
  return { w, bold: o.sabotage && s.turn === o.sabotage ? 'sabotage' : null };
}
const BOTS = {
  random: (s, T, i) => {
    const p = {}, b = T.bold.filter(x => !x.off), k = Math.floor(R.hash01(i, s.turn, 'bold') * b.length * 3);   // a bold move one turn in three
    for (const tb of T.tables) { const o = tb.opts.filter(x => !x.off); p[tb.id] = o[Math.floor(R.hash01(i, s.turn, tb.id) * o.length)].id; }
    p.bold = k < b.length ? b[k].id : null;
    return p;
  },
  racer: () => ({ w: { race: 5, surge: 1, tighten: 2, guard: 1 } }),
  holder: () => ({ w: { test: 2, talk: 1, guard: 1 } }),
  // talks, never secures or verifies
  dove: (s, T) => { const go = !s.deal && canPause(s, T) && s.turn >= 2; return { w: { race: go || !safe(s, 0) ? -10 : 2, test: R.willing(s) ? 1 : 4, talk: 3, carrot: 2, hotline: 2, guard: 1, secret: -5, tolerate: 1 }, bold: go ? 'summit' : null }; },
  // squeezes and races, never secures
  hawk: (s, T) => lead(s, T, { sec: 0, risk: 0 }),
  pause: (s, T) => pause(s, T, { sec: 1, risk: 0, eyes: 2, races: 1 }),
  pauseVault: (s, T) => pause(s, T, { sec: 2, risk: 0, eyes: 2, races: 1 }),
  pauseOpen: (s, T) => pause(s, T, { sec: 0, risk: 0, eyes: 2, races: 1 }),
  pauseBlind: (s, T) => pause(s, T, { sec: 1, risk: 0, eyes: 0, verify: false, races: 1 }),
  pauseLate: (s, T) => pause(s, T, { sec: 1, risk: 0, eyes: 2, races: 2 }),
  lead: (s, T) => lead(s, T, { sec: 1, risk: 0, labs: 40 }),
  leadVault: (s, T) => lead(s, T, { sec: 2, risk: 0, labs: 40 }),
  leadOpen: (s, T) => lead(s, T, { sec: 0, risk: 0, labs: 40 }),
  leadBold: (s, T) => lead(s, T, { sec: 1, risk: 0.3, labs: 40 }),
  leadSoft: (s, T) => lead(s, T, { sec: 1, risk: 0, labs: 40, squeeze: 2 }),
  leadDeaf: (s, T) => lead(s, T, { sec: 1, risk: 0 }),
  leadTest: (s, T) => lead(s, T, { sec: 1, risk: 0.2, labs: 40, tests: 1 }),
  leadTest2: (s, T) => lead(s, T, { sec: 1, risk: 0.2, labs: 40, tests: 2 }),
  leadVTest: (s, T) => lead(s, T, { sec: 2, risk: 0.2, labs: 40, tests: 1 }),
  // the pause room, with sabotage as the fallback once Beijing has not signed by turn 4
  adapt: (s, T) => { const b = pause(s, T, { sec: 1, risk: 0, eyes: 2, races: 1 }); if (!s.deal && !b.bold && s.turn >= 4) b.bold = 'sabotage'; return b; },
  // each table does its own thing: the White House races, State works toward a pause, the Pentagon squares up
  split: (s, T) => ({ w: { race: safe(s, 0.5) ? 3 : -5, talk: 2, carrot: 1, deter: 2 }, bold: s.turn % 2 ? 'summit' : null }),
};


// The game as the room sees it: new dice, the line anywhere in the IC's range, unknown demands redrawn, no hidden cheating.
function fog(s, k) {
  const c = JSON.parse(JSON.stringify(s)), u = R.hash01(s.seed, s.turn, 'fog', k);
  c.seed = 'fog' + s.seed + '.' + s.turn + '.' + k;
  c.line = s.lo + ((s.knownOver ? Math.min(s.hi, s.us) : s.hi) - s.lo) * u;
  const free = ['chips', 'pacific', 'face'].filter(a => !s.asks.some((x, i) => x === a && s.known[i]))
    .map((a, i) => [R.hash01(c.seed, 'ask', i), a]).sort((x, y) => x[0] - y[0]).map(x => x[1]);
  c.asks = s.asks.map((a, i) => s.known[i] ? a : free.pop());
  if (s.deal && !s.caught) { c.hidden = false; c.cn = c.cnShown; }
  return c;
}
// Every combination of moves, each scored by LOOK fogged games played out by the best of four scripted rooms (A 4 to F 0).
const LOOK = 10, PTS = { A: 4, B: 3, C: 2, D: 1, F: 0 };
BOTS.look = (s, T) => {
  const base = [BOTS.pause, BOTS.adapt, BOTS.leadVTest, BOTS.leadVault], fogs = [];
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
  const how = {}, grade = {}; let thefts = 0, deals = 0;
  for (let i = 0; i < N; i++) {
    const s = R.newGame(i); let deal = false;
    while (!s.over) { const T = R.turn(s), b = bot(s, T, i); R.play(s, b.w ? choose(T, b.w, b.bold) : b); deal = deal || s.deal; }
    how[s.over.how] = (how[s.over.how] || 0) + 1; grade[s.over.grade] = (grade[s.over.grade] || 0) + 1; thefts += s.thefts > 0; deals += deal;
  }
  const f = o => Object.entries(o).sort((a, b) => b[1] - a[1]).map(([k, n]) => k + ' ' + Math.round(100 * n / N) + '%').join(', ');
  console.log(name.padEnd(10), ['A', 'B', 'C', 'D', 'F'].map(g => g + ' ' + String(Math.round(100 * (grade[g] || 0) / N)).padStart(2) + '%').join('  '), '| theft', Math.round(100 * thefts / N) + '%', '| deal', Math.round(100 * deals / N) + '%', '|', f(how));
}
