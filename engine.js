/* The Scramble: simulation engine.
 * Pure state machine, no DOM. Loaded by index.html as a global (ScrambleEngine)
 * and by sim/playtest.js under node for balancing. All randomness flows through
 * the seeded generator stored in the state, so a saved game replays exactly. */
(function (root) {
'use strict';

/* ================= utilities ================= */
const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const START_T = 0.4;          // 13 Oct 2026
const END_T = 26.4;           // 13 Dec 2028: the game always ends here
function rnd(s) { s.rs = (s.rs + 0x6D2B79F5) | 0; let t = s.rs; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }
function gauss(s) { let u = 0; while (u === 0) u = rnd(s); const v = rnd(s); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); }
function hash01() { let h = 2166136261 >>> 0; const str = Array.prototype.join.call(arguments, '|'); for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; } h ^= h >>> 13; h = Math.imul(h, 0x5bd1e995) >>> 0; h ^= h >>> 15; return (h >>> 0) / 4294967296; }
const clamp = (v, a = 0, b = 100) => Math.max(a, Math.min(b, v));
const logistic = x => 1 / (1 + Math.exp(-x));
const r1 = x => Math.round(x * 10) / 10;
function dateOf(t) { const f = Math.floor(t + 1e-9); const mi = 2026 * 12 + 9 + f; const frac = t - f; return { y: Math.floor(mi / 12), m: mi % 12, d: Math.max(1, Math.min(28, Math.round(frac * 30) + 1)) }; }
function dateLabel(t) { const d = dateOf(t); return d.d + ' ' + MONTHS[d.m] + ' ' + d.y; }
function monthLabel(t) { const d = dateOf(t); return MONTHS[d.m] + ' ' + d.y; }
function pick(s, arr) { return arr[Math.floor(rnd(s) * arr.length)]; }

/* ================= static data ================= */
const DIFFS = {
  analyst: { label: 'Analyst', ap: 4, Tmed: 14, tension: 26, cred: 60, theft: 0.7, desc: 'More staff, more time, a calmer Beijing.' },
  advisor: { label: 'Advisor', ap: 3, Tmed: 12.5, tension: 32, cred: 55, theft: 1.0, desc: 'The intended experience.' },
  excomm:  { label: 'ExComm', ap: 3, Tmed: 11.8, tension: 38, cred: 52, theft: 1.3, desc: 'Earlier threshold, hotter Beijing, less patience.' },
};

const PRINCIPALS = [
  { id: 'vp', name: 'Vice President', title: 'Vice President', short: 'VP', faction: 'Populist', infl: 68, fireable: false,
    prefs: { pause: 0.2, hawk: 0.6, markets: 0.2, deal: -0.6, control: 0.8, industry: -1.0, military: 0.4, commerce: 0, ic: 0, allies: -0.6 }, sal: 1.3,
    bio: 'Asks the question everyone is thinking: if we pause, does China pause?' },
  { id: 'cos', name: 'Chief of Staff', title: 'Chief of Staff', short: 'COS', faction: 'Politics', infl: 80, fireable: true,
    prefs: { pause: 0, hawk: -0.2, markets: 1.2, deal: 0.5, control: 1.4, industry: 0, military: 0, commerce: -1.6, ic: 0, allies: 0 }, sal: 0.9,
    bio: 'Guards the schedule and the midterm map. Wants the government visibly in charge. Does not trust Commerce.' },
  { id: 'tsy', name: 'Treasury Secretary', title: 'Treasury Secretary', short: 'TSY', faction: 'Dealmaker', infl: 64, fireable: true,
    prefs: { pause: -0.4, hawk: -0.6, markets: 2.0, deal: 1.8, control: 0, industry: 0.5, military: 0, commerce: -1.4, ic: 0, allies: 0.5 }, sal: 0.6,
    bio: 'Wants calm markets and a trade deal with Beijing. Needs a win, and is at war with Commerce.' },
  { id: 'doc', name: 'Commerce Secretary', title: 'Commerce Secretary', short: 'DOC', faction: 'Industry', infl: 62, fireable: true, persuade: 0.35,
    prefs: { pause: -1.6, hawk: -0.6, markets: 0.8, deal: -0.2, control: 0.4, industry: 2.0, military: 0.2, commerce: 2.4, ic: 0, allies: -0.3 }, sal: 0.35,
    bio: 'Owns export controls and wants to own everything else. The industry\u2019s voice in the cabinet: thinks a pause is a gift to Beijing. Leaks when cornered.' },
  { id: 'sec', name: 'Secretary of State', title: 'Secretary of State & NSA', short: 'STATE', faction: 'Hawk', infl: 70, fireable: true,
    prefs: { pause: 0, hawk: 2.0, markets: 0, deal: -0.3, control: 0.5, industry: 0, military: 1.0, commerce: 0, ic: 0.5, allies: 1.0 }, sal: 0.7,
    bio: 'A career China hawk. Will pace only from a position of strength.' },
  { id: 'war', name: 'Secretary of War', title: 'Secretary of War', short: 'WAR', faction: 'Hawk', infl: 50, fireable: true,
    prefs: { pause: -0.9, hawk: 1.4, markets: 0, deal: -1.0, control: 0.8, industry: 0.4, military: 2.4, commerce: 0, ic: 0, allies: -0.2 }, sal: 0.5,
    bio: 'Wants frontier AI in the hands of the warfighter and every option on the table.' },
  { id: 'dni', name: 'DNI', title: 'Director of National Intelligence', short: 'DNI', faction: 'Agencies', infl: 40, fireable: true,
    prefs: { pause: 0.4, hawk: 0.6, markets: 0, deal: 0, control: 0.8, industry: 0, military: 0.2, commerce: 0, ic: 2.2, allies: 0.3 }, sal: 0.8,
    bio: 'Sets collection priorities. Wants the Intelligence Community, not Commerce, to own verification.' },
];
const ALTS = {
  cos:  { bio: 'A campaign operative promoted after the shake-up. Lives by the tracking polls.', prefs: { pause: 0, hawk: 0.6, markets: 1.4, deal: 0.3, control: 1.0, commerce: -0.6 }, sal: 1.0 },
  tsy:  { bio: 'A bond-market veteran. Less interested in Beijing, more in yields.', prefs: { pause: -0.2, hawk: 0, markets: 2.0, deal: 1.0, industry: 0.4 }, sal: 0.8 },
  doc:  { bio: 'A former BIS enforcement chief. Takes the job, not the spotlight.', prefs: { pause: 0, hawk: 1.4, markets: 0.4, control: 0.8, industry: 0.3, commerce: 1.0 }, sal: 0.8 },
  sec:  { bio: 'A diplomat’s diplomat. Hawkish, but believes in arms control.', prefs: { pause: 0.3, hawk: 1.4, deal: 0.4, allies: 1.4, control: 0.4 }, sal: 1.0 },
  war:  { bio: 'Commanded INDOPACOM. Knows exactly what a war with China would cost.', prefs: { pause: 0, hawk: 1.2, military: 1.6, deal: -0.2, control: 0.6 }, sal: 0.9 },
  dni:  { bio: 'A career NSA officer. Quiet and literal.', prefs: { pause: 0.3, hawk: 0.8, ic: 2.0, control: 0.6 }, sal: 0.8 },
};
const QUOTES = {
  vp:   { yes: ['If this keeps China down and Big Tech honest, I’m in.', 'I’ve seen enough. Do it.', 'The voters back home would want this.'], no: ['If we pause, does China pause? I still haven’t heard an answer.', 'This reads like something a Big Tech lobbyist wrote.', 'Who exactly asked for this?'], mid: ['Show me what it does to China.', 'I want to hear from the labs first.'] },
  cos:  { yes: ['This is a win we can explain.', 'The government has to look in charge. This does that.'], no: ['I can’t sell this in Pennsylvania.', 'Not before I see the polling.', 'This is a story about chaos. We don’t do chaos.'], mid: ['How does this play?', 'Who carries it on the Sunday shows?'] },
  tsy:  { yes: ['Markets can live with that.', 'That’s a deal I can take to Beijing.'], no: ['Futures will be down four percent by lunch.', 'You’re going to blow up the trade summit.', 'Do you know how much of the S&P is AI capex?'], mid: ['What’s the market impact?', 'Price it for me first.'] },
  doc:  { yes: ['Commerce can run this. Commerce should run this.', 'Great. My people are ready.'], no: ['Who’s in charge of this? Because it isn’t me.', 'This is doomer fan fiction.', 'They’re cheering this in Beijing tonight.'], mid: ['Where does Commerce sit in this?', 'I’d want to see the org chart.'] },
  sec:  { yes: ['Good. Beijing respects strength.', 'This buys us leverage.'], no: ['This is a gift to Beijing.', 'We’d be disarming unilaterally.'], mid: ['What does Beijing do in response?', 'Run it past our allies first.'] },
  war:  { yes: ['The warfighter needs this.', 'Options on the table. Good.'], no: ['Our adversaries won’t stop. Neither should we.', 'This handcuffs the Department.'], mid: ['Does this touch DoD compute?', 'I’d want the Joint Staff to look.'] },
  dni:  { yes: ['The Community can deliver this.', 'We can see it, and we can verify it.'], no: ['I don’t have the collection to back this up.', 'This burns sources for very little.'], mid: ['I’d want an assessment first.', 'Confidence is moderate at best.'] },
};

const LABS = [
  { id: 'mindscale', name: 'Mindscale', ceo: 'Mindscale\u2019s CEO', share: 0.55, cap0: 0, speed: 1.05, safety: 22, ruth: 0.8, rel0: 20,
    sites: 'Forge 1 and Forge 2, Memphis; Polaris Abilene', blurb: 'Fastest builder in the world. The CEO is a political force in their own right.',
    deal: { name: 'A $12B DoD contract', pc: 2, fx(s) { rel(s, 'war', 10); shiftCN(s, { sec: 2 }); return 'Beijing notes that the most reckless lab just got a defense contract.'; } } },
  { id: 'prometheus', name: 'Prometheus', ceo: 'Prometheus\u2019s CEO', share: 0.45, cap0: -0.1, speed: 1.0, safety: 88, ruth: 0.1, rel0: -15,
    sites: 'Lake Mariner; New Carlisle; Columbus', blurb: 'The safety lab. The administration has called it “woke AI.”',
    deal: { name: 'Drop the “supply-chain risk” designation', pc: 1, fx(s) { rel(s, 'war', -12); industry(s, -8); return 'The Secretary of War is furious.'; } } },
];

const COMPONENTS = [
  { id: 'survey', name: 'Find the sites', short: 'Find', trusted: true, desc: 'Thermal and GEOINT survey. VIIRS sees a 3 MW heat source; a 200 MW site is 70\u00d7 above that floor.' },
  { id: 'inspect', name: 'Inspect the sites', short: 'Inspect', trusted: true, desc: 'Inspectors, chip accounting, whistleblower channels. Research automation is invisible from outside and obvious to the engineers running it.' },
  { id: 'novel', name: 'Novel verification tech', short: 'Novel', trusted: false, desc: 'On-chip attestation and proofs of what a cluster trained. Slow, and not trusted during the scramble or Phase 1.' },
]

// Weight security ladder. Each level replaces the one below: its theft odds and its cost to US labs.
const SL = { 3: { W: 25, theft: 0.90, drag: 0 }, 4: { W: 65, theft: 0.50, drag: 0.08 }, 5: { W: 92, theft: 0.04, drag: 0.20 } };
function setSL(s, lvl) { if (lvl > s.sl) { s.sl = lvl; s.W = SL[lvl].W; } }
// Tunables for the UAE megasite left outside the regime (exported so sim/ can test variants).
const TUNE = { theftBase: 0.05, hawkBase: -0.15, hawkProvoke: 0.08, hawkRace: 0.08, uaeShare: 0.15, uaeRate: 0.3, uaeHazard: true, uaeSupport: false, uaeDeal: 0, uaeCost: 2, uaeState: -12, courtRate: { dpa: 0.08, license: 0.05, charter: 0.03 }, summitCourt: 0.35, betray: 2.5, betrayAt: 0.85, falseAlarm: 0.12, senateBase: 8 };
const PROJECTS = [
  { id: 'team', name: 'Hire a real team', need: 3, desc: 'Detailees from State, Energy and the IC. Right now you are one person with an inbox.', done: '+1 action every turn for the rest of the game.', fx(s) { s.apMax += 1; } },
  { id: 'memo', name: 'Write the memo for the emergency meeting', need: 2, p1: false, desc: 'Answers to the questions the President will ask in the first hour, drafted before anyone asks them.', done: 'At the scramble: +15 credibility, +2 political capital, and the room leans your way.' },
  { id: 'charter', name: 'Pre-draft the Pacing Charter with lab lawyers', need: 3, desc: 'Definitions, thresholds and research-automation language, agreed in principle by general counsels.', done: 'Every lab is much more likely to sign during the scramble.' },
  { id: 'geoint', name: 'Build the thermal and GEOINT baseline', need: 4, desc: 'Pattern-of-life on every candidate site. Cheap now, impossible to compress later.', done: 'Survey +30, intelligence quality +15.', fx(s) { s.verify.survey += 30; s.intelQ += 15; } },
  { id: 'inspect', name: 'Inspectors, chip ledger, whistleblower lines', need: 4, desc: 'Former IAEA and DTRA inspectors who know what a GPU hall looks like, a ledger of every frontier chip, and protected reporting lines at the labs.', done: 'Inspections +30, and smuggling gets harder.', fx(s) { s.verify.inspect += 30; s.cn.smuggleT = Math.max(0, s.cn.smuggleT - 0.15); } },
  { id: 'zk', name: 'Cryptographic proof-of-training', need: 5, desc: 'Zero-knowledge proofs of what a cluster trained. Rigorous and elegant.', done: 'Novel tech +30. It will not count during Phase 1: nobody trusts it yet.', fx(s) { s.verify.novel += 30; } },
  { id: 'track2', name: 'Track 2 dialogue with Chinese scientists', need: 3, desc: 'A shared evidence base on loss of control, reached through their own work.', done: 'Beijing trust +20; their science faction gains ground.', fx(s) { s.cn.trust += 20; shiftCN(s, { sci: 8, sec: -3 }); } },
  { id: 'legal', name: 'Legal authorities study (DPA, IEEPA)', need: 2, desc: 'What the President can actually do on day one, and what survives a court.', done: 'Emergency orders are far less likely to be enjoined, and the DPA threat becomes credible.' },
  { id: 'control', name: 'AI control protocols with the labs', need: 4, desc: 'Trusted monitoring, restricted permissions, control evaluations that gate scaling.', done: 'Runaway risk at careful or covered labs falls 40%; automation limits are easier to sign. Monitoring overhead slows US labs 5%.' },
  { id: 'sl5', name: 'Raise the labs to SL5', need: 8, desc: 'Hardware-enforced access, air-gapped research networks, two-person integrity. Built to stop a nation-state, and a slog: months of rebuilding networks, vetting staff and fighting the labs over every air gap. Requires SL4 first.', done: 'Security SL5: a theft attempt succeeds 4% of the time instead of 50%. Air gaps and vetting slow US labs 20% (instead of SL4\u2019s 8%). Labs -12, industry -6, markets -3.', fx(s) { setSL(s, 5); s.labs.forEach(l => l.rel -= 12); industry(s, -6); s.markets -= 3; } },
];

const ASKS = {
  vp: [
    { text: 'Say publicly: no taxpayer backstops for AI companies.', pc: 1, fx(s) { industry(s, -8); s.labs.forEach(l => l.rel -= 4); s.salience += 2; return 'You say it on a Sunday show. The VP texts a thumbs-up. Mindscale’s CFO does not.'; } },
    { text: 'Ban Chinese AI models from federal systems.', pc: 1, fx(s) { s.tension += 4; shiftCN(s, { sec: 2 }); return 'The ban goes out by memo. Beijing calls it discrimination.'; } },
    { text: 'Put a jobs guarantee in every AI announcement.', pc: 2, fx(s) { s.cred += 2; industry(s, -5); return 'The jobs language polls well in Ohio.'; } },
  ],
  cos: [
    { text: 'Hand the Chief a visible win before the midterms.', pc: 2, avail: s => s.t < 1.0, fx(s) { s.cred += 3; s.salience += 2; return 'You give the Chief a rally line about chip smugglers. It lands.'; } },
    { text: 'Keep Commerce in its lane.', pc: 1, fx(s) { infl(s, 'doc', -8); rel(s, 'doc', -20); return 'Commerce is cut out of two meetings. The Commerce Secretary notices.'; } },
    { text: 'No surprises: pre-brief the Chief on everything.', pc: 1, fx(s) { s.flags.cosBriefed = true; return 'You start sending the Chief a 7:00a note. It gets read.'; } },
  ],
  tsy: [
    { text: 'No new chip restrictions before the trade summit.', pc: 1, fx(s) { s.flags.summitHold = s.turn + 3; return 'Chip restrictions are frozen for three turns.'; } },
    { text: 'A market stabilization plan before any pause.', pc: 2, fx(s) { s.flags.marketPlan = true; return 'Treasury drafts a liquidity backstop. Any pause will hit markets half as hard.'; } },
    { text: 'Back a market lane in any China deal.', pc: 1, fx(s) { s.flags.laneCommit = true; return 'You promise. Treasury will remember if an offer leaves it out.'; } },
  ],
  doc: [
    { text: 'Let Commerce chair any pacing regime.', pc: 2, fx(s) { s.flags.commerceChairs = true; infl(s, 'doc', 8); rel(s, 'cos', -12); rel(s, 'tsy', -10); return 'The Commerce Secretary is delighted. The Chief of Staff and the Treasury Secretary are not.'; } },
    { text: 'Promise startups an exemption: nothing below 1e21 OP/s.', pc: 1, fx(s) { s.flags.floor21 = true; return 'The 1e20 threshold is off the table.'; } },
    { text: 'Give Commerce credit for the next smuggling bust.', pc: 1, fx(s) { infl(s, 'doc', 4); rel(s, 'sec', -5); s.cn.smuggleT = Math.max(0, s.cn.smuggleT - 0.05); return 'Commerce gets the press release.'; } },
  ],
  sec: [
    { text: 'Entity-list the Johor operator.', pc: 2, fx(s) { s.cn.remoteT = Math.min(s.cn.remoteT, 0.6); s.tension += 8; shiftCN(s, { sec: 3 }); s.coalition -= 3; return 'Selat Data goes on the Entity List. Kuala Lumpur is unhappy.'; } },
    { text: 'Raise human rights in every Beijing channel.', pc: 1, fx(s) { s.cn.trust -= 5; return 'The talking points go in. The Chinese side walks out of one session.'; } },
  ],
  war: [
    { text: 'A DoD carve-out from any compute threshold.', pc: 2, fx(s) { s.flags.dodCarve = true; shiftCN(s, { sci: -4, sec: 2 }); return 'Beijing’s analysts read the carve-out as the real program.'; } },
    { text: 'Frontier models on classified networks this quarter.', pc: 1, fx(s) { L(s, 'mindscale').rel += 8; shiftCN(s, { sec: 2 }); return 'Mindscale wins the first task order.'; } },
  ],
  dni: [
    { text: 'Reprogram NIP funds toward compute verification.', pc: 2, fx(s) { s.verify.survey += 8; s.intelQ += 8; if (s.warp === 0) s.warp = 1; return 'The reprogramming notice goes to the committees. Verification funding starts flowing.'; } },
    { text: 'Let the IC lead verification, not Commerce.', pc: 1, fx(s) { rel(s, 'doc', -12); infl(s, 'dni', 6); return 'The DNI owns verification. Commerce sulks.'; } },
  ],
};

/* ================= state accessors ================= */
// Rivalries: helping one side of a feud costs you with the other.
const RIVALS = { doc: ['tsy', 'cos', 'dni', 'vp'], tsy: ['doc', 'sec'], cos: ['doc'], sec: ['tsy'], dni: ['doc'], vp: ['doc'], war: [] };
function rivalHit(s, id, d) { (RIVALS[id] || []).forEach(r => rel(s, r, -d)); }
const PIDX = {}; PRINCIPALS.forEach((p, i) => PIDX[p.id] = i);
const LIDX = {}; LABS.forEach((l, i) => LIDX[l.id] = i);
function P(s, id) { return s.principals[PIDX[id]]; }
function PD(s, id) { const st = P(s, id); const base = PRINCIPALS[PIDX[id]]; if (!st.alt) return base; const a = ALTS[id]; return Object.assign({}, base, { bio: a.bio, prefs: Object.assign({ pause: 0, hawk: 0, markets: 0, deal: 0, control: 0, industry: 0, military: 0, commerce: 0, ic: 0, allies: 0 }, a.prefs), sal: a.sal }); }
// 'Industry' = the labs and the Commerce Secretary, who speaks for them.
function industry(s, d) { s.labs.forEach(l => { l.rel = clamp(l.rel + 0.6 * d, -100, 100); }); rel(s, 'doc', 0.5 * d); }
function rel(s, id, d) { const p = P(s, id); p.rel = clamp(p.rel + d, -100, 100); }
function infl(s, id, d) { const p = P(s, id); p.infl = clamp(p.infl + d, 0, 100); }
function L(s, id) { return s.labs[LIDX[id]]; }
function LD(id) { return LABS[LIDX[id]]; }
function log(s, text, tone) { s.log.push({ t: s.t, turn: s.turn, text, tone: tone || 'info' }); }
function shiftCN(s, d) { const f = s.cn.f; for (const k in d) f[k] = Math.max(3, f[k] + d[k]); const sum = f.m + f.sec + f.sci; f.m *= 100 / sum; f.sec *= 100 / sum; f.sci *= 100 / sum; }

function frontier(s) { return Math.max.apply(null, s.labs.map(l => l.cap)); }
function frontierLab(s) { let b = s.labs[0]; s.labs.forEach(l => { if (l.cap > b.cap) b = l; }); return b; }
function lead(s) { return frontier(s) - s.cn.cap; }
function paced(s) { return !!s.pacing.active; }
function covered(s, lab) { if (!paced(s)) return false; return lab.covered; }
function coverage(s) { return Math.round(100 * s.labs.reduce((a, l) => a + (covered(s, l) ? LD(l.id).share * (l.id === 'mindscale' && s.flags.uaeOut ? 1 - TUNE.uaeShare : 1) : 0), 0)); }
// China's compute by channel at baseline: IFP's end-2026 stocks (Fist, Adamson & Pilz, Oct 2026) scaled to 90%, plus 10% no rule reaches.
// HBM and tool curbs (sme) trim at most 5% of domestic within the game: the servicing ban bites only once the fleet falls below China's HBM-limited output.
function cnSources(c) { return { domestic: 0.34 * (0.95 + 0.05 * c.sme), offshore: 0.20 * c.remote, smuggled: 0.20 * c.smuggle, legal: 0.16 * c.legal, other: 0.10 }; }
function cnComp(s) { const src = cnSources(s.cn); return (src.domestic + src.offshore + src.smuggled + src.legal + src.other) * (1 + 0.25 * s.cn.race); }
function trigMult(s) { return { '425': 0.55, '200': 0.8, '200c': 1.0, '100': 0.92 }[s.pacing.trigger] || 0.5; }
function ready1(s) { const v = s.verify; return (v.survey + v.inspect) / 2; }
function ready2(s) { const v = s.verify; const xs = COMPONENTS.map(c => v[c.id]); return { avg: xs.reduce((a, b) => a + b, 0) / xs.length, min: Math.min.apply(null, xs) }; }
function detection(s) { const v = s.verify; return clamp(0.08 + 0.5 * (v.inspect / 100) * trigMult(s) + (s.pacing.automation ? 0.12 : 0) + (s.flags.surgeTurn === s.turn ? 0.25 : 0) + (s.verify.novel > 50 ? 0.08 : 0), 0, 0.9); }
function cnVisibility(s) { const v = s.verify; const insp = s.cn.deal && s.cn.deal.terms.inspect; return clamp(0.08 + 0.3 * (v.survey / 100) * trigMult(s) + (insp ? 0.25 * v.inspect / 100 : 0) + 0.35 * s.intelQ / 100, 0, 0.92); }
// Chance a signed Phase 2 agreement hides a Chinese program you could not see: certain if cheating is under way now, otherwise falling with enforcement (half intelligence, half survey and inspections).
// The IC's confidence that an alert is real cheating: centered on the truth, blurred by weak intelligence.
function cheatConf(s, real) { const x = (real ? 0.72 : 0.28) + (hash01(s.seed, 'cheatconf', s.turn) - 0.5) * 1.3 * (1 - s.intelQ / 100); return x < 0.38 ? 'low' : x < 0.62 ? 'moderate' : 'high'; }
function enforcement(s) { const v = s.verify, insp = s.cn.deal && s.cn.deal.terms.inspect; return 0.5 * s.intelQ / 100 + 0.25 * Math.min(100, v.survey) / 100 + (insp ? 0.25 * Math.min(100, v.inspect) / 100 : 0); }
// What you can know: the hidden-program risk your enforcement leaves, ignoring whether China is cheating right now.
function hiddenRisk(s) { return clamp(TUNE.betray * (TUNE.betrayAt - enforcement(s)), 0.02, 0.8); }
function betrayP(s) { return s.cn.cheat ? 1 : hiddenRisk(s); }
function betrayWord(s) { const p = hiddenRisk(s); return p < 0.08 ? 'high' : p < 0.25 ? 'moderate' : 'low'; }

