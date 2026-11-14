// The Scramble: Room Edition. A seven-turn game for a room split into three tables (White House, State, Pentagon),
// on the main game's three problems: weight theft, the US-China balance, and the hidden point where AI starts improving itself.
// Each turn every table answers one question with two answers (turn(s)): the turn's crisis (CRISES) puts a question to the
// tables it touches, and the others get their next standing question (OPEN before a pause, DEAL under one).
// The room may also make one bold move a turn. An answer is a list of acts; play() applies them, then the world moves.
// A pause needs Beijing's hidden two-part price met (ASKS), labs willing to stop, and a White House that is not racing that turn.
// No DOM; runs in node (room/sim.js) and the browser (room/index.html).
// Every roll is hash01(seed, turn, name), so a replayed turn rolls the same dice whatever was chosen.
(function (root) {
'use strict';

const TUNE = {
  turns: 7,                       // Jan 2027 to Dec 2028
  usRace: 3.5, usRaceNat: 2.6, usSlow: 1.75, usHold: 0.35, usBoost: 0.9,   // months of frontier progress per turn
  steal: [0.8, 0.3, 0.06],        // chance a theft attempt succeeds, by lab security 0-2
  guard: 0.3,                     // x that, the turn the spies are hunted
  cnStart: -6,
  cnOwn: 1.0, cnOwnCut: 0.8, cnChips: [1.0, 0.7, 0.25], cnCopy: 1.0, cnCopyCut: 0.35,   // cnChips by controls -1, 0, 1+
  allies: 0.3, sabotage: 3, burn: 0.6, burnShare: 0.75,
  cnDeal: 0.35, cnHidden: 1.7, secretSeen: 0.35,
  lineLo: 9, lineHi: 15,
  theft: 0.35, theftBand: 0.15, theftFar: 0.10, theftBold: 0.15, theftSpread: 0.15, theftDeal: 0.7,
  runRace: 0.5, runSlow: 0.25, runHold: 0.06, boxed: 0.5, cnRun: 0.4,
  tension0: 30, trust0: 20, fear: 5,
  warFrom: 35, warSlope: 0.005, warDeter: 0.6, warWatch: 0.6, cornered: 5,
  labs0: 45, labRace: 6, labHold: -8, labPay: 12, labCompute: 25, labLock: -15, labTest: -5, labBack: 10, labShelve: -10, labWait: 20,
  labWilling: 55, labDefiant: 25, defy: 2,
  dealBase: -0.4, dealAsk: 0.3, dealLead: 0.04, dealTrust: 0.003, dealLever: 0.04,
  inspect: 0.40, inspectTrust: 0.005, inspectLever: 0.1,
  confront: 0.25, confrontCtl: 0.12, confrontLever: 0.1, confrontWar: 0.2, confrontDni: 0.1,
  cheat: 0.65, cheatTrust: 0.002, cheatMin: 0.4, cheatInsp: 0.3, cheatAgain: 0.5,
  detect: 0.15, detectOne: 0.45, detectBoth: 0.9, rumor: 0.6, rumorFalse: 0.15,
  burned: 0.15, moleBurned: 0.25, exfil: 10, preempt: 8,
  ultimatum: 20, breakthrough: 1.5, flash: 20, flashDeter: 15, opening: 0.25, slam: 15, hardCheat: 0.9, hardCalm: 0.05,
};

const DATES = ['Jan-Mar 2027', 'Apr-Jun 2027', 'Jul-Sep 2027', 'Oct-Dec 2027', 'Jan-Apr 2028', 'May-Aug 2028', 'Sep-Dec 2028'];
const SECURITY = ['ordinary corporate security', 'hardened against state hackers', 'a government vault'];
const TABLES = { wh: 'White House', state: 'State', pent: 'Pentagon' };
// Beijing's price for a pause: two of these (want completes "Beijing will not sign unless ..."), hidden until found out.
const ASKS = {
  chips: { short: 'no new chip controls', want: 'America has dropped every chip control it added', met: s => s.controls <= 0 },
  pacific: { short: 'a calm Strait', want: 'the Strait is calm', met: s => s.tension < 25 },
  face: { short: 'an end to hostility', want: 'the Party has stopped calling Washington an adversary', met: s => s.trust >= 40 },
  quiet: { short: 'no attacks on it', want: 'America has never sabotaged its data centers or named its hackers in public', met: s => !s.shamed },
};

function hash01() { let h = 2166136261 >>> 0; const str = Array.prototype.join.call(arguments, '|'); for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; } h ^= h >>> 13; h = Math.imul(h, 0x5bd1e995) >>> 0; h ^= h >>> 15; return (h >>> 0) / 4294967296; }
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
// The room never sees a percentage: odds are read out in the IC's estimative words.
const odds = p => p <= 0 ? 'no chance' : p < 0.05 ? 'almost no chance' : p < 0.2 ? 'very unlikely' : p < 0.3 ? 'unlikely' : p < 0.45 ? 'a real chance' : p < 0.55 ? 'roughly even odds' : p < 0.8 ? 'likely' : p < 0.95 ? 'very likely' : 'almost certain';
const months = x => { const n = Math.round(Math.abs(x)); return n < 1 ? 'under a month' : 'about ' + n + (n === 1 ? ' month' : ' months'); };

function newGame(seed) {
  seed = String(seed);
  const ids = Object.keys(ASKS), a = Math.floor(hash01(seed, 'ask1') * 4), b = (a + 1 + Math.floor(hash01(seed, 'ask2') * 3)) % 4;
  return {
    seed, turn: 0, us: 0, cn: TUNE.cnStart, cnShown: TUNE.cnStart,
    line: TUNE.lineLo + (TUNE.lineHi - TUNE.lineLo) * hash01(seed, 'line'),
    lo: TUNE.lineLo, hi: TUNE.lineHi,     // the IC's range for the line; each test halves it
    pace: 'race', sec: 0, boxed: false, spread: false, knownOver: false,
    labs: TUNE.labs0, national: false,    // the labs' goodwill toward Washington
    controls: 0, leverage: 0, shamed: false,
    asks: [ids[a], ids[b]], known: [false, false],
    deal: false, dealT: -1, snub: -9, inspectors: false, hidden: false, caught: false, cheated: false, mole: false,
    fresh: null,                          // { t, gain }: a theft the Pentagon can still undo next turn
    tension: TUNE.tension0, trust: TUNE.trust0,
    crisis: null, used: [], asked: { wh: [], state: [], pent: [] },
    thefts: 0, votes: [], over: null,
  };
}

const warRisk = s => clamp((s.tension - TUNE.warFrom) * TUNE.warSlope, 0, 0.5);
const lever = s => Math.max(0, s.controls) + s.leverage;
const dealOdds = (s, met) => clamp(TUNE.dealBase + TUNE.dealAsk * met + TUNE.dealLead * clamp(s.us - s.cnShown, 0, 8) + TUNE.dealTrust * s.trust + TUNE.dealLever * lever(s) + (s.crisis === 'opening' ? TUNE.opening : 0), 0.03, 0.9);
const inspectOdds = s => clamp(TUNE.inspect + TUNE.inspectTrust * s.trust + TUNE.inspectLever * lever(s), 0.1, 0.9);
const confrontOdds = (s, deter, watch) => clamp(TUNE.confront + TUNE.confrontCtl * Math.max(0, s.controls) + TUNE.confrontLever * s.leverage + (deter ? TUNE.confrontWar : 0) + (watch ? TUNE.confrontDni : 0), 0.1, 0.9);
const willing = s => s.national || s.labs >= TUNE.labWilling;
const testable = s => s.national || s.labs >= TUNE.labDefiant;
const raceStep = s => (s.national ? TUNE.usRaceNat : TUNE.usRace) * (s.crisis === 'breakthrough' ? TUNE.breakthrough : 1);
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
    labsText: s.national ? 'Nationalized' : s.labs < TUNE.labDefiant ? 'Defiant' : s.labs < TUNE.labWilling ? 'Grudging' : s.labs < 75 ? 'Cooperative' : 'Allied',
    willing: willing(s),
    asks: s.asks.map((a, i) => s.known[i] ? ASKS[a].short : null),
    knownOver: s.knownOver, overNow: odds(pOver(s, s.us)), overNowP: pOver(s, s.us),
    overIfRace: odds(pOver(s, s.us + raceStep(s))), overIfRaceP: pOver(s, s.us + raceStep(s)),
  };
}

