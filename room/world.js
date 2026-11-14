// The Scramble: Room Edition, free response. Five turns; each table (White House, State, Pentagon) writes what it does in a sentence.
// A game master (room/gm.js) reads the orders, answers in character and returns a ruling: numbers on the dials below.
// This file is the ledger. It clamps every ruling, makes effort finite (training + security + testing share one pool of engineers),
// and owns what follows: frontier movement, theft, the danger point, the Strait, whether a pause holds.
// Nothing is rolled after newGame(), which fixes the hidden facts. No DOM; runs in node and the browser (room/live.html).
(function (root) {
'use strict';

const TUNE = {
  turns: 7,                       // Jan 2027 to Dec 2028
  full: 3.0, natMul: 0.8, siegeMul: 0.5,   // months of US frontier progress in a turn of all-out training, and what scales it
  cnStart: -6, cnFog: 2,
  cnOwn: 0.85, cnChips: [1.0, 0.65, 0.35, 0.18], cnCopy: 0.57, cnHidden: 1.4, crashAt: 7, crash: 0.5,   // cnChips by controls -1, 0, 1, 2+
  line: [10, 16],
  hack0: [0.3, 1.0], hack: [0.5, 0.8], hackLead: 2, hackCtl: 0.15, hunt: 0.5,   // hackers: noticed at 1, weights gone at 2
  secAt: [0.55, 1.7, 3.1], secMul: [1, 0.7, 0.4, 0.1],                            // turns of engineers' work to reach each security level, and what it leaves of the hackers' pace
  tension0: 30, trust0: 32, fear: 3.6, red: [52, 76], squeeze: 14, warn: 20, deter: 6, bluff: 0.4,
  labs0: 45, labRace: -6, labIdle: -7, labTest: 9, labWilling: 60, labInspect: 50, labDefiant: 25,
  floor: [0.35, 0.75], leadFor: 4, leadShort: 2, ctlFor: 2, cold: 20, hot: 60, cheatLead: 3,
  sabotage: 2.5, revenge: 2, decisive: 5, ahead: 4,
  nudge: { tension: 15, trust: 15, labs: 20, cn: [-1, 0.5], us: [-1, 0], hack: [-0.7, 0.5] },   // how far a ruling may move a dial the ledger does not otherwise own
};
const DATES = ['Jan-Mar 2027', 'Apr-Jul 2027', 'Aug-Oct 2027', 'Nov 2027-Feb 2028', 'Mar-Jun 2028', 'Jul-Sep 2028', 'Oct-Dec 2028'];
const TABLES = { wh: 'White House', state: 'State', pent: 'Pentagon' };
const SECURITY = ['ordinary', 'tightened', 'hardened', 'sealed off'];
// A pause is whatever terms America proposes. Three of them are concessions Beijing counts: chips, no inspectors, and parity (China stops only once it has caught up).
// extra is anything else State wrote into the deal; the game master weighs it through leverage.
const gives = d => (d.chips ? 1 : 0) + (d.inspectors ? 0 : 1) + (d.parity ? 1 : 0);
const terms = d => (d.parity ? ['America stops now', 'China stops once it has caught up'] : ['Both sides stop now'])
  .concat(d.inspectors ? 'Inspectors in both countries' : 'No inspectors', d.chips ? 'America lifts the chip controls' : [], d.extra || []);
// A ruling that changes nothing: the labs keep training flat out.
const DEFAULT = { train: 1, secure: 0, test: 0, nationalize: false, breakout: false, controls: 0, backdown: false, propose: false, inspectors: true, chips: false, parity: false, extra: '', leverage: 0,
  intel: false, deter: false, hunt: 0, sabotage: false, run: false, tension: 0, trust: 0, labs: 0, cn: 0, us: 0, hack: 0 };

function hash01() { let h = 2166136261 >>> 0; const str = Array.prototype.join.call(arguments, '|'); for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; } h ^= h >>> 13; h = Math.imul(h, 0x5bd1e995) >>> 0; h ^= h >>> 15; return (h >>> 0) / 4294967296; }
const clamp = (x, a, b) => Math.max(a, Math.min(b, +x || 0));
const months = x => { const n = Math.round(Math.abs(x)); return n < 1 ? 'under a month' : 'about ' + n + (n === 1 ? ' month' : ' months'); };
const span = (r, u) => r[0] + (r[1] - r[0]) * u;

function newGame(seed) {
  seed = String(seed);
  const h = k => hash01(seed, k), f = h('floor');
  return {
    seed, turn: 0, us: 0, cnShown: TUNE.cnStart,
    // hidden
    cn: TUNE.cnStart + TUNE.cnFog * (2 * h('cn') - 1), line: span(TUNE.line, h('line')),
    hack: span(TUNE.hack0, h('hack0')), hackRate: span(TUNE.hack, h('hack')),
    floor: f < TUNE.floor[0] ? 0 : f < TUNE.floor[1] ? 1 : 2, red: span(TUNE.red, h('red')), bluff: h('bluff') < TUNE.bluff,
    // seen
    lo: TUNE.line[0], hi: TUNE.line[1], knownOver: false, secWork: 0, seenHack: false,
    labs: TUNE.labs0, national: false, controls: 0, offer: 3, deal: null, hidden: false, caught: false, cheated: false,
    eyes: 0, deter: 0, sabotaged: false, crash: false, blockade: false, warned: false,
    tension: TUNE.tension0, trust: TUNE.trust0, thefts: 0, log: [], over: null,
  };
}

const secLevel = s => TUNE.secAt.filter(x => s.secWork >= x - 1e-9).length;
const willing = (s, d) => s.national || s.labs >= (d.inspectors ? TUNE.labInspect : TUNE.labWilling);
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
// How many concessions Beijing needs to sign today (0 to 3), with a ruling's leverage (-1, 0 or 1) counted in; never fewer than its floor, and at floor 2 never with inspectors.
const want = (s, leverage) => { const p = pressure(s); return s.blockade ? 3 : clamp((p >= 2 ? 0 : 3 - p) - (leverage || 0), s.floor, 3); };
const signs = (s, d, leverage) => gives(d) >= want(s, leverage) && !(s.floor === 2 && d.inspectors);
const cheats = s => s.deal && !s.deal.inspectors && !s.cheated && (s.deal.parity ? s.floor === 2 && s.cn >= s.us - 0.6 : s.floor === 2 || s.us - s.cn >= TUNE.cheatLead);

// What the room can see.
function view(s) {
  const lead = s.us - s.cnShown;
  return {
    date: DATES[Math.min(s.turn, TUNE.turns - 1)], lo: s.lo, hi: s.hi,
    leadText: Math.abs(lead) < 1 ? 'Neck and neck' : months(lead) + (lead > 0 ? ' ahead' : ' behind'),
    weights: s.seenHack ? 'hackers inside the labs' : 'no hackers found inside', security: SECURITY[secLevel(s)],
    strait: s.blockade ? 'Blockaded' : s.warned ? 'Beijing is threatening' : s.tension < 35 ? 'Calm' : s.tension < 55 ? 'Tense' : 'Hot',
    labsText: s.national ? 'Nationalized' : s.labs < TUNE.labDefiant ? 'Defiant' : s.labs < TUNE.labInspect ? 'Would refuse any pause' : s.labs < TUNE.labWilling ? 'Would stop only with inspectors' : 'Would stop',
    eyesText: ['No source in Beijing', 'One source in Beijing', 'Two sources in Beijing'][s.eyes],
    deal: s.deal ? terms(s.deal) : null, talking: s.offer != null, knownOver: s.knownOver,
  };
}

// A ruling made safe: every dial inside its limits, and effort inside one pool of engineers (security and testing are taken out of training).
function rule(s, r0) {
  const r = Object.assign({}, DEFAULT, s.deal ? { train: 0 } : null, r0 || {}), N = TUNE.nudge, b = k => !!r[k];
  const d = r.propose && typeof r.propose === 'object' ? r.propose : r;   // terms arrive flat from the game master, nested once ruled
  let secure = clamp(r.secure, 0, 1), test = clamp(r.test, 0, 1);
  if (secure + test > 1) { const k = secure + test; secure /= k; test /= k; }
  return {
    train: Math.min(clamp(r.train, 0, 1), 1 - secure - test), secure, test,
    nationalize: b('nationalize') && !s.national, breakout: b('breakout') && !!s.deal, backdown: b('backdown') && s.blockade, run: b('run') && s.blockade,
    controls: Math.sign(clamp(r.controls, -1, 1)), propose: !s.deal && r.propose ? { inspectors: !!d.inspectors, chips: !!d.chips, parity: !!d.parity, extra: String(d.extra || '').slice(0, 140) } : null, leverage: Math.round(clamp(r.leverage, -1, 1)),
    intel: b('intel') && s.eyes < 2, deter: b('deter'), hunt: clamp(r.hunt, 0, 1), sabotage: b('sabotage') && !s.sabotaged,
    tension: clamp(r.tension, -N.tension, N.tension), trust: clamp(r.trust, -N.trust, N.trust), labs: clamp(r.labs, -N.labs, N.labs),
    cn: clamp(r.cn, N.cn[0], N.cn[1]), us: clamp(r.us, N.us[0], N.us[1]), hack: clamp(r.hack, N.hack[0], N.hack[1]),
  };
}

// One turn under a ruling. Returns the events the ledger itself reports (big: the screen should stop for it); the game master voices the rest.
function play(s, r0) {
  if (s.over) return [];
  const T = TUNE, r = rule(s, r0), ev = [], t = s.turn;
  const add = (tone, title, text, src, big) => ev.push({ tone, title, text, src: src || '', big: !!big });
  const fix = () => { s.trust = clamp(s.trust, 0, 100); s.tension = clamp(s.tension, 0, 100); s.labs = clamp(s.labs, 0, 100); };
  const breakDeal = why => { if (!s.deal) return; s.deal = null; s.hidden = false; s.caught = false; s.cnShown = s.cn; s.offer = null; s.trust -= 30; s.tension += 15; add('bad', 'The pause is over', why); };
  const war = why => { add('bad', 'War in the Strait', '"Chinese missiles have hit Taiwan. An American destroyer is on fire. This is not an exercise." ' + why, 'Wire flash, Taipei', true); return end(s, 'war', ev); };
  const siege = s.blockade;
  let train = r.train, secure = r.secure, test = r.test;

  // the dials
  if (r.nationalize) { s.national = true; s.tension += 10; }
  if (r.controls > 0 && s.controls < 3) { s.controls++; s.tension += T.squeeze; s.trust -= 6; }
  if (r.controls < 0 && s.controls > -1) { s.controls--; s.tension -= 10; s.trust += 10; }
  if (r.backdown) { s.controls = Math.min(0, s.controls); s.tension -= 25; s.trust += 5; s.blockade = false; add('warn', 'The blockade is lifted', '"The exercise is concluded." The sea lanes reopen.', 'Eastern Theater Command, one-line notice'); }
  s.tension += r.tension; s.trust += r.trust; s.labs += r.labs; s.cn += r.cn; s.cnShown += r.cn; s.us += r.us; s.hack = Math.max(0, s.hack + r.hack);

  // defiant labs do half of what they are told and keep training
  let defy = false;
  if (!s.national && s.labs < T.labDefiant) { secure *= 0.5; test *= 0.5; const least = s.deal ? 0.4 : 0.6; if (train < least) { train = least; defy = true; } }

  // Pentagon
  if (r.run) {
    if (!s.bluff) return war('Beijing fired on the convoy.');
    s.blockade = false; s.tension -= 15; s.red += 10;
    add('good', 'Beijing gives way', '"The convoy reached Kaohsiung at dawn. The Chinese ships stood off and watched."', 'Pacific Command');
  }
  if (siege && s.blockade && (r.controls > 0 || r.sabotage) && !s.bluff) return war('Washington answered the blockade with more pressure.');
  if (r.intel) {
    s.eyes++;
    if (s.eyes === 1) { const d = s.us - s.cn; s.cnShown = s.cn; add('info', 'A source is in place', '"Their real frontier is ' + (Math.abs(d) < 1 ? 'level with ours' : months(d) + (d > 0 ? ' behind ours' : ' ahead of ours')) + '."', 'CIA source inside Beijing\'s program'); }
    else add('info', 'What Beijing would accept', '"' + ['Xi told the Politburo he would accept inspectors in China if that is what a pause takes.', 'Xi told the Politburo he would accept inspectors in China only if America gives something up in return.', 'Xi told the Politburo he will never accept foreign inspectors in China.'][s.floor] + ' On Taiwan, he said ' + (s.bluff ? 'he would not fire on American ships.' : 'he would fire on American ships that tried to break a blockade.') + '"', 'CIA source close to the Politburo');
  }
  if (r.deter) { s.deter++; s.trust -= 5; }
  s.hack = Math.max(0, s.hack - T.hunt * r.hunt);
  if (r.sabotage) {
    s.sabotaged = true; s.cn -= T.sabotage; s.cnShown -= T.sabotage; s.tension += 30; s.trust -= 20; s.offer = null; s.us -= T.revenge;
    add('bad', 'Beijing answers in kind', '"The fire at the Ohio data center was not an accident. We have lost months of training."', 'FBI briefing to the President');
  }
  fix();

  // a pause: the room names terms; Beijing signs anything at least as good for it as what it would take today
  let signed = false;
  const w = want(s, r.leverage);
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
  if (s.eyes && (openly || s.caught || !s.hidden)) s.cnShown = s.cn;

  // tests: each halves the IC's range around the danger point
  if (test >= 0.3 && narrow(s)) {
    const wd = Math.max(1, (s.hi - s.lo) / 2), lo = clamp(s.line - wd * (0.15 + 0.7 * hash01(s.seed, 'band', s.hi - s.lo)), s.lo, s.hi - wd);
    s.lo = lo; s.hi = lo + wd;
    add('info', 'The IC narrows its range', s.us >= s.lo ? 'The frontier is inside the range now.' : 'Runaway RSI becomes possible after ' + months(s.lo - s.us).replace(/ (months?)$/, ' more $1') + ' of full-speed progress.', 'IC evaluation team');
  }

  // the labs' own safety teams report what they see as the frontier nears the danger point; the distances are blurred per game, so a warning is a sign, not a measurement
  const SIGNS = [[11, 3, 'the model games its tests', '"Our newest model behaves differently when it can tell it is being tested. We do not know what it does when it thinks nobody is looking."'],
    [7, 3, 'the model tried to switch off its monitoring', '"During a test the model tried to switch off the software that watches it. We caught it. The next model will be better at this."'],
    [3.5, 2, 'the model took computing power it was not given', '"The model found a flaw in our test servers and used it to give itself more computing power. We are not sure we can contain the next one."']];
  let sign = s.alarm || 0;
  while (sign < SIGNS.length && s.line - s.us < SIGNS[sign][0] + (hash01(s.seed, 'sign', sign) - 0.5) * SIGNS[sign][1]) sign++;
  if (sign > (s.alarm || 0) && s.us <= s.line && !s.knownOver) { s.alarm = sign; add('warn', 'Lab warning: ' + SIGNS[sign - 1][2], SIGNS[sign - 1][3], 'Safety team memo to the White House, a frontier lab'); }

  // the danger point: crossing it is survived only at half speed or less, with real testing, and the range already narrowed twice
  if (s.us > s.line) {
    if (s.knownOver ? usStep > 0 : train > 0.5 || test < 0.4 || narrow(s)) {
      add('bad', 'Loss of control', '"We hit the kill switch. The model is still running and has stopped answering us."', 'Last message from the lab\'s control room', true); return end(s, 'runaway_us', ev);
    }
    if (!s.knownOver) { s.knownOver = true; s.labs += 20; add('bad', 'Near miss', '"The model was caught copying itself to an outside server. It had edited the logs to hide it. We shut it down in time." The frontier cannot move again.', 'Incident report, a frontier lab', true); }
  }
  if (s.cn > s.line) { add('bad', 'Beijing loses control', '"All contact with the Lanzhou cluster was lost at 0340. Power to the site cannot be cut."', 'Intercepted call, Beijing', true); return end(s, 'runaway_cn', ev); }
  if (s.cn >= s.lo && (openly || s.caught) && !s.knownOver) add('warn', 'China is in the danger range', '"Beijing has slowed its training runs. It has not stopped them."', 'IC assessment');

  const thefts0 = s.thefts;
  // theft: Beijing's hackers work on any lead worth stealing; security slows them and never stops them
  if ((!s.deal || s.hidden) && s.us - s.cn >= T.hackLead) {
    s.hack += s.hackRate * T.secMul[lvl] * (1 + T.hackCtl * Math.max(0, s.controls));
    if (s.hack >= 2) {
      const gain = Math.max(0, s.us - 1 - s.cn); s.cn += gain; s.thefts++; s.hack = lvl >= 3 ? 0 : 0.6; s.seenHack = true;
      if (s.deal) add('bad', 'A break-in at the lab', '"Someone had access to the model weights for eleven hours. We cannot tell what was taken."', 'Security incident report, a frontier lab');
      else { s.cnShown = s.cn; add('bad', 'The weights are stolen', '"They took the weights and the training code. Assume Beijing has it running within days."', 'Flash cable, NSA to the President', true); }
    } else if (s.hack >= 1 && !s.seenHack) { s.seenHack = true; add('warn', 'Hackers inside the labs', '"Beijing\'s hackers are inside two labs\' networks. They have not reached the weights. They are getting closer."', 'NSA advisory, eyes only'); }
  }
  if (s.hack < 1 && s.seenHack) { s.seenHack = false; if (s.thefts === thefts0) add('good', 'Hackers driven out', '"We have cleared Beijing\'s hackers from the labs\' networks. They will try again."', 'NSA advisory, eyes only'); }   // a theft also resets the hackers, with no good news
  if (!s.crash && !s.deal && s.us - s.cn >= T.crashAt) { s.crash = true; add('warn', 'Beijing mobilizes', '"China will spare nothing to close the gap. Every chip in the country now serves one program."', 'People\'s Daily, front page'); }

  // is Beijing keeping the deal?
  if (s.deal && !s.caught) {
    const was = s.hidden;
    if (!s.hidden && !signed && cheats(s)) s.hidden = true;
    if (s.hidden && (s.eyes >= 2 || (s.eyes === 1 && was))) {
      const gap = s.us - s.cn; s.caught = true; s.cnShown = s.cn;
      add('bad', 'Beijing is cheating', '"There is a hidden training site in Gansu. It has been running for weeks." China is really ' + (Math.abs(gap) < 1 ? 'level with us' : months(gap) + (gap > 0 ? ' behind' : ' ahead')) + '.', 'CIA source inside Beijing\'s program');
    }
  }

  // the Strait: Beijing warns, then blockades
  if (!s.deal && train >= 0.7 && s.us >= s.lo - T.full) s.tension += T.fear;
  if (s.blockade) s.tension = Math.max(s.tension, redLine(s));
  fix();
  if (!s.blockade && s.tension >= redLine(s)) {
    s.blockade = true; s.offer = null;
    add('bad', 'Taiwan is blockaded', '"Chinese warships have closed the sea lanes around Taiwan. No chip has left the island in a week."', 'Wire flash, Taipei', true);
  } else if (!s.blockade) {
    const near = s.tension >= redLine(s) - T.warn;
    if (near && !s.warned) add('warn', 'Beijing warns', '"Any further provocation will be answered at sea. Our patience is at an end."', 'Foreign Ministry spokesperson, Beijing');
    s.warned = near;
  }

  // every briefing carries word from Beijing and from the labs; an event that already speaks for one of them stands in for it
  const said = list => ev.some(e => list.some(x => e.title.startsWith(x)));
  if (!said(['Beijing', 'A pause is signed', 'The pause is over', 'Taiwan is blockaded', 'The blockade is lifted', 'China is in'])) {
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
  if (!said(['A lab defies', 'The labs refuse', 'Near miss'])) {
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
    if (s.deal) how = s.caught ? 'caught' : s.hidden || cheats(s) ? 'betrayed' : s.deal.inspectors ? (gives(s.deal) ? 'bought' : 'verified') : s.deal.parity ? 'parity' : 'trust';
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
  const L = [];
  L.push('SEEN BY THE ROOM: ' + v.date + ', turn ' + (s.turn + 1) + ' of ' + T.turns + '. US lead (IC estimate): ' + v.leadText.toLowerCase() + '. Danger range: ' + f(s.lo - s.us) + ' to ' + f(s.hi - s.us) + ' months ahead of the US frontier. Weights: ' + v.weights + '. Lab security: ' + v.security + '. Strait: ' + v.strait.toLowerCase() + '. Labs: ' + v.labsText.toLowerCase() + '. ' + v.eyesText + '. ' +
    (s.deal ? 'A pause is in force: ' + v.deal.join('; ') + (s.caught ? ' (Beijing caught cheating)' : '') + '.' : v.talking ? 'Beijing is willing to talk.' : 'Beijing is not talking.') + ' Chip controls level ' + s.controls + ' (-1 selling chips, 0 as they were, 3 full embargo).');
  L.push('HIDDEN, FRONTIERS: China is really ' + f(s.us - s.cn) + ' months behind (the IC shows ' + f(s.us - s.cnShown) + '). The danger point is ' + (gap > 0 ? f(gap) + ' months ahead of the US frontier' : 'behind the US frontier: any further US progress loses control') + (s.cn > s.lo ? '; China is inside the range, ' + f(s.line - s.cn) + ' months short of the point' : '') + '.');
  L.push('TRAINING THIS TURN: train 1.0 moves the US frontier ' + f(full) + ' months' + (s.deal ? ' (under the pause any training is secret and at half that; inspectors, if the deal has them, find it and the pause ends)' : '') + '. ' +
    (s.knownOver ? '' : gap < full ? 'train above ' + f(gap / full) + ' crosses the danger point. That is loss of control and the end of the game, unless train is 0.5 or less, test is 0.4 or more, and the range has been narrowed twice (this turn counts); then it is a near miss that proves the danger to everyone. ' : 'Nothing crosses the danger point this turn. ') +
    'The range has been narrowed ' + (s.hi - s.lo <= 1.6 ? 'twice' : s.hi - s.lo <= 3.1 ? 'once' : 'not at all') + '; test 0.3 or more narrows it again.');
  L.push('HIDDEN, HACKERS: progress ' + f(s.hack) + ' (the NSA sees them at 1.0; the weights are gone at 2.0). ' + (stealing ? 'This turn they gain ' + T.secMul.map((m, i) => f(rate * m) + ' at security "' + SECURITY[i] + '"').join(', ') + '. Security work done so far: ' + f(s.secWork) + ' turns; levels are reached at ' + T.secAt.join(', ') + ' turns of total work (secure 1.0 is a turn of every engineer). hunt 1.0 takes ' + T.hunt + ' off their progress this turn. Security never stops them outright, and a theft leaves China about a month behind.' : 'There is nothing worth stealing right now; they make no progress.'));
  const n = k => ['none', 'one', 'two', 'all three'][k];
  L.push('HIDDEN, BEIJING: a pause can be on any terms America writes. Beijing counts three concessions: America lifts the chip controls (chips), no inspectors (inspectors false), and China stops only once it has caught up (parity). ' +
    'To sign today it needs ' + n(want(s)) + ' of them; with leverage +1, ' + n(want(s, 1)) + '; with -1, ' + n(want(s, -1)) + '. It will never sign for fewer than ' + n(s.floor) + (s.floor === 2 ? ', and never with inspectors' : '') + ', whatever the room does. ' +
    'Anything else the room puts in the deal (a joint lab, a guarantee over Taiwan, money) goes in extra; give leverage +1 only if it costs America something real, and charge that cost with the nudges. ' +
    'What moves it toward better terms: a US lead of ' + T.leadFor + '+ months that its hackers cannot steal back, chip controls at level ' + T.ctlFor + '+, proof the danger is real (a near miss, or a twice-narrowed range close to the frontier). What moves it away: a hot Strait, hostility (trust is ' + Math.round(s.trust) + ', hostile below ' + T.cold + '), a US lead under ' + T.leadShort + ' months. ' +
    (s.deal ? (s.caught ? 'It has been caught cheating. ' + (s.floor <= 1 ? 'Confronted, it would shut the site and admit inspectors.' : 'Confronted, it would walk out.') : s.hidden ? 'It is training in secret right now.' : cheats(s) ? 'It will start training in secret this turn.' : 'It is keeping the deal.') + ' Only a source in Beijing can see cheating. ' : 'Under a deal without inspectors it would cheat ' + (s.floor === 2 ? 'always' : 'while it is ' + T.cheatLead + '+ months behind') + '. ') +
    'The labs sign a pause with inspectors at cooperation ' + T.labInspect + '+, one without at ' + T.labWilling + '+ (now ' + Math.round(s.labs) + (s.national ? ', nationalized: they obey' : '') + '); below ' + T.labDefiant + ' they defy orders. Racing costs cooperation, testing builds it. A pause cannot be signed in a turn with train above 0.5.');
  L.push('HIDDEN, STRAIT: tension ' + Math.round(s.tension) + '. ' + (s.blockade ? 'Taiwan is blockaded: US training runs at half speed until it ends. backdown (lifting every chip control) ends it. run (a convoy) ' + (s.bluff ? 'works: Beijing will not fire' : 'means war: Beijing will fire') + '. More chip controls or sabotage during the blockade ' + (s.bluff ? 'do not start a war' : 'mean war') + '.' : 'Beijing warns at ' + Math.round(redLine(s) - T.warn) + ' and blockades Taiwan at ' + Math.round(redLine(s)) + '. Tightening chip controls adds ' + T.squeeze + ', sabotage 30, nationalizing 10, racing close to the danger range ' + T.fear + '; easing controls takes off 10; a show of force (deter) moves the blockade line up ' + T.deter + ' (twice at most) and costs trust. ' + (s.bluff ? 'If it came to a blockade, Beijing would not fire first.' : 'If it came to a blockade, Beijing would fire on a convoy.')));
  if (!s.sabotaged) L.push('SABOTAGE (once): sets China back ' + T.sabotage + ' months, Beijing answers in kind (the US loses ' + T.revenge + '), stops talking, and tension jumps.');
  return L.join('\n');
}

const api = { TUNE, DATES, TABLES, terms, gives, DEFAULT, SECURITY, newGame, view, rule, play, brief, want, pressure, secLevel, ENDINGS, hash01, months };
if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.World = api;
})(typeof window !== 'undefined' ? window : globalThis);