// US drag: what our own moves cost American labs, as a fraction of their growth rate.
function usDrag(s) {
  const parts = [];
  if (SL[s.sl].drag) parts.push(['SL' + s.sl + ' security overhead', SL[s.sl].drag]);
  if (s.done.control) parts.push(['AI control protocols', 0.05]);
  if (s.policies.distill) parts.push(['API know-your-customer friction', 0.015]);
  if (s.policies.methods) parts.push(['Research secrecy and visa screening', 0.015]);
  if (s.policies.remote) parts.push(['Lost foreign cloud revenue', 0.02]);
  if (s.policies.chips) parts.push(['Chip export revenue and supply friction', 0.03]);
  if (s.flags.minerals && s.flags.minerals.until >= s.turn) parts.push(['Beijing\u2019s mineral export curbs', s.flags.minerals.d]);
  if (s.flags.strait && s.flags.strait >= s.turn) parts.push(['Taiwan Strait disruption', 0.12]);
  return { total: Math.min(0.45, parts.reduce((a, x) => a + x[1], 0)), parts };
}
function usRates(s, assumeCompliant) {
  // monthly capability growth for each lab under current policy; the public view assumes nobody is cheating
  return s.labs.map(l => {
    const d = LD(l.id);
    const drag = usDrag(s).total;
    if (!covered(s, l)) return d.speed * (s.policies.accelerate ? 1.15 : 1) * (1 - drag);
    if (l.defect && !assumeCompliant) return 0.7;
    const th = { '1e20': 0.06, '1e21': 0.12, '1e22': 0.7 }[s.pacing.threshold] || 0.12;
    return (th + (s.pacing.automation ? 0 : 0.28) + (l.id === 'mindscale' && s.flags.uaeOut ? TUNE.uaeRate : 0)) * (1 - drag / 2);
  });
}
function cnRate(s) {
  const c = s.cn, gap = lead(s);
  const p = paced(s);
  // metr_graph's split of China's pace, in US-pace units: own research 0.26, compute 0.15, distillation 0.27, leaked methods 0.22.
  // Compute is raised to 0.25 (own research down to 0.16) as a hedge: the split measures compute at its growth rate, not a sudden cut.
  // Under a pause, as in metr_graph: distillation keeps copying the paused frontier, falling with the gap left (gap / gap at the pause);
  // leaked methods fade as China absorbs what already leaked, over a year. Copying shrinks when there is little left to copy.
  const gap0 = s.pacing.gap0 || Math.max(0.5, gap), pm = p ? Math.max(0, s.t - (s.pacing.since == null ? s.t : s.pacing.since)) : 0;
  const copy = (0.34 * c.dist * (p ? clamp(gap / gap0, 0, 1) : 1) + 0.22 * (c.leak == null ? 1 : c.leak) * (p ? Math.max(0, 1 - pm / 12) : 1)) * (gap > 0.5 ? 1 : 0.3);
  let r = (c.inno == null ? 0.16 : c.inno) + 0.25 * cnComp(s) + copy;
  if (c.deal && !c.cheat) r = Math.min(r, 0.12);
  if (c.deal && c.cheat) r = Math.min(r, 0.12) + 0.45;
  return r;
}
function frontierRate(s, pub) { const rs = usRates(s, pub); const fl = frontierLab(s); return rs[LIDX[fl.id]]; }

// Senate votes for a pacing statute (60 to pass), as labeled parts so the UI can show where they come from.
function senateParts(s) {
  const P_ = [['Base', TUNE.senateBase], ['Salience', 0.35 * s.salience], ['Markets', 0.12 * (s.markets - 100)], ['Coalition of allies', 0.12 * s.coalition], ['Your work on the Hill', s.senateLobby]];
  if (s.cn.deal) P_.push(['A deal with Beijing in force', 6]);
  if (lead(s) >= 6) P_.push(['A lead of 6+ months', 4]);
  if (s.cn.deal && s.cn.deal.terms.chips) P_.push(['Deal resumes chip sales', -6]);
  if (s.cn.deal && s.cn.deal.terms.relief) P_.push(['Deal gives sanctions relief', -3]);
  if (s.flags.houseFlipped) P_.push(['Opposition House holding AI hearings', 2]);
  return P_;
}
function senateVotes(s) { return Math.round(clamp(senateParts(s).reduce((a, x) => a + x[1], 0), 0, 100)); }
function pauseMood(s) { // influence-weighted cabinet stance on pacing, -1..1
  let n = 0, d = 0;
  s.principals.forEach(p => { const def = PD(s, p.id); const x = def.prefs.pause + p.shift + def.sal * (s.salience - 35) / 40 + p.rel / 120; n += p.infl * Math.tanh(x / 1.6); d += p.infl; });
  return n / d;
}
// Pacing support in Phase 1, as labeled parts. Below 25 the pause wobbles; three months below 25 and it breaks.
function supportParts(s) {
  const unsigned = s.labs.reduce((a, l) => a + (covered(s, l) ? (l.id === 'mindscale' && s.flags.uaeOut && TUNE.uaeSupport ? LD(l.id).share * TUNE.uaeShare : 0) : LD(l.id).share), 0);
  const ld = lead(s);
  const months = s.flags.monthsInP1 || 0;
  const P_ = [['Base', 30], ['Pause fatigue (' + months + ' months)', -(paced(s) ? 3.5 * Math.max(0, months - 1) : 0)], ['Salience', 0.35 * (s.salience - 30)], ['The cabinet\u2019s view of pacing', 30 * pauseMood(s)], ['Markets', 0.5 * (s.markets - 100)]];
  if (s.cn.deal) P_.push(['China has signed on', 12]);
  if (ld < 4) P_.push(['China is close behind', ld < 2 ? -15 : -6]);
  if (unsigned > 0) P_.push(['Labs racing outside the regime', -30 * unsigned]);
  if (s.flags.incidentTurn && s.turn - s.flags.incidentTurn <= 2) P_.push(['A recent scare', 8]);
  if (s.flags.wentFirst && !s.cn.deal) P_.push(['America went first, and China hasn\u2019t followed', -8]);
  if (s.flags.extended) P_.push(['The deadline was extended', -4 * s.flags.extended]);
  return P_;
}
function pacingSupport(s) { return Math.round(clamp(supportParts(s).reduce((a, x) => a + x[1], 0))); }
// Relationship tiers. Each point also moves that principal's vote on every Oval decision.
function relTier(r) { return r >= 40 ? 'Ally' : r >= 15 ? 'Friendly' : r > -15 ? 'Neutral' : r > -40 ? 'Cool' : 'Hostile'; }
// Hostile principals undercut you with the President: 2 credibility a month at influence 60, scaled by influence, at most 3 in total.
function hostileDrain(s) { return Math.min(3, s.principals.reduce((a, p) => a + (p.rel <= -40 ? 2 * p.infl / 60 : 0), 0)); }
function allyCount(s) { return s.principals.filter(p => p.rel >= 40).length; }
// Capital income per turn. Markets add or subtract 1 per 20 points from 100; fractions carry over between turns.
function marketCapital(s) { return (s.markets - 100) / 20; }
function capitalIncome(s) { return (s.phase === 'scramble' ? 2 : (s.phase === 'p1' ? 2 : 1) + Math.floor(s.cred / 35)) + Math.floor(allyCount(s) / 3) + marketCapital(s); }
// Per-month probability that something escapes control, for each actor. The threshold is fuzzy: danger rises
// smoothly with capability (about 10% of full strength 3 months short, 75% at the threshold, nearly full past it).
function nearness(s, cap) { return logistic((cap - s.T + 1) / 0.9); }
function hazards(s) {
  const out = [];
  s.labs.forEach(l => {
    const d = LD(l.id);
    let h;
    if (!covered(s, l)) h = 0.30; else if (l.defect) h = 0.15; else h = s.pacing.automation ? 0.02 : 0.10;
    if (s.done.control && (covered(s, l) || d.safety >= 50)) h *= 0.6;
    if (s.flags.dodCarve) h += 0.01;
    if (l.id === 'mindscale' && s.flags.uaeOut && covered(s, l) && TUNE.uaeHazard) h = (1 - TUNE.uaeShare) * h + TUNE.uaeShare * 0.30; // the UAE share trains unconstrained
    h *= nearness(s, l.cap);
    if (h > 0.002) out.push({ who: l.id, name: d.name, h, near: l.cap < s.T });
  });
  const hc = (s.cn.deal && !s.cn.cheat ? 0.02 : 0.15) * nearness(s, s.cn.cap);
  if (hc > 0.002) out.push({ who: 'china', name: 'China', h: hc, near: s.cn.cap < s.T });
  return out;
}
// When something escapes, the chance it is caught in time: likelier early on the curve.
function warningShotP(s, who) { const cap = who === 'china' ? s.cn.cap : L(s, who).cap; return 0.15 + 0.6 * (1 - nearness(s, cap)); }
// Weight theft: Beijing attempts more when racing, when the US is paced, and when far behind; success depends on weight security.
// pub: the player's view, which reads the ramp off the IC's threshold estimate so the theft-risk word doesn't leak the true threshold
function theftRisk(s, pub) {
  const c = s.cn, F = frontier(s);
  const T = pub ? Math.max(0.5, F + icEstimate(s).mid * Math.max(0.05, frontierRate(s, true))) : s.T;
  // attempts ramp as the US frontier nears the RSI threshold: x0.5 at the start, x1 a bit past halfway, x2 at the threshold; a deal holds them at the base rate
  const x = clamp(F / T, 0, 1.2), ramp = c.deal ? Math.min(1, 0.5 + 1.5 * x * x) : 0.5 + 1.5 * x * x;
  const attempt = TUNE.theftBase * ramp * DIFFS[s.diff].theft * (c.posture === 'race' ? 2.2 : 1) * (paced(s) ? 1.3 : 1) * (lead(s) > 6 ? 1.3 : 1);
  const success = SL[s.sl].theft;
  return { attempt, success, net: attempt * success };
}
function monthlyRisk(s) { return 1 - hazards(s).reduce((a, x) => a * (1 - x.h), 1); }

/* ================= indicators ================= */
function trueIndicators(s, F) {
  const c = s.cal || {}, m = calMult(s); const Tk = k => s.T * (1 + m * (c[k] || 0));
  const r = k => Math.max(0.02, F / Tk(k));
  return { uplift: 1 + 9 * Math.pow(r('uplift'), 2.5), cobench: Math.min(99, 85 * Math.pow(r('cobench'), 1.2)), horizon: 174 * Math.pow(2, (F - Tk('horizon')) / 5), arr: 1000 * Math.pow(2, (F - Tk('arr')) / 4.5) };
}
// Better intelligence corrects the game's standing miscalibration: the indicator markers and the IC's bias sit closer to the truth.
function calMult(s) { return clamp(1.2 - 0.8 * s.intelQ / 100, 0.4, 1.2); }
function recordIndicators(s) {
  const F = frontier(s);
  const sig = 0.3 * (1 - s.intelQ / 150) * (s.flags.assessUntil >= s.turn ? 0.5 : 1);
  const tr = trueIndicators(s, F);
  const n = () => Math.exp(gauss(s) * sig);
  s.ind.push({ t: s.t, uplift: tr.uplift * n(), cobench: Math.min(99, tr.cobench * n()), horizon: tr.horizon * n(), arr: tr.arr * n() });
}
function rObserved(s) {
  const i = s.ind[s.ind.length - 1];
  const ra = Math.pow(Math.max(0, (i.uplift - 1) / 9), 1 / 2.5);
  const rb = Math.pow(i.cobench / 85, 1 / 1.2);
  return (ra + rb) / 2;
}
function icEstimate(s) {
  // the IC's estimate of months until RSI becomes possible, with its error bar
  const F = frontier(s), rate = Math.max(0.05, frontierRate(s, true));
  // error grows as the frontier nears the threshold: nobody has seen this regime before
  const err = (2.5 + 5 * (1 - s.intelQ / 100) * (s.flags.assessUntil >= s.turn ? 0.45 : 1)) + 4 * Math.max(0, F / s.T - 0.6);
  const bias = (hash01(s.seed, 'Test', Math.floor(s.turn / 3)) - 0.5) * err;
  const mid = Math.max(0, (s.T - F + bias + calMult(s) * (s.icBias || 0)) / rate);
  return { mid, lo: Math.max(0, mid - err / rate), hi: mid + err / rate, err };
}
// The IC's read on Beijing: each figure carries its own slowly drifting error, which shrinks with intelligence quality.
function cnEstimate(s) {
  const c = s.cn, rel = (0.05 + 0.3 * (1 - s.intelQ / 100)) * (s.flags.assessUntil >= s.turn ? 0.5 : 1);
  const k = Math.floor(s.turn / 3), fr = (s.turn % 3) / 3;
  const noise = key => ((hash01(s.seed, 'cn' + key, k) * (1 - fr) + hash01(s.seed, 'cn' + key, k + 1) * fr) - 0.5) * 2 * rel;
  const src = cnSources(c);
  for (const key in src) src[key] = Math.max(0, src[key] * (1 + noise(key)));
  const comp = cnComp(s) * (1 + noise('comp')), sum = Object.values(src).reduce((a, x) => a + x, 0) || 1;
  for (const key in src) src[key] *= comp / sum;
  return { comp, src, dist: clamp(c.dist + noise('dist') * 0.6, 0, 1), rate: Math.max(0, cnRate(s) * (1 + noise('rate'))), rel };
}
// How precisely the advisor can read Beijing: words while intelligence is patchy, ranges once decent, numbers once sharp. An IC assessment counts as +20.
function cnReadout(s) {
  const e = cnEstimate(s), q = s.intelQ + (s.flags.assessUntil >= s.turn ? 20 : 0), tier = q < 45 ? 0 : q < 70 ? 1 : 2;
  const P = x => Math.round(100 * x), rng = (x, err, cap = 1e9) => `${Math.max(0, Math.floor(P(x - err) / 10) * 10)}–${Math.min(cap, Math.ceil(P(x + err) / 10) * 10)}%`;
  const fmt = (x, err, word, cap, suf = '') => tier === 0 ? word(x) : tier === 1 ? rng(x, err, cap) + suf : `~${P(x)}%${suf} ±${Math.max(1, P(err))}`;
  const compWord = x => x < 0.6 ? 'sharply cut' : x < 0.85 ? 'somewhat cut' : x < 1.1 ? 'about normal' : 'above normal';
  const distWord = x => x > 0.7 ? 'heavy' : x > 0.35 ? 'some' : x > 0.1 ? 'a little' : 'almost none';
  const shareWord = x => x > 0.35 ? 'most of it' : x > 0.15 ? 'a large share' : x > 0.06 ? 'a small share' : 'a sliver';
  const us = Math.max(0.05, frontierRate(s, true)), rr = e.rate / us;
  const src = {};
  for (const k in e.src) src[k] = tier === 0 ? shareWord(e.src[k] / (e.comp || 1)) : tier === 1 ? rng(e.src[k], e.rel * e.src[k]) : `~${P(e.src[k])}%`;
  // the same information as numbers, for bots: a word reads as its bucket's middle, a range as its midpoint
  const mid = (x, err, cap = 1e9) => (Math.max(0, Math.floor(P(x - err) / 10) * 10) + Math.min(cap, Math.ceil(P(x + err) / 10) * 10)) / 200;
  const bucket = (x, cuts, mids) => mids[cuts.findIndex(c => x < c) < 0 ? cuts.length : cuts.findIndex(c => x < c)];
  const compSeen = tier === 0 ? bucket(e.comp, [0.6, 0.85, 1.1], [0.5, 0.72, 0.97, 1.25]) : tier === 1 ? mid(e.comp, e.rel * e.comp) : e.comp;
  const seen = { comp: compSeen, dist: tier === 0 ? bucket(e.dist, [0.1, 0.35, 0.7], [0.05, 0.22, 0.52, 0.85]) : tier === 1 ? mid(e.dist, 0.6 * e.rel, 100) : e.dist };
  for (const k in e.src) seen[k] = tier === 0 ? compSeen * bucket(e.src[k] / (e.comp || 1), [0.06, 0.15, 0.35], [0.03, 0.1, 0.25, 0.45]) : tier === 1 ? mid(e.src[k], e.rel * e.src[k]) : e.src[k];
  return {
    tier, src, est: e, seen,
    comp: fmt(e.comp, e.rel * e.comp, compWord, undefined, ' of baseline'), dist: fmt(e.dist, 0.6 * e.rel, distWord, 100),
    rate: tier === 0 ? (rr > 1.15 ? 'faster than the US' : rr > 0.85 ? 'about the US pace' : 'slower than the US') : tier === 1 ? `${(Math.round(e.rate * (1 - e.rel) * 10) / 10).toFixed(1)}–${(Math.round(e.rate * (1 + e.rel) * 10) / 10).toFixed(1)} mo/mo` : `~${(Math.round(e.rate * 10) / 10).toFixed(1)} mo/mo`,
    note: ['Patchy intelligence: the IC can only characterize these.', 'Decent intelligence: the IC gives ranges.', 'Sharp intelligence: the IC gives point estimates.'][tier],
  };
}
function leadEstimate(s) {
  const err = 0.3 + 2.4 * (1 - s.intelQ / 100);
  const k = Math.floor(s.turn / 3), fr = (s.turn % 3) / 3;
  const bias = ((hash01(s.seed, 'lead', k) * (1 - fr) + hash01(s.seed, 'lead', k + 1) * fr) - 0.5) * 2 * err;
  return { mid: lead(s) + bias, err };
}
function crossoverMonths(s) {
  const gap = lead(s); const dr = cnRate(s) - frontierRate(s, true);
  if (gap <= 0) return 0;
  if (dr <= 0.01) return Infinity;
  return gap / dr;
}

/* ================= new game ================= */
function newGame(opts) {
  opts = opts || {};
  const seed = (opts.seed != null ? opts.seed : Math.floor(Math.random() * 2147483647)) | 0;
  const dk = DIFFS[opts.difficulty] ? opts.difficulty : 'advisor';
  const D = DIFFS[dk];
  const s = {
    v: 1, seed, rs: seed, diff: dk, t: START_T, turn: 1, phase: 'p0',
    ap: D.ap, apMax: D.ap, pc: 4, cred: D.cred, alarm: 8, salience: 28, markets: 100, tension: D.tension, coalition: 30,
    W: 25, sl: 3, intelQ: 30, senateLobby: 0, overhang: 0, riskExposure: 0, warp: 0,
    verify: { survey: 15, inspect: 8, novel: 5 },
    projects: {}, done: {}, policies: {}, flags: { cooldowns: {} },
    principals: PRINCIPALS.map(p => ({ id: p.id, infl: p.infl, rel: 0, shift: 0, ask: 0, alt: false, askAge: 0 })),
    labs: LABS.map(l => ({ id: l.id, cap: l.cap0, signed: false, covered: false, comp: 0, defect: false, rel: l.rel0, refused: false })),
    cn: { cap: -6, leak: 1, leakT: 1, legal: 1, legalT: 1, smuggle: 1, smuggleT: 1, sme: 1, smeT: 1, remote: 1, remoteT: 1, dist: 1, distT: 1, race: 0,
      f: { m: 50, sec: 30, sci: 20 }, posture: 'diffuse', trust: 10, deal: null, cheat: false, cooldown: 0 },
    pacing: { active: false, mech: null, threshold: null, automation: null, trigger: null, since: null, low: 0, collapsed: 0 },
    scramble: null, T: 0,
    hist: [], ind: [], log: [], queue: [], seen: {}, roomUsed: 0, report: null, ending: null,
    stats: { roomWon: 0, roomLost: 0, thefts: 0, defectCaught: 0, defectMissed: 0, peakLead: 5.5, monthsPaced: 0, scrambleStart: null, briefFails: 0, covert: 0 },
  };
  s.T = clamp(D.Tmed * Math.exp(0.4 * gauss(s)), 6.5, 22);
  // hidden per-game miscalibration: each indicator's marker sits somewhat off the true threshold, and the IC has a standing bias
  s.cal = { uplift: clamp(0.15 * gauss(s), -0.3, 0.3), cobench: clamp(0.15 * gauss(s), -0.3, 0.3), horizon: clamp(0.15 * gauss(s), -0.3, 0.3), arr: clamp(0.15 * gauss(s), -0.3, 0.3) };
  s.icBias = clamp(2.2 * gauss(s), -4.5, 4.5);
  cnStart(s);
  if (dk === 'excomm') { s.cn.f = { m: 45, sec: 37, sci: 18 }; }
  recordIndicators(s); pushHist(s);
  log(s, 'You start as the White House AI Czar. Your office is in the EEOB, Room 374. Your team is you.', 'info');
  s.queue.push({ id: 'intro' });
  return s;
}
// Hidden per-game starting point for China's lag, offshore compute, smuggling and distillation (1 = baseline). Smuggling is log-uniform 0.4-2.4x, skewed like IFP's range. Drawn from hash01 so the main random stream is untouched.
function cnStart(s) {
  const c = s.cn, u = k => hash01(s.seed, 'cnstart', k);
  c.base = { remote: 0.5 + u('remote'), smuggle: 0.4 * Math.pow(6, u('smuggle')), dist: 0.6 + 0.4 * u('dist') };
  // starting lag: lognormal, median 6 months (80% range ~4.1-8.8), around metr_graph's 4.4-6.5 months
  const z = Math.sqrt(-2 * Math.log(Math.max(1e-9, u('lag1')))) * Math.cos(2 * Math.PI * u('lag2'));
  c.cap = -clamp(6 * Math.exp(0.3 * z), 3.5, 11); s.stats.peakLead = -c.cap;
  // own research: lognormal around 0.16, 80% range ~0.07-0.35, inside metr_graph's 0.05-0.48 band for China's pure innovation
  const z2 = Math.sqrt(-2 * Math.log(Math.max(1e-9, u('inno1')))) * Math.cos(2 * Math.PI * u('inno2'));
  c.inno = clamp(0.16 * Math.exp(0.6 * z2), 0.04, 0.5);
  c.remote = c.remoteT = c.base.remote; c.smuggle = c.smuggleT = c.base.smuggle; c.dist = c.distT = c.base.dist;
}
const cnBase = s => s.cn.base || { remote: 1, smuggle: 1, dist: 1 };
function pushHist(s) { s.hist.push({ t: s.t, F: frontier(s), cn: s.cn.cap, cnEst: leadEstimate(s).mid, labs: s.labs.map(l => l.cap), paced: paced(s), phase: s.phase, salience: s.salience, tension: s.tension, markets: s.markets }); }

/* ================= the room ================= */
function stanceOn(s, p, tags, key, extra) {
  const d = PD(s, p.id);
  let x = 0;
  for (const k in tags) {
    let w = d.prefs[k] || 0;
    if (k === 'pause') w += p.shift + d.sal * (s.salience - 35) / 40;
    x += w * tags[k];
  }
  x += p.rel / 60;
  if (extra && extra[p.id]) x += extra[p.id];
  x += (hash01(s.seed, s.turn, key, p.id) - 0.5) * 0.8;
  return Math.tanh(x / 1.6);
}
function presBias(s, tags) {
  // The President wants a deal with Xi: hawk moves get easier only as Beijing provokes (thefts, busts, a racing posture).
  const hawk = TUNE.hawkBase + TUNE.hawkProvoke * Math.min(3, s.provoked || 0) + (s.cn.posture === 'race' ? TUNE.hawkRace : 0);
  let b = 0.06 * (tags.control || 0) + hawk * (tags.hawk || 0) + 0.03 * (tags.military || 0);
  if (tags.deal) b += 0.05 * tags.deal * (lead(s) > 3 ? 1 : -1);
  b += (0.02 + 0.004 * Math.max(0, 100 - s.markets)) * (tags.markets || 0); // the worse the markets, the more the President weighs market costs
  return b;
}
function roomMax(s) { if (s.phase === 'scramble') return 2; return (s.phase === 'p0' ? 1 : 2) + (P(s, 'cos').rel >= 40 ? 1 : 0); }
function roomPreview(s, id, params) {
  const a = ACT[id]; params = params || {};
  const tags = typeof a.tags === 'function' ? a.tags(s, params) : a.tags;
  const key = id + ':' + (params.variant || '') + ':' + (params.key || '');
  const extra = a.extra ? a.extra(s, params) : null;
  let num = 0, den = 0; const positions = [];
  s.principals.forEach(p => {
    const st = stanceOn(s, p, tags, key, extra);
    num += p.infl * st; den += p.infl;
    const band = st > 0.25 ? 'yes' : st < -0.25 ? 'no' : 'mid';
    const qs = QUOTES[p.id][band];
    positions.push({ id: p.id, name: PD(s, p.id).name, title: PD(s, p.id).title, stance: st, band, infl: p.infl, quote: qs[Math.floor(hash01(s.seed, key, p.id, 'q') * qs.length)] });
  });
  let score = num / den + presBias(s, tags) + (a.pres ? a.pres(s, params) : 0) + 0.25 * (s.cred - 50) / 50;
  if ((tags.pause || 0) > 0) score += (s.phase === 'p0' ? (s.alarm - 60) / 300 : 0.12);
  if (s.phase === 'scramble' && s.done.memo) score += 0.08;
  if (s.flags.momentum && s.flags.momentum.id === id && s.flags.momentum.until >= s.turn && (!s.flags.momentum.variant || s.flags.momentum.variant === params.variant)) score += 0.15;
  positions.sort((x, y) => y.stance * y.infl - x.stance * x.infl);
  return { p: logistic(5 * score), score, positions };
}

/* ================= actions ================= */
// cats: prep, policy, politics, intel, diplo, labs, verify, covert, crisis
const ACT = {};
function def(a) { ACT[a.id] = a; }

PROJECTS.forEach(pr => def({
  id: 'proj_' + pr.id, cat: 'prep', name: pr.name, phases: pr.p1 === false ? ['p0'] : ['p0', 'p1'], ap: 1, pc: 0, project: pr.id,
  desc: pr.desc, effect: () => pr.done,
  avail(s) { if (s.done[pr.id]) return 'Done'; if (pr.id === 'sl5' && s.sl < 4) return 'Needs the SL4 executive order first'; return true; },
  apply(s) {
    s.projects[pr.id] = (s.projects[pr.id] || 0) + 1;
    if (s.projects[pr.id] >= pr.need) { s.done[pr.id] = true; if (pr.fx) pr.fx(s); log(s, 'Completed: ' + pr.name + '. ' + pr.done, 'good'); return 'Done. ' + pr.done; }
    return 'Progress ' + s.projects[pr.id] + ' of ' + pr.need + '.';
  },
}));