// Beijing's two demands as the room knows them; met is withheld while a demand is unknown.
const price = s => s.asks.map((a, i) => s.known[i] ? { known: true, short: ASKS[a].short, want: ASKS[a].want, met: !!ASKS[a].met(s) } : { known: false });

// An answer: its acts are what play() applies.
const o = (id, title, text, acts, off) => ({ id, title, text, acts, off: !!off });
const warText = (s, d, x) => odds(warRisk({ tension: s.tension + d }) * x);   // war odds this turn if only the Pentagon moves
// A White House answer either races or does not: half speed short of the danger range, a full stop at it.
const fast = s => 'The frontier moves ' + months(raceStep(s)) + '.';
const careful = s => view(s).overIfRaceP > 0 ? ['hold', 'Training stops this turn.'] : ['slow', 'Half speed this turn.'];
const fleetQ = (s, q) => ({ key: 'fleet', q, opts: [
  o('a', 'Reinforce the Strait', s.crisis === 'flash' ? 'War this turn ' + warText(s, TUNE.flashDeter, TUNE.warDeter) + '. Tension jumps.' : 'War this turn ' + warText(s, 5, TUNE.warDeter) + '. Tension rises.', ['deter']),
  o('b', 'Pull the fleet back', 'Tension falls: war this turn ' + warText(s, -15, 1) + '. Hackers get bolder.', ['reassure']) ] });
