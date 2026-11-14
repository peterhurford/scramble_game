// Why a turn went as it did. explain(state, ruling) replays the turn once as ruled and once more without each part of the ruling
// (each dial that was moved, each rolled outcome, and each die turned the other way), and reports what that part changed.
// The parts interact, so their effects need not add up to the turn's total. Used by room/replay.js.
'use strict';
const W = require('./world.js');
const copy = x => JSON.parse(JSON.stringify(x));
const NUMS = ['lead', 'us', 'cn', 'hack', 'tension', 'trust', 'labs', 'secWork', 'danger'];

// The numbers the endings turn on, hidden ones included.
function snap(s) {
  return { lead: s.us - s.cn, shown: s.us - s.cnShown, us: s.us, cn: s.cn, hack: s.hack, tension: s.tension, trust: s.trust, labs: s.labs, secWork: s.secWork, danger: s.line - s.us,
    security: W.SECURITY[W.secLevel(s)], redLine: s.red + W.TUNE.deter * Math.min(2, s.deter), thefts: s.thefts,
    flags: [s.deal && 'pause in force', s.blockade && 'Taiwan blockaded', s.seenHack && 'hackers seen inside', s.national && 'labs nationalized', s.law && 'labs bound by law', s.knownOver && 'danger point found', s.over && 'ended: ' + s.over.title].filter(Boolean) };
}
function run(s0, ruling) { const s = copy(s0), events = W.play(s, ruling); return { s, events, snap: snap(s) }; }

// Each part of a ruling, with the ruling as it would be without that part. base is the standing split of engineers (or flat out).
function parts(s0, r, base) {
  const out = [], D = W.DEFAULT, f = x => Math.round(x * 100) / 100, without = (label, change) => out.push({ label, ruling: Object.assign(copy(r), change) });
  base = Object.assign({ train: 1, secure: 0, test: 0, hunt: 0 }, base || {});
  if (['train', 'secure', 'test'].some(k => Math.abs(r[k] - base[k]) > 0.01)) without('Engineers: train ' + f(r.train) + ', secure ' + f(r.secure) + ', test ' + f(r.test) + ' (was ' + f(base.train) + ', ' + f(base.secure) + ', ' + f(base.test) + ')', { train: base.train, secure: base.secure, test: base.test });
  if (Math.abs(r.hunt - base.hunt) > 0.01) without('NSA on the labs: ' + f(r.hunt) + ' (was ' + f(base.hunt) + ')', { hunt: base.hunt });
  const NAMES = { nationalize: 'Takeover of the labs', law: 'Congress binds the labs', breakout: 'America leaves the pause', backdown: 'Chip controls lifted to end the blockade', run: 'Convoy through the blockade', intel: 'Effort to place a source in Beijing', deter: 'Show of force around Taiwan', sabotage: 'Covert attack on China\'s training' };
  for (const k in NAMES) if (r[k]) without(NAMES[k], { [k]: false });
  if (r.controls) without(r.controls > 0 ? 'Chip controls tightened' : 'Chip controls eased', { controls: 0 });
  if (r.propose) { without('Pause proposed (' + W.terms(r.propose).join('; ') + ')', { propose: null }); if (r.leverage) without('Game master\'s leverage on the pause: ' + r.leverage, { leverage: 0 }); }
  if (r.care) without('Game master\'s judgment of the room\'s care: ' + f(r.care), { care: 0 });
  for (const k of ['tension', 'trust', 'labs', 'cn', 'us', 'hack']) if (r[k]) without('Game master\'s nudge: ' + k + ' ' + (r[k] > 0 ? '+' : '') + f(r[k]), { [k]: D[k] });
  return out;
}

function diff(a, b) {   // a: as it happened; b: without the part
  const d = {}; for (const k of NUMS) if (Math.abs(a.snap[k] - b.snap[k]) > 0.005) d[k] = a.snap[k] - b.snap[k];
  const ta = a.events.map(e => e.title), tb = b.events.map(e => e.title);
  return { d, gained: ta.filter(t => !tb.includes(t)), lost: tb.filter(t => !ta.includes(t)) };
}

function explain(s0, ruling, base) {
  const r = W.rule(s0, ruling), real = run(s0, r), rolls = real.s.last ? real.s.last.rolls : [];
  // pin every die to what it rolled, so removing one part does not re-roll another
  const pinned = copy(r); pinned.chances.forEach((c, i) => { const k = rolls.filter(x => x.what === c.what)[0]; if (k && !k.skipped && c.force == null) c.force = k.hit; });
  const effects = parts(s0, pinned, base).map(p => Object.assign({ label: p.label }, diff(real, run(s0, p.ruling))));
  const blank = { tone: 'info', title: '', text: '', by: '' }, dice = [];
  pinned.chances.forEach((c, i) => {
    const k = rolls.filter(x => x.what === c.what)[0]; if (!k || k.skipped) return;
    const off = copy(pinned); off.chances[i].yes = blank; off.chances[i].no = blank;
    const flip = copy(pinned); flip.chances[i].force = !k.hit;
    effects.push(Object.assign({ label: 'Rolled: ' + c.what + ' (' + (k.hit ? 'happened' : 'did not happen') + ')' }, diff(real, run(s0, off))));
    dice.push(Object.assign({ what: c.what, odds: c.odds, word: k.word, u: k.u, hit: k.hit }, diff(run(s0, flip), real)));   // what the other face would have changed
  });
  return { before: snap(s0), after: real.snap, events: real.events, why: real.s.last ? real.s.last.why : [], rolls, effects, dice };
}

module.exports = { explain, snap, NUMS };
