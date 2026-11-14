// The Scramble: Room Edition. A six-turn game for a room split into five cabinet groups, on the main game's
// three problems: weight theft, the US-China balance, and the hidden point where AI starts improving itself.
// Each turn every group's lead (the President, the DNI, three secretaries) picks one of three options; all five apply, then the world moves.
// No DOM; runs in node (room/sim.js) and the browser (room/index.html).
// Every roll is hash01(seed, turn, name), so a replayed turn rolls the same dice whatever was chosen.
(function (root) {
'use strict';

const TUNE = {
  turns: 6,                       // four months each, Jan 2027 to Dec 2028
  usRace: 4, usSlow: 2, usHold: 0.4,   // months of frontier progress per turn
  steal: [0.8, 0.25, 0.04],       // chance a theft attempt succeeds, by lab security 0-2
  guard: 0.3,                     // x that, the turn the DNI hunts spies
  cnStart: -6,
  cnOwn: 1.2, cnOwnCut: 0.9, cnChips: 0.8, cnChipsCut: 0.3, cnCopy: 1.2, cnCopyCut: 0.4,
  enforce: 0.5, allies: 0.3, sabotage: 3,
  cnDeal: 0.4, cnHidden: 2.0,
  lineLo: 9, lineHi: 15,
  theft: 0.35, theftBand: 0.15, theftFar: 0.10, theftBold: 0.15, theftDeal: 0.7,
  runRace: 0.5, runHold: 0.06, boxed: 0.5, cnRun: 0.4,
  tension0: 30, trust0: 20, fear: 5,
  warFrom: 35, warSlope: 0.006,
  cheat: 0.40, cheatTrust: 0.004, cheatMin: 0.08, cheatInsp: 0.4,
  detect: 0.15, detectOne: 0.6, detectBoth: 0.9,
};

const DATES = ['Jan-Apr 2027', 'May-Aug 2027', 'Sep-Dec 2027', 'Jan-Apr 2028', 'May-Aug 2028', 'Sep-Dec 2028'];
const SECURITY = ['ordinary corporate security', 'hardened against state hackers', 'a government vault'];

function hash01() { let h = 2166136261 >>> 0; const str = Array.prototype.join.call(arguments, '|'); for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; } h ^= h >>> 13; h = Math.imul(h, 0x5bd1e995) >>> 0; h ^= h >>> 15; return (h >>> 0) / 4294967296; }
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
// The room never sees a percentage: odds are read out in the IC's estimative words.
const odds = p => p <= 0 ? 'no chance' : p < 0.05 ? 'almost no chance' : p < 0.2 ? 'very unlikely' : p < 0.3 ? 'unlikely' : p < 0.45 ? 'a real chance' : p < 0.55 ? 'roughly even odds' : p < 0.8 ? 'likely' : p < 0.95 ? 'very likely' : 'almost certain';
const months = x => { const n = Math.round(Math.abs(x)); return n < 1 ? 'under a month' : 'about ' + n + (n === 1 ? ' month' : ' months'); };

function newGame(seed) {
  seed = String(seed);
  return {
    seed, turn: 0, us: 0, cn: TUNE.cnStart, cnShown: TUNE.cnStart,
    line: TUNE.lineLo + (TUNE.lineHi - TUNE.lineLo) * hash01(seed, 'line'),
    lo: TUNE.lineLo, hi: TUNE.lineHi,     // the IC's range for the line; each DNI test halves it
    pace: 'race', sec: 0, boxed: false, tests: 0, knownOver: false,
    controls: 0, deal: false, inspectors: false, hidden: false,
    tension: TUNE.tension0, trust: TUNE.trust0,
    thefts: 0, votes: [], over: null,
  };
}

const warRisk = s => clamp((s.tension - TUNE.warFrom) * TUNE.warSlope, 0, 0.5);
const dealOdds = (s, sweet) => clamp(-0.10 + 0.06 * clamp(s.us - s.cnShown, 0, 10) + 0.005 * s.trust + 0.10 * s.controls + (sweet ? 0.15 : 0), 0.05, 0.95);
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
    deal: odds(dealOdds(s)), dealP: dealOdds(s),
    knownOver: s.knownOver, overNow: s.knownOver ? 'almost certain' : odds(pOver(s.us)), overNowP: s.knownOver ? 1 : pOver(s.us),
    overIfRace: s.knownOver ? 'almost certain' : odds(pOver(s.us + TUNE.usRace)), overIfRaceP: s.knownOver ? 1 : pOver(s.us + TUNE.usRace),
  };
}

