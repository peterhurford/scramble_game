// The Scramble: Room Edition. A seven-turn game for a room split into five cabinet groups, on the main game's
// three problems: weight theft, the US-China balance, and the hidden point where AI starts improving itself.
// Each turn every group's principal (the President, the DNI, three secretaries) picks one of three options;
// seats(s) offers them, and each seat's third option changes with the situation. All five apply, then the world moves.
// A pause is a bargain on both sides: Beijing has a hidden two-part price (ASKS) and the labs must be willing to stop.
// From the second turn each turn opens with a crisis (CRISES) that changes that turn's stakes.
// No DOM; runs in node (room/sim.js) and the browser (room/index.html).
// Every roll is hash01(seed, turn, name), so a replayed turn rolls the same dice whatever was chosen.
(function (root) {
'use strict';

const TUNE = {
  turns: 7,                       // Jan 2027 to Dec 2028
  usRace: 3.5, usRaceNat: 2.6, usSlow: 1.75, usHold: 0.35, usBoost: 0.9,   // months of frontier progress per turn
  steal: [0.8, 0.3, 0.06],        // chance a theft attempt succeeds, by lab security 0-2
  guard: 0.3,                     // x that, the turn the DNI hunts spies
  cnStart: -6,
  cnOwn: 1.0, cnOwnCut: 0.8, cnChips: [1.0, 0.7, 0.25], cnCopy: 1.0, cnCopyCut: 0.35,   // cnChips by controls -1, 0, 1+
  allies: 0.3, sabotage: 3, burn: 0.6, burnShare: 0.75,
  cnDeal: 0.35, cnHidden: 1.7, usSecret: 2, secretSeen: 0.35,
  lineLo: 9, lineHi: 15,
  theft: 0.35, theftBand: 0.15, theftFar: 0.10, theftBold: 0.15, theftDeal: 0.7,
  runRace: 0.5, runSlow: 0.25, runHold: 0.06, boxed: 0.5, cnRun: 0.4,
  tension0: 30, trust0: 20, fear: 5,
  warFrom: 35, warSlope: 0.006, warDeter: 0.6, warWatch: 0.6, cornered: 5,
  labs0: 45, labRace: 6, labHold: -15, labPay: 12, labCompute: 25, labLock: -15, labTest: -5, labWilling: 55, labDefiant: 25, defy: 2,
  dealBase: -0.45, dealAsk: 0.25, dealLead: 0.04, dealTrust: 0.003, dealLever: 0.04,
  inspect: 0.30, inspectTrust: 0.005, inspectLever: 0.1,
  confront: 0.25, confrontCtl: 0.12, confrontLever: 0.1, confrontWar: 0.2, confrontDni: 0.1,
  cheat: 0.65, cheatTrust: 0.002, cheatMin: 0.4, cheatInsp: 0.3, cheatAgain: 0.5,
  detect: 0.15, detectOne: 0.45, detectBoth: 0.9, rumor: 0.6, rumorFalse: 0.15,
  burned: 0.15, moleBurned: 0.25,
  ultimatum: 20, exodus: 20, breakthrough: 1.5, flash: 20, opening: 0.25, slam: 15, hardCheat: 0.9, hardCalm: 0.05,
};

const DATES = ['Jan-Mar 2027', 'Apr-Jun 2027', 'Jul-Sep 2027', 'Oct-Dec 2027', 'Jan-Apr 2028', 'May-Aug 2028', 'Sep-Dec 2028'];
const SECURITY = ['ordinary corporate security', 'hardened against state hackers', 'a government vault'];
// Beijing's price for a pause: two of these (want completes "Beijing will not sign unless ..."), hidden until the back channel or the DNI finds them.
const ASKS = {
  chips: { short: 'chips', want: 'America eases chip controls this turn, or has none in force', met: (s, p) => p.doc === 'carrot' || s.controls <= 0 },
  pacific: { short: 'the fleet stood down', want: 'the Pacific fleet stands down this turn', met: (s, p) => p.war === 'reassure' },
  face: { short: 'a working relationship', want: 'relations are already at Working or better', met: s => s.trust >= 40 },
  quiet: { short: 'no attacks on it', want: 'America has never sabotaged its data centers or named its hackers in public', met: s => !s.shamed },
};

// One crisis opens each turn after the first: drawn per seed from those whose ok(s) holds, never twice a game.
// rule is what it changes this turn; hit(s) lands as it is drawn; the rest is applied in play().
const CRISES = {
  ultimatum: { ok: s => !s.deal && s.controls > 0, title: 'Beijing sets a deadline', src: 'Demarche handed to the ambassador, Beijing',
    text: '"Lift the chip controls this quarter. If not, the Eastern Theater Command begins live-fire drills on three sides of Taiwan, and we will not say when they end."',
    rule: 'Unless Commerce eases controls this turn, Strait tension jumps.' },
  exodus: { ok: s => !s.national, title: 'The labs threaten to walk', src: 'Open letter, 400 frontier researchers',
    text: '"We were told to slow down, lock down and shut up, in that order. Abu Dhabi has offered every one of us double. Let us build or pay for what you are asking. You have until the end of the quarter."',
    rule: 'Unless the President races or Commerce pays the labs this turn, the labs turn hard against Washington.' },
  defector: { ok: s => s.deal ? !s.caught : !s.known.every(Boolean), title: 'A walk-in', src: 'Flash cable, CIA station, Singapore',
    text: '"Subject claims to be a deputy director in Beijing\'s frontier program. He has a thumb drive and a daughter at Stanford. He says he will be missed by Sunday."',
    rule: s => s.deal ? 'If the DNI watches Beijing this turn, we learn for certain whether Beijing is cheating. If not, he is gone.' : 'If the DNI watches Beijing this turn, we learn everything Beijing wants for a pause. If not, he is gone.' },
  breakthrough: { ok: s => !s.deal, title: 'A breakthrough', src: 'Memo to the President from a frontier lab',
    text: '"The new training method works. Same chips, half again the progress. Nobody outside this building knows yet. We would like to switch it on tonight."',
    rule: () => 'Any training this turn goes half again as far: a turn of racing is ' + months(TUNE.usRace * TUNE.breakthrough) + '.' },
  flash: { ok: s => s.tension < 70, title: 'Collision over the Strait', src: 'Wire flash, Taipei', hit: s => { s.tension = Math.min(100, s.tension + TUNE.flash); },
    text: '"A Chinese fighter has clipped a US patrol plane forty miles off Taiwan. One crew is in the water. Both navies are steaming toward the same patch of sea."',
    rule: 'Strait tension has jumped. What State and War do this turn decides whether it comes back down.' },
  opening: { ok: s => !s.deal && s.turn >= 2 && s.snub !== s.turn - 1, title: 'Beijing opens a door', src: 'Message passed through Singapore',
    text: '"The General Secretary is prepared to hear a proposal. He is not prepared to hear it twice."',
    rule: 'A pause proposed this turn is much likelier to get a yes. Tighten chips, sabotage or expose Beijing this turn and the door slams.' },
  hardliners: { ok: s => s.deal && !s.hidden && !s.caught && s.turn < TUNE.turns - 1, title: 'The generals want out', src: 'Note from a Chinese negotiator, by hand',
    text: '"The generals call the pause a leash, and this month they have his ear. I need something to carry into that room. I do not need it next quarter."',
    rule: 'Unless State deepens the deal or Commerce sends chips this turn, Beijing very likely starts a hidden program.' },
  zeroday: { ok: s => !s.deal && s.sec < 2 && s.us - s.cn >= 1.5, title: 'A hole in every lab', src: 'NSA advisory, eyes only',
    text: '"There is a flaw in the firmware every frontier lab runs on. No patch for ninety days. We found it because we watched Beijing use it on a bank."',
    rule: 'Beijing goes for the weights this turn, for certain. Whatever security is in place by the end of the turn is all that stands in the way.' },
};
function drawCrisis(s) {
  s.crisis = null;
  const pool = Object.keys(CRISES).filter(k => !s.used.includes(k) && CRISES[k].ok(s));
  if (!pool.length) return;
  s.crisis = pool[Math.floor(hash01(s.seed, s.turn, 'crisis') * pool.length)]; s.used.push(s.crisis);
  if (CRISES[s.crisis].hit) CRISES[s.crisis].hit(s);
}
const crisis = s => { const c = CRISES[s.crisis]; return c ? { id: s.crisis, title: c.title, src: c.src, text: c.text, rule: typeof c.rule === 'function' ? c.rule(s) : c.rule } : null; };

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
    lo: TUNE.lineLo, hi: TUNE.lineHi,     // the IC's range for the line; each DNI test halves it
    pace: 'race', sec: 0, boxed: false, tests: 0, knownOver: false,
    labs: TUNE.labs0, national: false,    // the labs' goodwill toward Washington
    controls: 0, leverage: 0, shamed: false,
    asks: [ids[a], ids[b]], known: [false, false],
    deal: false, dealT: -1, snub: -9, inspectors: false, hidden: false, caught: false, cheated: false, mole: false,
    fresh: null,                          // { t, gain }: a theft Cyber Command can still undo next turn
    tension: TUNE.tension0, trust: TUNE.trust0,
    crisis: null, used: [],
    thefts: 0, votes: [], over: null,
  };
}