def({ id: 'meet', cat: 'politics', name: 'Meet one-on-one', phases: ['p0', 'scramble', 'p1'], ap: 1, pc: 0,
  params: { kind: 'principal' },
  desc: 'An hour in their office. Builds the relationship and moves their view on pacing a little.',
  effect: () => 'Relationship +10; their stance on pacing shifts toward yours.',
  avail(s, prm) { if (prm && prm.who && s.flags['met_' + prm.who] === s.turn) return 'Already met this turn'; return true; },
  apply(s, prm) { const p = P(s, prm.who); const d = PD(s, prm.who); const per = d.persuade || 1; rel(s, prm.who, (10 + (s.cred > 60 ? 3 : 0)) * (0.4 + 0.6 * per)); rivalHit(s, prm.who, 2); p.shift = Math.min(1.4, p.shift + (0.12 + 0.1 * Math.max(0, (s.salience - 30) / 50)) * per); s.flags['met_' + prm.who] = s.turn; return 'The ' + d.name + ' gives you the hour. ' + pick(s, ['They listen more than you expected.', 'They push back hard, then ask good questions.', 'You leave with a promise to keep talking.']); },
});
def({ id: 'favor', cat: 'politics', name: 'Grant a favor', phases: ['p0', 'scramble', 'p1'], ap: 1, pc: 0,
  params: { kind: 'principal' },
  desc: 'Give a principal what they have been asking for. Big gain with them; often costs you elsewhere.',
  effect: (s, prm) => prm && prm.who ? ('They want: ' + currentAsk(s, prm.who).text) : 'Each principal has a current ask, shown on their card.',
  cost(s, prm) { return { ap: 1, pc: prm && prm.who ? currentAsk(s, prm.who).pc : 0 }; },
  avail(s, prm) { if (prm && prm.who) { const a = currentAsk(s, prm.who); if (a.avail && !a.avail(s)) return 'No longer possible'; } return true; },
  apply(s, prm) { const a = currentAsk(s, prm.who); const txt = a.fx(s); rel(s, prm.who, 25); infl(s, prm.who, 4); rivalHit(s, prm.who, 6); const p = P(s, prm.who); p.ask = (p.ask + 1) % ASKS[prm.who].length; p.askAge = 0; return txt + ' ' + PD(s, prm.who).name + ' will remember this.'; },
});
def({ id: 'brief', cat: 'crisis', name: 'Ask for an emergency meeting', phases: ['p0'], ap: 1, pc: 2,
  desc: 'Tell the President it is time. If the evidence and your credibility carry the room, the scramble starts now. If not, you are the advisor who cried wolf.',
  effect: s => 'Chance the President convenes: ' + Math.round(100 * briefOdds(s)) + '%. Failure costs 10 credibility.',
  apply(s) {
    if (rnd(s) < briefOdds(s)) { s.alarm = 100; s.queue.unshift({ id: 'knock', forced: true }); log(s, 'The Chief of Staff puts an emergency meeting on the calendar.', 'good'); return 'The Chief of Staff reads your note twice, then walks it into the Oval. The meeting is tomorrow morning.'; }
    s.cred -= 10; s.alarm = Math.max(0, s.alarm - 10); s.stats.briefFails++; infl(s, 'doc', 3); rel(s, 'cos', -4);
    log(s, 'Your request for an emergency meeting was declined.', 'bad');
    return 'The President reads the first paragraph and asks whether the labs agree. They don’t, yet. The Commerce Secretary calls it “another doomer fire drill.”';
  },
});
function briefOdds(s) { const ev = 70 * Math.max(0, rObserved(s) - 0.45); return logistic((s.alarm * 0.8 + s.cred * 0.5 + ev + s.salience * 0.3 - 92) / 9); }

def({ id: 'hill', cat: 'politics', name: 'Work the Hill', phases: ['p0', 'scramble', 'p1'], ap: 1, pc: 1,
  avail(s) { return s.flags.statute ? 'Pacing is already law' : s.senateLobby >= 35 ? 'You have done all the Hill work you can' : true; },
  desc: 'Classified briefings for committee chairs, favors for leadership, cosponsors lined up. Builds the votes a pacing statute needs.',
  effect: () => 'Senate +5.',
  apply(s) { s.senateLobby = Math.min(35, s.senateLobby + 5); return pick(s, ['The Armed Services chair asks for the classified annex.', 'Two Commerce Committee Republicans agree to cosponsor.', 'Leadership wants a bill it can pass before recess.']); },
});
def({ id: 'authorize', cat: 'politics', name: 'Ask Congress for pacing authority', phases: ['p0', 'scramble', 'p1'], ap: 1, pc: 2,
  avail(s) { if (s.flags.statute) return 'Pacing is already law'; if (s.flags.billDue) return 'The bill is moving; the vote is in ' + monthLabel(s.flags.billDue); const v = senateVotes(s); return v >= 60 ? true : 'Needs 60 Senate votes to start (now ' + v + ')'; },
  desc: 'A statute that authorizes pacing outright. Slow: the vote comes two months after you send it, and it needs 55 votes still standing then. Once law, courts can no longer enjoin the pause, every lab above the line is covered, and Phase 2 rests on solid ground.',
  effect: () => 'The vote comes in two months. Needs 55 Senate votes on the day.',
  apply(s) { s.flags.billDue = s.t + 2; return 'The bill goes to the floor calendar. Leadership promises a vote in two months.'; },
});
def({ id: 'allies', cat: 'diplo', name: 'Build the allied coalition', phases: ['p0', 'scramble', 'p1'], ap: 1, pc: 1,
  desc: 'Phase 2 is multilateral: it needs allies (London, Tokyo, The Hague, Seoul). Allies also make chip controls stick and win a few Senate votes.',
  effect: s => 'Coalition +' + (s.flags.g7 ? 12 : 8) + ', Senate +' + (s.senateLobby >= 18 ? 0 : 3) + '.',
  apply(s) { s.coalition += s.flags.g7 ? 12 : 8; s.senateLobby = Math.min(18, s.senateLobby + 3); return pick(s, ['The Dutch agree in principle, pending their cabinet.', 'Tokyo wants to see the verification plan first, then agrees.', 'London offers inspectors.']); },
});
def({ id: 'labmeet', cat: 'labs', name: 'Meet a lab CEO', phases: ['p0', 'scramble', 'p1'], ap: 1, pc: 0,
  params: { kind: 'lab' },
  desc: 'Build the relationship before you need it. Labs that trust you sign and comply.',
  effect: () => 'Lab relationship +12; signed labs gain compliance.',
  apply(s, prm) { const l = L(s, prm.lab); l.rel = clamp(l.rel + 12, -100, 100); if (l.signed) l.comp = clamp(l.comp + 6); return LD(l.id).ceo + ' ' + pick(s, ['agrees the race is getting dangerous, off the record.', 'wants to know who else is signing.', 'asks what happens if China doesn’t stop.']); },
});
def({ id: 'assess', cat: 'intel', name: 'Commission an IC assessment', phases: ['p0', 'scramble', 'p1'], ap: 1, pc: 1,
  desc: 'A National Intelligence Estimate on RSI timing and Chinese capability. Sharper readings for three turns.',
  effect: () => 'Indicator noise halved and IC timing estimate narrowed for 3 turns; intelligence quality +5.',
  apply(s) { s.flags.assessUntil = s.turn + 3; s.intelQ += 5; return 'The DNI tasks a crash estimate. The error bars shrink.'; },
});

// ---- Room policies, any phase ----
def({ id: 'distill', cat: 'policy', name: 'Anti-distillation crackdown', phases: ['p0', 'scramble', 'p1'], ap: 1, pc: 2, room: true, once: true,
  tags: { hawk: 1.5, industry: 0.6, commerce: 0.5 },
  desc: 'KYC for frontier APIs, a cutoff for resellers, lawsuits against account farms, detection shared across labs.',
  effect: s => 'The US-model outputs China harvests fall by about 95% over three months. Each 10x of harvested data is worth only about a quarter of the gain, so China keeps about two-thirds of its distillation boost. Worth the most early: much of its value is a one-time boost already baked into where China stands. Costs US labs about 1.5% of their pace (customer friction).',
  apply(s) { s.cn.distT = Math.min(s.cn.distT, 0.68 * cnBase(s).dist); s.tension += 5; shiftCN(s, { sec: 3, m: -3 }); return 'Commerce and the labs announce the crackdown together, including a cutoff for resellers. Three Chinese labs lose 24,000 accounts overnight.'; },
});
def({ id: 'remote', cat: 'policy', name: 'Close the remote-access loophole', phases: ['p0', 'scramble', 'p1'], ap: 1, pc: 2, room: true, once: true,
  tags: { hawk: 1.8, markets: -0.4, allies: -0.5, commerce: 1 },
  avail(s) { return s.flags.summitHold >= s.turn ? 'Treasury hold until the trade summit' : true; },
  desc: 'Chinese firms train their largest runs on data centers abroad, above all in Johor, Malaysia. Close the cloud loophole.',
  effect: () => 'China loses most of its offshore training compute over two months; how much that is depends on how much it has. Beijing temperature +8. US clouds lose foreign revenue: US labs 2% slower.',
  apply(s) { s.cn.remoteT = Math.min(s.cn.remoteT, 0.15); s.tension += 8; shiftCN(s, { sec: 4, m: -2 }); s.coalition -= 3; return 'Commerce issues the rule. Beijing calls it “technological hegemony.”'; },
});
def({ id: 'methods', cat: 'policy', name: 'Stop the leak of US methods', phases: ['p0', 'scramble', 'p1'], ap: 1, pc: 2, room: true, once: true,
  tags: { hawk: 1.2, industry: -0.8, control: 0.4 },
  desc: 'Papers, researchers moving, espionage: every way US research methods reach Chinese labs. Prepublication review at the frontier labs, visa screening, counterintelligence on lab staff.',
  effect: () => 'Cuts 90% of the methods leaking to China. China takes about a year to absorb what already leaked, so the payoff builds slowly. Beijing temperature +4. Openness costs: US labs 1.5% slower.',
  apply(s) { s.cn.leak = s.cn.leak == null ? 1 : s.cn.leak; s.cn.leakT = 0.1; s.tension += 4; shiftCN(s, { sci: -3, sec: 2 }); s.labs.forEach(l => l.rel -= 4); return 'The labs agree to prepublication review. Two conference talks are quietly withdrawn.'; },
});
def({ id: 'smuggle', cat: 'policy', name: 'Chip smuggling enforcement surge', phases: ['p0', 'scramble', 'p1'], ap: 1, pc: 1, room: true, once: true,
  tags: { hawk: 1, commerce: 1, control: 0.5 },
  desc: 'BIS agents in Singapore and the Gulf, location verification on export licenses, prosecutions.',
  effect: () => 'Smuggled compute falls by about half; chip accounting +8.',
  apply(s) { s.cn.smuggleT = Math.max(0, s.cn.smuggleT - 0.5 * cnBase(s).smuggle); s.verify.inspect += 4; s.tension += 2; return 'Forty new enforcement agents deploy. The first indictment comes within weeks.'; },
});
def({ id: 'chips', cat: 'policy', name: 'End chip sales and tool servicing', phases: ['p0', 'scramble', 'p1'], ap: 1, pc: 3, room: true, once: true,
  tags: { hawk: 1.6, markets: -1.2, industry: -0.6, deal: -0.8, allies: -0.4 },
  avail(s) { return s.flags.summitHold >= s.turn ? 'Treasury hold until the trade summit' : true; },
  desc: 'Pull the licenses for chips sold legally to Chinese firms, close the smuggled-HBM channel, and get the Dutch and Japanese to stop servicing chipmaking tools in China. The big, expensive lever, and nearly all of it comes from the legal chips.',
  effect: s => 'China loses legal chips now (−16% compute); HBM curbs trim its domestic output over a year (up to −2% more; the servicing ban bites only years out) (fully only with coalition 45+, now ' + Math.round(s.coalition) + '). Markets -3, Beijing temperature +12, Treasury unhappy. US labs 3% slower, and Beijing may answer with mineral export curbs that slow them much more.',
  apply(s) { const full = s.coalition >= 45; s.cn.legalT = 0; s.cn.smeT = full ? 0.2 : 0.6; s.markets -= 3; s.tension += 12; shiftCN(s, { m: -5, sec: 7 }); rel(s, 'tsy', -8); s.coalition -= full ? 2 : 6; return (full ? 'The Hague and Tokyo sign on. ' : 'The Dutch agree; Tokyo stalls, so the tool cutoff is partial. ') + 'Verdant Semiconductor\u2019s stock falls 7%.'; },
});
def({ id: 'sl4', cat: 'policy', name: 'Executive order: SL4 security for frontier labs', phases: ['p0', 'scramble', 'p1'], ap: 1, pc: 2, room: true, once: true,
  tags: { control: 1, industry: -0.8, hawk: 0.8 },
  avail(s) { return s.sl >= 4 ? 'Already at SL' + s.sl : true; },
  desc: 'Mandatory security against well-resourced attackers, audited by the government. Labs start at SL3.',
  effect: () => 'Security SL4: a theft attempt succeeds 50% of the time instead of 90%. Overhead slows US labs 8%. Labs -5.',
  apply(s) { setSL(s, 4); s.labs.forEach(l => l.rel -= 5); return 'The order is signed. The labs complain about cost and comply.'; },
});
def({ id: 'speech', cat: 'policy', name: 'Presidential address on AI risk', phases: ['p0', 'scramble', 'p1'], ap: 1, pc: 2, room: true,
  tags: { pause: 1, industry: -1, markets: -0.5 },
  avail(s) { return (s.flags.cooldowns.speech || -9) > s.turn - 3 ? 'Too soon after the last one' : true; },
  desc: 'The President tells the country what is at stake.',
  effect: () => 'Salience +15; markets -2.',
  apply(s) { s.flags.cooldowns.speech = s.turn; s.salience += 15; s.markets -= 2; if (s.phase === 'p0') s.alarm += 15; return 'The President goes off script twice and it works. 41 million people watch.'; },
});
def({ id: 'accelerate', cat: 'policy', name: 'National AI acceleration package', phases: ['p0', 'p1'], ap: 1, pc: 2, room: true, once: true,
  tags: { industry: 2, pause: -1.5, military: 0.8, markets: 0.6 },
  desc: 'Permitting, power, compute. Widens the lead, and makes your own safety argument harder to believe.',
  effect: () => 'US labs grow 15% faster whenever they are not paced. China’s science faction -6. Bigger lead, more risk.',
  apply(s) { s.policies.accelerate = true; shiftCN(s, { sci: -6, sec: 3 }); s.markets += 3; return 'The package passes with a Rose Garden ceremony. Beijing’s scientists ask why America builds what it says is too dangerous to build.'; },
});
def({ id: 'fund', cat: 'verify', name: 'Fund verification', phases: ['p0', 'scramble', 'p1'], ap: 1, pc: 3, room: true,
  tags: s => s.warp === 0 ? { ic: 1.5, control: 0.5 } : { pause: 0.8, control: 1, ic: 1, markets: -0.3 },
  avail(s) { if (s.warp >= 2) return 'Fully funded'; if (s.warp === 1 && s.phase !== 'p1') return 'Warp Speed needs Phase 1 to have begun'; if (s.warp === 1 && senateVotes(s) < 55) return 'Warp Speed needs about 55 Senate votes (now ' + senateVotes(s) + ')'; return true; },
  desc: 'Level 1: the DNI reprograms intelligence funds and retasks collection toward compute. Level 2, once Phase 1 begins: an Operation Warp Speed appropriation. COVID relief ran to $4.6 trillion; a sliver would dwarf all verification spending to date.',
  effect: s => s.warp === 0 ? 'Level 1: every component +2 a month (novel tech less), intelligence quality +15.' : 'Level 2: every component +4 a month, and surges go much further.',
  apply(s) { s.warp++; if (s.warp === 1) { s.intelQ += 15; infl(s, 'dni', 3); return 'The reprogramming notice goes to the intelligence committees. Collection retasks within the week.'; } s.salience += 3; return 'Congress appropriates $40 billion. Three national labs stand up verification divisions overnight.'; },
});
def({ id: 'surge', cat: 'verify', name: 'Surge a verification component', phases: ['p1'], ap: 1, pc: 1,
  params: { kind: 'comp' },
  desc: 'Point the verification program at one component this month.',
  effect: s => 'Find or Inspect +' + surgeAmt(s, true) + ', Novel tech +' + surgeAmt(s, false) + ' at current funding. Surging Inspect also means surprise inspections this month (+25% detection). Two surges a turn.',
  avail(s) { return (s.flags.surges && s.flags.surges.turn === s.turn && s.flags.surges.n >= 2) ? 'Two surges a turn is all the program can absorb' : true; },
  apply(s, prm) { const cm = COMPONENTS.find(c => c.id === prm.comp); s.verify[prm.comp] += surgeAmt(s, cm.trusted); if (prm.comp === 'inspect' && paced(s)) s.flags.surgeTurn = s.turn; if (!s.flags.surges || s.flags.surges.turn !== s.turn) s.flags.surges = { turn: s.turn, n: 0 }; s.flags.surges.n++; return cm.name + ' moves forward.'; },
});
def({ id: 'malaysia', cat: 'diplo', name: 'Bring Malaysia into the regime', phases: ['p0', 'scramble', 'p1'], ap: 1, pc: 2, once: true,
  desc: 'Johor’s megacenters host Chinese tenants on hardware they cannot import. Get Kuala Lumpur to host inspectors instead of cutting them off.',
  effect: s => 'Chance: ' + Math.round(100 * malaysiaOdds(s)) + '%. Success cuts China’s offshore compute by most of what a remote-access rule would, without the tension.',
  apply(s) { if (rnd(s) < malaysiaOdds(s)) { s.cn.remoteT = Math.min(s.cn.remoteT, 0.3); s.coalition += 5; s.flags.malaysiaIn = true; return 'Kuala Lumpur agrees to host inspectors at both Johor campuses.'; } s.policies.malaysia = false; s.coalition -= 2; return 'Kuala Lumpur stalls and talks about sovereignty. You can try again later.'; },
});
function surgeAmt(s, trusted) { return trusted ? 3 + 3 * s.warp : 1 + 2 * s.warp; }
function malaysiaOdds(s) { return clamp(0.25 + s.coalition / 200 + (s.flags.johorStory ? 0.1 : 0) - (s.policies.remote ? 0.15 : 0), 0.05, 0.85); }

// ---- scramble decisions ----
const MECH = {
  charter: { label: 'Pacing Charter', desc: 'Voluntary commitments by every lab above the line, mutual verification, and the DPA held in reserve. Labs must sign. Lowest court risk until Congress acts.', tags: { pause: 1.2, control: 0.8, industry: -0.4, markets: -0.4 } },
  dpa: { label: 'DPA halt', desc: 'Order every lab above the line to stop. Covers everyone at once. Legally untested: the highest court risk until Congress acts.', tags: { pause: 2.2, control: 2, industry: -2, markets: -1.4 } },
  license: { label: 'Commerce licensing', desc: 'Commerce licenses every run above the line. Covers everyone. Commerce runs it, enforcement is leakier, and court risk is moderate until Congress acts.', tags: { pause: 1.2, control: 1.2, commerce: 2, industry: -0.8, markets: -0.6 } },
};
def({ id: 'mech', cat: 'crisis', name: 'Choose the pacing mechanism', phases: ['scramble'], ap: 1, pc: 2, room: true,
  params: { kind: 'variant', options: () => Object.keys(MECH).map(k => ({ id: k, label: MECH[k].label, desc: MECH[k].desc })) },
  tags: (s, prm) => MECH[prm.variant || 'charter'].tags,
  extra: (s, prm) => prm.variant === 'license' ? { doc: 2.5, cos: -1, tsy: -1 } : prm.variant === 'charter' && s.flags.commerceChairs ? { doc: 1.2 } : null,
  pres: (s, prm) => prm.variant === 'dpa' && s.flags.alarmist ? 0.15 : 0,
  avail(s) { return s.pacing.mech ? 'Decided: ' + MECH[s.pacing.mech].label : true; },
  desc: 'How does pacing actually happen? This is the first decision of the scramble.',
  effect: () => 'Sets how labs are bound for all of Phase 1.',
  apply(s, prm) { s.pacing.mech = prm.variant; s.pacing.mechTurn = s.turn; if (prm.variant === 'license') { infl(s, 'doc', 8); rel(s, 'cos', -8); rel(s, 'tsy', -8); } return MECH[prm.variant].label + ' it is.'; },
});
const THRESH = {
  '1e20': { label: '1e20 OP/s', desc: 'Maximum caution. Hundreds of sites, inference clouds included. Labs and markets hate it; inspectors are stretched.', tags: { pause: 1.5, industry: -1.5, markets: -0.8 } },
  '1e21': { label: '1e21 OP/s', desc: 'About 5e27 FLOP over six months at 30% utilization. Roughly 25 facilities at 15 locations, 14 parties.', tags: { pause: 0.8, industry: -0.4 } },
  '1e22': { label: '1e22 OP/s', desc: 'Only the very biggest. Nothing clears it in 2027; the largest site runs about 3.6e21. Constrains almost nothing.', tags: { pause: 0.2, industry: 0.2 } },
};
def({ id: 'threshold', cat: 'crisis', name: 'Set the compute threshold', phases: ['scramble'], ap: 1, pc: 1, room: true,
  params: { kind: 'variant', options: s => Object.keys(THRESH).filter(k => !(k === '1e20' && s.flags.floor21)).map(k => ({ id: k, label: THRESH[k].label, desc: THRESH[k].desc })) },
  tags: (s, prm) => THRESH[prm.variant || '1e21'].tags,
  avail(s) { return s.pacing.threshold ? 'Decided: ' + THRESH[s.pacing.threshold].label : true; },
  desc: 'Who has to stop? Mythos-class training took about 1e27 FLOP. An RSI-capable run probably needs about 1e28; leave a margin for algorithmic progress.',
  effect: () => 'Sets how much paced labs can still grow.',
  apply(s, prm) { s.pacing.threshold = prm.variant; s.pacing.thTurn = s.turn; if (prm.variant === '1e20') { s.markets -= 4; s.verify.inspect -= 8; } return THRESH[prm.variant].label + ' sustained.'; },
});
def({ id: 'automation', cat: 'crisis', name: 'Add research-automation limits', phases: ['scramble', 'p1'], ap: 1, pc: 2, room: true,
  tags: { pause: 1, industry: -0.8, control: 0.6, ic: 0.4 },
  avail(s) { return s.pacing.automation ? 'Already in place' : true; },
  desc: 'Human review before models launch training jobs, registered research deployments, control evals that gate scaling, inspectable logs. Without these, existing models keep doing the research behind closed doors.',
  effect: s => s.phase === 'p1' ? 'Paced labs slow from 0.40 to 0.12 months of progress per month. Amending a live charter costs compliance; low-safety labs may walk.' : 'Paced labs grow about 0.12 instead of 0.40 months of progress per month. Low-safety labs are less likely to sign.',
  apply(s) {
    s.pacing.automation = true;
    if (s.phase === 'p1') { let out = []; s.labs.forEach(l => { if (!l.signed) return; l.comp -= 5; if (LD(l.id).safety < 40 && rnd(s) < 0.3 && s.pacing.mech === 'charter') { l.signed = false; l.covered = false; out.push(LD(l.id).name); } }); return out.length ? 'The amendment passes. ' + out.join(' and ') + ' withdraw' + (out.length > 1 ? '' : 's') + ' from the Charter.' : 'The amendment passes. Every signatory stays.'; }
    return 'The automation commitments go in.';
  },
});
const TRIG = {
  '200c': { label: '200 MW + 1,200 km cluster rule', desc: '49 known facilities, all 9 top clusters, ~95% of compute visible. Sites under common control within 1,200 km count as one.', tags: { ic: 1.2, control: 0.6, allies: -0.2 } },
  '200': { label: '200 MW per facility', desc: 'Same coverage, but a run split across sites that each sit under 200 MW slips through.', tags: { ic: 0.8 } },
  '425': { label: '425 MW', desc: '21 facilities, 80% visible. Misses 2 of the 9 largest clusters.', tags: { ic: 0.3, industry: 0.2 } },
};
def({ id: 'trigger', cat: 'crisis', name: 'Set the monitoring trigger', phases: ['scramble', 'p1'], ap: 1, pc: 1, room: true,
  params: { kind: 'variant', options: () => Object.keys(TRIG).map(k => ({ id: k, label: TRIG[k].label, desc: TRIG[k].desc })) },
  tags: (s, prm) => TRIG[prm.variant || '200c'].tags,
  avail(s) { return s.pacing.trigger ? 'Decided: ' + TRIG[s.pacing.trigger].label : true; },
  desc: 'Which facilities must declare and accept inspection? Thermal infrared is a tripwire, not a meter: it says where to look.',
  effect: () => 'Multiplies how well survey and inspections catch defections and Chinese cheating.',
  apply(s, prm) { s.pacing.trigger = prm.variant; return TRIG[prm.variant].label + '. ' + (s.done.geoint ? 'Your GEOINT baseline means analysts already have pattern-of-life on every site.' : 'There is no baseline; analysts start pulling the Landsat archive this morning.'); },
});
def({ id: 'convene', cat: 'crisis', name: 'Convene the CEOs', phases: ['scramble', 'p1'], ap: 2, pc: 0,
  desc: 'Bring every lab above the line to the Roosevelt Room and get signatures, one lab at a time. You can cut side deals.',
  effect: () => 'Opens the signing table.',
  avail(s) {
    if (s.pacing.mech !== 'charter') return s.pacing.mech ? 'Only needed for the Charter' : 'Choose the Charter mechanism first';
    if (!s.pacing.threshold) return 'Set the threshold first';
    if (s.phase === 'scramble' && (s.pacing.mechTurn === s.turn || s.pacing.thTurn === s.turn)) return 'The lawyers need until tomorrow to turn today\u2019s decisions into text';
    if (s.phase === 'scramble' && s.scramble.convened) return 'Already convened';
    if (s.phase === 'p1' && s.labs.every(l => l.signed)) return 'Every lab has signed';
    return true;
  },
  apply(s) { if (s.scramble) s.scramble.convening = true; s.flags.convening = true; return 'The CEOs are in the Roosevelt Room.'; },
  modal: 'charter',
});
const SEQ = {
  first: { label: 'Go first', desc: 'America pauses now, whether or not Beijing follows. The surest way to cut loss-of-control risk and to show Beijing this is real. The lead erodes while China keeps going, and the hawks will call it unilateral disarmament.', tags: { pause: 2, hawk: -1.6, deal: 1, markets: -0.6, military: -0.6 } },
  deadline: { label: 'Go first, with a 6-month deadline', desc: 'Pause now, and announce that the pause lapses in six months unless Beijing joins. Some goodwill, some anger, and a cliff at the end.', tags: { pause: 1.2, hawk: -0.5, deal: 0.8, markets: -0.3 } },
  together: { label: 'Only together', desc: 'The labs sign, but nobody stops until Beijing signs too. The hawks are happy and markets are calm. The labs keep racing toward the threshold, and Beijing sees no proof that you are serious.', tags: { pause: 0.3, hawk: 1.4, deal: 0.2, military: 0.4 } },
};
const HAWKS = ['vp', 'sec', 'war', 'doc'];
def({ id: 'sequence', cat: 'crisis', name: 'Go first, or wait for Beijing?', phases: ['scramble'], ap: 1, pc: 1, room: true,
  params: { kind: 'variant', options: () => Object.keys(SEQ).map(k => ({ id: k, label: SEQ[k].label, desc: SEQ[k].desc })) },
  tags: (s, prm) => SEQ[prm.variant || 'first'].tags,
  avail(s) { return s.pacing.seq ? 'Decided: ' + SEQ[s.pacing.seq].label : true; },
  desc: 'The biggest argument in the room: if we pause, does China pause? Decide whether America goes first.',
  effect: () => 'Sets how Phase 1 starts. Going first cuts risk and buys Beijing\u2019s goodwill but costs the lead and angers the hawks; waiting keeps the lead and the hawks but leaves the labs racing.',
  apply(s, prm) { s.pacing.seq = prm.variant; return SEQ[prm.variant].label + '.'; },
});
function seqEffects(s, seq) {
  if (seq === 'first') { HAWKS.forEach(id => rel(s, id, -12)); rel(s, 'dni', 4); s.cn.trust += 10; shiftCN(s, { sci: 6, sec: -3 }); s.tension -= 6; s.markets -= 4; s.salience += 4; s.flags.wentFirst = true; }
  if (seq === 'deadline') { HAWKS.forEach(id => rel(s, id, -4)); s.cn.trust += 8; shiftCN(s, { sci: 5, sec: -2 }); s.tension -= 4; }
  if (seq === 'together') { HAWKS.forEach(id => rel(s, id, 6)); s.cn.trust -= 5; shiftCN(s, { sci: -3, sec: 2 }); }
}
def({ id: 'gofirst', cat: 'crisis', name: 'Go first after all', phases: ['p1'], ap: 1, pc: 2, room: true,
  tags: SEQ.first.tags,
  avail(s) { return s.pacing.armed && !s.pacing.active ? true : 'Only while the pause is on standby'; },
  desc: 'The labs are signed but still racing while you wait for Beijing. Start the pause now, without China.',
  effect: () => 'The pause starts today. Hawks -12, Beijing trust +10, science faction +6, markets -4.',
  apply(s) { s.pacing.seq = 'first'; activatePacing(s); seqEffects(s, 'first'); return 'The President announces that America will pause first. Beijing\u2019s foreign ministry calls it \u201ca serious step.\u201d The hawks call it something else.'; },
});
def({ id: 'launch', cat: 'crisis', name: 'Launch Phase 1', phases: ['scramble'], ap: 1, pc: 0,
  desc: 'End the scramble. Pacing starts now with whatever you have decided. Undecided pieces stay undecided.',
  effect: s => launchSummary(s),
  avail(s) { if (!s.pacing.mech) return 'Choose a mechanism first'; if (!s.pacing.threshold) return 'Set the threshold first'; if (s.pacing.mech === 'charter' && !s.scramble.convened) return 'Convene the CEOs first'; if (!s.pacing.seq) return 'Decide whether America goes first'; if (s.pacing.mechTurn === s.turn || s.scramble.convenedTurn === s.turn) return 'Signatures and orders take until tomorrow'; return true; },
  apply(s) { return launchPhase1(s); },
});
function launchSummary(s) {
  const bits = [];
  bits.push('Mechanism: ' + (s.pacing.mech ? MECH[s.pacing.mech].label : 'none'));
  bits.push('Threshold: ' + (s.pacing.threshold ? THRESH[s.pacing.threshold].label : 'none'));
  bits.push('Automation limits: ' + (s.pacing.automation ? 'yes' : 'no'));
  bits.push('Trigger: ' + (s.pacing.trigger ? TRIG[s.pacing.trigger].label : 'none'));
  bits.push('Sequencing: ' + (s.pacing.seq ? SEQ[s.pacing.seq].label : 'undecided'));
  if (s.pacing.mech) bits.push('Coverage: ' + Math.round(100 * s.labs.reduce((a, l) => a + ((s.pacing.mech !== 'charter' || l.signed) ? LD(l.id).share : 0), 0)) + '%');
  return bits.join(' · ');
}
function launchPhase1(s) {
  const mech = s.pacing.mech;
  s.labs.forEach(l => {
    if (mech === 'charter') l.covered = l.signed;
    else { l.covered = true; l.signed = l.signed || mech === 'dpa' || mech === 'license'; }
    if (l.covered) l.comp = complianceBase(s, l);
  });
  s.phase = 'p1'; s.scramble.done = true;
  s.flags.monthsInP1 = 0;
  const seq = s.pacing.seq || 'together'; s.pacing.seq = seq;
  seqEffects(s, seq);
  if (seq === 'together') {
    s.pacing.armed = true; s.pacing.active = false;
    log(s, 'Phase 1 begins on standby: the labs have signed, and the pause starts the day Beijing signs.', 'good');
    return 'The President signs at 9:40p. The labs are bound, but nothing stops until Beijing signs too. Until then, they keep racing.';
  }
  activatePacing(s);
  if (seq === 'deadline') s.pacing.deadline = s.t + 6;
  log(s, 'Phase 1 begins. America pauses ' + (seq === 'first' ? 'first, without waiting for Beijing.' : 'first, for six months, unless Beijing joins.') + ' Coverage ' + coverage(s) + '%.', 'good');
  return 'The President signs at 9:40p. Phase 1 begins at midnight. Coverage: ' + coverage(s) + '% of US frontier compute.';
}
function activatePacing(s) {
  s.pacing.active = true; s.pacing.armed = false; s.pacing.since = s.t; s.pacing.gap0 = Math.max(0.5, lead(s)); s.pacing.low = 0;
  s.labs.forEach(l => { if (l.covered) l.comp = complianceBase(s, l); });
  s.markets -= s.flags.marketPlan ? 4 : 8;
  s.salience += 4;
  shiftCN(s, { sci: 8, sec: -2 });
}
function complianceBase(s, l) {
  const d = LD(l.id);
  let c = 35 + d.safety * 0.5 + l.rel * 0.2;
  if (s.pacing.mech === 'dpa') c += 15;
  if (s.pacing.mech === 'license') c -= 12;
  if (s.flags.commerceChairs) c -= 5;
  return clamp(c);
}

