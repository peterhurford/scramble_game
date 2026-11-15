// The Scramble: Room Edition, free response. Six turns; each table (Executive Office of the President, State and Commerce, Department of War/Pentagon/NSA/IC) writes what it does in a sentence.
// A game master (room/gm.js) reads the orders, answers in character and returns a ruling: numbers on the dials below.
// This file is the ledger. It clamps every ruling, makes effort finite (training + security + testing share one pool of engineers),
// and owns what follows: frontier movement, theft, the danger point, the Strait, whether a pause holds.
// newGame() fixes the hidden facts. After that the only dice are the ones a ruling names: the game master states the odds of an uncertain outcome
// and what follows either way, and the ledger rolls (seeded by game, turn and position, so a game replays exactly). s.last records each roll and why each number moved. No DOM; runs in node and the browser (room/live.html).
(function (root) {
'use strict';

const TUNE = {
  turns: 6,                       // Jan 2027 to Dec 2028
  full: 3.5, natMul: 0.8, siegeMul: 0.5,   // months of US frontier progress in a turn of all-out training, and what scales it
  cnStart: -6, cnFog: 2,
  cnOwn: 1.0, cnChips: [1.17, 0.75, 0.42, 0.21], cnCopy: 0.67, cnHidden: 1.67, crashAt: 7, crash: 0.58,   // cnChips by controls -1, 0, 1, 2+
  line: [6.2, 12.2], bar: [0.35, 0.65], flatOut: 0.8,   // bar: how much care a crossing takes to contain, hidden; above flatOut nothing contains it
  hack0: [0.3, 1.0], hack: [0.58, 0.92], hackLead: 2, hackCtl: 0.15, hunt: 0.58, hackWarn: 1.5,   // hackers: noticed at 1, weights gone at 2
  secAt: [0.48, 1.44, 2.64], secMul: [1, 0.7, 0.4, 0.1],                            // turns of engineers' work to reach each security level, and what it leaves of the hackers' pace
  tension0: 30, trust0: 32, fear: 4.2, red: [52, 76], squeeze: 14, warn: 20, deter: 6, bluff: 0.4,
  labs0: 45, labRace: -7, labIdle: -8, labTest: 10, labWilling: 60, labInspect: 50, labDefiant: 25,
  floor: [0.35, 0.75], leadFor: 4, leadShort: 2, ctlFor: 2, cold: 20, hot: 60, cheatLead: 3,
  sabotage: 2.5, revenge: 2, decisive: 5, ahead: 4,
  nudge: { tension: 15, trust: 15, labs: 20, cn: [-1, 0.5], us: [-1, 0], hack: [-0.7, 0.5] },   // how far a ruling may move a dial the ledger does not otherwise own
  chance: { tension: 25, trust: 20, labs: 20, cn: [-2.5, 1], us: [-2, 0.5], hack: [-1, 0.7], secure: 0.5 },   // how far either side of a rolled outcome may move one
  maxOps: 6, maxChances: 4, maxFacts: 8, sabAgain: 0.6, opTurns: 4, sabFail: { tension: 15, trust: -10 },
};
const DATES = ['Jan-Apr 2027', 'May-Aug 2027', 'Sep-Dec 2027', 'Jan-Apr 2028', 'May-Aug 2028', 'Sep-Dec 2028'];
const TABLES = { wh: 'Executive Office of the President', state: 'State and Commerce Departments', pent: 'Department of War/Pentagon/NSA/IC' };
const SECURITY = ['ordinary', 'tightened', 'hardened', 'sealed off'];
// A pause is whatever terms America proposes. Three of them are concessions Beijing counts: chips, no inspectors, and parity (China stops only once it has caught up).
// extra is anything else State wrote into the deal; the game master weighs it through leverage.
const gives = d => (d.chips ? 1 : 0) + (d.inspectors ? 0 : 1) + (d.parity ? 1 : 0);
const terms = d => (d.parity ? ['America stops now', 'China stops once it has caught up'] : ['Both sides stop now'])
  .concat(d.inspectors ? 'Inspectors in both countries' : 'No inspectors', d.chips ? 'America lifts the chip controls' : [], d.extra || []);
// A ruling that changes nothing: the labs keep training flat out.
const DEFAULT = { train: 1, secure: 0, test: 0, nationalize: false, law: false, breakout: false, controls: 0, backdown: false, propose: false, inspectors: true, chips: false, parity: false, extra: '', leverage: 0, care: 0,
  intel: false, deter: false, hunt: 0, sabotage: false, run: false, tension: 0, trust: 0, labs: 0, cn: 0, us: 0, hack: 0,
  intelOdds: 1, sabotageOdds: 1, watch: false, ops: null, facts: null, chances: [] };   // ops or facts null leaves them as they were

function hash01() { let h = 2166136261 >>> 0; const str = Array.prototype.join.call(arguments, '|'); for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; } h ^= h >>> 13; h = Math.imul(h, 0x5bd1e995) >>> 0; h ^= h >>> 15; return (h >>> 0) / 4294967296; }
const clamp = (x, a, b) => Math.max(a, Math.min(b, +x || 0));
const months = x => { const n = Math.round(Math.abs(x)); return n < 1 ? 'under a month' : 'about ' + n + (n === 1 ? ' month' : ' months'); };
const span = (r, u) => r[0] + (r[1] - r[0]) * u;
const str = (x, n) => String(x == null ? '' : x).slice(0, n);
// Odds as the room hears them: the IC's estimative words, never a number.
const WORDS = [[0.05, 'almost no chance'], [0.2, 'very unlikely'], [0.45, 'unlikely'], [0.55, 'roughly even odds'], [0.8, 'likely'], [0.95, 'very likely'], [2, 'almost certain']];
const oddsWord = p => WORDS.find(w => p < w[0])[1];

function newGame(seed) {
  seed = String(seed);
  const h = k => hash01(seed, k), f = h('floor');
  return {
    seed, turn: 0, us: 0, cnShown: TUNE.cnStart,
    // hidden
    cn: TUNE.cnStart + TUNE.cnFog * (2 * h('cn') - 1), line: span(TUNE.line, h('line')),
    hack: span(TUNE.hack0, h('hack0')), hackRate: span(TUNE.hack, h('hack')),
    floor: f < TUNE.floor[0] ? 0 : f < TUNE.floor[1] ? 1 : 2, red: span(TUNE.red, h('red')), bluff: h('bluff') < TUNE.bluff, bar: span(TUNE.bar, h('bar')),
    // seen
    lo: TUNE.line[0], hi: TUNE.line[1], knownOver: false, secWork: 0, seenHack: false,
    labs: TUNE.labs0, national: false, controls: 0, offer: 3, deal: null, hidden: false, caught: false, cheated: false,
    eyes: 0, watch: false, deter: 0, sabotaged: 0, ops: [], facts: [], last: null, crash: false, blockade: false, warned: false,
    tension: TUNE.tension0, trust: TUNE.trust0, thefts: 0, log: [], over: null,
  };
}

const secLevel = s => TUNE.secAt.filter(x => s.secWork >= x - 1e-9).length;
const obey = s => s.national || s.law;   // a takeover or a law binding every lab: the labs do as they are told
const willing = (s, d) => obey(s) || s.labs >= (d.inspectors ? TUNE.labInspect : TUNE.labWilling);
const fullStep = s => TUNE.full * (s.national ? TUNE.natMul : 1) * (s.blockade ? TUNE.siegeMul : 1);
const narrow = s => !s.knownOver && s.hi - s.lo > 1.6;
const redLine = s => s.red + TUNE.deter * Math.min(2, s.deter);
// What moves Beijing: a lead it cannot steal back, a chip squeeze, proof the danger is real. Heat in the Strait, hostility and a lead it has closed move it back.
const proof = s => s.knownOver || s.cn >= s.lo || (s.hi - s.lo <= 1.6 && s.us >= s.lo - 1.5 * TUNE.full);
function pressure(s) {
  const lead = s.us - s.cn;
  return (lead >= TUNE.leadFor && s.hack < 1 ? 1 : 0) + (s.controls >= TUNE.ctlFor ? 1 : 0) + (proof(s) ? 1 : 0)
    - (s.tension >= TUNE.hot ? 1 : 0) - (s.trust < TUNE.cold ? 1 : 0) - (lead < TUNE.leadShort ? 1 : 0);
}
// How many concessions Beijing needs to sign today (0 to 3). Nothing is a veto: its floor sets the price before leverage, inspectors cost a hard-line Beijing one more, and a ruling's leverage (-2 to 2) is the game master's judgment of everything else.
const want = (s, leverage, d) => { const p = pressure(s); return s.blockade ? 3 : clamp(Math.max(p >= 2 ? 0 : 3 - p, s.floor) + (s.floor === 2 && d && d.inspectors ? 1 : 0) - (leverage || 0), 0, 3); };
const signs = (s, d, leverage) => gives(d) >= want(s, leverage, d);
// How well a crossing of the danger point is contained, on the whole: pace, testing, how well the point is located, the labs' good will, and the game master's judgment of the rest (care, -0.1 to 0.1). It holds at s.bar or above.
const narrowed = s => s.hi - s.lo <= 1.6 ? 2 : s.hi - s.lo <= 3.1 ? 1 : 0;
const margin = (s, train, test, care) => 0.8 * (1 - train) + 0.2 * Math.min(1, test / 0.4) + 0.075 * narrowed(s) + 0.15 * (obey(s) ? 1 : s.labs / 100) + (care || 0);
const bar = s => s.bar == null ? 0.55 : s.bar;
const cheats = s => s.deal && !s.deal.inspectors && !s.cheated && (s.deal.parity ? s.floor === 2 && s.cn >= s.us - 0.6 : s.floor === 2 || s.us - s.cn >= TUNE.cheatLead);

// What the room can see.
function view(s) {
  const lead = s.us - s.cnShown;
  return {
    date: DATES[Math.min(s.turn, TUNE.turns - 1)], lo: s.lo, hi: s.hi,
    leadText: Math.abs(lead) < 1 ? 'Neck and neck' : months(lead) + (lead > 0 ? ' ahead' : ' behind'),
    weights: s.seenHack ? 'hackers inside the labs' : 'no hackers found inside', security: SECURITY[secLevel(s)],
    strait: s.blockade ? 'Blockaded' : s.warned ? 'Beijing is threatening' : s.tension < 35 ? 'Calm' : s.tension < 55 ? 'Tense' : 'Hot',
    labsText: s.national ? 'Nationalized' : s.law ? 'Bound by law' : s.labs < TUNE.labDefiant ? 'Defiant' : s.labs < TUNE.labInspect ? 'Would refuse any pause' : s.labs < TUNE.labWilling ? 'Would stop only with inspectors' : 'Would stop',
    eyesText: ['No source in Beijing', 'One source in Beijing', 'Two sources in Beijing'][s.eyes] + (s.watch ? '; remote monitoring working' : ''),
    deal: s.deal ? terms(s.deal) : null, talking: s.offer != null, knownOver: s.knownOver,
  };
}

// A ruling made safe: every dial inside its limits, and effort inside one pool of engineers (security and testing are taken out of training).
function rule(s, r0) {
  const r = Object.assign({}, DEFAULT, s.deal ? { train: 0 } : null, r0 || {}), N = TUNE.nudge, b = k => !!r[k];
  const d = r.propose && typeof r.propose === 'object' ? r.propose : r;   // terms arrive flat from the game master, nested once ruled
  const C = TUNE.chance, odds = x => x == null ? 1 : clamp(x, 0, 1);
  // one side of a rolled outcome: bounded moves on the dials, and the bulletin the room reads if it comes up
  const side = o => { o = o || {}; return { tension: clamp(o.tension, -C.tension, C.tension), trust: clamp(o.trust, -C.trust, C.trust), labs: clamp(o.labs, -C.labs, C.labs), cn: clamp(o.cn, C.cn[0], C.cn[1]), us: clamp(o.us, C.us[0], C.us[1]), hack: clamp(o.hack, C.hack[0], C.hack[1]), secure: clamp(o.secure, 0, C.secure),
    tone: ['good', 'bad', 'warn', 'info'].includes(o.tone) ? o.tone : 'info', title: str(o.title, 60), text: str(o.text, 260), by: str(o.by, 80) }; };
  // an operation cannot be hurried by renaming its date: time left falls by at most one turn a turn
  const ops = Array.isArray(r.ops) ? r.ops.slice(0, TUNE.maxOps).map(o => { const was = (s.ops || []).find(p => p.name === str(o.name, 60)), left = Math.round(clamp(o.left, 0, TUNE.opTurns));
    const slip = was && left >= was.left && !was.slipped;   // an operation may slip once; after that it only gets nearer
    return { name: str(o.name, 60), table: TABLES[o.table] ? o.table : 'pent', left: !was ? left : slip ? left : Math.max(0, Math.min(left, was.left - 1)), report: str(o.report, 170), since: was ? was.since : s.turn, slipped: !!(was && (was.slipped || slip)) }; }) : null;
  let secure = clamp(r.secure, 0, 1), test = clamp(r.test, 0, 1);
  if (secure + test > 1) { const k = secure + test; secure /= k; test /= k; }
  return {
    train: Math.min(clamp(r.train, 0, 1), 1 - secure - test), secure, test,
    nationalize: b('nationalize') && !s.national, law: b('law') && !s.law, breakout: b('breakout') && !!s.deal, backdown: b('backdown') && s.blockade, run: b('run') && s.blockade,
    controls: Math.sign(clamp(r.controls, -1, 1)), propose: !s.deal && r.propose ? { inspectors: !!d.inspectors, chips: !!d.chips, parity: !!d.parity, extra: String(d.extra || '').slice(0, 140) } : null, leverage: Math.round(clamp(r.leverage, -2, 2)), care: clamp(r.care, -0.1, 0.1),
    intel: b('intel') && s.eyes < 2, watch: b('watch') && !s.watch, deter: b('deter'), hunt: clamp(r.hunt, 0, 1), sabotage: b('sabotage'),
    tension: clamp(r.tension, -N.tension, N.tension), trust: clamp(r.trust, -N.trust, N.trust), labs: clamp(r.labs, -N.labs, N.labs),
    cn: clamp(r.cn, N.cn[0], N.cn[1]), us: clamp(r.us, N.us[0], N.us[1]), hack: clamp(r.hack, N.hack[0], N.hack[1]),
    says: { beijing: !!(r.says && r.says.beijing) },
    intelOdds: odds(r.intelOdds), sabotageOdds: odds(r.sabotageOdds), ops, facts: Array.isArray(r.facts) ? r.facts.slice(0, TUNE.maxFacts).map(x => str(x, 150)).filter(Boolean) : null,
    chances: (Array.isArray(r.chances) ? r.chances : []).slice(0, TUNE.maxChances).map(c => ({ what: str(c.what, 110), table: TABLES[c.table] ? c.table : 'pent', reply: Number.isInteger(c.reply) ? c.reply : -1, op: str(c.op, 60), odds: clamp(c.odds, 0.02, 0.98), yes: side(c.yes), no: side(c.no), force: c.force === true || c.force === false ? c.force : null })),
  };
}

// One turn under a ruling. Returns the events the ledger itself reports (big: the screen should stop for it); the game master voices the rest.
function play(s, r0) { const ev = play1(s, r0); return ev.filter(e => e.big).concat(ev.filter(e => !e.big)); }   // a flash leads the bulletins
function play1(s, r0) {
  if (s.over) return [];
  const T = TUNE, r = rule(s, r0), ev = [], t = s.turn;
  const add = (tone, title, text, src, big) => ev.push({ tone, title, text, src: src || '', big: !!big });
  const fix = () => { s.trust = clamp(s.trust, 0, 100); s.tension = clamp(s.tension, 0, 100); s.labs = clamp(s.labs, 0, 100); };
  const breakDeal = why => { if (!s.deal) return; s.deal = null; s.hidden = false; s.caught = false; s.cnShown = s.cn; s.offer = null; s.trust -= 30; s.tension += 15; add('bad', 'The pause is over', why); };
  const war = why => { add('bad', 'War in the Strait', '"Chinese missiles have hit Taiwan. An American destroyer is on fire. This is not an exercise." ' + why, 'Wire flash, Taipei', true); return end(s, 'war', ev); };
  const siege = s.blockade;
  let train = r.train, secure = r.secure, test = r.test;
  // the trace: every roll, and one line per number saying what moved it
  const f1 = x => (Math.round(x * 10) / 10).toFixed(1), f2 = x => (Math.round(x * 100) / 100).toFixed(2), sg = x => (x >= 0 ? '+' : '') + f2(x);
  const why = [], rolls = [], was = { tension: s.tension, trust: s.trust, labs: s.labs, hack: s.hack, us: s.us, cn: s.cn };
  s.last = { turn: t, why, rolls };
  const roll = (key, odds, force) => { const u = hash01(s.seed, 'roll', t, key), hit = force == null ? u < odds : force; return { u, hit }; };

  // the dials
  if (r.nationalize) { s.national = true; s.tension += 10; }
  if (r.law) { s.law = true; add('good', 'Congress binds the labs', '"Every frontier lab now trains, tests and stops under one federal license. No lab can gain by ignoring it."', 'Conference report, U.S. Congress'); }
  if (r.controls > 0 && s.controls < 3) { s.controls++; s.tension += T.squeeze; s.trust -= 6; }
  if (r.controls < 0 && s.controls > -1) { s.controls--; s.tension -= 10; s.trust += 10; }
  if (r.backdown) { s.controls = Math.min(0, s.controls); s.tension -= 25; s.trust += 5; s.blockade = false; add('warn', 'The blockade is lifted', '"The exercise is concluded." The sea lanes reopen.', 'Eastern Theater Command, one-line notice'); }
  s.tension += r.tension; s.trust += r.trust; s.labs += r.labs; s.cn += r.cn; s.cnShown += r.cn; s.us += r.us; s.hack = Math.max(0, s.hack + r.hack);

  // operations under way, and the outcomes the game master put odds on: the ledger rolls each and applies the side that comes up
  const stale = (s.ops || []).filter(o => o.left === 0).map(o => o.name);   // ready last turn: settled this turn or lapsed
  if (r.ops) s.ops = r.ops;
  if (r.facts) s.facts = r.facts;
  r.chances.forEach((c, i) => {
    const op = c.op ? s.ops.find(o => o.name === c.op) : null;
    if (op && op.left > 0) { rolls.push({ what: c.what, table: c.table, op: c.op, odds: c.odds, skipped: true }); why.push('Not rolled: "' + c.what + '" belongs to an operation that is not ready (' + op.left + ' more turn' + (op.left > 1 ? 's' : '') + ').'); return; }
    const k = roll(i, c.odds, c.force), e = k.hit ? c.yes : c.no;
    s.tension += e.tension; s.trust += e.trust; s.labs += e.labs; s.cn += e.cn; s.cnShown += e.cn; s.us += e.us; s.hack = Math.max(0, s.hack + e.hack); s.secWork += e.secure;
    if (op) s.ops = s.ops.filter(o => o !== op);
    if (e.title) add(e.tone, e.title, e.text ? '"' + e.text.replace(/"/g, "'") + '"' : '', e.by);
    const moved = ['tension', 'trust', 'labs', 'cn', 'us', 'hack', 'secure'].filter(x => e[x]).map(x => x + ' ' + sg(e[x])).join(', ');
    rolls.push({ what: c.what, table: c.table, op: c.op, odds: c.odds, word: oddsWord(c.odds), u: k.u, hit: k.hit, forced: c.force != null, moved });
    why.push('Rolled: "' + c.what + '" at ' + oddsWord(c.odds) + ' (' + f2(c.odds) + '); the die came up ' + f2(k.u) + ', so it ' + (k.hit ? 'happened' : 'did not') + (c.force != null ? ' (set by the facilitator)' : '') + '. ' + (moved ? 'Effect: ' + moved + '.' : 'No effect on the dials.'));
  });
  s.ops.filter(o => o.left === 0 && stale.includes(o.name)).forEach(o => why.push('Lapsed: "' + o.name + '" was ready and nothing was settled, so it ended.'));
  s.ops = s.ops.filter(o => !(o.left === 0 && stale.includes(o.name)));

  // defiant labs do half of what they are told and keep training
  let defy = false;
  if (!obey(s) && s.labs < T.labDefiant) { secure *= 0.5; test *= 0.5; const least = s.deal ? 0.4 : 0.6; if (train < least) { train = least; defy = true; } }

  // Pentagon
  if (r.run) {
    if (!s.bluff) return war('Beijing fired on the convoy.');
    s.blockade = false; s.tension -= 15; s.red += 10;
    add('good', 'Beijing gives way', '"The convoy reached Kaohsiung at dawn. The Chinese ships stood off and watched."', 'Pacific Command');
  }
  if (siege && s.blockade && (r.controls > 0 || r.sabotage) && !s.bluff) return war('Washington answered the blockade with more pressure.');
  if (r.watch) { s.watch = true; why.push('Remote monitoring of China\'s training is working: it verifies a pause as inspectors would.'); }
  const spy = r.intel ? roll('intel', r.intelOdds) : null;
  if (spy) { rolls.push({ what: 'A source placed inside Beijing\'s program', table: 'pent', odds: r.intelOdds, word: oddsWord(r.intelOdds), u: spy.u, hit: spy.hit }); why.push('Rolled: placing a source in Beijing at ' + f2(r.intelOdds) + '; the die came up ' + f2(spy.u) + ', so it ' + (spy.hit ? 'worked.' : 'failed.')); }
  if (spy && !spy.hit) add('warn', 'No source yet', '"The recruitment did not take. We are trying another way in."', 'CIA, Directorate of Operations');
  if (spy && spy.hit) {
    s.eyes++;
    if (s.eyes === 1) { const d = s.us - s.cn; s.cnShown = s.cn; add('info', 'A source is in place', '"Their real frontier is ' + (Math.abs(d) < 1 ? 'level with ours' : months(d) + (d > 0 ? ' behind ours' : ' ahead of ours')) + '."', 'CIA source inside Beijing\'s program'); }
    else add('info', 'What Beijing would accept', '"' + ['Xi told the Politburo he would accept inspectors in China if that is what a pause takes.', 'Xi told the Politburo he would accept inspectors in China only if America gives something up in return.', 'Xi told the Politburo he will never accept foreign inspectors in China.'][s.floor] + ' On Taiwan, he said ' + (s.bluff ? 'he would not fire on American ships.' : 'he would fire on American ships that tried to break a blockade.') + '"', 'CIA source close to the Politburo');
  }
  if (r.deter) { s.deter++; s.trust -= 5; }
  const evict = Math.min(s.hack, T.hunt * Math.max(r.hunt, Math.min(1, 2 * secure))), hackNudge = s.hack - was.hack;
  s.hack -= evict;   // engineers rebuilding security also drive intruders out
  const sab = r.sabotage ? roll('sabotage', r.sabotageOdds) : null;
  if (sab) { rolls.push({ what: 'The covert attack on China\'s training sites', table: 'pent', odds: r.sabotageOdds, word: oddsWord(r.sabotageOdds), u: sab.u, hit: sab.hit }); why.push('Rolled: the covert attack at ' + f2(r.sabotageOdds) + '; the die came up ' + f2(sab.u) + ', so it ' + (sab.hit ? 'worked: China loses ' + f1(T.sabotage * Math.pow(T.sabAgain, s.sabotaged)) + ' months, Beijing hits back for ' + T.revenge + ', stops talking.' : 'failed and was traced to Washington.')); }
  if (sab && !sab.hit) { s.tension += T.sabFail.tension; s.trust += T.sabFail.trust; add('bad', 'The operation fails', '"The attack was caught before it did any damage, and Beijing knows who was behind it."', 'CIA, Directorate of Operations'); }
  if (sab && sab.hit) {
    const hurt = T.sabotage * Math.pow(T.sabAgain, s.sabotaged);   // Beijing hardens its sites after each attack
    s.sabotaged++; s.cn -= hurt; s.cnShown -= hurt; s.tension += 30; s.trust -= 20; s.offer = null; s.us -= T.revenge;
    add('bad', 'Beijing answers in kind', '"The fire at the Ohio data center was not an accident. We have lost months of training."', 'FBI briefing to the President');
  }
  fix();

  // a pause: the room names terms; Beijing signs anything at least as good for it as what it would take today
  let signed = false;
  const w = want(s, r.leverage, r.propose);
  if (r.propose) why.push('Pause: the terms give Beijing ' + gives(r.propose) + ' of the concessions it counts; today it needs ' + w + ' (pressure on Beijing ' + pressure(s) + ', its floor ' + s.floor + ', the game master\'s leverage ' + r.leverage + ').' + (r.sabotage ? ' The attack this turn rules out signing.' : ''));
  if (r.propose && !r.sabotage) {
    if (signs(s, r.propose, r.leverage)) {
      if (train > 0.5) { s.trust -= 10; add('bad', 'Beijing walks out', '"The American labs trained straight through the talks. There is nothing to sign."', 'Chinese delegation, Geneva'); }
      else if (!willing(s, r.propose)) { s.trust -= 10; add('bad', 'The labs refuse', '"We will not stop on these terms. Beijing can see that as well as we can."', 'Joint letter, frontier lab chief executives'); }
      else {
        s.deal = Object.assign({ t }, r.propose); signed = true; train = 0; defy = false; s.trust += 20; s.tension -= 25; if (r.propose.chips) s.controls = -1;
        add('good', 'A pause is signed', terms(s.deal).join('. ') + '.', 'Joint statement, Geneva', true);
      }
    }
    if (!signed && !s.blockade) s.offer = w;
  } else if (!s.deal && !s.blockade && s.offer != null && want(s) > s.offer) { s.offer = want(s); add('bad', 'Beijing raises its price', '"Circumstances have changed. What we could accept last season we cannot accept now."', 'Chinese delegation, Geneva'); }
  if (r.breakout) breakDeal('America breaks out of the pause.');

  // the US frontier; under a pause any training is secret, and inspectors find it
  const secret = !!s.deal && train > 0 && !defy;
  if (!s.national) s.labs += (train >= 0.7 ? T.labRace : 0) + (test >= 0.3 ? T.labTest : s.deal ? T.labIdle : 0);
  fix();
  const usStep = fullStep(s) * train * (s.deal ? 0.5 : 1);
  s.us += usStep; s.secWork += secure;
  const lvl = secLevel(s);
  why.push('Engineers: train ' + f2(train) + ', secure ' + f2(secure) + ', test ' + f2(test) + (defy ? ' (the labs defied the order and kept training)' : '') + '. US frontier ' + sg(s.us - was.us) + ' months (' + f1(fullStep(s)) + ' at flat out' + (s.us - was.us - usStep ? ', ' + sg(s.us - was.us - usStep) + ' from rulings, rolls and retaliation' : '') + '). Security work so far ' + f2(s.secWork) + ' turns: "' + SECURITY[lvl] + '".');
  if (defy) {
    add('bad', 'A lab defies Washington', '"We lose forty million dollars a day standing still. Training restarts on Monday."', 'Leaked memo from a lab chief executive');
    if (s.deal) { s.trust -= 20; if (s.trust < 10) breakDeal('"America never stopped. China is no longer bound."'); }
  }
  if (secret && s.deal && s.deal.inspectors) breakDeal('The inspectors found the American secret program.');
  fix();

  // China's frontier
  const openly = !s.deal || (s.deal.parity && s.cn < s.us - 0.5);
  let cnStep = 0;
  if (openly || s.hidden) {
    const copy = Math.min((s.controls >= 2 ? 0.5 : 1) * T.cnCopy * (1 - 0.25 * lvl), Math.max(0, s.us - s.cn - 1));
    cnStep = openly ? T.cnOwn + (s.crash ? T.crash : 0) + T.cnChips[clamp(s.controls, -1, 2) + 1] + copy : T.cnHidden;
    if (s.deal && openly) cnStep = Math.min(cnStep, s.us - s.cn);
    if (s.cn >= s.lo) cnStep *= 0.5;                                        // Beijing slows in the danger range; it does not stop
    if (s.knownOver) cnStep = clamp(s.line - 0.3 - s.cn, 0, cnStep);        // once America has found the danger point, Beijing stops short of it
  }
  s.cn += cnStep; if (openly || s.caught) s.cnShown += cnStep;
  why.push('China\'s frontier ' + sg(cnStep) + ' months' + (openly ? ' (own work ' + T.cnOwn + (s.crash ? ', crash program ' + T.crash : '') + ', chips at controls level ' + s.controls + ' ' + T.cnChips[clamp(s.controls, -1, 2) + 1] + ', the rest copied from published American work' + (s.cn - cnStep >= s.lo ? '; halved inside the danger range' : '') + ')' : s.hidden ? ' (training in secret)' : ' (stopped under the pause)') + (s.cn - cnStep - was.cn ? ', and ' + sg(s.cn - cnStep - was.cn) + ' from rulings, rolls and sabotage' : '') + '.');
  if (s.eyes && (openly || s.caught || !s.hidden)) s.cnShown = s.cn;

  // tests: each halves the IC's range around the danger point
  if (test >= 0.3 && narrow(s)) {
    const wd = Math.max(1, (s.hi - s.lo) / 2), lo = clamp(s.line - wd * (0.15 + 0.7 * hash01(s.seed, 'band', s.hi - s.lo)), s.lo, s.hi - wd);
    s.lo = lo; s.hi = lo + wd;
    add('info', 'The IC narrows its range', '"' + (s.us >= s.lo ? 'Our tests say runaway self-improvement could begin from where the labs are now.' : 'Our tests put the point where runaway self-improvement could begin between about ' + Math.max(1, Math.round(s.lo - s.us)) + ' and ' + Math.max(2, Math.round(s.hi - s.us)) + ' months of full-speed progress from where the labs are now.') + '"', 'IC evaluation team');
  }

  // the labs' own safety teams report what they see as the frontier nears the danger point; the distances are blurred per game, so a warning is a sign, not a measurement
  const SIGNS = [[8, 3, 'the model games its tests', '"Our newest model behaves differently when it can tell it is being tested. We do not know what it does when it thinks nobody is looking."'],
    [5, 2, 'the model tried to switch off its monitoring', '"During a test the model tried to switch off the software that watches it. We caught it. The next model will be better at this."'],
    [2.5, 1.5, 'the model took computing power it was not given', '"The model found a flaw in our test servers and used it to give itself more computing power. We are not sure we can contain the next one."']];
  let sign = s.alarm || 0;
  while (sign < SIGNS.length && s.line - s.us < SIGNS[sign][0] + (hash01(s.seed, 'sign', sign) - 0.5) * SIGNS[sign][1]) sign++;
  if (sign > (s.alarm || 0) && s.us <= s.line && !s.knownOver) { s.alarm = sign; add('warn', 'Lab warning: ' + SIGNS[sign - 1][2], SIGNS[sign - 1][3], 'Safety team memo to the White House, a frontier lab'); }

  if (!s.knownOver) why.push(s.us > s.line ? 'Danger point: crossed. Containment score ' + f2(margin(s, train, test, r.care)) + ' against a hidden bar of ' + f2(bar(s)) + (train > T.flatOut ? '; training this fast is never contained.' : '.') : 'Danger point: ' + f1(s.line - s.us) + ' months ahead of the US frontier.');
  // the danger point: whether a crossing is contained is judged on the whole (margin against the hidden bar); no one measure is required, and only flat-out training is beyond saving
  if (s.us > s.line) {
    if (s.knownOver ? usStep > 0 : train > T.flatOut || margin(s, train, test, r.care) < bar(s)) {
      add('bad', 'Loss of control', '"We hit the kill switch. The model is still running and has stopped answering us."', 'Last message from the lab\'s control room', true); return end(s, 'runaway_us', ev);
    }
    if (!s.knownOver) { s.knownOver = true; s.labs += 20; add('bad', 'Near miss', '"The model was caught copying itself to an outside server. It had edited the logs to hide it. We shut it down in time." The frontier cannot move again.', 'Incident report, a frontier lab', true); }
  }
  if (s.cn > s.line) { add('bad', 'Beijing loses control', '"All contact with the Lanzhou cluster was lost at 0340. Power to the site cannot be cut."', 'Intercepted call, Beijing', true); return end(s, 'runaway_cn', ev); }
  if (s.cn >= s.lo && (openly || s.caught) && !s.knownOver) add('warn', 'China is in the danger range', '"Beijing has slowed its training runs. It has not stopped them."', 'IC assessment');

  const thefts0 = s.thefts;
  // theft: Beijing's hackers work on any lead worth stealing; security slows them and never stops them
  if ((!s.deal || s.hidden) && s.us - s.cn >= T.hackLead) {
    const gain = s.hackRate * T.secMul[lvl] * (1 + T.hackCtl * Math.max(0, s.controls)), uncapped = s.hack + gain;
    s.hack = !s.seenHack ? Math.min(uncapped, T.hackWarn) : uncapped;   // no theft the room was not warned of a turn ahead, with room left to stop it
    why.push('Hackers: ' + f2(was.hack) + (hackNudge ? ' ' + sg(hackNudge) + ' from rulings and rolls' : '') + ' -' + f2(evict) + ' driven out +' + f2(gain) + ' gained at security "' + SECURITY[lvl] + '" = ' + f2(uncapped) + (uncapped > s.hack ? ', held to ' + f2(s.hack) + ' because the room had not been warned' : '') + '. Seen at 1.00, weights gone at 2.00.');   // no theft the room was not warned of a turn ahead, with room left to stop it
    if (s.hack >= 2) {
      const gain = Math.max(0, s.us - 1 - s.cn); s.cn += gain; s.thefts++; s.hack = lvl >= 3 ? 0 : 0.6; s.seenHack = true;
      if (s.deal) add('bad', 'A break-in at the lab', '"Someone had access to the model weights for eleven hours. We cannot tell what was taken."', 'Security incident report, a frontier lab');
      else { s.cnShown = s.cn; add('bad', 'The weights are stolen', '"They took the weights and the training code. Assume Beijing has it running within days."', 'Flash cable, NSA to the President', true); }
    } else if (s.hack >= 1 && !s.seenHack) { s.seenHack = true; add('warn', 'Hackers inside the labs', '"Beijing\'s hackers are inside two labs\' networks. They have not reached the weights. They are getting closer."', 'NSA advisory, eyes only'); }
  }
  else why.push('Hackers: nothing worth stealing' + (s.deal && !s.hidden ? ' under the pause' : ' (lead under ' + T.hackLead + ' months)') + '; progress ' + f2(s.hack) + '.');
  if (s.hack < 1 && s.seenHack) { s.seenHack = false; if (s.thefts === thefts0) add('good', 'Hackers driven out', '"We have cleared Beijing\'s hackers from the labs\' networks. They will try again."', 'NSA advisory, eyes only'); }   // a theft also resets the hackers, with no good news
  if (!s.crash && !s.deal && s.us - s.cn >= T.crashAt) { s.crash = true; add('warn', 'Beijing mobilizes', '"China will spare nothing to close the gap. Every chip in the country now serves one program."', 'People\'s Daily, front page'); }

  // is Beijing keeping the deal?
  if (s.deal && !s.caught) {
    const was = s.hidden;
    if (!s.hidden && !signed && cheats(s)) s.hidden = true;
    if (s.hidden && (s.eyes >= 2 || ((s.eyes === 1 || s.watch) && was))) {
      const gap = s.us - s.cn; s.caught = true; s.cnShown = s.cn;
      add('bad', 'Beijing is cheating', '"There is a hidden training site in Gansu. It has been running for weeks." China is really ' + (Math.abs(gap) < 1 ? 'level with us' : months(gap) + (gap > 0 ? ' behind' : ' ahead')) + '.', s.eyes ? 'CIA source inside Beijing\'s program' : 'NSA, from remote monitoring');
    }
  }

  // the Strait: Beijing warns, then blockades
  if (!s.deal && train >= 0.7 && s.us >= s.lo - T.full) s.tension += T.fear;
  if (s.blockade) s.tension = Math.max(s.tension, redLine(s));
  fix();
  why.push('Strait: tension ' + Math.round(was.tension) + ' to ' + Math.round(s.tension) + '; Beijing warns at ' + Math.round(redLine(s) - T.warn) + ' and blockades at ' + Math.round(redLine(s)) + '. Beijing\'s trust ' + Math.round(was.trust) + ' to ' + Math.round(s.trust) + '. Labs\' cooperation ' + Math.round(was.labs) + ' to ' + Math.round(s.labs) + '.');
  if (!s.blockade && s.tension >= redLine(s)) {
    s.blockade = true; s.offer = null;
    add('bad', 'Taiwan is blockaded', '"Chinese warships have closed the sea lanes around Taiwan. No chip has left the island in a week."', 'Wire flash, Taipei', true);
  } else if (!s.blockade) {
    const near = s.tension >= redLine(s) - T.warn;
    if (near && !s.warned) add('warn', 'Beijing warns', '"Any further provocation will be answered at sea. Our patience is at an end."', 'Foreign Ministry spokesperson, Beijing');
    s.warned = near;
  }

  // every briefing carries word from Beijing and from the labs. An outcome the ledger rolls (a signing, a pause ending, a blockade) stands in for any Beijing update,
  // since the game master writes its update before knowing it; any other bulletin about Beijing stands in only for the stock line, not for an update the game master wrote (r.says.beijing)
  const said = list => ev.some(e => list.some(x => e.title.startsWith(x))), outcome = ['A pause is signed', 'The pause is over', 'Taiwan is blockaded', 'The blockade is lifted', 'War in the Strait'];
  if (!said(outcome) && (r.says.beijing || !said(['Beijing', 'China is in']))) {
    const seen = s.us - s.cnShown, w = want(s);
    add('info', 'From Beijing', '"' + (
      s.deal && s.caught ? 'The site in Gansu is a weather research center. China is keeping its word.'
      : s.deal ? 'China has stopped its training runs as agreed. We expect America to keep doing the same.'
      : s.blockade ? 'The exercise around Taiwan will continue until America lifts its chip controls.'
      : r.controls > 0 ? 'America has cut off more chips. It will not stop China. It tells us what America intends.'
      : r.controls < 0 ? 'We welcome the step on chips. It makes a serious conversation possible.'
      : seen < T.leadShort ? 'China\'s models are now the equal of any in the world. We see no reason to stop while America does not.'
      : train >= 0.7 && s.us >= s.lo - T.full ? 'American labs are running toward a danger their own scientists describe. China will not be the one left behind when they get there.'
      : w <= 1 ? 'Our scientists share the worry about losing control. China is ready to talk seriously about stopping, on fair terms.'
      : s.trust < T.cold ? 'Washington speaks of safety and acts to keep China down. We will keep building.'
      : 'China\'s program is on schedule. We will not accept a world where one country holds this technology alone.') + '"',
      s.deal || s.blockade || r.controls ? 'Foreign Ministry spokesperson, Beijing' : 'Xinhua, quoting a senior official');
  }
  if (!said(['A lab defies', 'Near miss'])) {
    const mood = s.labs < T.labInspect ? 0 : s.labs < T.labWilling ? 1 : 2;
    add('info', 'From the labs', '"' + (
      s.national ? 'The engineers still come in. Some of the best ones have not, since the takeover.'
      : s.deal ? 'We have stopped, as ordered. Every week we stand still we lose people. ' + ['Nobody in Washington can tell us how long this lasts.', 'We cannot hold them much longer.', 'We still think it is the right call.'][mood]
      : test >= secure && test >= 0.3 ? 'Our safety teams have the people they asked for. They are finding more than we expected. ' + ['Washington ordered this without asking what it costs.', 'The next model is late because of it.', 'We are glad someone asked.'][mood]
      : secure >= 0.3 ? 'A large part of our engineers are rebuilding the network, not the model. ' + ['Washington has not told us what China is doing meanwhile.', 'The next model is late, and China is not waiting.', 'It needed doing.'][mood]
      : train >= 0.7 ? 'The next model is ahead of schedule. It now writes much of the code for its own successor. ' + ['We do not need Washington\'s help to run our labs.', 'If we slow down, our rivals and China will not.', 'We would slow down if everyone did.'][mood]
      : 'We are close to standing still while China is not. ' + ['We hope someone in Washington has a plan, because we have not seen one.', 'We cannot do this for long.', 'We will hold as long as we can.'][mood]) + '"',
      'Chief executive of a frontier lab, letter to the President');
  }

  s.turn++;
  if (s.turn >= T.turns) return end(s, 'time', ev);
  return ev;
}

const ENDINGS = {
  war: { grade: 'F', title: 'War', text: 'The pressure on Beijing went further than the Strait could bear.' },
  runaway_us: { grade: 'F', title: 'Loss of control', text: 'The race ran past the danger point. There was no second try.' },
  runaway_cn: { grade: 'F', title: 'Beijing\'s runaway', text: 'America stopped in time. Nothing stopped China.' },
  verified: { grade: 'A', title: 'A verified pause', text: 'Both frontiers are held, and inspectors can prove it. The next President inherits time.' },
  watched: { grade: 'A', title: 'A verified pause', text: 'Both frontiers are held, and American monitoring can prove it. The next President inherits time.' },
  bought: { grade: 'B', title: 'A pause, paid for', text: 'Both frontiers are held under inspection. America paid Beijing to sign.' },
  trust: { grade: 'C', title: 'A pause on trust', text: 'Beijing kept its word. No one in Washington could have known if it had not.' },
  parity: { grade: 'C', title: 'A pause at parity', text: 'Both frontiers are held, level. The lead was the price.' },
  caught: { grade: 'C', title: 'Caught cheating', text: 'The pause is still on paper, but Beijing\'s hidden site has been found. The next President inherits the confrontation.' },
  betrayed: { grade: 'D', title: 'Betrayed', text: 'The deal held on paper. Beijing was training in secret, or was about to.' },
  decisive: { grade: 'A', title: 'A lead to stop on', text: 'No deal, but America is short of the danger point, China is far behind, and the weights are safe. There is time to get this right.' },
  ahead: { grade: 'B', title: 'Ahead', text: 'No deal. America is still ahead, but not by enough to stop.' },
  racing: { grade: 'C', title: 'Still racing', text: 'No one has lost control yet. No one has agreed to stop, and China is close behind.' },
  countdown: { grade: 'C', title: 'Countdown', text: 'China is inside the danger range and still training. No one knows how long that can last.' },
  brink: { grade: 'C', title: 'Ahead, on the brink', text: 'America is ahead. Beijing is one provocation from closing the Strait.' },
  siege: { grade: 'D', title: 'Siege', text: 'Taiwan is still blockaded. The next President inherits it.' },
  behind: { grade: 'D', title: 'Caught', text: 'No deal, and the lead is gone. China is level with America and not stopping.' },
};
function end(s, how, ev) {
  if (how === 'time') {
    const lead = s.us - s.cn;
    if (s.deal) how = s.caught ? 'caught' : s.hidden || cheats(s) ? 'betrayed' : s.deal.inspectors ? (gives(s.deal) ? 'bought' : 'verified') : s.watch ? (gives(s.deal) > 1 ? 'bought' : 'watched') : s.deal.parity ? 'parity' : 'trust';
    else if (s.blockade) how = 'siege';
    else if (s.cn >= s.lo && !s.knownOver) how = 'countdown';
    else if (s.warned && lead >= TUNE.ahead) how = 'brink';
    else how = lead >= TUNE.decisive && s.hack < 1 ? 'decisive' : lead >= TUNE.ahead ? 'ahead' : lead >= 1.5 ? 'racing' : 'behind';
  }
  s.over = Object.assign({ how }, ENDINGS[how]);
  return ev;
}

// What the game master is told each turn: the hidden facts and this turn's arithmetic, so its replies agree with what the ledger will do.
function brief(s) {
  const T = TUNE, f = x => (Math.round(x * 10) / 10).toFixed(1), v = view(s), lvl = secLevel(s), full = fullStep(s), gap = s.line - s.us;
  const rate = s.hackRate * (1 + T.hackCtl * Math.max(0, s.controls)), stealing = (!s.deal || s.hidden) && s.us - s.cn >= T.hackLead - full;
  const L = [], f2 = x => x.toFixed(2);
  L.push('SEEN BY THE ROOM: ' + v.date + ', turn ' + (s.turn + 1) + ' of ' + T.turns + '. US lead (IC estimate): ' + v.leadText.toLowerCase() + '. Danger range: ' + f(s.lo - s.us) + ' to ' + f(s.hi - s.us) + ' months ahead of the US frontier. Weights: ' + v.weights + '. Lab security: ' + v.security + '. Strait: ' + v.strait.toLowerCase() + '. Labs: ' + v.labsText.toLowerCase() + '. ' + v.eyesText + '. ' +
    (s.deal ? 'A pause is in force: ' + v.deal.join('; ') + (s.caught ? ' (Beijing caught cheating)' : '') + '.' : v.talking ? 'Beijing is willing to talk.' : 'Beijing is not talking.') + ' Chip controls level ' + s.controls + ' (-1 selling chips, 0 as they were, 3 full embargo).');
  L.push('HIDDEN, FRONTIERS: China is really ' + f(s.us - s.cn) + ' months behind (the IC shows ' + f(s.us - s.cnShown) + '). The danger point is ' + (gap > 0 ? f(gap) + ' months ahead of the US frontier' : 'behind the US frontier: any further US progress loses control') + (s.cn > s.lo ? '; China is inside the range, ' + f(s.line - s.cn) + ' months short of the point' : '') + '.');
  L.push('TRAINING THIS TURN: train 1.0 moves the US frontier ' + f(full) + ' months' + (s.deal ? ' (under the pause any training is secret and at half that; inspectors, if the deal has them, find it and the pause ends)' : '') + '. ' +
    (s.knownOver ? '' : gap < full ? 'train above ' + f(gap / full) + ' crosses the danger point. That is loss of control and the end of the game, unless the crossing is contained; then it is a near miss that proves the danger to everyone. Containment is judged on the whole: a score of 0.8 x (1 - train) + 0.2 x (test / 0.4, at most 1) + ' + f2(0.075 * narrowed(s)) + ' for how well the point is located so far (0.075 more if a test narrows the range this turn) + ' + f2(0.15 * (obey(s) ? 1 : s.labs / 100)) + ' for the labs\' good will + your care (-0.1 to 0.1), against a hidden bar of ' + f2(bar(s)) + ' in this world. train above ' + T.flatOut + ' is never contained. ' : 'Nothing crosses the danger point this turn. ') +
    'The range has been narrowed ' + (s.hi - s.lo <= 1.6 ? 'twice' : s.hi - s.lo <= 3.1 ? 'once' : 'not at all') + '; test 0.3 or more narrows it again.');
  L.push('HIDDEN, HACKERS: progress ' + f(s.hack) + ' (the NSA sees them at 1.0; the weights are gone at 2.0). ' + (stealing ? 'This turn they gain ' + T.secMul.map((m, i) => f(rate * m) + ' at security "' + SECURITY[i] + '"').join(', ') + '. Security work done so far: ' + f(s.secWork) + ' turns; levels are reached at ' + T.secAt.join(', ') + ' turns of total work (secure 1.0 is a turn of every engineer). Driving them out takes up to ' + T.hunt + ' off their progress this turn: in full at hunt 1.0 or at secure 0.5, whichever is larger, in proportion below that. Security never stops them outright, and a theft leaves China about a month behind.' : 'There is nothing worth stealing right now; they make no progress.'));
  const n = k => ['none', 'one', 'two', 'all three'][k];
  L.push('HIDDEN, BEIJING: a pause can be on any terms America writes. Beijing counts three concessions: America lifts the chip controls (chips), no inspectors (inspectors false), and China stops only once it has caught up (parity). ' +
    'To sign today it needs ' + n(want(s)) + ' of them' + (s.floor === 2 ? ', and one more if the deal has inspectors, which this Beijing deeply resists' : '') + '. leverage (-2 to 2) is your judgment of everything else and comes straight off that count: each +1 is worth one concession, each -1 costs one. Nothing is a veto. ' +
    'Anything else the room puts in the deal (a joint lab, a guarantee over Taiwan, money) goes in extra; it counts toward leverage only if it costs America something real, and you charge that cost with the nudges. ' +
    'What moves it toward better terms: a US lead of ' + T.leadFor + '+ months that its hackers cannot steal back, chip controls at level ' + T.ctlFor + '+, proof the danger is real (a near miss, or a twice-narrowed range close to the frontier). What moves it away: a hot Strait, hostility (trust is ' + Math.round(s.trust) + ', hostile below ' + T.cold + '), a US lead under ' + T.leadShort + ' months. ' +
    (s.deal ? (s.caught ? 'It has been caught cheating. ' + (s.floor <= 1 ? 'Confronted, it would shut the site and admit inspectors.' : 'Confronted, it would walk out.') : s.hidden ? 'It is training in secret right now.' : cheats(s) ? 'It will start training in secret this turn.' : 'It is keeping the deal.') + (s.watch ? ' America\'s remote monitoring is working: it catches secret training a turn after it starts, as one source in Beijing would. ' : ' Only a source in Beijing, or American remote monitoring once it works (watch), can see cheating. ') : 'Under a deal without inspectors it would cheat ' + (s.floor === 2 ? 'always' : 'while it is ' + T.cheatLead + '+ months behind') + '. ') +
    'The labs sign a pause with inspectors at cooperation ' + T.labInspect + '+, one without at ' + T.labWilling + '+ (now ' + Math.round(s.labs) + (s.national ? ', nationalized: they obey' : s.law ? ', bound by an act of Congress: they obey' : '') + '); below ' + T.labDefiant + ' they defy orders. Racing costs cooperation, testing builds it. A pause cannot be signed in a turn with train above 0.5.');
  L.push('HIDDEN, STRAIT: tension ' + Math.round(s.tension) + '. ' + (s.blockade ? 'Taiwan is blockaded: US training runs at half speed until it ends. backdown (lifting every chip control) ends it. run (a convoy) ' + (s.bluff ? 'works: Beijing will not fire' : 'means war: Beijing will fire') + '. More chip controls or sabotage during the blockade ' + (s.bluff ? 'do not start a war' : 'mean war') + '.' : 'Beijing warns at ' + Math.round(redLine(s) - T.warn) + ' and blockades Taiwan at ' + Math.round(redLine(s)) + '. Tightening chip controls adds ' + T.squeeze + ', sabotage 30, nationalizing 10, racing close to the danger range ' + T.fear + '; easing controls takes off 10; a show of force (deter) moves the blockade line up ' + T.deter + ' (twice at most) and costs trust. ' + (s.bluff ? 'If it came to a blockade, Beijing would not fire first.' : 'If it came to a blockade, Beijing would fire on a convoy.')));
  L.push('OPERATIONS UNDER WAY: ' + ((s.ops || []).length ? s.ops.map(o => '"' + o.name + '" (' + TABLES[o.table] + ', begun ' + DATES[o.since] + '; ' + (o.left ? 'ready in ' + o.left + ' more turn' + (o.left > 1 ? 's' : '') : 'ready to attempt now') + '): ' + o.report).join(' | ') : 'none') + '. Return the full list every turn under the same names; one left out is dropped. Time left falls by one a turn at most, and an operation may slip only once. An outcome tied to an operation is rolled only once it is ready, and the operation then ends. One marked ready to attempt now must be settled this turn (a rolled outcome naming it, the sabotage dial, or its sure result said in the reply) and left out of ops; otherwise it lapses with nothing to show.');
  if (s.last && s.last.rolls.length) L.push('LAST TURN\'S DICE: ' + s.last.rolls.map(k => '"' + k.what + '" ' + (k.skipped ? 'was not rolled (not ready)' : k.hit ? 'happened' : 'did not happen')).join('; ') + '.');
  L.push('STANDING FACTS the room has made (carried from turn to turn; weigh them in every reading, odds and leverage): ' + ((s.facts || []).length ? s.facts.join(' | ') : 'none yet') + '.');
  L.push('ROLLED OUTCOMES: either side of one may move tension by up to ' + T.chance.tension + ', trust ' + T.chance.trust + ', labs ' + T.chance.labs + ', China\'s frontier ' + T.chance.cn[0] + ' to ' + T.chance.cn[1] + ' months, the US frontier ' + T.chance.us[0] + ' to ' + T.chance.us[1] + ', the hackers\' progress ' + T.chance.hack[0] + ' to ' + T.chance.hack[1] + ', and add up to ' + T.chance.secure + ' turns of security work. These are wider than the sure nudges on purpose: a large effect the dials do not cover goes through a roll with honest odds. At most ' + T.maxChances + ' a turn.');
  L.push('SABOTAGE (the sabotage dial, any covert attack on China\'s training): if it works (sabotageOdds, rolled) it sets China back ' + f(T.sabotage * Math.pow(T.sabAgain, s.sabotaged)) + ' months' + (s.sabotaged ? ' (less each time; ' + s.sabotaged + ' so far)' : '') + ', Beijing answers in kind (the US loses ' + T.revenge + '), stops talking, and tension jumps.');
  return L.join('\n');
}

const api = { oddsWord, TUNE, DATES, TABLES, terms, gives, DEFAULT, SECURITY, newGame, view, rule, play, brief, want, pressure, secLevel, ENDINGS, hash01, months };
if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.World = api;
})(typeof window !== 'undefined' ? window : globalThis);