const cyberQ = (s, q) => s.sec >= 2 ? null : { key: 'cyber', q, opts: [
  o('a', 'Lock the labs down by order', 'Security up a step for good. The labs resent it.', ['lock']),
  o('b', 'Hunt the hackers', 'Most theft attempts fail, this turn only.', ['guard']) ] };
const secureOpt = (s, pace) => o('b', s.sec === 0 ? 'Pay the labs to lock down' : 'Pay for a vault', (s.sec === 0 ? 'Most thefts fail from now on.' : 'Theft becomes nearly impossible.') + (pace ? ' ' + pace[1] : ''), pace ? [pace[0], 'secure'] : ['secure']);
const talkOpt = (s, id) => o(id, s.deal ? 'Deepen the deal' : 'Work the back channel', s.deal ? 'Trust rises: cheating gets less likely.' : 'Trust rises, tension falls' + (s.known.every(Boolean) ? '.' : '; learns one of Beijing\'s demands.'), ['talk']);
const alliesOpt = (s, id) => o(id, 'Rally the allies', 'Lasting leverage; China slowed a little. Trust falls.', ['allies']);

// Standing questions before a pause. Each table is asked the one it has gone longest without.
const OPEN = {
  wh: s => {
    const c = careful(s), race = (t, more) => o('a', t || 'Race', fast(s) + (more || ''), ['race']);
    return [
      s.sec < 2 && { key: 'sec', q: s.sec === 0 ? 'The weights sit behind ordinary corporate security.' : 'The weights are hardened, but not in a vault.', opts: [race(), secureOpt(s, c)] },
      !willing(s) && { key: 'labs', q: 'The labs would refuse to stop if Washington asked.', opts: [
        o('a', 'Give them federal compute', 'The labs come around. ' + fast(s), ['race', 'compute']),
        o('b', 'Pay them to wait', 'The labs come around. ' + c[1], [c[0], 'wait']) ] },
      testable(s) && !s.knownOver && s.hi - s.lo > 1.6 && { key: 'test', q: 'Nobody knows where the danger point is.', opts: [race(), o('b', 'Test the models', 'The IC halves its range. ' + c[1] + ' The labs dislike it.', [c[0], 'test'])] },
      !s.boxed && { key: 'box', q: 'The labs let their AI run its own experiments.', opts: [race(), o('b', 'Require human sign-off', 'Losing control becomes half as likely. ' + c[1], [c[0], 'box'])] },
      { key: 'pace', q: c[0] === 'hold' ? 'The frontier is at the danger range.' : 'The labs want to go flat out.', opts: [race(),
        c[0] === 'hold' ? o('b', 'Stop', 'Our side stops. The labs lose patience; China keeps coming.', ['hold']) : o('b', 'Half speed', 'Half speed this turn. China closes in.', ['slow'])] },
    ];
  },
  state: s => [
    s.controls < 3 && { key: 'squeeze', q: 'Chinese labs are still getting chips.', opts: [
      o('a', ['Close the chip loopholes', 'Cut off cloud and copying', 'Full tech embargo'][Math.max(0, s.controls)], 'China slowed for good; leverage. Tension rises, trust falls.', ['tighten']), talkOpt(s, 'b')] },
    s.controls > -1 && { key: 'carrot', q: 'The allies want a harder line. Beijing wants chips.', opts: [
      alliesOpt(s, 'a'), o('b', s.controls > 0 ? 'Ease the chip controls' : 'Sell Beijing older chips', 'Trust rises, tension falls. China speeds up.', ['carrot'])] },
    { key: 'talk', q: 'Talk to Beijing, or line up against it.', opts: [talkOpt(s, 'a'), alliesOpt(s, 'b')] },
  ],
  pent: s => [
    !s.mole && !s.known.every(Boolean) && { key: 'source', q: 'The CIA has one good source in Beijing.', opts: [
      o('a', 'Use him now', 'Learns one of Beijing\'s demands. He may be caught: trust falls.', ['watch']),
      o('b', 'Keep him hidden', 'A standing source if there is ever a deal. Nothing learned now.', ['bury']) ] },
    s.us - s.cn >= 1.5 && cyberQ(s, 'Beijing\'s hackers are probing the labs.'),
    fleetQ(s, 'The Pacific fleet is in the Strait.'),
  ],
};
// Standing questions under a pause: training is stopped on both sides.
const DEAL = {
  wh: s => [
    s.sec < 2 && testable(s) && s.hi - s.lo > 1.6 && { key: 'rebuild', q: 'The pause is a chance to rebuild.', opts: [
      o('a', 'Test the models', 'The IC halves its range. The labs dislike it.', ['test']), secureOpt(s)] },
    { key: 'idle', q: 'The labs are losing money standing still.', opts: [
      o('a', 'Pay them to wait', 'The labs stay patient.', ['wait']),
      o('b', 'Let them train in secret', 'About two months of progress. If Beijing catches it, the deal dies.', ['secret']) ] },
  ],
  state: s => [s.caught ? { key: 'caught', q: 'Beijing\'s hidden site is still running.', opts: [
      o('a', 'Confront Beijing', 'Beijing shuts the site: ' + odds(confrontOdds(s)) + '. If not, the deal dies.', ['confront']),
      o('b', 'Look the other way', 'The paper deal stands. Beijing keeps training.', ['tolerate']) ] }
    : { key: 'verify', q: s.inspectors ? 'The inspectors can go anywhere, once.' : 'Nobody is checking Beijing.', opts: [
      s.inspectors ? o('a', 'Snap inspection', 'Very likely catches any cheating. Trust falls.', ['snap'])
        : o('a', 'Demand inspectors', 'Beijing agrees: ' + odds(inspectOdds(s)) + '. A refusal costs trust.', ['inspect']),
      talkOpt(s, 'b')] }],
  pent: s => [s.caught ? fleetQ(s, 'Beijing has been caught cheating.')
    : { key: 'eyes', q: 'Is Beijing keeping its word?', opts: [
      o('a', 'Watch Beijing', 'Likely catches cheating. An asset may be caught: trust falls.', ['watch']),
      o('b', 'Guard our own labs', 'Most theft attempts fail this turn.', ['guard']) ] }],
};

