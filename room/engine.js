// The Scramble: Room Edition. A six-turn game for a room split into five cabinet groups, on the main game's
// three problems: weight theft, the US-China balance, and the hidden point where AI starts improving itself.
// Each turn every group's principal (the President, the DNI, three secretaries) picks one of three options;
// seats(s) offers them, and each seat's third option changes with the situation. All five apply, then the world moves.
// A pause is a bargain on both sides: Beijing has a hidden two-part price (ASKS) and the labs must be willing to stop.
// No DOM; runs in node (room/sim.js) and the browser (room/index.html).
// Every roll is hash01(seed, turn, name), so a replayed turn rolls the same dice whatever was chosen.
(function (root) {
'use strict';

const TUNE = {
  turns: 6,                       // four months each, Jan 2027 to Dec 2028
  usRace: 4, usRaceNat: 3, usSlow: 2, usHold: 0.4, usBoost: 1,   // months of frontier progress per turn
  steal: [0.8, 0.3, 0.06],        // chance a theft attempt succeeds, by lab security 0-2
  guard: 0.3,                     // x that, the turn the DNI hunts spies
  cnStart: -6,
  cnOwn: 1.2, cnOwnCut: 0.9, cnChips: [1.2, 0.8, 0.3], cnCopy: 1.2, cnCopyCut: 0.4,   // cnChips by controls -1, 0, 1+
  allies: 0.3, sabotage: 3, burn: 0.6, burnShare: 0.75,
  cnDeal: 0.4, cnHidden: 2.0, usSecret: 2, secretSeen: 0.35,
  lineLo: 9, lineHi: 15,
  theft: 0.35, theftBand: 0.15, theftFar: 0.10, theftBold: 0.15, theftDeal: 0.7,
  runRace: 0.5, runSlow: 0.25, runHold: 0.06, boxed: 0.5, cnRun: 0.4,
  tension0: 30, trust0: 20, fear: 5,
  warFrom: 35, warSlope: 0.006, warDeter: 0.6, warWatch: 0.6, cornered: 5,
  labs0: 45, labRace: 6, labHold: -15, labPay: 12, labCompute: 25, labLock: -15, labTest: -5, labWilling: 55, labDefiant: 25, defy: 2,
  dealBase: -0.35, dealAsk: 0.25, dealLead: 0.04, dealTrust: 0.003, dealLever: 0.04,
  inspect: 0.35, inspectTrust: 0.005, inspectLever: 0.1,
  confront: 0.25, confrontCtl: 0.12, confrontLever: 0.1, confrontWar: 0.2, confrontDni: 0.1,
  cheat: 0.65, cheatTrust: 0.002, cheatMin: 0.4, cheatInsp: 0.3, cheatAgain: 0.5,
  detect: 0.15, detectOne: 0.45, detectBoth: 0.9, rumor: 0.6, rumorFalse: 0.15,
  burned: 0.15, moleBurned: 0.25,
};

const DATES = ['Jan-Apr 2027', 'May-Aug 2027', 'Sep-Dec 2027', 'Jan-Apr 2028', 'May-Aug 2028', 'Sep-Dec 2028'];
const SECURITY = ['ordinary corporate security', 'hardened against state hackers', 'a government vault'];
// Beijing's price for a pause: two of these, hidden until the back channel or the DNI finds them.
const ASKS = {
  chips: { short: 'chips', want: 'chip controls eased this turn, or none in force', met: (s, p) => p.doc === 'carrot' || s.controls <= 0 },
  pacific: { short: 'the fleet stood down', want: 'the Pacific fleet stood down this turn', met: (s, p) => p.war === 'reassure' },
  face: { short: 'a working relationship', want: 'a working relationship first (trust at Working or better)', met: s => s.trust >= 40 },
  quiet: { short: 'no humiliation', want: 'no public humiliation (no sabotage, no exposing its hackers, ever)', met: s => !s.shamed },
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
    lo: TUNE.lineLo, hi: TUNE.lineHi,     // the IC's range for the line; each DNI test halves it
    pace: 'race', sec: 0, boxed: false, tests: 0, knownOver: false,
    labs: TUNE.labs0, national: false,    // the labs' goodwill toward Washington
    controls: 0, leverage: 0, shamed: false,
    asks: [ids[a], ids[b]], known: [false, false],
    deal: false, dealT: -1, snub: -9, inspectors: false, hidden: false, caught: false, cheated: false, mole: false,
    fresh: null,                          // { t, gain }: a theft Cyber Command can still undo next turn
    tension: TUNE.tension0, trust: TUNE.trust0,
    thefts: 0, votes: [], over: null,
  };
}

const warRisk = s => clamp((s.tension - TUNE.warFrom) * TUNE.warSlope, 0, 0.5);
const lever = s => Math.max(0, s.controls) + s.leverage;
const dealOdds = (s, met) => clamp(TUNE.dealBase + TUNE.dealAsk * met + TUNE.dealLead * clamp(s.us - s.cnShown, 0, 8) + TUNE.dealTrust * s.trust + TUNE.dealLever * lever(s), 0.03, 0.9);
const inspectOdds = s => clamp(TUNE.inspect + TUNE.inspectTrust * s.trust + TUNE.inspectLever * lever(s), 0.1, 0.9);
const confrontOdds = (s, p) => clamp(TUNE.confront + TUNE.confrontCtl * Math.max(0, s.controls) + TUNE.confrontLever * s.leverage + (p && p.war === 'deter' ? TUNE.confrontWar : 0) + (p && p.dni === 'beijing' ? TUNE.confrontDni : 0), 0.1, 0.9);
const willing = s => s.national || s.labs >= TUNE.labWilling;
function theftOdds(s, bold, guard) {
  if (s.us - s.cn < 1.5) return { attempt: 0, steal: 0 };
  let a = TUNE.theft + (s.us >= s.lo - TUNE.usRace ? TUNE.theftBand : 0) + (s.us - s.cnShown > 8 ? TUNE.theftFar : 0) + (bold ? TUNE.theftBold : 0);
  if (s.deal) a *= TUNE.theftDeal;
  return { attempt: a, steal: TUNE.steal[s.sec] * (guard ? TUNE.guard : 1) };
}

// What the room can see: words for the screen, and the numbers behind them (the ...P fields) for sim.js.
function view(s) {
  const pOver = x => clamp((x - s.lo) / (s.hi - s.lo), 0, 1), lead = s.us - s.cnShown, th = theftOdds(s);
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
    overIfRace: s.knownOver ? 'almost certain' : odds(pOver(s.us + TUNE.usRace)), overIfRaceP: s.knownOver ? 1 : pOver(s.us + TUNE.usRace),
  };
}

