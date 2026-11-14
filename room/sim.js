// node room/sim.js [games]: plays scripted rooms through room/engine.js and prints each one's grades and endings.
const R = require('./engine.js');
const N = +process.argv[2] || 20000;

// A bot returns { w, bold }: each table takes the answer, from either of its questions, whose acts weigh most under w (ties go to the first), and bold is the bold move wanted, if on offer.
const choose = (T, w, bold) => {
  const p = { bold: bold && T.bold.some(b => b.id === bold && !b.off) ? bold : null };
  for (const tb of T.tables) {
    const sc = x => x.acts.reduce((n, a) => n + (w[a] || 0), 0);
    p[tb.id] = tb.qs.flatMap(d => d.opts).filter(x => !x.off).reduce((best, x) => sc(x) > sc(best) ? x : best).id;
  }
  return p;
};
const wants = (s, a) => s.asks.some((x, i) => x === a && s.known[i]);
// Race while the odds of ending the turn past the line are at most max.
const safe = (s, max) => !s.knownOver && R.view(s).overIfRaceP <= max;
const pace = (s, max) => safe(s, max) ? { race: 2 } : { race: -5 };
const canPause = (s, T) => R.willing(s) && T.bold.some(b => b.id === 'summit' && !b.off);

// A room that works together: secure the labs (o.sec steps), squeeze o.squeeze times, learn Beijing's price, pay it, propose, then verify.
function team(s, T, o) {
  const known = s.known.every(Boolean), met = R.price(s).filter(p => p.known && p.met).length;
  const go = !s.deal && s.turn >= 1 && canPause(s, T) && (known ? met === 2 || s.turn >= 4 : s.turn >= 3);
  const w = Object.assign({}, go ? { race: -10 } : pace(s, o.risk), {
    secure: s.sec < o.sec ? 3 : 0, lock: s.sec < o.sec ? 2 : -1, box: 2, test: 1, compute: 3, wait: 2, secret: -5, offline: 3, shelve: -1,
    talk: known ? 2 : 4, carrot: (wants(s, 'chips') && s.controls > 0) || s.crisis === 'ultimatum' || s.crisis === 'hardliners' ? 5 : -1,
    tighten: s.turn < o.squeeze ? 5 : -3, allies: wants(s, 'face') || !known ? -1 : 1, hotline: 3, expose: -3, private: 2, share: -1,
    inspect: o.verify === false ? -1 : 3, snap: o.verify === false ? -1 : 1, confront: 3, tolerate: -3,
    watch: s.deal || !known ? 2 : 0, bury: 1, guard: 1, exfil: 3, mole: 1, burn: wants(s, 'pacific') ? -1 : 2, preempt: -2,
    reassure: wants(s, 'pacific') || s.tension >= 45 ? 2 : 0, deter: s.caught || R.view(s).warP > 0 ? 1 : 0 });
  return { w, bold: go ? 'summit' : null };
}
const HAWK = { tighten: 2, allies: 1, deter: 1, lock: 2, guard: 1, burn: 2, expose: 2, compute: 1, back: 1, watch: 1, exfil: 1, share: 1, confront: 1 };
const BOTS = {
  random: (s, T, i) => {
    const p = {}, b = T.bold.filter(x => !x.off), k = Math.floor(R.hash01(i, s.turn, 'bold') * b.length * 3);   // a bold move one turn in three
    for (const tb of T.tables) { const o = tb.qs.flatMap(d => d.opts).filter(x => !x.off); p[tb.id] = o[Math.floor(R.hash01(i, s.turn, tb.id) * o.length)].id; }
    p.bold = k < b.length ? b[k].id : null;
    return p;
  },
  racer: () => ({ w: Object.assign({ race: 5, secret: 5 }, HAWK), bold: 'breakout' }),
  holder: () => ({ w: { race: -5, secure: 1, test: 1, box: 1, talk: 1, reassure: 1, guard: 1, bury: 1, wait: 1, hotline: 1, private: 1 } }),
  // talks, never secures or verifies
  dove: (s, T) => { const go = s.turn >= 1 && !s.deal && canPause(s, T); return { w: Object.assign(go ? { race: -10 } : pace(s, 0), { talk: 3, carrot: 2, reassure: 2, hotline: 2, private: 1, watch: 1, wait: 1, tolerate: 1, secure: -1, lock: -1, inspect: -1, snap: -1 }), bold: go ? 'summit' : null }; },
  hawk: s => ({ w: Object.assign(pace(s, 0), HAWK), bold: 'national' }),
  saboteur: s => ({ w: Object.assign(pace(s, 0), HAWK), bold: s.turn % 2 ? 'sabotage' : null }),
  gambler: s => ({ w: Object.assign(pace(s, 0.5), { allies: 1, deter: 1, guard: 1 }) }),
  team: (s, T) => team(s, T, { sec: 1, risk: 0.2, squeeze: 0 }),
  teamVault: (s, T) => team(s, T, { sec: 2, risk: 0.2, squeeze: 0 }),
  teamLever: (s, T) => team(s, T, { sec: 1, risk: 0.2, squeeze: 1 }),
  teamTrust: (s, T) => team(s, T, { sec: 1, risk: 0.2, squeeze: 0, verify: false }),
  // each table does its own thing: the White House races, State proposes a pause, the Pentagon squares up
  split: (s, T) => ({ w: Object.assign(pace(s, 0.5), { tighten: 1, inspect: 1, deter: 1, lock: 1 }), bold: s.turn % 2 ? 'summit' : null }),
};

module.exports = { BOTS, choose };
if (require.main === module) for (const [name, bot] of Object.entries(BOTS)) {
  const how = {}, grade = {}; let thefts = 0, deals = 0;
  for (let i = 0; i < N; i++) {
    const s = R.newGame(i); let deal = false;
    while (!s.over) { const T = R.turn(s), b = bot(s, T, i); R.play(s, b.w ? choose(T, b.w, b.bold) : b); deal = deal || s.deal; }
    how[s.over.how] = (how[s.over.how] || 0) + 1; grade[s.over.grade] = (grade[s.over.grade] || 0) + 1; thefts += s.thefts > 0; deals += deal;
  }
  const f = o => Object.entries(o).sort((a, b) => b[1] - a[1]).map(([k, n]) => k + ' ' + Math.round(100 * n / N) + '%').join(', ');
  console.log(name.padEnd(9), ['A', 'B', 'C', 'D', 'F'].map(g => g + ' ' + String(Math.round(100 * (grade[g] || 0) / N)).padStart(2) + '%').join('  '), '| theft', Math.round(100 * thefts / N) + '%', '| deal', Math.round(100 * deals / N) + '%', '|', f(how));
}