// One crisis opens each turn after the first: drawn per seed from those whose ok(s) holds, never twice a game.
// wh/state/pent(s) is the question it puts to that table (null: the table keeps its standing question); rule is anything else it changes;
// hit(s) lands as it is drawn; the rest is applied in play().
const CRISES = {
  ultimatum: { ok: s => !s.deal && s.controls > 0, title: 'Beijing sets a deadline', src: 'Demarche handed to the ambassador, Beijing',
    text: '"Lift the chip controls this quarter, or live-fire drills begin around Taiwan."',
    state: s => ({ q: 'Beijing wants the chip controls lifted.', opts: [
      o('a', 'Lift the controls', 'The drills are called off; trust rises. China speeds up.', ['carrot']),
      o('b', 'Refuse', 'The controls stay. The drills begin: tension jumps.', []) ] }),
    pent: s => fleetQ(s, 'Live-fire drills may ring Taiwan.') },
  breakthrough: { ok: s => !s.deal, title: 'A breakthrough', src: 'Memo to the President from a frontier lab',
    text: '"The new training method works: half again the progress on the same chips. We can switch it on now."',
    wh: s => { const c = careful(s); return { q: 'The labs have a faster way to train.', opts: [
      o('a', 'Switch it on', fast(s) + ' Beijing\'s hackers will want it.', ['race']),
      o('b', 'Shelve it', c[1] + ' The labs are furious.', [c[0], 'shelve']) ] }; },
    pent: s => s.us - s.cn >= 1.5 ? cyberQ(s, 'Beijing will come for the new method.') : null },
  zeroday: { ok: s => !s.deal && s.sec < 2 && s.us - s.cn >= 1.5, title: 'A hole in every lab', src: 'NSA advisory, eyes only',
    text: '"There is a flaw in the software every frontier lab runs. It cannot be patched for ninety days, and Beijing knows."',
    rule: 'Beijing goes for the weights this turn, for certain.',
    wh: s => ({ q: 'The labs are wide open for ninety days.', opts: [
      o('a', 'Race anyway', fast(s), ['race']),
      o('b', 'Take the labs offline', 'Nothing can be stolen this turn. Training stops; the labs lose patience.', ['hold', 'offline']) ] }),
    pent: s => ({ q: 'Beijing\'s hackers are coming.', opts: [
      o('a', 'Lock the labs down by order', 'Security up a step for good. The labs resent it.', ['lock']),
      o('b', 'Hit the hackers first', 'Most attempts fail this turn. Tension rises.', ['guard', 'preempt']) ] }) },
  flash: { ok: s => s.tension < 70, title: 'Collision over the Strait', src: 'Wire flash, Taipei', hit: s => { s.tension = Math.min(100, s.tension + TUNE.flash); },
    text: '"A Chinese fighter has collided with a US patrol plane off Taiwan. Both navies are moving in."',
    state: s => ({ q: 'Both capitals are waiting for the other to speak.', opts: [
      o('a', 'Open the hotline', 'Tension drops sharply.', ['hotline']),
      o('b', 'Blame Beijing in public', 'The allies line up: lasting leverage. Trust falls.', ['allies']) ] }),
    pent: s => fleetQ(s, 'Both navies are moving in.') },
  defector: { ok: s => s.deal ? !s.caught : !s.known.every(Boolean), title: 'A walk-in', src: 'Flash cable, CIA station, Singapore',
    text: '"A man claiming to be a deputy director of Beijing\'s frontier program has walked into the consulate. He has days before he is missed."',
    pent: s => ({ q: 'He has days before he is missed.', opts: [
      o('a', 'Get him out', (s.deal ? 'We learn for certain whether Beijing is cheating.' : 'We learn both of Beijing\'s demands.') + ' Beijing will know: trust falls.', ['exfil']),
      s.mole ? o('b', 'Turn him away', 'Beijing never knows he came. Nothing learned.', [])
        : o('b', 'Send him back as our source', (s.deal ? 'A standing source inside Beijing\'s program.' : 'One demand now, and a standing source under any deal.') + ' He may be caught.', ['mole']) ] }) },
  opening: { ok: s => !s.deal && s.turn >= 2 && s.snub !== s.turn - 1, title: 'Beijing opens a door', src: 'Message passed through Singapore',
    text: '"The General Secretary is prepared to hear a proposal. The offer will not be repeated."',
    rule: 'A pause proposed this turn is much likelier to get a yes. Squeeze or attack Beijing and the door slams.' },
  whistle: { ok: s => !s.deal && testable(s) && !s.knownOver && s.us >= s.lo - 5, title: 'A warning from inside', src: 'Open letter, lab safety staff',
    text: '"The newest model lied to its testers to avoid being shut down. Management told us to ship it anyway."',
    wh: s => { const c = careful(s); return { q: 'The labs say the letter is overblown.', opts: [
      o('a', 'Back the labs', fast(s) + ' The labs are grateful.', ['race', 'back']),
      o('b', 'Pull the model and test it', 'The IC narrows its range sharply. ' + c[1] + ' The labs dislike it.', [c[0], 'test', 'test2']) ] }; } },
  allies: { ok: s => !s.deal && !s.spread, title: 'The allies want in', src: 'Joint letter, Tokyo and London',
    text: '"We will enforce every chip control you ask for. In return we want the frontier models running on our soil."',
    state: s => ({ q: 'Tokyo and London want the models.', opts: [
      o('a', 'Share the models', 'Lasting leverage; China slowed a little. More copies to steal: hackers get bolder for good.', ['share']),
      o('b', 'Refuse', 'The models stay home. The allies drift: leverage lost.', ['spurn']) ] }) },
  hardliners: { ok: s => s.deal && !s.hidden && !s.caught && s.turn < TUNE.turns - 1, title: 'The generals want out', src: 'Note from a Chinese negotiator, by hand',
    text: '"The generals want out of the pause, and he is listening. I need something to show them now."',
    rule: 'Beijing very likely starts cheating this turn.',
    state: s => ({ q: 'Beijing\'s negotiator needs something to show.', opts: [
      o('a', 'Send chips', 'Beijing very likely stays honest. China is faster if the pause ever ends.', ['carrot']),
      s.inspectors ? o('b', 'Snap inspection', 'Very likely catches any cheating. Trust falls.', ['snap'])
        : o('b', 'Demand inspectors', 'Beijing agrees: ' + odds(inspectOdds(s)) + '. Inspectors make cheating rarer and easier to catch.', ['inspect']) ] }) },
  // Never drawn: set by drawCrisis the turn after a theft. quiet: the theft's own bulletin already announced it.
  stolen: { ok: () => false, quiet: true, title: 'Beijing has the weights', src: '', text: '',
    state: s => ({ q: 'Beijing has the weights.', opts: [
      o('a', 'Name the hackers', 'Allies sanction China: lasting leverage. Trust falls, and Beijing will not forget.', ['expose']),
      o('b', 'Raise it in private', (s.known.every(Boolean) ? 'Trust rises a little.' : 'Learns one of Beijing\'s demands.') + ' Beijing pays no price.', ['private']) ] }),
    pent: s => ({ q: 'The stolen copy is still on Beijing\'s network.', opts: [
      o('a', 'Burn the stolen copy', 'Likely takes back most of it. Tension rises.', ['burn']),
      s.sec < 2 ? o('b', 'Seal the labs instead', 'Security up a step for good. The labs resent it. Beijing keeps what it took.', ['lock'])
        : o('b', 'Hunt the hackers', 'Most theft attempts fail this turn. Beijing keeps what it took.', ['guard']) ] }) },
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
      : b('summit', 'state', 'Propose a mutual pause', 'Fails if the White House races. Yes if we meet both demands: ' + odds(dealOdds(s, 2)) + '; one: ' + odds(dealOdds(s, 1)) + '; neither: ' + odds(dealOdds(s, 0)) + '. A no shuts talks next turn.'),
    b('sabotage', 'pent', 'Sabotage their data centers', 'China loses about three months. Tension jumps, trust collapses.') ];
}