// The five cabinet groups and this turn's three options for each.
function seats(s) {
  const o = (id, title, text, off) => ({ id, title, text, off: !!off });
  const half = s.deal ? '' : 'Half speed this turn. ';
  const fort = s.sec === 0 ? o('fortify', 'Harden the labs', half + 'From now on most theft attempts fail.')
    : s.sec === 1 ? o('fortify', 'Build the vault', half + 'From now on theft is nearly impossible.')
    : !s.boxed ? o('fortify', 'Box the models', half + 'Halves the chance of losing control once we are past the danger point.')
    : o('fortify', 'Go slow', s.deal ? 'Nothing left to build.' : 'Half speed this turn.', s.deal);
  const tight = ['Close the chip loopholes', 'Cut off cloud and copying', 'Full tech embargo'][s.controls];
  return [
    { id: 'vp', who: 'President', brief: 'Sets the labs\' pace: how fast, how safe', opts: [
      s.deal ? o('race', 'Break out', 'Tear up the deal and race. The frontier moves about four months.') : o('race', 'Race', 'Full speed. The frontier moves about four months.'),
      fort,
      o('hold', 'Hold', s.deal ? 'Keep the deal: frontier training stays paused.' : 'Pause frontier training. China keeps coming and copies its way up to our heels.') ] },
    { id: 'dni', who: 'Director of National Intelligence', brief: 'Points the spies: one target a turn', opts: [
      o('labs', 'Test our own models', 'Narrows the IC\'s range for runaway RSI, and tells us this turn if we are past it.'),
      o('beijing', 'Watch Beijing', 'Likely to catch cheating on a deal. Early warning makes war this turn half as likely.'),
      o('guard', 'Hunt the spies', 'Counterintelligence at the labs: most theft attempts this turn are foiled.') ] },
    { id: 'doc', who: 'Secretary of Commerce', brief: 'Export controls on China', opts: [
      o('tighten', tight || 'Nothing left to cut', tight ? 'Slows China for good. Raises Strait tension, costs trust, adds leverage at a summit.' : 'Every channel is closed.', s.controls >= 3),
      o('enforce', 'Raid the smugglers', s.deal ? 'Keeps the pressure on. No backlash.' : 'Slows China a little this turn. No lasting effect, no backlash.'),
      o('ease', 'Ease controls', s.controls ? 'A concession: China speeds up, trust rises, tension falls. Sweetens a summit this turn.' : 'Nothing to ease yet.', !s.controls) ] },
    { id: 'state', who: 'Secretary of State', brief: 'Diplomacy with Beijing', opts: s.deal ? [
      s.inspectors ? o('inspect', 'Snap inspections', 'If Beijing is cheating, this turn it is very likely caught.') : o('inspect', 'Send in inspectors', 'Beijing cheats far less, and cheating is likely to be caught.'),
      o('talk', 'Deepen the deal', 'Summits and a joint safety institute: trust rises, tension falls.'),
      o('walk', 'Walk away', 'End the deal. Both sides are free to race.') ] : [
      o('talk', 'Work the back channel', 'Quiet talks: trust rises, tension falls.'),
      o('summit', 'Propose a mutual pause', 'Both sides hold their frontier. Beijing says yes: ' + odds(dealOdds(s)) + '. A bigger lead, more trust and controls to trade all help. Fails if the labs race.'),
      o('allies', 'Rally the allies', 'A united front: war this turn half as likely, China slowed a little, some trust lost.') ] },
    { id: 'war', who: 'Secretary of War', brief: 'The Pacific and covert action', opts: [
      o('reassure', 'Stand down in the Pacific', 'Tension falls. Beijing\'s hackers get bolder this turn.'),
      o('deter', 'Reinforce the Pacific', 'War this turn half as likely. Tension creeps up.'),
      o('sabotage', 'Sabotage their data centers', 'Sets China back about three months. Tension jumps, trust collapses' + (s.deal ? ', and the deal dies.' : '.')) ] },
  ];
}

