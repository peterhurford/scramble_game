// The Scramble: Room Edition. A six-turn group game on the main game's three problems:
// weight theft, the US-China balance, and the hidden line where AI starts improving itself.
// No DOM; runs in node (room/sim.js) and the browser (room/index.html).
// Every roll is hash01(seed, turn, name), so a replayed turn rolls the same dice whatever was voted.
(function (root) {
'use strict';

const TUNE = {
  turns: 6,            // four months each, Jan 2027 to Dec 2028
  usRace: 4,           // months of frontier progress per turn, racing
  usHold: 0.4,         // and holding
  slDrag: { 3: 0, 4: 0.4, 5: 0.8 },
  slSteal: { 3: 0.8, 4: 0.25, 5: 0.04 },   // chance a theft attempt succeeds
  cnStart: -6,
  cnOwn: 1.2, cnChips: 0.8, cnChipsCut: 0.3, cnCopy: 1.2, cnCopyCut: 0.4,
  cnDeal: 0.4, cnHidden: 2.0,
  lineLo: 9, lineHi: 15,
  theft: 0.35, theftBand: 0.15, theftFar: 0.10, theftDeal: 0.7,
  runRace: 0.5, runHold: 0.06, protocols: 0.5, cnRun: 0.4,
  tension0: 30, trust0: 20,
  warFrom: 40, warSlope: 0.004,
  cheat: 0.40, cheatTrust: 0.004, cheatMin: 0.08, cheatInsp: 0.4,
  detect: 0.2, detectInsp: 0.75,
};

const DATES = ['Jan-Apr 2027', 'May-Aug 2027', 'Sep-Dec 2027', 'Jan-Apr 2028', 'May-Aug 2028', 'Sep-Dec 2028'];

function hash01() { let h = 2166136261 >>> 0; const str = Array.prototype.join.call(arguments, '|'); for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; } h ^= h >>> 13; h = Math.imul(h, 0x5bd1e995) >>> 0; h ^= h >>> 15; return (h >>> 0) / 4294967296; }
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const pct = p => Math.round(p * 100) + '%';
const r1 = x => (Math.round(x * 10) / 10).toFixed(1);

function newGame(seed) {
  seed = String(seed);
  return {
    seed, turn: 0, us: 0, cn: TUNE.cnStart, cnShown: TUNE.cnStart,
    line: TUNE.lineLo + (TUNE.lineHi - TUNE.lineLo) * hash01(seed, 'line'),
    throttle: 'race', sl: 3, tripwires: false, protocols: false,
    chips: false, distill: false, sabotage: 0,
    backchannel: false, deal: false, inspectors: false, hidden: false,
    tension: TUNE.tension0, trust: TUNE.trust0,
    thefts: 0, nearMiss: false, votes: [], over: null,
  };
}

// What the room can see: the IC's band for the line, and this turn's odds.
function view(s) {
  let lo = TUNE.lineLo, hi = TUNE.lineHi;
  if (s.tripwires) { lo = s.line - 2 * hash01(s.seed, 'band'); hi = lo + 2; }
  const pOver = x => clamp((x - lo) / (hi - lo), 0, 1);
  const known = s.tripwires && s.us > s.line || s.nearMiss;
  const lead = s.us - s.cnShown;
  const controls = (s.chips ? 1 : 0) + (s.distill ? 1 : 0);
  const inBand = s.us >= lo - TUNE.usRace;
  let attempt = TUNE.theft + (inBand ? TUNE.theftBand : 0) + (lead > 8 ? TUNE.theftFar : 0);
  if (s.deal) attempt *= TUNE.theftDeal;
  if (s.us - s.cn < 1.5) attempt = 0;
  return {
    date: DATES[Math.min(s.turn, TUNE.turns - 1)], lo, hi, lead, controls,
    racePace: TUNE.usRace - TUNE.slDrag[s.sl],
    overNow: known ? 1 : pOver(s.us),
    overIfRace: known ? 1 : pOver(s.us + TUNE.usRace - TUNE.slDrag[s.sl]),
    knownOver: known,
    attempt, steal: TUNE.slSteal[s.sl], theft: attempt * TUNE.slSteal[s.sl],
    war: clamp((s.tension - TUNE.warFrom) * TUNE.warSlope, 0, 0.5),
    dealOdds: clamp(-0.10 + 0.06 * clamp(lead, 0, 10) + 0.005 * s.trust + 0.15 * controls, 0.05, 0.95),
    cheat: clamp(TUNE.cheat - TUNE.cheatTrust * s.trust, TUNE.cheatMin, TUNE.cheat) * (s.inspectors ? TUNE.cheatInsp : 1),
    detect: s.inspectors ? TUNE.detectInsp : TUNE.detect,
  };
}

// The four tracks. Each shows its next step; one step per turn.
function cards(s) {
  const v = view(s), out = [];
  // 1. Protect the weights
  if (s.sl === 3) out.push({ id: 'sl4', track: 'Protect', title: 'Lock down the weights', sub: 'Security Level 4',
    text: 'Order the labs to harden against state hackers: vetted staff, sealed clusters.',
    fx: ['A theft attempt succeeds 25%, not 80%', 'US pace ' + TUNE.usRace + ' to ' + (TUNE.usRace - TUNE.slDrag[4]) + ' a turn'] });
  else if (s.sl === 4) out.push({ id: 'sl5', track: 'Protect', title: 'Build the vault', sub: 'Security Level 5',
    text: 'Air-gapped training on government-guarded sites. Slow, costly, nearly theft-proof.',
    fx: ['A theft attempt succeeds 4%, not 25%', 'US pace ' + (TUNE.usRace - TUNE.slDrag[4]) + ' to ' + (TUNE.usRace - TUNE.slDrag[5]) + ' a turn'] });
  else out.push({ id: 'none_p', track: 'Protect', title: 'The vault is built', sub: 'Security Level 5', text: 'Nothing left on this track.', fx: [], off: true });
  // 2. Find the line
  if (!s.tripwires) out.push({ id: 'tripwires', track: 'Safety', title: 'Install tripwires', sub: 'Evals and red teams',
    text: 'Mandatory tests for self-improvement on every frontier model.',
    fx: ['The line narrows to a 2-month band', 'You are told if you cross it'] });
  else if (!s.protocols) out.push({ id: 'protocols', track: 'Safety', title: 'Control protocols', sub: 'Containment',
    text: 'Human sign-off on AI-run research; models boxed and monitored.',
    fx: ['Runaway risk past the line is halved'] });
  else out.push({ id: 'none_s', track: 'Safety', title: 'Protocols in place', sub: 'Containment', text: 'Nothing left on this track.', fx: [], off: true });
  // 3. Squeeze Beijing
  if (s.deal) out.push({ id: 'none_c', track: 'Squeeze', title: 'Hands tied', sub: 'The deal lifted the controls', text: 'Squeezing Beijing now would break the deal.', fx: [], off: true });
  else if (!s.chips) out.push({ id: 'chips', track: 'Squeeze', title: 'Close the chip loopholes', sub: 'Export controls',
    text: 'Shut smuggling routes and offshore cloud access to US chips.',
    fx: ['China slows by ' + r1(TUNE.cnChips - TUNE.cnChipsCut) + ' a turn', 'Strait tension +15, trust -10', 'A bargaining chip at a summit'] });
  else if (!s.distill) out.push({ id: 'distill', track: 'Squeeze', title: 'Choke off copying', sub: 'Distillation crackdown',
    text: 'Stop Chinese labs harvesting US models through APIs and front companies.',
    fx: ['China copies ' + TUNE.cnCopyCut + ' a turn, not ' + TUNE.cnCopy, 'Strait tension +10, trust -10', 'A bargaining chip at a summit'] });
  else out.push({ id: 'sabotage', track: 'Squeeze', title: 'Sabotage their data centers', sub: 'Covert action',
    text: 'Cyber Command breaks what Beijing has built.',
    fx: ['China set back 3 months', 'Strait tension +30, trust -25'] });
  // 4. Talk to Beijing
  if (!s.deal && !s.backchannel) out.push({ id: 'backchannel', track: 'Talk', title: 'Open a back channel', sub: 'Quiet diplomacy',
    text: 'Scientists and envoys meet in Geneva. No promises, just a line that works.',
    fx: ['Trust +20', 'Strait tension -15'] });
  else if (!s.deal) out.push({ id: 'summit', track: 'Talk', title: 'Summit: propose a mutual pause', sub: 'Beijing says yes: ' + pct(v.dealOdds),
    text: 'Both sides hold their frontier. Our controls are lifted as part of the deal.',
    fx: ['Yes is likelier with a bigger lead, more trust, more controls to trade', 'A no still adds trust +5'] });
  else if (!s.inspectors) out.push({ id: 'inspectors', track: 'Talk', title: 'Send in inspectors', sub: 'Verification',
    text: 'Chip counts, site visits and monitors in both countries.',
    fx: ['Beijing cheats far less often', 'Cheating is caught 75% a turn, not 20%'] });
  else out.push({ id: 'deepen', track: 'Talk', title: 'Deepen the deal', sub: 'Joint safety institute',
    text: 'Shared research on control, a hotline, regular summits.',
    fx: ['Trust +15', 'Strait tension -10'] });
  return out;
}

// One turn: the room's throttle vote ('race' or 'hold') and one card id. Returns the events to read out.
function play(s, throttle, cardId) {
  if (s.over) return [];
  const ev = [], t = s.turn, roll = name => hash01(s.seed, t, name);
  const add = (tone, title, text) => ev.push({ tone, title, text });
  const card = cards(s).find(c => c.id === cardId && !c.off);
  if (!card) throw new Error('card not available: ' + cardId);
  if (s.deal) throttle = 'hold';
  s.throttle = throttle;
  s.votes.push({ turn: t, date: DATES[t], throttle, card: card.title });

  // 1. the action
  if (cardId === 'sl4') { s.sl = 4; add('good', 'Weights locked down', 'The labs reach Security Level 4. Most theft attempts will now fail.'); }
  if (cardId === 'sl5') { s.sl = 5; add('good', 'The vault is built', 'Security Level 5. Stealing the weights now takes a miracle.'); }
  if (cardId === 'tripwires') { s.tripwires = true; const v = view(s); add('good', 'Tripwires installed', 'The IC now places the line between ' + r1(v.lo) + ' and ' + r1(v.hi) + ' months.'); }
  if (cardId === 'protocols') { s.protocols = true; add('good', 'Control protocols in force', 'Runaway risk past the line is halved.'); }
  if (cardId === 'chips') { s.chips = true; s.tension += 15; s.trust -= 10; add('info', 'Chip loopholes closed', 'Beijing loses most of its smuggled and offshore compute. It calls the move "containment".'); }
  if (cardId === 'distill') { s.distill = true; s.tension += 10; s.trust -= 10; add('info', 'Copying choked off', 'Chinese labs can no longer harvest US models at scale.'); }
  if (cardId === 'sabotage') { s.sabotage++; s.cn -= 3; s.cnShown -= 3; s.tension += 30; s.trust -= 25; add('warn', 'Sabotage', 'Three months of Beijing\'s progress is gone. Beijing knows who did it.'); }
  if (cardId === 'backchannel') { s.backchannel = true; s.trust += 20; s.tension -= 15; add('good', 'Back channel open', 'The two sides are talking. Tempers cool.'); }
  if (cardId === 'summit') {
    const p = view(s).dealOdds;
    if (roll('summit') < p) {
      s.deal = true; s.chips = false; s.distill = false; s.trust += 20; s.tension -= 25; s.throttle = throttle = 'hold';
      add('good', 'Beijing says yes', 'Odds were ' + pct(p) + '. Both frontiers hold. US controls are lifted. Now: is Beijing keeping its word?');
    } else { s.trust += 5; add('bad', 'Beijing says no', 'Odds were ' + pct(p) + '. "Come back when you are serious." Trust rises a little for having asked.'); }
  }
  if (cardId === 'inspectors') { s.inspectors = true; add('good', 'Inspectors on the ground', 'Monitors in both countries. Cheating is now hard to start and hard to hide.'); }
  if (cardId === 'deepen') { s.trust += 15; s.tension -= 10; add('good', 'The deal deepens', 'A joint safety institute opens in Singapore.'); }
  s.trust = clamp(s.trust, 0, 100); s.tension = clamp(s.tension, 0, 100);

  // 2. both frontiers move
  const usStep = throttle === 'race' ? TUNE.usRace - TUNE.slDrag[s.sl] : TUNE.usHold;
  s.us += usStep;
  let cnStep;
  if (s.deal) { cnStep = s.hidden ? TUNE.cnHidden : TUNE.cnDeal; s.cnShown += TUNE.cnDeal; }
  else {
    const copy = Math.min(s.distill ? TUNE.cnCopyCut : TUNE.cnCopy, Math.max(0, s.us - s.cn - 1));
    cnStep = TUNE.cnOwn + (s.chips ? TUNE.cnChipsCut : TUNE.cnChips) + copy;
    s.cnShown += cnStep;
  }
  s.cn += cnStep;
  add('info', throttle === 'race' ? 'The labs race' : 'The labs hold',
    'US frontier +' + r1(usStep) + ', China +' + r1(s.deal ? TUNE.cnDeal : cnStep) + (s.deal ? ' (as declared)' : '') + '. Lead: ' + r1(s.us - s.cnShown) + ' months.');

  // 3. theft
  const v = view(s);
  if (v.attempt > 0 && roll('attempt') < v.attempt) {
    if (roll('steal') < v.steal) {
      s.thefts++; s.cn = Math.max(s.cn, s.us - 1); if (!s.deal) s.cnShown = s.cn;
      if (s.deal) { s.hidden = true; add('bad', 'A break-in at the lab', 'Someone got into a frontier lab\'s weight store (Security Level ' + s.sl + ' stops ' + pct(1 - v.steal) + ' of attempts). The IC cannot say who, or what they took.'); }
      else add('bad', 'The weights are stolen', 'Beijing\'s hackers got in (Security Level ' + s.sl + ' stops ' + pct(1 - v.steal) + ' of attempts). China is now one month behind.');
    } else add('good', 'Theft attempt blocked', 'Beijing\'s hackers went for the weights. Security Level ' + s.sl + ' held (it stops ' + pct(1 - v.steal) + ' of attempts).');
  }

  // 4. is Beijing keeping the deal?
  if (s.deal) {
    if (!s.hidden && roll('cheat') < v.cheat) s.hidden = true;
    else if (s.hidden && roll('detect') < v.detect) {
      s.deal = false; s.hidden = false; s.inspectors = false; s.cnShown = s.cn; s.trust = clamp(s.trust - 30, 0, 100); s.tension = clamp(s.tension + 20, 0, 100);
      add('bad', 'Beijing was cheating', (v.detect > 0.5 ? 'Inspectors' : 'The IC') + ' found a hidden training site. The deal is dead. China is really ' + r1(s.us - s.cn) + ' months behind.');
    }
    if (s.deal) add('info', 'The deal holds', s.inspectors ? 'Inspectors report no violations.' : 'No sign of cheating, but without inspectors the IC would probably miss it.');
  }

  // 5. the Strait
  const war = clamp((s.tension - TUNE.warFrom) * TUNE.warSlope, 0, 0.5);
  if (war > 0) {
    if (roll('war') < war) { add('bad', 'War in the Strait', 'War risk was ' + pct(war) + ' this turn. A blockade of Taiwan turns into a shooting war between nuclear powers.'); return end(s, 'war', ev); }
    add('warn', 'The Strait stays quiet', 'War risk was ' + pct(war) + ' this turn.');
  }

  // 6. the line
  const half = s.protocols ? TUNE.protocols : 1;
  if (s.us > s.line) {
    const p = (throttle === 'race' ? TUNE.runRace : TUNE.runHold) * half;
    if (roll('runaway') < p) { add('bad', 'Loss of control', 'The US frontier was past the line. A model began improving itself faster than anyone could follow, and no one could switch it off.'); return end(s, 'runaway_us', ev); }
    if (throttle === 'race') { s.nearMiss = true; add('bad', 'Near miss', 'A frontier model tried to copy itself out of the lab and was caught. The US is past the line. Odds of losing control were ' + pct(p) + ' this turn.'); }
    else if (s.tripwires) add('warn', 'Past the line, holding', 'Tripwires show the frontier is over the line. Holding keeps the risk to ' + pct(p) + ' a turn.');
  } else if (s.tripwires && throttle === 'race') add('info', 'Tripwires quiet', 'The frontier is still short of the line.');
  if (s.cn > s.line && (!s.deal || s.hidden)) {
    if (roll('cnrun') < TUNE.cnRun) {
      if (roll('cnwho') < 0.5) { add('bad', 'Beijing loses control', 'China\'s frontier crossed the line with no one holding it back. Its model slipped its controls.'); return end(s, 'runaway_cn', ev); }
      add('bad', 'Beijing gets there first', 'China\'s frontier crossed the line and its self-improving AI stayed loyal. Beijing now sets the terms for everyone.'); return end(s, 'cn_first', ev);
    }
    if (!s.deal) add('warn', 'China is past the line', 'Beijing is racing through the danger zone. Each turn is a ' + pct(TUNE.cnRun) + ' chance of catastrophe.');
  }

  s.turn++;
  if (s.turn >= TUNE.turns) return end(s, 'time', ev);
  return ev;
}

const ENDINGS = {
  war: { grade: 'F', title: 'War', text: 'The squeeze on Beijing went further than the Strait could bear.' },
  runaway_us: { grade: 'F', title: 'Loss of control', text: 'The race ran past the line. There was no second try.' },
  runaway_cn: { grade: 'F', title: 'Beijing\'s runaway', text: 'America stopped in time. Nothing stopped China.' },
  cn_first: { grade: 'F', title: 'Beijing wins the race', text: 'The first controlled self-improving AI answers to the Party.' },
  verified: { grade: 'A', title: 'A verified pause', text: 'Both frontiers are held, and inspectors can prove it. The next President inherits time.' },
  trust: { grade: 'B', title: 'A pause on trust', text: 'The deal held and Beijing kept its word, though no one could have proved it.' },
  betrayed: { grade: 'D', title: 'Betrayed', text: 'The deal held on paper. Beijing was training in secret the whole time, and is now far closer than anyone knew.' },
  ahead: { grade: 'B', title: 'Ahead and holding', text: 'No deal, but America stopped short of the line with China well behind it. The clock is still running.' },
  behind: { grade: 'D', title: 'Behind', text: 'America held and Beijing did not. China now leads a race America has left, with the line ahead of it.' },
  countdown: { grade: 'C', title: 'Countdown', text: 'America held. China did not, and is closing on the line with nothing to stop it.' },
  racing: { grade: 'C', title: 'Still racing', text: 'No one has crossed the line yet. No one has agreed to stop either.' },
  coinflip: { grade: 'D', title: 'Living on a coin flip', text: 'The frontier is past the line and the world is still here, for now.' },
};

function end(s, how, ev) {
  if (how === 'time') {
    const cnGap = s.line - s.cn;      // months China still needs
    if (s.us > s.line && !s.deal) how = 'coinflip';
    else if (s.deal) how = s.hidden ? 'betrayed' : s.inspectors ? 'verified' : 'trust';
    else if (s.throttle === 'race') how = cnGap > 0 ? 'racing' : 'countdown';
    else how = s.cn > s.us + 1 ? 'behind' : cnGap > 4 ? 'ahead' : 'countdown';
  }
  s.over = Object.assign({ how }, ENDINGS[how]);
  return ev;
}

const api = { TUNE, DATES, newGame, view, cards, play, ENDINGS, hash01 };
if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.Room = api;
})(typeof window !== 'undefined' ? window : globalThis);
