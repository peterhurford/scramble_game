// The Scramble: Room Edition. A seven-turn game for a room split into three tables (White House, State, Pentagon),
// on the main game's three problems: weight theft, the US-China balance, and the hidden point where AI starts improving itself.
// Each turn every table makes one of its three standing moves (OPEN before a pause, DEAL under one); the turn's crisis (CRISES) may add
// a fourth to one table. The room may also make one bold move a turn. A move is a list of acts; play() applies them, then the world moves.
// Two ways to do well: a pause (Beijing's hidden price met, labs that will stop, eyes to catch cheating) or a lead big enough to stop on.
// No DOM; runs in node (room/sim.js) and the browser (room/index.html).
// Every roll is hash01(seed, turn, name), so a replayed turn rolls the same dice whatever was chosen.
(function (root) {
'use strict';

const TUNE = {
  turns: 7,                       // Jan 2027 to Dec 2028
  usRace: 3.5, usRaceNat: 2.6, usSlow: 1.75, usHold: 0.35, vault: 0.85,   // months of frontier progress per turn
  steal: [0.8, 0.3, 0.06],        // chance a theft attempt succeeds, by lab security 0-2
  guard: 0.3,                     // x that, the turn the spies are hunted
  cnStart: -6,
  cnOwn: 1.0, cnOwnCut: 0.8, cnChips: [1.2, 0.7, 0.25], cnCopy: 1.0, cnCopyCut: 0.35,   // cnChips by controls -1, 0, 1+
  allies: 0.3, sabotage: 3, burn: 0.6, burnShare: 0.75,
  cnDeal: 0.35, cnHidden: 1.7, secretSeen: 0.35,
  lineLo: 9, lineHi: 15,
  theft: 0.35, theftBand: 0.15, theftFar: 0.10, theftBold: 0.15, theftSpread: 0.15, theftDeal: 0.7,
  runRace: 0.5, runSlow: 0.25, runHold: 0.06, cnRun: 0.4,
  tension0: 30, trust0: 20, fear: 5,
  warFrom: 35, warSlope: 0.004, warDeter: 0.4,
  labs0: 45, labRace: -5, labIdle: -8, labTest: 12, labShelve: -10,   // the labs' readiness to stop: racing wears it down, test results build it
  labWilling: 55, labDefiant: 25, defy: 2,
  dealBase: -0.6, dealAsk: 0.3, dealLead: 0.08, dealTrust: 0.003, dealLever: 0.04, dealHalf: 0.1, dealNone: 0.04,
  inspect: 0.40, inspectTrust: 0.005, inspectLever: 0.1,
  confront: 0.25, confrontCtl: 0.12, confrontLever: 0.1, confrontWar: 0.2,
  cheat: 0.65, cheatTrust: 0.002, cheatMin: 0.4, cheatInsp: 0.3, cheatAgain: 0.5,
  detect: 0.15, detectOne: 0.45, detectBoth: 0.9, rumor: 0.6, rumorFalse: 0.15,
  burned: 0.15, exfil: 10, walkout: 10,
  calm: 20, warm: 50,             // Beijing's price: tension below calm, trust at least warm
  decisive: 7, ahead: 4,          // months of lead at the end, with no pause, for an A and a B
  ultimatum: 20, breakthrough: 1.5, flash: 20, opening: 0.25, slam: 15, hardCheat: 0.9, hardCalm: 0.05,
};

const DATES = ['Jan-Mar 2027', 'Apr-Jun 2027', 'Jul-Sep 2027', 'Oct-Dec 2027', 'Jan-Apr 2028', 'May-Aug 2028', 'Sep-Dec 2028'];
const SECURITY = ['ordinary corporate security', 'hardened against state hackers', 'a government vault'];
const TABLES = { wh: 'White House', state: 'State', pent: 'Pentagon' };
// Beijing's price for a pause: two of these (want completes "Beijing will not sign unless ..."), hidden until found out.
const ASKS = {
  chips: { short: 'chips', want: 'America is selling it chips', met: s => s.controls < 0 },
  pacific: { short: 'a calm Strait', want: 'the Strait is calm', met: s => s.tension < TUNE.calm },
  face: { short: 'an end to hostility', want: 'the Party has stopped calling Washington an adversary', met: s => s.trust >= TUNE.warm },
};

function hash01() { let h = 2166136261 >>> 0; const str = Array.prototype.join.call(arguments, '|'); for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; } h ^= h >>> 13; h = Math.imul(h, 0x5bd1e995) >>> 0; h ^= h >>> 15; return (h >>> 0) / 4294967296; }
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
// The room never sees a percentage: odds are read out in the IC's estimative words.
const odds = p => p <= 0 ? 'no chance' : p < 0.05 ? 'almost no chance' : p < 0.2 ? 'very unlikely' : p < 0.3 ? 'unlikely' : p < 0.45 ? 'a real chance' : p < 0.55 ? 'roughly even odds' : p < 0.8 ? 'likely' : p < 0.95 ? 'very likely' : 'almost certain';
const months = x => { const n = Math.round(Math.abs(x)); return n < 1 ? 'under a month' : 'about ' + n + (n === 1 ? ' month' : ' months'); };

function newGame(seed) {
  seed = String(seed);
  const ids = Object.keys(ASKS), a = Math.floor(hash01(seed, 'ask1') * 3), b = (a + 1 + Math.floor(hash01(seed, 'ask2') * 2)) % 3;
  return {
    seed, turn: 0, us: 0, cn: TUNE.cnStart, cnShown: TUNE.cnStart,
    line: TUNE.lineLo + (TUNE.lineHi - TUNE.lineLo) * hash01(seed, 'line'),
    lo: TUNE.lineLo, hi: TUNE.lineHi,     // the IC's range for the line; each test halves it
    pace: 'race', sec: 0, spread: false, knownOver: false,
    labs: TUNE.labs0, national: false,
    controls: 0, leverage: 0,
    asks: [ids[a], ids[b]], known: [false, false],
    deal: false, dealT: -1, snub: -9, inspectors: false, hidden: false, caught: false, cheated: false,
    eyes: 0,                              // standing sources on Beijing, 0-2
    fresh: null,                          // { t, gain }: a theft the Pentagon can still undo next turn
    tension: TUNE.tension0, trust: TUNE.trust0,
    crisis: null, used: [],
    thefts: 0, votes: [], over: null,
  };
}

const warRisk = s => clamp((s.tension - TUNE.warFrom) * TUNE.warSlope, 0, 0.5);
const lever = s => Math.max(0, s.controls) + s.leverage;
// Beijing does not sign for less than its price: short of it, a yes is a long shot whatever else Washington holds.
const dealOdds = (s, met) => Math.min([TUNE.dealNone, TUNE.dealHalf, 0.9][met], clamp(TUNE.dealBase + TUNE.dealAsk * met + TUNE.dealLead * clamp(s.us - s.cnShown, 0, 8) + TUNE.dealTrust * s.trust + TUNE.dealLever * lever(s) + (s.crisis === 'opening' ? TUNE.opening : 0), 0.03, 0.9));
const inspectOdds = s => clamp(TUNE.inspect + TUNE.inspectTrust * s.trust + TUNE.inspectLever * lever(s), 0.1, 0.9);
const confrontOdds = (s, deter) => clamp(TUNE.confront + TUNE.confrontCtl * Math.max(0, s.controls) + TUNE.confrontLever * s.leverage + (deter ? TUNE.confrontWar : 0), 0.1, 0.9);
const willing = s => s.national || s.labs >= TUNE.labWilling;
const raceStep = s => (s.national ? TUNE.usRaceNat : TUNE.usRace) * (s.sec >= 2 ? TUNE.vault : 1);
const narrow = s => !s.knownOver && s.hi - s.lo > 1.6;
const pOver = (s, x) => s.knownOver ? 1 : clamp((x - s.lo) / (s.hi - s.lo), 0, 1);
function theftOdds(s, bold, guard) {
  if (s.us - s.cn < 1.5) return { attempt: 0, steal: 0 };
  let a = TUNE.theft + (s.us >= s.lo - TUNE.usRace ? TUNE.theftBand : 0) + (s.us - s.cnShown > 8 ? TUNE.theftFar : 0) + (s.spread ? TUNE.theftSpread : 0) + (bold ? TUNE.theftBold : 0);
  if (s.deal) a *= TUNE.theftDeal;
  if (s.crisis === 'zeroday') a = 1;
  return { attempt: Math.min(1, a), steal: TUNE.steal[s.sec] * (guard ? TUNE.guard : 1) };
}

// What the room can see: words for the screen, and the numbers behind them (the ...P fields) for sim.js.
function view(s) {
  const lead = s.us - s.cnShown, th = theftOdds(s);
  return {
    date: DATES[Math.min(s.turn, TUNE.turns - 1)], lo: s.lo, hi: s.hi, lead,
    leadText: Math.abs(lead) < 1 ? 'Neck and neck' : months(lead) + (lead > 0 ? ' ahead' : ' behind'),
    security: SECURITY[s.sec], theft: odds(th.attempt * th.steal), theftP: th.attempt * th.steal,
    war: odds(warRisk(s)), warP: warRisk(s),
    tensionText: s.tension < 25 ? 'Calm' : s.tension < 45 ? 'Tense' : s.tension < 70 ? 'Hot' : 'On the brink',
    trustText: s.trust < 20 ? 'Hostile' : s.trust < 40 ? 'Wary' : s.trust < 60 ? 'Working' : 'Warm',
    labsText: s.national ? 'Nationalized' : s.labs < TUNE.labDefiant ? 'Would defy a stop' : s.labs < TUNE.labWilling ? 'Would refuse a pause' : 'Would stop',
    eyesText: ['Blind', 'One source', 'Good coverage'][s.eyes], toRange: s.lo - s.us, cnToRange: s.lo - s.cnShown,
    willing: willing(s),
    asks: s.asks.map((a, i) => s.known[i] ? ASKS[a].short : null),
    knownOver: s.knownOver, overNow: odds(pOver(s, s.us)), overNowP: pOver(s, s.us),
    overIfRace: odds(pOver(s, s.us + raceStep(s))), overIfRaceP: pOver(s, s.us + raceStep(s)),
  };
}

// Beijing's two demands as the room knows them; met is withheld while a demand is unknown.
const price = s => s.asks.map((a, i) => s.known[i] ? { known: true, short: ASKS[a].short, want: ASKS[a].want, met: !!ASKS[a].met(s) } : { known: false });

// A move: its acts are what play() applies.
const o = (id, title, text, acts, off) => ({ id, title, text, acts, off: !!off, crisis: false });
const warText = (s, d, x) => odds(warRisk({ tension: s.tension + d }) * x);
const fast = (s, x) => 'The frontier moves ' + months(raceStep(s) * (x || 1)) + '.';
// Any White House move but Race brakes: half speed short of the danger range, a full stop at it.
const careful = s => view(s).overIfRaceP > 0 ? ['hold', 'Training stops this turn.'] : ['slow', 'Half speed this turn.'];
const secureOpt = (s, c) => s.sec >= 2 ? o('secure', 'Build a vault', 'The weights are already in a vault.', [], true)
  : o('secure', s.sec === 0 ? 'Lock down the weights' : 'Build a vault', (s.sec === 0 ? 'Most thefts fail from now on.' : 'Theft becomes nearly impossible. Racing is slower for good.') + (c ? ' ' + c[1] : ''), c ? [c[0], 'secure'] : ['secure']);
const testOpt = (s, c) => o('test', !c ? 'Test with the labs' : c[0] === 'hold' ? 'Stop and test' : 'Slow down and test', (narrow(s) ? 'Narrows the danger range. ' : '') + (s.deal ? 'The labs stay patient.' : 'The labs get readier to stop. ' + c[1]), c ? [c[0], 'test'] : ['test']);
const talkOpt = s => o('talk', s.deal ? 'Deepen the deal' : 'Work the back channel', s.deal ? 'Trust rises: cheating gets less likely.' : (s.known.every(Boolean) ? '' : 'Learns one of Beijing\'s demands. ') + 'Trust rises, tension falls.', ['talk']);
const pent = s => [
  s.eyes >= 2 ? o('watch', 'Place a source in Beijing', 'Coverage is as good as it gets.', [], true)
    : o('watch', 'Place a source in Beijing', (s.deal || s.known.every(Boolean) ? '' : 'Learns one of Beijing\'s demands. ') + 'Cheating under a pause gets easier to see.', ['watch']),
  o('deter', 'Show force in the Strait', (s.caught ? 'Beijing is likelier to back down. ' : '') + (warText(s, 0, TUNE.warDeter) === warText(s, 0, 1) ? 'Lowers the chance of war this turn.' : 'War this turn ' + warText(s, 0, TUNE.warDeter) + ', not ' + warText(s, 0, 1) + '.'), ['deter']),
  o('guard', 'Hunt Beijing\'s hackers', 'Most theft attempts fail, this turn only.', ['guard']),
];

// Each table's three standing moves before a pause.
const OPEN = {
  wh: s => { const c = careful(s); return [o('race', 'Race', fast(s) + (view(s).overIfRaceP > 0 ? ' Past the danger point: ' + view(s).overIfRace + '.' : '') + ' The labs get harder to stop.', ['race']), secureOpt(s, c), testOpt(s, c)]; },
  state: s => [
    s.controls >= 3 ? o('tighten', 'Full tech embargo', 'Already in force.', [], true)
      : o('tighten', ['Close the chip loopholes', 'Cut off cloud and copying', 'Full tech embargo'][Math.max(0, s.controls)], 'China slowed for good. Tension rises, trust falls.', ['tighten']),
    s.controls < 0 ? o('carrot', 'Sell Beijing chips', 'Beijing has the chips it asked for.', [], true)
      : o('carrot', s.controls > 0 ? 'Ease the chip controls' : 'Sell Beijing chips', 'Trust rises, tension falls. China speeds up for good.', ['carrot']),
    talkOpt(s)],
  pent,
};
// Under a pause: training is stopped on both sides.
const DEAL = {
  wh: s => [o('secret', 'Train in secret', 'About two months of progress. If Beijing catches it, the deal dies.', ['secret']), secureOpt(s), testOpt(s)],
  state: s => [
    s.caught ? o('confront', 'Confront Beijing', 'Beijing shuts the site: ' + odds(confrontOdds(s)) + '. If not, the deal dies.', ['confront'])
      : s.inspectors ? o('snap', 'Snap inspection', 'Very likely catches any cheating. Trust falls.', ['snap'])
      : o('inspect', 'Demand inspectors', 'Beijing agrees: ' + odds(inspectOdds(s)) + '. A refusal costs trust.', ['inspect']),
    s.caught ? o('tolerate', 'Look the other way', 'The paper deal stands. Beijing keeps training.', ['tolerate'])
      : o('carrot', 'Send chips', 'Trust rises. China is faster if the pause ends.', ['carrot']),
    talkOpt(s)],
  pent,
};

// One crisis opens each turn after the first: drawn per seed from those whose ok(s) holds, never twice a game.
// opt(s) is the extra move it gives table; rule is anything else it changes; hit(s) lands as it is drawn;
// the rest is applied in play(), including what it costs the table to pass the move up.
const CRISES = {
  ultimatum: { ok: s => !s.deal && s.controls > 0, title: 'Beijing sets a deadline', src: 'Demarche handed to the ambassador, Beijing',
    text: '"Lift the chip controls this quarter, or live-fire drills begin around Taiwan."',
    rule: 'If State does not ease the controls this turn, the drills begin.' },
  breakthrough: { ok: s => !s.deal, title: 'A breakthrough', src: 'Memo to the President from a frontier lab',
    text: '"We have found a much faster way to train. We want to start using it now."',
    rule: 'If the White House says no, the labs get harder to stop.', table: 'wh',
    opt: s => o('x', 'Race with the new method', fast(s, TUNE.breakthrough) + ' Beijing\'s hackers will want it.', ['race', 'surge']) },
  zeroday: { ok: s => !s.deal && s.sec < 2 && s.us - s.cn >= 1.5, title: 'A hole in every lab', src: 'NSA advisory, eyes only',
    text: '"Every frontier lab runs software with a flaw we cannot fix for ninety days. Beijing knows about it."',
    rule: 'Beijing will try to steal the weights this turn, unless the White House takes the labs offline.', table: 'wh',
    opt: s => o('x', 'Take the labs offline', 'Nothing can be stolen this turn. Training stops.', ['hold', 'offline']) },
  flash: { ok: s => s.tension < 70, title: 'Collision over the Strait', src: 'Wire flash, Taipei', hit: s => { s.tension = Math.min(100, s.tension + TUNE.flash); },
    text: '"A Chinese fighter has collided with a US patrol plane off Taiwan. Both navies are moving in."', rule: 'Tension has jumped. State can calm it this turn.', table: 'state',
    opt: s => o('x', 'Open the hotline', 'Tension drops sharply.', ['hotline']) },
  defector: { ok: s => s.deal ? !s.caught : !s.known.every(Boolean), title: 'A walk-in', src: 'Flash cable, CIA station, Singapore',
    text: '"A man claiming to be a deputy director of Beijing\'s frontier program has walked into the consulate. He has days before he is missed."',
    rule: 'If the Pentagon does not get him out this turn, Beijing arrests him and trust falls.', table: 'pent',
    opt: s => o('x', 'Get him out', (s.deal ? 'We learn for certain whether Beijing is cheating.' : 'We learn both of Beijing\'s demands.') + ' Beijing will know: trust falls.', ['exfil']) },
  opening: { ok: s => !s.deal && s.turn >= 2 && s.snub !== s.turn - 1, title: 'Beijing opens a door', src: 'Message passed through Singapore',
    text: '"The General Secretary is prepared to hear a proposal. The offer will not be repeated."',
    rule: 'A pause proposed this turn is much likelier to get a yes. Tighten chip controls or sabotage Beijing this turn and the offer is withdrawn.' },
  whistle: { ok: s => !s.deal && narrow(s) && s.us >= s.lo - 5, title: 'A warning from inside', src: 'Open letter, lab safety staff',
    text: '"The newest model lied to its testers to avoid being shut down. Management told us to ship it anyway."',
    rule: 'If the White House does not pull the model this turn, the safety staff quit and the labs get harder to stop.', table: 'wh',
    opt: s => { const c = careful(s); return o('x', 'Pull the model and test it', 'The IC narrows its range sharply. ' + c[1], [c[0], 'test', 'test2']); } },
  allies: { ok: s => !s.deal && !s.spread, title: 'The allies want in', src: 'Joint letter, Tokyo and London',
    text: '"We will enforce every chip control you ask for. In return we want the frontier models running on our soil."',
    rule: 'If State does not share the models this turn, the allies stop helping with chip controls.', table: 'state',
    opt: s => o('x', 'Share the models', 'China slowed for good. More copies to steal: hackers get bolder for good.', ['share']) },
  hardliners: { ok: s => s.deal && !s.hidden && !s.caught && s.turn < TUNE.turns - 1, title: 'The generals want out', src: 'Note from a Chinese negotiator, by hand',
    text: '"The generals want out of the pause, and the General Secretary is listening. I need something to show them now."',
    rule: 'Beijing very likely starts cheating this turn, unless State sends chips.' },
  // Never drawn: set by drawCrisis the turn after a theft. quiet: the theft's own bulletin already announced it.
  stolen: { ok: () => false, quiet: true, title: 'Beijing has the weights', src: '', text: '', rule: 'Beijing keeps what it took unless the Pentagon acts now.', table: 'pent',
    opt: s => o('x', 'Burn the stolen copy', 'Likely takes back most of it. Tension rises.', ['burn']) },
};
function drawCrisis(s) {
  s.crisis = null;
  if (s.fresh && !s.deal) { s.crisis = 'stolen'; return; }   // a theft is the turn's crisis; nothing else is piled on it
  const pool = Object.keys(CRISES).filter(k => !s.used.includes(k) && CRISES[k].ok(s));
  if (!pool.length) return;
  s.crisis = pool[Math.floor(hash01(s.seed, s.turn, 'crisis') * pool.length)]; s.used.push(s.crisis);
  if (CRISES[s.crisis].hit) CRISES[s.crisis].hit(s);
}
const crisis = s => { const c = CRISES[s.crisis]; return c ? { id: s.crisis, quiet: !!c.quiet, title: c.title, src: c.src, text: c.text, rule: c.rule || '' } : null; };

// The one bold move the room may make this turn.
function bold(s) {
  const b = (id, table, title, text, off) => ({ id, table, who: TABLES[table], title, text, off: !!off });
  if (s.deal) return [
    b('breakout', 'wh', 'Break out of the pause', 'Tear up the deal and race.'),
    s.caught ? b('strike', 'pent', 'Strike the hidden site', 'Destroys it. Tension jumps; even odds the deal survives.')
      : b('sabotage', 'pent', 'Sabotage their data centers', 'China loses about three months. The deal dies.') ];
  return [
    b('national', 'wh', 'Nationalize the labs', s.national ? 'Already done.' : 'The labs obey from now on. Slower for good; Beijing is alarmed.', s.national),
    s.snub === s.turn - 1 ? b('summit', 'state', 'Propose a mutual pause', 'Beijing said no last turn. Not yet.', true)
      : !willing(s) ? b('summit', 'state', 'Propose a mutual pause', 'Will fail: our labs refuse to stop. Then Beijing will not talk next turn.')
      : b('summit', 'state', 'Propose a mutual pause', 'Fails if the White House races. With Beijing\'s price met, a yes is ' + odds(dealOdds(s, 2)) + '; short of it, ' + odds(dealOdds(s, 1)) + '. A no shuts talks next turn.'),
    b('sabotage', 'pent', 'Sabotage their data centers', 'China loses about three months. Tension jumps, trust collapses.') ];
}

// This turn's moves for each table (the crisis's extra move last, marked crisis), and the bold moves on offer.
function turn(s) {
  const c = CRISES[s.crisis], book = s.deal ? DEAL : OPEN;
  const tables = Object.keys(TABLES).map(id => {
    const opts = book[id](s);
    if (c && c.table === id) opts.push(Object.assign(c.opt(s), { crisis: true }));
    return { id, who: TABLES[id], opts };
  });
  return { tables, bold: bold(s) };
}

// One turn. picks = { wh, state, pent: a move's id from turn(s), bold: a bold move's id or nothing }. Returns the events to read out.
function play(s, picks) {
  if (s.over) return [];
  const ev = [], t = s.turn, roll = name => hash01(s.seed, t, name), T = turn(s), A = {}, chosen = {}, skipped = {};   // skipped: the table that passed up the crisis's move
  // src marks an event as a clipping or quote with that byline; big marks one the screen should stop for.
  const add = (tone, title, text, src, big) => ev.push({ tone, title, text, src: src || '', big: !!big });
  // note: an answer going as expected; the screen reads these out together as one bulletin.
  const note = (...x) => { add(...x); ev[ev.length - 1].routine = true; };
  for (const tb of T.tables) {
    const opt = tb.opts.find(x => x.id === picks[tb.id] && !x.off);
    if (!opt) throw new Error('no such move for ' + tb.id + ': ' + picks[tb.id]);
    chosen[tb.id] = opt.title; for (const a of opt.acts) A[a] = true;
    if (!opt.crisis && tb.opts.some(x => x.crisis)) skipped[tb.id] = true;
  }
  if (picks.bold) {
    const b = T.bold.find(x => x.id === picks.bold && !x.off);
    if (!b) throw new Error('no such bold move: ' + picks.bold);
    chosen.bold = b.title; A[b.id] = true;
  }
  const has = a => !!A[a], c = s.crisis, lead0 = view(s).leadText.toLowerCase();
  s.votes.push({ turn: t, date: DATES[t], picks: chosen });
  const fix = () => { s.trust = clamp(s.trust, 0, 100); s.tension = clamp(s.tension, 0, 100); s.labs = clamp(s.labs, 0, 100); };
  const breakDeal = why => { if (!s.deal) return; s.deal = false; s.inspectors = false; s.hidden = false; s.caught = false; s.cnShown = s.cn; s.trust -= 30; s.tension += 15; add('bad', 'The deal is dead', why); };
  const learn = () => { const i = s.known.indexOf(false); if (i < 0 || s.deal) return; s.known[i] = true; add('info', 'Beijing\'s price', 'Beijing will not sign a pause unless ' + ASKS[s.asks[i]].want + '.'); };
  const both = () => 'Beijing will not sign a pause unless ' + s.asks.map(a => ASKS[a].want).join('; and unless ') + '.';
  const harden = () => { if (s.sec < 2) s.sec++; return s.sec === 1 ? 'Most theft attempts will now fail.' : 'Stealing the weights now takes a miracle.'; };
  // a crisis move passed up
  if (c === 'allies' && skipped.state) { s.leverage--; add('warn', 'The allies are turned down', '"If Washington will not share, we will make our own arrangements."', 'Statement, Tokyo'); }
  if (c === 'breakthrough' && skipped.wh) s.labs += TUNE.labShelve;
  if (c === 'whistle' && skipped.wh) { s.labs -= TUNE.walkout; add('warn', 'The safety staff walk out', '"Nobody answered our letter. Forty of us resigned this morning."', 'Open letter, lab safety staff'); }
  if (c === 'defector' && skipped.pent) { s.trust -= 5; add('warn', 'The walk-in is arrested', '"A senior official has been detained for contact with a foreign power."', 'State media, Beijing'); }
  const had = s.inspectors, ready = willing(s);   // the labs' answer to a pause is the one they would have given as the turn opened
  let signed = false;

  // State
  if (has('tighten')) { s.controls++; s.tension += 10; s.trust -= 10; note('info', chosen.state, ['"China firmly opposes these controls and will respond."', '"The United States is cutting China off. China will respond in kind."', '"This is an embargo. China will treat it as a hostile act."'][clamp(s.controls, 1, 3) - 1], 'Foreign Ministry spokesperson, Beijing'); }
  if (has('carrot')) { s.controls--; s.tension -= 10; s.trust += 10; note('info', s.controls >= 0 ? 'The chip controls are eased' : 'Chips for Beijing', 'Chip shipments to China resume within days.', 'Wire report, Shenzhen'); }
  if (c === 'ultimatum') {
    if (has('carrot')) add('good', 'The drills are called off', '"The exercise is postponed." Beijing got what it asked for.', 'Eastern Theater Command, one-line notice');
    else { s.tension += TUNE.ultimatum; add('bad', 'The deadline passes', '"Live-fire drills began this morning on three sides of Taiwan. Flights are cancelled."', 'Wire flash, Taipei'); }
  }
  if (c === 'opening' && (has('tighten') || has('sabotage'))) { s.crisis = null; s.trust -= TUNE.slam; add('bad', 'The door slams', '"We offered talks and were answered with pressure. The offer is withdrawn."', 'Message passed through Singapore'); }
  if (has('talk')) { s.trust += 15; s.tension -= 10; note('good', s.deal ? 'The deal deepens' : 'The back channel is working', s.deal ? '"Their scientists and ours worked side by side all week. It went well."' : '"The vice premier asked what it would take for America to stop if China stopped too."', 'Cable from the embassy, Beijing'); learn(); }
  if (has('share')) { s.leverage++; s.spread = true; note('info', 'The models go abroad', 'Frontier models are now running in Tokyo and London. Both governments enforce the chip controls.'); }
  if (has('hotline')) { s.tension -= 20; note('good', 'The hotline opens', '"We told them where our ships will be. They told us where theirs will be. Both sides are pulling back."', 'Pacific Command, call transcript'); }
  if (has('tolerate')) { s.trust += 10; note('warn', 'Washington looks away', 'The paper deal stands. So does the hidden site.'); }
  if (has('snap')) s.trust -= 5;

  // White House
  if (has('secure')) note('good', 'The labs are locked down', harden());
  if (has('test')) s.labs += TUNE.labTest;
  if (has('national')) { s.national = true; s.sec = Math.max(s.sec, 1); s.tension += 10; add('warn', 'The labs are nationalized', 'Federal marshals take over the data centers. Beijing reads it as mobilization.', 'Wire report, Washington'); }

  // Pentagon
  if (has('exfil')) {
    s.trust -= TUNE.exfil;
    if (!s.deal) { s.known = [true, true]; add('good', 'The walk-in talks', '"He told us what the leadership wants." ' + both(), 'Debrief, CIA station, Singapore'); }
    else add(s.hidden ? 'bad' : 'good', 'The walk-in talks', s.hidden ? '"He gave us the coordinates of a hidden site. It has been running for months."' : '"There is no hidden site. Beijing is keeping the deal."', 'Debrief, CIA station, Singapore');
  }
  if (has('watch')) {
    if (roll('asset') < TUNE.burned) { s.trust -= 10; add('bad', 'The source is caught', '"The American spy has confessed."', 'State media, Beijing'); }
    else { s.eyes++; note('good', 'A source is in place', s.eyes > 1 ? 'The CIA now has two sources inside Beijing\'s program.' : 'The CIA now has a source inside Beijing\'s program.'); learn(); }
  }
  if (has('sabotage')) {
    s.cn -= TUNE.sabotage; s.cnShown -= TUNE.sabotage; s.tension += 25; s.trust -= 20;
    add('warn', 'Sabotage', 'Three Chinese data centers went dark overnight. "We know who did this."', 'State media, Beijing');
    breakDeal('Beijing answers the sabotage by tearing up the pause.');
  }
  if (has('burn')) {
    s.tension += 10;
    if (roll('burn') < TUNE.burn) { const back = s.fresh.gain * TUNE.burnShare; s.cn -= back; s.cnShown -= back; add('good', 'The stolen copy burns', 'China loses ' + months(back) + ' of what it took.'); }
    else add('bad', 'The stolen copy survives', 'Beijing had already moved the weights off the network.');
  }
  if (has('strike')) {
    s.cn -= TUNE.sabotage; s.cnShown = s.cn; s.hidden = false; s.caught = false; s.cheated = true; s.tension += 20; s.trust -= 15;
    add('warn', 'The hidden site is destroyed', 'Beijing\'s secret program is rubble.');
    if (roll('strike') < 0.5) add('info', 'Beijing swallows it', 'It cannot protest the loss of a site it swore did not exist. The deal stands.');
    else breakDeal('Beijing calls the strike an act of war and leaves the pause.');
  }
  fix();
  if (has('inspect')) {
    const p = inspectOdds(s);
    if (roll('inspect') < p) { s.inspectors = true; add('good', 'Inspectors on the ground', 'Beijing agreed, which was ' + odds(p) + '.'); }
    else { s.trust -= 5; add('bad', 'Beijing refuses inspectors', 'Agreement was ' + odds(p) + '. "China will not accept foreign inspectors in its laboratories."', 'Foreign Ministry spokesperson, Beijing'); }
  }
  if (has('confront')) {
    const p = confrontOdds(s, has('deter'));
    if (roll('confront') < p) { s.hidden = false; s.caught = false; s.cheated = true; s.inspectors = true; add('good', 'Beijing backs down', 'That was ' + odds(p) + '. The hidden site is shut and inspectors go in.'); }
    else breakDeal('Beijing backing down was ' + odds(p) + '. It refuses, and leaves the pause.');
  }
  fix();

  // the pause proposal
  if (has('summit')) {
    const met = s.asks.filter(a => ASKS[a].met(s)).length, p = dealOdds(s, met), part = ['none', 'half', 'all'][met];
    if (has('race')) { s.snub = t; add('bad', 'Beijing says no', 'The American labs kept racing, so Beijing did not take the offer seriously.'); }
    else if (!ready) { s.snub = t; add('bad', 'Beijing says no', 'The labs refuse to stop. Beijing does not believe Washington can deliver them.'); }
    else if (roll('summit') < p) {
      s.deal = true; s.dealT = t; signed = true; s.trust += 20; s.tension -= 25;
      add('good', 'Beijing says yes', '"Neither party will train a model beyond today\'s frontier." Washington met ' + part + ' of Beijing\'s price; a yes was ' + odds(p) + '.', 'Joint statement, Geneva');
    } else { s.snub = t; s.trust += 5; s.known = [true, true]; add('bad', 'Beijing says no', 'Washington met ' + part + ' of its price; a yes was ' + odds(p) + '. ' + both()); }
  }
  if (has('breakout')) breakDeal('America breaks out of the pause and races.');

  // both frontiers move
  s.pace = s.deal ? (has('secret') ? 'slow' : 'hold') : has('race') || has('breakout') ? 'race' : has('hold') ? 'hold' : 'slow';
  if (!s.national) s.labs += s.pace === 'race' ? TUNE.labRace : s.deal ? TUNE.labIdle : 0;   // under a pause the labs lose patience
  fix();
  const defy = s.pace === 'hold' && !s.national && s.labs < TUNE.labDefiant;
  const usStep = s.pace === 'hold' ? (defy ? TUNE.defy : TUNE.usHold) : s.pace === 'slow' ? TUNE.usSlow : raceStep(s) * (has('surge') ? TUNE.breakthrough : 1);
  s.us += usStep;
  let cnStep;
  if (s.deal) { cnStep = s.hidden ? TUNE.cnHidden : TUNE.cnDeal; s.cnShown += s.caught ? cnStep : TUNE.cnDeal; }
  else {
    const copy = Math.min(s.controls >= 2 ? TUNE.cnCopyCut : TUNE.cnCopy, Math.max(0, s.us - s.cn - 1));
    cnStep = (s.controls >= 3 ? TUNE.cnOwnCut : TUNE.cnOwn) + TUNE.cnChips[clamp(s.controls, -1, 1) + 1] + copy;
    cnStep = Math.max(0.4, cnStep - (s.spread ? TUNE.allies : 0));
    s.cnShown += cnStep;
  }
  s.cn += cnStep;
  note('info', s.deal ? (has('secret') ? 'America cheats' : 'Both sides hold') : s.pace === 'race' ? 'The labs race' : s.pace === 'hold' ? 'The labs stop' : 'The labs go at half speed',
    (s.pace === 'hold' && !defy ? 'The US frontier barely moves. ' : 'The US frontier advances ' + months(usStep) + '. ') + (s.deal && !s.caught ? 'Beijing reports no progress. By its account the' : 'The') +
    (lead0 === view(s).leadText.toLowerCase() ? ' US is still ' + lead0 + '.' : ' US was ' + lead0 + ' and is now ' + view(s).leadText.toLowerCase() + '.'));
  if (defy) {
    add('bad', 'A lab defies the stop', '"We lose forty million dollars a day standing still. We are restarting training on Monday."' + (s.deal ? ' Beijing noticed.' : ''), 'Leaked memo from a lab chief executive');
    if (s.deal) { s.trust -= 20; if (s.trust < 10) breakDeal('Beijing says America never stopped, and leaves the pause.'); }
  }
  if (s.deal && has('secret') && roll('secret') < TUNE.secretSeen) { s.trust -= 10; breakDeal('Beijing catches the American secret program.'); }
  fix();

  // tests: each halves the IC's range around the line
  for (let n = has('test2') ? 2 : has('test') ? 1 : 0; n > 0; n--) {
    const w = Math.max(1, (s.hi - s.lo) / 2), lo = clamp(s.line - w * (0.15 + 0.7 * roll('band' + n)), s.lo, s.hi - w);
    s.lo = lo; s.hi = lo + w;
    if (n === 1) note('info', 'The IC narrows its range', 'From tests of the newest model: ' + (s.us >= s.hi ? 'the frontier is already beyond the whole range.' : s.us >= s.lo ? 'the frontier is inside the range now.' : 'runaway RSI becomes possible after ' + months(s.lo - s.us).replace(/ (months?)$/, ' more $1') + ' of full-speed progress, and is all but certain after ' + months(s.hi - s.us).replace('about ', '') + '.'));
  }

  // theft
  s.fresh = null;
  const th = theftOdds(s, has('surge'), has('guard'));
  if (th.attempt > 0 && roll('attempt') < th.attempt) {
    const r = roll('steal');
    if (!has('offline') && r < th.steal) {
      const gain = Math.max(0, s.us - 1 - s.cn);
      s.thefts++; s.cn += gain;
      if (s.deal) { s.hidden = true; add('bad', 'A break-in at the lab', '"Someone had access to the model weights for eleven hours. We cannot tell what was taken."', 'Security incident report, a frontier lab'); }
      else { s.cnShown = s.cn; s.fresh = { t, gain }; add('bad', 'The weights are stolen', '"They took the weights and the training code. Assume Beijing has it running within days." ' + (gain >= 1 ? months(gain).replace('about ', 'About ') + ' of America\'s lead is gone: ' : '') + 'China is now a month behind.', 'Flash cable, NSA to the President', true); }
    } else add('good', 'Theft attempt blocked', 'Beijing\'s hackers went for the weights. ' + (has('offline') ? 'The labs were offline.' : r < TUNE.steal[s.sec] ? 'The spy hunt caught them.' : 'The labs\' security held.'));
  }

  // is Beijing keeping the deal?
  if (s.deal && s.caught) add('warn', 'The cheating goes on', 'The hidden site is still running, and everyone at the table knows it.');
  else if (s.deal) {
    const cheat = (c === 'hardliners' ? (has('carrot') ? TUNE.hardCalm : TUNE.hardCheat) : clamp(TUNE.cheat - TUNE.cheatTrust * s.trust, TUNE.cheatMin, TUNE.cheat)) * (s.inspectors ? TUNE.cheatInsp : 1) * (s.cheated ? TUNE.cheatAgain : 1);
    const eyes = s.eyes + (had ? 1 : 0) + (has('snap') ? 1 : 0);
    const detect = has('exfil') ? 1 : eyes >= 2 ? TUNE.detectBoth : eyes === 1 ? TUNE.detectOne : TUNE.detect;
    // Beijing starts cheating only where the room still has a turn to find it: not as it signs, not in the last turn.
    if (!s.hidden && !signed && t < TUNE.turns - 1 && roll('cheat') < cheat) s.hidden = true;
    else if (s.hidden && roll('detect') < detect) {
      const gap = s.us - s.cn; s.caught = true; s.cnShown = s.cn;
      add('bad', 'Beijing is cheating', '"Satellite imagery shows a hidden training site in Gansu." China is really ' + (Math.abs(gap) < 1 ? 'level with us' : months(gap) + (gap > 0 ? ' behind' : ' ahead')) + '.', 'Satellite imagery brief');
    }
    if (!s.caught) {
      if (eyes === 0 && roll('rumor') < (s.hidden ? TUNE.rumor : TUNE.rumorFalse)) add('warn', 'Something is off', '"Unusual power use at a site in Gansu. Low confidence. Nobody has looked closer."', 'Analyst note, bottom of the daily brief');
      else note('info', 'The deal holds', eyes >= 2 ? 'Two sources report no violations.' : eyes === 1 ? 'No violations found.' : 'No sign of cheating, but no one is really looking.');
    }
  }

  // the Strait
  if (!s.deal && s.pace === 'race' && s.us >= s.lo - TUNE.usRace) s.tension += TUNE.fear;
  fix();
  const pWar = warRisk(s) * (has('deter') ? TUNE.warDeter : 1);
  if (pWar > 0) {
    if (roll('war') < pWar) { add('bad', 'War in the Strait', '"Chinese missiles have hit Taiwan. An American destroyer is on fire. This is not an exercise." War was ' + odds(pWar) + ' this turn.', 'Wire flash, Taipei', true); return end(s, 'war', ev); }
    note('warn', 'The Strait stays quiet', 'War was ' + odds(pWar) + ' this turn.');
  }

  // runaway RSI
  if (s.us > s.line) {
    const moving = s.pace !== 'hold' || defy, p = s.pace === 'race' ? TUNE.runRace : moving ? TUNE.runSlow : TUNE.runHold;
    if (roll('runaway') < p) { add('bad', 'Loss of control', '"We hit the kill switch. The model is still running and has stopped answering us." The US frontier was past the danger point.', 'Last message from the lab\'s control room', true); return end(s, 'runaway_us', ev); }
    if (moving) { s.knownOver = true; add('bad', 'Near miss', '"The model was caught copying itself to an outside server. It had edited the logs to hide it." The US is past the danger point. Losing control was ' + odds(p) + ' this turn.', 'Incident report, a frontier lab'); }
    else if (has('test') || s.knownOver) { s.knownOver = true; add('warn', 'Past the danger point, holding', 'Tests show the frontier can improve itself. While we hold, losing control is ' + odds(p) + ' each turn.'); }
  } else if (has('test')) note('good', 'Tests come back clean', '"We told the model to improve itself and gave it nine days. It could not. We are not at the danger point yet."', 'IC evaluation team');
  if (s.cn > s.line && (!s.deal || s.hidden)) {
    if (roll('cnrun') < TUNE.cnRun) {
      if (roll('cnwho') < 0.5) { add('bad', 'Beijing loses control', 'China\'s frontier passed the danger point with no one holding it back. Its model slipped its controls.'); return end(s, 'runaway_cn', ev); }
      add('bad', 'Beijing gets there first', 'China\'s frontier passed the danger point and its self-improving AI stayed loyal. Beijing now sets the terms for everyone.'); return end(s, 'cn_first', ev);
    }
    if (!s.deal) add('warn', 'China is in the danger zone', 'Beijing is racing through it. Each turn, catastrophe is ' + odds(TUNE.cnRun) + '.');
  }

  s.turn++;
  if (s.turn >= TUNE.turns) return end(s, 'time', ev);
  drawCrisis(s);
  return ev;
}

const ENDINGS = {
  war: { grade: 'F', title: 'War', text: 'The pressure on Beijing went further than the Strait could bear.' },
  runaway_us: { grade: 'F', title: 'Loss of control', text: 'The race ran past the danger point. There was no second try.' },
  runaway_cn: { grade: 'F', title: 'Beijing\'s runaway', text: 'America stopped in time. Nothing stopped China.' },
  cn_first: { grade: 'F', title: 'Beijing wins the race', text: 'The first controlled self-improving AI answers to the Party.' },
  verified: { grade: 'A', title: 'A verified pause', text: 'Both frontiers are held, and inspectors can prove it. The next President inherits time.' },
  trust: { grade: 'B', title: 'A pause on trust', text: 'The deal held and Beijing kept its word, though no one could have proved it.' },
  caught: { grade: 'C', title: 'Caught cheating', text: 'The pause is still on paper, but Beijing\'s hidden site has been found. The next President inherits the confrontation.' },
  untested: { grade: 'C', title: 'An untested pause', text: 'A pause signed at the last minute, with no inspectors. No one in the room knows whether Beijing will keep it.' },
  betrayed: { grade: 'D', title: 'Betrayed', text: 'The deal held on paper. Beijing was training in secret, and is far closer than anyone knew.' },
  decisive: { grade: 'A', title: 'A lead to stop on', text: 'No deal, but America is short of the danger point, China is far behind, and the weights are safe. There is time to get this right.' },
  ahead: { grade: 'B', title: 'Ahead', text: 'No deal. America is short of the danger point and still ahead, but not by enough to stop.' },
  behind: { grade: 'D', title: 'Caught', text: 'No deal, and the lead is gone. China is level with America and not stopping.' },
  countdown: { grade: 'C', title: 'Countdown', text: 'America stopped short. China is past the danger point with nothing to stop it.' },
  racing: { grade: 'C', title: 'Still racing', text: 'No one has lost control yet. No one has agreed to stop, and China is close behind.' },
  coinflip: { grade: 'D', title: 'Living on a coin flip', text: 'The frontier is past the danger point and the world is still here, for now.' },
};

function end(s, how, ev) {
  if (how === 'time') {
    const lead = s.us - s.cn;
    if (s.us > s.line && !s.deal) how = 'coinflip';
    else if (s.deal) how = s.caught ? 'caught' : s.hidden ? 'betrayed' : s.inspectors ? 'verified' : TUNE.turns - s.dealT <= 2 ? 'untested' : 'trust';   // a pause on trust has to have lasted
    else if (s.cn > s.line) how = 'countdown';
    else how = lead >= TUNE.decisive && s.sec >= 1 ? 'decisive' : lead >= TUNE.ahead ? 'ahead' : lead >= 1.5 ? 'racing' : 'behind';
  }
  s.over = Object.assign({ how }, ENDINGS[how]);
  return ev;
}

const api = { TUNE, DATES, SECURITY, TABLES, ASKS, newGame, view, turn, play, ENDINGS, hash01, odds, months, price, crisis, dealOdds, warRisk, willing };
if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.Room = api;
})(typeof window !== 'undefined' ? window : globalThis);