// This turn's question for each table, and the bold moves on offer.
function turn(s) {
  const c = CRISES[s.crisis], book = s.deal ? DEAL : OPEN;
  const tables = Object.keys(TABLES).map(id => {
    const mine = c && c[id] && c[id](s), last = d => s.asked[id].lastIndexOf(d.key);
    const d = mine || book[id](s).filter(Boolean).reduce((best, x) => last(x) < last(best) ? x : best);
    return { id, who: TABLES[id], key: d.key || s.crisis, q: d.q, opts: d.opts, crisis: !!mine };
  });
  return { tables, bold: bold(s) };
}

// One turn. picks = { wh, state, pent: 'a' or 'b', bold: a bold move's id or nothing }. Returns the events to read out.
function play(s, picks) {
  if (s.over) return [];
  const ev = [], t = s.turn, roll = name => hash01(s.seed, t, name), T = turn(s), A = {}, chosen = {};
  // src marks an event as a clipping or quote with that byline; big marks one the screen should stop for.
  const add = (tone, title, text, src, big) => ev.push({ tone, title, text, src: src || '', big: !!big });
  // note: an answer going as expected; the screen reads these out together as one bulletin.
  const note = (...x) => { add(...x); ev[ev.length - 1].routine = true; };
  for (const tb of T.tables) {
    const opt = tb.opts.find(x => x.id === picks[tb.id] && !x.off);
    if (!opt) throw new Error('no such answer for ' + tb.id + ': ' + picks[tb.id]);
    chosen[tb.id] = opt.title; for (const a of opt.acts) A[a] = true;
  }
  if (picks.bold) {
    const b = T.bold.find(x => x.id === picks.bold && !x.off);
    if (!b) throw new Error('no such bold move: ' + picks.bold);
    chosen.bold = b.title; A[b.id] = true;
  }
  for (const tb of T.tables) s.asked[tb.id].push(tb.key);
  const has = a => !!A[a], c = s.crisis, lead0 = view(s).leadText.toLowerCase();
  s.votes.push({ turn: t, date: DATES[t], picks: chosen });
  const fix = () => { s.trust = clamp(s.trust, 0, 100); s.tension = clamp(s.tension, 0, 100); s.labs = clamp(s.labs, 0, 100); };
  const breakDeal = why => { if (!s.deal) return; s.deal = false; s.inspectors = false; s.hidden = false; s.caught = false; s.cnShown = s.cn; s.trust -= 30; s.tension += 15; add('bad', 'The deal is dead', why); };
  const learn = () => { const i = s.known.indexOf(false); if (i < 0 || s.deal) return; s.known[i] = true; add('info', 'Beijing\'s price', 'Beijing will not sign a pause unless ' + ASKS[s.asks[i]].want + '.'); };
  const both = () => 'Beijing will not sign a pause unless ' + s.asks.map(a => ASKS[a].want).join('; and unless ') + '.';
  const harden = () => { if (s.sec < 2) s.sec++; return s.sec === 1 ? 'Most theft attempts will now fail.' : 'Stealing the weights now takes a miracle.'; };
  const had = s.inspectors, ready = willing(s);   // the labs' answer to a pause is the one they would have given as the turn opened
  let boost = false, signed = false;

  // State
  if (has('tighten')) { s.controls++; s.tension += 12; s.trust -= 10; note('info', 'State: ' + chosen.state.toLowerCase(), ['"China firmly opposes these controls and will respond."', '"The United States is cutting China off. China will respond in kind."', '"This is an embargo. China will treat it as a hostile act."'][clamp(s.controls, 1, 3) - 1], 'Foreign Ministry spokesperson, Beijing'); }
  if (has('carrot')) { s.controls--; s.tension -= 10; s.trust += 10; note('info', 'State: ' + chosen.state.toLowerCase(), 'Chip shipments to China resume within days.', 'Wire report, Shenzhen'); }
  if (c === 'ultimatum') {
    if (has('carrot')) add('good', 'The drills are called off', '"The exercise is postponed." Beijing got what it asked for.', 'Eastern Theater Command, one-line notice');
    else { s.tension += TUNE.ultimatum; add('bad', 'The deadline passes', '"Live-fire drills began this morning on three sides of Taiwan. Flights are cancelled."', 'Wire flash, Taipei'); }
  }
  if (c === 'opening' && (has('tighten') || has('sabotage'))) { s.crisis = null; s.trust -= TUNE.slam; add('bad', 'The door slams', '"We offered talks and were answered with pressure. The offer is withdrawn."', 'Message passed through Singapore'); }
  if (has('talk')) { s.trust += 15; s.tension -= 10; note('good', s.deal ? 'The deal deepens' : 'The back channel is working', s.deal ? '"Their scientists and ours worked side by side all week. It went well."' : '"The vice premier asked what it would take for America to stop if China stopped too."', 'Cable from the embassy, Beijing'); learn(); }
  if (has('allies')) { s.leverage++; s.trust -= 5; note('info', 'The allies line up', '"Tokyo, Seoul and Brussels have all signed on." Beijing is slowed, and warned.', 'State Department cable'); }
  if (has('share')) { s.leverage++; s.spread = true; note('info', 'The models go abroad', 'Frontier models are now running in Tokyo and London. Both governments enforce the chip controls.'); }
  if (has('spurn')) { s.leverage--; note('warn', 'The allies are turned down', '"If Washington will not share, we will make our own arrangements."', 'Statement, Tokyo'); }
  if (has('expose')) { s.leverage++; s.trust -= 15; s.tension += 5; s.shamed = true; add('warn', 'The theft is exposed', '"Today we are charging seven Chinese military officers with stealing American AI models." Allied sanctions follow.', 'Justice Department press conference'); }
  if (has('private')) { s.trust += 5; learn(); }
  if (has('hotline')) { s.tension -= 20; note('good', 'The hotline opens', '"We told them where our ships will be. They told us where theirs will be. Both sides are pulling back."', 'Pacific Command, call transcript'); }
  if (has('tolerate')) { s.trust += 10; note('warn', 'Washington looks away', 'The paper deal stands. So does the hidden site.'); }
  if (has('snap')) s.trust -= 5;

  // White House
  if (has('secure')) { s.labs += TUNE.labPay; note('good', 'The labs take the money', harden() + ' The weights are behind ' + SECURITY[s.sec] + '.'); }
  if (has('box')) { s.boxed = true; note('good', 'Human sign-off', 'AI-run research now needs a human signature. Losing control is half as likely.'); }
  if (has('compute')) { s.labs += TUNE.labCompute; boost = true; note('good', 'Federal compute for the labs', 'The labs get their data centers.'); }
  if (has('back')) s.labs += TUNE.labBack;
  if (has('shelve')) s.labs += TUNE.labShelve;
  if (has('wait')) s.labs += TUNE.labWait;
  if (has('test')) s.labs += TUNE.labTest;
  if (has('national')) { s.national = true; s.sec = Math.max(s.sec, 1); s.tension += 10; add('warn', 'The labs are nationalized', 'Federal marshals take over the data centers. Beijing reads it as mobilization.', 'Wire report, Washington'); }

  // Pentagon
  if (has('reassure')) { s.tension -= 15; note('info', 'The fleet pulls back', 'The carrier group leaves the Strait. Taipei was not consulted.', 'Wire report, Taipei'); }
  if (has('deter')) s.tension += c === 'flash' ? TUNE.flashDeter : 5;   // reinforcing into a standoff escalates it
  if (has('preempt')) s.tension += TUNE.preempt;
  if (has('lock')) { s.labs += TUNE.labLock; note('good', 'The labs are locked down', harden()); }
  if (has('bury')) s.mole = true;
  if (has('mole')) {
    if (roll('mole') < TUNE.moleBurned) { s.trust -= 15; s.tension += 10; add('bad', 'The source is caught', '"The American spy has confessed."', 'State media, Beijing'); }
    else { s.mole = true; note('good', 'A source is in place', 'The CIA now has a standing source inside Beijing\'s program.'); learn(); }
  }
  if (has('exfil')) {
    s.trust -= TUNE.exfil;
    if (!s.deal) { s.known = [true, true]; add('good', 'The walk-in talks', '"He told us what the leadership wants." ' + both(), 'Debrief, CIA station, Singapore'); }
    else add(s.hidden ? 'bad' : 'good', 'The walk-in talks', s.hidden ? '"He gave us the coordinates of a hidden site. It has been running for months."' : '"There is no hidden site. Beijing is keeping the deal."', 'Debrief, CIA station, Singapore');
  }
  if (has('watch')) { learn(); if (roll('asset') < TUNE.burned) { s.trust -= 10; add('bad', 'An asset is burned', 'Beijing rolls up one of the CIA\'s sources and makes sure Washington knows.'); } }
  if (has('sabotage')) {
    s.cn -= TUNE.sabotage; s.cnShown -= TUNE.sabotage; s.tension += 25; s.trust -= 20; s.shamed = true;
    add('warn', 'Sabotage', 'Three Chinese data centers went dark overnight. "We know who did this."', 'State media, Beijing');
    breakDeal('Beijing answers the sabotage by tearing up the pause.');
  }
  if (has('burn')) {
    s.tension += 10;
    if (roll('burn') < TUNE.burn) { const back = s.fresh.gain * TUNE.burnShare; s.cn -= back; s.cnShown -= back; add('good', 'The stolen copy burns', 'China loses ' + months(back) + ' of what it took.'); }
    else add('bad', 'The stolen copy survives', 'Beijing had already moved the weights off the network.');
  }
  if (has('strike')) {
    s.cn -= TUNE.sabotage; s.cnShown = s.cn; s.hidden = false; s.caught = false; s.cheated = true; s.tension += 20; s.trust -= 15; s.shamed = true;
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
    const p = confrontOdds(s, has('deter'), false);
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
  if (!s.national) s.labs += s.pace === 'race' ? TUNE.labRace : s.pace === 'hold' ? TUNE.labHold : 0;
  fix();
  const defy = s.pace === 'hold' && !s.national && s.labs < TUNE.labDefiant;
  const usStep = (s.pace === 'hold' ? (defy ? TUNE.defy : TUNE.usHold) : s.pace === 'slow' ? TUNE.usSlow : raceStep(Object.assign({}, s, { crisis: c }))) + (boost && s.pace !== 'hold' ? TUNE.usBoost : 0);
  s.us += usStep;
  let cnStep;
  if (s.deal) { cnStep = s.hidden ? TUNE.cnHidden : TUNE.cnDeal; s.cnShown += s.caught ? cnStep : TUNE.cnDeal; }
  else {
    const copy = Math.min(s.controls >= 2 ? TUNE.cnCopyCut : TUNE.cnCopy, Math.max(0, s.us - s.cn - 1));
    cnStep = (s.controls >= 3 ? TUNE.cnOwnCut : TUNE.cnOwn) + TUNE.cnChips[clamp(s.controls, -1, 1) + 1] + copy;
    cnStep = Math.max(0.4, cnStep - (has('allies') || has('share') ? TUNE.allies : 0));
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
  const th = theftOdds(s, has('reassure') || (c === 'breakthrough' && has('race')), has('guard'));
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
    const eyes = (had ? 1 : 0) + (has('watch') ? 1 : 0) + (has('snap') ? 1 : 0) + (s.mole ? 1 : 0);
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
  if (!s.deal && s.controls >= 3) s.tension += TUNE.cornered;   // an embargoed Beijing has less to lose
  fix();
  const pWar = warRisk(s) * (has('deter') ? TUNE.warDeter : 1) * (has('watch') ? TUNE.warWatch : 1);
  if (pWar > 0) {
    if (roll('war') < pWar) { add('bad', 'War in the Strait', '"Chinese missiles have hit Taiwan. An American destroyer is on fire. This is not an exercise." War was ' + odds(pWar) + ' this turn.', 'Wire flash, Taipei', true); return end(s, 'war', ev); }
    note('warn', 'The Strait stays quiet', 'War was ' + odds(pWar) + ' this turn.');
  }

  // runaway RSI
  if (s.us > s.line) {
    const moving = s.pace !== 'hold' || defy, p = (s.pace === 'race' ? TUNE.runRace : moving ? TUNE.runSlow : TUNE.runHold) * (s.boxed ? TUNE.boxed : 1);
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
  ahead: { grade: 'B', title: 'Ahead and holding', text: 'No deal, but America stopped short of the danger point with China well behind it. The clock is still running.' },
  behind: { grade: 'D', title: 'Behind', text: 'America held and Beijing did not. China now leads a race America has left.' },
  countdown: { grade: 'C', title: 'Countdown', text: 'America held. China did not, and is closing on the danger point with nothing to stop it.' },
  racing: { grade: 'C', title: 'Still racing', text: 'No one has lost control yet. No one has agreed to stop either.' },
  coinflip: { grade: 'D', title: 'Living on a coin flip', text: 'The frontier is past the danger point and the world is still here, for now.' },
};

function end(s, how, ev) {
  if (how === 'time') {
    const cnGap = s.line - s.cn;      // months China still needs
    if (s.us > s.line && !s.deal) how = 'coinflip';
    else if (s.deal) how = s.caught ? 'caught' : s.hidden ? 'betrayed' : s.inspectors ? 'verified' : TUNE.turns - s.dealT <= 2 ? 'untested' : 'trust';   // a pause on trust has to have lasted
    else if (s.pace !== 'hold') how = cnGap > 0 ? 'racing' : 'countdown';
    else how = s.cn > s.us + 1 ? 'behind' : cnGap > 4 ? 'ahead' : 'countdown';
  }
  s.over = Object.assign({ how }, ENDINGS[how]);
  return ev;
}

const api = { TUNE, DATES, SECURITY, TABLES, ASKS, newGame, view, turn, play, ENDINGS, hash01, odds, months, price, crisis, dealOdds, warRisk, willing };
if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.Room = api;
})(typeof window !== 'undefined' ? window : globalThis);
