// node room/sim.js [games]: plays scripted cabinets through room/engine.js and prints each one's grades and endings.
const R = require('./engine.js');
const N = +process.argv[2] || 20000;

// A bot returns { vp, dni, doc, state, war }; ok() falls back to the seat's first open option when a pick is off.
const ok = (s, picks) => { for (const seat of R.seats(s)) { const o = seat.opts.filter(x => !x.off); if (!o.find(x => x.id === picks[seat.id])) picks[seat.id] = o[0].id; } return picks; };
// Race while the odds of ending the turn past the line are at most max; else fortify until there is nothing left to build, then hold.
const pace = (s, max, build) => s.deal ? (build && !s.boxed ? 'fortify' : 'hold') : build && s.sec < build ? 'fortify' : !s.knownOver && R.view(s).overIfRaceP <= max ? 'race' : 'hold';
const talk = s => s.deal ? (s.inspectors ? 'talk' : 'inspect') : R.view(s).dealP >= 0.5 ? 'summit' : 'talk';
const BOTS = {
  random: (s, i) => { const p = {}; for (const seat of R.seats(s)) { const o = seat.opts.filter(x => !x.off); p[seat.id] = o[Math.floor(R.hash01(i, s.turn, seat.id) * o.length)].id; } return p; },
  racer: s => ({ vp: 'race', dni: 'guard', doc: 'tighten', state: 'allies', war: 'deter' }),
  holder: s => ({ vp: s.boxed ? 'hold' : 'fortify', dni: 'labs', doc: 'enforce', state: 'talk', war: 'reassure' }),
  dove: s => ({ vp: pace(s, 0, 0), dni: s.deal ? 'beijing' : 'labs', doc: 'enforce', state: talk(s), war: 'reassure' }),
  hawk: s => ({ vp: pace(s, 0, 1), dni: 'guard', doc: 'tighten', state: 'allies', war: 'deter' }),
  saboteur: s => ({ vp: pace(s, 0, 1), dni: 'guard', doc: 'tighten', state: 'allies', war: s.turn % 2 ? 'sabotage' : 'deter' }),
  gambler: s => ({ vp: pace(s, 0.5, 1), dni: 'labs', doc: 'tighten', state: 'allies', war: 'deter' }),
  planner: s => ({ vp: pace(s, 0.2, 1), dni: s.deal ? 'beijing' : s.sec ? 'labs' : 'guard', doc: 'enforce', state: talk(s), war: R.view(s).warP > 0 ? 'deter' : 'reassure' }),
  lever: s => ({ vp: pace(s, 0.2, 1), dni: s.deal ? 'beijing' : s.sec ? 'labs' : 'guard', doc: !s.deal && s.turn < 1 ? 'tighten' : 'enforce', state: talk(s), war: R.view(s).warP > 0 ? 'deter' : 'reassure' }),
  vault: s => ({ vp: pace(s, 0.2, 2), dni: s.deal ? 'beijing' : 'guard', doc: 'enforce', state: talk(s), war: R.view(s).warP > 0 ? 'deter' : 'reassure' }),
  split: s => ({ vp: pace(s, 0.5, 0), dni: 'labs', doc: 'tighten', state: talk(s), war: 'deter' }),   // each seat does its own thing
};

for (const [name, bot] of Object.entries(BOTS)) {
  const how = {}, grade = {}; let thefts = 0, turns = 0;
  for (let i = 0; i < N; i++) {
    const s = R.newGame(i);
    while (!s.over) R.play(s, ok(s, bot(s, i)));
    how[s.over.how] = (how[s.over.how] || 0) + 1; grade[s.over.grade] = (grade[s.over.grade] || 0) + 1; thefts += s.thefts > 0; turns += s.votes.length;
  }
  const f = o => Object.entries(o).sort((a, b) => b[1] - a[1]).map(([k, n]) => k + ' ' + Math.round(100 * n / N) + '%').join(', ');
  console.log(name.padEnd(9), ['A', 'B', 'C', 'D', 'F'].map(g => g + ' ' + String(Math.round(100 * (grade[g] || 0) / N)).padStart(2) + '%').join('  '), '| theft', Math.round(100 * thefts / N) + '%', '| turns', (turns / N).toFixed(1), '|', f(how));
}