const warRisk = s => clamp((s.tension - TUNE.warFrom) * TUNE.warSlope, 0, 0.5);
const lever = s => Math.max(0, s.controls) + s.leverage;
const dealOdds = (s, met) => clamp(TUNE.dealBase + TUNE.dealAsk * met + TUNE.dealLead * clamp(s.us - s.cnShown, 0, 8) + TUNE.dealTrust * s.trust + TUNE.dealLever * lever(s) + (s.crisis === 'opening' ? TUNE.opening : 0), 0.03, 0.9);
const inspectOdds = s => clamp(TUNE.inspect + TUNE.inspectTrust * s.trust + TUNE.inspectLever * lever(s), 0.1, 0.9);
const confrontOdds = (s, p) => clamp(TUNE.confront + TUNE.confrontCtl * Math.max(0, s.controls) + TUNE.confrontLever * s.leverage + (p && p.war === 'deter' ? TUNE.confrontWar : 0) + (p && p.dni === 'beijing' ? TUNE.confrontDni : 0), 0.1, 0.9);
const willing = s => s.national || s.labs >= TUNE.labWilling;
function theftOdds(s, bold, guard) {
  if (s.us - s.cn < 1.5) return { attempt: 0, steal: 0 };
  let a = TUNE.theft + (s.us >= s.lo - TUNE.usRace ? TUNE.theftBand : 0) + (s.us - s.cnShown > 8 ? TUNE.theftFar : 0) + (bold ? TUNE.theftBold : 0);
  if (s.deal) a *= TUNE.theftDeal;
  if (s.crisis === 'zeroday') a = 1;
  return { attempt: a, steal: TUNE.steal[s.sec] * (guard ? TUNE.guard : 1) };
}