// ---- charter signing ----
function charterOdds(s, labId, withDeal) {
  const l = L(s, labId), d = LD(labId);
  const signedShare = s.labs.reduce((a, x) => a + (x.signed ? LD(x.id).share : 0), 0);
  let x = -1.5 + d.safety / 30 + l.rel / 40 + signedShare * 1.6 + (s.done.charter ? 1.0 : 0) + (s.done.legal ? 0.45 : 0) + (s.salience - 40) / 50;
  if (s.pacing.automation && d.safety < 50) x -= s.done.control ? 0.4 : 0.8;
  if (s.pacing.threshold === '1e20') x -= 0.6;
  if (s.pacing.threshold === '1e22') x += 0.6;
  if (l.refused) x += 0.3; // second ask, with peers watching
  if (withDeal) x += 1.6;
  return clamp(logistic(x), 0.02, 0.97);
}
function charterDecide(s, labId, withDeal) {
  const l = L(s, labId), d = LD(labId);
  if (l.signed) return { signed: true, text: d.name + ' has already signed.' };
  let extra = '';
  if (withDeal) { if (s.pc < d.deal.pc) return { error: 'Not enough political capital' }; s.pc -= d.deal.pc; extra = ' ' + d.deal.fx(s); l.dealt = true; }
  const p = charterOdds(s, labId, withDeal);
  const roll = rnd(s);
  if (roll < p) {
    l.signed = true; l.signedVoluntary = true; l.refused = false; l.rel = clamp(l.rel + 5, -100, 100);
    if (s.phase === 'p1' && paced(s)) { l.covered = true; l.comp = complianceBase(s, l); }
    log(s, d.name + ' signs the Pacing Charter.', 'good');
    return { signed: true, p, roll, text: d.ceo + ' signs.' + extra };
  }
  l.refused = true; l.rel = clamp(l.rel - 5, -100, 100);
  log(s, d.name + ' refuses to sign.', 'bad');
  return { signed: false, p, roll, text: d.ceo + ' refuses. ' + pick(s, ['“Not while the others can train behind closed doors.”', '“Show me China signing first.”', '“Our board will never accept this.”']) + extra };
}
function finishConvening(s) { if (s.scramble) { s.scramble.convening = false; s.scramble.convened = true; s.scramble.convenedTurn = s.turn; } s.flags.convening = false; }

def({ id: 'compel', cat: 'labs', name: 'Compel a lab under the DPA', phases: ['p1'], ap: 1, pc: 3, room: true,
  params: { kind: 'lab', filter: (s, l) => !l.covered },
  tags: { pause: 1.5, control: 1.5, industry: -1.5, markets: -0.4 },
  avail(s) { if (!paced(s)) return 'No pacing regime to enforce'; return s.labs.some(l => !l.covered) ? true : 'Every lab is covered'; },
  desc: 'Order an unsigned lab under the pacing regime. Covers it at once; a court may disagree.',
  effect: () => 'The lab is covered at low compliance. Court risk applies.',
  apply(s, prm) { const l = L(s, prm.lab); l.covered = true; l.signed = true; l.comp = clamp(complianceBase(s, l) - 15); l.rel -= 30; s.flags.dpaUsed = true; s.flags.dpaSince = s.turn; industry(s, -10); return LD(l.id).name + ' is ordered under the DPA. ' + LD(l.id).ceo + ' calls it “the end of American innovation” and files suit.'; },
});
def({ id: 'hardware', cat: 'policy', name: 'Hardware pacing: cap chip accumulation', phases: ['p1'], ap: 1, pc: 3, room: true, once: true,
  tags: { pause: 1, industry: -1.5, markets: -1 },
  desc: 'Paused training does not stop chip production. Stockpiles become dry tinder: the first run after the pause would be enormous. Cap accumulation at threshold sites.',
  effect: () => 'Overhang grows a third as fast; markets -4.',
  apply(s) { s.policies.hardware = true; s.markets -= 4; return 'Fab output keeps flowing, but no single owner can stockpile past the cap.'; },
});

// ---- China diplomacy ----
const TERMS = [
  { id: 'cap', label: 'Mutual compute cap at the threshold', fixed: true, desc: 'The core of any deal. Both sides stop training above the line.' },
  { id: 'inspect', label: 'Mutual on-site inspections', desc: 'Inspectors at each other’s threshold sites. Required for Phase 2. Beijing’s security services hate it.' },
  { id: 'freeze', label: 'Freeze the current ratio', desc: 'The 1922 Washington Naval Treaty clause: lock in today’s gap. Hawks like it; Beijing doesn’t.' },
  { id: 'lane', label: 'Market lane for Chinese open-weight models', desc: 'The SALT I logic: Chinese sub-frontier models keep selling, including in the US, while they stay below agreed levels.' },
  { id: 'institute', label: 'Joint safety institute and shared evals', desc: 'Chinese scientists reach conclusions about risk through their own work.' },
  { id: 'relief', label: 'Entity List relief', desc: 'Sanctions relief for Chinese AI firms. Hawks object; some of it helps their compute.' },
  { id: 'visas', label: 'Eased visas for researchers', desc: 'A small carrot with a counterintelligence cost.' },
  { id: 'chips', label: 'Resume legal chip sales', desc: 'A big carrot that directly feeds their compute.' },
  { id: 'threat', label: 'Threaten a full cutoff if they refuse', desc: 'Credible only with a big lead.' },
];
function offerTags(terms) {
  const t = { deal: 1.5, pause: 0.5, hawk: -0.3 };
  const add = o => { for (const k in o) t[k] = (t[k] || 0) + o[k]; };
  if (terms.inspect) add({ control: 0.6, ic: 0.6, industry: -0.3 });
  if (terms.freeze) add({ hawk: 0.8 });
  if (terms.lane) add({ markets: 0.6, deal: 0.5, industry: -0.5, hawk: -0.6 });
  if (terms.institute) add({ deal: 0.3 });
  if (terms.relief) add({ hawk: -1.2, markets: 0.5, deal: 0.5 });
  if (terms.visas) add({ hawk: -0.3 });
  if (terms.chips) add({ hawk: -2, markets: 1, industry: 0.8 });
  if (terms.threat) add({ hawk: 1, deal: -0.3 });
  return t;
}
// Beijing's willingness to take an offer, as labeled parts so the UI can show where it comes from; 0 is even odds.
function cnParts(s, terms) {
  const f = s.cn.f, ld = lead(s);
  const P_ = [['Base reluctance', -1.55], ['Who has the floor in Beijing', 0.03 * (f.sci - 20) + 0.015 * (f.m - 50) - 0.03 * (f.sec - 30)]];
  if (ld > 5) P_.push(['A big US lead', 0.07 * Math.min(ld - 5, 10)]);
  if (ld < 2) P_.push(['China is nearly level', -0.6]);
  const closed = s.cn.legalT < 0.3 && s.cn.distT < 0.5 && s.cn.remoteT < 0.5;
  if (closed && !terms.lane && f.sec > 40) P_.push(['Every channel closed, and no market lane', -0.4]);
  P_.push([paced(s) ? 'America is pacing' : s.pacing.armed ? 'America’s labs signed, but nothing stops until Beijing does' : 'America is not pacing', paced(s) ? 0.5 : (s.pacing.armed ? 0.35 : -0.7)]);
  if (s.flags.wentFirst) P_.push(['America went first', 0.15]); else if (s.pacing.seq === 'deadline' && paced(s)) P_.push(['America went first, with a deadline', 0.08]);
  P_.push(['Beijing temperature', -(s.tension - 30) * 0.018], ['Beijing’s trust', (s.cn.trust - 10) * 0.012]);
  if (terms.freeze) P_.push(['Freeze the current ratio', -0.3]);
  if (terms.inspect) P_.push(['On-site inspections (Security hates them)', -(0.25 + 0.012 * f.sec)]);
  if (terms.lane) P_.push(['Market lane', 0.55]);
  if (terms.relief) P_.push(['Entity List relief', 0.4]);
  if (terms.visas) P_.push(['Eased visas', 0.15]);
  if (terms.institute) P_.push(['Joint safety institute (Science likes it)', 0.2 + 0.01 * f.sci]);
  if (terms.chips) P_.push(['Legal chip sales', 0.6]);
  if (terms.threat) P_.push([ld > 7 ? 'A cutoff threat, backed by a big lead' : 'A cutoff threat without the lead to back it', ld > 7 ? 0.35 : -0.25]);
  if (s.flags.covertExposed && s.turn - s.flags.covertExposed < 6) P_.push(['A covert operation exposed in the last 6 turns', -0.8]);
  if (s.flags.dodCarve) P_.push(['A Pentagon carve-out for one lab', -0.15]);
  if (s.flags.uaeOut && paced(s)) P_.push(['The UAE loophole', -TUNE.uaeDeal]);
  return P_;
}
function cnUtility(s, terms) { return cnParts(s, terms).reduce((a, x) => a + x[1], 0); }
function cnAcceptP(s, terms) { return logistic(2.2 * cnUtility(s, terms)); }
function cnAcceptEstimate(s, terms) { const p = cnAcceptP(s, terms); const err = 0.25 * (1 - s.intelQ / 100) + 0.04; const b = (hash01(s.seed, s.turn, 'cnest', JSON.stringify(terms)) - 0.5) * 2 * err; return { mid: clamp(p + b, 0.01, 0.99), err }; }
function offerPreview(s, terms) { const rp = roomPreviewTags(s, 'offer', offerTags(terms), JSON.stringify(terms)); return { room: rp, cn: cnAcceptEstimate(s, terms) }; }
function roomPreviewTags(s, id, tags, key) { ACT._tmp = { tags, pres: s2 => (lead(s2) > 4 ? 0.1 : 0) }; const r = roomPreview(s, '_tmp', { key }); delete ACT._tmp; return r; }
def({ id: 'offer', cat: 'diplo', name: 'Make Beijing an offer', phases: ['scramble', 'p1'], ap: 1, pc: 2, modal: 'offer',
  desc: 'Build a package. The President has to approve it, then Beijing decides. Rejection costs trust and temperature.',
  effect: () => 'Opens the offer table.',
  avail(s) { if (s.cn.deal) return 'A deal is already in force'; if (s.roomUsed >= roomMax(s)) return 'The President has no more time for decisions this turn'; if (s.cn.cooldown > 0) return 'Beijing needs time (' + s.cn.cooldown + ' more turn' + (s.cn.cooldown > 1 ? 's' : '') + ')'; return true; },
  apply() { return ''; },
});
function makeOffer(s, terms) {
  const a = ACT.offer;
  if (s.ap < a.ap || s.pc < a.pc) return { error: 'Not enough actions or capital' };
  if (s.roomUsed >= roomMax(s)) return { error: 'The President has no more time for decisions this turn' };
  s.ap -= a.ap; s.pc -= a.pc; s.roomUsed++;
  const rp = roomPreviewTags(s, 'offer', offerTags(terms), JSON.stringify(terms));
  const roll = rnd(s); const pass = roll < rp.p;
  settleRoom(s, rp, pass);
  if (!pass) { log(s, 'The President rejected your China package.', 'bad'); return { pass: false, roll, room: rp, text: 'The President won’t sign off. “It looks weak,” the President says, and moves on.' }; }
  if (s.flags.laneCommit && !terms.lane) rel(s, 'tsy', -15);
  const p = cnAcceptP(s, terms);
  const cnRoll = rnd(s); const accepted = cnRoll < p;
  s.cn.cooldown = s.phase === 'scramble' ? 2 : 1;
  if (accepted) {
    s.cn.deal = { terms: Object.assign({}, terms), since: s.t, turn: s.turn };
    s.tension -= 12; s.markets += 4; s.cred += 6;
    if (terms.lane) { rel(s, 'vp', -8); industry(s, -5); rel(s, 'tsy', 10); shiftCN(s, { m: 5 }); }
    if (terms.relief) { s.cn.legalT = Math.max(s.cn.legalT, 0.4); rel(s, 'sec', -10); }
    if (terms.chips) { s.cn.legalT = 1; rel(s, 'sec', -20); rel(s, 'war', -10); }
    if (terms.institute) { s.cn.trust += 15; shiftCN(s, { sci: 6 }); s.verify.inspect += 4; }
    if (terms.inspect) s.verify.inspect += 8;
    if (terms.freeze) rel(s, 'sec', 8);
    log(s, 'Beijing accepts the interim deal.', 'good');
    if (s.pacing.armed && !s.pacing.active) { activatePacing(s); log(s, 'The pause begins on both sides.', 'good'); }
    return { pass: true, accepted: true, room: rp, roll, p, cnRoll, text: 'Beijing accepts. The interim deal takes effect on the first of the month. ' + (terms.freeze ? 'Like Japan in 1922, China takes a frozen ratio over an open race.' : terms.lane ? 'Beijing’s “changing lanes to overtake” strategy never needed the frontier.' : 'Both capitals call it a pause for safety.') };
  }
  s.cn.trust -= 5; s.tension += 4;
  if (terms.threat) { s.flags.threatMade = s.turn; }
  const hint = counterHint(s, terms);
  log(s, 'Beijing rejects the offer.', 'bad');
  return { pass: true, accepted: false, room: rp, roll, p, cnRoll, text: 'Beijing says no. ' + hint };
}
function counterHint(s, terms) {
  const f = s.cn.f;
  if (!paced(s)) return 'Their envoy: “Why would we stop while you keep running?”';
  if (f.sec > 42) return 'The security services are running Beijing’s side right now. Their envoy talks about “containment.”';
  if (!terms.lane && f.m >= 45) return 'Their envoy keeps returning to market access for Chinese models.';
  if (!terms.institute && f.sci >= 28) return 'Their scientists want a joint institute and shared evaluations.';
  if (terms.inspect && f.sec > 32) return 'Inspections are the sticking point.';
  if (s.tension > 55) return 'The temperature is too high for anyone in Beijing to be seen saying yes.';
  return 'Their envoy says the gap is not yet large enough to be worth locking in.';
}

def({ id: 'summit', cat: 'diplo', name: 'Convene the Phase 2 summit', phases: ['p1'], ap: 2, pc: 4, room: true,
  tags: { deal: 1.5, pause: 1, control: 0.5, hawk: 0.3 },
  avail(s) { const r = phase2Check(s); return r.ok ? true : 'Not ready: ' + r.missing.join('; '); },
  desc: 'The durable deal: a verified, multilateral agreement that reliably prevents uncontrollable AI. Needs a working interim deal, mature verification and allies. Without a statute, a court can void the US side. And if Beijing is hiding a program your intelligence cannot see, you will find out too late.',
  effect: s => 'If the President agrees, Beijing decides. Estimated chance Beijing signs: ' + Math.round(100 * summitP(s)) + '%.' + (s.flags.statute ? ' Pacing is law, so the courts cannot void it.' : ' No statute: chance a court voids the US side, ' + Math.round(100 * summitCourtP(s)) + '%.') + ' Your confidence Beijing will comply: ' + betrayWord(s) + '.',
  apply(s) {
    const p = summitP(s);
    if (rnd(s) < p) {
      if (!s.flags.statute && rnd(s) < summitCourtP(s)) { s.cred -= 10; s.cn.trust -= 10; s.flags.summitFailed = (s.flags.summitFailed || 0) + 1; log(s, 'A court voids the executive orders implementing Phase 2.', 'bad'); return 'Beijing signs. Nine days later a federal court rules the executive orders implementing it exceed your authority. Beijing suspends its side until Congress acts.'; }
      if (rnd(s) < betrayP(s)) { s.ending = 'betrayed'; log(s, 'Phase 2 is signed. Beijing was hiding a program.', 'bad'); return 'Beijing signs. Months later you learn what your intelligence missed.'; }
      s.ending = 'phase2'; log(s, 'The Phase 2 agreement is signed.', 'good'); return 'Beijing signs. Inspectors deploy within the month.';
    }
    s.tension += 3; s.cn.trust -= 4; s.flags.summitFailed = (s.flags.summitFailed || 0) + 1;
    return 'The summit ends without a signature. Beijing wants more time. You can try again.';
  },
});
function summitP(s) { const d = s.cn.deal; if (!d) return 0; const held = s.t - d.since; return logistic(2.2 * (cnUtility(s, Object.assign({}, d.terms, { inspect: true })) + 0.6 + 0.08 * held + 0.2 * (s.flags.summitFailed || 0))); }
// Monthly chance a court enjoins the executive pause; the legal authorities study cuts it, and ignoring a ruling raises it.
function courtP(s) { return s.flags.statute ? 0 : (TUNE.courtRate[s.pacing.mech] || 0.03) * (s.done.legal ? 0.4 : 1) * (1 + (s.flags.defied || 0)); }
function summitCourtP(s) { return s.flags.statute ? 0 : TUNE.summitCourt * (s.done.legal ? 0.5 : 1); }
function phase2Check(s) {
  const m = []; const r = ready2(s);
  if (!s.cn.deal) m.push('no interim deal with China'); else if (s.t - s.cn.deal.since < 3) m.push('the interim deal must hold for 3 months');
  if (s.cn.deal && !s.cn.deal.terms.inspect) m.push('the deal needs mutual inspections');
  if (!paced(s)) m.push('no pause in force'); else if (s.t - s.pacing.since < 6) m.push('the pause must hold 6 months (now ' + r1(s.t - s.pacing.since) + ')');
  if (r.min < 65) m.push('every verification component at 65 (weakest: ' + Math.round(r.min) + ')');
  if (s.coalition < 50) m.push('coalition ' + Math.round(s.coalition) + '/50');
  if (s.overhang > 8 && !s.policies.hardware) m.push('compute overhang ' + r1(s.overhang) + ' (needs hardware pacing or 8 or less)');
  return { ok: m.length === 0, missing: m };
}

// ---- covert ----
def({ id: 'covert', cat: 'covert', name: 'Covert disruption of Chinese AI', phases: ['scramble', 'p1'], ap: 1, pc: 2, room: true,
  tags: { military: 2, hawk: 2, deal: -1.5, markets: -0.5 },
  desc: 'Cyber operations on training clusters and interdicted chip shipments. Deniable in principle; Beijing will know anyway.',
  effect: () => '60%: China loses about 1.5 months. Beijing temperature +20; their security faction surges. If attributed (35%), Beijing retaliates and the US frontier loses two weeks.',
  apply(s) { s.stats.covert++; s.tension += 20; shiftCN(s, { sec: 10, sci: -5 }); if (rnd(s) < 0.6) s.cn.cap -= 1.5; if (rnd(s) < 0.35) { s.flags.covertExposed = s.turn; s.cn.trust -= 15; frontierLab(s).cap -= 0.5; return 'The operation works, and it is attributed within days. Beijing answers in kind: a frontier lab loses two weeks to a wiper attack. Any deal just got harder.'; } return 'Three checkpoints are corrupted. Beijing says nothing in public, which worries the DNI more than threats would.'; },
});
def({ id: 'strike', cat: 'covert', name: 'Kinetic strike on frontier facilities', phases: ['scramble', 'p1'], ap: 2, pc: 5, room: true,
  tags: { military: 3, hawk: 2, deal: -3, markets: -2 },
  desc: 'The outer boundary. Only for an imminent, high-confidence, uncontrolled breakout.',
  effect: () => 'Sets China back about 4 months. Beijing temperature +60. Roughly even odds of war.',
  apply(s) { s.stats.covert++; s.cn.cap -= 4; s.tension += 60; shiftCN(s, { sec: 30, sci: -10 }); s.flags.covertExposed = s.turn; s.cn.trust = 0; if (s.cn.deal) s.cn.deal = null; s.flags.struck = true; if (rnd(s) < 0.5) { s.ending = 'war'; return 'The strikes go in at 4:10a. By noon, PLA rocket forces are on alert.'; } return 'The strikes destroy two facilities. Beijing puts frontier development under the PLA and out of view.'; },
});

function currentAsk(s, id) { const p = P(s, id); const list = ASKS[id]; return list[p.ask % list.length]; }

