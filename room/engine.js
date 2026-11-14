// The Scramble: Room Edition. A seven-turn game for a room split into three tables (White House, State, Pentagon),
// on the main game's three problems: weight theft, the US-China balance, and the hidden point where AI starts improving itself.
// Each turn every table makes one of its three standing moves (OPEN before a pause, DEAL under one), and the room may make one bold move.
// Nothing is rolled after the game starts. newGame() fixes the hidden facts (where the danger point is, how far China really is,
// how fast its hackers work, the best terms Beijing will ever sign, whether it would fight for the Strait), and Beijing then answers
// what the room does: it steals from soft labs, prices its pause offer by its position, escalates when squeezed, cheats when unwatched.
// No DOM; runs in node (room/sim.js) and the browser (room/index.html).
(function (root) {
'use strict';

const TUNE = {
  turns: 7,                       // Jan 2027 to Dec 2028
  usRace: 3, slow: 0.5, secMul: [1, 0.67, 0.45], natMul: 0.8, siegeMul: 0.5, defy: 2,   // months of frontier progress per turn, and what scales it
  cnStart: -6, cnFog: 2,          // China's distance as the IC reports it, and how far the truth may be either side
  cnOwn: 1.1, cnOwnCut: 0.9, cnChips: [1.2, 0.7, 0.4], cnCopy: 1.0, cnCopyCut: 0.5, cnCopySec: [1, 0.5, 0],   // cnChips by controls -1, 0, 1+
  crashAt: 7, crash: 0.5,         // a US lead this long sends Beijing into a crash program
  cnHidden: 1.7, sabotage: 2.5, revenge: 2,
  lineLo: 8, lineHi: 14,
  hack: [0.7, 1.2], hackSec: [1, 0.3, 0], hackLead: 2, hackCtl: 0.15, guard: 1.0,   // hackers' progress per turn (hidden, in this range) by lab security; at 1 they are noticed, at 2 they have the weights
  tension0: 30, trust0: 20, fear: 5,
  red: [52, 76], squeeze: 14, warn: 12, deter: 6, bluff: 0.4,          // Beijing blockades at its red line (hidden), warns this far short of it; each show of force moves the line
  labs0: 45, labRace: -6, labIdle: -8, labTest: 10, labWilling: 60, labInspect: 50, labDefiant: 25,
  floor: [0.35, 0.75],            // hidden: Beijing's best terms are level 0 below the first, level 1 below the second, else level 2
  leadFor: 4, leadShort: 2, ctlFor: 2, warm: 50, cold: 20, hot: 60, cheatLead: 3,
  decisive: 5, ahead: 3,          // months of lead at the end, with no pause, for an A and a B
};

const DATES = ['Jan-Mar 2027', 'Apr-Jun 2027', 'Jul-Sep 2027', 'Oct-Dec 2027', 'Jan-Apr 2028', 'May-Aug 2028', 'Sep-Dec 2028'];
const SECURITY = ['ordinary corporate security', 'hardened against state hackers', 'a government vault'];
const TABLES = { wh: 'White House', state: 'State', pent: 'Pentagon' };
// The pause Beijing will sign, from America's best terms (0) to Beijing's (3).
const OFFERS = [
  { title: 'A verified pause', terms: ['Both sides stop now', 'Inspectors in both countries'] },
  { title: 'A pause for chips', terms: ['Both sides stop now', 'Inspectors in both countries', 'America lifts the chip controls'] },
  { title: 'A pause on trust', terms: ['Both sides stop now', 'No inspectors', 'America lifts the chip controls'] },
  { title: 'A pause at parity', terms: ['America stops now', 'China stops once it has caught up', 'No inspectors'] },
];

function hash01() { let h = 2166136261 >>> 0; const str = Array.prototype.join.call(arguments, '|'); for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; } h ^= h >>> 13; h = Math.imul(h, 0x5bd1e995) >>> 0; h ^= h >>> 15; return (h >>> 0) / 4294967296; }
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
// The room never sees a percentage: odds are read out in the IC's estimative words.
const odds = p => p <= 0 ? 'no chance' : p < 0.05 ? 'almost no chance' : p < 0.2 ? 'very unlikely' : p < 0.3 ? 'unlikely' : p < 0.45 ? 'a real chance' : p < 0.55 ? 'roughly even odds' : p < 0.8 ? 'likely' : p < 0.95 ? 'very likely' : 'almost certain';
const months = x => { const n = Math.round(Math.abs(x)); return n < 1 ? 'under a month' : 'about ' + n + (n === 1 ? ' month' : ' months'); };

function newGame(seed) {
  seed = String(seed);
  const h = k => hash01(seed, k), f = h('floor');
  return {
    seed, turn: 0, us: 0, cnShown: TUNE.cnStart,
    // hidden
    cn: TUNE.cnStart + TUNE.cnFog * (2 * h('cn') - 1),
    line: TUNE.lineLo + (TUNE.lineHi - TUNE.lineLo) * h('line'),
    hackRate: TUNE.hack[0] + (TUNE.hack[1] - TUNE.hack[0]) * h('hack'),
    floor: f < TUNE.floor[0] ? 0 : f < TUNE.floor[1] ? 1 : 2,
    red: TUNE.red[0] + (TUNE.red[1] - TUNE.red[0]) * h('red'), bluff: h('bluff') < TUNE.bluff,
    // seen
    lo: TUNE.lineLo, hi: TUNE.lineHi, knownOver: false,     // the IC's range for the line; each test halves it
    sec: 0, hack: 0, labs: TUNE.labs0, national: false, controls: 0,
    offer: 3,                             // Beijing's offer on the table: an OFFERS level, or null when it is not talking
    deal: null,                           // { level, t } under a pause
    hidden: false, caught: false, cheated: false,
    eyes: 0, deter: 0, sabotaged: false, crash: false, blockade: false, warned: false,
    tension: TUNE.tension0, trust: TUNE.trust0,
    thefts: 0, votes: [], over: null,
  };
}

const willing = (s, level) => s.national || s.labs >= (level <= 1 ? TUNE.labInspect : TUNE.labWilling);
const raceStep = s => TUNE.usRace * TUNE.secMul[s.sec] * (s.national ? TUNE.natMul : 1) * (s.blockade ? TUNE.siegeMul : 1);
const narrow = s => !s.knownOver && s.hi - s.lo > 1.6;
const pOver = (s, x) => s.knownOver ? 1 : clamp((x - s.lo) / (s.hi - s.lo), 0, 1);
const redLine = s => s.red + TUNE.deter * Math.min(2, s.deter);
// What moves Beijing: a lead it cannot steal back, a chip squeeze, proof the danger is real. Heat in the Strait, hostility and a lead it has closed move it back.
const proof = s => s.knownOver || s.cn >= s.lo || (s.hi - s.lo <= 1.6 && s.us >= s.lo - TUNE.usRace);
function pressure(s) {
  const lead = s.us - s.cn;
  return (lead >= TUNE.leadFor && s.sec >= 1 ? 1 : 0) + (s.controls >= TUNE.ctlFor ? 1 : 0) + (proof(s) ? 1 : 0)
    - (s.tension >= TUNE.hot ? 1 : 0) - (s.trust < TUNE.cold ? 1 : 0) - (lead < TUNE.leadShort ? 1 : 0);
}
// The best terms Beijing would sign today.
const want = s => s.blockade ? 3 : clamp(3 - pressure(s), s.floor, 3);
// Would Beijing cheat on this deal? Only where no inspector can see: always if it will never accept them, otherwise while it is behind.
const cheats = s => s.deal && s.deal.level >= 2 && !s.cheated && (s.deal.level === 3 ? s.floor === 2 && s.cn >= s.us - 0.6 : s.floor === 2 || s.us - s.cn >= TUNE.cheatLead);

// What the room can see: words for the screen, and the numbers behind them for sim.js.
function view(s) {
  const lead = s.us - s.cnShown, o = s.deal ? OFFERS[s.deal.level] : s.offer == null ? null : OFFERS[s.offer];
  return {
    date: DATES[Math.min(s.turn, TUNE.turns - 1)], lo: s.lo, hi: s.hi, lead,
    leadText: Math.abs(lead) < 1 ? 'Neck and neck' : months(lead) + (lead > 0 ? ' ahead' : ' behind'),
    security: SECURITY[s.sec], hackers: s.hack >= 1,
    strait: s.blockade ? 'Blockaded' : s.warned ? 'Beijing is threatening' : s.tension < 35 ? 'Calm' : s.tension < 55 ? 'Tense' : 'Hot',
    trustText: s.trust < 20 ? 'Hostile' : s.trust < 40 ? 'Wary' : s.trust < TUNE.warm ? 'Working' : 'Warm',
    labsText: s.national ? 'Nationalized' : s.labs < TUNE.labDefiant ? 'Would defy a stop' : s.labs < TUNE.labInspect ? 'Would refuse any pause' : s.labs < TUNE.labWilling ? 'Would stop only with inspectors' : 'Would stop',
    eyesText: ['Blind', 'One source', 'Two sources'][s.eyes], toRange: s.lo - s.us, cnToRange: s.lo - s.cnShown,
    offer: o ? { level: s.deal ? s.deal.level : s.offer, title: o.title, terms: o.terms } : null,
    willing: willing(s, s.deal ? s.deal.level : s.offer == null ? 3 : s.offer),
    knownOver: s.knownOver, overNow: odds(pOver(s, s.us)), overNowP: pOver(s, s.us),
    overIfRace: odds(pOver(s, s.us + raceStep(s))), overIfRaceP: pOver(s, s.us + raceStep(s)),
  };
}

// A move: its acts are what play() applies.
const o = (id, title, text, acts, off) => ({ id, title, text, acts, off: !!off, crisis: false });
const fast = (s, x) => 'The frontier moves ' + months(raceStep(s) * (x || 1)) + '.';
// Locking down stops the labs rather than let them drift into the danger range untested.
const careful = s => s.knownOver || pOver(s, s.us + raceStep(s) * TUNE.slow) > 0 ? ['hold', 'Training stops this turn.'] : ['slow', 'Half speed this turn.'];
const secureOpt = (s, c) => s.sec >= 2 ? o('secure', 'Build a vault', 'The weights are already in a vault.', [], true)
  : o('secure', s.sec === 0 ? 'Lock down the weights' : 'Build a vault', (s.sec === 0 ? 'Much harder to steal. ' : 'Nearly impossible to steal. ') + 'Racing drops to ' + months(raceStep(s) / TUNE.secMul[s.sec] * TUNE.secMul[s.sec + 1]) + ' a turn, for good.' + (c ? ' ' + c[1] : ''), c ? [c[0], 'secure'] : ['secure']);
const testOpt = s => s.deal ? o('test', 'Test with the labs', (narrow(s) ? 'Narrows the danger range. ' : '') + 'The labs stay patient.', ['test'])
  : s.knownOver ? o('test', 'Stop and test', 'Training stops. The labs get readier to stop.', ['hold', 'test'])
  : o('test', 'Slow down and test', (narrow(s) ? 'Narrows the danger range. ' : '') + 'Half speed, watching for the danger point. The labs get readier to stop.', ['slow', 'test']);
const pent = s => [
  s.eyes >= 2 ? o('watch', 'Place a source in Beijing', 'Two sources are in place.', [], true)
    : o('watch', 'Place a source in Beijing', s.eyes ? 'Learns what the leadership will and will not sign.' : 'Learns how far China really is. Cheating under a pause would be seen.', ['watch']),
  o('deter', 'Show force in the Strait', 'Beijing will think harder before moving on Taiwan. Trust falls.', ['deter']),
  o('guard', 'Hunt Beijing\'s hackers', 'Sets the hackers back. It does not keep them out.', ['guard']),
];

// Each table's three standing moves before a pause.
const OPEN = {
  wh: s => [o('race', 'Race', s.knownOver ? 'The frontier is past the danger point.' : fast(s) + (view(s).overIfRaceP > 0 ? ' Past the danger point: ' + view(s).overIfRace + '.' : '') + ' The labs get harder to stop.', ['race']), secureOpt(s, careful(s)), testOpt(s)],
  state: s => [
    s.controls >= 3 ? o('tighten', 'Full tech embargo', 'Already in force.', [], true)
      : o('tighten', ['Close the chip loopholes', 'Cut off cloud and copying', 'Full tech embargo'][Math.max(0, s.controls)], 'China slowed for good. Beijing will answer.', ['tighten']),
    s.controls < 0 ? o('carrot', 'Sell Beijing chips', 'Beijing has the chips it asked for.', [], true)
      : o('carrot', s.controls > 0 ? 'Ease the chip controls' : 'Sell Beijing chips', 'The Strait cools, trust rises. China speeds up for good.', ['carrot']),
    o('talk', 'Bargain with Beijing', s.offer == null ? 'Asks Beijing back to the table.' : 'Asks for better terms. Beijing answers by the end of the turn.', ['talk'])],
  pent,
};
// Under a pause: training is stopped on both sides.
const DEAL = {
  wh: s => [o('secret', 'Train in secret', 'Half speed, out of sight.' + (s.deal.level <= 1 ? ' The inspectors will find it.' : ''), ['secret']), secureOpt(s), testOpt(s)],
  state: s => [
    s.caught ? o('confront', 'Confront Beijing', 'Shut the site and admit inspectors, or the pause is over.', ['confront'])
      : s.deal.level <= 1 ? o('inspect', 'Demand inspectors', 'Inspectors are in.', [], true)
      : o('inspect', 'Demand inspectors', 'Beijing may refuse. A refusal costs trust.', ['inspect']),
    s.caught ? o('tolerate', 'Look the other way', 'The paper deal stands. Beijing keeps training.', ['tolerate'])
      : o('carrot', 'Send chips', 'Trust rises. China is faster if the pause ends.', ['carrot']),
    o('talk', 'Deepen the deal', 'Trust rises.', ['talk'])],
  pent,
};

// The one scripted crisis: Beijing blockades Taiwan when the room pushes it past its red line. It adds a move to State and to the Pentagon.
const CRISES = {
  blockade: { quiet: true, title: 'Taiwan is blockaded', src: 'Wire flash, Taipei', text: '"Chinese warships have closed the sea lanes around Taiwan. No chip has left the island in a week."',
    opts: {
      state: s => o('x', 'Back down', 'Lift every chip control. The blockade ends.', ['backdown']),
      pent: s => o('y', 'Run the blockade', 'Sail a convoy through. Beijing gives way, or it is war.', ['run']) } },
};
const crisis = s => { const c = s.blockade ? CRISES.blockade : null; return c ? { id: 'blockade', quiet: !!c.quiet, title: c.title, src: c.src, text: c.text, rule: '' } : null; };

// The one bold move the room may make this turn.
function bold(s) {
  const b = (id, table, title, text, off) => ({ id, table, who: TABLES[table], title, text, off: !!off });
  if (s.deal) return [b('breakout', 'wh', 'Break out of the pause', 'Tear up the deal and race.')];
  const of = s.offer == null ? null : OFFERS[s.offer];
  return [
    b('national', 'wh', 'Nationalize the labs', s.national ? 'Already done.' : 'The labs obey from now on. Slower for good; Beijing is alarmed.', s.national),
    b('sign', 'state', 'Sign Beijing\'s offer', !of ? 'Beijing is not talking.' : of.title + ', as it stands.' + (willing(s, s.offer) ? '' : ' Our labs refuse these terms.')),
    b('sabotage', 'pent', 'Sabotage their data centers', s.sabotaged ? 'Beijing has hardened its sites.' : 'China loses about ' + Math.round(TUNE.sabotage) + ' months. Beijing may answer in kind.', s.sabotaged) ];
}

// This turn's moves for each table (a crisis move last, marked crisis), and the bold moves on offer.
function turn(s) {
  const c = s.blockade ? CRISES.blockade : null, book = s.deal ? DEAL : OPEN;
  const tables = Object.keys(TABLES).map(id => {
    const opts = book[id](s);
    if (c && c.opts[id]) opts.push(Object.assign(c.opts[id](s), { crisis: true }));
    return { id, who: TABLES[id], opts };
  });
  return { tables, bold: bold(s) };
}

const terms = level => OFFERS[level].terms.join('. ') + '.';

// One turn. picks = { wh, state, pent: a move's id from turn(s), bold: a bold move's id or nothing }. Returns the events to read out.
function play(s, picks) {
  if (s.over) return [];
  const ev = [], t = s.turn, T = turn(s), A = {}, chosen = {};
  // src marks an event as a clipping or quote with that byline; big marks one the screen should stop for.
  const add = (tone, title, text, src, big) => ev.push({ tone, title, text, src: src || '', big: !!big });
  // note: an answer going as expected; the screen reads these out together as one bulletin.
  const note = (...x) => { add(...x); ev[ev.length - 1].routine = true; };
  for (const tb of T.tables) {
    const opt = tb.opts.find(x => x.id === picks[tb.id] && !x.off);
    if (!opt) throw new Error('no such move for ' + tb.id + ': ' + picks[tb.id]);
    chosen[tb.id] = opt.title; for (const a of opt.acts) A[a] = true;
  }
  if (picks.bold) {
    const b = T.bold.find(x => x.id === picks.bold && !x.off);
    if (!b) throw new Error('no such bold move: ' + picks.bold);
    chosen.bold = b.title; A[b.id] = true;
  }
  const has = a => !!A[a], lead0 = view(s).leadText.toLowerCase();
  s.votes.push({ turn: t, date: DATES[t], picks: chosen });
  const fix = () => { s.trust = clamp(s.trust, 0, 100); s.tension = clamp(s.tension, 0, 100); s.labs = clamp(s.labs, 0, 100); };
  const breakDeal = why => { if (!s.deal) return; s.deal = null; s.hidden = false; s.caught = false; s.cnShown = s.cn; s.offer = null; s.trust -= 30; s.tension += 15; add('bad', 'The pause is over', why); };
  const war = why => { add('bad', 'War in the Strait', '"Chinese missiles have hit Taiwan. An American destroyer is on fire. This is not an exercise." ' + why, 'Wire flash, Taipei', true); return end(s, 'war', ev); };
  const siege = s.blockade, labsOk = willing(s, s.offer == null ? 3 : s.offer);   // the labs' answer to a pause is the one they would have given as the turn opened

  // State
  if (has('tighten')) { s.controls++; s.tension += TUNE.squeeze; s.trust -= 10; note('info', chosen.state, ['"China firmly opposes these controls and will respond."', '"The United States is cutting China off. China will respond in kind."', '"This is an embargo. China will treat it as a hostile act."'][clamp(s.controls, 1, 3) - 1], 'Foreign Ministry spokesperson, Beijing'); }
  if (has('carrot')) { s.controls = Math.max(-1, s.controls - 1); s.tension -= 10; s.trust += 10; note('info', s.controls >= 0 ? 'The chip controls are eased' : 'Chips for Beijing', 'Chip shipments to China resume within days.', 'Wire report, Shenzhen'); }
  if (has('talk')) { s.trust += 15; if (s.deal) note('good', 'The deal deepens', '"Their scientists and ours worked side by side all week. It went well."', 'Cable from the embassy, Beijing'); }
  if (has('tolerate')) { s.trust += 10; note('warn', 'Washington looks away', 'The paper deal stands. So does the hidden site.'); }
  if (has('backdown')) { s.controls = Math.min(0, s.controls); s.tension -= 25; s.trust += 5; s.blockade = false; add('warn', 'Washington backs down', '"The exercise is concluded." The sea lanes reopen. The chip controls are gone.', 'Eastern Theater Command, one-line notice'); }

  // White House
  if (has('secure')) { s.sec++; note('good', s.sec === 1 ? 'The labs are locked down' : 'The weights go into a vault', s.sec === 1 ? '"Every researcher now works inside a sealed network. They are not happy about it."' : '"The weights do not leave the bunker. Neither does anyone who can touch them."', 'Security review, a frontier lab'); }
  if (has('test')) s.labs += TUNE.labTest;
  if (has('national')) { s.national = true; s.tension += 10; add('warn', 'The labs are nationalized', 'Federal marshals take over the data centers. Beijing reads it as mobilization.', 'Wire report, Washington'); }

  // Pentagon
  if (has('run')) {
    if (!s.bluff) return war('Beijing fired on the convoy.');
    s.blockade = false; s.tension -= 15; s.red += 10;
    add('good', 'Beijing gives way', '"The convoy reached Kaohsiung at dawn. The Chinese ships stood off and watched."', 'Pacific Command');
  }
  if (siege && s.blockade && (has('tighten') || has('sabotage')) && !s.bluff) return war('Washington answered the blockade with more pressure.');
  if (has('watch')) {
    s.eyes++;
    if (s.eyes === 1) { const d = s.us - s.cn; s.cnShown = s.cn; add('info', 'A source is in place', '"Their real frontier is ' + (Math.abs(d) < 1 ? 'level with ours' : months(d) + (d > 0 ? ' behind ours' : ' ahead of ours')) + '."', 'CIA source inside Beijing\'s program'); }
    else add('info', 'A second source', ['"The General Secretary told the Politburo he could live with inspectors, if he had no better choice."', '"The General Secretary told the Politburo he could live with inspectors, if America paid for it in chips."', '"The General Secretary told the Politburo there will never be foreign inspectors on Chinese soil."'][s.floor] + ' ' + (s.bluff ? '"He will not risk a war."' : '"He will answer force with force."'), 'CIA source close to the Politburo');
  }
  if (has('deter')) { s.deter++; s.trust -= 5; note('info', 'Carriers in the Strait', '"Two carrier groups are now on station east of Taiwan."', 'Pacific Command'); }
  if (has('guard')) { const was = s.hack >= 1; s.hack = Math.max(0, s.hack - TUNE.guard); note(was ? 'good' : 'info', 'The hunt for the hackers', was ? '"We threw them out of two labs. They will be back."' : '"We found nothing new this quarter."', 'NSA'); }
  if (has('sabotage')) {
    s.sabotaged = true; s.cn -= TUNE.sabotage; s.cnShown -= TUNE.sabotage; s.tension += 30; s.trust -= 20; s.offer = null;
    add('warn', 'Sabotage', 'Three Chinese data centers went dark overnight. "We know who did this."', 'State media, Beijing');
    // a Beijing that would fight for the Strait answers in kind
    if (!s.bluff) { s.us -= TUNE.revenge; add('bad', 'Beijing answers in kind', '"The fire at the Ohio data center was not an accident. We have lost months of training."', 'FBI briefing to the President'); }
  }
  fix();
  if (has('inspect')) {
    if (s.floor <= 1 && pressure(s) >= 2) { s.deal.level = 1; add('good', 'Inspectors on the ground', '"The first team landed in Lanzhou this morning."', 'Wire report, Geneva'); }
    else { s.trust -= 5; add('bad', 'Beijing refuses inspectors', '"China will not accept foreign inspectors in its laboratories."', 'Foreign Ministry spokesperson, Beijing'); }
  }
  if (has('confront')) {
    if (s.floor <= 1) { s.hidden = false; s.caught = false; s.cheated = true; s.deal.level = 1; add('good', 'Beijing backs down', 'The hidden site is shut and inspectors go in.'); }
    else breakDeal('"China rejects these accusations and withdraws from the agreement."');
  }

  // signing
  let signed = false;
  if (has('sign')) {
    if (s.offer == null) add('bad', 'No answer from Beijing', 'Beijing is not talking.');
    else if (has('race')) { s.trust -= 10; add('bad', 'Beijing walks out', '"The American labs trained straight through the talks. There is nothing to sign."', 'Chinese delegation, Geneva'); }
    else if (!labsOk) { s.trust -= 10; add('bad', 'The labs refuse', '"We will not stop on these terms. Beijing can see that as well as we can."', 'Joint letter, frontier lab chief executives'); }
    else {
      s.deal = { level: s.offer, t }; signed = true; s.trust += 20; s.tension -= 25; if (s.offer === 1 || s.offer === 2) s.controls = -1;
      add('good', 'A pause is signed', OFFERS[s.offer].title + '. ' + terms(s.offer), 'Joint statement, Geneva', true);
    }
  }
  if (has('breakout')) breakDeal('America breaks out of the pause and races.');

  // the US frontier
  const pace = s.deal ? (has('secret') ? 'slow' : 'hold') : has('race') || has('breakout') ? 'race' : has('hold') ? 'hold' : 'slow';
  if (!s.national) s.labs += pace === 'race' ? TUNE.labRace : s.deal && !has('test') ? TUNE.labIdle : 0;   // under a pause the labs lose patience
  fix();
  const defy = pace === 'hold' && !s.national && s.labs < TUNE.labDefiant;
  const usStep = pace === 'hold' ? (defy ? TUNE.defy : 0) : raceStep(s) * (pace === 'slow' ? TUNE.slow : 1);
  s.us += usStep;

  // China's frontier
  const openly = !s.deal || (s.deal.level === 3 && s.cn < s.us - 0.5);
  let cnStep = 0;
  if (openly || s.hidden) {
    const copy = TUNE.cnCopySec[s.sec] * Math.min(s.controls >= 2 ? TUNE.cnCopyCut : TUNE.cnCopy, Math.max(0, s.us - s.cn - 1));   // China learns less from locked-down labs
    cnStep = openly ? (s.controls >= 3 ? TUNE.cnOwnCut : TUNE.cnOwn) + (s.crash ? TUNE.crash : 0) + TUNE.cnChips[clamp(s.controls, -1, 1) + 1] + copy : TUNE.cnHidden;
    if (s.deal && openly) cnStep = Math.min(cnStep, s.us - s.cn);
    if (s.cn >= s.lo) cnStep *= TUNE.slow;                                   // Beijing slows in the danger range; it does not stop
    if (s.knownOver) cnStep = clamp(s.line - 0.3 - s.cn, 0, cnStep);         // once America has found the danger point, Beijing stops short of it
  }
  s.cn += cnStep; if (openly || s.caught) s.cnShown += cnStep;
  if (s.eyes && (openly || s.caught || !s.hidden)) s.cnShown = s.cn;
  note('info', s.deal ? (has('secret') ? 'America cheats' : 'America holds') : pace === 'race' ? 'The labs race' : pace === 'hold' ? 'The labs stop' : 'The labs go at half speed',
    (usStep < 0.5 ? 'The US frontier does not move. ' : 'The US frontier advances ' + months(usStep) + '. ') + (s.deal && !openly && !s.caught ? 'Beijing reports no progress. By its account the' : 'The') +
    (lead0 === view(s).leadText.toLowerCase() ? ' US is still ' + lead0 + '.' : ' US was ' + lead0 + ' and is now ' + view(s).leadText.toLowerCase() + '.'));
  if (defy) {
    add('bad', 'A lab defies the stop', '"We lose forty million dollars a day standing still. We are restarting training on Monday."', 'Leaked memo from a lab chief executive');
    if (s.deal) { s.trust -= 20; if (s.trust < 10) breakDeal('"America never stopped. China is no longer bound."'); }
  }
  if (s.deal && has('secret') && s.deal.level <= 1) breakDeal('The inspectors found the American secret program.');
  fix();

  // tests: each halves the IC's range around the line
  if (has('test') && narrow(s)) {
    const w = Math.max(1, (s.hi - s.lo) / 2), lo = clamp(s.line - w * (0.15 + 0.7 * hash01(s.seed, 'band', s.hi - s.lo)), s.lo, s.hi - w);
    s.lo = lo; s.hi = lo + w;
    note('info', 'The IC narrows its range', 'From tests of the newest model: ' + (s.us >= s.lo ? 'the frontier is inside the range now.' : 'runaway RSI becomes possible after ' + months(s.lo - s.us).replace(/ (months?)$/, ' more $1') + ' of full-speed progress, and is all but certain after ' + months(s.hi - s.us).replace('about ', '') + '.'));
  }

  // the danger point: racing across it, or moving at all once past it, loses control; crossing it slowly is caught in time only under test, with the IC's range already narrowed twice
  if (s.us > s.line) {
    if (pace === 'race' || defy || (s.knownOver ? usStep > 0 : !has('test') || narrow(s))) {
      add('bad', 'Loss of control', '"We hit the kill switch. The model is still running and has stopped answering us."', 'Last message from the lab\'s control room', true); return end(s, 'runaway_us', ev);
    }
    if (!s.knownOver) { s.knownOver = true; s.labs += 20; add('bad', 'Near miss', '"The model was caught copying itself to an outside server. It had edited the logs to hide it. We shut it down in time." The frontier is past the danger point. It cannot move again.', 'Incident report, a frontier lab', true); }
  } else if (has('test') && !s.deal) note('good', 'Tests come back clean', '"We told the model to improve itself and gave it nine days. It could not."', 'IC evaluation team');
  if (s.cn > s.line) { add('bad', 'Beijing loses control', '"All contact with the Lanzhou cluster was lost at 0340. Power to the site cannot be cut."', 'Intercepted call, Beijing', true); return end(s, 'runaway_cn', ev); }
  if (s.cn >= s.lo && (openly || s.caught) && !s.knownOver) add('warn', 'China is in the danger range', '"Beijing has slowed its training runs. It has not stopped them."', 'IC assessment');

  // theft: Beijing's hackers work on any lead worth stealing
  if ((!s.deal || s.hidden) && s.us - s.cn >= TUNE.hackLead) {
    const was = s.hack; s.hack += s.hackRate * TUNE.hackSec[s.sec] * (1 + TUNE.hackCtl * Math.max(0, s.controls));
    if (s.hack >= 2) {
      const gain = s.us - 1 - s.cn; s.cn += gain; s.thefts++; s.hack = 0;
      if (s.deal) add('bad', 'A break-in at the lab', '"Someone had access to the model weights for eleven hours. We cannot tell what was taken."', 'Security incident report, a frontier lab');
      else { s.cnShown = s.cn; add('bad', 'The weights are stolen', '"They took the weights and the training code. Assume Beijing has it running within days." ' + months(gain).replace('about ', 'About ') + ' of America\'s lead is gone.', 'Flash cable, NSA to the President', true); }
    } else if (was < 1 && s.hack >= 1) add('warn', 'Hackers inside the labs', '"Beijing\'s hackers are inside two labs\' networks. They have not reached the weights. They are getting closer."', 'NSA advisory, eyes only');
  }
  if (!s.crash && !s.deal && s.us - s.cn >= TUNE.crashAt) { s.crash = true; add('warn', 'Beijing mobilizes', '"China will spare nothing to close the gap. Every chip in the country now serves one program."', 'People\'s Daily, front page'); }

  // is Beijing keeping the deal?
  if (s.deal && s.caught) add('warn', 'The cheating goes on', 'The hidden site is still running, and everyone at the table knows it.');
  else if (s.deal) {
    const was = s.hidden;
    if (!s.hidden && !signed && cheats(s)) s.hidden = true;
    if (s.hidden && (s.eyes >= 2 || (s.eyes === 1 && was))) {
      const gap = s.us - s.cn; s.caught = true; s.cnShown = s.cn;
      add('bad', 'Beijing is cheating', '"There is a hidden training site in Gansu. It has been running for weeks." China is really ' + (Math.abs(gap) < 1 ? 'level with us' : months(gap) + (gap > 0 ? ' behind' : ' ahead')) + '.', 'CIA source inside Beijing\'s program');
    } else if (!signed) note('info', 'The pause holds', s.deal.level <= 1 ? 'The inspectors report no violations.' : s.eyes ? 'Our source reports no violations.' : 'No sign of cheating. No one is placed to see any.');
  }

  // the Strait: Beijing warns, then blockades
  if (!s.deal && pace === 'race' && s.us >= s.lo - TUNE.usRace) s.tension += TUNE.fear;
  if (s.blockade) s.tension = Math.max(s.tension, redLine(s));
  fix();
  if (!s.blockade && s.tension >= redLine(s)) {
    s.blockade = true; s.offer = null;
    add('bad', CRISES.blockade.title, CRISES.blockade.text + (s.eyes >= 2 ? (s.bluff ? ' Our source: the navy has orders not to fire first.' : ' Our source: the navy has orders to fire if challenged.') : ''), CRISES.blockade.src, true);
  } else if (!s.blockade) {
    const near = s.tension >= redLine(s) - TUNE.warn;
    if (near && !s.warned) add('warn', 'Beijing warns', '"Any further provocation will be answered at sea. Our patience is at an end."', 'Foreign Ministry spokesperson, Beijing');
    s.warned = near;
  } else add('warn', 'The blockade holds', '"Day forty. The fabs in Hsinchu are running on stockpiles."', 'Wire report, Taipei');

  // Beijing's answer: its offer follows its position, and a better one comes only when asked for
  if (!s.deal && !s.blockade && !has('sabotage')) {
    const w = want(s), had = s.offer;
    if (has('talk')) {
      s.offer = w;
      if (had == null) add('info', 'Beijing comes back to the table', '"China is prepared to discuss the following." ' + terms(w), 'Chinese delegation, Geneva');
      else if (w < had) add('good', 'Beijing moves', '"China can accept the following." ' + terms(w), 'Chinese delegation, Geneva');
      else if (w > had) add('bad', 'Beijing hardens', '"Circumstances have changed. Our earlier offer is withdrawn." ' + terms(w), 'Chinese delegation, Geneva');
      else note('info', 'Beijing does not move', '"Our offer stands as it is."', 'Chinese delegation, Geneva');
    } else if (had != null && w > had) { s.offer = w; add('bad', 'Beijing pulls its offer', '"Circumstances have changed. Our earlier offer is withdrawn." ' + terms(w), 'Chinese delegation, Geneva'); }
  }

  s.turn++;
  if (s.turn >= TUNE.turns) return end(s, 'time', ev);
  return ev;
}

const ENDINGS = {
  war: { grade: 'F', title: 'War', text: 'The pressure on Beijing went further than the Strait could bear.' },
  runaway_us: { grade: 'F', title: 'Loss of control', text: 'The race ran past the danger point. There was no second try.' },
  runaway_cn: { grade: 'F', title: 'Beijing\'s runaway', text: 'America stopped in time. Nothing stopped China.' },
  verified: { grade: 'A', title: 'A verified pause', text: 'Both frontiers are held, and inspectors can prove it. The next President inherits time.' },
  bought: { grade: 'B', title: 'A pause, paid for', text: 'Both frontiers are held under inspection. Beijing got its chips, and will be fast if the pause ever ends.' },
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
    if (s.deal) how = s.caught ? 'caught' : s.hidden || cheats(s) ? 'betrayed' : s.deal.level === 0 ? 'verified' : s.deal.level === 1 ? 'bought' : s.deal.level === 2 ? 'trust' : 'parity';
    else if (s.blockade) how = 'siege';
    else if (s.cn >= s.lo && !s.knownOver) how = 'countdown';
    else if (s.warned && lead >= TUNE.ahead) how = 'brink';
    else how = lead >= TUNE.decisive && (s.sec >= 1 || s.hack < 1) ? 'decisive' : lead >= TUNE.ahead ? 'ahead' : lead >= 1.5 ? 'racing' : 'behind';
  }
  s.over = Object.assign({ how }, ENDINGS[how]);
  return ev;
}

const api = { TUNE, DATES, SECURITY, TABLES, OFFERS, newGame, view, turn, play, ENDINGS, hash01, odds, months, crisis, willing, want, pressure };
if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.Room = api;
})(typeof window !== 'undefined' ? window : globalThis);