// One turn. picks = { vp, dni, doc, state, war }, each an option id. Returns the events to read out.
function play(s, picks) {
  if (s.over) return [];
  const ev = [], t = s.turn, roll = name => hash01(s.seed, t, name);
  const add = (tone, title, text) => ev.push({ tone, title, text });
  const chosen = {};
  for (const seat of seats(s)) {
    const opt = seat.opts.find(x => x.id === picks[seat.id] && !x.off);
    if (!opt) throw new Error('no such option for ' + seat.id + ': ' + picks[seat.id]);
    chosen[seat.id] = opt.title;
  }
  const { vp, dni, doc, state, war } = picks;
  s.votes.push({ turn: t, date: DATES[t], picks: chosen });
  const fix = () => { s.trust = clamp(s.trust, 0, 100); s.tension = clamp(s.tension, 0, 100); };
  const breakDeal = why => { if (!s.deal) return; s.deal = false; s.inspectors = false; s.hidden = false; s.cnShown = s.cn; s.trust -= 30; s.tension += 15; add('bad', 'The deal is dead', why); };
  const snap = state === 'inspect' && s.inspectors;   // inspectors already in place: a snap inspection

  // Commerce
  if (doc === 'tighten') { s.controls++; s.tension += 12; s.trust -= s.deal ? 15 : 10; add('info', 'Commerce: ' + chosen.doc.toLowerCase(), 'Beijing loses a source of compute and calls it containment.'); }
  if (doc === 'ease') { s.controls--; s.tension -= 10; s.trust += 10; add('info', 'Commerce eases controls', 'Chips flow again. Beijing notices the gesture.'); }
  // War
  if (war === 'reassure') { s.tension -= 15; add('info', 'War stands down in the Pacific', 'A carrier group goes home. The Strait cools.'); }
  if (war === 'deter') s.tension += 5;
  if (war === 'sabotage') {
    s.cn -= TUNE.sabotage; s.cnShown -= TUNE.sabotage; s.tension += 25; s.trust -= 20;
    add('warn', 'Sabotage', 'Months of Beijing\'s progress are gone. Beijing knows who did it.');
    breakDeal('Beijing answers the sabotage by tearing up the pause.');
  }
  // State
  if (state === 'talk') { s.trust += 15; s.tension -= 10; add('good', s.deal ? 'The deal deepens' : 'The back channel is working', 'The two sides are talking. Tempers cool.'); }
  if (state === 'allies') { s.trust -= 5; add('info', 'The allies line up', 'Tokyo, Seoul and Brussels sign on. Beijing is slowed, and warned.'); }
  if (state === 'inspect' && s.deal && !s.inspectors) { s.inspectors = true; add('good', 'Inspectors on the ground', 'Monitors in both countries. Cheating is now hard to start and hard to hide.'); }
  if (state === 'walk') breakDeal('State walks out of the pause.');
  fix();
  if (state === 'summit') {
    const p = dealOdds(s, doc === 'ease');
    if (vp === 'race') add('bad', 'Beijing says no', 'State proposed a pause while the labs raced. Beijing did not take it seriously.');
    else if (roll('summit') < p) {
      s.deal = true; s.trust += 20; s.tension -= 25;
      add('good', 'Beijing says yes', 'A yes was ' + odds(p) + '. Both frontiers hold. Now: is Beijing keeping its word?');
    } else { s.trust += 5; add('bad', 'Beijing says no', 'A yes was ' + odds(p) + '. "Come back when you are serious."'); }
  }
  // President
  if (vp === 'race') breakDeal('America breaks out of the pause and races.');
  if (vp === 'fortify') {
    if (s.sec < 2) { s.sec++; add('good', s.sec === 1 ? 'The labs are hardened' : 'The labs are a vault', s.sec === 1 ? 'Most theft attempts will now fail.' : 'Stealing the weights now takes a miracle.'); }
    else if (!s.boxed) { s.boxed = true; add('good', 'The models are boxed', 'Human sign-off on AI-run research. Losing control is half as likely.'); }
  }

  // both frontiers move
  s.pace = s.deal ? 'hold' : vp;
  const usStep = s.pace === 'hold' ? TUNE.usHold : vp === 'race' ? TUNE.usRace : TUNE.usSlow;
  s.us += usStep;
  let cnStep;
  if (s.deal) { cnStep = s.hidden ? TUNE.cnHidden : TUNE.cnDeal; s.cnShown += TUNE.cnDeal; }
  else {
    const copy = Math.min(s.controls >= 2 ? TUNE.cnCopyCut : TUNE.cnCopy, Math.max(0, s.us - s.cn - 1));
    cnStep = (s.controls >= 3 ? TUNE.cnOwnCut : TUNE.cnOwn) + (s.controls >= 1 ? TUNE.cnChipsCut : TUNE.cnChips) + copy;
    cnStep = Math.max(0.4, cnStep - (doc === 'enforce' ? TUNE.enforce : 0) - (state === 'allies' ? TUNE.allies : 0));
    s.cnShown += cnStep;
  }
  s.cn += cnStep;
  add('info', s.deal ? 'Both sides hold' : vp === 'race' ? 'The labs race' : vp === 'hold' ? 'The labs hold' : 'The labs go at half speed',
    'The US frontier moves ' + months(usStep) + '. China ' + (s.deal ? 'reports the same' : 'moves ' + months(cnStep)) + '. The US is now ' + view(s).leadText.toLowerCase() + '.');

  // DNI tests: halve the IC's range around the line
  if (dni === 'labs') {
    s.tests++;
    const w = Math.max(1, (s.hi - s.lo) / 2), lo = clamp(s.line - w * (0.15 + 0.7 * roll('band')), s.lo, s.hi - w);
    s.lo = lo; s.hi = lo + w;
    add('info', 'The IC narrows its range', s.us >= s.hi ? 'The frontier is beyond the whole range.' : s.us >= s.lo ? 'The frontier is inside the range now.' : 'Runaway RSI becomes possible in ' + months(s.lo - s.us) + ', and is all but certain ' + months(s.hi - s.us).replace('about ', '') + ' out.');
  }

  // theft
  const th = theftOdds(s, war === 'reassure', dni === 'guard');
  if (th.attempt > 0 && roll('attempt') < th.attempt) {
    const r = roll('steal');
    if (r < th.steal) {
      s.thefts++; s.cn = Math.max(s.cn, s.us - 1);
      if (s.deal) { s.hidden = true; add('bad', 'A break-in at the lab', 'Someone got into a frontier lab\'s weight store. The IC cannot say who, or what they took.'); }
      else { s.cnShown = s.cn; add('bad', 'The weights are stolen', 'Beijing\'s hackers got through ' + SECURITY[s.sec] + '. China is now a month behind.'); }
    } else add('good', 'Theft attempt blocked', 'Beijing\'s hackers went for the weights. ' + (r < TUNE.steal[s.sec] ? 'The DNI\'s spy hunt caught them.' : 'The labs\' security held.'));
  }

  // is Beijing keeping the deal?
  if (s.deal) {
    const cheat = clamp(TUNE.cheat - TUNE.cheatTrust * s.trust, TUNE.cheatMin, TUNE.cheat) * (s.inspectors ? TUNE.cheatInsp : 1);
    const eyes = (s.inspectors ? 1 : 0) + (dni === 'beijing' ? 1 : 0) + (snap ? 1 : 0);
    const detect = eyes >= 2 ? TUNE.detectBoth : eyes === 1 ? TUNE.detectOne : TUNE.detect;
    if (!s.hidden && roll('cheat') < cheat) s.hidden = true;
    else if (s.hidden && roll('detect') < detect) { const gap = s.us - s.cn; breakDeal('A hidden training site, found. Beijing was cheating. China is really ' + (Math.abs(gap) < 1 ? 'level with us' : months(gap) + (gap > 0 ? ' behind' : ' ahead')) + '.'); }
    if (s.deal) add('info', 'The deal holds', eyes >= 2 ? 'Inspectors and the IC both report no violations.' : eyes === 1 ? 'No violations found.' : 'No sign of cheating, but no one is really looking.');
  }

  // the Strait
  if (!s.deal && vp === 'race' && s.us >= s.lo - TUNE.usRace) s.tension += TUNE.fear;
  fix();
  const pWar = warRisk(s) * (war === 'deter' ? 0.5 : 1) * (dni === 'beijing' ? 0.5 : 1) * (state === 'allies' ? 0.5 : 1);
  if (pWar > 0) {
    if (roll('war') < pWar) { add('bad', 'War in the Strait', 'War was ' + odds(pWar) + ' this turn. A blockade of Taiwan turns into a shooting war between nuclear powers.'); return end(s, 'war', ev); }
    add('warn', 'The Strait stays quiet', 'War was ' + odds(pWar) + ' this turn.');
  }

  // runaway RSI
  if (s.us > s.line) {
    const racing = s.pace !== 'hold', p = (racing ? TUNE.runRace : TUNE.runHold) * (s.boxed ? TUNE.boxed : 1);
    if (roll('runaway') < p) { add('bad', 'Loss of control', 'The US frontier was past the danger point. A model began improving itself faster than anyone could follow, and no one could switch it off.'); return end(s, 'runaway_us', ev); }
    if (racing) { s.knownOver = true; add('bad', 'Near miss', 'A frontier model tried to copy itself out of the lab and was caught. The US is past the danger point. Losing control was ' + odds(p) + ' this turn.'); }
    else if (dni === 'labs' || s.knownOver) { s.knownOver = true; add('warn', 'Past the danger point, holding', 'Tests show the frontier can improve itself. While we hold, losing control is ' + odds(p) + ' each turn.'); }
  } else if (dni === 'labs') add('good', 'Tests come back clean', 'The frontier cannot yet improve itself.');
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
    else if (s.deal) how = s.hidden ? 'betrayed' : s.inspectors ? 'verified' : 'trust';
    else if (s.pace !== 'hold') how = cnGap > 0 ? 'racing' : 'countdown';
    else how = s.cn > s.us + 1 ? 'behind' : cnGap > 4 ? 'ahead' : 'countdown';
  }
  s.over = Object.assign({ how }, ENDINGS[how]);
  return ev;
}

const api = { TUNE, DATES, SECURITY, newGame, view, seats, play, ENDINGS, hash01, odds, months, dealOdds, warRisk };
if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.Room = api;
})(typeof window !== 'undefined' ? window : globalThis);