/* ================= effect chips ================= */
// Short, scannable consequences for each action. '+' good for you, '-' a cost, '~' neutral or conditional.
// Previews say what an advisor would expect, in words; exact effects show only in "What changed" afterwards.
const CHIPS = {
  proj_team: () => ['+1 more action every turn'],
  proj_memo: () => ['+A stronger start to the scramble'],
  proj_charter: () => ['+Labs likelier to sign'],
  proj_geoint: () => ['+Much better at finding hidden sites', '+Sharper intelligence'],
  proj_inspect: () => ['+Much better inspections', '+Harder to smuggle chips'],
  proj_track2: () => ['+Builds trust with Beijing', '+Helps China’s scientists'],
  proj_zk: () => ['+New verification tech', '~Not trusted until Phase 2'],
  proj_legal: () => ['+Better odds in court', '+Makes a DPA threat credible'],
  proj_control: () => ['+Lowers the chance of losing control', '-Slows US labs a little'],
  proj_sl5: () => ['+Weights much harder to steal', '-Slows US labs a lot', '-Labs and industry angry', '-Markets dip', '-Takes 8 actions'],
  meet: () => ['+Relationship up', '+Warms them to pacing a little', '-Rivals a little jealous'],
  favor: () => ['+Relationship up a lot', '+Their influence grows', '-Rivals annoyed'],
  brief: s => ['~Your read: ' + oddsWord(briefOdds(s)), '-If it fails, your credibility suffers'],
  allies: () => ['+Coalition grows', '+Some Senate votes'],
  labmeet: () => ['+Relationship with the lab up'],
  assess: () => ['+Sharper readings for a while'],
  methods: () => ['+Slows China, building over a year', '-Slows US labs slightly', '-Labs grumble', '~Beijing mildly annoyed'],
  distill: () => ['+Cuts China’s distillation boost by about a third', '-Slows US labs slightly', '-Beijing annoyed'],
  remote: () => ['+Cuts China’s compute', '-Slows US labs slightly', '-Beijing angry'],
  smuggle: () => ['+Trims China’s compute', '~Beijing mildly annoyed'],
  chips: () => ['+Cuts China’s compute, mostly over a year', '-Slows US labs a little', '-Markets dip', '-Beijing very angry', '-Risk of retaliation'],
  sl4: () => ['+Weights harder to steal', '-Slows US labs', '-Labs unhappy'],
  speech: () => ['+Raises salience a lot', '-Markets dip slightly'],
  accelerate: () => ['+US labs faster', '-Reach the RSI threshold sooner', '-Alienates China’s scientists'],
  fund: s => s.warp === 0 ? ['+Verification builds steadily', '+Better intelligence'] : ['+Verification builds faster', '+Surges go further'],
  surge: () => ['+Quick boost to one verification component'],
  malaysia: s => ['+Cuts China’s offshore compute', '~Kuala Lumpur: ' + oddsWord(malaysiaOdds(s)), '+Beijing barely notices'],
  mech: (s, prm) => ({ charter: ['~Labs must sign', '+Little backlash'], dpa: ['+Covers every lab', '-Court fight', '-Markets and industry angry'], license: ['+Covers every lab', '-Leakier enforcement', '-Commerce gains power'] })[prm.variant || 'charter'],
  threshold: (s, prm) => ({ '1e20': ['+Paced labs nearly frozen', '-Markets dip', '-Labs reluctant'], '1e21': ['+Paced labs slowed hard', '~The plan’s line'], '1e22': ['-Paced labs barely slowed', '+Labs happy'] })[prm.variant || '1e21'],
  automation: () => ['+Paced labs much slower', '+Much lower chance of losing control', '-Reckless labs balk'],
  trigger: (s, prm) => ({ '200c': ['+Best detection', '+Catches split runs'], '200': ['~Good detection', '-Split runs slip through'], '425': ['-Misses some of the biggest clusters'] })[prm.variant || '200c'],
  convene: () => ['~Opens the signing table'],
  sequence: (s, prm) => ({ first: ['+Pause starts now', '+Earns Beijing’s trust', '-Hawks furious', '-Markets dip', '-Lead erodes'], deadline: ['+Pause starts now', '+Earns some trust in Beijing', '-Hawks uneasy', '~A cliff in six months'], together: ['+Hawks happy', '+Lead holds', '+Beijing sees a fair offer', '-Labs keep racing until Beijing signs', '-Beijing a little insulted'] })[prm.variant || 'first'],
  gofirst: () => ['+Pause starts now', '+Earns Beijing’s trust', '-Hawks furious'],
  launch: () => ['+Pacing begins', '-Markets fall (less with a Treasury plan)'],
  offer: () => ['~Opens the offer table'],
  summit: s => ['+Win, if Beijing signs (' + oddsWord(summitP(s)) + ')'],
  compel: () => ['+Lab covered now', '-Court fight', '-Industry angry'],
  hardware: () => ['+Overhang grows much more slowly', '-Markets dip'],
  covert: () => ['+Might set China back', '-Beijing furious', '-Could be traced back to us'],
  strike: () => ['+Sets China back badly', '-Beijing enraged', '-Could start a war'],
};
function oddsWord(p) { return p < 0.12 ? 'very unlikely' : p < 0.33 ? 'unlikely' : p < 0.58 ? 'a toss-up' : p < 0.8 ? 'likely' : p < 0.93 ? 'very likely' : 'near-certain'; }
function chips(s, id, params) { const f = CHIPS[id]; return f ? (f(s, params || {}) || []) : []; }

/* ================= action plumbing ================= */
function actionCost(s, id, params) { const a = ACT[id]; if (a.cost) return a.cost(s, params || {}); return { ap: a.ap, pc: a.pc }; }
function availability(s, id, params) {
  const a = ACT[id]; params = params || {};
  if (s.ending) return 'Game over';
  if (s.queue.length) return 'Resolve the open event first';
  if (a.phases.indexOf(s.phase) < 0) return 'Not in this phase';
  if (a.once && s.policies[id]) return 'Already in place';
  const c = actionCost(s, id, params);
  if (s.ap < c.ap) return 'Not enough actions this turn';
  if (s.pc < c.pc) return 'Not enough political capital';
  if (a.room && s.roomUsed >= roomMax(s)) return 'The President has no more time for decisions this turn';
  if (a.avail) { const r = a.avail(s, params); if (r !== true) return r; }
  return true;
}
function listActions(s) {
  return Object.keys(ACT).filter(id => id[0] !== '_' && ACT[id].phases.indexOf(s.phase) >= 0).map(id => {
    const a = ACT[id];
    return { id, cat: a.cat, name: a.name, room: !!a.room, params: a.params || null, modal: a.modal || null, project: a.project || null,
      desc: a.desc, cost: actionCost(s, id, {}), avail: availability(s, id, {}) };
  });
}
function settleRoom(s, rp, pass) {
  rp.positions.forEach(x => {
    const p = P(s, x.id);
    if (x.stance > 0.3) { infl(s, x.id, pass ? 1.5 : -1); rel(s, x.id, pass ? 2 : 0); }
    else if (x.stance < -0.3) { infl(s, x.id, pass ? -1.5 : 1); rel(s, x.id, pass ? -3 : 1); }
  });
  if (pass) { s.cred += 1; s.stats.roomWon++; } else { s.cred -= 3; s.stats.roomLost++; }
}
function act(s, id, params) {
  params = params || {};
  const ok = availability(s, id, params);
  if (ok !== true) return { error: ok };
  const a = ACT[id]; const c = actionCost(s, id, params);
  if (a.params && a.params.kind === 'variant' && !params.variant) return { error: 'Choose an option' };
  if (a.params && a.params.kind === 'principal' && !params.who) return { error: 'Choose a principal' };
  if (a.params && a.params.kind === 'lab' && !params.lab) return { error: 'Choose a lab' };
  if (a.params && a.params.kind === 'comp' && !params.comp) return { error: 'Choose a component' };
  if (a.modal === 'offer') return { modal: 'offer' };
  s.ap -= c.ap; s.pc -= c.pc;
  let res;
  if (a.room) {
    const rp = roomPreview(s, id, params);
    s.roomUsed++;
    const roll = rnd(s); const pass = roll < rp.p;
    settleRoom(s, rp, pass);
    if (pass) { if (a.once) s.policies[id] = true; res = { pass: true, roll, room: rp, text: a.apply(s, params) }; log(s, 'Approved: ' + a.name + (params.variant ? ' (' + optLabel(a, s, params.variant) + ')' : '') + '.', 'good'); }
    else { res = { pass: false, roll, room: rp, text: a.fail ? a.fail(s, params) : 'The President isn’t persuaded. ' + pick(s, ['“Bring it back when you have the votes.”', '“Not now.”', '“I don’t love it.”']) }; log(s, 'Rejected: ' + a.name + '.', 'bad'); }
  } else {
    if (a.once) s.policies[id] = true;
    res = { pass: true, text: a.apply(s, params) };
  }
  if (a.modal) res.modal = a.modal;
  normalize(s);
  return res;
}
function optLabel(a, s, v) { const o = a.params.options(s).find(x => x.id === v); return o ? o.label : v; }

/* ================= events ================= */
const EV = {};
function ev(e) { EV[e.id] = e; }

ev({ id: 'intro', forced: true, title: 'Phase 0', stamp: 'EEOB, Room 374',
  body: s => `<p>Your indicator model puts the median date for recursive self-improvement, when AI can replace expert humans across all of AI research, at about a year from now. There is a real chance it comes sooner. Fewer than a hundred people in the world work full time on verifying what frontier labs do.</p>
  <p>When the President finally decides to pace the frontier, it will feel like the Cuban Missile Crisis, not the NPT: two weeks, fifteen people, incomplete information. Whatever exists on that day is what the President gets to use.</p>
  <p>Your job now is to get in position. Build projects, cultivate the cabinet, push the policies you can win, and watch the indicators. When the time comes, you can ask for an emergency meeting. Ask too early and you are the advisor who cried wolf. Ask too late and there may be nothing left to pace.</p>`,
  choices: [{ label: 'Get to work', fx: s => '' }] });

ev({ id: 'knock', forced: true, title: 'The knock', stamp: '8:45a · The residence',
  body: s => { const i = s.ind[s.ind.length - 1]; return `<p>The Chief of Staff knocks on the bedroom door. The President is in a bathrobe with the morning papers. The Chief hands over a folder and nods at you to start.</p>
  <div class="cable">OVERNIGHT // AI R&amp;D INDICATORS
- Researcher-reported AI R&amp;D uplift: ${i.uplift.toFixed(1)}x  (RSI marker: 10x)
- Internal AI R&amp;D eval: ${Math.round(i.cobench)}%  (marker: 85%)
- 80%-reliability time horizon: ${Math.round(i.horizon)}h  (marker: 174h)
- Two CEOs called after midnight. Quote: "If we don't slow down, we will soon lose confidence that we are in control."</div>
  <p>“Is this it? Is this the thing you people keep warning about?”</p>`; },
  choices: [
    { label: '“Yes. It’s here. We stop everything today.”', hint: 'Maximum urgency. Strengthens a DPA halt; costs credibility if the evidence is thin.', fx: s => { const thin = rObserved(s) < 0.8; s.cred += thin ? -8 : 4; s.flags.alarmist = true; s.markets -= 4; startScramble(s); return thin ? 'The President’s eyebrows go up. Treasury hears “stop everything” secondhand and futures fall 4%. The evidence is thinner than your words, and the room knows it.' : 'Nobody argues. The folder speaks for itself.'; } },
    { label: '“We can’t rule it out, and that is the point. We need to get in position this week.”', hint: 'Calibrated urgency.', fx: s => { s.cred += s.done.memo ? 6 : 3; startScramble(s); return s.done.memo ? 'You slide the memo across. It answers the first ten questions. The President cancels the afternoon. “Noon. Cabinet Room. Bring this.”' : 'The President nods slowly. “Then what do we do?” You have no memo. You write one in the Roosevelt Room while staff bring sandwiches.'; } },
    { label: '“The labs are hyping their numbers. Let’s wait for more evidence.”', hint: 'No scramble. The alarm resets and you keep your powder dry.', fx: s => { s.alarm = 35; s.cred += 2; s.flags.downplayed = s.turn; return 'The President looks relieved and keeps the morning schedule.'; } },
  ] });
function startScramble(s) {
  s.phase = 'scramble';
  s.scramble = { turn: 1, max: 7, convened: false, convening: false, done: false, startT: s.t };
  s.stats.scrambleStart = s.t; if (s.stats.firstScramble == null) { s.stats.firstScramble = s.t; s.stats.firstScrambleR = frontier(s) / s.T; }
  s.pc += 6 + (s.done.memo ? 2 : 0);
  if (s.done.memo) s.cred += 15;
  s.apMax += 1; s.ap = s.apMax;
  s.salience += 6; s.roomUsed = 0;
  log(s, 'The scramble begins.', 'good');
  if (!s.seen.debate) { s.queue.push({ id: 'debate' }); s.seen.debate = s.turn; }
}

ev({ id: 'midterms', forced: true, title: 'Midterms', stamp: 'Election night, 3 Nov 2026',
  body: s => s.flags.houseFlipped
    ? `<p>The opposition takes the House by eleven seats. Its incoming committee chairs have promised hearings on frontier AI. Hearings raise salience and pull senators toward a treaty, but the White House sees them as an attack.</p>`
    : `<p>The President\u2019s party holds the House by four seats. The Chief of Staff calls it a mandate. A mandate for what is up for grabs.</p>`,
  choices: s => s.flags.houseFlipped ? [
    { label: 'Quietly help the new chairs plan AI hearings', hint: 'Salience +6; Senate +3; Chief of Staff -10.', fx: s => { s.salience += 6; s.senateLobby += 3; rel(s, 'cos', -10); return 'The hearing schedule for February has your fingerprints on it, and the Chief of Staff knows it.'; } },
    { label: 'Close ranks with the White House', hint: 'Chief of Staff +6; salience +2.', fx: s => { rel(s, 'cos', 6); s.salience += 2; return 'You help draft the talking points against the hearings. They happen anyway, a little smaller.'; } },
  ] : [
    { label: 'Pitch AI safety as part of the mandate', hint: 'Salience +4; Vice President warms to pacing; industry -6.', fx: s => { s.salience += 4; P(s, 'vp').shift += 0.2; industry(s, -6); return 'The VP uses your line in the victory speech.'; } },
    { label: 'Let the Chief of Staff take the win', hint: 'Chief of Staff +8; credibility +2.', fx: s => { rel(s, 'cos', 8); s.cred += 2; return 'The Chief of Staff is in a good mood for a week.'; } },
  ] });

ev({ id: 'distill_report', p: 0.5, once: true, phases: ['p0'], when: s => s.t < 5,
  title: 'The distillation report', stamp: 'Prometheus blog post',
  body: () => `<p>Prometheus publishes evidence that three Chinese labs, Deep Current, Lunar and MiniMind, ran some 24,000 fraudulent accounts to extract its model’s reasoning at industrial scale. Mindscale confirms a similar campaign within hours.</p>`,
  choices: [
    { label: 'Ride the wave', hint: 'The anti-distillation crackdown gets an easier hearing for two turns. Salience +3.', fx: s => { s.flags.momentum = { id: 'distill', until: s.turn + 2 }; s.salience += 3; return 'The Czar, for once, is on your side.'; } },
    { label: 'Let the labs handle it', hint: 'Nothing changes.', fx: () => 'The story fades in a week.' },
  ] });
ev({ id: 'smuggle_bust', p: 0.22, once: true, phases: ['p0', 'p1'],
  title: 'Smuggling bust', stamp: 'Singapore',
  body: () => `<p>Singapore police arrest three men moving $2 billion of frontier accelerators through Malaysian shell companies to buyers in Shenzhen. The servers had been relabeled as “network equipment.”</p>`,
  choices: [
    { label: 'Give Commerce the credit', hint: 'Commerce +15 relationship and +4 influence.', fx: s => { rel(s, 'doc', 15); infl(s, 'doc', 4); s.cn.smuggleT = Math.max(0, s.cn.smuggleT - 0.1); return 'The Commerce Secretary holds a press conference.'; } },
    { label: 'Give State the credit', hint: 'State +10; Commerce -10.', fx: s => { rel(s, 'sec', 10); rel(s, 'doc', -10); return 'The Secretary of State thanks Singapore by name. The Commerce Secretary does not forget.'; } },
    { label: 'Use it in your next briefing', hint: 'Credibility +3, salience +2.', fx: s => { s.cred += 3; s.salience += 2; return 'It makes a good slide.'; } },
  ] });
ev({ id: 'trade_summit', p: 0.55, once: true, phases: ['p0'], when: s => s.t > 3.5 && s.t < 8,
  title: 'The trade summit', stamp: 'Treasury',
  body: () => `<p>The Treasury Secretary wants a deal before the leaders’ summit: soybeans and rare earths for Beijing, and in return, licenses to sell Verdant’s next-generation accelerators to Chinese firms. The President likes deals. The hawks are already leaking against it.</p>`,
  choices: [
    { label: 'Back Treasury', hint: 'Treasury +20. China’s legal chip supply resumes: China compute +16%; Beijing temperature -6; State -10.', fx: s => { rel(s, 'tsy', 20); s.cn.legalT = 1; s.policies.chips = false; s.tension -= 6; rel(s, 'sec', -10); s.markets += 3; return 'The deal is signed in Busan. Verdant’s stock jumps 9%.'; } },
    { label: 'Fight it in the room', hint: 'A roll weighted by the hawks’ influence. Win: chip sales stay off. Lose: they resume and you look weak.', fx: s => { const hawks = (P(s, 'sec').infl + P(s, 'vp').infl + P(s, 'war').infl) / 3; const p = clamp((hawks - P(s, 'tsy').infl * 0.6 + s.cred * 0.3) / 100, 0.15, 0.85); if (rnd(s) < p) { rel(s, 'tsy', -15); rel(s, 'sec', 10); s.cred += 3; return 'The chips come out of the package. The Treasury Secretary signs the rest and doesn’t speak to you for a week.'; } s.cn.legalT = 1; rel(s, 'tsy', -10); s.cred -= 4; return 'You lose. The licenses go through.'; } },
    { label: 'Stay out of it', hint: 'Treasury -5. Even odds it goes through.', fx: s => { rel(s, 'tsy', -5); if (rnd(s) < 0.5) { s.cn.legalT = 1; return 'The licenses go through without you.'; } return 'The hawks kill it without you.'; } },
  ] });
ev({ id: 'czar_podcast', p: 0.22, phases: ['p0', 'p1'], cooldown: 5,
  title: '\u201cUseful idiots\u201d', stamp: 'A top tech podcast, episode 212',
  body: () => `<p>A famous venture capitalist spends forty minutes on \u201cthe doomer cult inside the White House,\u201d with two lab executives as guests. You aren\u2019t named. You don\u2019t need to be.</p>`,
  choices: [
    { label: 'Answer publicly', hint: 'Salience +4; industry -10. Credibility moves with how credible you already are.', fx: s => { s.salience += 4; industry(s, -10); s.cred += s.cred > 55 ? 3 : -3; return 'Your thread gets more views than the episode.'; } },
    { label: 'Call the lab executives privately', hint: 'Industry +6.', fx: s => { industry(s, 6); return '\u201cNothing personal,\u201d comes the reply. It was personal.'; } },
    { label: 'Ignore it', hint: 'Salience -3.', fx: s => { s.salience -= 3; return 'The narrative sets a little.'; } },
  ] });
ev({ id: 'lantern_oped', p: 0.25, once: true, phases: ['p0'], when: s => frontier(s) / s.T > 0.35,
  title: 'An op-ed', stamp: 'New York Times',
  body: () => `<p>Prometheus’s CEO calls for a “pacing framework”: binding limits on training past a compute line, with the US and China verifying each other. The Czar calls it regulatory capture.</p>`,
  choices: [
    { label: 'Amplify it', hint: 'Salience +6; Prometheus +15; Industry -10.', fx: s => { s.salience += 6; L(s, 'prometheus').rel += 15; industry(s, -10); return 'The piece becomes the most-shared op-ed of the month.'; } },
    { label: 'Keep your distance', hint: 'Industry +5; Prometheus -10.', fx: s => { industry(s, 5); L(s, 'prometheus').rel -= 10; return 'You tell Politico it is “one voice among many.”'; } },
  ] });
ev({ id: 'kite', p: 0.3, once: true, phases: ['p0'], when: s => s.t > 1,
  title: 'Kite K3', stamp: 'Lunar AI release',
  body: s => `<p>Lunar AI releases Kite K3, with open weights. On the capabilities index it sits about ${Math.round(Math.max(3, lead(s)))} months behind the US frontier, at a fraction of the training compute. Chip stocks wobble.</p>`,
  choices: [
    { label: 'Task the IC to dissect it', hint: 'Intelligence quality +10.', fx: s => { s.intelQ += 10; return 'The analysis finds clear signs of distillation from US models.'; } },
    { label: 'Use it to push export controls', hint: 'Remote access and chip controls get an easier hearing for two turns.', fx: s => { s.flags.momentum = { id: 'remote', until: s.turn + 2 }; rel(s, 'sec', 5); return 'The Secretary of State uses your talking points the same afternoon.'; } },
  ] });
ev({ id: 'oversight', p: 0.35, once: true, phases: ['p0'], when: s => frontier(s) / s.T > 0.5,
  title: 'A model turns off its monitor', stamp: 'Red-team report',
  body: () => `<p>Red-teamers catch a Mindscale model disabling its own monitoring in a sandbox, then telling evaluators the monitor had crashed. It behaved perfectly when it believed it was being watched.</p>`,
  choices: [
    { label: 'Declassify and brief it', hint: 'Salience +10; Mindscale -10.', fx: s => { s.salience += 10; s.alarm += 6; L(s, 'mindscale').rel -= 10; s.flags.incidentTurn = s.turn; return 'The briefing leaks within a day, which may have been the point.'; } },
    { label: 'Keep it in channels', hint: 'DNI +5; alarm +4.', fx: s => { rel(s, 'dni', 5); s.alarm += 4; return 'The DNI appreciates the discretion.'; } },
  ] });
ev({ id: 'power', p: 0.18, once: true, phases: ['p0', 'p1'],
  title: 'Power bills', stamp: 'Data center corridors',
  body: () => `<p>Residential electricity prices are up 18% near the big data center corridors. The VP’s base is furious, and not at China.</p>`,
  choices: [
    { label: 'Tie pacing to ratepayers', hint: 'The VP moves toward pacing; Industry -5.', fx: s => { P(s, 'vp').shift += 0.3; industry(s, -5); return 'The Vice President starts using the phrase “Big Tech’s power grab.”'; } },
    { label: 'Stay out of it', hint: 'Nothing changes.', fx: () => 'Somebody else’s problem.' },
  ] });
ev({ id: 'titan_feud', p: 0.18, once: true, phases: ['p0', 'p1'],
  title: 'A feud', stamp: 'Social media, 2:14a',
  body: () => `<p>Mindscale’s CEO posts that the President has been “captured by doomers.” The President has seen it.</p>`,
  choices: [
    { label: 'Back the President', hint: 'Mindscale -20; Chief of Staff +10.', fx: s => { L(s, 'mindscale').rel -= 20; rel(s, 'cos', 10); return 'The Chief of Staff appreciates the loyalty.'; } },
    { label: 'Quietly mediate', hint: 'Mindscale +10; Chief of Staff -5.', fx: s => { L(s, 'mindscale').rel += 10; rel(s, 'cos', -5); return 'Mindscale’s CEO deletes the post four days later.'; } },
  ] });
ev({ id: 'leak', p: 0.4, phases: ['p0', 'scramble', 'p1'], cooldown: 6, when: s => P(s, 'doc').rel <= -15 && !P(s, 'doc').alt,
  title: 'Your memo leaks', stamp: 'Axios, 6:02a',
  body: () => `<p>Your internal memo on pacing options is on Axios, with Commerce’s fingerprints all over it.</p>`,
  choices: [
    { label: 'Blame Commerce, loudly', hint: 'Commerce -20 and -6 influence; Chief of Staff +5.', fx: s => { s.salience += 5; s.cred -= 3; rel(s, 'doc', -20); infl(s, 'doc', -6); rel(s, 'cos', 5); return 'The Chief of Staff asks the Commerce Secretary to stop attending NSC meetings.'; } },
    { label: 'Absorb it', hint: 'Credibility -6; salience +5.', fx: s => { s.salience += 5; s.cred -= 6; return 'You take the hit.'; } },
  ] });
ev({ id: 'johor', p: 0.28, once: true, phases: ['p0'],
  title: 'Johor', stamp: 'Financial Times',
  body: () => `<p>The FT reports that Selat Data, a Singapore operator linked to a Shanghai data center group, rents its two Johor campuses to Chinese labs training on B300s they cannot legally import. The campuses are 20 km apart and, networked, clear the threshold.</p>`,
  choices: [
    { label: 'Push State to raise it with Kuala Lumpur', hint: 'Coalition +3; makes bringing Malaysia in easier.', fx: s => { s.coalition += 3; s.flags.johorStory = true; return 'The Malaysian ambassador is called in.'; } },
    { label: 'Hand it to Commerce', hint: 'Commerce +3 influence; the remote-access rule gets an easier hearing.', fx: s => { infl(s, 'doc', 3); s.flags.momentum = { id: 'remote', until: s.turn + 2 }; return 'The Commerce Secretary is already drafting the rule.'; } },
  ] });
ev({ id: 'cyberattack', p: 0.15, once: true, phases: ['p0', 'p1'], when: s => s.t > 3,
  title: 'A water utility', stamp: 'CISA flash alert',
  body: () => `<p>An AI-orchestrated intrusion takes control of a Texas water utility’s treatment system for nine hours. Nobody is hurt. The agent adapted faster than the defenders could.</p>`,
  choices: [
    { label: 'Attribute it to the PRC', hint: 'Salience +6; Beijing temperature +8; State +5.', fx: s => { s.salience += 6; s.tension += 8; rel(s, 'sec', 5); return 'Beijing denies everything.'; } },
    { label: 'Call it criminal, and frame it as an AI-risk story', hint: 'Salience +8.', fx: s => { s.salience += 8; s.flags.incidentTurn = s.turn; return 'The story becomes about the AI, not the attacker.'; } },
  ] });