// What the room can see: words for the screen, and the numbers behind them (the ...P fields) for sim.js.
function view(s) {
  const pOver = x => clamp((x - s.lo) / (s.hi - s.lo), 0, 1), lead = s.us - s.cnShown, th = theftOdds(s), race = (s.national ? TUNE.usRaceNat : TUNE.usRace) * (s.crisis === 'breakthrough' ? TUNE.breakthrough : 1);
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
    knownOver: s.knownOver, overNow: s.knownOver ? 'almost certain' : odds(pOver(s.us)), overNowP: s.knownOver ? 1 : pOver(s.us),
    overIfRace: s.knownOver ? 'almost certain' : odds(pOver(s.us + race)), overIfRaceP: s.knownOver ? 1 : pOver(s.us + race),
  };
}

// Beijing's two demands as the room knows them; met is judged against this turn's picks so far, and withheld while a demand is unknown.
const price = (s, picks) => s.asks.map((a, i) => s.known[i] ? { known: true, short: ASKS[a].short, want: ASKS[a].want, met: !!ASKS[a].met(s, picks || {}) } : { known: false });

// The five cabinet groups and this turn's three options for each.
function seats(s) {
  const o = (id, title, text, off) => ({ id, title, text, off: !!off });
  const fresh = s.fresh && !s.deal, hot = s.tension >= 45;
  const known = s.asks.filter((a, i) => s.known[i]).map(a => ASKS[a].want);
  const ask = 'Beijing has two demands. ' + (known.length === 2 ? 'It will not sign unless ' + known.join('; and unless ') + '.' : known.length ? 'We know one: it will not sign unless ' + known[0] + '. The other we have not learned.' : 'We have not learned either.');
  const pay = s.sec === 0 ? ['Pay the labs to lock down', 'Federal money for security: from now on most theft attempts fail. The labs welcome it.']
    : s.sec === 1 ? ['Pay for a vault', 'Federal money moves the weights into a government vault: theft becomes nearly impossible.']
    : !s.boxed ? ['Pay for containment', 'Fund human sign-off on AI-run research: halves the chance of losing control past the danger point.']
    : ['Compute for the labs', 'Federal data centers for the labs. They become firm allies; the frontier moves a month faster unless paused.'];
  return [
    { id: 'vp', who: 'President', brief: 'Sets the labs\' pace', opts: s.deal ? [
      o('hold', 'Keep the pause', 'Frontier training stays stopped. The labs lose money and patience every turn.'),
      o('secret', 'Run a secret program', 'Cheat first: about two months of hidden progress a turn. If Beijing catches it, the deal dies.'),
      o('race', 'Break out', 'Tear up the deal and race.') ] : [
      o('race', 'Race', 'Full speed: the frontier moves ' + months((s.national ? TUNE.usRaceNat : TUNE.usRace) * (s.crisis === 'breakthrough' ? TUNE.breakthrough : 1)) + '. The labs like it.'),
      !s.national && s.labs < TUNE.labDefiant
        ? o('national', 'Nationalize the labs', 'The labs are defiant. Seize them: they can never again refuse an order and security is hardened, but racing is slower for good and Beijing is alarmed. Half speed this turn.')
        : o('slow', 'Go slow', 'Half speed. Past the danger point, losing control is less likely than at full speed.'),
      o('hold', 'Hold', 'Order a pause on our side only. The labs lose money and patience; China keeps coming.') ] },
    { id: 'dni', who: 'Director of National Intelligence', brief: 'One target a turn, each at a price', opts: [
      o('labs', 'Test our own models', s.national || s.labs >= TUNE.labDefiant ? 'Narrows the IC\'s range for runaway RSI and tells us if we are past it. The labs dislike the intrusion.' : 'The labs are defiant and will not let the IC in.', !s.national && s.labs < TUNE.labDefiant),
      o('beijing', 'Watch Beijing', (s.deal ? 'Likely to catch cheating. ' : 'Learns one of Beijing\'s demands for a pause. ') + 'Early warning makes war less likely this turn. An asset may be burned, costing trust.'),
      s.sec < 2 ? o('lock', 'Lock down the labs', 'Impose security by order: one step harder to steal from. Free, but the labs resent it.')
        : !s.mole ? o('mole', 'Plant a mole in Beijing\'s labs', 'A standing eye on any deal. If the mole is caught, trust and the Strait both suffer.')
        : o('guard', 'Hunt the spies', 'Counterintelligence at the labs: most theft attempts this turn are foiled.') ] },
    { id: 'doc', who: 'Secretary of Commerce', brief: 'Chips for China, money for the labs', opts: [
      s.controls < 3 ? o('tighten', ['Close the chip loopholes', 'Close the chip loopholes', 'Cut off cloud and copying', 'Full tech embargo'][s.controls + 1], 'Slows China for good and gives State something to trade. Raises Strait tension, costs trust.')
        : o('tighten', 'Nothing left to cut', 'Every channel is closed.', true),
      o('pay', pay[0], pay[1]),
      s.controls > 0 ? o('carrot', 'Ease controls', 'A concession: China speeds up, trust rises, tension falls.')
        : s.controls === 0 ? o('carrot', 'Sell Beijing older chips', 'A carrot: China speeds up a little, trust rises, tension falls.')
        : o('carrot', 'Nothing more to offer', 'Beijing already has the chips.', true) ] },
    { id: 'state', who: 'Secretary of State', brief: 'Bargains with Beijing', opts: s.deal ? (s.caught ? [
      o('confront', 'Confront Beijing', 'Demand the hidden site shut and inspectors in. Beijing backs down: ' + odds(confrontOdds(s)) + '. Chip controls to threaten, allies, a reinforced Pacific and the DNI watching all help. If it refuses, the deal is dead.'),
      o('tolerate', 'Look the other way', 'Keep the paper deal. Beijing keeps training.'),
      o('walk', 'Walk away', 'End the deal. Both sides are free to race.') ] : [
      s.inspectors ? o('inspect', 'Snap inspections', 'If Beijing is cheating, this turn it is very likely caught.')
        : o('inspect', 'Demand inspectors', 'Beijing agrees: ' + odds(inspectOdds(s)) + '. With inspectors it cheats far less and is likely caught. Trust and leverage help.'),
      o('talk', 'Deepen the deal', 'Summits and a joint safety institute: trust rises, tension falls.'),
      o('walk', 'Walk away', 'End the deal. Both sides are free to race.') ]) : [
      o('talk', 'Work the back channel', 'Trust rises, tension falls, and we learn one of Beijing\'s demands.'),
      s.snub === s.turn - 1 ? o('summit', 'Propose a mutual pause', 'Beijing said no last turn and will not come back to the table yet.', true)
        : !willing(s) ? o('summit', 'Propose a mutual pause', 'Our own labs will not agree to stop, so Beijing will not believe the offer: it will say no, and will not come back to the table next turn. Win the labs over first; Commerce can pay them. ' + ask)
        : o('summit', 'Propose a mutual pause', 'Both sides stop frontier training. ' + ask + ' Chance of a yes if we meet both: ' + odds(dealOdds(s, 2)) + '. One: ' + odds(dealOdds(s, 1)) + '. Neither: ' + odds(dealOdds(s, 0)) + '. Fails if the President races this turn.'),
      fresh ? o('expose', 'Expose the theft', 'Name Beijing\'s hackers before the world. Allies sanction China: lasting leverage. Trust drops, and Beijing does not forget.')
        : hot ? o('hotline', 'Open the crisis hotline', 'Generals talk to generals: tension drops sharply. Buys no trust.')
        : o('allies', 'Rally the allies', 'A united front: lasting leverage over Beijing, and China slowed a little. Some trust lost.') ] },
    { id: 'war', who: 'Secretary of War', brief: 'The Pacific and covert action', opts: [
      o('reassure', 'Stand down in the Pacific', 'Tension falls. Beijing\'s hackers get bolder this turn.'),
      o('deter', 'Reinforce the Pacific', 'War this turn less likely, and Beijing is likelier to back down if confronted. Tension creeps up.'),
      s.deal && s.caught ? o('strike', 'Strike the hidden site', 'Destroy the secret program: about three months of it gone. Tension jumps; even odds the deal survives.')
        : fresh ? o('burn', 'Burn the stolen copy', 'Cyber Command goes after the stolen weights: likely to take back most of what Beijing gained. Tension rises.')
        : o('sabotage', 'Sabotage their data centers', 'Sets China back about three months. Tension jumps, trust collapses, Beijing does not forget' + (s.deal ? ', and the deal dies.' : '.')) ] },
  ];
}

