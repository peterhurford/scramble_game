// node room/sim.js [games]: plays scripted cabinets through room/engine.js and prints each one's grades and endings.
const R = require('./engine.js');
const N = +process.argv[2] || 20000;

// A bot returns { vp, dni, doc, state, war }; ok() swaps a pick that is not on offer for the seat's last open option.
const ok = (s, picks) => { for (const seat of R.seats(s)) { const o = seat.opts.filter(x => !x.off); if (!o.find(x => x.id === picks[seat.id])) picks[seat.id] = o[o.length - 1].id; } return picks; };
const has = (s, seat, id) => R.seats(s).find(x => x.id === seat).opts.some(o => o.id === id && !o.off);
const wants = (s, a) => s.asks.some((x, i) => x === a && s.known[i]);
// Race while the odds of ending the turn past the line are at most max, else hold.
const pace = (s, max) => !s.knownOver && R.view(s).overIfRaceP <= max ? 'race' : 'hold';
const calm = s => R.view(s).warP > 0 ? 'deter' : 'reassure';

// A cabinet that works together: secure the labs (o.sec steps), squeeze o.squeeze times, learn Beijing's price, pay it, then verify.
function team(s, o) {
  const v = R.view(s);
  if (s.deal) return {
    vp: 'hold', dni: has(s, 'dni', 'mole') ? 'mole' : 'beijing',
    doc: s.labs < 60 || s.controls <= 0 ? 'pay' : 'carrot',
    state: s.caught ? 'confront' : o.verify === false ? 'talk' : s.inspectors && s.trust < 60 ? 'talk' : 'inspect',
    war: s.caught ? 'deter' : calm(s) };
  const known = s.known.every(Boolean), go = (known || s.turn >= 3) && s.sec >= Math.min(o.sec, 1) && s.turn >= 1;
  if (go) return {
    vp: v.willing && has(s, 'state', 'summit') ? 'hold' : pace(s, o.risk), dni: s.sec < o.sec && v.willing ? 'lock' : 'beijing',
    doc: wants(s, 'chips') && s.controls > 0 ? 'carrot' : 'pay',
    state: v.willing && has(s, 'state', 'summit') ? 'summit' : 'talk', war: wants(s, 'pacific') ? 'reassure' : calm(s) };
  return {
    vp: pace(s, o.risk), dni: !known ? 'beijing' : s.sec < o.sec ? 'lock' : 'labs',
    doc: s.turn < o.squeeze ? 'tighten' : 'pay',
    state: has(s, 'state', 'hotline') ? 'hotline' : 'talk', war: has(s, 'war', 'burn') ? 'burn' : calm(s) };
}
// A team cabinet answers the turn's crisis.
const react = (s, p) => { const c = s.crisis; if (c === 'ultimatum') p.doc = 'carrot'; if (c === 'exodus') p.doc = 'pay'; if (c === 'defector') p.dni = 'beijing'; if (c === 'hardliners') p.state = 'talk'; if (c === 'zeroday' && has(s, 'dni', 'lock')) p.dni = 'lock'; return p; };
const BOTS = {
  random: (s, i) => { const p = {}; for (const seat of R.seats(s)) { const o = seat.opts.filter(x => !x.off); p[seat.id] = o[Math.floor(R.hash01(i, s.turn, seat.id) * o.length)].id; } return p; },
  racer: s => ({ vp: 'race', dni: 'lock', doc: 'tighten', state: 'allies', war: 'deter' }),
  holder: s => ({ vp: 'hold', dni: 'labs', doc: 'pay', state: 'talk', war: 'reassure' }),
  dove: s => ({ vp: s.deal || (s.turn && R.view(s).willing && has(s, 'state', 'summit')) ? 'hold' : pace(s, 0), dni: 'beijing', doc: 'carrot', state: s.deal ? 'talk' : s.turn && R.view(s).willing && has(s, 'state', 'summit') ? 'summit' : 'talk', war: 'reassure' }),   // talks, never secures or verifies
  hawk: s => ({ vp: has(s, 'vp', 'national') ? 'national' : pace(s, 0), dni: 'lock', doc: s.controls < 3 ? 'tighten' : 'pay', state: 'allies', war: has(s, 'war', 'burn') ? 'burn' : 'deter' }),
  saboteur: s => ({ vp: pace(s, 0), dni: 'lock', doc: s.controls < 3 ? 'tighten' : 'pay', state: 'allies', war: s.turn % 2 ? 'sabotage' : 'deter' }),
  gambler: s => ({ vp: pace(s, 0.5), dni: 'labs', doc: 'pay', state: 'allies', war: 'deter' }),
  team: s => react(s, team(s, { sec: 1, risk: 0.2, squeeze: 0 })),
  teamVault: s => react(s, team(s, { sec: 2, risk: 0.2, squeeze: 0 })),
  teamLever: s => react(s, team(s, { sec: 1, risk: 0.2, squeeze: 1 })),
  teamTrust: s => react(s, team(s, { sec: 1, risk: 0.2, squeeze: 0, verify: false })),
  split: s => ({ vp: s.deal ? 'hold' : pace(s, 0.5), dni: 'labs', doc: 'tighten', state: s.deal ? 'inspect' : s.turn % 2 ? 'summit' : 'talk', war: 'deter' }),   // each seat does its own thing
};

for (const [name, bot] of Object.entries(BOTS)) {
  const how = {}, grade = {}; let thefts = 0, deals = 0;
  for (let i = 0; i < N; i++) {
    const s = R.newGame(i); let deal = false;
    while (!s.over) { R.play(s, ok(s, bot(s, i))); deal = deal || s.deal; }
    how[s.over.how] = (how[s.over.how] || 0) + 1; grade[s.over.grade] = (grade[s.over.grade] || 0) + 1; thefts += s.thefts > 0; deals += deal;
  }
  const f = o => Object.entries(o).sort((a, b) => b[1] - a[1]).map(([k, n]) => k + ' ' + Math.round(100 * n / N) + '%').join(', ');
  console.log(name.padEnd(9), ['A', 'B', 'C', 'D', 'F'].map(g => g + ' ' + String(Math.round(100 * (grade[g] || 0) / N)).padStart(2) + '%').join('  '), '| theft', Math.round(100 * thefts / N) + '%', '| deal', Math.round(100 * deals / N) + '%', '|', f(how));
}