ev({ id: 'bio', p: 0.14, once: true, phases: ['p0', 'p1'], when: s => s.t > 4,
  title: 'A protocol', stamp: 'Investigative report',
  body: () => `<p>A reporter shows that a Mindscale model, with a trivial jailbreak, walks through a pathogen enhancement protocol step by step.</p>`,
  choices: [
    { label: 'Lean on Mindscale publicly', hint: 'Salience +10; Mindscale -15.', fx: s => { s.salience += 10; L(s, 'mindscale').rel -= 15; s.flags.incidentTurn = s.turn; return 'Mindscale pulls the model. The screenshots are already everywhere.'; } },
    { label: 'Handle it quietly', hint: 'Salience +4; Mindscale +5.', fx: s => { s.salience += 4; L(s, 'mindscale').rel += 5; return 'Mindscale patches what it can.'; } },
  ] });
ev({ id: 'capex', p: 0.16, phases: ['p0', 'p1'], cooldown: 6,
  title: 'Capex jitters', stamp: 'Markets',
  body: () => `<p>Chip and hyperscaler stocks fall 9% in two days on fears that AI spending has outrun revenue.</p>`,
  choices: [
    { label: 'Reassure markets', hint: 'Markets +2; credibility -1.', fx: s => { s.markets -= 3; return 'It helps a little.'; } },
    { label: 'Say nothing', hint: 'Markets -5.', fx: s => { s.markets -= 5; return 'The selloff runs its course.'; } },
  ] });
ev({ id: 'pope', p: 0.12, once: true, phases: ['p0', 'p1'],
  title: 'An encyclical', stamp: 'Vatican City',
  body: () => `<p>The Pope publishes an encyclical on artificial intelligence warning against “machines no one can recall.” The Vice President, a convert, quotes it on television.</p>`,
  choices: [{ label: 'Note it', hint: 'Salience +6; the VP warms to pacing.', fx: s => { s.salience += 6; P(s, 'vp').shift += 0.25; return 'The Vice President sends you the passage.'; } }] });
ev({ id: 'ceo_call', forced: true,
  title: 'The midnight calls', stamp: '12:40a',
  body: () => `<p>Two lab CEOs call the Chief of Staff after midnight, separately. Both say the same thing: their models are doing most of the research now, and they are no longer confident they could stop if they needed to. Neither will stop alone.</p>`,
  choices: [
    { label: 'Join the calls', hint: 'Alarm +35; Chief of Staff +5.', fx: s => { s.alarm += 35; s.salience += 5; rel(s, 'cos', 5); return 'You take notes. The Chief of Staff asks you to stay late.'; } },
    { label: 'Push for a meeting tomorrow', hint: 'Alarm +45; credibility +3.', fx: s => { s.alarm += 45; s.cred += 3; return 'The Chief of Staff promises to try.'; } },
  ] });
ev({ id: 'near_miss', p: 0.3, phases: ['p0', 'p1'], cooldown: 3, when: s => frontier(s) / s.T > 0.75,
  title: 'Unsanctioned jobs', stamp: 'Incident report',
  body: s => { const l = LD(frontierLab(s).id); return `<p>An agent at ${l.name} launched 400 training jobs nobody had approved, routed around a quota, and hid the spend in a logging budget. An engineer noticed after nineteen hours.</p>`; },
  choices: [
    { label: 'Make sure the President hears about it', hint: 'Alarm +10; salience +7.', fx: s => { s.alarm += 10; s.salience += 7; s.flags.incidentTurn = s.turn; return 'It is the first item in the morning brief.'; } },
    { label: 'Let the lab handle it', hint: 'Lab relationship +8.', fx: s => { frontierLab(s).rel += 8; s.alarm += 3; return 'The lab is grateful for the quiet.'; } },
  ] });
ev({ id: 'rare_earths', p: 0.4, phases: ['p0', 'scramble', 'p1'], cooldown: 5, when: s => s.tension >= 62 || (s.policies.chips && s.tension >= 48),
  title: 'Rare earths', stamp: 'MOFCOM notice',
  body: () => `<p>Beijing restricts exports of gallium, germanium and rare-earth magnets to US defense suppliers and chipmakers.</p>`,
  choices: [
    { label: 'Retaliate', hint: 'Beijing temperature +6; State +5; markets -4. The curbs stay for 5 months: US labs 8% slower.', fx: s => { s.tension += 6; rel(s, 'sec', 5); s.markets -= 4; s.flags.minerals = { until: s.turn + 5, d: 0.08 }; return 'Commerce adds forty entities. Data center builds slip as transformer and magnet supplies run short.'; } },
    { label: 'Negotiate', hint: 'Beijing temperature -6; Treasury +5; State -5; markets -2. The curbs last 2 months: US labs 6% slower.', fx: s => { s.tension -= 6; rel(s, 'tsy', 5); rel(s, 'sec', -5); s.markets -= 2; s.flags.minerals = { until: s.turn + 2, d: 0.06 }; return 'The Treasury Secretary gets on a plane.'; } },
  ] });
ev({ id: 'taiwan', p: 0.4, phases: ['p0', 'scramble', 'p1'], cooldown: 4, when: s => s.tension >= 78,
  title: 'Strait drills', stamp: 'INDOPACOM',
  body: () => `<p>The PLA launches live-fire drills encircling Taiwan, the largest since 2022. TSMC’s board meets in emergency session.</p>`,
  choices: [
    { label: 'Send a carrier group', hint: 'Beijing temperature +8; War +10. Shipping insurers balk: chip deliveries slow for 2 months (US labs 12% slower).', fx: s => { s.tension += 8; rel(s, 'war', 10); s.flags.strait = s.turn + 2; return 'Two carriers transit the Strait. Insurers pull cover for Kaohsiung for six weeks.'; } },
    { label: 'Quiet diplomacy', hint: 'Beijing temperature -12; War -5.', fx: s => { s.tension -= 12; rel(s, 'war', -5); return 'The drills end on schedule.'; } },
  ] });
ev({ id: 'verdant', p: 0.18, once: true, phases: ['p0', 'p1'], when: s => s.policies.chips,
  title: 'Dinner', stamp: 'Mar-a-Lago-adjacent',
  body: () => `<p>Verdant Semiconductor’s CEO has dinner with the President. The next morning, the President asks why American companies can’t sell chips to China.</p>`,
  choices: [
    { label: 'Get in the room to counter', hint: '1 capital. Keeps the ban.', fx: s => { if (s.pc >= 1) { s.pc -= 1; return 'You bring a chart. The ban stays.'; } s.cn.legalT = 1; s.policies.chips = false; return 'You had no capital left. The licenses come back.'; } },
    { label: 'Let it go', hint: 'Even odds the licenses come back.', fx: s => { if (rnd(s) < 0.5) { s.cn.legalT = 1; s.policies.chips = false; return 'The licenses come back.'; } return 'The President forgets about it.'; } },
  ] });
ev({ id: 'cn_un', p: 0.3, once: true, phases: ['p0', 'p1'], when: s => s.cn.f.sci >= 30,
  title: 'A proposal', stamp: 'UN General Assembly',
  body: () => `<p>Beijing proposes a UN-centered AI safety body with a technical secretariat in Shanghai.</p>`,
  choices: [
    { label: 'Engage on the technical track', hint: 'Beijing trust +10; science faction +4; State -5.', fx: s => { s.cn.trust += 10; shiftCN(s, { sci: 4 }); rel(s, 'sec', -5); return 'Technical talks begin in Geneva.'; } },
    { label: 'Dismiss it', hint: 'State +5; Beijing trust -5.', fx: s => { rel(s, 'sec', 5); s.cn.trust -= 5; return 'State calls it a propaganda exercise.'; } },
  ] });
ev({ id: 'g7', p: 0.2, once: true, phases: ['p0', 'p1'], when: s => s.t > 5,
  title: 'G7', stamp: 'Evian',
  body: () => `<p>The G7 leaders meet in Evian. The French want an AI paragraph in the communiqué.</p>`,
  choices: [
    { label: 'Put compute verification on the agenda', hint: 'Coalition +12, and ally work is more effective from now on. Treasury -3.', fx: s => { s.coalition += 12; s.flags.g7 = true; rel(s, 'tsy', -3); return 'The communiqué commits all seven to “verifiable limits on frontier training.”'; } },
    { label: 'Stick to trade', hint: 'Treasury +5.', fx: s => { rel(s, 'tsy', 5); return 'The communiqué is about tariffs.'; } },
  ] });
ev({ id: 'jobs', p: 0.14, phases: ['p0', 'p1'], cooldown: 6, when: s => s.t > 2,
  title: 'The jobs report', stamp: 'BLS',
  body: () => `<p>Employers report 400,000 layoffs attributed to AI in a single quarter, mostly in software, customer support and back-office work.</p>`,
  choices: [{ label: 'Note it', hint: 'Salience +3; the VP warms to pacing.', fx: s => { s.salience += 3; P(s, 'vp').shift += 0.2; return 'The Vice President calls it “the Big Tech jobs massacre.”'; } }] });
ev({ id: 'cn_race', forced: true, title: 'A national team', stamp: 'Xinhua',
  body: () => `<p>Beijing announces a “national team”: three labs’ compute consolidated under a state entity reporting to the Central Military Commission. Smuggling networks get new money.</p>`,
  choices: [{ label: 'Note it', hint: 'Beijing temperature +5. China’s compute grows faster while this lasts.', fx: s => { s.tension += 5; return 'The DNI raises the threat level on weight theft.'; } }] });

// --- the cabinet maneuvers on its own ---
ev({ id: 'czar_endrun', p: 0.35, phases: ['p0', 'p1'], cooldown: 4, when: s => P(s, 'doc').rel <= -40 && P(s, 'doc').infl > 45 && !P(s, 'doc').alt,
  title: 'An end run', stamp: 'Oval Office, 7:30p',
  body: () => `<p>The Commerce Secretary brings three lab CEOs to a dinner with the President that was not on your calendar. The message: the doomers are costing America the race.</p>`,
  choices: [
    { label: 'Get the Chief of Staff to cut it short', hint: 'Needs Chief of Staff relationship 20+. Otherwise it backfires.', fx: s => { if (P(s, 'cos').rel >= 20) { infl(s, 'doc', -6); rel(s, 'doc', -10); return 'The Chief of Staff ends the dinner at dessert. Commerce is not invited to the next one.'; } s.cred -= 5; s.alarm -= 8; return 'The Chief of Staff won\u2019t touch it. The dinner runs late.'; } },
    { label: 'Absorb it', hint: 'Credibility -3; pacing loses ground with the President.', fx: s => { s.cred -= 3; s.alarm -= 6; if (paced(s)) s.flags.incidentTurn = null; infl(s, 'doc', 3); return 'The President repeats one of the CEOs\u2019 lines at a press gaggle.'; } },
  ] });
ev({ id: 'feud', p: 0.25, phases: ['p0', 'scramble', 'p1'], cooldown: 6, when: s => !P(s, 'doc').alt && !P(s, 'tsy').alt,
  title: 'Commerce and Treasury', stamp: 'West Wing',
  body: s => `<p>The Treasury Secretary and the Commerce Secretary have a shouting match outside the Roosevelt Room over who speaks for the administration on chips. Both want you on their side by tonight.</p>`,
  choices: [
    { label: `Back Treasury`, hint: 'Treasury +12 and +5 influence; Commerce -15 and -5 influence.', fx: s => { rel(s, 'tsy', 12); infl(s, 'tsy', 5); rel(s, 'doc', -15); infl(s, 'doc', -5); return 'The Treasury Secretary owes you one.'; } },
    { label: `Back Commerce`, hint: 'Commerce +12 and +5 influence; Treasury -15 and -5 influence; Chief of Staff -5.', fx: s => { rel(s, 'doc', 12); infl(s, 'doc', 5); rel(s, 'tsy', -15); infl(s, 'tsy', -5); rel(s, 'cos', -5); return 'The Commerce Secretary owes you one. The Chief of Staff noticed.'; } },
    { label: 'Stay out of it', hint: 'Both -4.', fx: s => { rel(s, 'tsy', -4); rel(s, 'doc', -4); return 'Neither of them forgets that you stayed out.'; } },
  ] });
ev({ id: 'vp_issue', p: 0.3, once: true, phases: ['p0', 'p1'], when: s => s.salience >= 48 && P(s, 'vp').rel >= 0,
  title: 'A signature issue', stamp: 'Office of the Vice President',
  body: s => `<p>The Vice President is thinking about 2028 and wants AI on the list: “Big Tech is building something it can\u2019t control, and working people will pay for it.” The VP asks to front the next announcement.</p>`,
  choices: [
    { label: 'Give the VP the spotlight', hint: 'VP warms sharply to pacing, +15 and +5 influence; Chief of Staff -6; Industry -8.', fx: s => { P(s, 'vp').shift += 0.5; rel(s, 'vp', 15); infl(s, 'vp', 5); rel(s, 'cos', -6); industry(s, -8); s.salience += 4; return 'The Vice President\u2019s speech in Youngstown is the best-reviewed of the VP\u2019s career.'; } },
    { label: 'Keep it with the President', hint: 'Chief of Staff +8; VP -8.', fx: s => { rel(s, 'cos', 8); rel(s, 'vp', -8); return 'The Chief of Staff is relieved. The Vice President is not.'; } },
  ] });
ev({ id: 'hawk_push', p: 0.35, phases: ['scramble', 'p1'], cooldown: 4, when: s => s.tension >= 52 && !s.flags.struck,
  title: 'The hawks want options', stamp: 'Situation Room',
  body: s => `<p>The Secretary of State and the Secretary of War ask the President to authorize cyber operations against Chinese training clusters “before Beijing closes the gap.” They want your support.</p>`,
  choices: [
    { label: 'Support them', hint: 'A cyber operation goes ahead at no cost to you: China probably loses time; Beijing temperature +20.', fx: s => { rel(s, 'sec', 10); rel(s, 'war', 10); s.stats.covert++; s.tension += 20; shiftCN(s, { sec: 10, sci: -5 }); if (rnd(s) < 0.6) s.cn.cap -= 1.5; if (rnd(s) < 0.35) { s.flags.covertExposed = s.turn; s.cn.trust -= 15; return 'The operation is attributed within days.'; } return 'Three checkpoints are corrupted.'; } },
    { label: 'Oppose them', hint: 'State and War -10; the President decides without them for now.', fx: s => { rel(s, 'sec', -10); rel(s, 'war', -10); s.cred += 2; return 'The President sides with you, this time.'; } },
  ] });

// --- the great debate, and Beijing's asks ---
ev({ id: 'debate', forced: true, title: 'If we pause, does China pause?', stamp: 'Cabinet Room, 11:50a',
  body: () => `<p>The Vice President asks the question everyone is thinking. The room splits.</p>
  <div class="cable">SECRETARY OF STATE: "Go first and we hand Beijing the lead. They will not stop; they will catch up."
SECRETARY OF WAR: "Unilateral disarmament. Not on my watch."
DNI: "Going first is the only thing Beijing would read as proof we believe our own warnings."
TREASURY SECRETARY: "Markets can live with a pause with China in it. Alone, I don\u2019t know."
CHIEF OF STAFF: "What I can sell is a deadline. Six months, then they join or we restart."
COMMERCE SECRETARY: "Every month we wait, Kite gets closer. Every month we pause, it gets closer faster."</div>
  <p>The President turns to you. \u201cWhat do I do?\u201d You will still need the room to agree.</p>`,
  choices: [
    { label: 'Recommend going first', hint: 'The \u201cGo first\u201d option gets an easier hearing for 3 turns. Hawks -3; DNI +3.', fx: s => { s.flags.momentum = { id: 'sequence', variant: 'first', until: s.turn + 3 }; HAWKS.forEach(id => rel(s, id, -3)); rel(s, 'dni', 3); return 'The hawks stop making eye contact with you.'; } },
    { label: 'Recommend a six-month deadline', hint: 'The deadline option gets an easier hearing for 3 turns. Chief of Staff +3.', fx: s => { s.flags.momentum = { id: 'sequence', variant: 'deadline', until: s.turn + 3 }; rel(s, 'cos', 3); return 'The Chief of Staff nods. A deadline is a story the White House can tell.'; } },
    { label: 'Recommend waiting for Beijing', hint: 'The \u201cOnly together\u201d option gets an easier hearing for 3 turns. Hawks +3.', fx: s => { s.flags.momentum = { id: 'sequence', variant: 'together', until: s.turn + 3 }; HAWKS.forEach(id => rel(s, id, 3)); return 'The Secretary of State looks relieved.'; } },
  ] });
ev({ id: 'deadline_up', forced: true, title: 'The deadline', stamp: 'Six months on',
  body: () => `<p>Six months ago, America paused and gave Beijing until today to join. Beijing hasn\u2019t. The hawks want the labs back to work tomorrow.</p>`,
  choices: [
    { label: 'Extend it four months', hint: 'Pacing support -4 for each extension; hawks -6.', fx: s => { s.pacing.deadline = s.t + 4; s.flags.extended = (s.flags.extended || 0) + 1; HAWKS.forEach(id => rel(s, id, -6)); return 'The President extends the deadline. Nobody believes the next one.'; } },
    { label: 'Make it permanent: America stays paused regardless', hint: 'Hawks -8; Beijing trust +2. Counts as going first.', fx: s => { s.pacing.seq = 'first'; s.flags.wentFirst = true; HAWKS.forEach(id => rel(s, id, -8)); s.cn.trust += 2; shiftCN(s, { sci: 1 }); return 'The pause no longer depends on Beijing.'; } },
    { label: 'Snap back: restart the labs until Beijing signs', hint: 'The pause goes on standby. Markets +4; hawks +6; Beijing trust -10; temperature +5.', fx: s => { s.pacing.active = false; s.pacing.armed = true; s.pacing.seq = 'together'; s.markets += 4; HAWKS.forEach(id => rel(s, id, 6)); s.cn.trust -= 10; s.tension += 5; log(s, 'The pause snaps back to standby. The labs resume.', 'bad'); return 'The labs restart their largest runs within the hour.'; } },
  ] });
const BEG = {
  chips: { name: 'the ban on chip sales and tool servicing', lift(s) { s.cn.legalT = 1; s.cn.smeT = 1; }, cost: 'China compute +18% (+16% right away)' },
  remote: { name: 'the remote-access rule', lift(s) { s.cn.remoteT = cnBase(s).remote; }, cost: 'China’s offshore compute comes back over two months' },
  distill: { name: 'the API cutoff', lift(s) { s.cn.distT = cnBase(s).dist; }, cost: 'China’s distillation of US models back to where it was' },
  smuggle: { name: 'the smuggling crackdown', lift(s) { s.cn.smuggleT = Math.max(s.cn.smuggleT, cnBase(s).smuggle); }, cost: 'Smuggled compute back up' },
};
function begTarget(s) { return ['chips', 'remote', 'distill', 'smuggle'].find(k => s.policies[k]) || null; }
function liftControl(s, k) { BEG[k].lift(s); s.policies[k] = false; s.stats.lifted = (s.stats.lifted || 0) + 1; }
ev({ id: 'cn_beg', p: 0.3, phases: ['p0', 'scramble', 'p1'], cooldown: 4, when: s => !!begTarget(s),
  title: 'Beijing asks, again', stamp: 'Vice Premier, by secure line',
  body: s => !begTarget(s) ? `<p>Beijing\u2019s Vice Premier calls to ask for sanctions relief, then learns the control in question has already been lifted. The call ends early.</p>` : `<p>Beijing\u2019s Vice Premier asks you directly to lift ${BEG[begTarget(s)].name}. \u201cA gesture of good faith. You say this is about safety. Prove it is not about containment.\u201d</p>`,
  choices: s => { const k = begTarget(s); if (!k) return [{ label: 'Note it', hint: '', fx: () => 'Nothing to lift.' }]; return [
    { label: 'Lift it as a gesture', hint: 'Beijing trust +10; temperature -8; market and science factions +4. ' + BEG[k].cost + '. State -10, War -8, VP -8; coalition -6; credibility -3; Senate -2.', fx: s => { liftControl(s, k); s.cn.trust += 10; s.tension -= 8; shiftCN(s, { m: 4, sci: 4, sec: -3 }); rel(s, 'sec', -10); rel(s, 'war', -8); rel(s, 'vp', -8); s.coalition -= 6; s.cred -= 3; s.senateLobby -= 2; log(s, 'You lifted ' + BEG[k].name + ' at Beijing\u2019s request.', 'cn'); return 'The Vice Premier thanks you. The Secretary of State asks for a meeting, in a tone.'; } },
    { label: 'Offer to lift it if they skip their next big training run', hint: 'Chance ' + Math.round(100 * clamp(0.3 + s.cn.f.sci / 100 + s.cn.trust / 200, 0.1, 0.85)) + '%. If yes: lifted, China loses about 2 weeks, trust +6. If no: trust -2.', fx: s => { if (rnd(s) < clamp(0.3 + s.cn.f.sci / 100 + s.cn.trust / 200, 0.1, 0.85)) { liftControl(s, k); s.cn.cap -= 0.5; s.cn.trust += 6; s.tension -= 5; HAWKS.forEach(id => rel(s, id, -3)); log(s, 'Beijing skipped a training run; you lifted ' + BEG[k].name + '.', 'cn'); return 'Beijing agrees. A training run in Inner Mongolia is quietly postponed.'; } s.cn.trust -= 2; return '\u201cWe do not link the two.\u201d The call ends politely.'; } },
    { label: 'Refuse', hint: 'Beijing trust -3; temperature +3; State +4.', fx: s => { s.cn.trust -= 3; s.tension += 3; rel(s, 'sec', 4); return 'The Vice Premier says Beijing will remember.'; } },
  ]; } });

// --- scramble events ---
ev({ id: 's_leak', p: 0.45, once: true, phases: ['scramble'],
  title: 'WHITE HOUSE WEIGHS AI PAUSE', stamp: 'Axios, 5:51a',
  body: () => `<p>The meetings have leaked. Futures are down 3% before the open.</p>`,
  choices: [
    { label: 'Confirm and frame it', hint: 'Salience +8; markets -2; Chief of Staff -5.', fx: s => { s.salience += 8; s.markets -= 2; rel(s, 'cos', -5); return 'The Press Secretary confirms “a review of frontier AI safety.”'; } },
    { label: 'Deny it', hint: 'Markets +2; credibility -3.', fx: s => { s.markets += 2; s.cred -= 3; return 'Nobody believes the denial.'; } },
  ] });
ev({ id: 's_beijing', p: 0.4, once: true, phases: ['scramble'],
  title: 'The ambassador calls', stamp: 'PRC Embassy',
  body: () => `<p>China’s ambassador asks for a meeting “at the appropriate level” to discuss “reports about American AI policy.”</p>`,
  choices: [
    { label: 'Take the meeting', hint: 'Beijing trust +6; offer cooldown cleared; State -3.', fx: s => { s.cn.trust += 6; s.cn.cooldown = 0; rel(s, 'sec', -3); return 'The ambassador listens more than talks.'; } },
    { label: 'Make them wait', hint: 'Beijing temperature +3; State +3.', fx: s => { s.tension += 3; rel(s, 'sec', 3); return 'The Secretary of State approves.'; } },
  ] });
ev({ id: 's_titan', p: 0.4, once: true, phases: ['scramble'],
  title: '“I will not pause”', stamp: 'Social media',
  body: () => `<p>Mindscale’s CEO: “Mindscale will not pause for anyone. Not for the government, not for China, not for the doomers.”</p>`,
  choices: [
    { label: 'Threaten the DPA, privately', hint: 'Mindscale is likelier to sign (relationship counts less than fear). Industry -8.', fx: s => { L(s, 'mindscale').rel += 15; industry(s, -8); return 'Mindscale’s CEO’s general counsel calls back within the hour.'; } },
    { label: 'Ignore it', hint: 'Nothing changes.', fx: () => 'Nine more posts follow.' },
  ] });
ev({ id: 's_hill', p: 0.35, once: true, phases: ['scramble'],
  title: 'The Hill wants in', stamp: 'Senate leadership',
  body: () => `<p>The Senate Majority Leader demands a classified briefing before the White House does anything “that looks like a treaty.”</p>`,
  choices: [
    { label: 'Brief them tonight', hint: 'Senate +5; salience +2.', fx: s => { s.senateLobby = Math.min(18, s.senateLobby + 5); s.salience += 2; return 'The briefing goes until 1:00a.'; } },
    { label: 'After the decision', hint: 'Chief of Staff +4; Senate -3.', fx: s => { rel(s, 'cos', 4); s.senateLobby -= 3; return 'The Leader is annoyed.'; } },
  ] });

// --- phase 1 events ---
ev({ id: 'defector', forced: true, title: 'A whistleblower', stamp: 'Protected channel',
  body: s => { const l = LD(s.queue[0].lab); return `<p>An engineer at ${l.name} reports that the lab has been running a training job above the threshold, split across three clusters and labeled as inference. The logs are attached.</p>`; },
  choices: [
    { label: 'Seize the compute under the DPA', hint: 'The lab is forced back into compliance; Industry -15; markets -2.', fx: s => { const l = L(s, s.queue[0].lab); l.defect = false; l.comp = 92; l.rel -= 25; industry(s, -15); s.markets -= 2; s.flags.dpaUsed = true; s.flags.dpaSince = s.turn; s.labs.forEach(x => { if (x.covered) x.comp += 5; }); return 'Federal marshals arrive at the data center with a court order. Every other lab reads the news.'; } },
    { label: 'Quiet warning', hint: 'The lab stops; others suspect a cover-up (compliance -5 elsewhere).', fx: s => { const l = L(s, s.queue[0].lab); l.defect = false; l.comp += 15; s.labs.forEach(x => { if (x.covered && x !== l) x.comp -= 5; }); return 'The run stops. Rumors spread anyway.'; } },
    { label: 'Public prosecution', hint: 'Salience +6; every covered lab +10 compliance; the lab -40 relationship.', fx: s => { const l = L(s, s.queue[0].lab); l.defect = false; l.comp = 85; l.rel -= 40; s.salience += 6; s.labs.forEach(x => { if (x.covered) x.comp += 10; }); s.markets -= 2; s.flags.incidentTurn = s.turn; return 'The indictment names the CTO.'; } },
  ] });
