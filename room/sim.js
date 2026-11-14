// node room/sim.js [games]: plays scripted rooms through room/engine.js and prints each one's grades and endings.
const R = require('./engine.js');
const N = +process.argv[2] || 20000;

// A bot returns [throttle, cardId]; pick(s, ids) takes the first card on offer.
const pick = (s, ids) => { const c = R.cards(s).filter(c => !c.off); return (ids.map(id => c.find(x => x.id === id)).find(Boolean) || c[0]).id; };
const safe = (s, max) => { const v = R.view(s); return !s.deal && !v.knownOver && v.overIfRace <= max ? 'race' : 'hold'; };
const BOTS = {
  random: (s, i) => [R.hash01(i, s.turn, 'a') < 0.5 ? 'race' : 'hold', (c => c[Math.floor(R.hash01(i, s.turn, 'b') * c.length)].id)(R.cards(s).filter(c => !c.off))],
  racer: s => ['race', pick(s, ['chips', 'distill', 'sabotage'])],
  holder: s => ['hold', pick(s, ['sl4', 'tripwires', 'sl5', 'protocols'])],
  dove: s => [safe(s, 0), pick(s, ['backchannel', 'summit', 'inspectors', 'deepen'])],
  hawk: s => [safe(s, 0), pick(s, ['sl4', 'chips', 'distill', 'tripwires', 'sl5', 'sabotage'])],
  hawkGamble: s => [safe(s, 0.5), pick(s, ['sl4', 'chips', 'distill', 'sl5', 'sabotage'])],
  secureDove: s => [safe(s, 0), pick(s, s.sl === 3 ? ['sl4'] : ['backchannel', 'summit', 'inspectors', 'sl5', 'tripwires'])],
  lever: s => [safe(s, 0), pick(s, s.sl === 3 ? ['sl4'] : !s.chips && !s.deal && !s.backchannel ? ['chips'] : ['backchannel', 'summit', 'inspectors', 'sl5', 'tripwires'])],
  planner: s => [safe(s, 0.2), pick(s, s.sl === 3 ? ['sl4'] : ['backchannel', 'summit', 'inspectors', 'tripwires', 'sl5'])],
  talkFirst: s => [safe(s, 0.2), pick(s, !s.backchannel && !s.deal ? ['backchannel'] : s.sl === 3 ? ['sl4'] : ['summit', 'inspectors', 'tripwires', 'sl5'])],
  squeezeTalk: s => [safe(s, 0.2), pick(s, s.sl === 3 ? ['sl4'] : !s.chips && !s.deal && !s.backchannel && s.turn < 2 ? ['chips'] : ['backchannel', 'summit', 'inspectors', 'tripwires', 'sl5'])],
  balanced: s => [safe(s, 0.2), pick(s, s.sl === 3 ? ['sl4'] : !s.tripwires ? ['tripwires'] : ['backchannel', 'summit', 'inspectors', 'sl5'])],
};

for (const [name, bot] of Object.entries(BOTS)) {
  const how = {}, grade = {}; let thefts = 0, turns = 0;
  for (let i = 0; i < N; i++) {
    const s = R.newGame(i);
    while (!s.over) { const [t, c] = bot(s, i); R.play(s, t, c); }
    how[s.over.how] = (how[s.over.how] || 0) + 1; grade[s.over.grade] = (grade[s.over.grade] || 0) + 1; thefts += s.thefts > 0; turns += s.votes.length;
  }
  const f = o => Object.entries(o).sort((a, b) => b[1] - a[1]).map(([k, n]) => k + ' ' + Math.round(100 * n / N) + '%').join(', ');
  console.log(name.padEnd(11), ['A', 'B', 'C', 'D', 'F'].map(g => g + ' ' + String(Math.round(100 * (grade[g] || 0) / N)).padStart(2) + '%').join('  '), '| theft', Math.round(100 * thefts / N) + '%', '| turns', (turns / N).toFixed(1), '|', f(how));
}
