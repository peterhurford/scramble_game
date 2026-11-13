// Random-play invariant fuzz: plays games with random actions and random event choices and checks the
// state after every action, event choice and end of turn. Exits 1 on any violation not listed in KNOWN.
// usage: node sim/fuzz.js [games=3000] [firstSeed=500000]     (single-threaded, about 7 s for 3,000 games)
const E = require('../engine.js');
const N = +(process.argv[2] || 3000), SEED0 = +(process.argv[3] || 500000);
// Open engine issues the fuzz also reaches: counted and printed, not failed. Delete a line when its fix lands.
const KNOWN = [
  /^range:\w+@offer$/, // makeOffer does not normalize
  /^score<0$/,
];
let R = 1;
function rand() { R = (R * 1664525 + 1013904223) >>> 0; return R / 4294967296; }
const pick = a => a[Math.floor(rand() * a.length)];
const viol = {}, first = {};
function V(k, s, extra) { viol[k] = (viol[k] || 0) + 1; if (!first[k]) first[k] = `seed ${s._seed} turn ${s.turn} phase ${s.phase} after ${s._last || 'start'} ${extra || ''}`; }
function scan(o, path, s, depth) {
  if (depth > 6 || o == null) return;
  if (typeof o === 'number') { if (!isFinite(o)) V('nonfinite:' + path.replace(/\[\d+\]/g, '[]'), s); return; }
  if (typeof o !== 'object') return;
  if (Array.isArray(o)) { if (path !== 'log' && path !== 'history') o.forEach((x, i) => scan(x, path + '[' + i + ']', s, depth + 1)); return; }
  for (const k in o) if (k !== 'log' && k !== 'report' && k !== 'hist' && k !== 'history') scan(o[k], path ? path + '.' + k : k, s, depth + 1);
}
function check(s, where) {
  scan(s, '', s, 0);
  const rng = (k, v, lo, hi) => { if (!(v >= lo - 1e-9 && v <= hi + 1e-9)) V('range:' + k + '@' + where, s, 'value ' + v); };
  rng('cred', s.cred, 0, 100); rng('markets', s.markets, 40, 140); rng('tension', s.tension, 0, 100); rng('salience', s.salience, 0, 100); rng('alarm', s.alarm, 0, 100); rng('pc', s.pc, 0, 12);
  const ids = s.queue.map(q => q.id), cnt = id => ids.filter(x => x === id).length;
  ['knock', 'collapse', 'war', 'war_begins', 'window', 'one_month', 'runaway', 'blockade', 'court', 'deadline_up'].forEach(id => { if (cnt(id) > 1) V('dupQueue:' + id, s, ids.join(',')); });
  if (cnt('collapse') && cnt('one_month')) V('queue:collapse+one_month', s, ids.join(','));
  if (s.war && cnt('war')) V('queue:collision-while-at-war', s, ids.join(','));
  if (['p0', 'scramble', 'p1'].indexOf(s.phase) < 0) V('phase:' + s.phase, s);
  if (!s.ending && s.t > E.END_T + 0.01 && !s.queue.length) V('pastEndDate', s);
  if (s.apMax > 6) V('apMax>6', s, 'apMax ' + s.apMax);
  if (s.ap < 0) V('ap<0', s);
}
const BAD = /undefined|NaN|\[object/;
function resolve(s) {
  let g = 0;
  while (s.queue.length && !s.ending && g++ < 40) {
    const ev = E.currentEvent(s);
    if (!ev) { V('currentEventNull', s, s.queue[0].id); s.queue.shift(); continue; }
    if (!ev.choices.length) { V('noChoices:' + ev.id, s); break; }
    if (BAD.test(ev.body + ev.title + ev.choices.map(c => c.label + c.hint).join('|'))) V('text:' + ev.id, s);
    if (ev.id === 'war' && s.war) V('show:collision-while-at-war', s);
    if (ev.id === 'knock' && s.phase !== 'p0') V('show:knock-outside-p0', s);
    if (['collapse', 'walkout', 'court', 'deadline_up', 'wobble', 'one_month'].indexOf(ev.id) >= 0 && s.phase !== 'p1') V('show:' + ev.id + '-outside-p1', s);
    const i = Math.floor(rand() * ev.choices.length);
    s._last = ev.id + '#' + i; const r = E.chooseEvent(s, i);
    if (r && r.text && BAD.test(r.text)) V('resultText:' + ev.id, s, r.text.slice(0, 80));
    check(s, 'choose');
  }
  if (g >= 40) V('eventLoop', s, s.queue.map(q => q.id).join(','));
}
function randomTurn(s) {
  let guard = 0;
  while (s.ap > 0 && guard++ < 30 && !s.ending) {
    const acts = E.listActions(s).filter(a => a.avail === true);
    if (!acts.length || rand() < 0.08) break;
    const a = pick(acts), prm = {};
    if (a.params) {
      if (a.params.kind === 'principal') prm.who = pick(E.PRINCIPALS).id;
      if (a.params.kind === 'lab') prm.lab = pick(E.LABS).id;
      if (a.params.kind === 'comp') prm.comp = pick(E.COMPONENTS).id;
      if (a.params.kind === 'variant') prm.variant = pick(E.ACT[a.id].params.options(s)).id;
    }
    if (a.modal === 'offer') { const t = {}; E.TERMS.forEach(x => { if (!x.fixed && rand() < 0.4) t[x.id] = true; }); s._last = 'offer'; E.makeOffer(s, t); check(s, 'offer'); continue; }
    if (E.availability(s, a.id, prm) !== true) continue;
    s._last = a.id; const r = E.act(s, a.id, prm);
    if (r && r.modal === 'charter') { E.LABS.forEach(ld => { const l = E.L(s, ld.id); if (!l.signed) E.charterDecide(s, ld.id, rand() < 0.3 && s.pc >= ld.deal.pc + 1); }); E.finishConvening(s); }
    check(s, 'act');
    resolve(s);
  }
}
const endings = {}, diffs = Object.keys(E.DIFFS);
for (let n = 0; n < N; n++) {
  const seed = SEED0 + n; R = seed * 7 + 1;
  const s = E.newGame({ seed, difficulty: n % 3 === 2 ? diffs[n % diffs.length] : 'advisor' });
  s._seed = seed;
  resolve(s);
  let turns = 0;
  while (!s.ending && turns++ < 400) {
    randomTurn(s); resolve(s);
    if (s.ending) break;
    s._last = 'endTurn'; E.endTurn(s); check(s, 'endTurn');
    resolve(s);
  }
  if (!s.ending) { V('neverEnded', s); continue; }
  const id = s.ending.id || s.ending; endings[id] = (endings[id] || 0) + 1;
  try {
    const sc = E.score(s).score;
    if (!isFinite(sc)) V('scoreNaN', s); else if (sc < 0) V('score<0', s, 'score ' + sc + ' ending ' + id);
    JSON.stringify(E.view(s));
    if (BAD.test(JSON.stringify(E.lessons(s)))) V('lessonsText', s);
  } catch (e) { V('endScreenThrows', s, e.message); }
}
const keys = Object.keys(viol).sort((a, b) => viol[b] - viol[a]);
const known = keys.filter(k => KNOWN.some(r => r.test(k))), fail = keys.filter(k => known.indexOf(k) < 0);
console.log(`${N} games from seed ${SEED0}; endings ${JSON.stringify(endings)}`);
const show = k => console.log(String(viol[k]).padStart(7), k, '| first:', first[k]);
if (known.length) { console.log('known, not failing:'); known.forEach(show); }
if (fail.length) { console.log('VIOLATIONS:'); fail.forEach(show); process.exit(1); }
console.log('no new violations');