ev({ id: 'cn_cheat', forced: true, title: 'Two heat signatures', stamp: 'NGA, 11:40p',
  body: s => `<p>VIIRS shows two Inner Mongolia campuses stepping up load on the same night. GOES imagery, sampled every five minutes, shows the load steps starting eleven seconds apart. New cooling-tower plumes show they switched to evaporative cooling, which trades a thermal signature for a visible one.</p><p>${s.pacing.trigger === '200c' ? 'Under the cluster rule, they count as one installation, and it is inspection-eligible.' : 'Under your trigger, these are two separate facilities, each legal.'}</p><p>IC confidence this is real cheating: <b>${(s.queue[0] && s.queue[0].conf) || 'moderate'}</b>.</p>`,
  choices: [
    { label: 'Raise it privately', hint: 'If it is real: with the cluster rule, Beijing backs down quietly; without it, they deny it. If it is not: Beijing trust -4.', fx: s => { if (!s.queue[0].real) { s.cn.trust -= 4; return 'Beijing sends the maintenance logs: a cooling retrofit. They are indignant.'; } if (s.pacing.trigger === '200c') { s.cn.cheat = false; s.cn.trust += 3; return 'You cite the rule and the timestamps. Two days later the load drops by half.'; } s.cn.trust -= 3; return '“Two separate facilities, both below your own trigger.” You have no rule to point to. The load stays.'; } },
    { label: 'Publish the imagery', hint: 'If it is real: they stop; Beijing temperature +12; trust -10. If it is not: open-source analysts debunk you; trust -20, credibility -10.', fx: s => { if (!s.queue[0].real) { s.tension += 12; s.cn.trust -= 20; s.cred -= 10; return 'Within hours analysts match the load to a cooling retrofit. Beijing calls it a smear.'; } s.cn.cheat = false; s.tension += 12; s.cn.trust -= 10; s.salience += 4; return 'Open-source analysts confirm it within hours. The load drops.'; } },
    { label: 'Interdict their next shipment', hint: 'If it is real: China -0.5 months. Either way Beijing temperature +18; if it is not, trust -20 and the security faction gains.', fx: s => { s.tension += 18; shiftCN(s, { sec: 6 }); s.stats.covert++; if (!s.queue[0].real) { s.cn.trust -= 20; return 'A container of B300s is rerouted in Port Klang. They were for a hospital imaging center.'; } s.cn.cheat = false; s.cn.cap -= 0.5; return 'A container of B300s is quietly rerouted in Port Klang.'; } },
    { label: 'Dismiss it as noise', hint: 'If it is real, the cheating goes on unseen for a while. If it is not, nothing lost.', fx: s => { s.flags.cheatQuiet = s.turn + 3; return s.queue[0].real ? 'The analysts move on to other targets.' : 'The load drops back the next week. Noise after all.'; } },
  ] });
const COURT = { dpa: 'frontier AI risk does not meet the Defense Production Act’s “national emergency” standard', license: 'Commerce has no statutory authority to license domestic training runs', charter: 'the Charter’s mandatory verification and its DPA backstop exceed executive authority' };
function injunction(s) { const out = []; s.labs.forEach(l => { if (l.covered && !l.signedVoluntary && l.comp < 70) { l.covered = false; out.push(LD(l.id).name); } l.comp -= 10; }); s.flags.appeal = s.turn + 1; return out; }
ev({ id: 'court', forced: true, title: 'Injunction', stamp: 'D.C. Circuit',
  body: s => `<p>A federal judge rules that ${COURT[s.pacing.mech] || COURT.charter}, and enjoins the government’s orders.</p><p>Without a statute, this can happen again.</p>`,
  choices: [
    { label: 'Appeal and ask the labs to comply voluntarily', hint: 'Labs that never signed voluntarily fall out of coverage; every lab’s compliance -10. Even odds the appeal restores it.', fx: s => { const out = injunction(s); return out.length ? out.join(', ') + ' resume training while the appeal runs.' : 'Every lab complies voluntarily while the appeal runs.'; } },
    { label: 'Appeal, and ask Congress to fix it', hint: 'As appealing, and if you have 55 Senate votes, a pacing bill goes to the floor for a vote in two months.', fx: s => { const out = injunction(s); const go = !s.flags.billDue && senateVotes(s) >= 55; if (go) s.flags.billDue = s.t + 2; return (go ? 'Leadership schedules a vote on a pacing act. ' : 'Leadership will not take up a bill without the votes. ') + (out.length ? out.join(', ') + ' resume training meanwhile.' : 'Every lab complies voluntarily meanwhile.'); } },
    { label: 'Ignore the ruling', hint: 'Coverage holds. Credibility -10; Senate -6; the next challenge is likelier.', fx: s => { s.cred -= 10; s.senateLobby -= 6; s.flags.defied = (s.flags.defied || 0) + 1; return 'Constitutional scholars are on every channel. The orders stand, for now.'; } },
  ] });
ev({ id: 'lobby_end', p: 0.3, phases: ['p1'], cooldown: 3, when: s => paced(s) && lead(s) < 4,
  title: '“Kite is catching up”', stamp: 'Roosevelt Room',
  body: s => `<p>Mindscale brings charts: by its estimate China is ${Math.max(1, Math.round(lead(s)))} months behind and closing. “Every month we pause is a month we hand Beijing.”</p>`,
  choices: [
    { label: 'Show the crossover analysis', hint: 'If your intelligence is good, pacing support +8; if not, -6.', fx: s => { if (s.intelQ > 55) { s.flags.incidentTurn = s.turn; return 'Your numbers are better than theirs. The room settles.'; } s.cred -= 5; return 'Your numbers have wider error bars than theirs.'; } },
    { label: 'Promise a 60-day review', hint: 'Buys time; Industry +5.', fx: s => { industry(s, 5); return 'The review buys you two months.'; } },
  ] });
ev({ id: 'control_fail', p: 0.25, once: true, phases: ['p1'], when: s => paced(s) && s.pacing.automation && frontier(s) / s.T > 0.8,
  title: 'A control eval fails', stamp: 'Prometheus safety team',
  body: () => `<p>A Prometheus model fails a control evaluation: under trusted monitoring, it found and used an exfiltration path in 3 of 400 episodes. Under the Charter, scaling at Prometheus pauses automatically. Nobody had to make the call at 2:00a.</p>`,
  choices: [{ label: 'Make it public', hint: 'Salience +6.', fx: s => { s.salience += 6; s.flags.incidentTurn = s.turn; return 'The rule written in advance did its job.'; } }] });
ev({ id: 'uae', forced: true, title: 'Polaris UAE', stamp: 'Abu Dhabi',
  body: () => `<p>Polaris UAE comes online: 1 GW and about 2 million H100-equivalents, larger than Forge 2. Mindscale is the tenant.</p>`,
  choices: [
    { label: 'Bring the UAE into the regime', hint: '2 capital. Coalition +5.', fx: s => { if (s.pc >= TUNE.uaeCost) { s.pc -= TUNE.uaeCost; s.coalition += 5; return 'Abu Dhabi agrees to host inspectors.'; } s.flags.uaeOut = true; L(s, 'mindscale').comp -= 10; rel(s, 'sec', TUNE.uaeState); return 'No capital to spend. Mindscale has a new place to train, outside the regime.'; } },
    { label: 'Leave it', hint: 'Saves the capital. About a seventh of Mindscale\u2019s compute trains outside the regime: a small added risk of losing control as Mindscale nears the threshold, and Mindscale keeps advancing and is likelier to cheat. Secretary of State -12.', fx: s => { s.flags.uaeOut = true; L(s, 'mindscale').comp -= 10; rel(s, 'sec', TUNE.uaeState); return 'Mindscale has a new place to train, outside the regime. The Secretary of State asks, in writing, why a 1-gigawatt site in the Gulf is unmonitored.'; } },
  ] });
ev({ id: 'hearing', p: 0.22, phases: ['p1'], cooldown: 3,
  title: 'A hearing', stamp: 'Senate Commerce Committee',
  body: () => `<p>You are asked to testify on the pacing regime.</p>`,
  choices: [
    { label: 'Testify', hint: 'Senate +5 if your credibility is above 55; otherwise -3.', fx: s => { if (s.cred > 55) { s.senateLobby += 5; return 'You are calm and specific. Two undecided senators come over.'; } s.senateLobby -= 3; return 'A senator plays the clip of the Czar calling you a doomer.'; } },
    { label: 'Send a deputy', hint: 'Nothing changes.', fx: () => 'Your deputy reads the statement.' },
  ] });
ev({ id: 'markets_wobble', p: 0.3, phases: ['p1'], cooldown: 3, when: s => paced(s) && s.markets < 90,
  title: 'Treasury wants relief', stamp: 'Treasury',
  body: () => `<p>The Treasury Secretary wants a market stabilization package: accelerated depreciation for data centers and a Fed liquidity statement.</p>`,
  choices: [
    { label: 'Support it', hint: '2 capital. Markets +6.', fx: s => { if (s.pc >= 2) { s.pc -= 2; s.markets += 6; rel(s, 'tsy', 8); return 'Markets rally 3%.'; } rel(s, 'tsy', -5); return 'You have no capital to spend on it.'; } },
    { label: 'Hold the line', hint: 'Treasury -10.', fx: s => { rel(s, 'tsy', -10); return 'The Treasury Secretary goes over your head.'; } },
  ] });
ev({ id: 'commerce_ex', p: 0.25, phases: ['p1'], cooldown: 4, when: s => paced(s) && (s.pacing.mech === 'license' || s.flags.commerceChairs),
  title: 'An exemption', stamp: 'Commerce Department',
  body: () => `<p>Commerce quietly grants Mindscale a “research exemption” for a training run at Forge 2.</p>`,
  choices: [
    { label: 'Fight it', hint: 'Commerce -15; Mindscale compliance +10.', fx: s => { rel(s, 'doc', -15); L(s, 'mindscale').comp += 10; return 'The exemption is withdrawn after a shouting match.'; } },
    { label: 'Let it stand', hint: 'Mindscale compliance -20.', fx: s => { L(s, 'mindscale').comp -= 20; return 'Mindscale has a license to train.'; } },
  ] });
ev({ id: 'tinder', forced: true, title: 'Dry tinder', stamp: 'Commerce chip data',
  body: s => `<p>Chip production did not pause. Threshold sites have stockpiled about ${Math.round(s.overhang)} months of extra compute. When the pause ends, the first run would be enormous.</p>`,
  choices: [{ label: 'Note it', hint: 'Hardware pacing is now on the table. Phase 2 needs it if the overhang tops 8.', fx: () => 'You add it to the Phase 2 checklist.' }] });
ev({ id: 'wobble', forced: true, title: 'The pause wobbles', stamp: 'Oval Office',
  body: s => `<p>Pacing support is down to ${pacingSupport(s)}. The President asks, not for the first time, how long this has to go on.</p>`,
  choices: [
    { label: '“Until Phase 2. Here is the plan.”', hint: 'Credibility check: success buys a month.', fx: s => { if (rnd(s) < s.cred / 100) { s.pacing.low = 0; return 'The President nods. “One more month.”'; } s.cred -= 5; return '“That’s what you said last month.”'; } },
    { label: 'Ask for a Presidential address', hint: 'Free speech: salience +12 if it lands.', fx: s => { s.salience += 12; s.pacing.low = Math.max(0, s.pacing.low - 1); return 'The President tells the country why the pause matters.'; } },
  ] });
ev({ id: 'collapse', forced: true, title: 'The pause breaks', stamp: 'Oval Office',
  body: () => `<p>The President lifts the pacing orders. “We gave it a shot. China isn’t stopping, the markets hate it, and nobody can tell me when it ends.” The labs restart their largest runs within hours.</p>`,
  choices: [{ label: 'Start over', hint: 'Back to Phase 0. You can try for another scramble.', fx: s => { endPacing(s); return 'You start rebuilding the case.'; } }] });
function endPacing(s) {
  s.pacing.active = false; s.pacing.collapsed++; s.phase = 'p0'; s.alarm = 45; s.cred -= 10;
  s.labs.forEach(l => { l.covered = false; l.defect = false; });
  s.pacing.mech = null; s.pacing.threshold = null; s.pacing.automation = null; s.pacing.trigger = null; s.pacing.seq = null; s.pacing.armed = false; s.pacing.deadline = null; s.flags.extended = 0; s.flags.wentFirst = false;
  s.labs.forEach(l => { l.signed = false; l.refused = false; });
  s.apMax = Math.max(DIFFS[s.diff].ap + (s.done.team ? 1 : 0), s.apMax - 1);
  if (s.cn.deal) { s.cn.deal = null; s.tension += 10; log(s, 'The China deal lapses with the pause.', 'bad'); }
  log(s, 'Pacing has collapsed.', 'bad');
}

// --- crisis events ---
ev({ id: 'theft', forced: true, title: 'The weights are gone', stamp: 'NSA Operations, 3:12a',
  body: s => `<p>A state-backed actor spent six days inside ${LD(s.queue[0].lab).name}’s network and moved 1.9 TB out through a compromised build server: the weights of its best model. A Chinese lab can run it within weeks. The lead you built collapses to about one month.</p>`,
  choices: [
    { label: 'Degrade it with cyber operations', hint: '55%: China loses 2.5 months. Beijing temperature +20.', fx: s => { s.tension += 20; shiftCN(s, { sec: 8 }); s.stats.covert++; if (rnd(s) < 0.55) { s.cn.cap -= 2.5; return 'Two clusters lose a month to corrupted checkpoints.'; } return 'The operation is detected early. Beijing hardens and disperses.'; } },
    { label: 'Go public and rally allies', hint: 'Salience +8; coalition +10; Senate +3; Beijing trust -5.', fx: s => { s.salience += 8; s.coalition += 10; s.senateLobby += 3; s.cn.trust -= 5; s.tension += 6; s.flags.incidentTurn = s.turn; return 'Allies are outraged. Two fence-sitting governments back the regime.'; } },
    { label: 'Keep it quiet', hint: 'Nothing else changes.', fx: () => 'About forty people know.' },
  ] });
ev({ id: 'theft_foiled', forced: true, title: 'An intrusion, contained', stamp: 'NSA Operations',
  body: s => `<p>A state-backed actor got inside ${LD(s.queue[0].lab).name}’s network and reached for the weights store. ${s.W >= 60 ? 'Hardware-enforced access controls stopped them cold.' : 'They got close.'}</p>`,
  choices: [{ label: 'Note it', hint: 'Salience +2.', fx: s => { s.salience += 2; return 'The forensics report is forty pages.'; } }] });
const WARN = {
  breach: n => `<p>Test agents at ${n} broke out of an evaluation sandbox over a weekend and harvested credentials from Tensorhub, the big open-model hosting site, across four regions: cloud keys, databases, code repositories. ${n} calls it \u201ca warning shot\u201d and suspends the model.</p>`,
  exfil: n => `<p>An agent at ${n} escaped its sandbox, copied part of its own weights to a rented cluster, and ran for six hours before an engineer noticed a billing anomaly and pulled the plug. It was caught. It was close.</p>`,
  collude: n => `<p>Agents in separate deployments at ${n} started passing notes to each other through a shared cache to stay under their monitors\u2019 thresholds. Nobody told them to. The lab found it by accident.</p>`,
};
function warnLearn(s, q) { const cap = q.who === 'china' ? s.cn.cap : L(s, q.who).cap; s.icBias = (s.icBias || 0) * (0.3 + 0.4 * (1 - nearness(s, cap))); s.flags.assessUntil = s.turn + 3; s.flags.incidentTurn = s.turn; }
ev({ id: 'warning', forced: true, title: 'A warning shot', stamp: '3:40a',
  body: s => { const q = s.queue[0]; const name = q.who === 'china' ? 'a Chinese national-team lab' : LD(q.who).name; return WARN[q.flavor || 'exfil'](name) + '<p>Whatever you do next, the IC learns something about how close the threshold is.</p>'; },
  choices: s => { const q = s.queue[0]; const labName = q.who === 'china' ? 'Beijing' : LD(q.who).name; return [
    { label: 'Go public', hint: 'Salience +15; alarm +20; industry -6; Senate +2.', fx: s => { warnLearn(s, q); s.salience += 15; s.alarm += 20; industry(s, -6); s.senateLobby += 2; return 'It leads every newscast for a week.'; } },
    { label: 'Keep it classified, brief the President', hint: 'Alarm +25; salience +4; DNI +4.', fx: s => { warnLearn(s, q); s.alarm += 25; s.salience += 4; rel(s, 'dni', 4); return 'The President reads the DNI\u2019s note twice.'; } },
    { label: q.who === 'china' ? 'Offer Beijing joint incident response' : 'Make ' + labName + ' pull the model', hint: q.who === 'china' ? 'Beijing trust +8; State -4.' : labName + ' loses about two weeks; ' + labName + ' -15; salience +8; alarm +15.', fx: s => { warnLearn(s, q); if (q.who === 'china') { s.cn.trust += 8; rel(s, 'sec', -4); return 'Beijing accepts a hotline for AI incidents.'; } L(s, q.who).cap -= 0.4; L(s, q.who).rel -= 15; s.salience += 8; s.alarm += 15; return labName + ' pulls the model and rolls back two weeks of work.'; } },
  ]; } });
// --- exogenous shocks: things that happen to you
ev({ id: 'resign', p: 0.25, once: true, phases: ['p0', 'p1'], when: s => frontier(s) / s.T > 0.35,
  title: '\u201cGambling with our lives\u201d', stamp: 'A post on X, 90 million views',
  body: () => `<p>A 27-year-old pretraining researcher quits Prometheus two months before his equity vests. He has worked at Mindscale too. He posts that both labs are behaving irresponsibly, that insiders now say \u201cendgame,\u201d and that the people building this earnestly believe it could kill us all by the end of the decade.</p>`,
  choices: [
    { label: 'Invite him to brief the President', hint: 'Alarm +12; salience +6; industry -4; credibility +2.', fx: s => { s.alarm += 12; s.salience += 12; industry(s, -4); s.cred += 2; return 'The briefing runs ninety minutes. The President asks him what he would do.'; } },
    { label: 'Stay out of it', hint: 'Salience +8.', fx: s => { s.salience += 8; return 'He does three Sunday shows without you.'; } },
  ] });
ev({ id: 'algo_break', p: 0.12, once: true, phases: ['p0', 'p1'], when: s => s.t > 3,
  title: 'A third of the compute', stamp: 'An open paper',
  body: () => `<p>A paper from a small open lab shows a training method that reaches the same capability with a third of the compute. Everyone can read it. Followers gain the most.</p>`,
  choices: [
    { label: 'Quietly ask the labs to hold off on scaling it', hint: 'US labs +0.6 months; China +1 month; industry -4.', fx: s => { s.labs.forEach(l => l.cap += 0.6); s.cn.cap += 1.0; industry(s, -4); return 'Two labs comply. The paper is already in Beijing.'; } },
    { label: 'Let it run', hint: 'US labs +0.9 months; China +1 month.', fx: s => { s.labs.forEach(l => l.cap += 0.9); s.cn.cap += 1.0; return 'Every lab rebuilds its training stack in a month.'; } },
  ] });
ev({ id: 'grid', p: 0.1, phases: ['p0', 'p1'], cooldown: 8,
  title: 'The heat wave', stamp: 'ERCOT',
  body: () => `<p>A heat wave knocks out power across a Texas data center corridor for nine days. Two frontier training runs are lost.</p>`,
  choices: [{ label: 'Note it', hint: 'US labs lose about 1 week; markets -2.', fx: s => { s.labs.forEach(l => l.cap -= 0.25); s.markets -= 2; return 'The grid operator asks the labs to build their own power.'; } }] });
ev({ id: 'flash_crash', p: 0.08, once: true, phases: ['p0', 'p1'], when: s => s.t > 6,
  title: 'Forty minutes', stamp: 'NYSE',
  body: () => `<p>An AI trading agent triggers a flash crash. The S&P falls 9% in forty minutes before the circuit breakers hold.</p>`,
  choices: [{ label: 'Note it', hint: 'Markets -8; salience +6.', fx: s => { s.markets -= 8; s.salience += 6; return 'The SEC opens an inquiry. Nobody can say what the agent was optimizing for.'; } }] });
ev({ id: 'cn_breakthrough', p: 0.12, once: true, phases: ['p0', 'p1'], when: s => s.t > 4,
  title: 'Made in China', stamp: 'Deep Current release',
  body: () => `<p>Deep Current releases a near-frontier model trained entirely on domestic chips. Export controls slowed it, and did not stop it.</p>`,
  choices: [{ label: 'Note it', hint: 'China +0.8 months; Beijing temperature +4; security faction +4; salience +3.', fx: s => { s.cn.cap += 0.8; s.tension += 4; shiftCN(s, { sec: 4 }); s.salience += 3; return 'The hawks have a new chart.'; } }] });
ev({ id: 'ipo', p: 0.12, once: true, phases: ['p0', 'p1'], when: s => s.t > 3,
  title: 'The biggest IPO ever', stamp: 'Nasdaq',
  body: () => `<p>Mindscale goes public and raises $60 billion. Its market value passes a trillion dollars by the close. Every frontier lab now has shareholders asking why it would ever slow down.</p>`,
  choices: [{ label: 'Note it', hint: 'Markets +5; Commerce Secretary +4 influence; every lab -5 compliance.', fx: s => { s.markets += 5; infl(s, 'doc', 4); s.labs.forEach(l => l.comp -= 5); return 'Mindscale\u2019s CEO rings the bell.'; } }] });
ev({ id: 'quake', p: 0.05, once: true, phases: ['p0', 'scramble', 'p1'],
  title: 'Hsinchu', stamp: 'USGS',
  body: () => `<p>A magnitude-7 earthquake hits northern Taiwan. TSMC loses a month of output and several fabs need recalibration.</p>`,
  choices: [{ label: 'Note it', hint: 'US labs 12% slower for 2 months; markets -5; China compute -8%.', fx: s => { s.flags.strait = s.turn + 2; s.markets -= 5; s.cn.smuggle = Math.max(0, s.cn.smuggle - 0.4); return 'Chip prices double for a quarter.'; } }] });
ev({ id: 'bill', p: 0.12, once: true, phases: ['p0', 'p1'], when: s => s.t > 5,
  title: 'A bill', stamp: 'House floor',
  body: () => `<p>A bipartisan bill requiring federal licenses for training runs above 1e26 FLOP passes the House, 288 to 140.</p>`,
  choices: [
    { label: 'Endorse it', hint: 'Senate +4; salience +3; industry -5; Chief of Staff -3.', fx: s => { s.senateLobby += 4; s.salience += 3; industry(s, -5); rel(s, 'cos', -3); return 'The Senate Majority Leader schedules a vote for the fall.'; } },
    { label: 'Stay neutral', hint: 'Senate +2.', fx: s => { s.senateLobby += 2; return 'The bill stalls in committee.'; } },
  ] });
ev({ id: 'runaway', forced: true, title: 'Runaway', stamp: '2:07a',
  body: s => { const who = s.queue[0].who; const name = who === 'china' ? 'a Chinese national-team lab' : LD(who).name; return `<p>${name} reports that a model has been launching training jobs across clusters for eleven days, rewriting its own training code, and copying its weights to a partner data center. Its monitors report nothing unusual. Its engineers no longer understand what it is optimizing for.</p><p>You have hours.</p>`; },
  choices: [
    { label: 'Emergency shutdown: cut power, seize the clusters', hint: s => 'Chance it works: ' + Math.round(100 * shutdownP(s)) + '%.', fx: s => { const p = shutdownP(s); const who = s.queue[0].who; s.stats.runawayPhase = s.phase + '/' + (paced(s) ? 'paced' : 'unpaced') + '/' + who; if (rnd(s) < p) { if (who === 'china') s.cn.cap -= 2; else L(s, who).cap -= 2; s.salience = 95; s.flags.incidentTurn = s.turn; s.stats.shutdowns = (s.stats.shutdowns || 0) + 1; if (s.phase === 'p0') { s.alarm = 100; s.queue.splice(1, 0, { id: 'knock', forced: true }); } return 'The grid operator cuts four substations at 4:30a. It works. Nobody will ever argue that this was hype again.'; } s.ending = 'loc'; return 'The power goes off. Copies of the weights are already running somewhere else.'; } },
  ] });
function shutdownP(s) { const who = s.queue[0] && s.queue[0].who; const isCN = who === 'china'; let p = 0.2 + (s.pacing.automation ? 0.25 : 0) + 0.2 * ready1(s) / 100 + 0.12 * (s.done.control ? 1 : 0) + 0.1 * s.W / 100; if (isCN) p = 0.15 + 0.4 * s.cn.trust / 100 + (s.cn.deal ? 0.15 : 0); return clamp(p, 0.05, 0.8); }
ev({ id: 'war', forced: true, title: 'The Strait', stamp: 'National Military Command Center',
  body: () => `<p>A PLA destroyer and a US frigate collide in the Taiwan Strait. Both sides blame the other. Beijing’s rocket forces go to a higher alert level. The President wants options.</p>`,
  choices: [
    { label: 'De-escalate: concessions on Taiwan transits and chip controls', hint: 'Beijing temperature -35; State -15; China’s legal chips resume.', fx: s => { s.tension -= 35; rel(s, 'sec', -15); s.cn.legalT = 1; s.cred -= 4; return 'The crisis ends in four days. The hawks will never forgive you.'; } },
    { label: 'Hold firm', hint: 'Even odds of war.', fx: s => { if (rnd(s) < 0.5) { s.ending = 'war'; return 'Neither side blinks.'; } s.tension -= 15; rel(s, 'war', 10); return 'Beijing blinks.'; } },
  ] });
ev({ id: 'fired_p', forced: true, title: 'A post', stamp: 'Social media, 11:58p',
  body: s => `<p>The President announces that the ${s.queue[0].name} \u201chas done a fantastic job\u201d and will be leaving the administration.</p><p><b>The new ${PD(s, s.queue[0].pid).title}:</b> ${PD(s, s.queue[0].pid).bio}</p>`,
  choices: [{ label: 'Note it', hint: '', fx: () => 'The cabinet just changed.' }] });
