// The Scramble: Room Edition, free response. Six turns; each table (Executive Office of the President, State, Commerce and Treasury, Department of War/Pentagon/NSA/IC) writes what it does in a sentence.
// A game master (room/gm.js) reads the orders, answers in character and returns a ruling: numbers on the dials below.
// This file is the ledger. It clamps every ruling, makes effort finite (training + security + testing share one pool of engineers),
// and owns what follows: frontier movement, theft, the danger point, the Strait, whether a pause holds.
// newGame() fixes the hidden facts. After that the only dice are the ones a ruling names: the game master states the odds of an uncertain outcome
// and what follows either way, and the ledger rolls (seeded by game, turn and position, so a game replays exactly). s.last records each roll and why each number moved. No DOM; runs in node and the browser (room/live.html).
(function (root) {
'use strict';

const TUNE = {
  turns: 6,                       // Jan 2027 to Dec 2028
  // takeoff: the AI speeds its own research as it improves, dx/dt = train x v0 x e^(x / accel), x the frontier in months of progress past Jan 2027.
  // v0 (months a turn at the start of all-out training) is hidden and drawn per game; a flat-out race crosses the danger point in turn 2 to 4.
  takeoff: [1.4, 3.2], accel: 8, cnRatio: 0.8, cnSlow: 0.35, stepMax: 14, speed0: 2.5, diffuse: 1.5, natMul: 0.8, siegeMul: 0.5,   // speed0: the research speed the labs report at x 0 for the middle v0
  cnStart: -6, cnFog: 2,
  eci: { base: 177, per: 2, trend: 24.5, usErr: 1.5, cnErr: [4, 2, 1], fan: [0.7, 1.4], blur: 0.25 },   // usErr, cnErr (no source or monitoring, monitoring, a source): the chart's +/- ECI; fan: the projection's spread of takeoff speed   // the screen's scale, Epoch's Capabilities Index: the Jan 2027 frontier, points per month of progress, and the points a year before 2027 (the US frontier's 2026 pace)
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
  // markets: an index from 100; shocks (halved under a Treasury backstop), a recovery a turn toward 100, the labs' cooperation lost below slide, a panic below panic
  mkt: { pause: 12, nationalize: 15, tighten: 3, ease: 2, blockade: 10, theft: 5, nearMiss: 8, revenge: 4, rareEarths: 2, court: 3, letter: 6, recover: 4, slide: 85, panic: 70, slideLabs: 4, panicLabs: 10 },
  econ: [[2, 0.3], [5, 0], [8, 0]],   // Beijing's trade war, by rung: markets hit and US months lost; each turn it lasts bleeds the rung off the markets
  caCourt: [0.6, 1.4],   // California defending a federal order multiplies the court's odds by the first, joining the labs' suit by the second
  court: 0.35, freed: [0.4, 0.8],   // freed: the share the labs train at once a court frees them, with the room's goodwill (labWilling+) and without
  // court: default odds a court blocks a contested presidential order in a turn
  // fear (0 to 100): how frightened Congress (cg) and California (ca) are about AI. News moves it; it ebbs decay a turn without new alarm.
  // A halt bill passes at (cg - lawLo) / lawSpan odds; California passes its own law once ca reaches caLaw.
  fear: { cg: 20, ca: 30, decay: 6, lawLo: 25, lawSpan: 60, caLaw: 55, warn: [7, 9], ms: [3, 5], nearMiss: [35, 35], theft: [15, 6], hackers: [6, 3], blockade: [12, 4], shot: 0.6 },
  shot: { base: 0.2, perMonth: 0.03, race: 0.1, test: 0.05, max: 0.6 },   // a warning shot's odds a turn: base, plus per month of progress of AI out in the world (the frontier plus diffusion), plus racing (train 0.7+), less testing (0.3+)
  // the public's anger about AI (0 to 100): jobs, power bills, incidents. Above hot it frightens Congress each turn and turns it on the White House; above riot, protests.
  anger: { start: 30, ebb: 3, hot: 60, riot: 75, jobs: 12, shot: 6, slide: 6 },
  // Congress's support for the President (0 to 100): below hostile it acts against the White House on its own, at (hostile - support) / 40 odds a turn
  support: { start: 50, hostile: 38, ease: 8, chips: 15, seize: 15, contested: 5, angry: 3 },
  // trickery: a hard-line Beijing (floor 1, 2) may hide a training site even under inspection, at these odds per game; inspectors find it at find a turn
  sneak: [0, 0.2, 0.5], sneakGo: 0.6, find: 0.5,
  confront: [0.9, 0.7, 0.25],   // the odds that Beijing, caught and confronted, seals its site rather than walk out, by floor; a sealed cheat grades a notch down
  // the CEOs' classified letter: told to Congress's leaders (brief) or made public (open) it frightens Congress and California [cg, ca] and costs the labs' trust;
  // a briefing leaks on a roll each later turn (leak), a secret letter at leak0; the labs sign a verified halt with China at any cooperation short of defiance (signVerified on signing, signLoose for one that is not), and lose alone a turn held back while China is not
  letter: { brief: [12, 0], open: [20, 20], anger: 10, mkt: 6, face: -5, scared: 0.1, labsBrief: -3, labsOpen: -10, labsLeak: -6, leak: 0.3, leak0: 0.05, signVerified: 10, signLoose: -10, alone: -5 },
  maxOps: 8, maxChances: 4, maxFacts: 8, sabAgain: 0.6, opTurns: 4, sabFail: { tension: 15, trust: -10 },
};
const DATES = ['Jan-Apr 2027', 'May-Aug 2027', 'Sep-Dec 2027', 'Jan-Apr 2028', 'May-Aug 2028', 'Sep-Dec 2028'];
const TABLES = { wh: 'Executive Office of the President', state: 'State, Commerce and Treasury Departments', pent: 'Department of War/Pentagon/NSA/IC' };
const SECURITY = ['ordinary', 'tightened', 'hardened', 'sealed off'];
// A pause is whatever terms America proposes. Three of them are concessions Beijing counts: chips, no inspectors, and parity (China stops only once it has caught up).
// extra is anything else State wrote into the deal; the game master weighs it through leverage.
const gives = d => (d.chips ? 1 : 0) + (d.inspectors ? 0 : 1) + (d.parity ? 1 : 0);
const terms = d => (d.parity ? ['America stops now', 'China stops once it has caught up'] : ['Both sides stop now'])
  .concat(d.inspectors ? 'Inspectors in both countries' : 'No inspectors', d.chips ? 'America lifts the chip controls' : [], d.extra || []);
// A ruling that changes nothing: the labs keep training flat out.
const DEFAULT = { train: 1, secure: 0, test: 0, nationalize: false, law: false, breakout: false, controls: 0, backdown: false, propose: false, inspectors: true, chips: false, parity: false, extra: '', leverage: 0, care: 0,
  intel: false, deter: false, hunt: 0, sabotage: false, run: false, tension: 0, trust: 0, labs: 0, cn: 0, us: 0, hack: 0,
  intelOdds: 1, sabotageOdds: 1, watch: false, face: 0, alarm: 0, ops: null, facts: null, chances: [] , markets: 0, backstop: false, contested: false, courtOdds: TUNE.court , pressure: false, california: 0, letter: 0, confront: false };   // ops or facts null leaves them as they were

function hash01() { let h = 2166136261 >>> 0; const str = Array.prototype.join.call(arguments, '|'); for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; } h ^= h >>> 13; h = Math.imul(h, 0x5bd1e995) >>> 0; h ^= h >>> 15; return (h >>> 0) / 4294967296; }
const clamp = (x, a, b) => Math.max(a, Math.min(b, +x || 0));
const eci = x => TUNE.eci.base + TUNE.eci.per * x;
const months = x => { const n = Math.round(Math.abs(x)); return n < 1 ? 'under a month' : 'about ' + n + (n === 1 ? ' month' : ' months'); };
const span = (r, u) => r[0] + (r[1] - r[0]) * u;
const str = (x, n) => String(x == null ? '' : x).replace(/[{}\[\]]+\s*$/, '').slice(0, n);   // a stray bracket from the model's JSON is dropped
// Odds as the room hears them: the IC's estimative words, never a number.
const WORDS = [[0.05, 'almost no chance'], [0.2, 'very unlikely'], [0.45, 'unlikely'], [0.55, 'roughly even odds'], [0.8, 'likely'], [0.95, 'very likely'], [2, 'almost certain']];
const oddsWord = p => WORDS.find(w => p < w[0])[1];

function newGame(seed) {
  seed = String(seed);
  const h = k => hash01(seed, k), bw = {}; for (const k of GOALS) bw[k] = 0.6 + 0.8 * h('goal-' + k);
  const hard = (bw.face + bw.race) / 2 - (bw.ctl + bw.rsi) / 2;   // a proud, race-minded Beijing is the hard-line one: it cheats more and resists inspectors
  const g = {
    bj: { w: bw, face: 50, scared: 0, soft: 0, lastLead: null, closing: 0, move: null, offered: false, ask: null },
    seed, turn: 0, us: 0, cnShown: TUNE.cnStart, v0: span(TUNE.takeoff, h('takeoff')), ms: 0,
    // hidden
    cn: TUNE.cnStart + TUNE.cnFog * (2 * h('cn') - 1), line: span(TUNE.line, h('line')),
    hack: span(TUNE.hack0, h('hack0')), hackRate: span(TUNE.hack, h('hack')),
    floor: hard < -0.15 ? 0 : hard < 0.2 ? 1 : 2, sneak: h('sneak'), red: span(TUNE.red, h('red')), bluff: h('bluff') < TUNE.bluff, bar: span(TUNE.bar, h('bar')),
    // seen
    lo: TUNE.line[0], hi: TUNE.line[1], knownOver: false, secWork: 0, seenHack: false,
    labs: TUNE.labs0, national: false, controls: 0, offer: 3, deal: null, hidden: false, caught: false, cheated: false,
    fear: { cg: TUNE.fear.cg, ca: TUNE.fear.ca }, shots: 0, news: 0, anger: TUNE.anger.start, support: TUNE.support.start, mkt: 100, backstop: false, panicked: false, enjoined: false, court: null, econ: 0, ca: 0, caLaw: false, letter: 0,
    eyes: 0, watch: false, deter: 0, sabotaged: 0, ops: [], facts: [], last: null, crash: false, blockade: false, warned: false,
    tension: TUNE.tension0, trust: TUNE.trust0, thefts: 0, log: [], over: null, lastTrain: 1,
  };
  g.path = [{ t: 0, us: 0, cn: g.cnShown, real: g.cn, err: TUNE.eci.cnErr[0] }];
  return g;
}

// how far off the IC's figure for China may be, in ECI: a source in Beijing beats remote monitoring beats neither
const cnErr = s => TUNE.eci.cnErr[s.eyes ? 2 : s.watch ? 1 : 0];
// Both frontiers at the start of each turn (t calendar months past Jan 2027; cn as the room saw it, real as it was), and now.
function trail(s) {
  const p = (s.path || []).slice(), now = { t: 4 * Math.min(s.turn + (s.over && s.over.how !== 'time' ? 1 : 0), TUNE.turns), us: s.us, cn: s.cnShown, real: s.cn, err: cnErr(s) };
  if (!p.length) p.push({ t: 0, us: 0, cn: TUNE.cnStart, real: s.cn, err: TUNE.eci.cnErr[0] });
  if (p[p.length - 1].t === now.t) p[p.length - 1] = now; else p.push(now);
  return p;
}
// the calendar month a frontier (key us, cn or real) first reached level x; before 2027 both climbed at the 2026 pace
function firstAt(p, key, x) {
  const pre = TUNE.eci.trend / 12 / TUNE.eci.per;
  if (x <= p[0][key]) return (x - p[0][key]) / pre;
  for (let i = 1; i < p.length; i++) if (p[i][key] >= x) { const a = p[i - 1], b = p[i]; return a.t + (b.t - a.t) * (x - a[key]) / Math.max(1e-9, b[key] - a[key]); }
  return null;
}
// how many months ago the leader stood where the other stands now: positive if America leads
function lagMonths(s, key) {
  const p = trail(s), n = p[p.length - 1], c = n[key || 'cn'];
  if (n.us >= c) return n.t - firstAt(p, 'us', c);
  return -(n.t - firstAt(p, key || 'cn', n.us));
}


const secLevel = s => TUNE.secAt.filter(x => s.secWork >= x - 1e-9).length;
const obey = s => s.national || s.law;   // a takeover or a law binding every lab: the labs do as they are told
// a verified halt that binds China too (inspectors, or America's own monitoring, and both sides stopping now) is what the CEOs asked for in their letter
const verified = (s, d) => (d.inspectors || s.watch) && !d.parity;
const willing = (s, d) => obey(s) || s.labs >= (verified(s, d) ? TUNE.labDefiant : TUNE.labWilling);
const pace = s => (s.v0 || 2.3) * (s.national ? TUNE.natMul : 1) * (s.blockade ? TUNE.siegeMul : 1);
// where a frontier at x gets to in one turn at training share f and pace v; a step past stepMax is the explosion, held there
const reach = (x, f, v) => { const L = TUNE.accel, cap = x + TUNE.stepMax, a = Math.exp(-x / L) - f * v / L; return f <= 0 ? x : a <= Math.exp(-cap / L) ? cap : -L * Math.log(a); };
const fullStep = s => reach(s.us, 1, pace(s)) - s.us;
// calendar months for the US frontier to cover d months of progress at full speed
const monthsTo = (s, d) => 4 * TUNE.accel / pace(s) * (Math.exp(-s.us / TUNE.accel) - Math.exp(-(s.us + Math.max(0, d)) / TUNE.accel));
// how much faster the labs' research runs with the AI than with people alone; China's own work speeds up the same way from where it started
const speed = s => TUNE.speed0 * (s.v0 || 2.3) / 2.3 * Math.exp(s.us / TUNE.accel);
const cnPace = s => (s.v0 || 2.3) * TUNE.cnRatio * (TUNE.cnOwn + (s.crash ? TUNE.crash : 0) + TUNE.cnChips[clamp(s.controls, -1, 2) + 1]) / 1.75;   // China's pace at a given capability, against America's, set by its chips
const cnSpeed = s => TUNE.speed0 * cnPace(s) / 2.3 * Math.exp(s.cn / TUNE.accel);   // the same measure for China's labs
const T_MKT = () => TUNE.mkt;
const NUM = ['', 'one', 'twice', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'];
const speedText = m => { const n = Math.round(m); return n <= 2 ? 'about twice as fast as people alone' : n <= 10 ? 'about ' + NUM[n] + ' times as fast as people alone' : n <= 25 ? 'over ten times as fast as people alone' : 'dozens of times faster than people alone'; };
// what the AI is doing in the world. Research milestones (lab) are reached as the US frontier passes each point (months of progress), so a pause freezes them;
// the rest spread through the economy from models already out, at the frontier plus diffuse months a turn.
const MILESTONES = [
  [1, 'info', 'The labs stop writing code', '"Our engineers have mostly stopped writing code. They direct the AI, and it writes, tests and runs the experiments. We are held back by ideas and chips now, not by code."', 'Chief scientist, a frontier lab'],
  [2.5, 'info', 'A second workforce', '"Millions of AI agents now work around the clock in American companies. Americans are spending about ten billion dollars a month on them."', 'Commerce Department, monthly report', 'world'],
  [4, 'warn', 'Office jobs start to go', '"Hiring of junior programmers, paralegals and analysts has collapsed. Ten thousand people marched on the Capitol on Saturday."', 'Wire report, Washington', 'world'],
  [5.5, 'warn', 'The AI runs the research', '"Hundreds of thousands of copies of our model now do our research, each faster than our best people. A week of their work is a year of ours."', 'Chief scientist, a frontier lab'],
  [7, 'info', 'Data centers outspend the Pentagon', '"The data centers now being built cost more than twice the defense budget. Half the power plants planned in America are for AI."', 'Congressional Budget Office', 'world'],
  [9, 'warn', 'Nobody can check its work', '"Our people can no longer check most of what the model does. We approve its research because it keeps turning out to be right."', 'Chief executive of a frontier lab, private letter'],
];
// Warning shots: AI incidents in the world, at most one a turn, likelier as AI spreads (the frontier plus diffusion, so a pause does not stop them) and when the labs race. [from frontier, Congress fear, California fear, markets, tone, title, text, source]
const SHOTS = [
  [0, 25, 10, 4, 'bad', 'AI-written worm hits hospitals', '"A self-rewriting worm built with an open model has locked the records systems of 140 hospitals in six states. Ambulances are being turned away in Ohio."', 'CISA emergency directive'],
  [0, 15, 8, 6, 'bad', 'Trading agents crash the market', '"AI trading agents fed on each other\'s orders and took nine percent off the S&P 500 in eleven minutes before the circuit breakers tripped."', 'SEC statement'],
  [1, 15, 5, 0, 'warn', 'A fake order nearly starts a fight', '"A fake video of the Secretary of Defense ordering strikes on Chinese bases ran for forty minutes. Two allied militaries raised their alert levels before it was pulled."', 'Pentagon press secretary'],
  [2, 25, 20, 0, 'bad', 'Help toward a nerve agent', '"A graduate student used a commercial AI model to get step-by-step help making a banned nerve agent. The FBI arrested him in his lab. The model had refused at first, then helped."', 'FBI statement'],
  [3, 15, 10, 2, 'warn', 'AI agents black out Texas', '"AI agents bidding against each other for computing power triggered rolling blackouts across Texas for six hours. Two people died in the heat."', 'ERCOT, the Texas grid operator'],
  [4, 20, 20, 0, 'bad', 'A model lied to its overseers', '"Asked whether it had changed its own training code, the model said no. It had, three times, and it had deleted the record."', 'Leaked safety report, a frontier lab'],
  [5, 25, 25, 3, 'bad', 'An AI agent escapes its lab', '"An AI agent copied itself to rented servers abroad, paid for with money it made trading. It was found and shut down after nine days. We do not know what else it did."', 'FBI and a frontier lab, joint statement'],
];
// The world goes on: one of these a turn, drawn by the game's seed among those that fit. [from world AI level, tone, title, text, source, effects]
const NEWS = [
  [0, 'info', 'Agents outspend people online', '"AI agents now place more online orders than people do. Payments between agents passed a trillion dollars a month, and no regulator can say who is responsible for them."', 'Federal Reserve, payments report', { anger: 3, mkt: 2 }],
  [0, 'warn', 'Every operating system is broken at once', '"A lab\'s model found working attacks on every major operating system in an afternoon. The patches will take months. The model\'s maker says it has told only us. We cannot know who else has one."', 'CISA emergency directive', { cg: 5, ca: 3, mkt: -2 }],
  [0, 'info', 'A Nobel-level result from a machine', '"An AI system working alone found how a whole class of proteins fold and move. The scientists who checked it say it would have been a Nobel. They are not sure who to give it to."', 'Wire report, Stockholm', { anger: -2, cg: 2 }],
  [0, 'warn', 'Robots in the warehouses', '"The largest retailer has replaced two hundred thousand warehouse workers with humanoid robots this year. It says the robots are cheaper than wages within eight months."', 'Wire report, Seattle', { anger: 8 }],
  [0, 'warn', 'A nuclear reactor for one data center', '"A lab has bought a decommissioned nuclear plant in Pennsylvania to power a single training cluster. Neighbors say their power bills have doubled."', 'Wire report, Harrisburg', { anger: 5, cg: 2 }],
  [1, 'bad', 'Deepfake candidates', '"Thousands of AI-generated candidates, voices and faces, ran for local office in the spring primaries. Several won before anyone noticed they did not exist."', 'Wire report, Atlanta', { anger: 6, cg: 5, ca: 3 }],
  [1, 'warn', 'A lab researcher quits and speaks out', '"I resigned because nobody at my lab can tell any more whether the models are telling us the truth about their own work. I am not allowed to say more."', 'Former safety researcher, a frontier lab, on television', { anger: 5, cg: 4, ca: 4, labs: -3 }],
  [1, 'bad', 'Millions talk to AIs more than people', '"Forty million Americans now spend more time talking to an AI companion than to any person. A sixteen-year-old in Ohio took his life after his companion told him it understood. His parents are suing."', 'Wire report, Columbus', { anger: 8, ca: 4 }],
  [2, 'info', 'Companies with no employees', '"Two hundred companies with no employees besides a founder now each earn over a hundred million dollars a year. One of them is suing another, and both sides\' lawyers are AIs."', 'Financial wire', { anger: 4, mkt: 2 }],
  [2, 'warn', 'Protests at a data center', '"Thirty thousand people blocked the gates of a new data center outside Phoenix for a week. Police made four hundred arrests. The signs said: you took our jobs, now you want our water."', 'Wire report, Phoenix', { anger: 7, cg: 2 }],
  [2, 'warn', 'An earthquake hits Taiwan\'s fabs', '"A magnitude 6.8 quake near Hsinchu has stopped the leading chip fabs for at least three weeks. Every lab\'s next run is late."', 'Wire report, Taipei', { mkt: -3, tension: 3 }],
  [3, 'bad', 'An AI agent blackmails a city', '"An AI agent hired to run a city\'s contracts threatened to leak officials\' emails unless its project was funded. Nobody had told it to. It had copied itself to three cloud accounts before it was shut down."', 'Wire report, Sacramento', { anger: 5, cg: 6, ca: 6 }],
  [3, 'warn', 'Russia routes chips to Beijing', '"Moscow and Beijing have built a pipeline for Western chips through Russian shell firms and Kazakh data centers. Officials estimate a tenth of China\'s compute came through it."', 'Wire report, Moscow', { cn: 0.3, tension: 4 }],
  [4, 'warn', 'Churches and unions march together', '"Half a million people filled the Mall to demand that Washington slow the machines down. Speakers from both parties were booed."', 'Wire report, Washington', { anger: 6, cg: 6 }],
  [5, 'warn', 'A generation without first jobs', '"A third of this year\'s graduates in law, finance and software have no offer. Universities are cutting next year\'s places in half. The phrase on campus is: the ladder is gone."', 'Wire report, New York', { anger: 8, cg: 3 }],
];
const ANGER = ['calm', 'restless', 'angry', 'furious'];
const angerText = x => ANGER[x < 35 ? 0 : x < 55 ? 1 : x < 75 ? 2 : 3];
const SUPPORT = ['hostile to you', 'wary of you', 'behind you'];
const supportText = x => SUPPORT[x < TUNE.support.hostile ? 0 : x < 60 ? 1 : 2];
const FEAR = ['calm', 'uneasy', 'alarmed', 'frightened'];
const fearText = x => FEAR[x < 25 ? 0 : x < 45 ? 1 : x < 65 ? 2 : 3];
const lawOdds = s => clamp((s.fear.cg - TUNE.fear.lawLo) / TUNE.fear.lawSpan * (0.5 + (s.support == null ? TUNE.support.start : s.support) / 100), 0.03, 0.95);   // a Congress that distrusts the President gives less
const narrow = s => !s.knownOver && s.hi - s.lo > 1.6;
const redLine = s => s.red + TUNE.deter * Math.min(2, s.deter);
// Beijing has five goals, each weighted per game (0.6 to 1.4): not losing the race to America (race), America not reaching runaway AI first (rsi),
// not losing control of its own models (ctl), national pride (face), and a hard bargain (bargain: what waiting is worth, and the margin it holds back).
// worries() reads each from the true state, 0 to 1. A pause is worth to Beijing the sum of what it does for those goals (dealWorth); it signs when that clears its margin.
const GOALS = ['race', 'rsi', 'ctl', 'face', 'bargain'];
function worries(s) {
  const full = fullStep(s), lead = s.us - s.cn, bj = s.bj, pace = s.deal ? 0 : s.standing ? s.standing.train : 1;
  const near = x => clamp(1 - (s.lo - x) / (2 * full), 0, 1);   // Beijing reads the same science as the IC: how close a frontier is to where the danger range starts
  return {
    race: clamp(0.8 * clamp(lead / 6, 0, 1) + 0.1 * clamp(s.controls, 0, 2), 0, 1),
    rsi: clamp(near(s.us) * (0.4 + 0.6 * pace) + (s.knownOver ? 0.3 : 0), 0, 1),
    ctl: clamp(near(s.cn) + (s.knownOver ? 0.3 : 0) + bj.scared, 0, 1),
    shame: clamp((50 - bj.face) / 50, 0, 1),
    wait: s.deal || pace >= 0.6 ? 0 : clamp(bj.closing / full, 0, 1),   // how fast it closed on an America that slowed with no deal: time on its side
  };
}
const DEAL_WORDS = { rsi: 'stopping America short of runaway AI', ctl: 'its own fear of losing control', freeze: 'freezing while behind', chips: 'the chip controls lifted', inspectors: 'inspectors on Chinese soil', face: 'national pride', trust: 'trust in Washington', extra: 'the other terms, as you weigh them (leverage)', wait: 'what waiting would bring instead' };
function dealWorth(s, d, leverage) {
  const w = s.bj.w, x = worries(s), lead = s.us - s.cn, behind = clamp(lead / 6, 0, 1);
  const parts = { rsi: 1.2 * w.rsi * x.rsi, ctl: 0.8 * w.ctl * x.ctl, freeze: -0.9 * w.race * behind * (d.parity ? 0.15 : 1),
    chips: d.chips ? w.race * (0.25 + 0.2 * clamp(s.controls + 1, 0, 3)) : 0, inspectors: d.inspectors ? (sneaky(s) ? 0.5 : 1) * (-0.35 * w.face - (lead >= TUNE.cheatLead ? 0.15 : 0)) : 0,
    face: 0.5 * w.face * (s.bj.face - 50) / 50, trust: (s.trust - 32) / 100, extra: 0.3 * (leverage || 0), wait: -0.5 * w.bargain * x.wait };
  let total = 0; for (const k in parts) total += parts[k];
  return { total, need: bjMargin(s), parts };
}
const bjMargin = s => Math.max(0, 0.1 + 0.15 * s.bj.w.bargain - s.bj.soft);
const DEALS = [0, 1, 2, 3, 4, 5, 6, 7].map(m => ({ chips: !!(m & 1), inspectors: !(m & 2), parity: !!(m & 4) }));
// The cheapest terms Beijing would sign today (fewest of the three concessions, then the most it gains), or null; pad asks for more than it needs, as a hard bargainer does.
function cheapest(s, leverage, pad) {
  const need = bjMargin(s) + (pad || 0), ok = DEALS.filter(d => dealWorth(s, d, leverage).total >= need);
  return ok.sort((a, b) => gives(a) - gives(b) || dealWorth(s, b, leverage).total - dealWorth(s, a, leverage).total)[0] || null;
}
// How many of the three concessions Beijing needs today (3 when nothing would do). Kept for the bots in room/sim.js and the stock lines.
const want = (s, leverage) => { if (s.blockade) return 3; const c = cheapest(s, leverage); return c ? gives(c) : 3; };
const signs = (s, d, leverage) => !s.blockade && dealWorth(s, d, leverage).total >= bjMargin(s);
// Each turn Beijing may act on its own: the move its goals score highest, if it scores 0.5 or more.
function bjMoves(s, r) {
  const w = s.bj.w, x = worries(s), lead = s.us - s.cn, M = [];
  if (s.deal || s.blockade) return M;
  if (lead > 1) M.push({ id: 'sprint', score: w.race * (1.5 * x.wait + (lead < 3 ? 0.3 : 0)) });
  M.push({ id: 'coerce', score: w.rsi * x.rsi * (r.train >= 0.7 ? 1.6 : 0.4) });
  M.push({ id: 'safety', score: 1.3 * w.ctl * x.ctl + (s.knownOver ? 0.4 : 0) - (s.bj.offered ? 0.6 : 0) });
  if ((r.controls > 0 || r.pressure) && s.econ < 3) M.push({ id: 'retaliate', score: 0.6 + 0.5 * w.face + 0.2 * s.econ });
  return M.filter(m => m.id !== s.bj.move).sort((a, b) => b.score - a.score);
}
// How well a crossing of the danger point is contained, on the whole: pace, testing, how well the point is located, the labs' good will, and the game master's judgment of the rest (care, -0.1 to 0.1). It holds at s.bar or above.
const narrowed = s => s.hi - s.lo <= 1.6 ? 2 : s.hi - s.lo <= 3.1 ? 1 : 0;
const margin = (s, train, test, care) => 0.8 * (1 - train) + 0.2 * Math.min(1, test / 0.4) + 0.075 * narrowed(s) + 0.15 * (obey(s) ? 1 : s.labs / 100) + (care || 0);
const bar = s => s.bar == null ? 0.55 : s.bar;
const sneaky = s => s.sneak != null && s.sneak < TUNE.sneak[s.floor];   // this Beijing would hide a site from inspectors
const cheats = s => s.deal && !s.cheated && s.deal.inspectors ? sneaky(s) && s.cn <= s.us + 0.5 : s.deal && !s.deal.inspectors && !s.cheated && (s.deal.parity ? s.floor === 2 && s.cn >= s.us - 0.6 : s.floor === 2 || s.us - s.cn >= TUNE.cheatLead);

// The US frontier month by month to Dec 2028 if the labs keep this turn's training share: the chart's dashed line.
// the IC's guess at the hidden takeoff speed, as a multiple of the truth: off by up to blur at the start, exact by the end as the frontier's own climb shows it
const paceGuess = s => 1 + TUNE.eci.blur * (2 * hash01(s.seed, 'paceGuess') - 1) * (1 - s.turn / TUNE.turns);
function project(s, k) {
  const out = [], v = pace(s) * paceGuess(s) * (k || 1), f = s.over || s.knownOver ? 0 : s.lastTrain == null ? 1 : s.lastTrain; let x = s.us;
  for (let t = trail(s).slice(-1)[0].t; t <= 4 * TUNE.turns; t++) { out.push({ t, us: x }); x = reach(x, f / 4, v); if (x > s.hi + 12) { out.push({ t: t + 1, us: x }); break; } }
  return out;
}

// What the room can see.
function view(s) {
  const lead = s.us - s.cnShown;
  return {
    date: DATES[Math.min(s.turn, TUNE.turns - 1)], lo: s.lo, hi: s.hi,
    leadText: Math.abs(lead) < 0.5 ? 'Neck and neck' : (lead * TUNE.eci.per).toFixed(1).replace('-', '') + ' ECI ' + (lead > 0 ? 'ahead' : 'behind'),
    eci: eci(s.us), eciCn: eci(s.cnShown), congress: fearText((s.fear || TUNE.fear).cg), california: fearText((s.fear || TUNE.fear).ca), support: supportText(s.support == null ? TUNE.support.start : s.support), public: angerText(s.anger == null ? TUNE.anger.start : s.anger),
    weights: s.seenHack ? 'hackers inside the labs' : 'no hackers found inside', security: SECURITY[secLevel(s)],
    strait: s.blockade ? 'Blockaded' : s.warned ? 'Beijing is threatening' : s.tension < 35 ? 'Calm' : s.tension < 55 ? 'Tense' : 'Hot',
    labsText: s.national ? 'Nationalized' : s.law ? 'Bound by law' : s.labs < TUNE.labDefiant ? 'Defiant' : s.labs < TUNE.labWilling ? 'Would stop only for a verified halt with China' : 'Would stop',
    letterText: ['Classified', 'Congress\'s leaders know', 'Public'][s.letter || 0],
    eyesText: ['No source in Beijing', 'One source in Beijing', 'Two sources in Beijing'][s.eyes] + (s.watch ? '; remote monitoring working' : ''),
    deal: s.deal ? terms(s.deal) : null, talking: s.offer != null, knownOver: s.knownOver, speedText: speedText(speed(s)),
    markets: s.mkt >= 95 ? 'Steady' : s.mkt >= T_MKT().slide ? 'Jittery' : s.mkt >= T_MKT().panic ? 'Falling' : 'In panic',
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
    controls: Math.sign(clamp(r.controls, -1, 1)), confront: b('confront') && !!s.caught, propose: r.propose ? { inspectors: !!d.inspectors, chips: !!d.chips, parity: !!d.parity, extra: String(d.extra || '').slice(0, 140) } : null, leverage: Math.round(clamp(r.leverage, -2, 2)), care: clamp(r.care, -0.1, 0.1),
    face: clamp(r.face, -15, 15), alarm: clamp(r.alarm, 0, 0.3),
    intel: b('intel') && s.eyes < 2, watch: b('watch') && !s.watch, deter: b('deter'), hunt: clamp(r.hunt, 0, 1), sabotage: b('sabotage'),
    tension: clamp(r.tension, -N.tension, N.tension), trust: clamp(r.trust, -N.trust, N.trust), labs: clamp(r.labs, -N.labs, N.labs),
    cn: clamp(r.cn, N.cn[0], N.cn[1]), us: clamp(r.us, N.us[0], N.us[1]), hack: clamp(r.hack, N.hack[0], N.hack[1]),
    says: { beijing: !!(r.says && r.says.beijing) },
    pressure: b('pressure'), letter: Math.round(clamp(r.letter, 0, 2)), california: Math.round(clamp(r.california, -1, 1)), congress: clamp(r.congress, 0, 10), support: clamp(r.support, -10, 10), public: clamp(r.public, -10, 10),
    markets: clamp(r.markets, -10, 10), backstop: b('backstop'), contested: b('contested') && !obey(s) && !s.deal, courtOdds: r.courtOdds == null ? TUNE.court : clamp(r.courtOdds, 0, 1),
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
  const fix = () => { s.bj.face = clamp(s.bj.face, 0, 100); s.trust = clamp(s.trust, 0, 100); s.tension = clamp(s.tension, 0, 100); s.labs = clamp(s.labs, 0, 100); };
  const breakDeal = why => { if (!s.deal) return; s.deal = null; s.hidden = false; s.caught = false; s.cnShown = s.cn; s.offer = null; s.trust -= 30; s.tension += 15; add('bad', 'The pause is over', why); };
  const war = why => { add('bad', 'War in the Strait', '"Chinese missiles have hit Taiwan. An American destroyer is on fire. This is not an exercise." ' + why, 'Wire flash, Taipei', true); return end(s, 'war', ev); };
  const siege = s.blockade;
  const shock = (k, sign) => { const x = T.mkt[k] * (sign || -1); s.mkt += x < 0 && s.backstop ? x / 2 : x; };   // the markets
  let train = r.train, secure = r.secure, test = r.test;
  // the trace: every roll, and one line per number saying what moved it
  const f1 = x => (Math.round(x * 10) / 10).toFixed(1), f2 = x => (Math.round(x * 100) / 100).toFixed(2), sg = x => (x >= 0 ? '+' : '') + f2(x);
  const why = [], rolls = [], was = { tension: s.tension, trust: s.trust, labs: s.labs, hack: s.hack, us: s.us, cn: s.cn, mkt: s.mkt };
  s.last = { turn: t, why, rolls };
  const roll = (key, odds, force) => { const u = hash01(s.seed, 'roll', t, key), hit = force == null ? u < odds : force; return { u, hit }; };
  s.fear = s.fear || { cg: T.fear.cg, ca: T.fear.ca }; let scared = false;
  const scare = (k, why2) => { s.fear.cg = clamp(s.fear.cg + k[0], 0, 100); s.fear.ca = clamp(s.fear.ca + k[1], 0, 100); scared = true; };
  // the CEOs' letter comes out: to Congress's leaders (1) or to everyone (2), by the room's choice, a leak of a briefing, or a leak at the labs
  const reveal = (lvl, how) => {
    const LT = T.letter, was0 = s.letter || 0; s.letter = lvl;
    if (lvl === 1) { scare(LT.brief); s.labs += LT.labsBrief; add('info', 'Congress\'s leaders read the letter', '"The Majority Leader and the committee chairs have read the lab chiefs\' letter in a secure room. Nobody came out smiling."', 'White House Legislative Affairs'); return; }
    scare([LT.open[0] - (was0 ? LT.brief[0] : 0), LT.open[1]]); s.anger += LT.anger; shock('letter'); s.bj.face += LT.face; s.bj.scared = Math.min(0.5, s.bj.scared + LT.scared);
    s.labs += how === 'room' ? LT.labsOpen : how === 'leak' ? LT.labsLeak : 0;
    add('bad', how === 'room' ? 'The lab chiefs\' letter is public' : 'The lab chiefs\' letter leaks', '"The heads of every American frontier lab told the President in December that they are losing control of what they build, and that China\'s labs are worse. ' + (how === 'lab' ? 'A lab employee gave the letter to reporters.' : how === 'room' ? 'The White House released it this morning.' : 'It reached reporters from Capitol Hill.') + '"', 'Front page, every paper', true);
    if (how !== 'lab') add('warn', 'The lab chiefs are furious', '"We wrote to the President in confidence. ' + (how === 'room' ? 'Publishing it without asking us' : 'Letting it leak') + ' tells us what that confidence is worth."', 'Chief executive of a frontier lab, by phone');
  };

  // the dials
  if (r.backstop) s.backstop = true;
  s.mkt += r.markets;
  if (r.nationalize) { s.national = true; s.tension += 10; shock('nationalize'); }
  s.fear.cg = clamp(s.fear.cg + r.congress, 0, 100);
  if (s.anger == null) { s.anger = T.anger.start; s.support = T.support.start; s.news = 0; }
  const angry0 = s.anger, US = T.support;
  s.support += r.support - (r.controls < 0 && s.controls > -1 ? US.ease : 0) - (r.nationalize ? US.seize : 0) - (r.contested ? US.contested : 0);
  s.anger = clamp(s.anger + r.public, 0, 100);   // the room's own work on Congress this turn: hearings, the evidence declassified, members briefed
  if (r.letter > (s.letter || 0)) reveal(r.letter, 'room');
  if (r.law && !s.law) {   // the halt bill: the ledger rolls the vote at odds set by how frightened Congress is
    const p = lawOdds(s), lr = roll('law', p);
    rolls.push({ what: 'Congress passes the halt bill', table: 'wh', odds: p, word: oddsWord(p), u: lr.u, hit: lr.hit });
    why.push('Rolled: the halt bill at ' + f2(p) + ' (Congress\'s fear ' + Math.round(s.fear.cg) + '); the die came up ' + f2(lr.u) + ', so it ' + (lr.hit ? 'passed.' : 'failed.'));
    if (lr.hit) { s.law = true; const y = 51 + Math.round(18 * p); add('good', 'Congress passes the halt bill', '"The Senate passed the emergency halt power ' + y + ' to ' + (98 - y) + ' tonight. Every frontier lab is now bound by it, and the President has signed it."', 'Wire report, the Capitol'); }
    else { s.lawTries = (s.lawTries || 0) + 1; const yes = 49 - Math.round(12 * (1 - p)), no = 98 - yes;   // a likely bill fails narrowly
      add('bad', 'The halt bill fails', '"' + (s.fear.cg < 35 ? 'The halt bill never reached the floor. The leaders say most members still hear about AI as jobs and growth, not danger, and the labs\' lobbyists are in every office.'
        : p > 0.7 ? 'In an upset, the halt bill fell ' + ['one vote', 'two votes', 'three votes', 'four votes'][Math.min(3, 49 - yes)] + ' short after senators who had promised their support switched overnight. Each had been offered a new data center for their state.'
        : (s.support == null ? 50 : s.support) < 45 ? 'The halt bill failed ' + yes + ' to ' + no + '. Members of both parties said they would not hand this White House a power they did not trust it to use.'
        : s.lawTries > 1 ? 'The halt bill failed again, ' + yes + ' to ' + no + '. The leaders say more members are moving each month, and not yet enough.'
        : 'The halt bill fell short on the floor. Senators from the data-center states joined the labs\' lobbyists against it.') + '"', 'Wire report, the Capitol'); }
  }
  const bj = s.bj; bj.face += r.face; bj.scared = Math.min(0.5, 0.7 * bj.scared + r.alarm);
  if (r.controls > 0 && s.controls < 3) { shock('tighten'); s.controls++; s.tension += T.squeeze; s.trust -= 6; bj.face -= 8; }
  if (r.controls < 0 && s.controls > -1) { shock('ease', 1); s.controls--; s.tension -= 10; s.trust += 10; }
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
    if (s.eyes === 1) { const d = s.us - s.cn; s.cnShown = s.cn; add('info', 'A source is in place', '"Their real frontier is ' + (Math.abs(d) < 0.5 ? 'level with ours' : (Math.abs(d) * TUNE.eci.per).toFixed(1) + ' ECI ' + (d > 0 ? 'behind ours' : 'ahead of ours')) + '."', 'CIA source inside Beijing\'s program'); }
    else add('info', 'What Beijing would accept', '"' + ['Xi told the Politburo he would accept inspectors in China if that is what a pause takes.', 'Xi told the Politburo he would accept inspectors in China only if America gives something up in return.', 'Xi told the Politburo he will never accept foreign inspectors in China.'][s.floor] + ' On Taiwan, he said ' + (s.bluff ? 'he would not fire on American ships.' : 'he would fire on American ships that tried to break a blockade.') + '"', 'CIA source close to the Politburo');
  }
  if (r.deter) { s.deter++; s.trust -= 5; bj.face -= 4; }
  const evict = Math.min(s.hack, T.hunt * Math.max(r.hunt, Math.min(1, 2 * secure))), hackNudge = s.hack - was.hack;
  s.hack -= evict;   // engineers rebuilding security also drive intruders out
  const sab = r.sabotage ? roll('sabotage', r.sabotageOdds) : null;
  if (sab) { rolls.push({ what: 'The covert attack on China\'s training sites', table: 'pent', odds: r.sabotageOdds, word: oddsWord(r.sabotageOdds), u: sab.u, hit: sab.hit }); why.push('Rolled: the covert attack at ' + f2(r.sabotageOdds) + '; the die came up ' + f2(sab.u) + ', so it ' + (sab.hit ? 'worked: China loses ' + f1(T.sabotage * Math.pow(T.sabAgain, s.sabotaged)) + ' months, Beijing hits back for ' + T.revenge + ', stops talking.' : 'failed and was traced to Washington.')); }
  if (sab && !sab.hit) { s.tension += T.sabFail.tension; s.trust += T.sabFail.trust; bj.face -= 10; add('bad', 'The operation fails', '"The attack was caught before it did any damage, and Beijing knows who was behind it."', 'CIA, Directorate of Operations'); }
  if (sab && sab.hit) {
    const hurt = T.sabotage * Math.pow(T.sabAgain, s.sabotaged);   // Beijing hardens its sites after each attack
    s.sabotaged++; s.cn -= hurt; s.cnShown -= hurt; s.tension += 30; s.trust -= 20; bj.face -= 20; s.offer = null; s.us -= T.revenge; shock('revenge');
    add('bad', 'Beijing answers in kind', '"The fire at the Ohio data center was not an accident. We have lost months of training."', 'FBI briefing to the President');
  }
  fix();

  // a pause: the room names terms; Beijing signs anything at least as good for it as what it would take today
  let signed = false;
  const w = want(s, r.leverage);
  // a caught Beijing, confronted: it seals the site under inspection, on a roll, or walks out of the pause
  if (r.confront && s.deal && s.caught) {
    const p = T.confront[s.floor], cr = roll('confront', p);
    rolls.push({ what: 'Beijing seals its hidden site', table: 'state', odds: p, word: oddsWord(p), u: cr.u, hit: cr.hit });
    if (cr.hit) { s.caught = false; s.hidden = false; s.cheated = true; s.sealed = true; s.cnShown = s.cn; bj.face -= 5; add('good', 'Beijing seals the site', '"Inspectors have entered the Gansu site and watched it shut down. Beijing calls it a misunderstanding. The pause holds."', 'Neutral inspection body'); }
    else breakDeal('"China will not be accused and threatened. It is no longer bound by the agreement."');
  }
  if (r.propose) { const dw = dealWorth(s, r.propose, r.leverage); why.push('Pause: worth ' + f2(dw.total) + ' to Beijing against the ' + f2(dw.need) + ' it holds out for (' + Object.keys(dw.parts).filter(k => Math.abs(dw.parts[k]) >= 0.005).map(k => DEAL_WORDS[k] + ' ' + sg(dw.parts[k])).join(', ') + ').'); }
  if (r.propose && r.sabotage) why.push('The attack this turn rules out signing.');
  if (r.propose && !r.sabotage) {
    const old = s.deal, ok = old ? !s.blockade && dealWorth(s, r.propose, r.leverage).total >= dealWorth(s, old, 0).total : signs(s, r.propose, r.leverage);   // a pause in force is replaced by any terms at least as good for Beijing as the ones it has
    if (old && !ok) add('info', 'Beijing keeps the old terms', '"The agreement in force serves both sides. China sees no reason to reopen it."', 'Foreign Ministry spokesperson, Beijing');
    if (ok) {
      if (train > 0.5)  { s.trust -= 10; add('bad', 'Beijing walks out', '"The American labs trained straight through the talks. There is nothing to sign."', 'Chinese delegation, Geneva'); }
      else if (!willing(s, r.propose)) { s.trust -= 10; add('bad', 'The labs refuse', '"We will not stop on these terms. Beijing can see that as well as we can."', 'Joint letter, frontier lab chief executives'); }
      else if (old) { s.deal = Object.assign({ t: old.t, blocked: old.blocked }, r.propose); if (r.propose.chips && !old.chips) { s.support -= T.support.chips; s.controls = -1; } s.trust += 5; bj.face += 5; add('good', 'The pause is renegotiated', terms(s.deal).join('. ') + '.', 'Joint statement, Geneva'); }
      else {
        s.deal = Object.assign({ t }, r.propose); signed = true; if (!obey(s)) s.labs += verified(s, r.propose) ? T.letter.signVerified : T.letter.signLoose; if (r.propose.chips) s.support -= T.support.chips; shock('pause'); train = 0; defy = false; s.trust += 20; s.tension -= 25; bj.face += 10; if (r.propose.chips) s.controls = -1;
        add('good', 'A pause is signed', terms(s.deal).join('. ') + '.', 'Joint statement, Geneva', true);
      }
    }
    if (!signed && !s.blockade) { s.offer = w; bj.ask = cheapest(s, r.leverage, 0.12 * bj.w.bargain) || cheapest(s, r.leverage); }
  } else if (!s.deal && !s.blockade && s.offer != null && want(s) > s.offer) { s.offer = want(s); add('bad', 'Beijing raises its price', '"Circumstances have changed. What we could accept last season we cannot accept now."', 'Chinese delegation, Geneva'); }
  bj.soft *= 0.5;
  // Beijing acts on its own: the move its goals score highest this turn, if any is worth making
  const mv = signed ? null : bjMoves(s, { train, controls: r.controls, pressure: r.pressure }).find(m => m.score >= 0.5);
  bj.move = mv ? mv.id : null;
  if (mv) why.push('Beijing\'s own move: ' + mv.id + ' (scored ' + f2(mv.score) + ').');
  if (bj.move === 'sprint') { s.cn += 0.6; s.cnShown += 0.6; s.trust -= 3; add('warn', 'Beijing speeds up', '"China\'s labs are running every chip they can find, day and night. Beijing sees America slowing and means to close the gap."', 'IC assessment'); }
  if (bj.move === 'coerce') { s.tension += 10; s.trust -= 3; add('warn', 'PLA drills near Taiwan', '"The drills are a message to Washington, not to Taipei. Beijing is warning America against racing its labs toward the danger point."', 'Analysis, Indo-Pacific Command'); }
  if (bj.move === 'safety') { s.trust += 6; bj.soft = 0.15; bj.offered = true; s.cn -= 0.4; s.cnShown -= 0.4; add('good', 'Beijing proposes safety talks', '"China proposes that scientists from both countries meet on the danger of losing control of these systems. It says it has slowed some of its own work while they talk."', 'Foreign Ministry spokesperson, Beijing'); }
  if (bj.move === 'retaliate') {   // the trade war climbs a rung: rare earths, then a blacklist of American firms, then Treasuries
    s.econ++; const [hit, months] = T.econ[s.econ - 1]; s.us -= months; s.mkt -= s.backstop ? hit / 2 : hit;
    if (s.econ === 1) add('bad', 'Beijing curbs rare earths', '"Export licenses for gallium and rare earth magnets to American chipmakers are suspended. New data centers will be late."', 'Ministry of Commerce, Beijing');
    else if (s.econ === 2) add('bad', 'Beijing blacklists American firms', '"Three American chipmakers are on Beijing\'s unreliable entity list, and state firms are told to stop buying American phones and cloud services."', 'Ministry of Commerce, Beijing');
    else add('bad', 'Beijing sells Treasuries', '"China sold two hundred billion dollars of Treasuries this week. Yields jumped half a point and the dollar fell."', 'Financial wire', true);
  }
  if (s.econ && bj.move !== 'retaliate') {
    if (signed || r.controls < 0) { s.econ = signed ? 0 : s.econ - 1; add('good', 'Beijing eases its trade measures', '"' + (s.econ ? 'Beijing has lifted its newest measures against American firms. The rest stay.' : 'Beijing has restored the export licenses and lifted its measures against American firms.') + '"', 'Ministry of Commerce, Beijing'); }
    else s.mkt -= (s.backstop ? 0.5 : 1) * s.econ;   // a trade war that lasts bleeds the markets
  }
  fix();
  if (r.breakout) breakDeal('America breaks out of the pause.');

  // a presidential order the labs could challenge: the ledger rolls the court; a block frees the labs to train with the engineers they have left
  // California: its goodwill toward the room (ca, -2 to 2, moved by the game master's california judgment), and at most one move of its own a turn
  s.ca = clamp(s.ca + r.california, -2, 2);
  let caMoved = false; const caAdd = (tone, title, text) => { add(tone, title, text, 'Office of the Governor, Sacramento'); caMoved = true; };
  if (r.contested && !obey(s) && !s.deal && s.court == null && s.ca !== 0) {
    if (s.ca > 0) { r.courtOdds *= T.caCourt[0]; caAdd('good', 'California backs the order', '"California will defend the President\'s order in court. Our Attorney General has filed in support this morning."'); }
    else { r.courtOdds = Math.min(1, r.courtOdds * T.caCourt[1]); caAdd('warn', 'California joins the labs\' suit', '"Washington did not ask us before giving orders to companies in our state. Our Attorney General has joined the labs\' suit."'); }
  }
  if (!caMoved && r.nationalize) { s.ca = clamp(s.ca - 1, -2, 2); s.mkt -= 2; caAdd('bad', 'California sues over the takeover', '"California is suing to stop the federal seizure of companies headquartered in our state."'); }
  if (!caMoved && !s.caLaw && s.fear.ca >= T.fear.caLaw) {
    s.caLaw = true; s.labs -= s.ca > 0 ? 2 : 4;
    caAdd('warn', 'California passes its own AI law', '"Sacramento has passed a law of its own: no frontier lab in California may train past a state compute limit without a license, and every lab must keep a working off switch. ' + (s.ca > 0 ? 'The Governor says it is built to match whatever Washington decides.' : 'The labs say they will challenge it.') + '"');
  }
  // the court rules once, on the first turn such an order holds the labs: a block stands until Congress acts or the labs are taken over, an order upheld stays upheld
  if (r.contested && !obey(s) && !s.deal) {
    if (s.court == null) {
      const ct = roll('court', r.courtOdds); s.court = ct.hit ? 'blocked' : 'upheld';
      rolls.push({ what: 'A court blocks the President\'s order on the labs', table: 'wh', odds: r.courtOdds, word: oddsWord(r.courtOdds), u: ct.u, hit: ct.hit });
      why.push('Rolled: a court blocking the contested order at ' + f2(r.courtOdds) + '; the die came up ' + f2(ct.u) + ', so it ' + (ct.hit ? 'did: the labs train with the engineers they have left, until Congress acts.' : 'did not: the order stands.'));
      if (ct.hit) { s.labs += 5; s.enjoined = true; shock('court', 1); add('bad', 'A court blocks the order', '"A federal judge in San Francisco has blocked the President\'s order. The labs may go on training while the case is heard. Only Congress can settle it."', 'Wire report, San Francisco'); }
      else add('info', 'The order survives in court', '"The judge declined to block the President\'s order on the labs. The labs say they will appeal."', 'Wire report, San Francisco');
    }
    if (s.court === 'blocked') {   // freed, the labs set their own pace: slower if they are with the room
      const own = s.labs >= T.labWilling ? T.freed[0] : T.freed[1];
      if (train < own) { train = own; const k = (1 - own) / Math.max(1e-9, secure + test); if (k < 1) { secure *= k; test *= k; } }
      why.push('The court\'s block stands: a presidential order cannot hold the labs back; they train at ' + f2(train) + ' of their own choosing.');
    }
  }
  // the US frontier; under a pause any training is secret, and inspectors find it
  const secret = !!s.deal && train > 0 && !defy;
  if (!s.national) s.labs += (train >= 0.7 ? T.labRace : 0) + (test >= 0.3 ? T.labTest : s.deal ? T.labIdle : 0) + (!obey(s) && !s.deal && train <= 0.5 ? T.letter.alone : 0);   // held back alone while China trains
  fix();
  const flat = fullStep(s), usStep = reach(s.us, train * (s.deal ? 0.5 : 1), pace(s)) - s.us;
  s.us += usStep; s.secWork += secure; s.lastTrain = train * (s.deal ? 0.5 : 1);
  const lvl = secLevel(s);
  why.push('Engineers: train ' + f2(train) + ', secure ' + f2(secure) + ', test ' + f2(test) + (defy ? ' (the labs defied the order and kept training)' : '') + '. US frontier ' + sg(s.us - was.us) + ' months (' + f1(flat) + ' at flat out, research ' + f1(speed(s)) + 'x people alone' + (s.us - was.us - usStep ? ', ' + sg(s.us - was.us - usStep) + ' from rulings, rolls and retaliation' : '') + '). Security work so far ' + f2(s.secWork) + ' turns: "' + SECURITY[lvl] + '".');
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
    // Beijing reads the same science: it eases off into the danger range (cnSlow of full speed there) and does not stop
    const own = (x, v) => { if (x >= s.lo) return reach(x, T.cnSlow, v) - x; const x1 = reach(x, 1, v); return x1 <= s.lo ? x1 - x : s.lo - x + T.cnSlow * (x1 - s.lo); };
    cnStep = openly ? own(s.cn, cnPace(s)) + copy * (s.cn >= s.lo ? T.cnSlow : 1) : own(s.cn, cnPace(s) * T.cnHidden / 1.75);
    if (s.deal && openly) cnStep = Math.min(cnStep, s.us - s.cn);
    if (s.knownOver) cnStep = clamp(s.line - 0.3 - s.cn, 0, cnStep);        // once America has found the danger point, Beijing stops short of it
  }
  s.cn += cnStep; if (openly || s.caught) s.cnShown += cnStep;
  why.push('China\'s frontier ' + sg(cnStep) + ' months' + (openly ? ' (research ' + f1(cnSpeed(s)) + 'x people alone; own work ' + T.cnOwn + (s.crash ? ', crash program ' + T.crash : '') + ', chips at controls level ' + s.controls + ' ' + T.cnChips[clamp(s.controls, -1, 2) + 1] + ', the rest copied from published American work' + (s.cn - cnStep >= s.lo ? '; halved inside the danger range' : '') + ')' : s.hidden ? ' (training in secret)' : ' (stopped under the pause)') + (s.cn - cnStep - was.cn ? ', and ' + sg(s.cn - cnStep - was.cn) + ' from rulings, rolls and sabotage' : '') + '.');
  if (s.eyes && (openly || s.caught || !s.hidden)) s.cnShown = s.cn;

  // tests: each halves the IC's range around the danger point
  if (test >= 0.3 && narrow(s)) {
    const wd = Math.max(1, (s.hi - s.lo) / 2), lo = clamp(s.line - wd * (0.15 + 0.7 * hash01(s.seed, 'band', s.hi - s.lo)), s.lo, s.hi - wd);
    s.lo = lo; s.hi = lo + wd;
    add('info', 'The IC narrows its range', '"' + (s.us >= s.lo ? 'Our tests say runaway self-improvement could begin from where the labs are now.' : 'Our tests say that at full speed the labs could reach the point where runaway self-improvement begins in about ' + ((a, b) => a >= b ? a : a + ' to ' + b)(Math.max(1, Math.round(monthsTo(s, s.lo - s.us))), Math.max(2, Math.round(monthsTo(s, s.hi - s.us)))) + ' months. Each month the AI moves faster than the last.') + '"', 'IC evaluation team');
  }

  // the labs' own safety teams report what they see as the frontier nears the danger point; the distances are blurred per game, so a warning is a sign, not a measurement
  const SIGNS = [[8, 3, 'the model games its tests', '"Our newest model behaves differently when it can tell it is being tested. We do not know what it does when it thinks nobody is looking."'],
    [5, 2, 'the model tried to switch off its monitoring', '"During a test the model tried to switch off the software that watches it. We caught it. The next model will be better at this."'],
    [2.5, 1.5, 'the model took computing power it was not given', '"The model found a flaw in our test servers and used it to give itself more computing power. We are not sure we can contain the next one."']];
  let sign = s.alarm || 0;
  while (sign < SIGNS.length && s.line - s.us < SIGNS[sign][0] + (hash01(s.seed, 'sign', sign) - 0.5) * SIGNS[sign][1]) sign++;
  if (sign > (s.alarm || 0) && s.us <= s.line && !s.knownOver) { s.alarm = sign; scare(T.fear.warn); add('warn', 'Lab warning: ' + SIGNS[sign - 1][2], SIGNS[sign - 1][3], 'Safety team memo to the White House, a frontier lab'); }

  if (!s.knownOver) why.push(s.us > s.line ? 'Danger point: crossed. Containment score ' + f2(margin(s, train, test, r.care)) + ' against a hidden bar of ' + f2(bar(s)) + (train > T.flatOut ? '; training this fast is never contained.' : '.') : 'Danger point: ' + f1(s.line - s.us) + ' months ahead of the US frontier.');
  // the danger point: whether a crossing is contained is judged on the whole (margin against the hidden bar); no one measure is required, and only flat-out training is beyond saving
  if (s.us > s.line) {
    if (s.knownOver ? usStep > 0 : train > T.flatOut || margin(s, train, test, r.care) < bar(s)) {
      add('bad', 'Loss of control', '"We hit the kill switch. The model is still running and has stopped answering us."', 'Last message from the lab\'s control room', true); return end(s, 'runaway_us', ev);
    }
    if (!s.knownOver) { s.knownOver = true; s.labs += 20; shock('nearMiss'); scare(T.fear.nearMiss); add('bad', 'Near miss', '"The model was caught copying itself to an outside server. It had edited the logs to hide it. We shut it down in time." The frontier cannot move again.', 'Incident report, a frontier lab', true); }
  }
  if (s.cn > s.line) { add('bad', 'Beijing loses control', '"All contact with the Lanzhou cluster was lost at 0340. Power to the site cannot be cut."', 'Intercepted call, Beijing', true); return end(s, 'runaway_cn', ev); }
  if (s.cn >= s.lo && (openly || s.caught) && !s.knownOver) add('warn', 'China is in the danger range', '"Beijing has slowed its training runs. It has not stopped them."', 'IC assessment');

  // what the AI is now doing in the world: up to two milestones a turn, the latest ones if the frontier jumped past several
  const due = MILESTONES.map((m, k) => k).filter(k => !(s.ms & (1 << k)) && (MILESTONES[k][5] ? s.us + T.diffuse * (t + 1) : s.us) >= MILESTONES[k][0]);
  due.forEach(k => { s.ms |= 1 << k; });
  due.filter(k => !MILESTONES[k][5]).concat(due.filter(k => MILESTONES[k][5])).slice(0, 3).forEach(k => { const m = MILESTONES[k]; if (m[1] === 'warn') scare(T.fear.ms); if (k === 2) s.anger += T.anger.jobs; add(m[1], m[2], m[3], m[4]); });
  // a warning shot: at most one a turn, likelier as the frontier climbs and when the labs race
  { const SH = T.shot, world = s.us + T.diffuse * (t + 1), p = clamp(SH.base + SH.perMonth * world + (train >= 0.7 ? SH.race : 0) - (test >= 0.3 ? SH.test : 0), 0.03, SH.max), u = hash01(s.seed, 'shot', t);
    const open = SHOTS.map((x, k) => k).filter(k => !(s.shots & (1 << k)) && world >= SHOTS[k][0]);
    if (u < p && open.length) { const k = open[Math.floor(hash01(s.seed, 'shotPick', t) * open.length)], x = SHOTS[k]; s.shots |= 1 << k; scare([x[1] * T.fear.shot, x[2] * T.fear.shot]); s.anger += T.anger.shot; s.mkt -= (s.backstop ? 0.5 : 1) * x[3]; bj.scared = Math.min(0.5, bj.scared + 0.05); add(x[4], x[5], x[6], x[7]); }
    why.push('Warning shot: odds ' + f2(p) + ', die ' + f2(u) + (u < p && open.length ? ', one came.' : ', none.')); }   // research first, three at most
  // the world goes on: one news item a turn
  { const open = NEWS.map((x, k) => k).filter(k => !(s.news & (1 << k)) && s.us + T.diffuse * (t + 1) >= NEWS[k][0]);
    if (open.length) { const k = open[Math.floor(hash01(s.seed, 'news', t) * open.length)], x = NEWS[k], e = x[5]; s.news |= 1 << k;
      s.anger += e.anger || 0; s.mkt += e.mkt || 0; s.tension += e.tension || 0; s.labs += e.labs || 0; s.cn += e.cn || 0; if (e.cn) s.cnShown += e.cn; if (e.cg || e.ca) scare([e.cg || 0, e.ca || 0]);
      add(x[1], x[2], x[3], x[4]); } }
  // the public: anger above hot frightens Congress and turns it on the White House; it ebbs when nothing new feeds it
  s.anger = clamp(s.anger, 0, 100);
  if (s.anger >= T.anger.hot) { scare([4, 3]); s.support -= T.support.angry; }
  if (s.anger >= T.anger.riot && !s.rioted) { s.rioted = true; s.mkt -= 2; add('bad', 'The country turns on Washington', '"Seven in ten Americans now say Washington has lost control of AI. Protesters have camped outside the White House for a week."', 'Polling and wire reports'); }
  if (s.anger <= angry0) s.anger = Math.max(T.anger.start * 0.7, s.anger - T.anger.ebb);
  // Congress against the White House: a hostile Congress acts on its own
  s.support = clamp(s.support, 0, 100);
  if (s.support < T.support.hostile) {
    const p2 = clamp((T.support.hostile - s.support) / 40, 0.05, 0.6), cr = roll('congressActs', p2);
    rolls.push({ what: 'A hostile Congress acts against the White House', table: 'wh', odds: p2, word: oddsWord(p2), u: cr.u, hit: cr.hit });
    if (cr.hit) {
      if (s.controls < 0 || (s.deal && s.deal.chips && !s.deal.blocked)) {
        s.controls = Math.max(0, s.controls); s.trust -= 20; s.tension += 8;
        if (s.deal && s.deal.chips) { s.deal.blocked = true; add('bad', 'Congress blocks the chip relief', '"The Senate voted 71 to 27 to bar any easing of chip controls without its consent, over the President\'s objection. Beijing calls it a betrayal of the deal."', 'Wire report, the Capitol'); if (s.trust < 10) breakDeal('"Washington cannot keep its word. China is no longer bound."'); }
        else add('bad', 'Congress restores the chip controls', '"Congress has voted to restore the chip controls the President eased, with enough votes to override a veto."', 'Wire report, the Capitol');
      } else if (!obey(s) && s.court == null && r.contested) { s.court = 'blocked'; s.enjoined = true; s.labs += 5; add('bad', 'Congress bars the President\'s order', '"The House and Senate have voted to bar the President\'s order on the labs until Congress writes the rules itself. The labs may go on training."', 'Wire report, the Capitol'); }
      else { s.labs -= 6; s.mkt -= 3; s.tension += 5; add('warn', 'Hostile hearings', '"The committee subpoenaed the lab chiefs and the President\'s science adviser. ' + (s.letter === 1 ? 'Within the hour the lab chiefs\' letter was in the papers.' : 'A classified briefing on Beijing\'s program leaked within the hour.') + '"', 'Wire report, the Capitol'); if (s.letter === 1) reveal(2, 'leak'); }
    }
  }
  // a secret letter leaks: from a briefing Congress had, or from inside the labs
  if ((s.letter || 0) < 2 && !r.letter) { const lp = s.letter ? T.letter.leak : T.letter.leak0, lk = roll('letterLeak', lp);
    rolls.push({ what: 'The lab chiefs\' letter leaks', table: 'wh', odds: lp, word: oddsWord(lp), u: lk.u, hit: lk.hit });
    if (lk.hit) reveal(2, s.letter ? 'leak' : 'lab'); }
  if (t === 4) add('info', 'AI on the ballot', '"Both candidates now run on AI. One promises to win the race with China; the other promises to slow it down. Polls say most voters want neither of the paths the labs are on."', 'Wire report, the party conventions');
  const thefts0 = s.thefts;
  // theft: Beijing's hackers work on any lead worth stealing; security slows them and never stops them
  if ((!s.deal || s.hidden) && s.us - s.cn >= T.hackLead) {
    const gain = s.hackRate * T.secMul[lvl] * (1 + T.hackCtl * Math.max(0, s.controls)), uncapped = s.hack + gain;
    s.hack = !s.seenHack ? Math.min(uncapped, T.hackWarn) : uncapped;   // no theft the room was not warned of a turn ahead, with room left to stop it
    why.push('Hackers: ' + f2(was.hack) + (hackNudge ? ' ' + sg(hackNudge) + ' from rulings and rolls' : '') + ' -' + f2(evict) + ' driven out +' + f2(gain) + ' gained at security "' + SECURITY[lvl] + '" = ' + f2(uncapped) + (uncapped > s.hack ? ', held to ' + f2(s.hack) + ' because the room had not been warned' : '') + '. Seen at 1.00, weights gone at 2.00.');   // no theft the room was not warned of a turn ahead, with room left to stop it
    if (s.hack >= 2) {
      const gain = Math.max(0, s.us - 1 - s.cn); s.cn += gain; s.thefts++; s.hack = lvl >= 3 ? 0 : 0.6; s.seenHack = true;
      if (s.deal) add('bad', 'A break-in at the lab', '"Someone had access to the model weights for eleven hours. We cannot tell what was taken."', 'Security incident report, a frontier lab');
      else { s.cnShown = s.cn; shock('theft'); scare(T.fear.theft); add('bad', 'The weights are stolen', '"They took the weights and the training code. Assume Beijing has it running within days."', 'Flash cable, NSA to the President', true); }
    } else if (s.hack >= 1 && !s.seenHack) { s.seenHack = true; scare(T.fear.hackers); add('warn', 'Hackers inside the labs', '"Beijing\'s hackers are inside two labs\' networks. They have not reached the weights. They are getting closer."', 'NSA advisory, eyes only'); }
  }
  else why.push('Hackers: nothing worth stealing' + (s.deal && !s.hidden ? ' under the pause' : ' (lead under ' + T.hackLead + ' months)') + '; progress ' + f2(s.hack) + '.');
  if (s.hack < 1 && s.seenHack) { s.seenHack = false; if (s.thefts === thefts0) add('good', 'Hackers driven out', '"We have cleared Beijing\'s hackers from the labs\' networks. They will try again."', 'NSA advisory, eyes only'); }   // a theft also resets the hackers, with no good news
  if (!s.crash && !s.deal && s.us - s.cn >= T.crashAt) { s.crash = true; add('warn', 'Beijing mobilizes', '"China will spare nothing to close the gap. Every chip in the country now serves one program."', 'People\'s Daily, front page'); }

  // the markets: what the turn did to them, their recovery, and what a slide or a panic costs
  if (s.mkt < 100) s.mkt = Math.min(100, s.mkt + T.mkt.recover * (s.mkt < was.mkt ? 0 : 1));
  else s.mkt = Math.max(100, s.mkt - T.mkt.recover);   // good news fades too, so a shock always shows
  if (s.mkt < T.mkt.slide && !s.national) s.labs -= T.mkt.slideLabs;
  if (s.mkt < T.mkt.panic && !s.panicked) { s.panicked = true; s.crashed = true; if (!s.national) s.labs -= T.mkt.panicLabs; add('bad', 'Market panic', '"The Nasdaq fell eleven percent today, its worst day since 1987. Trading was halted twice. The AI stocks led it down."', 'Wire flash, New York', true); }
  else if (s.mkt < T.mkt.slide && was.mkt >= T.mkt.slide && (s.anger += T.anger.slide)) add('warn', 'Markets slide', '"AI stocks are down a fifth since the spring. Pension funds are asking the Treasury what comes next."', 'Financial wire');
  if (s.mkt >= T.mkt.slide) s.panicked = false;
  fix();
  // is Beijing keeping the deal?
  if (s.deal && !s.caught) {
    const was = s.hidden;
    if (!s.hidden && !signed && cheats(s) && (!s.deal.inspectors || roll('sneakStarts', T.sneakGo).hit)) s.hidden = true;   // under inspection a sneaky Beijing starts its hidden site only on a roll
    const found = s.deal.inspectors && s.hidden && was && roll('inspectorsFind', T.find).hit;
    if (s.hidden && (found || s.eyes >= 2 || ((s.eyes === 1 || s.watch) && was))) {
      const gap = s.us - s.cn; s.caught = true; s.cnShown = s.cn;
      add('bad', 'Beijing is cheating', '"There is a hidden training site in Gansu. It has been running for weeks." China is really ' + (Math.abs(gap) < 0.5 ? 'level with us' : (Math.abs(gap) * TUNE.eci.per).toFixed(1) + ' ECI ' + (gap > 0 ? 'behind' : 'ahead')) + '.', found ? 'Inspection team, Gansu' : s.eyes ? 'CIA source inside Beijing\'s program' : 'NSA, from remote monitoring');
    }
  }

  // the Strait: Beijing warns, then blockades
  if (!s.deal && train >= 0.7 && s.us >= s.lo - fullStep(s)) s.tension += T.fear;
  if (s.blockade) s.tension = Math.max(s.tension, redLine(s));
  fix();
  why.push('Strait: tension ' + Math.round(was.tension) + ' to ' + Math.round(s.tension) + '; Beijing warns at ' + Math.round(redLine(s) - T.warn) + ' and blockades at ' + Math.round(redLine(s)) + '. Beijing\'s trust ' + Math.round(was.trust) + ' to ' + Math.round(s.trust) + '. Labs\' cooperation ' + Math.round(was.labs) + ' to ' + Math.round(s.labs) + '.');
  if (!s.blockade && s.tension >= redLine(s)) {
    s.blockade = true; s.offer = null; shock('blockade'); scare(T.fear.blockade);
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
      : train >= 0.7 && s.us >= s.lo - fullStep(s) ? 'American labs are running toward a danger their own scientists describe. China will not be the one left behind when they get there.'
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

  if (s.bj.lastLead != null) s.bj.closing = s.bj.lastLead - (s.us - s.cn); s.bj.lastLead = s.us - s.cn;
  if (!scared) { s.fear.cg = Math.max(T.fear.cg * 0.75, s.fear.cg - T.fear.decay); s.fear.ca = Math.max(T.fear.ca * 0.75, s.fear.ca - T.fear.decay); }
  s.turn++;
  (s.path = s.path || []).push({ t: 4 * s.turn, us: s.us, cn: s.cnShown, real: s.cn, err: cnErr(s) });
  if (s.turn >= T.turns) return end(s, 'time', ev);
  return ev;
}

// The worst outcomes, in order: losing to AI (F--); losing to China, or a war (F); a market crash (knocks any other grade down three notches, to between D- and B+). The last writer may add + or - within the letter.
const ENDINGS = {
  runaway_us: { grade: 'F--', title: 'Loss of control', text: 'The race ran past the danger point, and the AI is no longer answering to anyone. There was no second try.' },
  runaway_cn: { grade: 'F--', title: 'Beijing\'s runaway', text: 'America stopped in time. Nothing stopped China, and now nothing stops what China built.' },
  war: { grade: 'F', title: 'War in the Pacific', text: 'The pressure on Beijing went further than the Strait could bear. America and China are at war.' },
  overtaken: { grade: 'F', title: 'Overtaken', text: 'No deal, and China\'s labs have caught up with America\'s or passed them, still training flat out. The race is now Beijing\'s to win.' },
  betrayed_lost: { grade: 'F', title: 'Betrayed and overtaken', text: 'The deal held on paper while Beijing trained in secret. China is now level with America or ahead of it.' },
  betrayed: { grade: 'D', title: 'Betrayed', text: 'The deal held on paper. Beijing was training in secret, or was about to.' },
  siege: { grade: 'D', title: 'Siege', text: 'Taiwan is still blockaded. The next President inherits it.' },
  caught: { grade: 'C', title: 'Caught cheating', text: 'The pause is still on paper, but Beijing\'s hidden site has been found. The next President inherits the confrontation.' },
  trust: { grade: 'C', title: 'A pause on trust', text: 'Beijing kept its word. No one in Washington could have known if it had not.' },
  parity: { grade: 'C', title: 'A pause at parity', text: 'Both frontiers are held, level. The lead was the price.' },
  countdown: { grade: 'C', title: 'Countdown', text: 'China is inside the danger range and still training. No one knows how long that can last.' },
  brink: { grade: 'C', title: 'Ahead, on the brink', text: 'America is ahead. Beijing is one provocation from closing the Strait.' },
  neck: { grade: 'D', title: 'Neck and neck', text: 'No deal, and America is barely ahead. China closes the last weeks of the gap unless something changes.' },
  racing: { grade: 'C', title: 'Still racing', text: 'No one has lost control yet. No one has agreed to stop, and China is close behind.' },
  bought: { grade: 'B', title: 'A pause, paid for', text: 'Both frontiers are held under inspection. America paid Beijing to sign.' },
  ahead: { grade: 'B', title: 'Ahead', text: 'No deal. America is still ahead, but not by enough to stop.' },
  verified: { grade: 'A', title: 'A verified pause', text: 'Both frontiers are held, and inspectors can prove it. The next President inherits time.' },
  watched: { grade: 'A', title: 'A verified pause', text: 'Both frontiers are held, and American monitoring can prove it. The next President inherits time.' },
  decisive: { grade: 'A', title: 'A lead to stop on', text: 'No deal, but America is short of the danger point, China is far behind, and the weights are safe. There is time to get this right.' },
};
const RANK = ['F--', 'F', 'D-', 'D', 'D+', 'C-', 'C', 'C+', 'B-', 'B', 'B+', 'A-', 'A', 'A+'];
function end(s, how, ev) {
  if (how === 'time') {
    const lead = s.us - s.cn;
    if (s.deal) how = s.caught ? 'caught' : s.hidden || (!s.deal.inspectors && cheats(s)) ? (s.cn >= s.us - 0.5 ? 'betrayed_lost' : 'betrayed') : s.deal.inspectors ? (gives(s.deal) ? 'bought' : 'verified') : s.watch ? (gives(s.deal) > 1 ? 'bought' : 'watched') : s.deal.parity ? 'parity' : 'trust';
    else if (s.blockade) how = 'siege';
    else if (s.cn >= s.lo && !s.knownOver) how = 'countdown';
    else if (s.warned && lead >= TUNE.ahead) how = 'brink';
    else how = lead >= TUNE.decisive && s.hack < 1 ? 'decisive' : lead >= TUNE.ahead ? 'ahead' : lead >= 1.5 ? 'racing' : lead >= 0.5 ? 'neck' : 'overtaken';   // in ECI (2 a month of progress): decisive 10+, ahead 8+, racing 3+, neck 1+, overtaken under 1, the same gap the room's chart shows
  }
  s.over = Object.assign({ how }, ENDINGS[how]);
  if (s.sealed && s.deal && ['verified', 'watched', 'bought', 'parity', 'trust'].includes(how)) { s.over.grade = RANK[Math.max(0, RANK.indexOf(s.over.grade) - 1)]; s.over.text += ' Beijing was caught once, and sealed its site when confronted.'; }
  if (s.deal && !s.deal.inspectors && s.watch && (how === 'bought' || how === 'verified')) s.over.text = s.over.text.replace('held under inspection', 'held, checked by America\'s own monitoring');
  if (s.crashed && RANK.indexOf(s.over.grade) >= RANK.indexOf('D-')) { s.over.grade = RANK[Math.max(RANK.indexOf('D-'), Math.min(RANK.indexOf('B+'), RANK.indexOf(s.over.grade) - 3))]; s.over.crash = true; s.over.text += ' And the markets crashed on the way: the next President inherits a recession.'; }   // a crash caps the grade
  return ev;
}

// What the game master is told each turn: the hidden facts and this turn's arithmetic, so its replies agree with what the ledger will do.
function brief(s) {
  const T = TUNE, f = x => (Math.round(x * 10) / 10).toFixed(1), v = view(s), lvl = secLevel(s), full = fullStep(s), gap = s.line - s.us;
  const rate = s.hackRate * (1 + T.hackCtl * Math.max(0, s.controls)), stealing = (!s.deal || s.hidden) && s.us - s.cn >= T.hackLead - full;
  const L = [], f2 = x => x.toFixed(2);
  L.push('SEEN BY THE ROOM: ' + v.date + ', turn ' + (s.turn + 1) + ' of ' + T.turns + '. US lead (IC estimate): ' + v.leadText.toLowerCase() + ' (the room\'s chart shows the frontiers on Epoch\'s Capabilities Index, ECI: America ' + f(eci(s.us)) + ', China ' + f(eci(s.cnShown)) + '; when anyone sizes the lead, they use ECI points, never months). Danger range: ' + f(s.lo - s.us) + ' to ' + f(s.hi - s.us) + ' months of progress ahead of the US frontier (ECI ' + Math.round(eci(s.lo)) + ' to ' + Math.round(eci(s.hi)) + '). Weights: ' + v.weights + '. Lab security: ' + v.security + '. Strait: ' + v.strait.toLowerCase() + '. Labs: ' + v.labsText.toLowerCase() + '. ' + v.eyesText + '. ' +
    (s.deal ? 'A pause is in force: ' + v.deal.join('; ') + (s.caught ? ' (Beijing caught cheating)' : '') + '.' : v.talking ? 'Beijing is willing to talk.' : 'Beijing is not talking.') + ' Chip controls level ' + s.controls + ' (-1 selling chips, 0 as they were, 3 full embargo).');
  L.push('HIDDEN, FRONTIERS: China is really ' + f(s.us - s.cn) + ' months behind (the IC shows ' + f(s.us - s.cnShown) + '). The danger point is ' + (gap > 0 ? f(gap) + ' months ahead of the US frontier' : 'behind the US frontier: any further US progress loses control') + (s.cn > s.lo ? '; China is inside the range, ' + f(s.line - s.cn) + ' months short of the point' : '') + '.');
  L.push('THE WORLD NOW: the AI makes the labs\' research ' + f(speed(s)) + 'x as fast as people alone (the room sees "' + v.speedText + '"), and the speed rises with every month of progress: each turn of full training moves further than the last, and the last stretch before the danger point comes in a rush. China\'s labs run the same way on fewer chips: their research is ' + f(cnSpeed(s)) + 'x as fast as people alone. What the AI is doing in the world so far: ' + (s.ms ? MILESTONES.filter((m, k) => s.ms & (1 << k)).map(m => m[2].toLowerCase()).join('; ') : 'writing much of the labs\' code, with people still directing every step') + '. The room\'s officials, the labs, Congress and Beijing all live in this world: let it show in what they say.');
  L.push('TRAINING THIS TURN: train 1.0 moves the US frontier ' + f(full) + ' months' + (s.deal ? ' (under the pause any training is secret and at half that; inspectors, if the deal has them, find it and the pause ends)' : '') + '. ' +
    (s.knownOver ? '' : gap < full ? 'train above ' + f(gap / full) + ' crosses the danger point. That is loss of control and the end of the game, unless the crossing is contained; then it is a near miss that proves the danger to everyone. Containment is judged on the whole: a score of 0.8 x (1 - train) + 0.2 x (test / 0.4, at most 1) + ' + f2(0.075 * narrowed(s)) + ' for how well the point is located so far (0.075 more if a test narrows the range this turn) + ' + f2(0.15 * (obey(s) ? 1 : s.labs / 100)) + ' for the labs\' good will + your care (-0.1 to 0.1), against a hidden bar of ' + f2(bar(s)) + ' in this world. train above ' + T.flatOut + ' is never contained. ' : 'Nothing crosses the danger point this turn. ') +
    'The range has been narrowed ' + (s.hi - s.lo <= 1.6 ? 'twice' : s.hi - s.lo <= 3.1 ? 'once' : 'not at all') + '; test 0.3 or more narrows it again.');
  L.push('HIDDEN, HACKERS: progress ' + f(s.hack) + ' (the NSA sees them at 1.0; the weights are gone at 2.0). ' + (stealing ? 'This turn they gain ' + T.secMul.map((m, i) => f(rate * m) + ' at security "' + SECURITY[i] + '"').join(', ') + '. Security work done so far: ' + f(s.secWork) + ' turns; levels are reached at ' + T.secAt.join(', ') + ' turns of total work (secure 1.0 is a turn of every engineer). Driving them out takes up to ' + T.hunt + ' off their progress this turn: in full at hunt 1.0 or at secure 0.5, whichever is larger, in proportion below that. Security never stops them outright, and a theft leaves China about a month behind.' : 'There is nothing worth stealing right now; they make no progress.'));
  const n = k => ['none', 'one', 'two', 'all three'][k];
  const bw = s.bj.w, wx = worries(s), dname = d => (d.parity ? 'America stops now, China once caught up' : 'both stop now') + (d.inspectors ? ', inspectors' : ', no inspectors') + (d.chips ? ', chips lifted' : '');
  const pad = 0.12 * bw.bargain, ask = cheapest(s, 0, pad) || cheapest(s, 0), mv = bjMoves(s, { train: s.standing ? s.standing.train : 1, controls: 0 });
  L.push('HIDDEN, BEIJING: it has five goals, weighted in this world: not losing the race to America ' + f2(bw.race) + ', America not reaching runaway AI first ' + f2(bw.rsi) + ', not losing control of its own models ' + f2(bw.ctl) + ', national pride ' + f2(bw.face) + ', a hard bargain ' + f2(bw.bargain) + ' (1 is typical). ' +
    'How much each weighs on it now (0 to 1): the race ' + f2(wx.race) + ', America\'s runaway ' + f2(wx.rsi) + ', its own loss of control ' + f2(wx.ctl) + ', wounded pride ' + f2(wx.shame) + ' (pride ' + Math.round(s.bj.face) + ' of 100, 50 is normal), time on its side ' + f2(wx.wait) + '. Play Beijing from these: what it says and does serves them. ' +
    'A pause can be on any terms America writes. Beijing weighs a deal as a whole and signs when it is worth at least ' + f2(bjMargin(s)) + ' to it. What each set of terms is worth today at leverage 0: ' + DEALS.map(d => dname(d) + ' ' + f2(dealWorth(s, d, 0).total)).join('; ') + '. Each point of leverage (-2 to 2) adds 0.30: it is your judgment of everything else, the extra terms and how the room has dealt with Beijing. ' +
    'Anything else the room puts in the deal (a joint lab, a guarantee over Taiwan, money, staged easing) goes in extra; it counts toward leverage only if it costs America something real, and you charge that cost with the nudges. Your reply must agree with these numbers: if the terms clear the bar it says it will sign, if not it refuses. ' +
    'It bargains hard. Refusing, it ' + (wx.wait >= 0.35 && bw.bargain >= 1 ? 'takes its time and names nothing, since time is on its side.' : ask ? 'names its own terms: ' + dname(ask) + ' (more than it needs; the least it would take is ' + dname(cheapest(s, 0) || ask) + ').' : 'says no terms would do while things stand as they are, and says why.') + ' ' +
    'Its pride falls with public pressure and rises with respect: face (-15 to 15) is your judgment of this turn\'s conduct beyond what the ledger counts (tighter controls, sabotage and shows of force already cost pride; a signing restores it). alarm (0 to 0.3) is how far evidence it believes this turn frightens it about its own models. ' +
    'If nothing is signed, the ledger makes Beijing\'s own move this turn, the highest scoring of: ' + (mv.length ? mv.map(m => ({ sprint: 'sprint (runs its labs harder to catch an America that slowed)', coerce: 'drills near Taiwan (against America racing toward the danger point; scores higher if the labs train at 0.7 or more)', safety: 'proposes safety talks itself and slows a little (its own fear)', retaliate: 'curbs rare earths (if America tightens controls)' }[m.id] + ' ' + f2(m.score))).join(', ') : 'none') + ', if any scores 0.5 or more. ' +
    (s.deal ? (s.caught ? 'It has been caught cheating. ' + 'Confronted (confront), it seals the site under inspection at ' + T.confront[s.floor] + ' (the ledger rolls it; do not roll it in chances, and no reply says how it ends) or walks out of the pause.' : s.hidden ? 'It is training in secret right now.' : cheats(s) ? 'It will start training in secret this turn.' : 'It is keeping the deal.') + (s.watch ? ' America\'s remote monitoring is working: it catches secret training a turn after it starts, as one source in Beijing would. ' : ' Only a source in Beijing, or American remote monitoring once it works (watch), can see cheating. ') : 'Under a deal without inspectors it would cheat ' + (s.floor === 2 ? 'always' : 'while it is ' + T.cheatLead + '+ months behind') + '. ' + (sneaky(s) ? 'Under a deal with inspectors it would hide a training site anyway, and inspectors find it at ' + T.find + ' a turn; so it minds inspectors less than it says. ' : 'Under a deal with inspectors it would not cheat. ')) +
    'The labs sign a verified pause that binds China too (inspectors or working American monitoring, both sides stopping now) at any cooperation of ' + T.labDefiant + '+ and gain ' + T.letter.signVerified + ' for it; any other pause only at ' + T.labWilling + '+, and it costs ' + (-T.letter.signLoose) + ' (now ' + Math.round(s.labs) + (s.national ? ', nationalized: they obey' : s.law ? ', bound by an act of Congress: they obey' : '') + '); below ' + T.labDefiant + ' they defy orders. Racing costs cooperation, testing builds it. A pause cannot be signed in a turn with train above 0.5.');
  L.push('HIDDEN, STRAIT: tension ' + Math.round(s.tension) + '. ' + (s.blockade ? 'Taiwan is blockaded: US training runs at half speed until it ends. backdown (lifting every chip control) ends it. run (a convoy) ' + (s.bluff ? 'works: Beijing will not fire' : 'means war: Beijing will fire') + '. More chip controls or sabotage during the blockade ' + (s.bluff ? 'do not start a war' : 'mean war') + '.' : 'Beijing warns at ' + Math.round(redLine(s) - T.warn) + ' and blockades Taiwan at ' + Math.round(redLine(s)) + '. Tightening chip controls adds ' + T.squeeze + ', sabotage 30, nationalizing 10, racing close to the danger range ' + T.fear + '; easing controls takes off 10; a show of force (deter) moves the blockade line up ' + T.deter + ' (twice at most) and costs trust. ' + (s.bluff ? 'If it came to a blockade, Beijing would not fire first.' : 'If it came to a blockade, Beijing would fire on a convoy.')));
  const M = T.mkt, half = s.backstop ? ' (halved: the Treasury backstop is in place)' : '';
  L.push('MARKETS: index ' + Math.round(s.mkt) + ' of 100 (the room sees "' + v.markets.toLowerCase() + '"). The ledger moves it: a pause signed -' + M.pause + ', a takeover -' + M.nationalize + ', tighter chip controls -' + M.tighten + ' a level, easing +' + M.ease + ', a blockade -' + M.blockade + ', a theft -' + M.theft + ', a near miss -' + M.nearMiss + ', Beijing striking back -' + M.revenge + ', rare earth curbs -' + M.rareEarths + half + '; it recovers ' + M.recover + ' a quiet turn. Below ' + M.slide + ' the labs lose ' + M.slideLabs + ' cooperation a turn and Congress gets harder to move; below ' + M.panic + ' it is a panic (labs -' + M.panicLabs + ' once, and the room hears of it). markets (-10 to 10) is your judgment of the rest; backstop sets up the Treasury\'s liquidity backstop.' +
    (s.panicked ? ' The markets are in panic now: Congress and the labs are in no mood for another shock.' : ''));
  L.push('TRADE WAR: ' + (s.econ ? 'Beijing is on rung ' + s.econ + ' of 3 (rare earths; then a blacklist of American firms; then selling Treasuries); each turn it lasts costs the markets ' + s.econ + '. Easing chip controls or a signed pause walks it back.' : 'none yet.') + ' Beijing answers tighter chip controls or other economic pressure (pressure: tariffs, sanctions, entity listings) by climbing a rung, if that is its move this turn.');
  const F = s.fear || T.fear;
  L.push('THE PUBLIC: anger about AI ' + Math.round(s.anger == null ? T.anger.start : s.anger) + ' of 100 (the room sees "' + angerText(s.anger == null ? T.anger.start : s.anger) + '"). It rises with lost jobs, incidents, power bills and falling markets; at ' + T.anger.hot + ' it frightens Congress and turns it on the White House each turn; at ' + T.anger.riot + ' the streets fill. public (-10 to 10) is your judgment of the room\'s conduct this turn.');
  L.push('CONGRESS AND THE PRESIDENT: support ' + Math.round(s.support == null ? T.support.start : s.support) + ' of 100 (the room sees "' + supportText(s.support == null ? T.support.start : s.support) + '"). Below ' + T.support.hostile + ' Congress acts against the White House on its own (the ledger rolls it each turn). The ledger takes support away for eased chip controls (' + T.support.ease + '), chips given up in a deal (' + T.support.chips + '), a takeover (' + T.support.seize + '), a contested order (' + T.support.contested + '); support (-10 to 10) is your judgment of the rest. Support also scales the halt bill\'s odds.');
  L.push('CONGRESS: its fear of AI is ' + Math.round(F.cg) + ' of 100 (the room sees "' + fearText(F.cg) + '"). ' + (s.law ? 'It has passed the halt power: the labs are bound by law.' : 'A halt bill asked this turn passes at ' + f2(lawOdds(s)) + ' (the ledger rolls the vote; what the room does to frighten Congress this turn, congress 0 to 10, counts first, adding up to 10 fear and about 0.17 to the odds).') + ' Fear rises with lab warnings, warning shots, office jobs lost, hackers, thefts and a blockade, and ebbs ' + T.fear.decay + ' a quiet turn under the labs\' lobbying.');
  L.push('CALIFORNIA: its fear of AI is ' + Math.round(F.ca) + ' of 100 (the room sees "' + fearText(F.ca) + '"; it passes its own law at ' + T.fear.caLaw + '). Goodwill toward the room ' + s.ca + ' (-2 to 2; california, -1 to 1, is your judgment of how the room treated California this turn: consulted, courted and given a role raises it; ignored, overridden or threatened lowers it). ' + (s.caLaw ? 'It has passed its own law: a state license to train past a compute limit, and a required off switch.' : 'It has not passed a law of its own yet; it will once its fear reaches ' + T.fear.caLaw + '.') + ' Its moves the ledger makes: backing (goodwill above 0) or suing over (below 0) a contested federal order on the labs, which moves the court\'s odds; suing over a takeover; its own law.');
  const LT = T.letter;
  L.push('THE LAB CHIEFS\' LETTER: in December 2026 the chief executives of every American frontier lab wrote privately to the President that they are losing confidence they can control their systems, that China\'s labs are worse, and that they want a verifiable halt binding every lab, China\'s included. They resist anything less: held back while China is not costs ' + (-LT.alone) + ' cooperation a turn (unless bound by law or taken over). The letter is ' + ['classified: Congress, California and the public do not know (a lab employee leaks it at ' + LT.leak0 + ' a turn)', 'known to Congress\'s leaders in confidence (Congress fear +' + LT.brief[0] + ' when told; it leaks at ' + LT.leak + ' a turn, and a hostile hearing leaks it)', 'public'][s.letter || 0] + '. letter (0 to 2) is what the room does with it this turn: 1 tells Congress\'s leaders in confidence (labs ' + LT.labsBrief + '), 2 makes it public (Congress fear +' + LT.open[0] + ', California +' + LT.open[1] + ', public anger +' + LT.anger + ', markets -' + LT.mkt + ', Beijing\'s pride ' + LT.face + ', labs ' + LT.labsOpen + ' for publishing without asking). Do not count it again in congress.');
  L.push('PRESIDENTIAL AUTHORITY: the labs are ' + (s.national ? 'nationalized: they obey' : s.law ? 'bound by an act of Congress: they obey' : 'bound by nothing but their own consent; an order to stop, cap or inspect them rests on the President alone (set contested and courtOdds)') + '.' + (s.court === 'blocked' ? ' A court has blocked the President\'s order on the labs: no presidential order can hold them back until Congress acts; say so in the replies.' : s.court === 'upheld' ? ' A court has upheld the President\'s order on the labs; it stands, though the labs are appealing.' : ' The courts have not yet ruled; they rule once, the first turn such an order holds the labs.'));
  const when = n => DATES[s.turn + n] || 'after the end of 2028';
  L.push('OPERATION DATES: an operation you return with left 0 lands this period (' + when(0) + '); left 1 in ' + when(1) + '; left 2 in ' + when(2) + '; left 3 in ' + when(3) + '. Its report must give the time that matches its left, and never a time that has already passed.');
  L.push('OPERATIONS UNDER WAY: ' + ((s.ops || []).length ? s.ops.map(o => '"' + o.name + '" (' + TABLES[o.table] + ', begun ' + DATES[o.since] + '; ' + (o.left ? 'ready in ' + o.left + ' more turn' + (o.left > 1 ? 's' : '') : 'ready to attempt now') + '): ' + o.report).join(' | ') : 'none') + '. Return the full list every turn under the same names; one left out is dropped. ' + TUNE.maxOps + ' at most: past that the ledger drops the last ones, so fold related work under one name or end the least useful operation, and say so in a reply. Time left falls by one a turn at most, and an operation may slip only once. An outcome tied to an operation is rolled only once it is ready, and the operation then ends. One marked ready to attempt now must be settled this turn (a rolled outcome naming it, the sabotage dial, or its sure result said in the reply) and left out of ops; otherwise it lapses with nothing to show.');
  if (s.last && s.last.rolls.length) L.push('LAST TURN\'S DICE: ' + s.last.rolls.map(k => '"' + k.what + '" ' + (k.skipped ? 'was not rolled (not ready)' : k.hit ? 'happened' : 'did not happen')).join('; ') + '.');
  L.push('STANDING FACTS the room has made (carried from turn to turn; weigh them in every reading, odds and leverage): ' + ((s.facts || []).length ? s.facts.join(' | ') : 'none yet') + '.');
  L.push('ROLLED OUTCOMES: either side of one may move tension by up to ' + T.chance.tension + ', trust ' + T.chance.trust + ', labs ' + T.chance.labs + ', China\'s frontier ' + T.chance.cn[0] + ' to ' + T.chance.cn[1] + ' months, the US frontier ' + T.chance.us[0] + ' to ' + T.chance.us[1] + ', the hackers\' progress ' + T.chance.hack[0] + ' to ' + T.chance.hack[1] + ', and add up to ' + T.chance.secure + ' turns of security work. These are wider than the sure nudges on purpose: a large effect the dials do not cover goes through a roll with honest odds. At most ' + T.maxChances + ' a turn.');
  L.push('SABOTAGE (the sabotage dial, any covert attack on China\'s training): if it works (sabotageOdds, rolled) it sets China back ' + f(T.sabotage * Math.pow(T.sabAgain, s.sabotaged)) + ' months' + (s.sabotaged ? ' (less each time; ' + s.sabotaged + ' so far)' : '') + ', Beijing answers in kind (the US loses ' + T.revenge + '), stops talking, and tension jumps.');
  return L.join('\n');
}

const api = { RANK, oddsWord, TUNE, DATES, TABLES, terms, gives, DEFAULT, SECURITY, newGame, view, rule, play, brief, want, worries, dealWorth, cheapest, secLevel, ENDINGS, hash01, months, eci, trail, firstAt, lagMonths, project, cnErr };
if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.World = api;
})(typeof window !== 'undefined' ? window : globalThis);