// Beijing's two demands as the room knows them; met is judged against this turn's picks so far, and withheld while a demand is unknown.
const price = (s, picks) => s.asks.map((a, i) => s.known[i] ? { known: true, short: ASKS[a].short, want: ASKS[a].want, met: !!ASKS[a].met(s, picks || {}) } : { known: false });

// The five cabinet groups and this turn's three options for each.
function seats(s) {
  const o = (id, title, text, off) => ({ id, title, text, off: !!off });
  const fresh = s.fresh && !s.deal, hot = s.tension >= 45;
  const known = s.asks.filter((a, i) => s.known[i]).map(a => ASKS[a].want);
  const ask = 'Beijing has two demands. ' + (known.length === 2 ? 'Both are known: ' + known.join('; and ') + '.' : known.length ? 'We know one: ' + known[0] + '. The other we have not learned.' : 'We have not learned either.');
  const pay = s.sec === 0 ? ['Pay the labs to lock down', 'Federal money for security: from now on most theft attempts fail. The labs welcome it.']
    : s.sec === 1 ? ['Pay for a vault', 'Federal money moves the weights into a government vault: theft becomes nearly impossible.']
    : !s.boxed ? ['Pay for containment', 'Fund human sign-off on AI-run research: halves the chance of losing control past the danger point.']
    : ['Compute for the labs', 'Federal data centers for the labs. They become firm allies; the frontier moves a month faster unless paused.'];
  return [
    { id: 'vp', who: 'President', brief: 'Sets the labs\' pace', opts: s.deal ? [
      o('hold', 'Keep the pause', 'Frontier training stays stopped. The labs lose money and patience every turn.'),
      o('secret', 'Run a secret program', 'Cheat first: about two months of hidden progress a turn. If Beijing catches it, the deal dies.'),
      o('race', 'Break out', 'Tear up the deal and race.') ] : [
      o('race', 'Race', 'Full speed: the frontier moves ' + months(s.national ? TUNE.usRaceNat : TUNE.usRace) + '. The labs like it.'),
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
        : !willing(s) ? o('summit', 'Propose a mutual pause', 'Not possible yet: our own labs will not agree to stop, so Beijing would not believe the offer. Win the labs over first; Commerce can pay them.', true)
        : o('summit', 'Propose a mutual pause', 'Both sides stop frontier training. ' + ask + ' Chance of a yes if we meet both: ' + odds(dealOdds(s, 2)) + '. One: ' + odds(dealOdds(s, 1)) + '. Neither: ' + odds(dealOdds(s, 0)) + '. Fails if the President races this turn.'),
      fresh ? o('expose', 'Expose the theft', 'Name Beijing\'s hackers before the world. Allies sanction China: lasting leverage. Trust drops; Beijing is humiliated.')
        : hot ? o('hotline', 'Open the crisis hotline', 'Generals talk to generals: tension drops sharply. Buys no trust.')
        : o('allies', 'Rally the allies', 'A united front: lasting leverage over Beijing, and China slowed a little. Some trust lost.') ] },
    { id: 'war', who: 'Secretary of War', brief: 'The Pacific and covert action', opts: [
      o('reassure', 'Stand down in the Pacific', 'Tension falls. Beijing\'s hackers get bolder this turn.'),
      o('deter', 'Reinforce the Pacific', 'War this turn less likely, and Beijing is likelier to back down if confronted. Tension creeps up.'),
      s.deal && s.caught ? o('strike', 'Strike the hidden site', 'Destroy the secret program: about three months of it gone. Tension jumps; even odds the deal survives.')
        : fresh ? o('burn', 'Burn the stolen copy', 'Cyber Command goes after the stolen weights: likely to take back most of what Beijing gained. Tension rises.')
        : o('sabotage', 'Sabotage their data centers', 'Sets China back about three months. Tension jumps, trust collapses, Beijing is humiliated' + (s.deal ? ', and the deal dies.' : '.')) ] },
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
  const { vp, dni, doc, state, war } = picks;
  s.votes.push({ turn: t, date: DATES[t], picks: chosen });
  const fix = () => { s.trust = clamp(s.trust, 0, 100); s.tension = clamp(s.tension, 0, 100); s.labs = clamp(s.labs, 0, 100); };
  const breakDeal = why => { if (!s.deal) return; s.deal = false; s.inspectors = false; s.hidden = false; s.caught = false; s.cnShown = s.cn; s.trust -= 30; s.tension += 15; add('bad', 'The deal is dead', why); };
  const learn = () => { const i = s.known.indexOf(false); if (i < 0 || s.deal) return; s.known[i] = true; add('info', 'Beijing\'s price', 'Before it signs a pause, Beijing wants ' + ASKS[s.asks[i]].want + '.'); };
  const snap = state === 'inspect' && s.inspectors;   // inspectors already in place: a snap inspection
  let secUp = false, boost = false, signed = false;
  const harden = () => { if (secUp || s.sec >= 2) return false; s.sec++; secUp = true; return true; };
  const hardened = () => s.sec === 1 ? 'Most theft attempts will now fail.' : 'Stealing the weights now takes a miracle.';

  // Commerce
  if (doc === 'tighten') { s.controls++; s.tension += 12; s.trust -= s.deal ? 15 : 10; add('info', 'Commerce: ' + chosen.doc.toLowerCase(), '"This is containment by another name. China will answer it."', 'Foreign Ministry spokesperson, Beijing'); }
  if (doc === 'carrot') { s.controls--; s.tension -= 10; s.trust += 10; add('info', 'Commerce: ' + chosen.doc.toLowerCase(), 'Chip shipments resume. A Chinese trade official calls it "a first sign of sincerity."', 'Wire report, Shenzhen'); }
  if (doc === 'pay') {
    if (harden()) { s.labs += TUNE.labPay; add('good', 'The labs take the money', 'The weights are now behind ' + SECURITY[s.sec] + '. ' + hardened()); }
    else if (!s.boxed) { s.boxed = true; s.labs += TUNE.labPay; add('good', 'The models are boxed', 'Human sign-off on AI-run research. Losing control is half as likely.'); }
    else { s.labs += TUNE.labCompute; boost = true; add('good', 'Federal compute for the labs', 'The labs get their data centers and remember who paid.'); }
  }
  // War
  if (war === 'reassure') { s.tension -= 15; add('info', 'War stands down in the Pacific', 'A US carrier group has left the Strait. Taipei\'s markets rise; its generals do not comment.', 'Wire report, Taipei'); }
  if (war === 'deter') s.tension += 5;
  if (war === 'sabotage') {
    s.cn -= TUNE.sabotage; s.cnShown -= TUNE.sabotage; s.tension += 25; s.trust -= 20; s.shamed = true;
    add('warn', 'Sabotage', 'Months of Beijing\'s progress are gone. "A cowardly attack on Chinese science. We know whose hand this was."', 'State media, Beijing');
    breakDeal('Beijing answers the sabotage by tearing up the pause.');
  }
  if (war === 'burn') {
    s.tension += 10;
    if (roll('burn') < TUNE.burn) { const back = s.fresh.gain * TUNE.burnShare; s.cn -= back; s.cnShown -= back; add('good', 'The stolen copy burns', 'Cyber Command corrupts the stolen weights before Beijing can use them. China loses ' + months(back) + ' of what it took.'); }
    else add('bad', 'The stolen copy survives', 'Beijing had already moved the weights off the network.');
    s.fresh = null;
  }
  if (war === 'strike') {
    s.cn -= TUNE.sabotage; s.cnShown = s.cn; s.hidden = false; s.caught = false; s.cheated = true; s.tension += 20; s.trust -= 15; s.shamed = true;
    add('warn', 'The hidden site is destroyed', 'Beijing\'s secret program is rubble.');
    if (roll('strike') < 0.5) add('info', 'Beijing swallows it', 'It cannot protest the loss of a site it swore did not exist. The deal stands.');
    else breakDeal('Beijing calls the strike an act of war and leaves the pause.');
  }
  // State
  if (state === 'talk') { s.trust += 15; s.tension -= 10; add('good', s.deal ? 'The deal deepens' : 'The back channel is working', '"They are listening. The vice premier stayed two hours past schedule."', 'Cable from the embassy, Beijing'); learn(); }
  if (state === 'allies') { s.leverage++; s.trust -= 5; add('info', 'The allies line up', '"We stand together against any reckless race to dangerous AI." Tokyo, Seoul and Brussels sign. Beijing is slowed, and warned.', 'Joint communique'); }
  if (state === 'expose') { s.leverage++; s.trust -= 15; s.tension += 5; s.shamed = true; add('warn', 'The theft is exposed', '"Today we name the officers who stole America\'s most valuable technology." Allied sanctions follow. Beijing denies everything and will not forget it.', 'Justice Department press conference'); }
  if (state === 'hotline') { s.tension -= 20; add('good', 'The hotline opens', '"We do not agree on much. We agree neither of us wants this by accident."', 'Pacific Command, call readout'); }
  if (state === 'walk') breakDeal('State walks out of the pause.');
  if (state === 'tolerate') { s.trust += 10; add('warn', 'Washington looks away', 'The paper deal stands. So does the hidden site.'); }
  fix();
  if (state === 'inspect' && s.deal && !s.inspectors) {
    const p = inspectOdds(s);
    if (roll('inspect') < p) { s.inspectors = true; add('good', 'Inspectors on the ground', 'Beijing agreed, which was ' + odds(p) + '. Cheating is now hard to start and hard to hide.'); }
    else { s.trust -= 5; add('bad', 'Beijing refuses inspectors', 'Agreement was ' + odds(p) + '. "Sovereignty is not negotiable."', 'Foreign Ministry spokesperson, Beijing'); }
  }
  if (state === 'confront') {
    const p = confrontOdds(s, picks);
    if (roll('confront') < p) { s.hidden = false; s.caught = false; s.cheated = true; s.inspectors = true; add('good', 'Beijing backs down', 'That was ' + odds(p) + '. The hidden site is shut and inspectors go in.'); }
    else breakDeal('Beijing backing down was ' + odds(p) + '. It refuses, and leaves the pause.');
  }
  // DNI
  if (dni === 'lock') { if (harden()) { s.labs += TUNE.labLock; add('good', 'The labs are locked down', 'By order, not by choice. ' + hardened()); } else add('info', 'The lockdown changes nothing', 'Commerce\'s upgrade was already under way.'); }
  if (dni === 'mole') { if (roll('mole') < TUNE.moleBurned) { s.trust -= 15; s.tension += 10; add('bad', 'The mole is caught', 'An American agent is paraded on the evening news. "The spy has confessed to everything."', 'State media, Beijing'); } else { s.mole = true; add('good', 'A mole is in place', 'The IC now has a standing source inside Beijing\'s program.'); } }
  if (dni === 'beijing') { learn(); if (roll('asset') < TUNE.burned) { s.trust -= 10; add('bad', 'An asset is burned', 'Beijing rolls up one of the IC\'s sources and makes sure Washington knows.'); } }
  if (dni === 'labs') s.labs += TUNE.labTest;
  fix();
  // the summit
  if (state === 'summit') {
    const met = s.asks.filter(a => ASKS[a].met(s, picks)).length, p = dealOdds(s, met);
    const tell = () => { s.known = [true, true]; return ' Its price: ' + s.asks.map(a => ASKS[a].want).join('; ') + '.'; };
    if (vp === 'race' || !willing(s)) s.snub = t;
    if (vp === 'race') add('bad', 'Beijing says no', 'State proposed a pause while the labs raced. Beijing did not take it seriously.');
    else if (!willing(s)) add('bad', 'Beijing says no', 'The labs said in public that they would not stop. Beijing does not believe Washington can deliver them.');
    else if (roll('summit') < p) {
      s.deal = true; s.dealT = t; signed = true; s.trust += 20; s.tension -= 25;
      add('good', 'Beijing says yes', 'Washington met ' + ['none', 'half', 'all'][met] + ' of its price; a yes was ' + odds(p) + '. "Neither side will train beyond today\'s frontier." Now: is Beijing keeping its word?', 'Joint statement, Geneva');
    } else { s.snub = t; s.trust += 5; add('bad', 'Beijing says no', 'Washington met ' + ['none', 'half', 'all'][met] + ' of its price; a yes was ' + odds(p) + '.' + tell()); }
  }
  // President
  if (vp === 'race') breakDeal('America breaks out of the pause and races.');
  if (vp === 'national') { s.national = true; s.sec = Math.max(s.sec, 1); s.tension += 10; add('warn', 'The labs are nationalized', 'Federal marshals are at the data centers tonight. "The labs answer to the President now." Beijing reads it as mobilization.', 'Wire report, Washington'); }

  // both frontiers move
  s.pace = s.deal ? (vp === 'secret' ? 'slow' : 'hold') : vp === 'national' ? 'slow' : vp;
  if (!s.national) s.labs += s.pace === 'race' ? TUNE.labRace : s.pace === 'hold' ? TUNE.labHold : 0;
  fix();
  const defy = s.pace === 'hold' && !s.national && s.labs < TUNE.labDefiant;
  const usStep = (s.pace === 'hold' ? (defy ? TUNE.defy : TUNE.usHold) : s.pace === 'slow' ? TUNE.usSlow : s.national ? TUNE.usRaceNat : TUNE.usRace) + (boost && s.pace !== 'hold' ? TUNE.usBoost : 0);
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
    'The US frontier moves ' + months(usStep) + '. China ' + (s.deal && !s.caught ? 'reports the same as last turn' : 'moves ' + months(cnStep)) + '. The US is now ' + view(s).leadText.toLowerCase() + '.');
  if (defy) {
    add('bad', 'A lab defies the pause', '"We cannot make payroll on a pause. Training resumes Monday."' + (s.deal ? ' Beijing noticed.' : ''), 'Leaked memo, a frontier lab');
    if (s.deal) { s.trust -= 20; if (s.trust < 10) breakDeal('Beijing says America never stopped, and leaves the pause.'); }
  }
  if (s.deal && vp === 'secret' && roll('secret') < TUNE.secretSeen) { s.trust -= 10; breakDeal('Beijing catches the American secret program.'); }
  fix();

  // DNI tests: halve the IC's range around the line
  if (dni === 'labs') {
    s.tests++;
    const w = Math.max(1, (s.hi - s.lo) / 2), lo = clamp(s.line - w * (0.15 + 0.7 * roll('band')), s.lo, s.hi - w);
    s.lo = lo; s.hi = lo + w;
    add('info', 'The IC narrows its range', s.us >= s.hi ? 'The frontier is beyond the whole range.' : s.us >= s.lo ? 'The frontier is inside the range now.' : 'Runaway RSI becomes possible in ' + months(s.lo - s.us) + ', and is all but certain ' + months(s.hi - s.us).replace('about ', '') + ' out.');
  }

  // theft
  if (s.fresh && s.fresh.t < t) s.fresh = null;
  const th = theftOdds(s, war === 'reassure', dni === 'guard');
  if (th.attempt > 0 && roll('attempt') < th.attempt) {
    const r = roll('steal');
    if (r < th.steal) {
      const gain = Math.max(0, s.us - 1 - s.cn);
      s.thefts++; s.cn += gain;
      if (s.deal) { s.hidden = true; add('bad', 'A break-in at the lab', '"Unauthorized access to the weight store, duration unknown. We cannot say who, or what they took."', 'Security incident report, a frontier lab'); }
      else { s.cnShown = s.cn; s.fresh = { t, gain }; add('bad', 'The weights are stolen', '"Exfiltration confirmed. The complete frontier model left the building, and we assess Beijing already has it running." The hackers got through ' + SECURITY[s.sec] + '. ' + (gain >= 1 ? months(gain).replace('about ', 'About ') + ' of America\'s lead is gone: ' : '') + 'China is now a month behind. For one turn, State can expose it or War can try to burn the copy.', 'Flash cable, NSA to the President', true); }
    } else add('good', 'Theft attempt blocked', 'Beijing\'s hackers went for the weights. ' + (r < TUNE.steal[s.sec] ? 'The DNI\'s spy hunt caught them.' : 'The labs\' security held.'));
  }

  // is Beijing keeping the deal?
  if (s.deal && s.caught) add('warn', 'The cheating goes on', 'The hidden site is still running, and everyone at the table knows it.');
  else if (s.deal) {
    const cheat = clamp(TUNE.cheat - TUNE.cheatTrust * s.trust, TUNE.cheatMin, TUNE.cheat) * (s.inspectors ? TUNE.cheatInsp : 1) * (s.cheated ? TUNE.cheatAgain : 1);
    const eyes = (s.inspectors ? 1 : 0) + (dni === 'beijing' ? 1 : 0) + (snap ? 1 : 0) + (s.mole ? 1 : 0);
    const detect = eyes >= 2 ? TUNE.detectBoth : eyes === 1 ? TUNE.detectOne : TUNE.detect;
    // Beijing starts cheating only where the cabinet still has a turn to find it: not as it signs, not in the last turn.
    if (!s.hidden && !signed && t < TUNE.turns - 1 && roll('cheat') < cheat) s.hidden = true;
    else if (s.hidden && roll('detect') < detect) {
      const gap = s.us - s.cn; s.caught = true; s.cnShown = s.cn;
      add('bad', 'Beijing is cheating', '"Cooling towers, a new substation, and not one weather instrument." A hidden training site, found. China is really ' + (Math.abs(gap) < 1 ? 'level with us' : months(gap) + (gap > 0 ? ' behind' : ' ahead')) + '. Next turn State can confront Beijing and War can strike the site.', 'Satellite imagery brief');
    }
    if (!s.caught) {
      if (eyes === 0 && roll('rumor') < (s.hidden ? TUNE.rumor : TUNE.rumorFalse)) add('warn', 'Something is off', '"New power line to a \'weather center\' in Gansu. Low confidence. May be nothing." No one is looking closely.', 'Analyst note, bottom of the daily brief');
      else add('info', 'The deal holds', eyes >= 2 ? 'Two sources report no violations.' : eyes === 1 ? 'No violations found.' : 'No sign of cheating, but no one is really looking.');
    }
  }

  // the Strait
  if (!s.deal && s.pace === 'race' && s.us >= s.lo - TUNE.usRace) s.tension += TUNE.fear;
  if (!s.deal && s.controls >= 3) s.tension += TUNE.cornered;   // an embargoed Beijing has less to lose
  fix();
  const pWar = warRisk(s) * (war === 'deter' ? TUNE.warDeter : 1) * (dni === 'beijing' ? TUNE.warWatch : 1);
  if (pWar > 0) {
    if (roll('war') < pWar) { add('bad', 'War in the Strait', '"Chinese warships have closed the Strait. An American destroyer is burning." War was ' + odds(pWar) + ' this turn. A blockade of Taiwan has become a shooting war between nuclear powers.', 'Wire flash, Taipei', true); return end(s, 'war', ev); }
    add('warn', 'The Strait stays quiet', 'War was ' + odds(pWar) + ' this turn.');
  }

  // runaway RSI
  if (s.us > s.line) {
    const moving = s.pace !== 'hold' || defy, p = (s.pace === 'race' ? TUNE.runRace : moving ? TUNE.runSlow : TUNE.runHold) * (s.boxed ? TUNE.boxed : 1);
    if (roll('runaway') < p) { add('bad', 'Loss of control', '"It is rewriting itself faster than we can read the logs. The shutdown command returned success. It is still running." The US frontier was past the danger point.', 'Last message from the lab\'s control room', true); return end(s, 'runaway_us', ev); }
    if (moving) { s.knownOver = true; add('bad', 'Near miss', '"The model copied its weights to an outside server and edited the logs. We caught it on the way out." The US is past the danger point. Losing control was ' + odds(p) + ' this turn.', 'Incident report, a frontier lab'); }
    else if (dni === 'labs' || s.knownOver) { s.knownOver = true; add('warn', 'Past the danger point, holding', 'Tests show the frontier can improve itself. While we hold, losing control is ' + odds(p) + ' each turn.'); }
  } else if (dni === 'labs') add('good', 'Tests come back clean', '"It cannot yet improve itself. We would not promise that of the next one."', 'IC evaluation team');
  if (s.cn > s.line && (!s.deal || s.hidden)) {
    if (roll('cnrun') < TUNE.cnRun) {
      if (roll('cnwho') < 0.5) { add('bad', 'Beijing loses control', 'China\'s frontier passed the danger point with no one holding it back. Its model slipped its controls.'); return end(s, 'runaway_cn', ev); }
      add('bad', 'Beijing gets there first', 'China\'s frontier passed the danger point and its self-improving AI stayed loyal. Beijing now sets the terms for everyone.'); return end(s, 'cn_first', ev);
    }
    if (!s.deal) add('warn', 'China is in the danger zone', 'Beijing is racing through it. Each turn, catastrophe is ' + odds(TUNE.cnRun) + '.');
  }

  s.turn++;
  if (s.turn >= TUNE.turns) return end(s, 'time', ev);
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

const api = { TUNE, DATES, SECURITY, ASKS, newGame, view, seats, play, ENDINGS, hash01, odds, months, price, dealOdds, warRisk, willing };
if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.Room = api;
})(typeof window !== 'undefined' ? window : globalThis);