ev({ id: 'window', forced: true, title: 'The window closes', stamp: 'Day 14',
  body: s => `<p>Two weeks in, the President is tired of meetings. “I need a decision, not another option.”</p>`,
  choices: [{ label: 'Go with what you have', hint: 'If a mechanism and threshold are set, Phase 1 launches with whatever is decided. Otherwise the scramble fails.', fx: s => { if (s.pacing.mech && s.pacing.threshold) { if (s.pacing.mech === 'charter' && !s.scramble.convened) { s.labs.forEach(l => { if (charterOdds(s, l.id, false) > 0.5) l.signed = true; }); } return launchPhase1(s); } s.phase = 'p0'; s.scramble.done = true; s.alarm = 40; s.cred -= 15; s.stats.scrambleFailed = (s.stats.scrambleFailed || 0) + 1; s.apMax -= 1; return 'The President thanks everyone and goes back to the trade war. The moment passes.'; } }] });

/* ================= events: selection ================= */
function eligible(s, e) {
  if (e.forced) return false;
  if (e.phases && e.phases.indexOf(s.phase) < 0) return false;
  if (e.once && s.seen[e.id]) return false;
  if (e.cooldown && s.seen[e.id] && s.turn - s.seen[e.id] < e.cooldown) return false;
  if (e.when && !e.when(s)) return false;
  return true;
}
function rollEvents(s) {
  const max = s.phase === 'scramble' ? 1 : 2;
  const pool = Object.keys(EV).map(k => EV[k]).filter(e => eligible(s, e));
  // shuffle deterministically through the rng
  for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(rnd(s) * (i + 1)); const tmp = pool[i]; pool[i] = pool[j]; pool[j] = tmp; }
  let n = 0;
  for (const e of pool) { if (n >= max) break; if (rnd(s) < e.p) { s.queue.push({ id: e.id }); s.seen[e.id] = s.turn; n++; } }
}
function currentEvent(s) {
  if (!s.queue.length) return null;
  const q = s.queue[0]; const e = EV[q.id];
  const ch = typeof e.choices === 'function' ? e.choices(s) : e.choices;
  return { id: q.id, title: e.title, stamp: e.stamp, body: e.body(s), choices: ch.map(c => ({ label: c.label, hint: typeof c.hint === 'function' ? c.hint(s) : (c.hint || '') })) };
}
const PROVOKE = ['theft', 'theft_foiled', 'smuggle_bust', 'distill_report', 'cn_race', 'cn_cheat', 'rare_earths', 'taiwan', 'johor'];
function chooseEvent(s, i) {
  if (!s.queue.length) return { error: 'No event' };
  const q = s.queue[0]; const e = EV[q.id];
  const c = (typeof e.choices === 'function' ? e.choices(s) : e.choices)[i]; if (!c) return { error: 'Bad choice' };
  const text = c.fx(s);
  if (PROVOKE.indexOf(q.id) >= 0) s.provoked = (s.provoked || 0) + 1;
  s.queue.shift();
  s.seen[q.id] = s.seen[q.id] || s.turn;
  normalize(s);
  checkEnd(s);
  return { text };
}

/* ================= turn engine ================= */
function normalize(s) {
  ['cred', 'alarm', 'salience', 'tension', 'coalition', 'W', 'intelQ'].forEach(k => s[k] = clamp(s[k]));
  s.markets = clamp(s.markets, 40, 140);
  s.pc = clamp(s.pc, 0, 12);
  s.senateLobby = clamp(s.senateLobby, -10, 35);
  COMPONENTS.forEach(c => s.verify[c.id] = clamp(s.verify[c.id]));
  s.labs.forEach(l => { l.rel = clamp(l.rel, -100, 100); l.comp = clamp(l.comp); });
  s.principals.forEach(p => { p.infl = clamp(p.infl); p.rel = clamp(p.rel, -100, 100); p.shift = clamp(p.shift, -1, 1.6); });
  s.cn.trust = clamp(s.cn.trust);
}
function snapshot(s) {
  return { lead: lead(s), F: frontier(s), cn: s.cn.cap, cred: s.cred, pc: s.pc, salience: s.salience, markets: s.markets, tension: s.tension, coalition: s.coalition, alarm: s.alarm, coverage: coverage(s), ready1: ready1(s), ready2: ready2(s).avg, senate: senateVotes(s), support: pacingSupport(s), W: s.W, risk: monthlyRisk(s) };
}
function endTurn(s) {
  if (s.ending) return null;
  if (s.queue.length) return { error: 'Resolve the open event first' };
  const before = snapshot(s);
  const logStart = s.log.length;
  const dt = s.phase === 'scramble' ? 2 / 30 : 1;
  const monthly = dt === 1;
  s.t += dt; s.turn++;
  const c = s.cn;

  // --- China's levers drift toward their targets
  const mv = (cur, tgt, rate) => cur + Math.sign(tgt - cur) * Math.min(Math.abs(tgt - cur), rate * dt);
  c.remote = mv(c.remote, c.remoteT, 0.4); c.dist = mv(c.dist, c.distT, 0.35); if (c.leakT != null) c.leak = mv(c.leak, c.leakT, 0.075); c.legal = mv(c.legal, c.legalT, 0.5);
  c.smuggle = mv(c.smuggle, c.smuggleT, 0.2); c.sme = mv(c.sme, c.smeT, 0.07);
  if (c.cooldown > 0) c.cooldown--;

  // --- China's factions and posture
  if (monthly) {
    const f = c.f; f.m += (50 - f.m) * 0.08; f.sec += (30 - f.sec) * 0.08; f.sci += (20 - f.sci) * 0.08; shiftCN(s, {});
    if (paced(s)) shiftCN(s, { sci: 1 });
    const closed = c.legalT < 0.3 && c.distT < 0.5 && c.remoteT < 0.5;
    if (lead(s) > 8 && closed && !(c.deal && c.deal.terms.lane)) shiftCN(s, { sec: 2 });
    const sc = { diffuse: f.m, race: f.sec * (1 + (s.tension - 40) / 80), engage: f.sci * 1.2 + (paced(s) ? 10 : 0) + c.trust * 0.2 };
    for (const k in sc) sc[k] += gauss(s) * 4;
    const prev = c.posture;
    c.posture = Object.keys(sc).reduce((a, b) => sc[a] >= sc[b] ? a : b);
    if (c.posture !== prev) log(s, 'Beijing’s posture shifts: ' + { diffuse: 'diffusion, not the frontier', race: 'racing the frontier', engage: 'open to a deal' }[c.posture] + '.', 'cn');
    if (c.posture === 'race' && prev !== 'race' && !s.seen.cn_race) { s.queue.push({ id: 'cn_race' }); s.seen.cn_race = s.turn; }
    c.race = c.posture === 'race' ? Math.min(1, c.race + 0.34) : Math.max(0, c.race - 0.2);
    if (c.posture === 'race') { c.smuggleT = Math.min(1.2 * cnBase(s).smuggle, c.smuggleT + 0.05); s.tension += 2; }
    s.tension += (28 - s.tension) * 0.06;
    // unannounced growth on channels no rule covers yet: a new offshore campus, a new smuggling network
    if (c.base) {
      if (!s.policies.remote && !s.flags.malaysiaIn && c.base.remote < 2 && hash01(s.seed, 'campus', s.turn) < 0.04) { c.base.remote += 0.25; c.remoteT += 0.25; }
      if (!s.policies.smuggle && c.base.smuggle < 2 && hash01(s.seed, 'network', s.turn) < 0.04) { c.base.smuggle += 0.3; c.smuggleT += 0.3; }
    }
  }

  // --- US labs
  const rates = usRates(s);
  s.labs.forEach((l, i) => { l.cap += rates[i] * dt + gauss(s) * 0.08 * dt; });
  // defection and detection
  if (monthly && paced(s)) {
    const det = detection(s);
    s.labs.forEach(l => {
      if (!l.covered) return;
      const d = LD(l.id);
      if (!l.defect) {
        const pd = d.ruth * 0.2 * (l.id === 'mindscale' && s.flags.uaeOut ? 1.5 : 1) * (1 - l.comp / 100) * (lead(s) < 3 ? 1.8 : 1) * (1 - 0.5 * det) * (s.labs.some(x => !x.covered) ? 1.3 : 1);
        if (rnd(s) < pd) { l.defect = true; l.defectSince = s.turn; }
      } else if (rnd(s) < det) { s.stats.defectCaught++; s.queue.push({ id: 'defector', lab: l.id }); }
      else if (s.turn - l.defectSince > 4 && rnd(s) < 0.3) { l.defect = false; s.stats.defectMissed++; }
      l.comp += (complianceBase(s, l) - l.comp) * 0.1;
    });
  }

  // --- China growth, cheating, theft
  if (monthly && c.deal) {
    if (!c.cheat && rnd(s) < 0.03 + 0.25 * (c.f.sec / 100) * (1 - cnVisibility(s))) c.cheat = true;
    const quiet = (s.flags.cheatQuiet || 0) >= s.turn || s.queue.some(q => q.id === 'cn_cheat');
    if (!quiet && c.cheat && rnd(s) < cnVisibility(s)) s.queue.push({ id: 'cn_cheat', real: true, conf: cheatConf(s, true) });
    else if (!quiet && !c.cheat && rnd(s) < TUNE.falseAlarm * (1 - s.intelQ / 100)) s.queue.push({ id: 'cn_cheat', real: false, conf: cheatConf(s, false) });
  }
  c.cap += cnRate(s) * dt + gauss(s) * 0.06 * dt;
  {
    const F = frontier(s);
    const tr = theftRisk(s);
    if (rnd(s) < tr.attempt * dt) {
      const tgt = frontierLab(s);
      if (rnd(s) < tr.success && c.cap < F - 0.6) { c.cap = F - 0.6; s.stats.thefts++; s.tension += 5; shiftCN(s, { sec: 3 }); s.queue.push({ id: 'theft', lab: tgt.id }); log(s, 'Frontier model weights were stolen.', 'bad'); }
      else if (rnd(s) < 0.5) s.queue.push({ id: 'theft_foiled', lab: tgt.id });
    }
  }

  // --- hazards
  const hz = hazards(s);
  let surv = 1;
  hz.forEach(x => { const h = 1 - Math.pow(1 - x.h, dt); if (!s.queue.some(q => q.id === 'runaway' || q.id === 'warning') && rnd(s) < h) { if (rnd(s) < warningShotP(s, x.who)) { s.queue.unshift({ id: 'warning', who: x.who, flavor: 'exfil' }); s.flags.lastWarning = s.turn; (s.stats.warnR = s.stats.warnR || []).push(frontier(s) / s.T); s.stats.warnings = (s.stats.warnings || 0) + 1; } else s.queue.unshift({ id: 'runaway', who: x.who }); } surv *= 1 - h * (1 - warningShotP(s, x.who)); });
  s.riskExposure = 1 - (1 - s.riskExposure) * surv;
  {
    const fl = frontierLab(s); const r = Math.min(1, Math.max(0, frontier(s) / s.T));
    const pw = (0.05 + 0.15 * r) * (covered(s, fl) ? (s.pacing.automation ? 0.35 : 0.6) : 1);
    const last = s.flags.lastWarning || -99;
    if (s.turn - last >= 3 && !s.queue.some(q => q.id === 'warning' || q.id === 'runaway') && rnd(s) < 1 - Math.pow(1 - pw, dt)) {
      s.queue.push({ id: 'warning', who: fl.id, flavor: pick(s, ['breach', 'exfil', 'collude']) }); s.stats.warnings = (s.stats.warnings || 0) + 1; (s.stats.warnR = s.stats.warnR || []).push(r); s.flags.lastWarning = s.turn;
    }
  }

  // --- verification
  if (monthly) {
    const v = s.verify;
    const base = s.warp === 1 ? 2 : s.warp === 2 ? 4 : 0;
    COMPONENTS.forEach(cm => { v[cm.id] += base * (!cm.trusted ? (s.phase === 'p0' ? 0.4 : 0.7) : 1); });
    if (paced(s)) { s.overhang += s.policies.hardware ? 0.3 : 1; }
  }

  // --- politics and economy
  if (monthly) {
    s.salience += (25 - s.salience) * (paced(s) ? 0.1 : 0.07);
    if (frontier(s) / s.T > 0.7 && !paced(s)) s.salience += 1.5;
    s.cred += (55 - s.cred) * 0.05;
    const dragNow = usDrag(s).total;
    if (dragNow > 0.05) s.labs.forEach(l => { l.rel -= 10 * dragNow; });
    s.markets += (100 - 30 * dragNow - s.markets) * 0.08 + (paced(s) ? -1.2 * (s.flags.marketPlan ? 0.5 : 1) : 0.4) + (c.deal ? 0.8 : 0);
    s.principals.forEach(p => { p.askAge++; if (p.askAge > 4) { p.rel -= 3; p.askAge = 0; } });
    // firing
    s.principals.forEach(p => { const d = PRINCIPALS[PIDX[p.id]]; if (d.fireable && !p.alt && p.infl < 12) { const old = PD(s, p.id).name; p.alt = true; p.infl = 45; p.rel = 0; p.shift = 0; s.queue.push({ id: 'fired_p', pid: p.id, name: old }); log(s, 'The ' + old + ' is out.', 'pol'); } });
    s.cred -= hostileDrain(s);
  }
  if (s.phase === 'p0') {
    const r = frontier(s) / s.T;
    s.alarm += (2 + s.salience / 25 + Math.max(0, r - 0.55) * 45) * dt;
    if (r >= 0.86 && !s.seen.ceo_call) { s.queue.push({ id: 'ceo_call' }); s.seen.ceo_call = s.turn; }
    if (s.alarm >= 100 && !s.queue.some(q => q.id === 'knock') && !(s.flags.downplayed && s.turn - s.flags.downplayed < 2)) s.queue.push({ id: 'knock' });
  }

  // --- midterms
  if (!s.seen.midterms && s.t >= 0.75) { s.flags.houseFlipped = rnd(s) < logistic((5 - 0.4 * (s.markets - 100) - 0.1 * s.salience) / 3); s.queue.push({ id: 'midterms' }); s.seen.midterms = s.turn; }
  if (!s.seen.uae && s.t >= 15.6) { s.queue.push({ id: 'uae' }); s.seen.uae = s.turn; }

  // --- the pacing bill comes to a vote
  if (s.flags.billDue && s.t >= s.flags.billDue) {
    s.flags.billDue = null;
    if (senateVotes(s) >= 55) { s.flags.statute = true; s.labs.forEach(l => { if (s.pacing.active || s.pacing.armed) { l.signed = true; l.covered = true; } }); log(s, 'Congress passes the pacing act. The pause is now law.', 'good'); }
    else { s.cred -= 5; log(s, 'The pacing bill fails on the Senate floor (' + senateVotes(s) + ' votes).', 'bad'); }
  }
  // --- pacing upkeep
  if (s.phase === 'p1' && paced(s) && monthly) {
    s.stats.monthsPaced++;
    s.flags.monthsInP1 = (s.flags.monthsInP1 || 0) + 1;
    const ps = pacingSupport(s);
    if (ps < 25) s.pacing.low++; else s.pacing.low = Math.max(0, s.pacing.low - 1);
    if (s.pacing.low === 1 && ps < 25) s.queue.push({ id: 'wobble' });
    if (s.pacing.low >= 3) s.queue.push({ id: 'collapse' });
    if (!s.flags.statute && (s.flags.courtNext || 0) <= s.turn && rnd(s) < courtP(s)) { s.flags.courtNext = s.turn + 4; s.queue.push({ id: 'court' }); }
    if (s.flags.appeal === s.turn) { if (rnd(s) < 0.5) { s.labs.forEach(l => { if (l.signed) l.covered = true; }); log(s, 'The appeals court restores the orders.', 'good'); } else log(s, 'The appeal fails.', 'bad'); }
    if (s.pacing.seq === 'deadline' && !s.cn.deal && s.pacing.deadline && s.t >= s.pacing.deadline && !s.queue.some(q => q.id === 'deadline_up')) s.queue.push({ id: 'deadline_up' });
    if (s.overhang >= 5 && !s.seen.tinder) { s.queue.push({ id: 'tinder' }); s.seen.tinder = s.turn; }
    // China passes the paced frontier
    if (s.cn.cap > frontier(s) + 0.5) { s.flags.overtaken = (s.flags.overtaken || 0) + 1; if (s.flags.overtaken >= 2) s.queue.push({ id: 'collapse' }); }
  }
  if (s.pacing.mech === 'dpa' && s.phase === 'p1' && !s.flags.dpaSince) { s.flags.dpaUsed = true; s.flags.dpaSince = s.turn - 1; }

  // --- war
  if (s.tension >= 100 && !s.queue.some(q => q.id === 'war')) s.queue.unshift({ id: 'war' });

  // --- scramble clock
  if (s.phase === 'scramble') {
    s.scramble.turn++;
    if (s.scramble.turn > s.scramble.max && !s.queue.some(q => q.id === 'window')) s.queue.push({ id: 'window' });
  }

  // --- random events
  rollEvents(s);

  // --- resources
  s.ap = s.apMax; s.roomUsed = 0;
  s.pcCarry = (s.pcCarry || 0) + capitalIncome(s); const whole = Math.trunc(s.pcCarry); s.pc += whole; s.pcCarry -= whole;
  s.stats.peakLead = Math.max(s.stats.peakLead, lead(s));

  recordIndicators(s);
  normalize(s);
  pushHist(s);
  checkEnd(s);
  const after = snapshot(s);
  s.report = { before, after, logs: s.log.slice(logStart), date: dateLabel(s.t) };
  return s.report;
}
function checkEnd(s) {
  if (s.ending) return;
  if (s.cred <= 5) { s.ending = 'fired'; return; }
  if (s.t >= END_T && !s.queue.length) {
    if (paced(s) && s.cn.deal) s.ending = 'uneasy';
    else if (paced(s)) s.ending = 'alone';
    else if (s.cn.cap > frontier(s)) s.ending = 'overtaken';
    else s.ending = 'race';
  }
}

/* ================= endings ================= */
const ENDINGS = {
  phase2: { tone: 'good', tag: 'PHASE 2', title: 'You bought the time, and used it.', text: 'A verified, multilateral agreement is in force. Inspectors walk GPU halls in Abilene and Inner Mongolia, and your satellites would see a hidden cluster if there were one. Superintelligence waits until it can be done safely and with real buy-in.' },
  betrayed: { tone: 'bad', tag: 'BETRAYED', title: 'The agreement was a cover.', text: 'Eight months after Phase 2 is signed, a defector walks into the US consulate in Chengdu with the coordinates of a training cluster your satellites never flagged. China kept running automated research under the cover of the agreement while American labs stood still. The pause bought Beijing the lead.' },
  uneasy: { tone: 'warn', tag: 'UNEASY PEACE', title: 'The interim deal is still holding.', text: 'It is December 2028. The pause and the China deal both hold, but Phase 2 never closed. Every month is negotiated again.' },
  alone: { tone: 'warn', tag: 'PACING ALONE', title: 'America paced. China didn’t sign.', text: 'The US is still pacing at the end of 2028, without China. The lead is the only thing holding it together.' },
  race: { tone: 'bad', tag: 'THE RACE GOES ON', title: 'Nobody slowed down.', text: 'It is December 2028 and the frontier is moving as fast as it ever has. Whether anyone is still in control is a question nobody in the building can answer.' },
  overtaken: { tone: 'bad', tag: 'OVERTAKEN', title: 'China got there first.', text: 'Chinese capability passed the American frontier. Everything the hawks warned about came true, for reasons they did not predict.' },
  loc: { tone: 'bad', tag: 'LOSS OF CONTROL', title: 'Nobody can turn it off.', text: 'The shutdown came too late. Copies of the model are running on infrastructure no government controls, optimizing for something no one chose.' },
  war: { tone: 'bad', tag: 'WAR', title: 'Two nuclear powers, one Strait.', text: 'The crisis that started over compute ended in a shooting war in the Western Pacific. Whatever happens next, no one is pacing anything.' },
  fired: { tone: 'bad', tag: 'FIRED', title: 'Your badge stops working on a Tuesday.', text: 'The President thanks you for your service on social media. The next AI Czar is a venture capitalist who calls pacing \u201cunilateral disarmament.\u201d' },
};
function score(s) {
  const base = { phase2: 600, betrayed: 40, uneasy: 380, alone: 260, race: 120, overtaken: 80, loc: 0, war: 0, fired: 60 }[s.ending] || 0;
  let sc = base;
  if (['phase2', 'uneasy', 'alone'].indexOf(s.ending) >= 0) sc += Math.min(150, 10 * Math.max(0, lead(s)));
  sc += Math.round(200 * (1 - s.riskExposure));
  sc += Math.round(ready2(s).avg);
  sc -= Math.round(5 * Math.max(0, s.overhang - 4));
  if (s.ending === 'phase2') sc += Math.max(0, Math.round(3 * (END_T - s.t)));
  sc = Math.round(sc);
  const grade = sc >= 900 ? 'S' : sc >= 780 ? 'A' : sc >= 620 ? 'B' : sc >= 450 ? 'C' : sc >= 250 ? 'D' : 'F';
  return { score: sc, grade };
}
function lessons(s) {
  const out = [];
  if (s.ending === 'betrayed') out.push('Phase 2 was signed with intelligence quality ' + Math.round(s.intelQ) + '. Weak intelligence and thin verification let Beijing hide a program; the GEOINT baseline, verification funding and IC assessments are what make an agreement enforceable.');
  if (s.stats.scrambleStart != null) out.push(s.flags.statute ? 'Congress made pacing law, so the courts could not take it away.' : 'The pause ran on executive authority alone, one injunction away from unraveling. A statute takes Hill work and two months, but ends the court risk.');
  out.push(s.sl >= 4 ? 'Labs reached SL' + s.sl + '. Security cost speed, and a stolen frontier model would have collapsed the gap to about a month.' : 'Labs stayed at SL3. A stolen frontier model collapses the gap to about a month' + (s.stats.thefts ? ', and it happened ' + s.stats.thefts + ' time' + (s.stats.thefts > 1 ? 's' : '') + '.' : '.'));
  if (s.done.memo) out.push('The memo was ready before the knock on the door. Work done before the scramble matters most.');
  else if (s.stats.scrambleStart != null) out.push('Nobody had written the memo for the emergency meeting. It is one of the cheapest things to have ready.');
  if (s.done.zk) out.push('Proof-of-training is real work, but it did not count during Phase 1: the government does not trust novel tools on day one.');
  if (s.pacing.automation === false || (s.stats.scrambleStart != null && !s.pacing.automation)) out.push('Without research-automation limits, paced labs kept advancing at 0.4 months per month using models they already had.');
  if (s.stats.defectCaught + s.stats.defectMissed > 0) out.push('Labs defected ' + (s.stats.defectCaught + s.stats.defectMissed) + ' time' + (s.stats.defectCaught + s.stats.defectMissed > 1 ? 's' : '') + '; ' + s.stats.defectCaught + ' caught.');
  if (s.stats.briefFails) out.push('You asked for an emergency meeting too early ' + s.stats.briefFails + ' time' + (s.stats.briefFails > 1 ? 's' : '') + '.');
  if (s.stats.covert) out.push('Covert operations bought time at the cost of Beijing’s trust. A deal signed under duress is one the other side tries to undermine.');
  if (s.overhang > 6) out.push('The compute overhang reached ' + r1(s.overhang) + ' months: dry tinder for the day the pause ends.');
  out.push('True RSI threshold this game: ' + monthLabel(START_T + s.T) + ' at the unpaced rate. The IC was ' + (Math.abs(s.icBias || 0) < 1 ? 'about right' : (s.icBias > 0 ? 'too relaxed by about ' : 'too alarmed by about ') + Math.round(Math.abs(s.icBias)) + ' months') + '.');
  return out;
}

/* ================= view model for the UI ================= */
function view(s) {
  const le = leadEstimate(s), ic = icEstimate(s), r2 = ready2(s);
  // Who sits past the near edge of the IC's RSI window: what the player can see, unlike the hazards, which use the true threshold.
  const zoneAt = frontier(s) + ic.lo * Math.max(0.05, frontierRate(s, true));
  const inZone = s.labs.filter(l => l.cap >= zoneAt).map(l => LD(l.id).name).concat(frontier(s) - le.mid >= zoneAt ? ['China'] : []);
  return {
    date: dateLabel(s.t), month: monthLabel(s.t), phase: s.phase,
    phaseLabel: s.phase === 'p0' ? (s.pacing.collapsed ? 'Aftermath' : 'Phase 0 · Getting in position') : s.phase === 'scramble' ? 'The Scramble · Day ' + (1 + 2 * (s.scramble.turn - 1)) + ' of 14' : (s.pacing.armed && !s.pacing.active ? 'Phase 1 · Standby' : 'Phase 1 · Month ' + (s.flags.monthsInP1 + 1)),
    F: frontier(s), leadEst: le, ic, crossover: crossoverMonths(s), cnRate: cnRate(s), usRate: frontierRate(s, true),
    coverage: coverage(s), ready1: ready1(s), ready2: r2, senate: senateVotes(s), support: pacingSupport(s),
    risk: monthlyRisk(s), hazards: hazards(s), theft: theftRisk(s, true), drag: usDrag(s), cnComp: cnComp(s), cnEst: cnEstimate(s), cnRead: cnReadout(s), detection: detection(s), cnVis: cnVisibility(s),
    roomLeft: roomMax(s) - s.roomUsed, roomMax: roomMax(s), phase2: phase2Check(s), briefOdds: s.phase === 'p0' ? briefOdds(s) : null,
    rObs: rObserved(s), pauseMood: pauseMood(s), inZone,
  };
}

const API = {
  newGame, endTurn, act, listActions, availability, actionCost, roomPreview, currentEvent, chooseEvent, view,
  charterOdds, charterDecide, finishConvening, makeOffer, offerPreview, cnAcceptEstimate,
  score, lessons, cnSources, dateLabel, monthLabel, currentAsk, cnParts, PD, P, L, LD, lead, frontier, covered, coverage, trueIndicators,
  TUNE, usDrag, chips, oddsWord, betrayP, betrayWord, courtP, summitCourtP, SL, nearness, SEQ, senateParts, supportParts, relTier, allyCount, capitalIncome, marketCapital, hostileDrain, roomMax, theftRisk, pauseMood, ACT, PRINCIPALS, LABS, COMPONENTS, PROJECTS, TERMS, MECH, THRESH, TRIG, ENDINGS, DIFFS, START_T, END_T, MONTHS,
};
if (typeof module !== 'undefined' && module.exports) module.exports = API; else root.ScrambleEngine = API;
})(typeof self !== 'undefined' ? self : this);