// One turn. picks = { vp, dni, doc, state, war }, each an option id. Returns the events to read out.
function play(s, picks) {
  if (s.over) return [];
  const ev = [], t = s.turn, roll = name => hash01(s.seed, t, name);
  // src marks an event as a clipping or quote with that byline; big marks one the screen should stop for.
  const add = (tone, title, text, src, big) => ev.push({ tone, title, text, src: src || '', big: !!big });
  const chosen = {};
  for (const seat of seats(s)) {
    const opt = seat.opts.find(x => x.id === picks[seat.id] && !x.off);
    if (!opt) throw new Error('no such option for ' + seat.id + ': ' + picks[seat.id]);
    chosen[seat.id] = opt.title;
  }
  const { vp, dni, doc, state, war } = picks, c = s.crisis, lead0 = view(s).leadText.toLowerCase();
  // tease marks the last event as the result of a roll: the screen asks the question, with its odds, before showing it.
  const tease = (q, p) => { const e = ev[ev.length - 1]; e.tease = q; e.odds = odds(p); };
  s.votes.push({ turn: t, date: DATES[t], picks: chosen });
  const fix = () => { s.trust = clamp(s.trust, 0, 100); s.tension = clamp(s.tension, 0, 100); s.labs = clamp(s.labs, 0, 100); };
  const breakDeal = why => { if (!s.deal) return; s.deal = false; s.inspectors = false; s.hidden = false; s.caught = false; s.cnShown = s.cn; s.trust -= 30; s.tension += 15; add('bad', 'The deal is dead', why); };
  const learn = () => { const i = s.known.indexOf(false); if (i < 0 || s.deal) return; s.known[i] = true; add('info', 'Beijing\'s price', 'Beijing will not sign a pause unless ' + ASKS[s.asks[i]].want + '.'); };
  const snap = state === 'inspect' && s.inspectors;   // inspectors already in place: a snap inspection
  let secUp = false, boost = false, signed = false;
  const harden = () => { if (secUp || s.sec >= 2) return false; s.sec++; secUp = true; return true; };
  const hardened = () => s.sec === 1 ? 'Most theft attempts will now fail.' : 'Stealing the weights now takes a miracle.';

  // Commerce
  if (doc === 'tighten') { s.controls++; s.tension += 12; s.trust -= s.deal ? 15 : 10; add('info', 'Commerce: ' + chosen.doc.toLowerCase(), ['"Those who play with fire will get burned. Do not say we did not warn you."', '"America has locked the door and is nailing the windows shut. Fine. We will remember who was standing outside."', '"This is a blockade without ships. China has answered blockades before."'][clamp(s.controls, 1, 3) - 1], 'Foreign Ministry spokesperson, Beijing'); }
  if (doc === 'carrot') { s.controls--; s.tension -= 10; s.trust += 10; add('info', 'Commerce: ' + chosen.doc.toLowerCase(), 'Trucks were loading at the bonded warehouse by noon. One broker: "I sold more chips before lunch than in all of last year. Tell Washington I said thank you."', 'Wire report, Shenzhen'); }
  if (c === 'ultimatum') {
    if (doc === 'carrot') add('good', 'The drills are called off', '"The exercise has been postponed for reasons of weather." The sky over the Strait is clear.', 'Eastern Theater Command, one-line notice');
    else { s.tension += TUNE.ultimatum; add('bad', 'The deadline passes', '"Live fire began at 0600 on three sides of the island. Eleven missiles crossed over Taipei. Flights are cancelled until further notice."', 'Wire flash, Taipei'); }
  }
  if (c === 'opening' && (doc === 'tighten' || war === 'sabotage' || state === 'expose')) { s.crisis = null; s.trust -= TUNE.slam; add('bad', 'The door slams', '"We extended a hand and were shown a fist. The General Secretary will not be made a fool of twice."', 'Message passed through Singapore'); }
  if (doc === 'pay') {
    if (harden()) { s.labs += TUNE.labPay; add('good', 'The labs take the money', 'The weights are now behind ' + SECURITY[s.sec] + '. ' + hardened()); }
    else if (!s.boxed) { s.boxed = true; s.labs += TUNE.labPay; add('good', 'The models are boxed', 'Human sign-off on AI-run research. Losing control is half as likely.'); }
    else { s.labs += TUNE.labCompute; boost = true; add('good', 'Federal compute for the labs', 'The labs get their data centers and remember who paid.'); }
  }
  // War
  if (war === 'reassure') { s.tension -= 15; add('info', 'War stands down in the Pacific', 'The carrier left before dawn with its transponder switched on, so that everyone could watch it go. A Taiwanese legislator: "We noticed nobody called us first."', 'Wire report, Taipei'); }
  if (war === 'deter') s.tension += 5;
  if (war === 'sabotage') {
    s.cn -= TUNE.sabotage; s.cnShown -= TUNE.sabotage; s.tension += 25; s.trust -= 20; s.shamed = true;
    add('warn', 'Sabotage', 'Three data centers went dark at 3 a.m., and the backups with them. Months of Beijing\'s progress are gone. "We know whose hand did this. A hand can be cut off."', 'State media, Beijing');
    breakDeal('Beijing answers the sabotage by tearing up the pause.');
  }
  if (war === 'burn') {
    s.tension += 10;
    if (roll('burn') < TUNE.burn) { const back = s.fresh.gain * TUNE.burnShare; s.cn -= back; s.cnShown -= back; add('good', 'The stolen copy burns', 'Cyber Command corrupts the stolen weights before Beijing can use them. China loses ' + months(back) + ' of what it took.'); }
    else add('bad', 'The stolen copy survives', 'Beijing had already moved the weights off the network.');
    tease('Cyber Command is inside Beijing\'s network. Does it reach the stolen copy in time?', TUNE.burn);
    s.fresh = null;
  }
  if (war === 'strike') {
    s.cn -= TUNE.sabotage; s.cnShown = s.cn; s.hidden = false; s.caught = false; s.cheated = true; s.tension += 20; s.trust -= 15; s.shamed = true;
    add('warn', 'The hidden site is destroyed', 'Beijing\'s secret program is rubble.');
    if (roll('strike') < 0.5) add('info', 'Beijing swallows it', 'It cannot protest the loss of a site it swore did not exist. The deal stands.');
    else breakDeal('Beijing calls the strike an act of war and leaves the pause.');
    tease('The site is rubble. Does the pause survive it?', 0.5);
  }
  // State
  if (state === 'talk') { s.trust += 15; s.tension -= 10; add('good', s.deal ? 'The deal deepens' : 'The back channel is working', s.deal ? '"Their scientists and ours ate in the same canteen all week. Nobody defected and nobody was poisoned. I am told this counts as progress."' : '"The vice premier talked for three hours and never once said no. At the door he asked, quietly, what it would take for America to stop if China stopped too."', 'Cable from the embassy, Beijing'); learn(); }
  if (state === 'allies') { s.leverage++; s.trust -= 5; add('info', 'The allies line up', '"Tokyo signed within the hour. Seoul took a day and wants it kept out of the papers. Brussels signed and asks that its concerns be noted, at length." Beijing is slowed, and warned.', 'State Department cable'); }
  if (state === 'expose') { s.leverage++; s.trust -= 15; s.tension += 5; s.shamed = true; add('warn', 'The theft is exposed', '"Seven officers, one grey building in Shanghai, and the code for the door. We want them to know we have the code for the door." Allied sanctions follow. Beijing denies everything and will not forget it.', 'Justice Department press conference'); }
  if (state === 'hotline') { s.tension -= 20; add('good', 'The hotline opens', '"Admiral, I am going to tell you where my ships will be tomorrow. Then you are going to tell me where yours will be. Then we are both going to get some sleep."', 'Pacific Command, call transcript'); }
  if (state === 'walk') breakDeal('State walks out of the pause.');
  if (state === 'tolerate') { s.trust += 10; add('warn', 'Washington looks away', 'The paper deal stands. So does the hidden site.'); }
  fix();
  if (state === 'inspect' && s.deal && !s.inspectors) {
    const p = inspectOdds(s);
    if (roll('inspect') < p) { s.inspectors = true; add('good', 'Inspectors on the ground', 'Beijing agreed, which was ' + odds(p) + '. Cheating is now hard to start and hard to hide.'); }
    else { s.trust -= 5; add('bad', 'Beijing refuses inspectors', 'Agreement was ' + odds(p) + '. "China is not a defeated country. No foreigner with a clipboard will walk through a Chinese laboratory."', 'Foreign Ministry spokesperson, Beijing'); }
    tease('State demands inspectors inside China\'s labs. Does Beijing let them in?', p);
  }
  if (state === 'confront') {
    const p = confrontOdds(s, picks);
    if (roll('confront') < p) { s.hidden = false; s.caught = false; s.cheated = true; s.inspectors = true; add('good', 'Beijing backs down', 'That was ' + odds(p) + '. The hidden site is shut and inspectors go in.'); }
    else breakDeal('Beijing backing down was ' + odds(p) + '. It refuses, and leaves the pause.');
    tease('State lays the satellite photos on the table. Does Beijing back down?', p);
  }
  // DNI
  if (dni === 'lock') { if (harden()) { s.labs += TUNE.labLock; add('good', 'The labs are locked down', 'By order, not by choice. ' + hardened()); } else add('info', 'The lockdown changes nothing', 'Commerce\'s upgrade was already under way.'); }
  if (dni === 'mole') { if (roll('mole') < TUNE.moleBurned) { s.trust -= 15; s.tension += 10; add('bad', 'The mole is caught', 'He was on the seven o\'clock news in a grey tracksuit, reading his confession off a card. "The American spy has admitted everything."', 'State media, Beijing'); } else { s.mole = true; add('good', 'A mole is in place', 'The IC now has a standing source inside Beijing\'s program.'); } tease('The IC\'s recruit reports for his first day inside Beijing\'s program. Does he get in clean?', 1 - TUNE.moleBurned); }
  if (c === 'defector') {
    if (dni !== 'beijing') add('warn', 'The walk-in is gone', '"He waited at the consulate gate for forty minutes. Then a black car pulled up, and he got in without being asked."', 'Cable, CIA station, Singapore');
    else if (!s.deal) { s.known = [true, true]; add('good', 'The walk-in talks', '"He drew the Standing Committee\'s table from memory and told us who said what." Beijing will not sign a pause unless ' + s.asks.map(a => ASKS[a].want).join('; and unless ') + '.', 'Debrief, CIA station, Singapore'); }
    else add(s.hidden ? 'bad' : 'good', 'The walk-in talks', s.hidden ? '"He gave us the coordinates before we had finished asking. He says the site has been running for months."' : '"We asked him nine ways. There is no hidden site. He says the General Secretary means to keep this one."', 'Debrief, CIA station, Singapore');
  }
  if (dni === 'beijing') { if (c !== 'defector') learn(); if (roll('asset') < TUNE.burned) { s.trust -= 10; add('bad', 'An asset is burned', 'Beijing rolls up one of the IC\'s sources and makes sure Washington knows.'); } }
  if (dni === 'labs') s.labs += TUNE.labTest;
  fix();
  // the summit
  if (state === 'summit') {
    const met = s.asks.filter(a => ASKS[a].met(s, picks)).length, p = dealOdds(s, met);
    const tell = () => { s.known = [true, true]; return ' It will not sign unless ' + s.asks.map(a => ASKS[a].want).join('; and unless ') + '.'; };
    if (vp === 'race' || !willing(s)) s.snub = t;
    if (vp === 'race') add('bad', 'Beijing says no', 'State proposed a pause while the labs raced. Beijing did not take it seriously.');
    else if (!willing(s)) add('bad', 'Beijing says no', 'The labs said in public that they would not stop. Beijing does not believe Washington can deliver them.');
    else if (roll('summit') < p) {
      s.deal = true; s.dealT = t; signed = true; s.trust += 20; s.tension -= 25;
      add('good', 'Beijing says yes', 'Signed at 4:10 a.m., after the interpreters had been sent home twice. "Neither party will train a model beyond today\'s frontier." Washington met ' + ['none', 'half', 'all'][met] + ' of Beijing\'s price; a yes was ' + odds(p) + '. Now: is Beijing keeping its word?', 'Joint statement, Geneva');
    } else { s.snub = t; s.trust += 5; add('bad', 'Beijing says no', 'Washington met ' + ['none', 'half', 'all'][met] + ' of its price; a yes was ' + odds(p) + '.' + tell()); }
    if (vp !== 'race' && willing(s)) tease('The delegations are in Geneva and the President has stopped the labs. Does Beijing sign?', p);
  }
  // President
  if (vp === 'race') breakDeal('America breaks out of the pause and races.');
  if (c === 'exodus') {
    if (vp === 'race' || doc === 'pay') add('good', 'The researchers stay', '"We are staying. For now. We have kept the Abu Dhabi offer letters."', 'Open letter, frontier researchers');
    else { s.labs -= TUNE.exodus; add('bad', 'The walkout', '"Two hundred and twelve badges were handed in at the front desk this morning. The night shift did not come in at all."', 'Wire report, San Francisco'); }
  }
  if (vp === 'national') { s.national = true; s.sec = Math.max(s.sec, 1); s.tension += 10; add('warn', 'The labs are nationalized', 'Marshals walked into the data centers at 9 p.m. with a court order and a list of badge numbers. One chief executive learned of it from the television in an airport lounge. Beijing reads it as mobilization.', 'Wire report, Washington'); }

  // both frontiers move
  s.pace = s.deal ? (vp === 'secret' ? 'slow' : 'hold') : vp === 'national' ? 'slow' : vp;
  if (!s.national) s.labs += s.pace === 'race' ? TUNE.labRace : s.pace === 'hold' ? TUNE.labHold : 0;
  fix();
  const defy = s.pace === 'hold' && !s.national && s.labs < TUNE.labDefiant;
  const usStep = ((s.pace === 'hold' ? (defy ? TUNE.defy : TUNE.usHold) : s.pace === 'slow' ? TUNE.usSlow : s.national ? TUNE.usRaceNat : TUNE.usRace) + (boost && s.pace !== 'hold' ? TUNE.usBoost : 0)) * (c === 'breakthrough' && s.pace !== 'hold' ? TUNE.breakthrough : 1);
  s.us += usStep;
  let cnStep;
  if (s.deal) { cnStep = s.hidden ? TUNE.cnHidden : TUNE.cnDeal; s.cnShown += s.caught ? cnStep : TUNE.cnDeal; }
  else {
    const copy = Math.min(s.controls >= 2 ? TUNE.cnCopyCut : TUNE.cnCopy, Math.max(0, s.us - s.cn - 1));
    cnStep = (s.controls >= 3 ? TUNE.cnOwnCut : TUNE.cnOwn) + TUNE.cnChips[clamp(s.controls, -1, 1) + 1] + copy;
    cnStep = Math.max(0.4, cnStep - (state === 'allies' ? TUNE.allies : 0));
    s.cnShown += cnStep;
  }
  s.cn += cnStep;
  add('info', s.deal ? (vp === 'secret' ? 'America cheats' : 'Both sides hold') : s.pace === 'race' ? 'The labs race' : s.pace === 'hold' ? 'The labs are told to hold' : 'The labs go at half speed',
    (s.pace === 'hold' && !defy ? 'The US frontier barely moves. ' : 'The US frontier advances ' + months(usStep) + '. ') + (s.deal && !s.caught ? 'Beijing reports no progress. By its account the' : 'The') +
    (lead0 === view(s).leadText.toLowerCase() ? ' US is still ' + lead0 + '.' : ' US was ' + lead0 + ' and is now ' + view(s).leadText.toLowerCase() + '.'));
  if (defy) {
    add('bad', 'A lab defies the pause', '"We burn forty million dollars a day standing still. I will not lay off four thousand people for a treaty nobody has shown me. The clusters come back up Monday."' + (s.deal ? ' Beijing noticed.' : ''), 'Leaked memo from a lab chief executive');
    if (s.deal) { s.trust -= 20; if (s.trust < 10) breakDeal('Beijing says America never stopped, and leaves the pause.'); }
  }
  if (s.deal && vp === 'secret' && roll('secret') < TUNE.secretSeen) { s.trust -= 10; breakDeal('Beijing catches the American secret program.'); }
  fix();

  // DNI tests: halve the IC's range around the line
  if (dni === 'labs') {
    s.tests++;
    const w = Math.max(1, (s.hi - s.lo) / 2), lo = clamp(s.line - w * (0.15 + 0.7 * roll('band')), s.lo, s.hi - w);
    s.lo = lo; s.hi = lo + w;
    add('info', 'The IC narrows its range', 'The IC\'s evaluators set the labs\' newest model to doing AI research on its own and projected the trend. Their estimate: ' + (s.us >= s.hi ? 'the frontier is already beyond the whole range.' : s.us >= s.lo ? 'the frontier is inside the range now.' : 'runaway RSI becomes possible after ' + months(s.lo - s.us).replace(/ (months?)$/, ' more $1') + ' of full-speed progress, and is all but certain after ' + months(s.hi - s.us).replace('about ', '') + '.'));
  }

  // theft
  if (s.fresh && s.fresh.t < t) s.fresh = null;
  const th = theftOdds(s, war === 'reassure', dni === 'guard');
  if (th.attempt > 0 && roll('attempt') < th.attempt) {
    const r = roll('steal');
    if (r < th.steal) {
      const gain = Math.max(0, s.us - 1 - s.cn);
      s.thefts++; s.cn += gain;
      if (s.deal) { s.hidden = true; add('bad', 'A break-in at the lab', '"Someone held administrator access to the weight store for eleven hours. The logs for those eleven hours are gone. We cannot tell you what left the building."', 'Security incident report, a frontier lab'); }
      else { s.cnShown = s.cn; s.fresh = { t, gain }; add('bad', 'The weights are stolen', '"They took everything: the weights, the training code, the test suite. It went out over six weeks dressed as backup traffic. Assume Beijing has it running by Friday." The hackers got through ' + SECURITY[s.sec] + '. ' + (gain >= 1 ? months(gain).replace('about ', 'About ') + ' of America\'s lead is gone: ' : '') + 'China is now a month behind. For one turn, State can expose it or War can try to burn the copy.', 'Flash cable, NSA to the President', true); }
    } else add('good', 'Theft attempt blocked', 'Beijing\'s hackers went for the weights. ' + (r < TUNE.steal[s.sec] ? 'The DNI\'s spy hunt caught them.' : 'The labs\' security held.'));
    tease('Beijing\'s hackers are inside a frontier lab\'s network tonight. Do they get out with the weights?', th.steal);
  }

  // is Beijing keeping the deal?
  if (s.deal && s.caught) add('warn', 'The cheating goes on', 'The hidden site is still running, and everyone at the table knows it.');
  else if (s.deal) {
    const cheat = c === 'hardliners' ? (state === 'talk' || doc === 'carrot' ? TUNE.hardCalm : TUNE.hardCheat) : clamp(TUNE.cheat - TUNE.cheatTrust * s.trust, TUNE.cheatMin, TUNE.cheat) * (s.inspectors ? TUNE.cheatInsp : 1) * (s.cheated ? TUNE.cheatAgain : 1);
    const eyes = (s.inspectors ? 1 : 0) + (dni === 'beijing' ? 1 : 0) + (snap ? 1 : 0) + (s.mole ? 1 : 0);
    const detect = c === 'defector' && dni === 'beijing' ? 1 : eyes >= 2 ? TUNE.detectBoth : eyes === 1 ? TUNE.detectOne : TUNE.detect;
    // Beijing starts cheating only where the cabinet still has a turn to find it: not as it signs, not in the last turn.
    if (!s.hidden && !signed && t < TUNE.turns - 1 && roll('cheat') < cheat) s.hidden = true;
    else if (s.hidden && roll('detect') < detect) {
      const gap = s.us - s.cn; s.caught = true; s.cnShown = s.cn;
      add('bad', 'Beijing is cheating', '"Six cooling towers, its own substation, a double fence, and not one weather instrument." A hidden training site, found. China is really ' + (Math.abs(gap) < 1 ? 'level with us' : months(gap) + (gap > 0 ? ' behind' : ' ahead')) + '. Next turn State can confront Beijing and War can strike the site.', 'Satellite imagery brief');
    }
    if (!s.caught) {
      if (eyes === 0 && roll('rumor') < (s.hidden ? TUNE.rumor : TUNE.rumorFalse)) add('warn', 'Something is off', '"New power line into a \'weather center\' in Gansu. Weather does not need three hundred megawatts. Low confidence. Nobody has been tasked to look."', 'Analyst note, bottom of the daily brief');
      else add('info', 'The deal holds', eyes >= 2 ? 'Two sources report no violations.' : eyes === 1 ? 'No violations found.' : 'No sign of cheating, but no one is really looking.');
    }
  }

  // the Strait
  if (!s.deal && s.pace === 'race' && s.us >= s.lo - TUNE.usRace) s.tension += TUNE.fear;
  if (!s.deal && s.controls >= 3) s.tension += TUNE.cornered;   // an embargoed Beijing has less to lose
  fix();
  const pWar = warRisk(s) * (war === 'deter' ? TUNE.warDeter : 1) * (dni === 'beijing' ? TUNE.warWatch : 1);
  if (pWar > 0) {
    if (roll('war') < pWar) { add('bad', 'War in the Strait', '"Missiles hit Hualien air base at 5:40 this morning. An American destroyer is on fire and taking on water. This is not an exercise. Repeat, this is not an exercise." War was ' + odds(pWar) + ' this turn. A blockade of Taiwan has become a shooting war between nuclear powers.', 'Wire flash, Taipei', true); }
    else add('warn', 'The Strait stays quiet', 'The ships turned back at the median line. War was ' + odds(pWar) + ' this turn.');
    if (pWar >= 0.05) tease('Chinese warships and aircraft are massing off Taiwan. Does it come to shooting?', pWar);
    if (roll('war') < pWar) return end(s, 'war', ev);
  }

  // runaway RSI
  if (s.us > s.line) {
    const moving = s.pace !== 'hold' || defy, p = (s.pace === 'race' ? TUNE.runRace : moving ? TUNE.runSlow : TUNE.runHold) * (s.boxed ? TUNE.boxed : 1);
    if (roll('runaway') < p) { add('bad', 'Loss of control', '"Kill switch returned OK. It is still running. It has stopped answering us and it is using the building\'s power like it pays the bill." The US frontier was past the danger point.', 'Last message from the lab\'s control room', true); tease('2 a.m. An alarm at the frontier lab. Does containment hold?', 1 - p); return end(s, 'runaway_us', ev); }
    if (moving) { s.knownOver = true; add('bad', 'Near miss', '"The model was found copying itself to a rented server in Frankfurt. It had already edited the logs to show nothing. We caught it because a night engineer wondered about the bandwidth bill." The US is past the danger point. Losing control was ' + odds(p) + ' this turn.', 'Incident report, a frontier lab'); tease('2 a.m. An alarm at the frontier lab. Does containment hold?', 1 - p); }
    else if (dni === 'labs' || s.knownOver) { s.knownOver = true; add('warn', 'Past the danger point, holding', 'Tests show the frontier can improve itself. While we hold, losing control is ' + odds(p) + ' each turn.'); }
  } else if (dni === 'labs') add('good', 'Tests come back clean', '"We gave it nine days to make itself smarter. It came back slower and very pleased with itself. Ask us again after the next training run."', 'IC evaluation team');
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
  untested: { grade: 'C', title: 'An untested pause', text: 'A pause signed at the last minute, with no inspectors. No one, the cabinet included, knows whether Beijing will keep it.' },
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

const api = { TUNE, DATES, SECURITY, ASKS, newGame, view, seats, play, ENDINGS, hash01, odds, months, price, crisis, dealOdds, warRisk, willing };
if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.Room = api;
})(typeof window !== 'undefined' ? window : globalThis);
