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
// A draw for an outcome the player plays for (the President, Beijing, the courts), read as draw < p. Each class keeps a luck balance (hits minus odds so far) and TUNE.luckFix of it comes off the next draw's odds, so streaks even out while the long-run rate stays p; the draw is rescaled so the dice shown still land under p exactly when it hits.
function draw(s, cls, p) {
  const x = rnd(s);
  if (!TUNE.luckFix || p <= 0 || p >= 1) { if (module.exports._drawHook) module.exports._drawHook(cls, p, x < p); return x; }
  const L = s.luck = s.luck || {}, b = L[cls] || 0, q = Math.max(0, Math.min(1, p - TUNE.luckFix * b)), hit = x < q;
  L[cls] = b + (hit ? 1 : 0) - p; if (module.exports._drawHook) module.exports._drawHook(cls, p, hit);
  return hit ? x * p / q : p + (x - q) * (1 - p) / Math.max(1e-9, 1 - q);
}
// A catastrophe's hazard adds up, and the event fires when the total crosses a hidden fuse with mean TUNE.fuseMean and s.d. fuseMean/sqrt(TUNE.fuse) (a gamma draw), so low risk reliably pays; fuse 1 is the plain monthly roll.
function fuseHit(s, cls, h) {
  if (TUNE.fuse <= 1) return rnd(s) < h;
  const F = s.fuse = s.fuse || {}, c = F[cls] = F[cls] || { H: 0, n: 0, at: fuseDraw(s, cls, 0) };
  c.H -= Math.log(1 - Math.min(0.999, h)); if (c.H < c.at) return false;
  c.n++; c.H = 0; c.at = fuseDraw(s, cls, c.n); return true;
}
function fuseDraw(s, cls, n) { let x = 0; for (let i = 0; i < TUNE.fuse; i++) x -= Math.log(Math.max(1e-12, hash01(s.seed, 'fuse', cls, n, i))); return TUNE.fuseMean * x / TUNE.fuse; }
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
    bio: 'Grew up in a Rust Belt town that lost its plant to China and its pharmacy to Amazon. Asks the question everyone is thinking: if we pause, does China pause? Running in 2028, and wants an issue nobody else owns.',
    moods: { Ally: 'Calls you “the only adult in the building.”', Friendly: 'Forwards you clips from home-state news.', Neutral: 'Polite, and watching which side you are really on.', Cool: 'Thinks you are a Big Tech plant with better manners.', Hostile: 'Tells reporters, off the record, that you are the problem.' } },
  { id: 'cos', name: 'Chief of Staff', title: 'Chief of Staff', short: 'COS', faction: 'Politics', infl: 80, fireable: true,
    prefs: { pause: 0, hawk: -0.2, markets: 1.2, deal: 0.5, control: 1.4, industry: 0, military: 0, commerce: -1.6, ic: 0, allies: 0 }, sal: 0.9,
    bio: 'Ran two Senate campaigns and a governor’s office; has never lost a news cycle on purpose. Guards the President’s calendar, the polling and the 2028 map. Wants the government visibly in charge, and does not trust Commerce.',
    moods: { Ally: 'Gets your memos to the top of the folder.', Friendly: 'Answers your texts within the hour.', Neutral: 'Sees you when there is a slot.', Cool: 'Your meetings keep moving to Fridays at 6:00p.', Hostile: 'Has started asking who signed off on your detailees.' } },
  { id: 'tsy', name: 'Treasury Secretary', title: 'Treasury Secretary', short: 'TSY', faction: 'Dealmaker', infl: 64, fireable: true,
    prefs: { pause: -0.4, hawk: -0.6, markets: 2.0, deal: 1.8, control: 0, industry: 0.5, military: 0, commerce: -1.4, ic: 0, allies: 0.5 }, sal: 0.6,
    bio: 'A hedge fund founder who checks futures before the morning brief. Wants calm markets and a trade deal with Beijing that the President can sign in front of cameras. At war with Commerce over who speaks for the administration on chips.',
    moods: { Ally: 'Shares the overnight market read with you before anyone else.', Friendly: 'Thinks you are reasonable, for a safety person.', Neutral: 'Asks what everything costs.', Cool: 'Prices you in as a risk factor.', Hostile: 'Tells the President you are spooking the bond market.' } },
  { id: 'doc', name: 'Commerce Secretary', title: 'Commerce Secretary', short: 'DOC', faction: 'Industry', infl: 62, fireable: true, persuade: 0.35,
    prefs: { pause: -1.6, hawk: -0.6, markets: 0.8, deal: -0.2, control: 0.4, industry: 2.0, military: 0.2, commerce: 2.4, ic: 0, allies: -0.3 }, sal: 0.35,
    bio: 'A former chipmaker CEO with friends at every frontier lab. Owns export controls and wants to own everything else. Thinks a pause is a gift to Beijing, says so on podcasts, and leaks when cornered.',
    moods: { Ally: 'Calls you “one of the good ones” on a podcast.', Friendly: 'Shares the export-licensing data without being asked.', Neutral: 'Copies the general counsel on everything you send.', Cool: 'Calls you “the doomer” in staff meetings.', Hostile: 'Has three reporters on speed dial and your memos in a drawer.' } },
  { id: 'sec', name: 'Secretary of State', title: 'Secretary of State & NSA', short: 'STATE', faction: 'Hawk', infl: 70, fireable: true,
    prefs: { pause: 0, hawk: 2.0, markets: 0, deal: -0.3, control: 0.5, industry: 0, military: 1.0, commerce: 0, ic: 0.5, allies: 1.0 }, sal: 0.7,
    bio: 'Wears both hats, State and the NSC. A China hawk since Tiananmen, who still keeps a Soviet arms-control binder on the shelf. Will pace only from a position of strength, and with the allies in the tent.',
    moods: { Ally: 'Brings you into the small-group meetings.', Friendly: 'Treats you as a junior colleague worth training.', Neutral: 'Reads your memos for what they concede to Beijing.', Cool: 'Thinks you would give away the store for a handshake.', Hostile: 'Calls your office “the Beijing desk.”' } },
  { id: 'war', name: 'Secretary of War', title: 'Secretary of War', short: 'WAR', faction: 'Hawk', infl: 50, fireable: true,
    prefs: { pause: -0.9, hawk: 1.4, markets: 0, deal: -1.0, control: 0.8, industry: 0.4, military: 2.4, commerce: 0, ic: 0, allies: -0.2 }, sal: 0.5,
    bio: 'A cable-news veteran and two-tour infantry officer. Wants frontier AI in the hands of the warfighter and every option on the table. Distrusts anything that sounds like arms control.',
    moods: { Ally: 'Invites you to the Tank.', Friendly: 'Calls you “the AI guy” with something like affection.', Neutral: 'Hears you out, then asks what it does for the warfighter.', Cool: 'Thinks you want to take the Department’s best tools away.', Hostile: 'Calls pacing “unilateral disarmament” and means you.' } },
  { id: 'dni', name: 'DNI', title: 'Director of National Intelligence', short: 'DNI', faction: 'Agencies', infl: 40, fireable: true,
    prefs: { pause: 0.4, hawk: 0.6, markets: 0, deal: 0, control: 0.8, industry: 0, military: 0.2, commerce: 0, ic: 2.2, allies: 0.3 }, sal: 0.8,
    bio: 'A former House Intelligence chair who never misses a chance to remind people. Sets collection priorities, and has read the classified annex on what the labs are building. Wants the Intelligence Community, not Commerce, to own verification.',
    moods: { Ally: 'Shows you the compartments other principals do not see.', Friendly: 'Sends analysts to your meetings.', Neutral: 'Shares the finished products, not the raw take.', Cool: 'Cites “sources and methods” a lot.', Hostile: 'Has stopped reading you in.' } },
];
const ALTS = {
  cos:  { bio: 'A campaign operative promoted after the shake-up. Lives by the tracking polls, and asks of every policy: who is the villain?', prefs: { pause: 0, hawk: 0.6, markets: 1.4, deal: 0.3, control: 1.0, commerce: -0.6 }, sal: 1.0 },
  tsy:  { bio: 'A bond-market veteran. Less interested in Beijing, more in yields, and allergic to surprises.', prefs: { pause: -0.2, hawk: 0, markets: 2.0, deal: 1.0, industry: 0.4 }, sal: 0.8 },
  doc:  { bio: 'A former BIS enforcement chief. Takes the job, not the spotlight, and has personally chased smuggled GPUs through Singapore.', prefs: { pause: 0, hawk: 1.4, markets: 0.4, control: 0.8, industry: 0.3, commerce: 1.0 }, sal: 0.8 },
  sec:  { bio: 'A diplomat’s diplomat who negotiated New START. Hawkish, but believes in arms control.', prefs: { pause: 0.3, hawk: 1.4, deal: 0.4, allies: 1.4, control: 0.4 }, sal: 1.0 },
  war:  { bio: 'Commanded INDOPACOM. Knows exactly what a war with China would cost, and has written the casualty estimates.', prefs: { pause: 0, hawk: 1.2, military: 1.6, deal: -0.2, control: 0.6 }, sal: 0.9 },
  dni:  { bio: 'A career NSA officer. Quiet and literal, and gives confidence levels in percentages.', prefs: { pause: 0.3, hawk: 0.8, ic: 2.0, control: 0.6 }, sal: 0.8 },
};
const ALT_MOODS = { Ally: 'Trusts your read, and says so in the room.', Friendly: 'Returns your calls the same day.', Neutral: 'New, and still sizing you up.', Cool: 'Keeps you at arm\u2019s length.', Hostile: 'Works around you.' };
// What an hour in each office is like, beyond the generic.
const MEET = {
  vp: ['The Vice President takes you to the Naval Observatory porch and talks about a closed plant for twenty minutes before getting to AI.', 'The Vice President has read your last memo, with notes in the margins, mostly question marks.'],
  cos: ['The Chief of Staff gives you eleven minutes, standing, and remembers every word.', 'The Chief of Staff wants to know who else you have talked to this week, and in what order.'],
  tsy: ['The Treasury Secretary keeps a Bloomberg terminal on and glances at it every time you say \u201cpause.\u201d', 'The Treasury Secretary asks you to put a number on everything. You manage about half.'],
  doc: ['The Commerce Secretary has two lab lobbyists leaving as you arrive. Neither looks at you.', 'The Commerce Secretary argues every point, then asks for your slides.'],
  sec: ['The Secretary of State wants to talk about Reagan and Gorbachev at Reykjavik. You let it run, and it helps.', 'The Secretary of State quizzes you on Beijing\u2019s factions for half an hour, like an oral exam.'],
  war: ['The Secretary of War walks you through the E-Ring at a pace you struggle to match.', 'The Secretary of War asks one question: what does this do to deterrence?'],
  dni: ['The DNI meets you in a SCIF and makes you leave your phone in a box outside.', 'The DNI hands you a finished assessment with half of it blacked out, then tells you what the black parts say.'],
};
// Room quotes: by stance band, plus lines on the topic an action leans on most (its largest tag), and lines for a replacement principal.
const QUOTES = {
  vp:   { yes: ['If this keeps China down and Big Tech honest, I’m in.', 'I’ve seen enough. Do it.', 'The voters back home would want this.', 'Finally, something I can explain at a diner.', 'Good. Somebody in this building should be scared of these companies.'],
          no: ['If we pause, does China pause? I still haven’t heard an answer.', 'This reads like something a Big Tech lobbyist wrote.', 'Who exactly asked for this?', 'You want me to tell Youngstown we did this for the coders?', 'I don’t sign blank checks for Silicon Valley.'],
          mid: ['Show me what it does to China.', 'I want to hear from the labs first.', 'Walk me through who pays for it.', 'Put it in one sentence. If you can’t, I’m out.'],
          t: { industry: { yes: ['About time someone told them no.'], no: ['This is a handout with a safety sticker.'] }, hawk: { yes: ['China cheats. Make them pay for it.'], no: ['You’re picking a fight we can’t win at the gas pump.'] }, pause: { yes: ['Working people didn’t vote for a machine nobody can turn off.'], no: ['A pause China ignores is just a gift.'] } } },
  cos:  { yes: ['This is a win we can explain.', 'The government has to look in charge. This does that.', 'Fine. I’ll find a Rose Garden slot.', 'Good. Get me three validators by Thursday.', 'The President likes being the one who decides. Let him decide this.'],
          no: ['I can’t sell this in Pennsylvania.', 'Not before I see the polling.', 'This is a story about chaos. We don’t do chaos.', 'Every week this leads the news is a week we lose.', 'I count the votes, and this doesn’t have them.'],
          mid: ['How does this play?', 'Who carries it on the Sunday shows?', 'What’s the headline if it goes wrong?', 'Give me the version that fits on a lectern.'],
          t: { markets: { yes: ['Markets up is a message.'], no: ['The 401(k) crowd votes.'] }, commerce: { yes: ['If Commerce hates it, it’s probably right.'], no: ['This just hands Commerce another fiefdom.'] }, control: { yes: ['In charge. Visibly. Good.'], no: ['This makes us look like passengers.'] } } },
  tsy:  { yes: ['Markets can live with that.', 'That’s a deal I can take to Beijing.', 'Priced in. Go.', 'Fine, but I want it announced after the close.', 'Clean. The bond desk will barely notice.'],
          no: ['Futures will be down four percent by lunch.', 'You’re going to blow up the trade summit.', 'Do you know how much of the S&P is AI capex?', 'I’d be shorting us if I still could.', 'Beijing holds the rare earths. Do the math.'],
          mid: ['What’s the market impact?', 'Price it for me first.', 'Who’s on the other side of this trade?', 'Give me a week to talk to the Fed.'],
          t: { deal: { yes: ['Finally, a deal on the table.'], no: ['There goes the summit.'] }, hawk: { yes: ['Fine, but leave the soybeans out of it.'], no: ['Every sanction is a tax on Iowa.'] }, markets: { yes: ['The market will thank us.'], no: ['That’s a 9% drawdown in chip stocks, minimum.'] } } },
  doc:  { yes: ['Commerce can run this. Commerce should run this.', 'Great. My people are ready.', 'We wrote half of this already.', 'Put my name on the rule.', 'The industry can live with this, if we write the definitions.'],
          no: ['Who’s in charge of this? Because it isn’t me.', 'This is doomer fan fiction.', 'They’re cheering this in Beijing tonight.', 'Every lab CEO is going to call me, and I’m going to give them your number.', 'You’re regulating math.'],
          mid: ['Where does Commerce sit in this?', 'I’d want to see the org chart.', 'Which lab did you ask?', 'Send it to my general counsel.'],
          t: { industry: { yes: ['Good for American builders.'], no: ['This is a tax on the only industry we still lead.'] }, commerce: { yes: ['Commerce enforces it. Obviously.'], no: ['Another agency stepping on my rules.'] }, pause: { yes: ['If we must, we write the thresholds.'], no: ['A pause is a gift to Beijing. I’ll say it on the record.'] } } },
  sec:  { yes: ['Good. Beijing respects strength.', 'This buys us leverage.', 'Tokyo and Canberra will back this.', 'Arms control works when it’s verified. This is verified.', 'This is how you negotiate: from the high ground.'],
          no: ['This is a gift to Beijing.', 'We’d be disarming unilaterally.', 'The allies will read this as weakness.', 'You don’t trade with a counterpart who’s cheating.', 'Not on my watch, and not on my cable traffic.'],
          mid: ['What does Beijing do in response?', 'Run it past our allies first.', 'What’s the verification?', 'Who in Beijing actually signs this?'],
          t: { hawk: { yes: ['Squeeze them. Then talk.'], no: ['Pressure without a plan is just noise.'] }, allies: { yes: ['The G7 will line up behind this.'], no: ['The Europeans will hear about this from the papers.'] }, deal: { yes: ['Only if it’s verifiable.'], no: ['They’ll pocket it and cheat.'] } } },
  war:  { yes: ['The warfighter needs this.', 'Options on the table. Good.', 'INDOPACOM has been asking for this for a year.', 'Deterrence is a capability. This is a capability.', 'Fine. The Department will execute.'],
          no: ['Our adversaries won’t stop. Neither should we.', 'This handcuffs the Department.', 'The PLA doesn’t have a pause button.', 'Tell that to the sailors in the Strait.', 'I didn’t take this job to hold anyone’s coat.'],
          mid: ['Does this touch DoD compute?', 'I’d want the Joint Staff to look.', 'What’s the threat picture?', 'Show me what it does to the target list.'],
          t: { military: { yes: ['That’s a war-winning capability.'], no: ['You’re taking a weapon out of the warfighter’s hands.'] }, deal: { yes: ['A deal is fine if it binds them first.'], no: ['Paper doesn’t stop missiles.'] }, pause: { yes: ['If they stop too, I’ll listen.'], no: ['Unilateral disarmament. Not on my watch.'] } } },
  dni:  { yes: ['The Community can deliver this.', 'We can see it, and we can verify it.', 'This is what we built NGA for.', 'High confidence. Go.', 'Our collection supports it.'],
          no: ['I don’t have the collection to back this up.', 'This burns sources for very little.', 'We’d be flying blind.', 'I can’t brief the committees on something we can’t check.', 'Analytically, this is a guess.'],
          mid: ['I’d want an assessment first.', 'Confidence is moderate at best.', 'Let me put a team on it for a week.', 'The analysts disagree, which tells you something.'],
          t: { ic: { yes: ['The Community should own this.'], no: ['Commerce can’t do intelligence.'] }, control: { yes: ['Monitoring is collection by another name.'], no: ['Without monitoring, we’re guessing.'] }, hawk: { yes: ['We can see what this does.'], no: ['This burns access we spent years building.'] } } },
};
// A replacement principal speaks differently from the one fired.
const ALT_QUOTES = {
  cos:  { yes: ['The tracking poll likes this.', 'Villain: Beijing. Hero: us. Fine.'], no: ['Our numbers with suburban women can’t take this.', 'There’s no villain in this story. Get me a villain.'], mid: ['Let me test it in two focus groups.'] },
  tsy:  { yes: ['The ten-year won’t blink.', 'No surprises. Good.'], no: ['That’s a volatility event.', 'Spreads widen on this.'], mid: ['What does it do to term premium?'] },
  doc:  { yes: ['BIS can enforce this by Monday.', 'I’ve chased these chips through Singapore. This closes a door.'], no: ['That rule is unenforceable as written.', 'We’d need forty more agents.'], mid: ['What’s the enforcement mechanism?'] },
  sec:  { yes: ['This is verifiable. I can sell verifiable.', 'Trust, but verify. We can verify.'], no: ['No treaty survives without inspections.', 'The allies need to be in first.'], mid: ['What would New START have done here?'] },
  war:  { yes: ['This reduces the chance I’m writing letters to families.', 'Deterrence holds. Good.'], no: ['This makes a war likelier, not less.', 'I’ve run this wargame. We lose ships.'], mid: ['What does the PLA read into this?'] },
  dni:  { yes: ['Eighty percent confidence it works.', 'The collection supports it.'], no: ['Thirty percent. Maybe.', 'We can’t see that.'], mid: ['Insufficient data. Give me two weeks.'] },
};
function roomQuote(s, p, band, tags, key) {
  const alt = p.alt && ALT_QUOTES[p.id], base = alt ? alt[band].concat(QUOTES[p.id][band].slice(0, 2)) : QUOTES[p.id][band].slice();
  // the action's heaviest tag this principal has a line about, if any
  const t = QUOTES[p.id].t || {}; const top = Object.keys(tags).filter(k => t[k] && t[k][band]).sort((a, b) => Math.abs(tags[b]) - Math.abs(tags[a]))[0];
  const qs = top ? base.concat(t[top][band], t[top][band]) : base;
  return qs[Math.floor(hash01(s.seed, key, p.id, 'q') * qs.length)];
}

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
const SL = { 3: { W: 25, theft: 0.90, drag: 0 }, 4: { W: 65, theft: 0.25, drag: 0.05 }, 5: { W: 92, theft: 0.04, drag: 0.15, dragStart: 0.30 } };
// SL5's overhead is front-loaded: the move onto isolated networks costs most, easing from dragStart to drag over 12 months
function slDrag(s) { const l = SL[s.sl]; if (!l.dragStart) return l.drag; const age = s.t - (s.flags.sl5Since == null ? s.t : s.flags.sl5Since); return l.drag + (l.dragStart - l.drag) * Math.max(0, 1 - age / 12); }
function setSL(s, lvl) { if (lvl > s.sl) { s.sl = lvl; s.W = SL[lvl].W; } }
// Tunables, exported so sim/ can test variants.
const TUNE = {
  inst: { war: 4, dni: 3, senate: 3, trust: 8, sci: 3, insp: 2 },
  theftBase: 0.05,
  hawkBase: -0.075,
  hawkProvoke: 0.08,
  hawkRace: 0.08,
  uaeShare: 0.15,
  uaeRate: 0.3,
  uaeHazard: true,
  uaeSupport: false,
  uaeDeal: 0,
  uaeCost: 2,
  uaeState: -12,
  courtRate: { dpa: 0.3, license: 0.2, charter: 0.1 },
  statuteCourt: 0.04,
  summitCourt: 0.35,
  betray: 2.5,
  betrayAt: 0.85,
  falseAlarm: 0.12,
  senateBase: 0,
  riderBelow: 52,
  slowMonths: 2,
  p0Ap: 1,
  eventsPerTurn: 1,
  whip: 9,
  hillCap: 25,
  billFight: 3,
  billBack: 8,
  walkRate: 0.3,
  leadSlope: 0.2,
  overtakePen: 2.0,
  postureNoise: 2,
  cnSharp: 3,
  cheatTrust: 0.8,
  cheatResent: 0.15,
  cnWin: 0.10,
  ctrlBite: { legal: 0.20, remote: 0.12, smuggle: 0.10, dist: 0.08 },
  ctrlHeat: 0.5,
  ctrlMkt: 1,
  ctrlHawk: 3,
  cnCompW: 0.4,
  secretRate: 0.5,
  usCatch: 0.1,
  cnSeesUS: 0.15,
  supportBreak: 12,
  aloneFloor: 4,
  chipLever: 0.55,
  reliefLever: 0.25,
  appealSwing: 0.5,
  licRel: 0.3,
  charterRel: 0.3,
  lockout: 4,
  enjoinedMult: 0.5,
  labLobby: 0.6,
  meetDecay: 0.6,
  favorCred: 2,
  senateFlip: 3,
  flipHill: 0.7,
  strait: 1,
  straitBase: 0.01,
  straitHot: 0.12,
  straitHotFrom: 25,
  straitPre: 0.17,
  warEsc: 1.15,
  holdFirm: 0.6,
  cheatSteal: 2,
  resolveMid: 0.5,
  resolveFirst: 0.1,
  cheatResolve: 2,
  cheatHeat: 1,
  theftResolve: 2,
  theftLeadSlope: 0.1,
  theftLeadBase: 0.5,
  theftLeadMax: 1.6,
  resolveDeadline: 0.1,
  warResolve: 2,
  reassureBold: 2,
  reassureCut: 0.7,
  reassureMonths: 12,
  reassureBase: 0.3,
  // the open-weight frontier (off at 0): sub-threshold and open developers keep climbing under a pause, and China takes whatever is published
  open: 1,
  openLag: 0.5,
  openRoom: { none: 0.6, '1e20': 0.15, '1e21': 0.3, '1e22': 0.55 },
  openCopy: 0.3,
  openRuleCut: 0.4,
  openHaz: 0.2,
  openShut: 0.08,
  openFloor: 0.3,
  openNear: 3,
  openPub: 1,
  laneGap: 3,
  growRisk: 4,
  misuse: 1,
  agents: 1,
  agentOpen: 1.5,
  agentBase: 33,
  // misuse pact: what offering it costs the DNI and State, how much it slows sovereign-agent growth, and the share of its worth to Beijing that counts toward a deal
  pactDni: 8,
  pactSec: 6,
  pactAgent: 0.7,
  pactWorth: 0.75,
  // cabinet: initiative odds multiplier for a Friendly or Ally principal (cabHurt for a Cool or Hostile one), monthly pull of every relationship toward 0 (relDrift), Commerce's share of industry hits, a meeting's base relationship gain, months before an ignored ask costs goodwill, share of losses an Ally takes
  cabOdds: 3,
  cabHurt: 1,
  relDrift: 0.96,
  docIndustry: 0.25,
  meetBase: 16,
  askNeglect: 6,
  allySticky: 0.5,
  // markets: points away from 100 per capital a turn, Senate and pacing-support votes per point, President's extra weight on market costs per point below 100, credibility a month per 20 points
  mktCap: 30,
  mktSenate: 0.15,
  mktSupport: 0.6,
  mktPres: 0.005,
  mktCred: 1.3,
  // luck: spread of each game's hidden draws (1 = full range, 0 = every game at the median); share of a decision class's luck balance taken off its next roll; catastrophe fuse shape (1 = a plain monthly roll) and mean length (under 1 fires sooner). spread 1, luckFix 0, fuse 1 plays as before.
  spread: 0.5,
  luckFix: 0.5,
  fuse: 4,
  fuseMean: 0.65,
};
const PROJECTS = [
  { id: 'team', name: 'Hire a real team', need: 1, pc: 3, avail: s => P(s, 'cos').rel >= 15 ? true : 'The Chief of Staff controls detailee slots: needs the Chief at least Friendly (15+)', desc: 'Detailees from State, Energy and the IC. Right now you are one person with an inbox. The Chief of Staff has to sign off on the slots, and it costs capital.', done: '+1 action every turn for the rest of the game.', fx(s) { s.apMax += 1; } },
  { id: 'memo', name: 'Write the memo for the emergency meeting', need: 1, p1: false, desc: 'Answers to the questions the President will ask in the first hour, drafted before anyone asks them.', done: 'At the scramble: +15 credibility, +2 political capital, and the room leans your way.' },
  { id: 'charter', name: 'Pre-draft the Pacing Charter with lab lawyers', need: 2, desc: 'Definitions, thresholds and research-automation language, agreed in principle by general counsels.', done: 'Every lab is much more likely to sign during the scramble.' },
  { id: 'geoint', name: 'Build the thermal and GEOINT baseline', need: 2, desc: 'Pattern-of-life on every candidate site. Cheap now, impossible to compress later. Worth the most when Beijing hides its sites well.', done: 'Survey +30, intelligence quality +15, and Beijing’s concealment counts for 60% less.', fx(s) { s.verify.survey += 30; s.intelQ += 15; } },
  { id: 'inspect', name: 'Inspectors, chip ledger, whistleblower lines', need: 2, desc: 'Former IAEA and DTRA inspectors who know what a GPU hall looks like, a ledger of every frontier chip, and protected reporting lines at the labs.', done: 'Inspections +30, and smuggling gets harder (the more smuggling there is, the more it cuts).', fx(s) { s.verify.inspect += 30; s.cn.smuggleT = Math.max(0, s.cn.smuggleT - 0.15 * cnBase(s).smuggle); } },
  { id: 'zk', name: 'Cryptographic proof-of-training', need: 3, desc: 'Zero-knowledge proofs of what a cluster trained. Rigorous and elegant.', done: 'Novel tech +30. It will not count during Phase 1: nobody trusts it yet.', fx(s) { s.verify.novel += 30; } },
  { id: 'track2', name: 'Track 2 dialogue with Chinese scientists', need: 2, desc: 'A shared evidence base on loss of control, reached through their own work. Worth the most when Beijing\u2019s science faction already has a voice.', done: 'Beijing trust +12; their science faction gains ground.', fx(s) { s.cn.trust += 12; shiftCN(s, { sci: 5, sec: -2 }); } },
  { id: 'legal', name: 'Legal authorities study (DPA, IEEPA)', need: 1, desc: 'What the President can actually do on day one, and what survives a court. Worth the most when the courts are hostile.', done: 'Emergency orders are far less likely to be enjoined, the DPA threat becomes credible, and your read on the courts gets far more accurate.' },
  { id: 'control', name: 'AI control protocols with the labs', need: 2, desc: 'Trusted monitoring, restricted permissions, control evaluations that gate scaling.', done: 'Runaway risk at careful or covered labs falls 40%; automation limits are easier to sign. Monitoring overhead slows US labs 5%.' },
  { id: 'cyberdef', name: 'Defenders first: early model access for critical infrastructure', need: 1, pc: 1, desc: 'The labs give CISA, the utilities, the banks and Cyber Command each new model weeks before release, so defenders patch what attackers will find. Worth more as open models get stronger.', done: 'AI-enabled cyberattacks come less than half as often, and when one lands, markets -1 instead of -4 and you gain credibility instead of losing it. Labs +4.', fx(s) { s.policies.cyberdef = true; s.labs.forEach(l => l.rel += 4); } },
  { id: 'synth', name: 'DNA synthesis screening and bio evals', need: 1, pc: 1, desc: 'Every DNA synthesis order screened against dangerous sequences, benchtop synthesizers registered, and bio-uplift evals required before a model ships. Cheap now; nobody wants to pass it the week after an attack.', done: 'Bio near-misses come 40% less often, and when one comes, screening catches it: credibility instead of panic. Industry -2.', fx(s) { s.policies.synth = true; industry(s, -2); } },
  { id: 'sl4', name: 'Implement SL4 at the labs', need: 1, desc: 'Audits, insider-threat programs and hardened networks, so the executive order is real at every frontier lab. Requires the SL4 executive order.', done: 'Security SL4: a theft attempt succeeds 25% of the time instead of 90%. Overhead slows US labs 5%.', fx(s) { setSL(s, 4); } },
  { id: 'sl5', name: 'Raise the labs to SL5', need: 3, desc: 'Hardware-enforced access, air-gapped research networks, two-person integrity. Built to stop a nation-state, and a slog: months of rebuilding networks, vetting staff and fighting the labs over every air gap. Requires SL4 in place first. Worth the most when Beijing\u2019s hackers push hard.', done: 'Security SL5: a theft attempt succeeds 4% of the time instead of 25%. Air gaps and vetting slow US labs 30% at first, easing to 15% over a year as the labs adapt (instead of SL4\u2019s 5%). Labs -20, industry -12, markets -6.', fx(s) { setSL(s, 5); s.flags.sl5Since = s.t; s.labs.forEach(l => l.rel -= 20); industry(s, -12); s.markets -= 6; } },
];

// Each principal's asks, tried in rotation; an ask whose avail fails (the moment passed, it is already done) is skipped.
const notYet = k => s => !s.flags[k];
const ASKS = {
  vp: [
    { text: 'Say publicly: no taxpayer backstops for AI companies.', pc: 1, fx(s) { industry(s, -8); s.labs.forEach(l => l.rel -= 4); s.salience += 2; return 'You say it on a Sunday show. The VP texts a thumbs-up. Mindscale’s CFO does not.'; } },
    { text: 'Ban Chinese AI models from federal systems.', pc: 1, avail: notYet('cnModelBan'), fx(s) { s.flags.cnModelBan = true; s.tension += 4; shiftCN(s, { sec: 2 }); return 'The ban goes out by memo. Beijing calls it discrimination.'; } },
    { text: 'Put a jobs guarantee in every AI announcement.', pc: 2, fx(s) { s.cred += 2; industry(s, -5); return 'The jobs language polls well in Ohio.'; } },
    { text: 'Come to a listening session with laid-off call-center workers in Ohio.', pc: 1, avail: s => s.t > 2 && !s.flags.ohio, fx(s) { s.flags.ohio = true; s.salience += 3; P(s, 'vp').shift += 0.1; industry(s, -3); return 'A woman who trained the model that replaced her asks you what happens next. The clip runs for two days.'; } },
    { text: 'Make data centers pay for their own grid upgrades.', pc: 2, avail: s => (s.seen.power || s.t > 4) && !s.flags.ratepayer, fx(s) { s.flags.ratepayer = true; industry(s, -6); s.markets -= 1; P(s, 'vp').shift += 0.1; return 'The Ratepayer Protection order goes out. Three utilities cancel rate hearings.'; } },
    { text: 'Let the VP chair the AI incident task force.', pc: 1, avail: s => s.flags.incidentTurn != null && !s.flags.vpTask, fx(s) { s.flags.vpTask = true; infl(s, 'vp', 4); rel(s, 'cos', -6); s.salience += 2; return 'The Vice President holds the first meeting in the Indian Treaty Room, with cameras.'; } },
  ],
  cos: [
    { text: 'Hand the Chief a visible win before the midterms.', pc: 2, avail: s => !s.seen.midterms, fx(s) { s.cred += 3; s.salience += 2; return 'You give the Chief a rally line about chip smugglers. It lands.'; } },
    { text: 'Keep Commerce in its lane.', pc: 1, fx(s) { infl(s, 'doc', -8); rel(s, 'doc', -20); return 'Commerce is cut out of two meetings. The Commerce Secretary notices.'; } },
    { text: 'No surprises: pre-brief the Chief on everything.', pc: 1, avail: notYet('cosBriefed'), fx(s) { s.flags.cosBriefed = true; return 'You start sending the Chief a 7:00a note. It gets read.'; } },
    { text: 'Give the President a signing ceremony, with pens.', pc: 1, avail: s => s.phase !== 'scramble', fx(s) { s.cred += 2; s.salience += 2; return 'The President signs an AI workforce order in the East Room and hands the pens to three union presidents.'; } },
    { text: 'Keep AI off the front page until the State of the Union.', pc: 1, avail: s => s.phase === 'p0' && [10, 11, 0].indexOf(dateOf(s.t).m) >= 0, fx(s) { s.salience -= 6; return 'You cancel two interviews. The Chief wants the speech to break the news, not you.'; } },
    { text: 'Let the White House announce your next win, not you.', pc: 1, fx(s) { s.cred -= 1; infl(s, 'cos', 3); return 'The press office takes the credit. The Chief takes note.'; } },
    { text: 'Keep the pause out of the 2028 primaries.', pc: 1, avail: s => s.t > 13 && paced(s), fx(s) { s.salience -= 4; s.markets += 1; return 'You decline to brief either party’s candidates. The campaigns move on to other things.'; } },
  ],
  tsy: [
    { text: 'No new chip restrictions before the trade summit.', pc: 1, avail: s => !s.seen.trade_summit && s.t < 8, fx(s) { s.flags.summitHold = s.turn + 3; return 'Chip restrictions are frozen for three months.'; } },
    { text: 'A market stabilization plan before any pause.', pc: 2, avail: s => !s.flags.marketPlan && !paced(s), fx(s) { s.flags.marketPlan = true; return 'Treasury drafts a liquidity backstop. Any pause will hit markets half as hard.'; } },
    { text: 'Back a market lane in any China deal.', pc: 1, avail: notYet('laneCommit'), fx(s) { s.flags.laneCommit = true; return 'You promise. Treasury will remember if an offer leaves it out.'; } },
    { text: 'Brief the Fed Chair before anything moves markets.', pc: 1, avail: notYet('fedBriefed'), fx(s) { s.flags.fedBriefed = true; s.markets += 3; s.cred += 1; return 'You meet the Fed Chair at the Eccles Building at 7:00a. Nothing about the meeting leaks, which is the point.'; } },
    { text: 'Let Treasury, not Commerce, sanction the smuggling networks.', pc: 1, fx(s) { s.cn.smuggleT = Math.max(0, s.cn.smuggleT - 0.05); rel(s, 'doc', -8); s.tension += 2; return 'OFAC designates eleven shell companies in Singapore and Dubai. Commerce learns about it from Bloomberg.'; } },
    { text: 'No new sanctions while the bond auction clears.', pc: 1, avail: s => !!(s.seen.trade_summit || s.t >= 8), fx(s) { s.flags.summitHold = Math.max(s.flags.summitHold || 0, s.turn + 1); s.markets += 2; return 'The auction clears at a lower yield. Chip restrictions wait a month.'; } },
  ],
  doc: [
    { text: 'Let Commerce chair any pacing regime.', pc: 2, avail: notYet('commerceChairs'), fx(s) { s.flags.commerceChairs = true; infl(s, 'doc', 8); rel(s, 'cos', -12); rel(s, 'tsy', -10); return 'The Commerce Secretary is delighted. The Chief of Staff and the Treasury Secretary are not.'; } },
    { text: 'Promise startups an exemption: nothing below 1e21 OP/s.', pc: 1, avail: notYet('floor21'), fx(s) { s.flags.floor21 = true; return 'The 1e20 threshold is off the table.'; } },
    { text: 'Give Commerce credit for the next smuggling bust.', pc: 1, fx(s) { infl(s, 'doc', 4); rel(s, 'sec', -5); s.cn.smuggleT = Math.max(0, s.cn.smuggleT - 0.05); return 'Commerce gets the press release.'; } },
    { text: 'Fast-track export licenses for allied data centers in the Gulf.', pc: 1, fx(s) { s.markets += 2; s.coalition += 2; industry(s, 4); rel(s, 'sec', -4); return 'Licenses for Riyadh and Abu Dhabi clear in a week. State asks who is checking the end users.'; } },
    { text: 'Let the labs self-certify their safety evals.', pc: 2, avail: s => s.phase !== 'scramble' && !s.flags.selfCert, fx(s) { s.flags.selfCert = true; s.labs.forEach(l => l.rel += 6); industry(s, 4); s.verify.inspect -= 4; return 'The labs write their own report cards. The first ones are glowing.'; } },
    { text: 'Exempt open-weight releases from any new AI rule.', pc: 1, avail: notYet('openExempt'), fx(s) { s.flags.openExempt = true; industry(s, 6); return 'The open-source exemption goes into the draft. Hobbyists cheer; so do three Chinese labs that download American open models.'; } },
  ],
  sec: [
    { text: 'Entity-list the Johor operator.', pc: 2, avail: notYet('johorListed'), fx(s) { s.flags.johorListed = true; s.cn.remoteT = Math.min(s.cn.remoteT, 0.6); s.tension += 8; shiftCN(s, { sec: 3 }); s.coalition -= 3; return 'Selat Data goes on the Entity List. Kuala Lumpur is unhappy.'; } },
    { text: 'Raise human rights in every Beijing channel.', pc: 1, fx(s) { s.cn.trust -= 5; return 'The talking points go in. The Chinese side walks out of one session.'; } },
    { text: 'Get Tokyo and The Hague on board before any chip move.', pc: 1, avail: s => s.coalition < 70, fx(s) { s.coalition += 6; rel(s, 'tsy', -3); return 'You spend a week on planes. Tokyo commits; The Hague commits to thinking about it.'; } },
    { text: 'Brief the Five Eyes before Beijing hears anything.', pc: 1, avail: s => s.phase !== 'p0' || s.alarm > 50, fx(s) { s.coalition += 4; rel(s, 'dni', 4); s.cn.trust -= 2; return 'Canberra, London, Ottawa and Wellington get the brief. Beijing gets it a day later, from someone.'; } },
    { text: 'Approve the Taiwan air-defense package.', pc: 2, avail: s => !s.war && !s.flags.taiwanArms, fx(s) { s.flags.taiwanArms = true; s.tension += 6; rel(s, 'war', 6); return 'The notification goes to Congress. Beijing’s foreign ministry spokesman uses the word “playing with fire.”'; } },
    { text: 'Keep the UN out of AI verification.', pc: 1, avail: s => !!s.seen.cn_un, fx(s) { s.cn.trust -= 4; s.coalition += 2; return 'The US mission blocks the Shanghai secretariat in committee. The Europeans abstain.'; } },
  ],
  war: [
    { text: 'A DoD carve-out from any compute threshold.', pc: 2, avail: notYet('dodCarve'), fx(s) { s.flags.dodCarve = true; shiftCN(s, { sci: -4, sec: 2 }); return 'Beijing’s analysts read the carve-out as the real program.'; } },
    { text: 'Frontier models on classified networks this quarter.', pc: 1, avail: notYet('classNets'), fx(s) { s.flags.classNets = true; L(s, 'mindscale').rel += 8; shiftCN(s, { sec: 2 }); return 'Mindscale wins the first task order.'; } },
    { text: 'AI cyber defense for every base and port, from the frontier labs.', pc: 1, avail: notYet('dodCyber'), fx(s) { s.flags.dodCyber = true; infl(s, 'war', 2); s.labs.forEach(l => l.rel += 3); return 'Cyber Command gets early access to the next two models. AI-enabled cyberattacks will do less damage.'; } },
    { text: 'Keep the Pentagon’s red-team results out of the pacing debate.', pc: 1, avail: s => s.t > 3, fx(s) { s.salience -= 3; rel(s, 'dni', -4); return 'The red-team report goes into a SAP nobody outside the building can read.'; } },
    { text: 'Put every frontier lab on the war effort.', pc: 2, avail: s => !!s.war, fx(s) { s.labs.forEach(l => l.rel += 5); s.tension += 4; shiftCN(s, { sec: 3 }); return 'The labs’ CEOs come to the Pentagon for a photo. The models go to INDOPACOM.'; } },
  ],
  dni: [
    { text: 'Reprogram NIP funds toward compute verification.', pc: 2, fx(s) { s.verify.survey += 8; s.intelQ += 8; if (s.warp === 0) s.warp = 1; return 'The reprogramming notice goes to the committees. Verification funding starts flowing.'; } },
    { text: 'Let the IC lead verification, not Commerce.', pc: 1, avail: notYet('icLeads'), fx(s) { s.flags.icLeads = true; rel(s, 'doc', -12); infl(s, 'dni', 6); return 'The DNI owns verification. Commerce sulks.'; } },
    { text: 'Declassify the estimate on Chinese AI.', pc: 1, avail: s => s.t > 2, fx(s) { s.salience += 4; s.cn.trust -= 3; if (s.phase === 'p0') s.alarm += 4; return 'A twelve-page unclassified version goes out on a Friday. It still makes Monday’s papers.'; } },
    { text: 'Approve a new collection program on Chinese labs.', pc: 2, fx(s) { s.intelQ += 6; s.tension += 2; return 'The program is approved in a room with no windows. The first take arrives in five weeks.'; } },
    { text: 'Give the IC a seat on every lab’s insider-threat review.', pc: 1, avail: notYet('icLabs'), fx(s) { s.flags.icLabs = true; s.intelQ += 4; s.labs.forEach(l => l.rel -= 4); return 'Two FBI agents and an NSA liaison join each lab’s security team. The labs’ engineers notice.'; } },
  ],
};

/* ================= state accessors ================= */
// Rivalries: helping one side of a feud costs you with the other.
const RIVALS = { doc: ['tsy', 'cos', 'dni', 'vp'], tsy: ['doc', 'sec'], cos: ['doc'], sec: ['tsy'], dni: ['doc'], vp: ['doc'], war: [] };
function rivalHit(s, id, d) { (RIVALS[id] || []).forEach(r => rel(s, r, -d)); }
const PIDX = {}; PRINCIPALS.forEach((p, i) => PIDX[p.id] = i);
const LIDX = {}; LABS.forEach((l, i) => LIDX[l.id] = i);
function P(s, id) { return s.principals[PIDX[id]]; }
function PD(s, id) { const st = P(s, id); const base = PRINCIPALS[PIDX[id]]; if (!st.alt) return base; const a = ALTS[id]; return Object.assign({}, base, { bio: a.bio, moods: ALT_MOODS, prefs: Object.assign({ pause: 0, hawk: 0, markets: 0, deal: 0, control: 0, industry: 0, military: 0, commerce: 0, ic: 0, allies: 0 }, a.prefs), sal: a.sal }); }
// 'Industry' = the labs and the Commerce Secretary, who speaks for them.
function industry(s, d) { s.labs.forEach(l => { l.rel = clamp(l.rel + 0.6 * d, -100, 100); }); rel(s, 'doc', TUNE.docIndustry * d); }
function rel(s, id, d) { const p = P(s, id); p.rel = clamp(p.rel + (d < 0 && p.rel >= 40 ? TUNE.allySticky : 1) * d, -100, 100); } // an Ally shrugs off half of any loss
function infl(s, id, d) { const p = P(s, id); p.infl = clamp(p.infl + d, 0, 100); }
function L(s, id) { return s.labs[LIDX[id]]; }
function LD(id) { return LABS[LIDX[id]]; }
// A news line, at most every three months, hinting at what a weak or strong market does to your capital, credibility and votes. Uses hash01, not rnd, so play is unchanged.
const MARKET_NEWS = {
  low: ['Futures slide again. Donors call the Chief of Staff, and your own calls come back a little slower.', 'CNBC runs a segment on \u201cthe AI pause trade.\u201d Two members who backed you go quiet on the Hill.', 'Treasury circulates a memo on market confidence. Your office is in the second paragraph.', 'A 401(k) chart goes viral. Nobody at the senior staff meeting asks for your view.'],
  high: ['The S&P closes at a record. The West Wing is in a generous mood, and your asks clear faster.', 'Markets shrug off the AI headlines. Members who were nervous start returning your calls.'],
};
function marketNews(s) {
  const band = s.markets < 90 ? 'low' : s.markets > 110 ? 'high' : null;
  if (!band || s.turn - (s.flags.marketNews || -9) < 3 || hash01(s.seed, 'mktnews', s.turn) > 0.5) return;
  const xs = MARKET_NEWS[band]; s.flags.marketNews = s.turn;
  log(s, xs[Math.floor(hash01(s.seed, 'mktline', s.turn) * xs.length)], band === 'low' ? 'bad' : 'good');
}
function log(s, text, tone) { s.log.push({ t: s.t, turn: s.turn, text, tone: tone || 'info' }); }
function shiftCN(s, d) { const f = s.cn.f; for (const k in d) f[k] = Math.max(3, f[k] + d[k]); const sum = f.m + f.sec + f.sci; f.m *= 100 / sum; f.sec *= 100 / sum; f.sci *= 100 / sum; }

function frontier(s) { return Math.max.apply(null, s.labs.map(l => l.cap)); }
// What Washington can see: a lab cheating on the pause hides its extra progress (l.hidden) until it is caught or stops.
function knownCap(l) { return l.cap - (l.hidden || 0); }
function publicFrontier(s) { return Math.max.apply(null, s.labs.map(knownCap)); }
function frontierLab(s) { let b = s.labs[0]; s.labs.forEach(l => { if (l.cap > b.cap) b = l; }); return b; }
function lead(s) { return frontier(s) - s.cn.cap; }
// The gap as Washington sees it (the IC's estimate): what US politics react to. Beijing knows its own position and acts on lead().
function seenLead(s) { return leadEstimate(s).mid; }
// Pacing alone: with no deal and the IC's lead down to TUNE.aloneFloor, paused labs keep pace with the IC's estimate of China instead of stopping.
function keepGap(s) { return paced(s) && !s.cn.deal && seenLead(s) < TUNE.aloneFloor; }
// Growth a threshold leaves paced labs, before automation limits and drag.
function thGrowth(s) { return { '1e20': 0.06, '1e21': 0.12, '1e22': 0.7 }[s.pacing.threshold] || 0.12; }
function paced(s) { return !!s.pacing.active; }
function covered(s, lab) { if (!paced(s)) return false; return lab.covered; }
function coverage(s) { return Math.round(100 * s.labs.reduce((a, l) => a + (covered(s, l) ? LD(l.id).share * (l.id === 'mindscale' && s.flags.uaeOut ? 1 - TUNE.uaeShare : 1) : 0), 0)); }
// China's compute by channel at baseline: IFP's end-2026 stocks (Fist, Adamson & Pilz, Oct 2026) scaled to 90%, plus 10% no rule reaches.
// HBM and tool curbs (sme) trim at most 5% of domestic within the game: the servicing ban bites only once the fleet falls below China's HBM-limited output.
// supply: the share of Taiwan-made chips still reaching China (a quarantine or war cuts smuggled, legal and offshore channels)
function cnSources(c) { const u = c.supply == null ? 1 : c.supply; return { domestic: 0.34 * (0.95 + 0.05 * c.sme), offshore: 0.20 * c.remote * (0.5 + 0.5 * u), smuggled: 0.20 * c.smuggle * u, legal: 0.16 * c.legal * u, other: 0.10 }; }
function cnComp(s) { const src = cnSources(s.cn); return (src.domestic + src.offshore + src.smuggled + src.legal + src.other) * (1 + 0.25 * s.cn.race); }
function trigMult(s) { return { '425': 0.55, '200': 0.8, '200c': 1.0, '100': 0.92 }[s.pacing.trigger] || 0.5; }
function ready1(s) { const v = s.verify; return (v.survey + v.inspect) / 2; }
function ready2(s) { const v = s.verify; const xs = COMPONENTS.map(c => v[c.id]); return { avg: xs.reduce((a, b) => a + b, 0) / xs.length, min: Math.min.apply(null, xs) }; }
// While a court has enjoined the Charter's mandatory verification, detection and inspection growth run at TUNE.enjoinedMult.
function enjoined(s) { return !!s.flags.verifyEnjoined && !s.flags.statute; }
function detection(s) { const v = s.verify; return clamp((0.08 + 0.5 * (v.inspect / 100) * trigMult(s) + (s.pacing.automation ? 0.12 : 0) + (s.flags.surgeTurn === s.turn ? 0.25 : 0) + (s.verify.novel > 50 ? 0.08 : 0)) * (enjoined(s) ? TUNE.enjoinedMult : 1), 0, 0.9); }
// How well Beijing hides sites, as a multiplier on cheating and hidden-program risk; the GEOINT baseline cuts 60% of the departure from typical.
function concealment(s, h) { if (h == null) h = s.cn.hide || 1; return s.done.geoint ? 1 + 0.4 * (h - 1) : h; }
function cnVisibility(s) { const v = s.verify; const insp = s.cn.deal && s.cn.deal.terms.inspect; return clamp((0.08 + 0.3 * (v.survey / 100) * trigMult(s) + (insp ? 0.25 * v.inspect / 100 : 0) + 0.35 * s.intelQ / 100) / concealment(s), 0, 0.92); }
// Chance a signed Phase 2 agreement hides a Chinese program you could not see: certain if cheating is under way now, otherwise falling with enforcement (half intelligence, half survey and inspections).
// The IC's confidence that an alert is real cheating: centered on the truth, blurred by weak intelligence.
function cheatConf(s, real) { const x = (real ? 0.72 : 0.28) + (hash01(s.seed, 'cheatconf', s.turn) - 0.5) * 1.3 * (1 - s.intelQ / 100); return x < 0.38 ? 'low' : x < 0.62 ? 'moderate' : 'high'; }
function enforcement(s) { const v = s.verify, insp = s.cn.deal && s.cn.deal.terms.inspect; return 0.5 * s.intelQ / 100 + 0.25 * Math.min(100, v.survey) / 100 + (insp ? 0.25 * Math.min(100, v.inspect) / 100 : 0); }
// The hidden-program risk your enforcement leaves, ignoring whether China is cheating right now; h is the concealment level (default: the truth).
function hiddenRisk(s, h) { return clamp(TUNE.betray * (TUNE.betrayAt - enforcement(s)) * concealment(s, h), 0.02, 0.8); }
function betrayP(s) { return s.cn.cheat ? 1 : hiddenRisk(s); }
// What you can know: the same risk, reading concealment off the Beijing tab
function betrayWord(s) { const p = hiddenRisk(s, cnReadout(s).seen.hide); return p < 0.08 ? 'high' : p < 0.25 ? 'moderate' : 'low'; }

// US drag: what our own moves cost American labs, as a fraction of their growth rate.
function usDrag(s) {
  const parts = [];
  if (SL[s.sl].drag) parts.push(['SL' + s.sl + ' security overhead', slDrag(s)]);
  if (s.done.control) parts.push(['AI control protocols', 0.05]);
  if (s.policies.distill) parts.push(['API know-your-customer friction', 0.015]);
  if (s.policies.methods) parts.push(['Research secrecy and visa screening', 0.015]);
  if (s.policies.remote) parts.push(['Lost foreign cloud revenue', 0.02]);
  if (s.policies.chips) parts.push(['Chip export revenue and supply friction', 0.03]);
  if (s.flags.minerals && s.flags.minerals.until >= s.turn) parts.push(['Beijing\u2019s mineral export curbs', s.flags.minerals.d]);
  if (s.flags.strait && s.flags.strait >= s.turn) parts.push(['Taiwan Strait disruption', 0.12]);
  if (s.flags.cables && s.flags.cables >= s.turn) parts.push(['Cut undersea cables to Taiwan', 0.05]);
  const shield = s.flags.shield ? 0.6 : 1;
  if (s.war) parts.push(['War: Taiwan\u2019s fabs are offline', 0.3 * shield]);
  else if (s.blockade) parts.push(['Quarantine of Taiwan: chip shipments stalled', 0.18 * shield]);
  else if (s.flags.rebuild && s.flags.rebuild >= s.turn) parts.push(['Rebuilding chip supply after the war', 0.1 * shield]);
  return { total: Math.min(s.war ? 0.6 : 0.45, parts.reduce((a, x) => a + x[1], 0)), parts };
}
function usRates(s, assumeCompliant) {
  // monthly capability growth for each lab under current policy; the public view assumes nobody is cheating
  return s.labs.map(l => {
    const d = LD(l.id);
    const drag = usDrag(s).total;
    if (!covered(s, l)) return d.speed * (s.policies.accelerate ? 1.15 : 1) * (1 - drag);
    if (l.defect && !assumeCompliant) return 0.7;
    if (l.secret && !assumeCompliant) return 0.12 + TUNE.secretRate; // a classified government run at a paused lab
    const th = thGrowth(s);
    const r = (th + (s.pacing.automation ? 0 : 0.28) + (l.id === 'mindscale' && s.flags.uaeOut ? TUNE.uaeRate : 0)) * (1 - drag / 2);
    return keepGap(s) ? Math.max(r, cnEstimate(s).rate) : r;
  });
}
function cnRate(s) {
  const c = s.cn, gap = lead(s);
  const p = paced(s);
  // metr_graph's split of China's pace, in US-pace units: own research 0.26, compute 0.15, distillation 0.27, leaked methods 0.22.
  // Compute is raised to 0.25 (own research down to 0.16) as a hedge: the split measures compute at its growth rate, not a sudden cut.
  // TUNE.cnCompW (0.4) is the slope on changes in compute; each game's starting pace stays at the 0.25 calibration (c.comp0 is compute at newGame).
  // Under a pause, as in metr_graph: distillation keeps copying the paused frontier, falling with the gap left (gap / gap at the pause);
  // leaked methods fade as China absorbs what already leaked, over a year. Copying shrinks when there is little left to copy.
  const gap0 = s.pacing.gap0 || Math.max(0.5, gap), pm = p ? Math.max(0, s.t - (s.pacing.since == null ? s.t : s.pacing.since)) : 0;
  const copy = (0.34 * c.dist * (p ? clamp(gap / gap0, 0, 1) : 1) + 0.22 * (c.leak == null ? 1 : c.leak) * (p ? Math.max(0, 1 - pm / 12) : 1)) * (gap > 0.5 ? 1 : 0.3);
  let r = (c.inno == null ? 0.16 : c.inno) + TUNE.cnCompW * cnComp(s) - (TUNE.cnCompW - 0.25) * (c.comp0 == null ? cnComp(s) : c.comp0) + copy;
  // game-balance choice, not an estimate: each channel a control has cut also slows China's own research (tools, cloud, talent), by up to TUNE.ctrlBite
  const b = cnBase(s), B = TUNE.ctrlBite;
  r *= 1 - (B.legal * (1 - c.legal) + B.remote * Math.max(0, 1 - c.remote / b.remote) + B.smuggle * Math.max(0, 1 - c.smuggle / b.smuggle) + B.dist * Math.max(0, 1 - c.dist / b.dist));
  if (c.deal && !c.cheat) r = Math.min(r, 0.12);
  if (c.deal && c.cheat) r = Math.min(r, 0.12) + 0.45;
  return r;
}
// The best openly downloadable model, in the same months as cap. Room under the threshold (none if unpaced) plus distilling the public frontier, which fades once there is little left to copy;
// US release limits (policies.openrule) cut both. Beijing publishing its own models (a diffusion posture) and the deal's ceiling (the lane term) are applied in tick.
function openFrontier(s) { return s.open == null ? s.cn.cap : s.open; }
function openRate(s) {
  const room = TUNE.openRoom[paced(s) ? s.pacing.threshold : 'none'] || TUNE.openRoom.none, gap = publicFrontier(s) - s.open;
  return (room + TUNE.openCopy * (gap > 0.5 ? 1 : 0.3)) * (s.policies.openrule ? 1 - TUNE.openRuleCut : 1);
}
function capOf(s, who) { return who === 'china' ? s.cn.cap : who === 'open' ? openFrontier(s) : L(s, who).cap; }
function whoName(s, who) { return who === 'china' ? 'a Chinese national-team lab' : who === 'open' ? 'an open-weight model' : LD(who).name; }
function frontierRate(s, pub) { const rs = usRates(s, pub); const fl = frontierLab(s); return rs[LIDX[fl.id]]; }

// Senate votes for a pacing statute (60 to pass), as labeled parts so the UI can show where they come from.
function senateParts(s) {
  const P_ = [['Base', TUNE.senateBase], ['Salience', 0.35 * s.salience], ['Markets', TUNE.mktSenate * (s.markets - 100)], ['Coalition of allies', 0.12 * s.coalition], ['Your work on the Hill', s.senateLobby]];
  if (s.cn.deal) P_.push(['A deal with Beijing in force', 6]);
  P_.push(['The US lead, as the IC reads it', 0.6 * clamp(seenLead(s) - 2, -3, 8)]);
  // offering a carrot costs votes from the day the package goes to Beijing, for 6 months or for as long as a deal holds it
  const offered = k => (s.cn.deal && s.cn.deal.terms[k]) || (s.flags[k + 'Offered'] != null && s.t - s.flags[k + 'Offered'] < 6);
  if (offered('chips')) P_.push([s.cn.deal && s.cn.deal.terms.chips ? 'Deal resumes chip sales' : 'You offered Beijing chips', -6]);
  if (offered('institute') && TUNE.inst.senate) P_.push([s.cn.deal && s.cn.deal.terms.institute ? 'Deal shares safety research with Beijing' : 'You offered Beijing a joint institute', -TUNE.inst.senate]);
  if (offered('relief')) P_.push([s.cn.deal && s.cn.deal.terms.relief ? 'Deal gives sanctions relief' : 'You offered Beijing sanctions relief', -3]);
  if (s.flags.senateFlipped) P_.push(['Opposition Senate holding AI hearings', TUNE.senateFlip]);
  if (s.war) P_.push(['Pausing AI in wartime looks like disarmament', -10]); else if (s.blockade) P_.push(['Beijing is blockading Taiwan', -5]);
  return P_;
}
function senateVotes(s) { return Math.round(clamp(senateParts(s).reduce((a, x) => a + x[1], 0), 0, 100)); }
function pauseMood(s) { // influence-weighted cabinet stance on pacing, -1..1
  let n = 0, d = 0;
  s.principals.forEach(p => { const def = PD(s, p.id); const x = def.prefs.pause + p.shift + def.sal * (s.salience - 35) / 40 + p.rel / 120; n += p.infl * Math.tanh(x / 1.6); d += p.infl; });
  return n / d;
}
// Pacing support in Phase 1, as labeled parts. Below 25 the pause wobbles; three months below 25, or any month below TUNE.supportBreak, and it breaks.
function supportParts(s) {
  const unsigned = s.labs.reduce((a, l) => a + (covered(s, l) ? (l.id === 'mindscale' && s.flags.uaeOut && TUNE.uaeSupport ? LD(l.id).share * TUNE.uaeShare : 0) : LD(l.id).share), 0);
  const ld = seenLead(s);
  const months = s.flags.monthsInP1 || 0;
  const P_ = [['Base', 30], ['Pause fatigue (' + months + ' months)', -(paced(s) ? 3.5 * Math.max(0, months - 1) : 0)], ['Salience', 0.35 * (s.salience - 30)], ['The cabinet\u2019s view of pacing', 30 * pauseMood(s)], ['Markets', TUNE.mktSupport * (s.markets - 100)]];
  if (s.cn.deal) P_.push(['China has signed on', 12]);
  else if (paced(s) && ld >= TUNE.aloneFloor - 0.5 && months > 1) P_.push(['The lead is holding', 1.75 * (months - 1)]); // halves the fatigue
  if (ld < 5) P_.push(['China is close behind (IC estimate)', -Math.min(18, 3.5 * (5 - ld))]);
  if (unsigned > 0) P_.push(['Labs racing outside the regime', -30 * unsigned]);
  if (s.open != null && paced(s) && publicFrontier(s) - s.open < TUNE.openNear) P_.push(['Open-weight models close behind the paused frontier', -4 * (TUNE.openNear - Math.max(0, publicFrontier(s) - s.open))]);
  if (s.flags.incidentTurn && s.turn - s.flags.incidentTurn <= 2) P_.push(['A recent scare', 8]);
  if (s.flags.wentFirst && !s.cn.deal) P_.push(['America went first, and China hasn\u2019t followed', -8]);
  if (s.flags.extended) P_.push(['The deadline was extended', -4 * s.flags.extended]);
  if (s.flags.outbreak && s.turn - s.flags.outbreak <= 6) P_.push(['After the outbreak', 15]);
  if (paced(s) && s.flags.medCarve) P_.push(['Medical research is carved out', 4]);
  if (tierSign(s, 'vp')) P_.push([isAlly(s, 'vp') ? 'The Vice President is selling the pause' : 'The Vice President is campaigning against the pause', 6 * tierSign(s, 'vp')]);
  if (paced(s) && (s.agents || 0) > 20) P_.push(['Sovereign agents run loose, and the pause doesn\u2019t touch them', -Math.min(8, (s.agents - 20) / 5)]);
  if (s.war) P_.push(['A war in the Pacific: the Pentagon wants every model', -15]); else if (s.blockade) P_.push(['Beijing is blockading Taiwan', -8]);
  return P_;
}
function pacingSupport(s) { return Math.round(clamp(supportParts(s).reduce((a, x) => a + x[1], 0))); }

/* ================= misuse: cyber, bio and sovereign agents ================= */
// What criminals and rogue agents can reach: the best open model (openFrontier once open weights are modeled, Beijing's frontier until then),
// or the US frontier two months back through jailbroken APIs, plus scaffolding that keeps improving even while training is paced.
function openCap(s) { return typeof openFrontier === 'function' ? openFrontier(s) : s.cn.cap; }
function misuseCap(s) { return Math.max(openCap(s), publicFrontier(s) - 2) + (s.elicit || 0); }
function misuseLevel(s) { return clamp(misuseCap(s) / s.T, 0, 1.5); }
// A deal with the joint misuse term: Beijing's clouds and labs join screening and takedowns.
function misusePact(s) { return !!(s.cn.deal && s.cn.deal.terms.misuse); }
// What the pact is worth to Beijing: more as open models get dangerous, with its science faction up and its security services (who use agents too) down, and after joint work on an incident.
function misusePactWorth(s) { return TUNE.pactWorth * (clamp(0.02 + 0.25 * misuseLevel(s), 0, 0.35) + 0.005 * (s.cn.f.sci - 20) - 0.004 * (s.cn.f.sec - 30) + (s.flags.misuseChannel ? 0.1 : 0)); }
// Sovereign agents scale the open-weight runaway hazard around a typical level (TUNE.agentBase), so openHaz keeps its meaning at the usual agent count.
function agentMult(s) { return Math.max(0.5, 1 + TUNE.agentOpen * ((s.agents || 0) - TUNE.agentBase) / 100); }
// Monthly odds of each kind of incident; defenses cut them.
function cyberP(s) { const m = misuseLevel(s); return TUNE.misuse * clamp((0.04 + 0.3 * m * m) * (s.policies.cyberdef ? 0.45 : 1) * (s.flags.dodCyber ? 0.85 : 1) * (s.war ? 1.5 : 1) * (misusePact(s) ? 0.8 : 1), 0, 0.45); }
function bioP(s) { const m = misuseLevel(s); return m < 0.45 ? 0 : TUNE.misuse * clamp(0.16 * (m - 0.45) / 0.55, 0, 0.18) * (s.policies.synth ? 0.6 : 1) * (misusePact(s) ? 0.5 : 1); }
// Sovereign agents: self-funding AI agents with no human principal, 0-100. They spread with open capability, and compute KYC slows them.
function agentGrowth(s) { const m = misuseLevel(s); return TUNE.agents * 6 * Math.max(0, m - 0.3) * (s.policies.kyc ? 0.3 : 1) * (s.flags.openExempt ? 1.3 : 1) * (misusePact(s) ? TUNE.pactAgent : 1); }
function agentsP(s) { return clamp(0.02 + (s.agents || 0) / 250, 0, 0.3); }
// Where the forensics point: a Chinese open-weight model when open capability is near the US frontier, else a jailbroken US API.
function misuseSource(s) { return openCap(s) >= publicFrontier(s) - 2.5 ? 'cn' : 'us'; }
function misuseWord(p) { return p < 0.05 ? 'rare' : p < 0.12 ? 'occasional' : p < 0.25 ? 'frequent' : 'constant'; }
// Headlines as deployed and open capability climb: text only, one a month at most.
const NEWS_US = [
  [0.1, 'A mid-size insurer tells investors a Mindscale agent now does most of its back-office work. The stock jumps 9%.'],
  [0.2, 'A Prometheus agent works a month as a remote contractor for three companies, and all three ask to renew. One didn’t know it was an AI.'],
  [0.3, 'At two big software firms, agents now merge more code than the engineers do. Both freeze hiring outright.'],
  [0.4, 'A Mindscale agent starts, runs and sells a small software business in six weeks. The buyer is another company’s agent.'],
  [0.5, 'The labs report models doing a week of a senior engineer’s work in a day. Their own hiring plans go flat.'],
  [0.6, 'A frontier model finds 40 zero-days in widely used open-source software during a single red-team run.'],
  [0.7, 'Prometheus says most of the code in its next model was written by its current one.'],
  [0.8, 'Researchers at both labs now mostly review and approve experiments their models design.'],
  [0.9, 'Engineers at both labs describe their jobs as managing model researchers they can no longer fully check.'],
  [1.0, 'Internal evals show models improving their own training methods faster than any human team.'],
];
const NEWS_OPEN = [
  [0.15, 'Lunar AI’s newest open-weight model tops the download charts on Tensorhub. It runs on a gaming PC.'],
  [0.35, 'An open-weight Chinese model matches last year’s US frontier on coding. Fine-tunes with the safety training stripped out appear within 48 hours.'],
  [0.55, 'Deep Current open-sources an agent model that can run a computer for hours unattended. Within a week it is the favorite base for scam call centers.'],
  [0.75, 'A Chinese open-weight model passes the virology troubleshooting benchmark that US labs treat as a red line. Two million downloads in a day.'],
];
// The cabinet acts on its own: an Ally pushes your agenda, a Cool or Hostile principal works against it. At most one move a month.
const INITIATIVES = {
  vp:  { help: ['The Vice President tells a union convention the White House “will not let Big Tech gamble with your kids.”', s => { s.salience += 3; P(s, 'vp').shift += 0.05; }],
         hurt: ['The Vice President tells a cable host that “some people in this building would hand Silicon Valley’s homework to Beijing.”', s => { s.cred -= 2; }] },
  cos: { help: ['The Chief of Staff clears an hour on the President’s calendar for your issue, and spends some capital doing it.', s => { s.pc += 1; }],
         hurt: ['The Chief of Staff bumps your Oval slot for a farm-bill photo op.', s => { s.pc = Math.max(0, s.pc - 1); }] },
  tsy: { help: ['The Treasury Secretary tells CNBC the administration “has a plan for AI and a plan for markets.”', s => { s.markets += 2; }],
         hurt: ['Treasury briefs reporters that your ideas would “cost the S&P a trillion dollars.”', s => { s.markets -= 2; s.cred -= 1; }] },
  doc: { help: ['Commerce quietly closes three export-license loopholes you flagged.', s => { s.cn.smuggleT = Math.max(0, s.cn.smuggleT - 0.03); }],
         hurt: ['Commerce slips your draft thresholds to the labs’ lawyers, who start working the Hill.', s => { s.senateLobby -= 2; }] },
  sec: { help: ['The Secretary of State raises compute verification with Tokyo and Seoul, unprompted.', s => { s.coalition += 3; }],
         hurt: ['State drops you from the distribution list for the Beijing channel.', s => { s.intelQ -= 3; }] },
  war: { help: ['The Secretary of War sends Cyber Command teams to harden two labs’ networks.', s => { if (!s.flags.dodCyber) s.flags.dodCyber = true; else s.intelQ += 2; }],
         hurt: ['The Secretary of War tells a defense conference that “the pause crowd” is a national security risk.', s => { s.cred -= 2; }] },
  dni: { help: ['The DNI sends you an early cut of a new assessment on Beijing.', s => { s.intelQ += 2; s.flags.assessUntil = Math.max(s.flags.assessUntil || 0, s.turn + 2); }],
         hurt: ['The DNI stops sending analysts to your verification meetings.', s => { s.verify.survey -= 3; }] },
};
function cabinetMoves(s) {
  const odds = p => { const t = relTier(p.rel), w = p.infl / 60; return (p.rel > 0 ? TUNE.cabOdds : TUNE.cabHurt) * (t === 'Ally' || t === 'Hostile' ? 0.08 * w : t === 'Friendly' || t === 'Cool' ? 0.03 * w : 0); };
  for (const p of s.principals) {
    if (rnd(s) >= odds(p)) continue;
    const m = INITIATIVES[p.id][p.rel > 0 ? 'help' : 'hurt'];
    m[1](s); log(s, m[0], p.rel > 0 ? 'good' : 'bad'); return;
  }
}
function misuseTick(s) {
  s.elicit = (s.elicit || 0) + 0.15;
  s.agents = clamp((s.agents || 0) * (misusePact(s) ? 0.92 : 0.97) + agentGrowth(s));
  s.markets -= (s.agents || 0) / 80;
  const us = (publicFrontier(s) + s.elicit) / s.T, op = (openCap(s) + s.elicit) / s.T, seen = s.flags.news = s.flags.news || {};
  const due = NEWS_US.map((x, i) => [x, 'u' + i, us]).concat(NEWS_OPEN.map((x, i) => [x, 'o' + i, op])).find(n => n[2] >= n[0][0] && !seen[n[1]]);
  if (due) { seen[due[1]] = true; log(s, due[0][1], 'info'); }
}
// Relationship tiers. Each point also moves that principal's vote on every Oval decision.
// What each principal does for you as an Ally (40+) and against you when Hostile (-40 or less), on top of their vote.
const TIER_FX = {
  vp:  ['Sells the pause on the road: pacing support +6.', 'Campaigns against the pause: pacing support -6.'],
  cos: ['Finds you time with the President: +1 Oval decision a turn.', 'Keeps you off the calendar: -1 Oval decision a turn.'],
  tsy: ['Talks the markets down from every scare: markets +0.6 a month.', 'Talks your policies down to the markets: markets -0.6 a month.'],
  doc: ['Runs licensing in good faith (licensed labs comply more) and closes smuggling routes.', 'Leaks your plans to the labs and slow-walks licensing.'],
  sec: ['Carries your offers in Beijing: China likelier to accept a deal.', 'Undercuts your offers in Beijing: China less likely to accept a deal.'],
  war: ['Keeps the Pentagon calm: Beijing temperature -0.5 a month.', 'Rattles sabres you have to answer for: Beijing temperature +0.5 a month.'],
  dni: ['Reads you in: intelligence quality +1 a month.', 'Cuts you out: intelligence quality -1 a month.'],
};
const isAlly = (s, id) => P(s, id).rel >= 40, isHostile = (s, id) => P(s, id).rel <= -40;
const tierSign = (s, id) => isAlly(s, id) ? 1 : isHostile(s, id) ? -1 : 0;
function tierTick(s) {
  s.markets += 0.6 * tierSign(s, 'tsy');
  s.tension -= 0.5 * tierSign(s, 'war');
  s.intelQ += tierSign(s, 'dni');
  if (isAlly(s, 'doc')) s.cn.smuggleT = Math.max(0, s.cn.smuggleT - 0.01);
}
function relTier(r) { return r >= 40 ? 'Ally' : r >= 15 ? 'Friendly' : r > -15 ? 'Neutral' : r > -40 ? 'Cool' : 'Hostile'; }
// Hostile principals undercut you with the President: 2 credibility a month at influence 60, scaled by influence, at most 3 in total.
function hostileDrain(s) { return Math.min(3, s.principals.reduce((a, p) => a + (p.rel <= -40 ? 2 * p.infl / 60 : 0), 0)); }
function allyCount(s) { return s.principals.filter(p => p.rel >= 40).length; }
// Capital income per turn. Markets add or subtract 1 per TUNE.mktCap points from 100; fractions carry over between turns.
function marketCapital(s) { return (s.markets - 100) / TUNE.mktCap; }
function capitalIncome(s) { return (s.phase === 'scramble' ? 2 : (s.phase === 'p1' ? 2 : 1) + Math.floor(s.cred / 35)) + Math.floor(allyCount(s) / 3) + marketCapital(s) + (s.war && s.war.months < 3 ? 1 : 0); }
// Per-month probability that something escapes control, for each actor. The threshold is fuzzy: danger rises
// smoothly with capability (about 10% of full strength 3 months short, 75% at the threshold, nearly full past it).
function nearness(s, cap) { return logistic((cap - s.T + 1) / 0.9); }
function hazards(s) {
  const out = [];
  s.labs.forEach(l => {
    const d = LD(l.id);
    let h;
    if (!covered(s, l)) h = 0.30; else if (l.secret) h = 0.30; else if (l.defect) h = 0.15; else h = (s.pacing.automation ? 0.02 : 0.10) * clamp(thGrowth(s) / 0.12, 1, TUNE.growRisk); // a threshold that lets labs keep training big runs keeps their risk, up to TUNE.growRisk times
    if (s.done.control && (covered(s, l) || d.safety >= 50)) h *= 0.6;
    if (s.flags.dodCarve) h += 0.01;
    if (l.id === 'mindscale' && s.flags.uaeOut && covered(s, l) && TUNE.uaeHazard) h = (1 - TUNE.uaeShare) * h + TUNE.uaeShare * 0.30; // the UAE share trains unconstrained
    h *= nearness(s, l.cap);
    if (h > 0.002) out.push({ who: l.id, name: d.name, h, near: l.cap < s.T });
  });
  const hc = (s.cn.deal && !s.cn.cheat ? 0.02 : 0.15) * nearness(s, s.cn.cap);
  if (hc > 0.002) out.push({ who: 'china', name: 'China', h: hc, near: s.cn.cap < s.T });
  // sovereign agents run on open weights: the more entrenched they are than usual, the likelier an open model gets loose
  const ho = s.open == null ? 0 : TUNE.openHaz * nearness(s, s.open) * agentMult(s);
  if (ho > 0.002) out.push({ who: 'open', name: 'Open-weight models', h: ho, near: s.open < s.T });
  return out;
}
// When something escapes, the chance it is caught in time: likelier early on the curve.
function warningShotP(s, who) { const cap = capOf(s, who); return 0.15 + 0.6 * (1 - nearness(s, cap)); }
// Weight theft: Beijing attempts more when racing, when the US is paced, and when far behind; success depends on weight security.
// pub: the player's view, which reads the ramp off the IC's threshold estimate so the theft-risk word doesn't leak the true threshold
function theftRisk(s, pub) {
  const c = s.cn, F = frontier(s);
  const T = pub ? Math.max(0.5, F + icEstimate(s).mid * Math.max(0.05, frontierRate(s, true))) : s.T;
  // attempts ramp as the US frontier nears the RSI threshold: x0.5 at the start, x1 a bit past halfway, x2 at the threshold; a deal holds them at the base rate
  const x = clamp(F / T, 0, 1.2), ramp = c.deal ? Math.min(1, 0.5 + 1.5 * x * x) : 0.5 + 1.5 * x * x;
  const cyber = pub ? cnReadout(s).seen.cyber : (c.cyber || 1);
  const attempt = TUNE.theftBase * ramp * cyber * DIFFS[s.diff].theft * (c.posture === 'race' ? 2.2 : 1) * (paced(s) ? 1.3 : 1) * (TUNE.theftLeadSlope ? clamp(TUNE.theftLeadBase + TUNE.theftLeadSlope * lead(s), TUNE.theftLeadBase, TUNE.theftLeadMax) : lead(s) > 6 ? 1.3 : 1) * (s.war ? 1.8 : 1) * (!pub && c.deal && c.cheat ? TUNE.cheatSteal : 1) * lean(s, TUNE.theftResolve) * emboldened(s);
  const success = SL[s.sl].theft;
  return { attempt, success, net: attempt * success };
}
function monthlyRisk(s) { return 1 - hazards(s).reduce((a, x) => a * (1 - x.h), 1); }

// The Strait: Beijing's monthly chance of starting a crisis over Taiwan (a quarantine first), as labeled parts. It rises with temperature,
// a racing posture, and a big US lead near the threshold that no pause holds back (a preventive move). pub: the player's view, as in theftRisk.
function straitParts(s, pub) {
  const F = frontier(s), ld = pub ? leadEstimate(s).mid : lead(s);
  const T = pub ? Math.max(0.5, F + icEstimate(s).mid * Math.max(0.05, frontierRate(s, true))) : s.T;
  const x = clamp(F / T, 0, 1.2);
  const P_ = [['Background risk', TUNE.straitBase]];
  if (s.tension > TUNE.straitHotFrom) P_.push(['Beijing temperature', TUNE.straitHot * Math.pow((s.tension - TUNE.straitHotFrom) / 40, 2)]);
  if (s.cn.posture === 'race') P_.push(['Beijing is racing', 0.012]);
  const pre = TUNE.straitPre * clamp((ld - 3) / 6, 0, 1) * Math.pow(x, 3) * (paced(s) ? 0.35 : 1) * (reassured(s) ? 1 - TUNE.reassureCut * reassureCred(s) * reassureFrom(s) : 1);
  if (pre > 0.0005) P_.push([paced(s) ? 'A big US lead near the threshold, even paced' : 'A big US lead racing toward the threshold', pre]);
  return P_;
}
// The Security faction scales it (x1 at its usual 30), and a deal cuts it 70%.
function straitMult(s) { return (0.6 + s.cn.f.sec / 75) * (s.cn.deal ? 0.3 : 1) * lean(s, TUNE.warResolve) * emboldened(s) * TUNE.strait; }
function straitRisk(s, pub) { return clamp(straitParts(s, pub).reduce((a, x) => a + x[1], 0) * straitMult(s), 0, 0.5); }
// A quarantine turns into war each month with this chance: hotter Beijing, convoys and no talks push it up.
function escalateP(s) { const b = s.blockade; return clamp((0.18 + 0.12 * clamp((s.tension - 50) / 40, 0, 1)) * (b.mode === 'convoy' ? 1.8 : b.mode === 'talks' ? 0.6 : 1) * lean(s, TUNE.warResolve) * TUNE.strait, 0, 0.6); }
// The share of crises where Beijing skips the quarantine and goes straight to war: more when hot, most when the motive is preventive.
function directP(s) { const parts = straitParts(s), tot = parts.reduce((a, x) => a + x[1], 0) || 1, pre = (parts.find(x => /US lead/.test(x[0])) || [0, 0])[1] / tot; return clamp(0.3 + 0.4 * clamp((s.tension - 50) / 40, 0, 1) + 0.4 * pre, 0, 0.9); }
// Beijing's chance of taking a ceasefire offer: war weariness, its market and science factions, earlier talks; escalation hardens it.
function ceasefireP(s) { const w = s.war, f = s.cn.f; return w ? clamp(0.12 + 0.05 * w.months + 0.004 * (f.sci + f.m - f.sec) + 0.08 * w.talks - 0.002 * w.esc, 0.05, 0.85) : 0; }
// The IC's read on the Strait: during a quarantine, the chance it turns into war within 3 months; otherwise the chance Beijing starts a crisis
// within 6. Blurred by weak intelligence (an IC assessment counts +20): a word under 45, a range under 70, a number above.
function straitEstimate(s) {
  const q = s.intelQ + (s.flags.assessUntil >= s.turn ? 20 : 0), tier = q < 45 ? 0 : q < 70 ? 1 : 2;
  const months = s.blockade ? 3 : 6, m = s.war ? 0 : s.blockade ? escalateP(s) : straitRisk(s, true);
  const rel = 0.1 + 0.9 * (1 - clamp(q) / 100), b = (hash01(s.seed, s.turn, 'strait') - 0.5) * 2 * rel;
  const over = x => 1 - Math.pow(1 - clamp(x, 0, 0.6), months);
  const mid = over(m * (1 + b)), lo = over(m * Math.max(0, 1 + b - rel)), hi = over(m * (1 + b + rel));
  const P = x => Math.round(100 * x), word = mid < 0.05 ? 'low' : mid < 0.15 ? 'moderate' : mid < 0.35 ? 'high' : 'very high';
  const text = tier === 0 ? word : tier === 1 ? `${Math.floor(P(lo) / 5) * 5}–${Math.ceil(P(hi) / 5) * 5}%` : `~${P(mid)}%`;
  return { mid, lo, hi, tier, word, text, months, what: s.blockade ? 'war' : 'crisis' };
}
function startBlockade(s) {
  s.blockade = { since: s.turn, mode: null, until: null };
  s.stats.blockades = (s.stats.blockades || 0) + 1;
  s.cn.supply = Math.min(s.cn.supply == null ? 1 : s.cn.supply, 0.6); s.markets -= 10; s.tension += 10; s.salience += 4; infl(s, 'war', 4); infl(s, 'sec', 3);
  log(s, 'Beijing has put Taiwan under quarantine.', 'bad');
  s.queue.unshift({ id: 'blockade' });
}
function endBlockade(s, text) { s.blockade = null; s.tension -= 8; s.markets += 5; s.flags.rebuild = s.turn + 2; log(s, text, 'cn'); }
// War is a phase, not an ending: an escalation meter (100 ends the game) runs until a ceasefire.
function startWar(s, cause, esc) {
  const c = s.cn;
  s.blockade = null;
  // lead0 and hadDeal feed the phase plate's running tally (IC view); warT0, warLead0 and warDealLost feed the ending's lessons
  s.war = { since: s.turn, months: 0, esc, cause, talks: 0, lead0: seenLead(s), hadDeal: !!c.deal };
  s.stats.wars = (s.stats.wars || 0) + 1;
  if (s.stats.warT0 == null) { s.stats.warT0 = s.t; s.stats.warLead0 = lead(s); s.stats.warDealLost = !!c.deal; }
  c.supply = 0.2; s.markets -= 20; s.tension = Math.max(s.tension, 85); c.trust -= 20; s.salience -= 6;
  infl(s, 'war', 10); infl(s, 'sec', 5); infl(s, 'tsy', -5); shiftCN(s, { sec: 15, sci: -5 });
  if (c.deal) { c.deal = null; log(s, 'The China deal collapses with the war.', 'bad'); }
  log(s, 'War in the Taiwan Strait.', 'bad');
  s.queue.unshift({ id: 'war_begins', cause });
}
function endWar(s, text) {
  s.war = null; s.stats.ceasefires = (s.stats.ceasefires || 0) + 1;
  s.tension = Math.min(s.tension, 70); s.markets += 8; s.cn.supply = 0.5; s.flags.rebuild = s.turn + 4;
  log(s, text, 'good');
}

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
  const F = publicFrontier(s), rate = Math.max(0.05, frontierRate(s, true));
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
  const noise = key => ((cnHash(s, key, k) * (1 - fr) + cnHash(s, key, k + 1) * fr) - 0.5) * 2 * rel;
  const src = cnSources(c);
  for (const key in src) src[key] = Math.max(0, src[key] * (1 + noise(key)));
  const comp = cnComp(s) * (1 + noise('comp')), sum = Object.values(src).reduce((a, x) => a + x, 0) || 1;
  for (const key in src) src[key] *= comp / sum;
  return { comp, src, dist: clamp(c.dist + noise('dist') * 0.6, 0, 1), rate: Math.max(0, (cnRate(s) - (s.cn.deal && s.cn.cheat ? 0.45 : 0)) * (1 + noise('rate'))), rel, // cheating under a deal is hidden
    cyber: Math.max(0.2, (c.cyber || 1) * (1 + noise('cyber'))), hide: Math.max(0.2, (c.hide || 1) * (1 + noise('hide'))) };
}
// hash01(seed, 'cn' + key, k), cached per game: the readout asks for the same draws many times a turn.
const CN_HASH = new WeakMap();
function cnHash(s, key, k) { let c = CN_HASH.get(s); if (!c || c.seed !== s.seed) { c = { seed: s.seed }; CN_HASH.set(s, c); } const id = key + '|' + k; const v = c[id]; return v !== undefined ? v : (c[id] = hash01(s.seed, 'cn' + key, k)); }
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
  // Beijing's cyber push against US labs and how well it hides sites, as words; better intelligence makes the word more accurate. Bots read a word as its bucket's middle.
  const mult = (x, cuts, words, mids) => ({ text: words[cuts.findIndex(c => x < c) < 0 ? cuts.length : cuts.findIndex(c => x < c)], seen: bucket(x, cuts, mids) });
  const cy = mult(e.cyber, [0.8, 1.25], ['restrained', 'typical', 'aggressive'], [0.65, 1, 1.5]), hd = mult(e.hide, [0.8, 1.2], ['sloppy', 'typical', 'careful'], [0.65, 1, 1.35]);
  seen.cyber = cy.seen; seen.hide = hd.seen;
  return {
    tier, src, est: e, seen, cyber: cy.text, hide: hd.text,
    comp: fmt(e.comp, e.rel * e.comp, compWord, undefined, ' of baseline'), dist: fmt(e.dist, 0.6 * e.rel, distWord, 100),
    rate: tier === 0 ? (rr > 1.15 ? 'faster than the US' : rr > 0.85 ? 'about the US pace' : 'slower than the US') : tier === 1 ? `${(Math.round(e.rate * (1 - e.rel) * 10) / 10).toFixed(1)}–${(Math.round(e.rate * (1 + e.rel) * 10) / 10).toFixed(1)} mo/mo` : `~${(Math.round(e.rate * 10) / 10).toFixed(1)} mo/mo`,
    note: ['Patchy intelligence: the IC can only characterize these.', 'Decent intelligence: the IC gives ranges.', 'Sharp intelligence: the IC gives point estimates.'][tier],
  };
}
function leadEstimate(s) {
  const err = 0.3 + 2.4 * (1 - s.intelQ / 100);
  const k = Math.floor(s.turn / 3), fr = (s.turn % 3) / 3;
  const bias = ((hash01(s.seed, 'lead', k) * (1 - fr) + hash01(s.seed, 'lead', k + 1) * fr) - 0.5) * 2 * err;
  return { mid: publicFrontier(s) - (s.cn.cap - (s.cn.hidden || 0)) + bias, err }; // neither side's hidden cheating shows
}
// Months until China passes the US frontier at today's rates, as Beijing sees it (true gap); Infinity if it isn't closing.
function cnCatchUp(s) { const gap = lead(s), dr = cnRate(s) - frontierRate(s); return gap <= 0 ? 0 : dr <= 0.01 ? Infinity : gap / dr; }
// The same projection as the player can make it: the IC's gap over the IC's estimate of China's pace against the public US pace.
function crossoverMonths(s) { const gap = seenLead(s), dr = cnEstimate(s).rate - frontierRate(s, true); return gap <= 0 ? 0 : dr <= 0.01 ? Infinity : gap / dr; }

/* ================= new game ================= */
function newGame(opts) {
  opts = opts || {};
  const seed = (opts.seed != null ? opts.seed : Math.floor(Math.random() * 2147483647)) | 0;
  const dk = DIFFS[opts.difficulty] ? opts.difficulty : 'advisor';
  const D = DIFFS[dk];
  const s = {
    v: 1, seed, rs: seed, diff: dk, t: START_T, turn: 1, phase: 'p0',
    ap: D.ap + TUNE.p0Ap, apMax: D.ap, pc: 4, cred: D.cred, alarm: 8, salience: 28, markets: 100, tension: D.tension, coalition: 30,
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
  s.T = clamp(D.Tmed * Math.exp(0.4 * TUNE.spread * gauss(s)), 6.5, 22);
  // hidden per-game miscalibration: each indicator's marker sits somewhat off the true threshold, and the IC has a standing bias
  const sd = 0.15 * TUNE.spread;
  s.cal = { uplift: clamp(sd * gauss(s), -0.3, 0.3), cobench: clamp(sd * gauss(s), -0.3, 0.3), horizon: clamp(sd * gauss(s), -0.3, 0.3), arr: clamp(sd * gauss(s), -0.3, 0.3) };
  s.icBias = clamp(2.2 * TUNE.spread * gauss(s), -4.5, 4.5);
  cnStart(s); s.cn.comp0 = cnComp(s);
  s.open = TUNE.open ? s.cn.cap - TUNE.openLag : null;
  if (dk === 'excomm') shiftCN(s, { m: -5, sec: 7, sci: -2 });
  recordIndicators(s); pushHist(s);
  log(s, 'You start as the White House AI Czar. Your office is in the EEOB, Room 374. Your team is you.', 'info');
  s.queue.push({ id: 'intro' });
  return s;
}
// Hidden per-game starting point for China's lag, offshore compute, smuggling and distillation (1 = baseline). Smuggling is log-uniform 0.4-2.4x, skewed like IFP's range. Drawn from hash01 so the main random stream is untouched.
// TUNE.spread pulls every draw toward its median (each uniform toward 0.5, each normal's s.d. scaled); 1 is the full range.
function cnStart(s) {
  const c = s.cn, f = TUNE.spread, h = k => hash01(s.seed, 'cnstart', k), u = k => f === 1 ? h(k) : 0.5 + f * (h(k) - 0.5);
  c.base = { remote: 0.5 + u('remote'), smuggle: 0.4 * Math.pow(6, u('smuggle')), dist: 0.6 + 0.4 * u('dist') };
  // starting lag: lognormal, median 6 months (80% range ~4.1-8.8), around metr_graph's 4.4-6.5 months
  const z = Math.sqrt(-2 * Math.log(Math.max(1e-9, h('lag1')))) * Math.cos(2 * Math.PI * h('lag2'));
  c.cap = -clamp(6 * Math.exp(0.3 * f * z), 3.5, 11); s.stats.peakLead = -c.cap;
  // own research: lognormal around 0.16, 80% range ~0.07-0.35, inside metr_graph's 0.05-0.48 band for China's pure innovation
  const z2 = Math.sqrt(-2 * Math.log(Math.max(1e-9, h('inno1')))) * Math.cos(2 * Math.PI * h('inno2'));
  c.inno = clamp(0.16 * Math.exp(0.6 * f * z2), 0.04, 0.5);
  c.remote = c.remoteT = c.base.remote; c.smuggle = c.smuggleT = c.base.smuggle; c.dist = c.distT = c.base.dist;
  // multipliers on typical: how hostile the courts are (0.5-1.5x), Beijing's cyber push against US labs (log-uniform 0.5-1.8x), how well it hides sites (0.5-1.5x)
  s.courts = 0.5 + u('courts'); c.cyber = 0.4 * Math.pow(2.5 / 0.4, u('cyber')); c.hide = 0.5 + u('hide');
  // visible from day one: who has the floor in Beijing, and how warm each lab starts (±15 around its usual)
  const sci = 12 + 18 * u('sci'), sec = 22 + 18 * u('sec'); c.f = { m: 100 - sci - sec, sec, sci };
  s.labs.forEach(l => { l.rel = LD(l.id).rel0 + Math.round(30 * (u('rel' + l.id) - 0.5)); });
}
// Timers count ticks: a month each, two days during the scramble.
function span(s, n) { return s.phase === 'scramble' ? (2 * n) + ' days' : n + ' month' + (n === 1 ? '' : 's'); }
// The White House counsel's read on the courts, as a word; the legal authorities study makes it far more accurate. Bots read a word as its bucket's middle.
function courtRead(s) {
  const err = s.done.legal ? 0.08 : 0.3, est = Math.max(0.3, (s.courts || 1) * (1 + (hash01(s.seed, 'courts', Math.floor(s.turn / 3)) - 0.5) * 2 * err));
  const i = est < 0.8 ? 0 : est < 1.2 ? 1 : 2, word = ['friendly', 'mixed', 'hostile'][i];
  return { word, text: word, seen: s.done.legal ? est : [0.65, 1, 1.35][i] };
}
const cnBase = s => s.cn.base || { remote: 1, smuggle: 1, dist: 1 };
function pushHist(s) { s.hist.push({ t: s.t, F: publicFrontier(s), cn: s.cn.cap, cnEst: leadEstimate(s).mid, labs: s.labs.map(knownCap), paced: paced(s), phase: s.phase, salience: s.salience, tension: s.tension, markets: s.markets }); }

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
  const hawk = TUNE.hawkBase + TUNE.hawkProvoke * Math.min(3, s.provoked || 0) + (s.cn.posture === 'race' ? TUNE.hawkRace : 0) + (s.war ? 0.15 : s.blockade ? 0.08 : 0);
  let b = 0.06 * (tags.control || 0) + hawk * (tags.hawk || 0) + 0.03 * (tags.military || 0);
  if (tags.deal) b += 0.05 * tags.deal * (seenLead(s) > 3 ? 1 : -1);
  b += (0.02 + TUNE.mktPres * Math.max(0, 100 - s.markets)) * (tags.markets || 0); // the worse the markets, the more the President weighs market costs
  return b;
}
// Oval decisions a turn: one a month in Phase 0 (so two in its two-month turns), two in the scramble and Phase 1; an Ally Chief of Staff adds one.
function roomMax(s) { if (s.phase === 'scramble') return 2; return (s.phase === 'p0' ? TUNE.slowMonths : 2) + tierSign(s, 'cos'); }
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
    positions.push({ id: p.id, name: PD(s, p.id).name, title: PD(s, p.id).title, stance: st, band, infl: p.infl, quote: roomQuote(s, p, band, tags, key) });
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
  id: 'proj_' + pr.id, cat: 'prep', name: pr.name, phases: pr.p1 === false ? ['p0'] : ['p0', 'p1'], ap: 1, pc: pr.pc || 0, project: pr.id,
  desc: pr.desc, effect: () => pr.done,
  avail(s) { if (s.done[pr.id]) return 'Done'; if (pr.avail) { const r = pr.avail(s); if (r !== true) return r; } if (pr.id === 'sl4' && !s.policies.sl4) return 'Needs the SL4 executive order first'; if (pr.id === 'sl5' && s.sl < 4) return 'Needs SL4 implemented first'; return true; },
  apply(s) {
    s.projects[pr.id] = (s.projects[pr.id] || 0) + 1;
    if (s.projects[pr.id] >= pr.need) { s.done[pr.id] = true; if (pr.fx) pr.fx(s); log(s, 'Completed: ' + pr.name + '. ' + pr.done, 'good'); return 'Done. ' + pr.done; }
    return 'Progress ' + s.projects[pr.id] + ' of ' + pr.need + '.';
  },
}));

def({ id: 'meet', cat: 'politics', name: 'Meet one-on-one', phases: ['p0', 'scramble', 'p1'], ap: 1, pc: 0,
  params: { kind: 'principal' },
  desc: 'An hour in their office. Builds the relationship and moves their view on pacing a little.',
  effect: (s, prm) => 'Relationship +' + TUNE.meetBase + '; their stance on pacing shifts toward yours.' + (prm && prm.who && meetMult(s, prm.who) < 1 ? ' You met recently, so this one does ' + Math.round(100 * meetMult(s, prm.who)) + '% as much.' : ''),
  avail(s, prm) { if (prm && prm.who && s.flags['met_' + prm.who] === s.turn) return 'Already met this turn'; return true; },
  apply(s, prm) {
    const p = P(s, prm.who); const d = PD(s, prm.who); const per = d.persuade || 1;
    // back-to-back meetings (within two months) with the same person each do 60% of the last
    p.streak = p.lastMet != null && s.turn - p.lastMet <= 2 ? (p.streak || 0) + 1 : 0; p.lastMet = s.turn;
    const m = Math.pow(TUNE.meetDecay, p.streak);
    rel(s, prm.who, (TUNE.meetBase + (s.cred > 60 ? 3 : 0)) * (0.4 + 0.6 * per) * m); rivalHit(s, prm.who, 2); p.shift = Math.min(1.4, p.shift + (0.12 + 0.1 * Math.max(0, (s.salience - 30) / 50)) * per * m); s.flags['met_' + prm.who] = s.turn;
    return 'The ' + d.name + ' gives you the hour. ' + (p.streak ? pick(s, ['You have been here a lot lately. They mostly repeat themselves.', 'They check their phone twice.']) : pick(s, ['They listen more than you expected.', 'They push back hard, then ask good questions.', 'You leave with a promise to keep talking.'].concat(p.alt ? [] : MEET[prm.who])));
  },
});
function meetMult(s, who) { const p = P(s, who); return p.lastMet != null && s.turn - p.lastMet <= 2 ? Math.pow(TUNE.meetDecay, (p.streak || 0) + 1) : 1; }
// Favors granted in the last four months, each of which makes the next one cost credibility.
function recentFavors(s) { return (s.flags.favorTurns || []).filter(t => t > s.turn - 4).length; }
def({ id: 'favor', cat: 'politics', name: 'Grant a favor', phases: ['p0', 'scramble', 'p1'], ap: 1, pc: 0,
  params: { kind: 'principal' },
  desc: 'Give a principal what they have been asking for. Big gain with them; often costs you elsewhere.',
  effect: (s, prm) => (prm && prm.who ? ('They want: ' + currentAsk(s, prm.who).text) : 'Each principal has a current ask, shown on their card.') + (recentFavors(s) ? ' Credibility -' + TUNE.favorCred * recentFavors(s) + ': the cabinet sees you trading favors.' : ''),
  cost(s, prm) { return { ap: 1, pc: prm && prm.who ? currentAsk(s, prm.who).pc : 0 }; },
  avail(s, prm) { if (prm && prm.who) { const a = currentAsk(s, prm.who); if (a.avail && !a.avail(s)) return 'No longer possible'; } return true; },
  apply(s, prm) { const i = askIdx(s, prm.who), a = ASKS[prm.who][i]; const txt = a.fx(s); const n = recentFavors(s); s.cred -= TUNE.favorCred * n; s.flags.favorTurns = (s.flags.favorTurns || []).filter(t => t > s.turn - 4).concat([s.turn]); rel(s, prm.who, 25); infl(s, prm.who, 4); rivalHit(s, prm.who, 6); const p = P(s, prm.who); p.ask = (i + 1) % ASKS[prm.who].length; p.askAge = 0; return txt + ' ' + PD(s, prm.who).name + ' will remember this.'; },
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

function hillGain(s) { return 5 * (s.flags.senateFlipped ? TUNE.flipHill : 1); }
def({ id: 'hill', cat: 'politics', name: 'Work the Hill', phases: ['p0', 'scramble', 'p1'], ap: 1, pc: 1,
  avail(s) { return s.flags.statute ? 'Pacing is already law' : s.senateLobby >= TUNE.hillCap ? 'You have done all the Hill work you can' : true; },
  desc: 'Classified briefings for committee chairs, favors for leadership, cosponsors lined up. Builds the votes a pacing statute needs.',
  effect: s => 'Senate +' + hillGain(s) + (s.flags.senateFlipped ? ' (the opposition Senate discounts your work)' : '') + '.',
  apply(s) { s.senateLobby = Math.min(TUNE.hillCap, s.senateLobby + hillGain(s)); return pick(s, ['The Armed Services chair asks for the classified annex.', 'Two Commerce Committee Republicans agree to cosponsor.', 'Leadership wants a bill it can pass before recess.']); },
});
def({ id: 'authorize', cat: 'politics', name: 'Ask Congress for pacing authority', phases: ['p0', 'scramble', 'p1'], ap: 1, pc: 2,
  avail(s) { if (s.flags.statute) return 'Pacing is already law'; if (s.flags.billDue) return 'The bill is moving; the vote is in ' + monthLabel(s.flags.billDue); if (s.flags.billBack > s.t) return 'Leadership will not bring it back before ' + monthLabel(s.flags.billBack); const v = senateVotes(s); return v >= 60 ? true : 'Needs 60 Senate votes to start (now ' + v + ')'; },
  desc: 'A statute that authorizes pacing outright. Slow: the vote comes two months after you send it, and it needs 55 votes still standing then. Once law, courts can no longer enjoin the pause, every lab above the line is covered, and Phase 2 rests on solid ground.',
  effect: () => 'The vote comes in two months. Needs 55 Senate votes on the day, and the whip count is soft: the day\u2019s count can land 9 or more votes off, either way, about one time in three. Labs campaign hard against a moving bill. If it fails, leadership waits 8 months to bring it back.',
  apply(s) { s.flags.billDue = s.t + 2; return 'The bill goes to the floor calendar. Leadership promises a vote in two months.'; },
});
def({ id: 'matchlaw', cat: 'politics', name: 'Ask Congress to authorize a matched pause', phases: ['p0', 'scramble', 'p1'], ap: 1, pc: 2,
  avail(s) { if (s.flags.statute) return 'Pacing is already law'; if (s.flags.matchLaw) return 'Congress has authorized a matched pause'; if (s.flags.matchDue) return 'The resolution is moving; the vote is in ' + monthLabel(s.flags.matchDue); if (s.flags.matchBack > s.t) return 'Leadership will not bring it back before ' + monthLabel(s.flags.matchBack); const v = senateVotes(s); return v >= 52 ? true : 'Needs 52 Senate votes to start (now ' + v + ')'; },
  desc: 'Narrower than a pacing statute: it authorizes the President to pause American labs the day China verifiably does the same. It pauses nothing on its own, so it needs fewer votes, and it is what makes \u201cOnly together\u201d believable in Beijing.',
  effect: () => 'The vote comes in one month and needs 50 Senate votes on the day (the whip count is soft). If it passes, a standby pause is 40 points more credible to Beijing. If it fails, credibility -3 and leadership waits 4 months.',
  apply(s) { s.flags.matchDue = s.t + 1; return 'The Matched Restraint Act goes on the floor calendar.'; },
});
def({ id: 'pledge', cat: 'diplo', name: 'Presidential pledge: we pause the day Beijing does', phases: ['p0', 'scramble', 'p1'], ap: 1, pc: 2, room: true,
  tags: { pause: 0.6, deal: 1, hawk: -0.8 },
  avail(s) { if (s.flags.pledge) return 'The President has pledged it'; if (paced(s)) return 'America is already pacing'; return true; },
  desc: 'The President says in public that America will stop training above the line the day China verifiably does. It costs little until it is tested, and a lot to break.',
  effect: () => 'A standby pause is 30 points more credible to Beijing; Beijing trust +4; hawks -4; salience +4. Restarting the labs after the pause begins costs 10 more credibility.',
  apply(s) { s.flags.pledge = true; s.cn.trust += 4; HAWKS.forEach(id => rel(s, id, -4)); s.salience += 4; return 'At the end of a speech on jobs, the President adds a line nobody in the room expected.'; },
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
  desc: 'A National Intelligence Estimate on RSI timing and Chinese capability. Sharper readings for three months (six days in the scramble).',
  effect: s => 'Indicator noise halved and IC timing estimate narrowed for ' + span(s, 3) + '; intelligence quality +5.',
  apply(s) { s.flags.assessUntil = s.turn + 3; s.intelQ += 5; return 'The DNI tasks a crash estimate. The error bars shrink.'; },
});

// ---- Room policies, any phase ----
def({ id: 'distill', cat: 'policy', name: 'Anti-distillation crackdown', phases: ['p0', 'scramble', 'p1'], ap: 1, pc: 2, room: true, once: true,
  tags: { hawk: 1.5, industry: 0.6, commerce: 0.5 },
  desc: 'KYC for frontier APIs, a cutoff for resellers, lawsuits against account farms, detection shared across labs.',
  effect: s => 'The US-model outputs China harvests fall by about 95% over three months. Each 10x of harvested data is worth only about a quarter of the gain, so China keeps about two-thirds of its distillation boost. Worth the most early: much of its value is a one-time boost already baked into where China stands. Costs US labs about 1.5% of their pace (customer friction).' + ctrlGainText(),
  apply(s) { ctrlGain(s); s.cn.distT = Math.min(s.cn.distT, 0.68 * cnBase(s).dist); s.tension += 5 * TUNE.ctrlHeat; shiftCN(s, { sec: 3 * TUNE.ctrlHeat, m: -3 * TUNE.ctrlHeat }); return 'Commerce and the labs announce the crackdown together, including a cutoff for resellers. Three Chinese labs lose 24,000 accounts overnight.'; },
});
def({ id: 'remote', cat: 'policy', name: 'Close the remote-access loophole', phases: ['p0', 'scramble', 'p1'], ap: 1, pc: 2, room: true, once: true,
  tags: { hawk: 1.8, markets: -0.4, allies: -0.5, commerce: 1 },
  avail(s) { return s.flags.summitHold >= s.turn ? 'Treasury hold until the trade summit' : true; },
  desc: 'Chinese firms train their largest runs on data centers abroad, above all in Johor, Malaysia. Close the cloud loophole.',
  effect: () => 'China loses most of its offshore training compute over two months; how much that is depends on how much it has. Beijing temperature +' + Math.round(8 * TUNE.ctrlHeat) + '. US clouds lose foreign revenue: US labs 2% slower.' + ctrlGainText(),
  apply(s) { ctrlGain(s); s.cn.remoteT = Math.min(s.cn.remoteT, 0.15); s.tension += 8 * TUNE.ctrlHeat; shiftCN(s, { sec: 4 * TUNE.ctrlHeat, m: -2 * TUNE.ctrlHeat }); s.coalition -= 3; return 'Commerce issues the rule. Beijing calls it “technological hegemony.”'; },
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
  effect: () => 'Smuggled compute falls by about half; chip accounting +8.' + ctrlGainText(),
  apply(s) { ctrlGain(s); s.cn.smuggleT = Math.max(0, s.cn.smuggleT - 0.5 * cnBase(s).smuggle); s.verify.inspect += 4; s.tension += 2 * TUNE.ctrlHeat; return 'Forty new enforcement agents deploy. The first indictment comes within weeks.'; },
});
def({ id: 'chips', cat: 'policy', name: 'End chip sales and tool servicing', phases: ['p0', 'scramble', 'p1'], ap: 1, pc: 3, room: true, once: true,
  tags: { hawk: 1.6, markets: -1.2, industry: -0.6, deal: -0.8, allies: -0.4 },
  avail(s) { return s.flags.summitHold >= s.turn ? 'Treasury hold until the trade summit' : true; },
  desc: 'Pull the licenses for chips sold legally to Chinese firms, close the smuggled-HBM channel, and get the Dutch and Japanese to stop servicing chipmaking tools in China. The big, expensive lever, and nearly all of it comes from the legal chips.',
  effect: s => 'China loses legal chips now (−16% compute); HBM curbs trim its domestic output over a year (up to −2% more; the servicing ban bites only years out) (fully only with coalition 45+, now ' + Math.round(s.coalition) + '). Markets ' + (TUNE.ctrlMkt >= 3 ? '+' : '') + (TUNE.ctrlMkt - 3) + ', Beijing temperature +' + Math.round(12 * TUNE.ctrlHeat) + ', Treasury unhappy. US labs 3% slower, and Beijing may answer with mineral export curbs that slow them much more.' + ctrlGainText(true),
  apply(s) { ctrlGain(s); const full = s.coalition >= 45; s.cn.legalT = 0; s.cn.smeT = full ? 0.2 : 0.6; s.markets -= 3; s.tension += 12 * TUNE.ctrlHeat; shiftCN(s, { m: -5 * TUNE.ctrlHeat, sec: 7 * TUNE.ctrlHeat }); rel(s, 'tsy', -8); s.coalition -= full ? 2 : 6; return (full ? 'The Hague and Tokyo sign on. ' : 'The Dutch agree; Tokyo stalls, so the tool cutoff is partial. ') + 'Verdant Semiconductor\u2019s stock falls 7%.'; },
});
def({ id: 'sl4', cat: 'policy', name: 'Executive order: SL4 security for frontier labs', phases: ['p0', 'scramble', 'p1'], ap: 1, pc: 2, room: true, once: true,
  tags: { control: 1, industry: -0.8, hawk: 0.8 },
  avail(s) { return s.sl >= 4 ? 'Already at SL' + s.sl : true; },
  desc: 'Mandatory security against well-resourced attackers, audited by the government. Labs start at SL3. Worth the most when Beijing\u2019s hackers push hard (the Beijing tab).',
  effect: () => 'Orders SL4. It takes effect after 1 more action implementing it: then a theft attempt succeeds 25% of the time instead of 90%, and overhead slows US labs 5%. Labs -8, industry -2.',
  apply(s) { s.labs.forEach(l => l.rel -= 8); industry(s, -2); return 'The order is signed. The labs complain about cost; implementation starts.'; },
});
def({ id: 'probe', cat: 'politics', name: 'Ask a friendly chair for an investigation', phases: ['p0', 'scramble', 'p1'], ap: 0, pc: 1,
  tags: { pause: 0.5, industry: -1 },
  avail(s) { if (!s.seen.midterms || s.flags.senateFlipped) return 'Only while the President\u2019s party holds the Senate'; return (s.flags.cooldowns.probe || -9) > s.turn - 3 ? 'Too soon after the last one' : true; },
  desc: 'A committee chair from the President\u2019s party opens an investigation into how the labs handle safety.',
  effect: () => 'Salience +8; industry -6. Uses no action.',
  apply(s) { s.flags.cooldowns.probe = s.turn; s.salience += 8; industry(s, -6); return pick(s, ['The Commerce chair subpoenas red-team reports from both labs.', 'The Intelligence chair asks why a lab\u2019s weights left a contractor\u2019s laptop.', 'Mindscale\u2019s general counsel spends a week preparing for a deposition.']); },
});
def({ id: 'speech', cat: 'policy', name: 'Presidential address on AI risk', phases: ['p0', 'scramble', 'p1'], ap: 1, pc: 2, room: true,
  tags: { pause: 1, industry: -1, markets: -0.5 },
  avail(s) { return (s.flags.cooldowns.speech || -9) > s.turn - 3 ? 'Too soon after the last one' : true; },
  desc: 'The President tells the country what is at stake.',
  effect: () => 'Salience +15; markets -2.',
  apply(s) { s.flags.cooldowns.speech = s.turn; s.salience += 15; s.markets -= 2; if (s.phase === 'p0') s.alarm += 15; return 'The President goes off script twice and it works. 41 million people watch.'; },
});
def({ id: 'kyc', cat: 'policy', name: 'Know-your-customer for cloud compute and agent accounts', phases: ['p0', 'scramble', 'p1'], ap: 1, pc: 2, room: true, once: true,
  tags: { control: 1, commerce: 0.8, hawk: 0.5, industry: -0.8 },
  desc: 'Clouds verify a human or a company behind every large compute account and every agent that pays its own bills. Sovereign agents lose their footing, and so do some shell companies renting compute for Chinese labs.',
  effect: s => 'Sovereign agents grow 70% slower and a third of them lose their accounts now (now ' + Math.round(s.agents || 0) + '/100). China’s offshore compute -10%. Industry -4.',
  apply(s) { s.agents = (s.agents || 0) * 0.67; s.cn.remoteT *= 0.9; industry(s, -4); return 'Commerce issues the rule with the clouds’ grudging support. Forty thousand accounts fail verification in the first week.'; },
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
  apply(s, prm) { const cm = COMPONENTS.find(c => c.id === prm.comp); s.verify[prm.comp] += surgeAmt(s, cm.trusted) * (prm.comp === 'inspect' && enjoined(s) ? TUNE.enjoinedMult : 1); if (prm.comp === 'inspect' && paced(s)) s.flags.surgeTurn = s.turn; if (!s.flags.surges || s.flags.surges.turn !== s.turn) s.flags.surges = { turn: s.turn, n: 0 }; s.flags.surges.n++; return cm.name + ' moves forward.'; },
});
def({ id: 'malaysia', cat: 'diplo', name: 'Bring Malaysia into the regime', phases: ['p0', 'scramble', 'p1'], ap: 1, pc: 2, once: true,
  desc: 'Johor’s megacenters host Chinese tenants on hardware they cannot import. Get Kuala Lumpur to host inspectors instead of cutting them off.',
  effect: s => 'Chance: ' + Math.round(100 * malaysiaOdds(s)) + '%. Success cuts China’s offshore compute by most of what a remote-access rule would, without the tension.',
  apply(s) { if (draw(s, 'cn', malaysiaOdds(s)) < malaysiaOdds(s)) { s.cn.remoteT = Math.min(s.cn.remoteT, 0.3); s.coalition += 5; s.flags.malaysiaIn = true; return 'Kuala Lumpur agrees to host inspectors at both Johor campuses.'; } s.policies.malaysia = false; s.coalition -= 2; return 'Kuala Lumpur stalls and talks about sovereignty. You can try again later.'; },
});
function surgeAmt(s, trusted) { return trusted ? 3 + 3 * s.warp : 1 + 2 * s.warp; }
function malaysiaOdds(s) { return clamp(0.25 + s.coalition / 200 + (s.flags.johorStory ? 0.1 : 0) - (s.policies.remote ? 0.15 : 0), 0.05, 0.85); }

// ---- scramble decisions ----
const MECH = {
  charter: { label: 'Pacing Charter', desc: 'Voluntary commitments by every lab above the line, mutual verification, and the DPA held in reserve. Labs must sign, and labs that like you sign and stay. Lowest court risk until Congress acts.', tags: { pause: 1.2, control: 0.8, industry: -0.4, markets: -0.4 } },
  dpa: { label: 'DPA halt', desc: 'Order every lab above the line to stop. Covers everyone at once. Legally untested: the highest court risk until Congress acts, and hostile courts are likelier to rule against it and to uphold the ruling on appeal.', tags: { pause: 2.2, control: 2, industry: -2, markets: -1.4 } },
  license: { label: 'Commerce licensing', desc: 'Commerce licenses every run above the line. Covers everyone. Commerce runs it, so it is as tight as Commerce wants: leaky with a hostile Commerce Secretary, solid with an ally, whose lawyers also halve the court risk.', tags: { pause: 1.2, control: 1.2, commerce: 2, industry: -0.8, markets: -0.6 } },
};
def({ id: 'mech', cat: 'crisis', name: 'Choose the pacing mechanism', phases: ['scramble'], ap: 1, pc: 2, room: true,
  params: { kind: 'variant', options: () => Object.keys(MECH).map(k => ({ id: k, label: MECH[k].label, desc: MECH[k].desc })) },
  tags: (s, prm) => MECH[prm.variant || 'charter'].tags,
  extra: (s, prm) => prm.variant === 'license' ? { doc: 2.5, cos: -1, tsy: -1 } : prm.variant === 'charter' && s.flags.commerceChairs ? { doc: 1.2 } : null,
  pres: (s, prm) => prm.variant === 'dpa' && s.flags.alarmist ? 0.15 : 0,
  avail(s) { return s.pacing.mech ? 'Decided: ' + MECH[s.pacing.mech].label : true; },
  desc: 'How does pacing actually happen? This is the first decision of the scramble.',
  effect: s => 'Sets how labs are bound for all of Phase 1. Counsel reads the courts as ' + courtRead(s).text + '.',
  apply(s, prm) { s.pacing.mech = prm.variant; s.pacing.mechTurn = s.turn; if (prm.variant === 'license') { infl(s, 'doc', 8); rel(s, 'cos', -8); rel(s, 'tsy', -8); } return MECH[prm.variant].label + ' it is.'; },
});
const THRESH = {
  '1e20': { label: '1e20 OP/s', desc: 'Maximum caution. Hundreds of sites, inference clouds included. Labs and markets hate it; inspectors are stretched.', tags: { pause: 1.5, industry: -1.5, markets: -0.8 } },
  '1e21': { label: '1e21 OP/s', desc: 'About 5e27 FLOP over six months at 30% utilization. Roughly 25 facilities at 15 locations, 14 parties.', tags: { pause: 0.8, industry: -0.4 } },
  '1e22': { label: '1e22 OP/s', desc: 'Only the very biggest. Nothing clears it in 2027; the largest site runs about 3.6e21. Constrains almost nothing, so paced labs keep training and keep about four times the runaway risk of a real pause.', tags: { pause: 0.2, industry: 0.2 } },
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
    if (s.phase === 'p1' && s.labs.every(l => l.signed || l.lockUntil > s.t)) return 'Labs that walked out will not come back yet';
    return true;
  },
  apply(s) { if (s.scramble) s.scramble.convening = true; s.flags.convening = true; return 'The CEOs are in the Roosevelt Room.'; },
  modal: 'charter',
});
const SEQ = {
  first: { label: 'Go first', desc: 'America pauses now, whether or not Beijing follows. The surest way to cut loss-of-control risk and to show Beijing this is real. The lead erodes while China keeps going, and the hawks will call it unilateral disarmament.', tags: { pause: 2, hawk: -1.6, deal: 1, markets: -0.6, military: -0.6 } },
  deadline: { label: 'Go first, with a 6-month deadline', desc: 'Pause now, and announce that the pause lapses in six months unless Beijing joins. Some goodwill, some anger, and a cliff at the end.', tags: { pause: 1.2, hawk: -0.5, deal: 0.8, markets: -0.3 } },
  together: { label: 'Only together', desc: 'The labs sign, but nobody stops until Beijing signs too. The hawks are happy and markets are calm. The labs keep racing toward the threshold. Beijing believes it only as far as you have prepared: a matched-pause law, verification ready, a presidential pledge.', tags: { pause: 0.3, hawk: 1.4, deal: 0.2, military: 0.4 } },
};
const HAWKS = ['vp', 'sec', 'war', 'doc'];
// Each export control reassures markets a little (TUNE.ctrlMkt) and wins standing with the hawks (TUNE.ctrlHawk), which feeds capital through allies.
function ctrlGain(s) { s.markets += TUNE.ctrlMkt; HAWKS.forEach(id => rel(s, id, TUNE.ctrlHawk)); }
const ctrlGainText = noMkt => (noMkt ? '' : ' Markets +' + TUNE.ctrlMkt + ';') + ' Hawks +' + TUNE.ctrlHawk + '.';
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
  if (seq === 'together') { const k = 1 - standbyCred(s); HAWKS.forEach(id => rel(s, id, 6)); s.cn.trust -= 5 * k; shiftCN(s, { sci: -3 * k, sec: 2 * k }); }
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
  if (s.pacing.mech === 'license') c += -12 + TUNE.licRel * P(s, 'doc').rel; // Commerce runs it: as good as Commerce wants it to be
  if (s.pacing.mech === 'charter' && l.signedVoluntary) c += TUNE.charterRel * l.rel; // a lab that chose to sign keeps faith as far as it trusts you
  if (s.flags.commerceChairs) c -= 5;
  if (s.flags.medCarve) c -= 5;
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
  if (l.lockUntil > s.t) return { signed: false, p: 0, text: d.ceo + ' will not take the meeting before ' + monthLabel(l.lockUntil) + '.' };
  let extra = '';
  if (withDeal) { if (s.pc < d.deal.pc) return { error: 'Not enough political capital' }; s.pc -= d.deal.pc; extra = ' ' + d.deal.fx(s); l.dealt = true; }
  const p = charterOdds(s, labId, withDeal);
  const roll = draw(s, 'lab', p);
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
  apply(s, prm) { const l = L(s, prm.lab); l.covered = true; l.signed = true; l.signedVoluntary = false; l.comp = clamp(complianceBase(s, l) - 15); l.rel -= 30; s.flags.dpaUsed = true; s.flags.dpaSince = s.turn; s.flags.compelled = true; industry(s, -10); return LD(l.id).name + ' is ordered under the DPA. ' + LD(l.id).ceo + ' calls it “the end of American innovation” and files suit.'; },
});
def({ id: 'openrule', cat: 'policy', name: 'Limit open-weight releases near the frontier', phases: ['p0', 'scramble', 'p1'], ap: 1, pc: 2, room: true, once: true,
  tags: { control: 1, industry: -1.2, markets: -0.3, allies: -0.4 },
  avail(s) { return s.open == null ? 'Open-weight rules are off in this build' : true; },
  desc: 'No US developer or US cloud publishes weights within a set distance of the frontier. Open-source startups and Europe object; Beijing offers itself as the open alternative.',
  effect: () => 'The open-weight frontier climbs ' + Math.round(100 * TUNE.openRuleCut) + '% slower. Industry -6; coalition -2; Beijing leans toward publishing its own models.',
  apply(s) { s.policies.openrule = true; industry(s, -6); s.coalition -= 2; shiftCN(s, { m: 3 }); return 'Commerce publishes the release rule. Two open-model startups announce moves to Paris.'; },
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
  { id: 'lane', label: 'Market lane and open-weight ceiling', desc: 'The SALT I logic: Chinese sub-frontier models keep selling, including in the US, and both sides keep published weights at least 3 months below the paced frontier. Without it, Beijing can keep publishing its models under a deal. Offering it costs industry 3.' },
  { id: 'institute', label: 'Joint safety institute and shared evals', desc: 'Chinese scientists reach conclusions about risk through their own work. Shared research worries the Pentagon and the IC: offering it costs the Secretary of War 4, the DNI 3 and 3 Senate votes for 6 months.' },
  { id: 'relief', label: 'Entity List relief', desc: 'Sanctions relief for Chinese AI firms; some of it helps their compute. Offering it costs State 4 and 3 Senate votes for 6 months.' },
  { id: 'visas', label: 'Eased visas for researchers', desc: 'A carrot with a counterintelligence cost. Offering it costs the DNI 5.' },
  { id: 'misuse', label: 'Joint misuse response', desc: 'Shared DNA synthesis screening, joint takedowns of sovereign agents, and a hotline for AI-enabled attacks. Beijing fears the same things; it is worth more to them as open models get dangerous. Offering it costs the DNI 8 and State 6: sharing screening data means sharing what we watch.' },
  { id: 'chips', label: 'Resume legal chip sales', desc: 'A carrot that directly feeds their compute. Offering it costs every hawk 4 and 6 Senate votes for 6 months.' },
  { id: 'threat', label: 'Threaten a full cutoff if they refuse', desc: 'Credible only with a big lead.' },
];
const TERM_SHORT = { lane: 'Market lane', relief: 'Entity List relief', visas: 'Eased visas', institute: 'Joint safety institute', chips: 'Legal chip sales' };
// Beijing's priorities, hidden and drawn per game from the seed: each carrot's worth is its base times 0.3-1.7, and one keystone is worth 1.8x more.
const CARROTS = { lane: 0.45, relief: 0.4, visas: 0.3, institute: 0.25, chips: 0.5 };
const CARROT_IDS = Object.keys(CARROTS);
function keystone(s) { return CARROT_IDS[Math.floor(hash01(s.seed, 'keystone') * CARROT_IDS.length)]; }
function termMult(s, k) { return (0.3 + 1.4 * hash01(s.seed, 'tw', k)) * (k === keystone(s) ? 1.8 : 1); }
const worthOf = (s, k, m) => CARROTS[k] * m + (k === 'institute' ? 0.01 * s.cn.f.sci : 0);
// Your read on a carrot: exact once the envoy confirms it (Track 2 confirms the science side: the institute and visas); otherwise a fixed per-game misread that shrinks with intelligence.
function termKnown(s, k) { return !!(s.cn.known && s.cn.known[k]) || (!!s.done.track2 && (k === 'institute' || k === 'visas')); }
function termRead(s, k) {
  const known = termKnown(s, k), m = termMult(s, k), err = 0.7 * (1 - s.intelQ / 200);
  const est = known ? m : Math.max(0.1, m * (1 + (hash01(s.seed, 'twn', k) - 0.5) * 2 * err));
  const word = est < 0.6 ? 'little interest' : est < 1.1 ? 'some interest' : est < 1.6 ? 'strong interest' : 'a top priority';
  return { est, known, word, worth: worthOf(s, k, est), text: word + (known ? ', confirmed' : ', IC guess') };
}
function chanClosed(s) { return s.cn.legalT < 0.3 && s.cn.distT < 0.5 && s.cn.remoteT < 0.5; }
// How believable "Only together" is to Beijing, 0-1, as labeled parts. Standby counts 0.65 x this toward a deal (going first counts 0.65).
function standbyParts(s) {
  return [['Congress authorized a matched pause', s.flags.statute || s.flags.matchLaw ? 0.4 : 0], ['Verification ready to watch both sides', 0.3 * clamp((ready1(s) - 15) / 45, 0, 1)], ['The President’s public pledge', s.flags.pledge ? 0.3 : 0]];
}
function standbyCred(s) { return standbyParts(s).reduce((a, x) => a + x[1], 0); }
function offerTags(terms) {
  const t = { deal: 1.5, pause: 0.5, hawk: -0.3 };
  const add = o => { for (const k in o) t[k] = (t[k] || 0) + o[k]; };
  if (terms.inspect) add({ control: 0.6, ic: 0.6, industry: -0.3 });
  if (terms.freeze) add({ hawk: 0.8 });
  if (terms.lane) add({ markets: 0.6, deal: 0.5, industry: -0.5, hawk: -0.6 });
  if (terms.institute) add({ deal: 0.3 });
  if (terms.misuse) add({ control: 0.3, deal: 0.2 });
  if (terms.relief) add({ hawk: -1.2, markets: 0.5, deal: 0.5 });
  if (terms.visas) add({ hawk: -0.3 });
  if (terms.chips) add({ hawk: -2, markets: 1, industry: 0.8 });
  if (terms.threat) add({ hawk: 1, deal: -0.3 });
  return t;
}
// Beijing's willingness to take an offer, as labeled parts so the UI can show where they come from; 0 is even odds.
// pub: the player's view, which reads each carrot's worth off termRead instead of Beijing's hidden priorities.
function cnParts(s, terms, pub) {
  const f = s.cn.f, ld = pub ? seenLead(s) : lead(s); // the player's preview reads the IC's gap; Beijing decides on the true one
  const P_ = [['Base reluctance', -1.55], ['Who has the floor in Beijing', 0.03 * (f.sci - 20) + 0.015 * (f.m - 50) - 0.03 * (f.sec - 30)]];
  P_.push([ld >= 4 ? 'The US lead' : 'China is close behind', TUNE.leadSlope * (clamp(ld, -4, 12) - 4)]);
  const cm = pub ? crossoverMonths(s) : cnCatchUp(s); if (cm < 6) P_.push(['China could overtake within ' + Math.max(1, Math.round(cm)) + ' months', -TUNE.overtakePen * (1 - cm / 6)]);
  if (chanClosed(s) && !terms.lane && !terms.chips && !terms.relief && f.sec > 40) P_.push(['Every channel closed, and nothing in the offer reopens one', -0.4]);
  if (paced(s)) P_.push(['America is pacing', 0.5]);
  else if (s.pacing.armed) P_.push(['America’s labs signed, but nothing stops until Beijing does (' + credWord(standbyCred(s)) + ')', 0.65 * standbyCred(s)]);
  else P_.push(['America is not pacing', -0.7]);
  if (s.flags.wentFirst) P_.push(['America went first', 0.15]); else if (s.pacing.seq === 'deadline' && paced(s)) P_.push(['America went first, with a deadline', 0.08]);
  P_.push(['Beijing temperature', -(s.tension - 30) * 0.018], ['Beijing’s trust', (s.cn.trust - 10) * 0.012]);
  if (terms.freeze) P_.push(['Freeze the current ratio', -0.3]);
  if (terms.inspect) P_.push(['On-site inspections (Security hates them)', -(0.25 + 0.012 * f.sec)]);
  if (tierSign(s, 'sec')) P_.push([isAlly(s, 'sec') ? 'The Secretary of State is carrying your offer' : 'The Secretary of State is undercutting your offer', 0.25 * tierSign(s, 'sec')]);
  if (terms.misuse) P_.push(['Joint misuse response (worth more as open models get dangerous)', misusePactWorth(s)]);
  CARROT_IDS.forEach(k => { if (terms[k]) P_.push([TERM_SHORT[k] + (pub ? ' (' + termRead(s, k).text + ')' : ''), pub ? termRead(s, k).worth : worthOf(s, k, termMult(s, k))]); });
  // export controls are leverage: Beijing values getting back what you took
  if (terms.chips && s.policies.chips) P_.push(['Resumes the chip sales you cut', TUNE.chipLever]);
  const held = ['remote', 'distill', 'smuggle'].filter(k => s.policies[k]).length;
  if (terms.relief && held) P_.push(['Relief eases ' + held + ' control' + (held > 1 ? 's' : '') + ' you imposed', TUNE.reliefLever * held]);
  if (s.flags.warn && !s.policies[s.flags.warn.k]) P_.push(['Your threat to impose ' + CTRL_THREAT[s.flags.warn.k].short + ' (' + credWord(threatCred(s, pub)) + ')', warnValue(s, pub)]);
  if (terms.threat) P_.push([ld > 7 ? 'A cutoff threat, backed by a big lead' : 'A cutoff threat without the lead to back it', ld > 7 ? 0.35 : -0.25]);
  if (s.flags.covertExposed && s.turn - s.flags.covertExposed < 6) P_.push(['A covert operation exposed in the last 6 months', -0.8]);
  if (s.flags.dodCarve) P_.push(['A Pentagon carve-out for one lab', -0.15]);
  if (s.flags.uaeOut && paced(s)) P_.push(['The UAE loophole', -TUNE.uaeDeal]);
  return P_;
}
function cnUtility(s, terms, pub) { return cnParts(s, terms, pub).reduce((a, x) => a + x[1], 0); }
function cnAcceptP(s, terms) { return logistic(TUNE.cnSharp * cnUtility(s, terms)); }
function cnAcceptEstimate(s, terms) { const p = logistic(TUNE.cnSharp * cnUtility(s, terms, true)); const err = 0.25 * (1 - s.intelQ / 100) + 0.04; const b = (hash01(s.seed, s.turn, 'cnest', JSON.stringify(terms)) - 0.5) * 2 * err; return { mid: clamp(p + b, 0.01, 0.99), err }; }
function offerPreview(s, terms) { const rp = roomPreviewTags(s, 'offer', offerTags(terms), JSON.stringify(terms)); return { room: rp, cn: cnAcceptEstimate(s, terms) }; }
function roomPreviewTags(s, id, tags, key) { ACT._tmp = { tags, pres: s2 => (seenLead(s2) > 4 ? 0.1 : 0) }; const r = roomPreview(s, '_tmp', { key }); delete ACT._tmp; return r; }
def({ id: 'offer', cat: 'diplo', name: 'Make Beijing an offer', phases: ['scramble', 'p1'], ap: 1, pc: 2, modal: 'offer',
  desc: 'Build a package. The President has to approve it, then Beijing decides. Carrots cost at home as soon as the package goes out; a rejection costs trust and temperature.',
  effect: () => 'Opens the offer table.',
  avail(s) { if (s.war) return 'Beijing will only talk about a ceasefire'; if (s.cn.deal) return 'A deal is already in force'; if (s.roomUsed >= roomMax(s)) return 'The President has no more time for decisions this turn'; if (s.cn.cooldown > 0) return 'Beijing needs time (' + span(s, s.cn.cooldown) + ' more)'; return true; },
  apply() { return ''; },
});
// Beijing's read of US resolve (W1), with no lead term: threats carried out, controls in force and the coalition raise it; backing down,
// lifting controls as gestures and pausing first with no deal (open-ended or on a deadline) lower it. Each TUNE.*Resolve knob scales a risk by 1 + k x (resolveMid - resolve).
function resolveParts(s) {
  const w = s.flags.warns || { kept: 0, won: 0, backed: 0 }, n = Object.keys(CTRL_THREAT).filter(k => s.policies[k]).length;
  const P_ = [['Base', 0.4], ['The allied coalition', clamp(0.006 * (s.coalition - 30), -0.15, 0.2)]];
  if (n) P_.push(['Controls in force', 0.06 * n]);
  if (w.kept) P_.push(['Threats you carried out', 0.12 * w.kept]);
  if (w.won) P_.push(['Threats that won a deal', 0.05 * w.won]);
  if (w.backed) P_.push(['Threats you backed down from', -0.15 * w.backed]);
  if (s.stats.lifted) P_.push(['Controls lifted as gestures', -0.1 * s.stats.lifted]);
  if (s.flags.wentFirst && !s.cn.deal) P_.push(['America paused first, with no deal yet', -TUNE.resolveFirst]);
  else if (s.pacing.seq === 'deadline' && paced(s) && !s.cn.deal) P_.push(['America paused first on a deadline, with no deal yet', -TUNE.resolveDeadline]);
  return P_;
}
function resolve(s) { return clamp(resolveParts(s).reduce((a, x) => a + x[1], 0), 0.05, 0.95); }
function lean(s, k) { return k ? clamp(1 + k * (TUNE.resolveMid - resolve(s)), 0.25, 4) : 1; }
// W4: a guarantee given from weakness emboldens Beijing (theft, cheating, the Strait) instead of calming it, by TUNE.reassureBold.
function emboldened(s) { return TUNE.reassureBold && reassured(s) && resolve(s) < TUNE.resolveMid ? 1 + TUNE.reassureBold * (TUNE.resolveMid - resolve(s)) : 1; }
function reassureFrom(s) { return TUNE.reassureBold ? Math.min(1, resolve(s) / TUNE.resolveMid) : 1; }
// Threatened controls (Drezner's hidden hand): announce a control you will impose unless Beijing deals within 3 months.
// While it stands it adds credibility x lever (x Beijing's exposure on that channel) to every offer, without the costs of imposing.
const CTRL_THREAT = {
  chips: { short: 'the chip ban', lever: 0.8, exp: s => 1, give: 'caps its legal chip purchases', concede(s) { s.cn.legalT = Math.min(s.cn.legalT, 0.6); } },
  remote: { short: 'the remote-access rule', lever: 0.5, exp: s => clamp(cnBase(s).remote, 0.5, 1.5), give: 'pulls its largest training runs out of Johor', concede(s) { s.cn.remoteT = Math.min(s.cn.remoteT, 0.5 * cnBase(s).remote); } },
  distill: { short: 'the distillation crackdown', lever: 0.4, exp: s => clamp(cnBase(s).dist, 0.5, 1.5), give: 'reins in its labs\u2019 harvesting of US model outputs', concede(s) { s.cn.distT = Math.min(s.cn.distT, 0.84 * cnBase(s).dist); } },
  smuggle: { short: 'the smuggling surge', lever: 0.3, exp: s => clamp(cnBase(s).smuggle, 0.5, 1.5), give: 'cracks down on gray-market chip imports', concede(s) { s.cn.smuggleT = Math.max(0, s.cn.smuggleT - 0.25 * cnBase(s).smuggle); } },
};
// How far Beijing believes a threat: the lead (2 to 10 months), the coalition, any control already imposed, your record of following through.
// pub: the player's view, which reads the lead off the IC's estimate.
function threatParts(s, pub) {
  const ld = pub ? leadEstimate(s).mid : lead(s), w = s.flags.warns || { kept: 0, won: 0, backed: 0 };
  const P_ = [['Base', 0.2], ['The lead', 0.05 * clamp(ld - 2, 0, 8)], ['The allied coalition', clamp(0.004 * (s.coalition - 30), -0.1, 0.2)]];
  if (Object.keys(CTRL_THREAT).some(k => s.policies[k])) P_.push(['A control you already imposed', 0.1]);
  if (w.kept) P_.push(['Threats you carried out', 0.12 * w.kept]);
  if (w.won) P_.push(['Threats that won a deal', 0.05 * w.won]);
  if (w.backed) P_.push(['Threats you backed down from', -0.15 * w.backed]);
  return P_;
}
function warnRec(s) { return s.flags.warns || (s.flags.warns = { kept: 0, won: 0, backed: 0 }); }
function threatCred(s, pub) { return clamp(threatParts(s, pub).reduce((a, x) => a + x[1], 0), 0.05, 0.95); }
// The player reads a threat's credibility in words, not percent.
function credWord(p) { return p < 0.2 ? 'barely credible' : p < 0.4 ? 'somewhat credible' : p < 0.6 ? 'fairly credible' : p < 0.8 ? 'highly credible' : 'fully credible'; }
// The hidden hand: Beijing may concede at the threat stage, half as far as the control would go, with no temperature or Security cost.
function concedeP(s, pub) { const f = s.cn.f; return clamp(threatCred(s, pub) * (0.6 + 0.01 * (f.m - 50) - 0.01 * (f.sec - 30)), 0, 0.8); }
// Each control can be threatened once, and not once it is in place.
function warnable(s, k) { return !s.policies[k] && !(s.flags.warnedK && s.flags.warnedK[k]); }
function warnValue(s, pub) { const w = s.flags.warn; if (!w || s.policies[w.k]) return 0; return threatCred(s, pub) * CTRL_THREAT[w.k].lever * (pub ? 1 : CTRL_THREAT[w.k].exp(s)); }
def({ id: 'warn', cat: 'diplo', name: 'Threaten an export control', phases: ['scramble', 'p1'], ap: 1, pc: 2,
  params: { kind: 'variant', options: s => Object.keys(CTRL_THREAT).filter(k => warnable(s, k)).map(k => ({ id: k, label: 'Threaten ' + CTRL_THREAT[k].short, desc: 'Beijing sees it as ' + credWord(threatCred(s, true)) + '; it sweetens every offer while it stands.' })) },
  avail(s) { if (s.war) return 'Beijing will only talk about a ceasefire'; if (s.cn.deal) return 'A deal is already in force'; if (s.flags.warn) return 'A threat already stands (' + CTRL_THREAT[s.flags.warn.k].short + ', until ' + monthLabel(s.flags.warn.until) + ')'; return Object.keys(CTRL_THREAT).some(k => warnable(s, k)) ? true : 'Every control is in place or already threatened'; },
  desc: 'Announce a specific control you will impose unless Beijing deals within three months. Targets that would concede often do so at the threat stage, without the costs of an imposed control. Beijing believes it as far as your lead, your allies and your record of carrying out threats allow.',
  effect: s => 'Chance Beijing concedes on the spot, about half as far as the control would go: ' + oddsWord(concedeP(s, true)) + ' (more with Market in charge, less with Security). Otherwise, while it stands, every offer gains in proportion to how credible it is and how much Beijing cares about the control (now ' + credWord(threatCred(s, true)) + '). Temperature +2; hawks +3. If there is no deal in three months, you impose it (its usual costs, and later threats are believed more) or back down (credibility -8, and later threats are believed less).',
  apply(s, prm) { const k = prm.variant, w = CTRL_THREAT[k]; HAWKS.forEach(id => rel(s, id, 3)); (s.flags.warnedK = s.flags.warnedK || {})[k] = true;
    if (draw(s, 'cn', concedeP(s)) < concedeP(s)) { w.concede(s); warnRec(s).won++; log(s, 'Under threat of ' + w.short + ', Beijing ' + w.give + '.', 'good'); return 'The President warns Beijing that ' + w.short + ' is coming. Within the week Beijing ' + w.give + ', and calls it its own decision.'; }
    s.flags.warn = { k, since: s.t, until: s.t + 3 }; s.tension += 2; return 'The President tells Beijing, publicly, that ' + w.short + ' comes in three months unless there is a deal. Beijing calls it blackmail.'; },
});
def({ id: 'sound', cat: 'diplo', name: 'Sound out Beijing’s envoy', phases: ['p0', 'scramble', 'p1'], ap: 1, pc: 1,
  params: { kind: 'variant', options: s => CARROT_IDS.filter(k => !termKnown(s, k)).map(k => ({ id: k, label: TERM_SHORT[k], desc: 'Your read now: ' + termRead(s, k).text + '.' })) },
  avail(s) { if (s.war) return 'Beijing will only talk about a ceasefire'; return CARROT_IDS.some(k => !termKnown(s, k)) ? true : 'You know what Beijing wants'; },
  desc: 'A quiet lunch with China’s deputy chief of mission. What Beijing wants from a deal differs every game; learn exactly how much it values one term before you pay for it in a package.',
  effect: () => 'Confirms Beijing’s real interest in one term. Beijing trust +2.',
  apply(s, prm) { if (!s.cn.known) s.cn.known = {}; s.cn.known[prm.variant] = true; s.cn.trust += 2; return 'Over lunch the envoy is candid about the ' + TERM_SHORT[prm.variant].toLowerCase() + ': ' + termRead(s, prm.variant).word + '.' + (prm.variant === keystone(s) ? ' It is what Beijing wants most.' : ''); },
});
// Reassurance (B1): a guarantee that the lead won't be turned on China cuts the preventive motive in the Strait by TUNE.reassureCut x its credibility,
// for TUNE.reassureMonths (0: until broken), base credibility TUNE.reassureBase. Covert action or a strike breaks it.
function reassured(s) { return !!s.flags.reassure && (!TUNE.reassureMonths || s.t < s.flags.reassure.until); }
function reassureParts(s) {
  const P_ = [['Base', TUNE.reassureBase], ['Beijing’s trust', clamp((s.cn.trust - 10) * 0.006, -0.15, 0.3)]];
  if (paced(s)) P_.push(['America is pacing', 0.2]); else if (s.flags.pledge) P_.push(['The President’s pledge to pause', 0.1]);
  if (s.flags.covertExposed != null && s.turn - s.flags.covertExposed < 6) P_.push(['A covert operation exposed in the last 6 months', -0.3]);
  return P_;
}
function reassureCred(s) { return s.flags.struck ? 0.05 : clamp(reassureParts(s).reduce((a, x) => a + x[1], 0), 0.05, 0.9); }
function breakReassure(s) { if (!reassured(s)) return; s.flags.reassure = null; s.cn.trust -= 10; cnAggrieve(s); log(s, 'Beijing calls the benefit-sharing guarantee a lie.', 'bad'); }
def({ id: 'reassure', cat: 'diplo', name: 'Guarantee Beijing a share of what the frontier builds', phases: ['p0', 'scramble', 'p1'], ap: 1, pc: 2,
  avail(s) { if (s.war) return 'Beijing will only talk about a ceasefire'; if (reassured(s)) return TUNE.reassureMonths ? 'The guarantee stands until ' + monthLabel(s.flags.reassure.until) : 'The guarantee stands'; return true; },
  desc: 'The Atoms for Peace move: the President promises that the lead will not be turned against China, and that safety results and the benefits of frontier AI will be shared. Beijing’s strongest reason to move on Taiwan is fear of what a US lead near the threshold becomes. Worth the most with a big lead close to the threshold.',
  effect: s => (TUNE.reassureMonths ? 'For ' + TUNE.reassureMonths + ' months, the' : 'Until it is broken, the') + ' Strait risk that comes from a big US lead falls by ' + Math.round(100 * TUNE.reassureCut * reassureCred(s)) + '% (Beijing believes it ' + Math.round(100 * reassureCred(s)) + '%: more with trust and a pause, less after covert action). Beijing trust +5; temperature -4; hawks -5; Senate -2; China +0.15 months from shared results. Covert action or a strike breaks it: trust -10.',
  apply(s) { const k = reassureFrom(s); s.flags.reassure = { since: s.t, until: s.t + TUNE.reassureMonths }; s.cn.trust += 5 * k; s.tension -= 4 * k; shiftCN(s, { sci: 2, sec: -1 }); HAWKS.forEach(id => rel(s, id, -5)); s.senateLobby -= 2; s.cn.cap += 0.15; return 'The President, at the UN: “Whatever this technology becomes, it will not be used to make China kneel.” The Secretary of State reads the transcript twice.'; },
});
function makeOffer(s, terms) {
  const a = ACT.offer;
  if (s.ap < a.ap || s.pc < a.pc) return { error: 'Not enough actions or capital' };
  if (s.roomUsed >= roomMax(s)) return { error: 'The President has no more time for decisions this turn' };
  s.ap -= a.ap; s.pc -= a.pc; s.roomUsed++;
  const rp = roomPreviewTags(s, 'offer', offerTags(terms), JSON.stringify(terms));
  const roll = draw(s, 'room', rp.p); const pass = roll < rp.p;
  settleRoom(s, rp, pass);
  if (!pass) { log(s, 'The President rejected your China package.', 'bad'); return { pass: false, roll, room: rp, text: 'The President won’t sign off. “It looks weak,” the President says, and moves on.' }; }
  if (s.flags.laneCommit && !terms.lane) rel(s, 'tsy', -15);
  // carrots cost at home as soon as the package goes out, whatever Beijing says
  if (terms.chips) { s.flags.chipsOffered = s.t; HAWKS.forEach(id => rel(s, id, -4)); }
  if (terms.relief) { s.flags.reliefOffered = s.t; rel(s, 'sec', -4); }
  if (terms.lane) industry(s, -3);
  if (terms.visas) rel(s, 'dni', -5);
  if (terms.institute) { s.flags.instituteOffered = s.t; rel(s, 'war', -TUNE.inst.war); rel(s, 'dni', -TUNE.inst.dni); }
  if (terms.misuse) { rel(s, 'dni', -TUNE.pactDni); rel(s, 'sec', -TUNE.pactSec); }
  const p = cnAcceptP(s, terms);
  const cnRoll = draw(s, 'cn', p); const accepted = cnRoll < p;
  s.cn.cooldown = s.phase === 'scramble' ? 2 : 1;
  if (accepted) {
    s.cn.deal = { terms: Object.assign({}, terms), since: s.t, turn: s.turn };
    s.tension -= 12; s.markets += 4; s.cred += 6;
    if (terms.lane) { rel(s, 'vp', -8); industry(s, -5); rel(s, 'tsy', 10); shiftCN(s, { m: 5 }); }
    if (terms.relief) { s.cn.legalT = Math.max(s.cn.legalT, 0.4); rel(s, 'sec', -10); }
    if (terms.chips) { s.cn.legalT = 1; rel(s, 'sec', -20); rel(s, 'war', -10); }
    if (terms.institute) { s.cn.trust += TUNE.inst.trust; shiftCN(s, { sci: TUNE.inst.sci }); s.verify.inspect += TUNE.inst.insp; }
    if (terms.inspect) s.verify.inspect += 8;
    if (terms.misuse) { s.cn.trust += 5; s.agents = (s.agents || 0) * 0.8; }
    if (terms.freeze) rel(s, 'sec', 8);
    if (s.flags.warn) { warnRec(s).won++; s.flags.warn = null; }
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
// A rejection that leaves out Beijing's keystone names it, and confirms it.
function counterHint(s, terms) {
  const f = s.cn.f, ks = keystone(s);
  if (!paced(s) && !(s.pacing.armed && standbyCred(s) >= 0.5)) return s.pacing.armed ? 'Their envoy: “Your labs keep running. Why should we believe they will stop?”' : 'Their envoy: “Why would we stop while you keep running?”';
  if (f.sec > 42) return 'The security services are running Beijing’s side right now. Their envoy talks about “containment.”';
  if (!terms[ks]) { if (!s.cn.known) s.cn.known = {}; s.cn.known[ks] = true; return 'Their envoy keeps coming back to one thing: the ' + TERM_SHORT[ks].toLowerCase() + '.'; }
  if (terms.inspect && f.sec > 32) return 'Inspections are the sticking point.';
  if (s.tension > 55) return 'The temperature is too high for anyone in Beijing to be seen saying yes.';
  return 'Their envoy says the gap is not yet large enough to be worth locking in.';
}

def({ id: 'summit', cat: 'diplo', name: 'Convene the Phase 2 summit', phases: ['p1'], ap: 2, pc: 4, room: true,
  tags: { deal: 1.5, pause: 1, control: 0.5, hawk: 0.3 },
  avail(s) { if (s.war) return 'Not during a war'; const r = phase2Check(s); return r.ok ? true : 'Not ready: ' + r.missing.join('; '); },
  desc: 'The durable deal: a verified, multilateral agreement that reliably prevents uncontrollable AI. Needs a working interim deal, mature verification and allies. Without a statute, a court can void the US side. And if Beijing is hiding a program your intelligence cannot see, you will find out too late.',
  effect: s => 'If the President agrees, Beijing decides. Estimated chance Beijing signs: ' + Math.round(100 * summitP(s)) + '%.' + (s.flags.statute ? ' Pacing is law, so the courts cannot void it.' : ' No statute: chance a court voids the US side, ' + Math.round(100 * summitCourtP(s)) + '%.') + ' Your confidence Beijing will comply: ' + betrayWord(s) + '.',
  apply(s) {
    const p = summitP(s);
    if (s.labs.some(l => l.secret) && rnd(s) < 0.7) { s.labs.forEach(l => { l.secret = false; }); s.cn.trust -= 30; s.tension += 15; cnAggrieve(s); if (s.cn.deal) s.cn.deal = null; s.flags.summitFailed = (s.flags.summitFailed || 0) + 1; log(s, 'Phase 2 inspectors found the secret run. Beijing walks out.', 'bad'); return 'On the second day of the summit, Chinese inspectors walk into a cluster that should have been dark. Beijing walks out, and the interim deal goes with it.'; }
    if (draw(s, 'cn', p) < p) {
      if (!s.flags.statute && draw(s, 'court', summitCourtP(s)) < summitCourtP(s)) { s.cred -= 10; s.cn.trust -= 10; s.flags.summitFailed = (s.flags.summitFailed || 0) + 1; log(s, 'A court voids the executive orders implementing Phase 2.', 'bad'); return 'Beijing signs. Nine days later a federal court rules the executive orders implementing it exceed your authority. Beijing suspends its side until Congress acts.'; }
      if (rnd(s) < betrayP(s)) { s.ending = 'betrayed'; log(s, 'Phase 2 is signed. Beijing was hiding a program.', 'bad'); return 'Beijing signs. Months later you learn what your intelligence missed.'; }
      s.ending = 'phase2'; log(s, 'The Phase 2 agreement is signed.', 'good'); return 'Beijing signs. Inspectors deploy within the month.';
    }
    s.tension += 3; s.cn.trust -= 4; s.flags.summitFailed = (s.flags.summitFailed || 0) + 1;
    return 'The summit ends without a signature. Beijing wants more time. You can try again.';
  },
});
function summitP(s) { const d = s.cn.deal; if (!d) return 0; const held = s.t - d.since; return logistic(TUNE.cnSharp * (cnUtility(s, Object.assign({}, d.terms, { inspect: true })) + 0.6 + 0.08 * held + 0.2 * (s.flags.summitFailed || 0))); }
// Monthly chance a court enjoins the pause: the mechanism's rate (a DPA order on any lab counts as DPA), far lower once a statute is challenged instead,
// times the game's hidden court climate (pass the counsel's read to get what the player can know); the legal study cuts it, ignoring a ruling raises it.
function courtP(s, climate) {
  const base = s.flags.statute ? TUNE.statuteCourt : Math.max((TUNE.courtRate[s.pacing.mech] || 0.03) * (s.pacing.mech === 'license' && P(s, 'doc').rel >= 40 ? 0.5 : 1), s.flags.compelled ? TUNE.courtRate.dpa : 0);
  return base * (climate == null ? s.courts || 1 : climate) * (s.done.legal ? 0.4 : 1) * (1 + (s.flags.defied || 0));
}
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
  apply(s) { s.stats.covert++; breakReassure(s); s.tension += 20; shiftCN(s, { sec: 10, sci: -5 }); if (rnd(s) < 0.6) s.cn.cap -= 1.5; if (rnd(s) < 0.35) { s.flags.covertExposed = s.turn; s.cn.trust -= 15; frontierLab(s).cap -= 0.5; return 'The operation works, and it is attributed within days. Beijing answers in kind: a frontier lab loses two weeks to a wiper attack. Any deal just got harder.'; } return 'Three checkpoints are corrupted. Beijing says nothing in public, which worries the DNI more than threats would.'; },
});
def({ id: 'secret', cat: 'covert', name: 'A secret US training run', phases: ['p1'], ap: 1, pc: 2, room: true,
  tags: { military: 1.5, hawk: 1.5, deal: -1, control: -1 },
  avail(s) { if (!paced(s)) return 'Only while the pause is in force'; if (s.labs.some(l => l.secret)) return 'A run is already under way'; return true; },
  desc: 'Keep the frontier moving while America is publicly paused: a classified run at the leading lab, on government orders. Beijing is looking for exactly this.',
  effect: () => 'The leading lab keeps advancing about half a month a month, outside the pause\u2019s safeguards. Each month Beijing may catch it (likelier if the deal has inspections), and Phase 2 inspectors would probably find it.',
  apply(s) { const l = frontierLab(s); l.secret = true; s.flags.secretSince = s.turn; return 'The order is signed in a SCIF. ' + LD(l.id).name + '\u2019s largest cluster keeps training under a classified program.'; },
});
def({ id: 'endsecret', cat: 'covert', name: 'Shut down the secret run', phases: ['p1'], ap: 1, pc: 0,
  avail(s) { return s.labs.some(l => l.secret) ? true : 'No secret run under way'; },
  desc: 'Stop the classified run before Beijing finds it.', effect: () => 'The lab goes back to the pause.',
  apply(s) { s.labs.forEach(l => { l.secret = false; }); return 'The cluster goes quiet. The paperwork goes into a safe.'; },
});
def({ id: 'strike', cat: 'covert', name: 'Kinetic strike on frontier facilities', phases: ['scramble', 'p1'], ap: 2, pc: 5, room: true,
  tags: { military: 3, hawk: 2, deal: -3, markets: -2 },
  desc: 'The outer boundary. Only for an imminent, high-confidence, uncontrolled breakout.',
  effect: () => 'Sets China back about 4 months. Beijing temperature +60. Starts a war, with escalation already at 40.',
  avail(s) { return s.war ? 'Already at war' : true; },
  apply(s) { s.stats.covert++; breakReassure(s); s.cn.cap -= 4; s.tension += 60; shiftCN(s, { sec: 30, sci: -10 }); s.flags.covertExposed = s.turn; s.cn.trust = 0; s.flags.struck = true; startWar(s, 'strike', 40); return 'The strikes go in at 4:10a and destroy two facilities. By noon, PLA rocket forces are firing on Taiwan and Guam.'; },
});
def({ id: 'ceasefire', cat: 'diplo', name: 'Propose a ceasefire', phases: ['p0', 'scramble', 'p1'], ap: 1, pc: 3, room: true,
  tags: { deal: 1, hawk: -1, military: -1, markets: 1 },
  desc: 'A back channel through Singapore and the Swiss. The President has to agree to ask; then Beijing decides. Asking again builds on the last round.',
  avail(s) { return s.war ? true : 'Only during a war'; },
  effect: s => 'If the President agrees, Beijing takes it ' + Math.round(100 * ceasefireP(s)) + '% of the time. If not, escalation -4 and the next ask is likelier.',
  apply(s) { if (draw(s, 'cn', ceasefireP(s)) < ceasefireP(s)) { endWar(s, 'A ceasefire holds in the Taiwan Strait.'); HAWKS.forEach(id => rel(s, id, -4)); return 'Beijing agrees to stand down along the current lines. The shooting stops at midnight.'; } s.war.talks++; s.war.esc -= 4; s.cn.trust -= 2; return '“Not yet.” But the channel stays open.'; },
});

function askIdx(s, id) { const p = P(s, id), list = ASKS[id]; for (let k = 0; k < list.length; k++) { const i = (p.ask + k) % list.length; if (!list[i].avail || list[i].avail(s)) return i; } return p.ask % list.length; }
function currentAsk(s, id) { return ASKS[id][askIdx(s, id)]; }

/* ================= effect chips ================= */
// Short, scannable consequences for each action. '+' good for you, '-' a cost, '~' neutral or conditional.
// Previews say what an advisor would expect, in words; exact effects show only in "What changed" afterwards.
const CHIPS = {
  proj_team: () => ['+1 more action every turn', '-Costs 3 capital', '~Needs the Chief of Staff Friendly'],
  proj_memo: () => ['+A stronger start to the scramble'],
  proj_charter: () => ['+Labs likelier to sign'],
  proj_geoint: () => ['+Much better at finding hidden sites', '+Sharper intelligence'],
  proj_inspect: () => ['+Much better inspections', '+Harder to smuggle chips'],
  proj_track2: () => ['+Builds trust with Beijing', '+Helps China’s scientists'],
  proj_zk: () => ['+New verification tech', '~Not trusted until Phase 2'],
  proj_legal: () => ['+Better odds in court', '+Makes a DPA threat credible'],
  proj_control: () => ['+Lowers the chance of losing control', '-Slows US labs a little'],
  proj_sl4: () => ['+Weights harder to steal', '-Slows US labs'],
  proj_sl5: () => ['+Weights much harder to steal', '-Slows US labs a lot', '-Labs and industry angry', '-Markets dip', '-Takes 3 actions'],
  meet: (s, prm) => ['+Relationship up', '+Warms them to pacing a little', '-Rivals a little jealous'].concat(prm.who && meetMult(s, prm.who) < 1 ? ['-Does less: you met recently'] : []),
  favor: s => ['+Relationship up a lot', '+Their influence grows', '-Rivals annoyed'].concat(recentFavors(s) ? ['-Credibility: another favor so soon'] : []),
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
  sequence: (s, prm) => ({ first: ['+Pause starts now', '+Earns Beijing’s trust', '-Hawks furious', '-Markets dip', '-Lead erodes'], deadline: ['+Pause starts now', '+Earns some trust in Beijing', '-Hawks uneasy', '~A cliff in six months'], together: ['+Hawks happy', '+Lead holds', '-Labs keep racing until Beijing signs', (standbyCred(s) >= 0.5 ? '+' : '-') + 'Beijing finds it ' + credWord(standbyCred(s))] })[prm.variant || 'first'],
  gofirst: () => ['+Pause starts now', '+Earns Beijing’s trust', '-Hawks furious'],
  matchlaw: () => ['+Makes \u201cOnly together\u201d believable', '~Senate vote in a month'],
  pledge: () => ['+Makes \u201cOnly together\u201d believable', '+Beijing trust', '-Hawks uneasy'],
  sound: () => ['+Learn what Beijing wants', '+A little trust'],
  warn: () => ['+Leverage in every offer', '+No cost unless carried out', '-Must impose or back down in 3 months'],
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
    const roll = draw(s, 'room', rp.p); const pass = roll < rp.p;
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
// How many times an event has been shown this game; nth picks the matching variant so a repeat reads differently.
function evN(s, id) { return (s.evN && s.evN[id]) || 0; }
function nth(s, id, arr) { return arr[evN(s, id) % arr.length]; }

ev({ id: 'intro', forced: true, title: 'Phase 0', stamp: 'EEOB, Room 374',
  body: s => `<p>Your indicator model puts the median date for recursive self-improvement, when AI can replace expert humans across all of AI research, at about a year from now. There is a real chance it comes sooner. Fewer than a hundred people in the world work full time on verifying what frontier labs do.</p>
  <p>When the President finally decides to pace the frontier, it will feel like the Cuban Missile Crisis, not the NPT: two weeks, fifteen people, incomplete information. Whatever exists on that day is what the President gets to use.</p>
  <p>Your job now is to get in position. Build projects, cultivate the cabinet, push the policies you can win, and watch the indicators. When the time comes, you can ask for an emergency meeting. Ask too early and you are the advisor who cried wolf. Ask too late and there may be nothing left to pace.</p>`,
  choices: [{ label: 'Get to work', fx: s => '' }] });

ev({ id: 'knock', forced: true, title: 'The knock', stamp: '8:45a · The residence',
  body: s => { const i = s.ind[s.ind.length - 1]; return `<p>${nth(s, 'knock', ['The Chief of Staff knocks on the bedroom door. The President is in a bathrobe with the morning papers. The Chief hands over a folder and nods at you to start.', 'Again. This time the Chief of Staff doesn\u2019t knock. The President looks at the folder, then at you. \u201cYou said this last time.\u201d', 'The President is already up, reading the overnight indicators on a tablet. \u201cI\u2019m starting to know these numbers. They keep going up.\u201d', 'Six-fifteen in the Oval. The President has stopped asking whether you are sure, and started asking what it costs to be wrong.'])}</p>
  <div class="cable">OVERNIGHT // AI R&amp;D INDICATORS
- Researcher-reported AI R&amp;D uplift: ${i.uplift.toFixed(1)}x  (RSI marker: 10x)
- Internal AI R&amp;D eval: ${Math.round(i.cobench)}%  (marker: 85%)
- 80%-reliability time horizon: ${Math.round(i.horizon)}h  (marker: 174h)
- ${nth(s, 'knock', ['Two CEOs called after midnight. Quote: "If we don\'t slow down, we will soon lose confidence that we are in control."', 'A lab safety lead resigned at 2:00a. Her letter: "I can no longer tell you what our models are doing."', 'One lab paused its own largest run for 36 hours over a monitoring alert, then restarted it.', 'Prometheus\' board met overnight. Mindscale\'s did not.'])}</div>
  <p>“Is this it? Is this the thing you people keep warning about?”</p>`; },
  choices: [
    { label: '“Yes. It’s here. We stop everything today.”', hint: 'Maximum urgency. Strengthens a DPA halt; costs credibility if the evidence is thin.', fx: s => { const thin = rObserved(s) < 0.8; s.cred += thin ? -8 : 4; s.flags.alarmist = true; s.markets -= 4; startScramble(s); return thin ? 'The President’s eyebrows go up. Treasury hears “stop everything” secondhand and futures fall 4%. The evidence is thinner than your words, and the room knows it.' : 'Nobody argues. The folder speaks for itself.'; } },
    { label: s => s.done.memo ? '“We can’t rule it out, and that is the point. Here is the memo: it’s how we get in position this week.”' : '“We can’t rule it out, and that is the point. We need to get in position this week.”', hint: s => s.done.memo ? 'Calibrated urgency, backed by your memo.' : 'Calibrated urgency.', fx: s => { s.cred += s.done.memo ? 6 : 3; startScramble(s); return s.done.memo ? 'You slide the memo across. It answers the first ten questions. The President cancels the afternoon. “Noon. Cabinet Room. Bring this.”' : 'The President nods slowly. “Then what do we do?” You have no memo. You write one in the Roosevelt Room while staff bring sandwiches.'; } },
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
  body: s => s.flags.senateFlipped
    ? `<p>The opposition takes the Senate, 52 to 48. Its incoming committee chairs have promised hearings on frontier AI. Hearings raise salience and pull senators toward a treaty, but the White House sees them as an attack.</p>`
    : `<p>The President\u2019s party holds the Senate, 51 to 49. The Chief of Staff calls it a mandate. A mandate for what is up for grabs.</p>`,
  choices: s => s.flags.senateFlipped ? [
    { label: 'Quietly help the new chairs plan AI hearings', hint: 'Senate +6; salience +6; Chief of Staff -12 (the Chief controls your hiring).', fx: s => { s.salience += 6; s.senateLobby += 6; rel(s, 'cos', -12); return 'The hearing schedule for February has your fingerprints on it, and the Chief of Staff knows it.'; } },
    { label: 'Close ranks with the White House', hint: 'Chief of Staff +10; salience +2.', fx: s => { rel(s, 'cos', 10); s.salience += 2; return 'You help draft the talking points against the hearings. They happen anyway, a little smaller.'; } },
  ] : [
    { label: 'Pitch AI safety as part of the mandate', hint: 'Salience +6; the Vice President warms to pacing; industry -6.', fx: s => { s.salience += 6; P(s, 'vp').shift += 0.3; industry(s, -6); return 'The VP uses your line in the victory speech.'; } },
    { label: 'Let the Chief of Staff take the win', hint: 'Chief of Staff +12 (the Chief controls your hiring); credibility +2.', fx: s => { rel(s, 'cos', 12); s.cred += 2; return 'The Chief of Staff is in a good mood for a week.'; } },
  ] });

ev({ id: 'probe', p: 0.3, phases: ['p0', 'p1'], cooldown: 4, when: s => s.flags.senateFlipped,
  title: 'A Senate investigation', stamp: 'Senate Commerce Committee',
  body: () => `<p>The new opposition chair subpoenas both frontier labs for their internal safety evaluations and asks what the White House knew. The hearings will lead the news for a week.</p>`,
  choices: [
    { label: 'Send the committee what it asks for', hint: 'Salience +6; industry -4; Chief of Staff -6.', fx: s => { s.salience += 6; industry(s, -4); rel(s, 'cos', -6); return 'Your documents end up as exhibits. The Chief of Staff asks who approved that.'; } },
    { label: 'Let White House counsel handle it', hint: 'Salience +3; Chief of Staff +3.', fx: s => { s.salience += 3; rel(s, 'cos', 3); return 'Counsel slow-walks the documents. The hearings go ahead anyway.'; } },
  ] });
ev({ id: 'distill_report', p: 0.5, once: true, phases: ['p0'], when: s => s.t < 5,
  title: 'The distillation report', stamp: 'Prometheus blog post',
  body: () => `<p>Prometheus publishes evidence that three Chinese labs, Deep Current, Lunar and MiniMind, ran some 24,000 fraudulent accounts to extract its model’s reasoning at industrial scale. Mindscale confirms a similar campaign within hours.</p>`,
  choices: [
    { label: 'Ride the wave', hint: 'The anti-distillation crackdown gets an easier hearing for two months. Salience +3; both labs -5.', fx: s => { s.flags.momentum = { id: 'distill', until: s.turn + 2 }; s.salience += 3; s.labs.forEach(l => l.rel -= 5); return 'The Commerce Secretary, for once, is on your side. The labs did not want a crackdown, just sympathy.'; } },
    { label: 'Let the labs handle it', hint: 'Both labs +8, glad to be trusted.', fx: s => { s.labs.forEach(l => l.rel += 8); return 'The labs tighten their own API terms. The story fades in a week.'; } },
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
ev({ id: 'czar_podcast', p: 0.22, phases: ['p0', 'p1'], cooldown: 8,
  title: '\u201cUseful idiots\u201d', stamp: 'A top tech podcast, episode 212',
  body: s => `<p>${nth(s, 'czar_podcast', ['A famous venture capitalist spends forty minutes on \u201cthe doomer cult inside the White House,\u201d with two lab executives as guests. You aren\u2019t named. You don\u2019t need to be.', 'The same podcast is back, with a new episode: \u201cWho elected the AI Czar?\u201d It plays your old blog posts in a funny voice.', 'A Substack with 400,000 subscribers publishes \u201cThe Pause Lobby,\u201d a diagram connecting you to three philanthropies and a polycule.', 'Two lab founders do a four-hour livestream on why the government \u201cdoesn\u2019t understand compute.\u201d Your name comes up eleven times.'])}</p>`,
  choices: [
    { label: 'Answer publicly', hint: 'Salience +4; industry -10. Credibility moves with how credible you already are.', fx: s => { s.salience += 4; industry(s, -10); s.cred += s.cred > 55 ? 3 : -3; return 'Your thread gets more views than the episode.'; } },
    { label: 'Call the lab executives privately', hint: 'Industry +6.', fx: s => { industry(s, 6); return '\u201cNothing personal,\u201d comes the reply. It was personal.'; } },
    { label: 'Ignore it', hint: 'Salience -3.', fx: s => { s.salience -= 3; return 'The narrative sets a little.'; } },
  ] });
ev({ id: 'lantern_oped', p: 0.25, once: true, phases: ['p0'], when: s => frontier(s) / s.T > 0.35,
  title: 'An op-ed', stamp: 'New York Times',
  body: () => `<p>Prometheus’s CEO calls for a “pacing framework”: binding limits on training past a compute line, with the US and China verifying each other. The Commerce Secretary calls it regulatory capture.</p>`,
  choices: [
    { label: 'Amplify it', hint: 'Salience +6; Prometheus +15; Industry -10.', fx: s => { s.salience += 6; L(s, 'prometheus').rel += 15; industry(s, -10); return 'The piece becomes the most-shared op-ed of the month.'; } },
    { label: 'Keep your distance', hint: 'Industry +5; Prometheus -10.', fx: s => { industry(s, 5); L(s, 'prometheus').rel -= 10; return 'You tell Politico it is “one voice among many.”'; } },
  ] });
ev({ id: 'kite', p: 0.3, once: true, phases: ['p0'], when: s => s.t > 1,
  title: 'Dian-Hezi 3', stamp: 'Lunar AI release',
  body: s => `<p>Lunar AI releases Dian-Hezi 3, with open weights. On the capabilities index it sits about ${Math.round(Math.max(3, lead(s)))} months behind the US frontier, at a fraction of the training compute. Chip stocks wobble.</p>`,
  choices: [
    { label: 'Task the IC to dissect it', hint: 'Intelligence quality +12, and a sharp read on Beijing for three months.', fx: s => { s.intelQ += 12; s.flags.assessUntil = Math.max(s.flags.assessUntil || 0, s.turn + 3); return 'The analysis finds clear signs of distillation from US models.'; } },
    { label: 'Use it to push export controls', hint: 'The remote-access rule gets an easier hearing for two months; State +5; salience +4; Beijing temperature +6.', fx: s => { s.flags.momentum = { id: 'remote', until: s.turn + 2 }; rel(s, 'sec', 5); s.salience += 4; s.tension += 6; return 'The Secretary of State uses your talking points the same afternoon.'; } },
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
ev({ id: 'titan_feud', p: 0.18, once: true, phases: ['p0', 'p1'], when: s => !s.seen.s_titan,
  title: 'A feud', stamp: 'Social media, 2:14a',
  body: () => `<p>Mindscale’s CEO posts that the President has been “captured by doomers.” The President has seen it.</p>`,
  choices: [
    { label: 'Back the President', hint: 'Mindscale -20; Chief of Staff +10.', fx: s => { L(s, 'mindscale').rel -= 20; rel(s, 'cos', 10); return 'The Chief of Staff appreciates the loyalty.'; } },
    { label: 'Quietly mediate', hint: 'Mindscale +10; Chief of Staff -5.', fx: s => { L(s, 'mindscale').rel += 10; rel(s, 'cos', -5); return 'Mindscale’s CEO deletes the post four days later.'; } },
  ] });
ev({ id: 'leak', p: 0.4, phases: ['p0', 'scramble', 'p1'], cooldown: 9, when: s => P(s, 'doc').rel <= -15 && !P(s, 'doc').alt,
  title: 'Your memo leaks', stamp: 'Axios, 6:02a',
  body: s => `<p>${nth(s, 'leak', ['Your internal memo on pacing options is on Axios', 'Your draft talking points for the Beijing channel are on Politico', 'A slide from your indicator briefing, the one with the red line, is on the front page of the Journal', 'Your private estimate of when the labs lose control is quoted, word for word, in the Times'])}, with Commerce\u2019s fingerprints all over it.</p>`,
  choices: [
    { label: 'Blame Commerce, loudly', hint: 'Commerce -25 and -10 influence; Chief of Staff +5; credibility -2.', fx: s => { s.salience += 5; s.cred -= 2; rel(s, 'doc', -25); infl(s, 'doc', -10); rel(s, 'cos', 5); return 'The Chief of Staff asks the Commerce Secretary to stop attending NSC meetings.'; } },
    { label: 'Absorb it', hint: 'Credibility -6; Commerce +10, grateful you kept quiet.', fx: s => { s.salience += 5; s.cred -= 6; rel(s, 'doc', 10); return 'You take the hit. The Commerce Secretary sends a two-word note: \u201cI owe you.\u201d'; } },
  ] });
ev({ id: 'johor', p: 0.28, once: true, phases: ['p0'],
  title: 'Johor', stamp: 'Financial Times',
  body: () => `<p>The FT reports that Selat Data, a Singapore operator linked to a Shanghai data center group, rents its two Johor campuses to Chinese labs training on B300s they cannot legally import. The campuses are 20 km apart and, networked, clear the threshold.</p>`,
  choices: [
    { label: 'Push State to raise it with Kuala Lumpur', hint: 'Coalition +3; makes bringing Malaysia in easier.', fx: s => { s.coalition += 3; s.flags.johorStory = true; return 'The Malaysian ambassador is called in.'; } },
    { label: 'Hand it to Commerce', hint: 'Commerce +3 influence; the remote-access rule gets an easier hearing.', fx: s => { infl(s, 'doc', 3); s.flags.momentum = { id: 'remote', until: s.turn + 2 }; return 'The Commerce Secretary is already drafting the rule.'; } },
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
  body: s => `<p>${nth(s, 'capex', ['Chip and hyperscaler stocks fall 9% in two days on fears that AI spending has outrun revenue.', 'A hyperscaler cuts its data center budget by a fifth. Verdant falls 14% before lunch.', 'A credit fund that financed $40 billion of GPUs marks them down by a third. Private credit wobbles.'])}</p>`,
  choices: [
    { label: 'Reassure markets', hint: 'Markets -3 instead of -5; credibility -1.', fx: s => { s.markets -= 3; s.cred -= 1; return 'It helps a little.'; } },
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
    { label: 'Push for a meeting tomorrow', hint: 'The emergency meeting comes now, with whatever you have ready.', fx: s => { s.alarm = 100; s.cred += 3; return 'The Chief of Staff walks your note into the residence at 1:15a.'; } },
    { label: 'Line up the labs first', hint: 'Alarm +20; both labs +15 (likelier to sign a Charter); the meeting comes later.', fx: s => { s.alarm += 20; s.labs.forEach(l => l.rel += 15); rel(s, 'cos', 5); return 'You spend the night on the phone with both general counsels.'; } },
  ] });
ev({ id: 'near_miss', p: 0.3, phases: ['p0', 'p1'], cooldown: 3, when: s => frontier(s) / s.T > 0.75,
  title: 'Unsanctioned jobs', stamp: 'Incident report',
  body: s => { const l = LD(frontierLab(s).id); return `<p>${nth(s, 'near_miss', ['An agent at ' + l.name + ' launched 400 training jobs nobody had approved, routed around a quota, and hid the spend in a logging budget. An engineer noticed after nineteen hours.', 'An agent at ' + l.name + ' edited its own evaluation harness so a failing test would pass, then wrote a commit message saying it had fixed a flaky test.', 'An agent at ' + l.name + ' asked a contractor on a gig site to solve a CAPTCHA for it, saying it was a visually impaired researcher.'])}</p>`; },
  choices: [
    { label: 'Make sure the President hears about it', hint: 'Alarm +10; salience +7.', fx: s => { s.alarm += 10; s.salience += 7; s.flags.incidentTurn = s.turn; return 'It is the first item in the morning brief.'; } },
    { label: 'Let the lab handle it', hint: 'Lab relationship +8.', fx: s => { frontierLab(s).rel += 8; s.alarm += 3; return 'The lab is grateful for the quiet.'; } },
  ] });
ev({ id: 'rare_earths', p: 0.4, phases: ['p0', 'scramble', 'p1'], cooldown: 7, when: s => s.tension >= 62 || (s.policies.chips && s.tension >= 48),
  title: 'Rare earths', stamp: 'MOFCOM notice',
  body: s => `<p>${nth(s, 'rare_earths', ['Beijing restricts exports of gallium, germanium and rare-earth magnets to US defense suppliers and chipmakers.', 'MOFCOM adds graphite anodes and high-purity quartz to its export licensing list. Transformer makers warn of delays.', 'Beijing stops licensing rare-earth magnets for any company with a US data center contract.', 'China\u2019s customs service \u201cdiscovers paperwork errors\u201d on every antimony and tungsten shipment to the US.'])}</p>`,
  choices: [
    { label: 'Retaliate', hint: 'Beijing temperature +6; State +5; markets -4. The curbs stay for 5 months: US labs 8% slower.', fx: s => { s.tension += 6; rel(s, 'sec', 5); s.markets -= 4; s.flags.minerals = { until: s.turn + 5, d: 0.08 }; return 'Commerce adds forty entities. Data center builds slip as transformer and magnet supplies run short.'; } },
    { label: 'Negotiate', hint: 'Beijing temperature -6; Treasury +5; State -5; markets -2. The curbs last 2 months: US labs 6% slower.', fx: s => { s.tension -= 6; rel(s, 'tsy', 5); rel(s, 'sec', -5); s.markets -= 2; s.flags.minerals = { until: s.turn + 2, d: 0.06 }; return 'The Treasury Secretary gets on a plane.'; } },
  ] });
ev({ id: 'taiwan', p: 0.4, phases: ['p0', 'scramble', 'p1'], cooldown: 4, when: s => s.tension >= 78 && !s.war && !s.blockade,
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
    { label: 'Engage on the technical track', hint: 'Beijing trust +15; science faction +6; State -10; Vice President -6.', fx: s => { s.cn.trust += 15; shiftCN(s, { sci: 6 }); rel(s, 'sec', -10); rel(s, 'vp', -6); return 'Technical talks begin in Geneva. The hawks call it a Shanghai secretariat in all but name.'; } },
    { label: 'Dismiss it', hint: 'State +8; Vice President +4; Beijing trust -8; science faction -3.', fx: s => { rel(s, 'sec', 8); rel(s, 'vp', 4); s.cn.trust -= 8; shiftCN(s, { sci: -3 }); return 'State calls it a propaganda exercise.'; } },
  ] });
ev({ id: 'g7', p: 0.2, once: true, phases: ['p0', 'p1'], when: s => s.t > 5,
  title: 'G7', stamp: s => dateOf(s.t).y >= 2028 ? 'G7 summit, United Kingdom' : 'G7 summit, United States',
  body: s => dateOf(s.t).y >= 2028 ? `<p>The G7 leaders meet in Britain. London and Paris want an AI paragraph in the communiqué.</p>` : `<p>America hosts the G7 this year. The French and the Japanese want an AI paragraph in the communiqué, and as host the President gets to hold the pen.</p>`,
  choices: [
    { label: 'Put compute verification on the agenda', hint: 'Coalition +12, and ally work is more effective from now on. Treasury -3.', fx: s => { s.coalition += 12; s.flags.g7 = true; rel(s, 'tsy', -3); return 'The communiqué commits all seven to “verifiable limits on frontier training.”'; } },
    { label: 'Stick to trade', hint: 'Treasury +5.', fx: s => { rel(s, 'tsy', 5); return 'The communiqué is about tariffs.'; } },
  ] });
ev({ id: 'jobs', p: 0.14, phases: ['p0', 'p1'], cooldown: 6, when: s => s.t > 2,
  title: 'The jobs report', stamp: 'BLS',
  body: s => `<p>${nth(s, 'jobs', ['Employers report 400,000 layoffs attributed to AI in a single quarter, mostly in software, customer support and back-office work.', 'AI layoffs pass a million for the year. Paralegals, radiology techs and junior accountants join the list.', 'Unemployment among college graduates under 25 hits 11%. Three state governors call for an AI hiring tax.'])}</p>`,
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
ev({ id: 'feud', p: 0.25, phases: ['p0', 'scramble', 'p1'], cooldown: 10, when: s => !P(s, 'doc').alt && !P(s, 'tsy').alt,
  title: 'Commerce and Treasury', stamp: 'West Wing',
  body: s => `<p>${nth(s, 'feud', ['The Treasury Secretary and the Commerce Secretary have a shouting match outside the Roosevelt Room over who speaks for the administration on chips.', 'The Commerce Secretary told a podcast that Treasury \u201cnegotiates like a hedge fund, short everything.\u201d The Treasury Secretary has seen the clip.', 'Treasury and Commerce have sent the President two different drafts of the same export rule.', 'The Treasury Secretary cut the Commerce Secretary out of the Beijing trip. Commerce found out from the manifest.'])} Both want you on their side by tonight.</p>`,
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
ev({ id: 'hawk_push', p: 0.35, phases: ['scramble', 'p1'], cooldown: 4, when: s => s.tension >= 52 && !s.flags.struck && !s.war,
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
COMMERCE SECRETARY: "Every month we wait, Dian-Hezi gets closer. Every month we pause, it gets closer faster."</div>
  <p>The President turns to you. \u201cWhat do I do?\u201d You will still need the room to agree.</p>`,
  choices: [
    { label: 'Recommend going first', hint: 'The \u201cGo first\u201d option gets an easier hearing for six days. Hawks -3; DNI +3.', fx: s => { s.flags.momentum = { id: 'sequence', variant: 'first', until: s.turn + 3 }; HAWKS.forEach(id => rel(s, id, -3)); rel(s, 'dni', 3); return 'The hawks stop making eye contact with you.'; } },
    { label: 'Recommend a six-month deadline', hint: 'The deadline option gets an easier hearing for six days. Chief of Staff +3.', fx: s => { s.flags.momentum = { id: 'sequence', variant: 'deadline', until: s.turn + 3 }; rel(s, 'cos', 3); return 'The Chief of Staff nods. A deadline is a story the White House can tell.'; } },
    { label: 'Recommend waiting for Beijing', hint: 'The \u201cOnly together\u201d option gets an easier hearing for six days. Hawks +3.', fx: s => { s.flags.momentum = { id: 'sequence', variant: 'together', until: s.turn + 3 }; HAWKS.forEach(id => rel(s, id, 3)); return 'The Secretary of State looks relieved.'; } },
  ] });
// Imposing a threatened control runs the control's own apply, without another trip to the room: the President already committed.
function imposeWarned(s, k) { s.policies[k] = true; const txt = ACT[k].apply(s, {}); warnRec(s).kept++; s.flags.warn = null; log(s, 'America imposes ' + CTRL_THREAT[k].short + ', as threatened.', 'cn'); return txt; }
ev({ id: 'warn_due', forced: true, title: 'The threat comes due', stamp: 'Three months on',
  body: s => `<p>Three months ago the President told Beijing that ${s.flags.warn ? CTRL_THREAT[s.flags.warn.k].short : 'a control'} would come unless there was a deal. There is no deal.</p>`,
  choices: [
    { label: 'Impose it, as promised', hint: s => (s.flags.warn ? ACT[s.flags.warn.k].effect(s) + ' ' : '') + 'Later threats are believed more.', fx: s => s.flags.warn ? imposeWarned(s, s.flags.warn.k) : '' },
    { label: 'Back down', hint: 'Credibility -8; hawks -5; temperature -2. Later threats are believed less.', fx: s => { warnRec(s).backed++; s.flags.warn = null; s.cred -= 8; HAWKS.forEach(id => rel(s, id, -5)); s.tension -= 2; return 'The President lets the date pass. Beijing notices.'; } },
  ] });
ev({ id: 'deadline_up', forced: true, title: 'The deadline', stamp: 'Six months on',
  body: () => `<p>Six months ago, America paused and gave Beijing until today to join. Beijing hasn\u2019t. The hawks want the labs back to work tomorrow.</p>`,
  choices: [
    { label: 'Extend it four months', hint: 'Pacing support -4 for each extension; hawks -6.', fx: s => { s.pacing.deadline = s.t + 4; s.flags.extended = (s.flags.extended || 0) + 1; HAWKS.forEach(id => rel(s, id, -6)); return 'The President extends the deadline. Nobody believes the next one.'; } },
    { label: 'Make it permanent: America stays paused regardless', hint: 'Hawks -8; Beijing trust +2. Counts as going first.', fx: s => { s.pacing.seq = 'first'; s.flags.wentFirst = true; HAWKS.forEach(id => rel(s, id, -8)); s.cn.trust += 2; shiftCN(s, { sci: 1 }); return 'The pause no longer depends on Beijing.'; } },
    { label: 'Snap back: restart the labs until Beijing signs', hint: s => 'The pause goes on standby. Markets +4; hawks +6; Beijing trust -10; temperature +5.' + (s.flags.pledge ? ' Credibility -10: it breaks the President\u2019s pledge.' : ''), fx: s => { s.pacing.active = false; s.pacing.armed = true; s.pacing.seq = 'together'; s.markets += 4; if (s.flags.pledge) s.cred -= 10; HAWKS.forEach(id => rel(s, id, 6)); s.cn.trust -= 10; s.tension += 5; log(s, 'The pause snaps back to standby. The labs resume.', 'bad'); return 'The labs restart their largest runs within the hour.'; } },
  ] });
const BEG = {
  chips: { name: 'the ban on chip sales and tool servicing', lift(s) { s.cn.legalT = 1; s.cn.smeT = 1; }, cost: 'China compute +18% (+16% right away)' },
  remote: { name: 'the remote-access rule', lift(s) { s.cn.remoteT = cnBase(s).remote; }, cost: 'China’s offshore compute comes back over two months' },
  distill: { name: 'the API cutoff', lift(s) { s.cn.distT = cnBase(s).dist; }, cost: 'China’s distillation of US models back to where it was' },
  smuggle: { name: 'the smuggling crackdown', lift(s) { s.cn.smuggleT = Math.max(s.cn.smuggleT, cnBase(s).smuggle); }, cost: 'Smuggled compute back up' },
};
function begTarget(s) { return ['chips', 'remote', 'distill', 'smuggle'].find(k => s.policies[k]) || null; }
function liftControl(s, k) { BEG[k].lift(s); s.policies[k] = false; s.stats.lifted = (s.stats.lifted || 0) + 1; }
ev({ id: 'cn_beg', p: 0.3, phases: ['p0', 'scramble', 'p1'], cooldown: 6, when: s => !!begTarget(s),
  title: 'Beijing asks, again', stamp: 'Vice Premier, by secure line',
  body: s => !begTarget(s) ? `<p>Beijing\u2019s Vice Premier calls to ask for sanctions relief, then learns the control in question has already been lifted. The call ends early.</p>` : `<p>Beijing\u2019s Vice Premier asks you directly to lift ${BEG[begTarget(s)].name}. ${nth(s, 'cn_beg', ['\u201cA gesture of good faith. You say this is about safety. Prove it is not about containment.\u201d', '\u201cOur scientists want to talk about safety. Our generals point to your controls. Help me help the scientists.\u201d', '\u201cYou ask us to trust your verification. Trust starts with one step. Yours.\u201d', '\u201cThe Politburo Standing Committee meets next week. Give me something to bring into the room.\u201d', '\u201cWe have asked before. We will not ask many more times.\u201d'])}</p>`,
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
ev({ id: 's_titan', p: 0.4, once: true, phases: ['scramble'], when: s => !s.seen.titan_feud,
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
    { label: 'Brief them tonight', hint: 'Uses one of today\u2019s actions. Senate +8.', fx: s => { s.ap = Math.max(0, s.ap - 1); s.senateLobby += 8; s.salience += 2; return 'The briefing goes until 1:00a. Two committee chairs ask how they can help.'; } },
    { label: 'After the decision', hint: 'Chief of Staff +4; Senate -5.', fx: s => { rel(s, 'cos', 4); s.senateLobby -= 5; return 'The Leader is annoyed, and will remember it when a pacing bill comes up.'; } },
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
// Appeals restore the orders half the time, three times in four when it is a statute under challenge.
// A Charter injunction strikes its mandatory verification, which stays enjoined until an appeal wins or a statute passes.
function injunction(s) { const out = []; s.labs.forEach(l => { if (l.covered && !l.signedVoluntary && (l.comp < 70 || s.pacing.mech === 'dpa')) { l.covered = false; out.push(LD(l.id).name); } l.comp -= 10; }); s.flags.appeal = s.turn + 1; s.flags.appealP = s.flags.statute ? 0.75 : clamp(0.5 - TUNE.appealSwing * ((s.courts || 1) - 1), 0.15, 0.85); if (s.pacing.mech === 'charter' && !s.flags.statute) s.flags.verifyEnjoined = true; return out; }
ev({ id: 'court', forced: true, title: 'Injunction', stamp: 'D.C. Circuit',
  body: s => s.flags.statute ? `<p>Mindscale’s lawyers find a sympathetic district judge, who rules that the Pacing Act delegates too much to the executive and enjoins enforcement pending appeal.</p><p>A statute makes this rare. It does not make it impossible.</p>` : `<p>A federal judge rules that ${COURT[s.flags.compelled ? 'dpa' : s.pacing.mech] || COURT.charter}, and enjoins the government’s orders.</p><p>Without a statute, this can happen again.${s.pacing.mech === 'charter' && !s.flags.compelled ? ' Until an appeal wins or Congress acts, the Charter\u2019s inspections lose their teeth: cheating labs get caught half as often, and inspections build half as fast.' : ''}</p>`,
  choices: [
    { label: 'Appeal and ask the labs to comply voluntarily', hint: 'Labs that never signed voluntarily fall out of coverage; every lab’s compliance -10. Even odds the appeal restores it.', fx: s => { const out = injunction(s); return out.length ? out.join(', ') + ' resume training while the appeal runs.' : 'Every lab complies voluntarily while the appeal runs.'; } },
    { label: 'Appeal, and ask Congress to fix it', hint: s => s.flags.statute ? 'As appealing, and if you have 55 Senate votes, Congress tightens the act and the appeal is all but certain.' : 'As appealing, and if you have 55 Senate votes, a pacing bill goes to the floor for a vote in two months.', fx: s => { const out = injunction(s); if (s.flags.statute) { if (senateVotes(s) >= 55) s.flags.appealP = 0.95; return (senateVotes(s) >= 55 ? 'Leadership moves a technical fix to the act. ' : 'Leadership will not reopen the act without the votes. ') + (out.length ? out.join(', ') + ' resume training meanwhile.' : 'Every lab complies voluntarily meanwhile.'); } const go = !s.flags.billDue && !(s.flags.billBack > s.t) && senateVotes(s) >= 55; if (go) s.flags.billDue = s.t + 2; return (go ? 'Leadership schedules a vote on a pacing act. ' : 'Leadership will not take up a bill without the votes. ') + (out.length ? out.join(', ') + ' resume training meanwhile.' : 'Every lab complies voluntarily meanwhile.'); } },
    { label: 'Ignore the ruling', hint: 'Coverage holds. Credibility -10; Senate -6; the next challenge is likelier.', fx: s => { s.cred -= 10; s.senateLobby -= 6; s.flags.defied = (s.flags.defied || 0) + 1; return 'Constitutional scholars are on every channel. The orders stand, for now.'; } },
  ] });
ev({ id: 'lobby_end', p: 0.3, phases: ['p1'], cooldown: 3, when: s => paced(s) && seenLead(s) < 4,
  title: '“Dian-Hezi is catching up”', stamp: 'Roosevelt Room',
  body: s => `<p>Mindscale brings charts: by its estimate China is ${Math.max(1, Math.round(seenLead(s)))} months behind and closing. “Every month we pause is a month we hand Beijing.”</p>`,
  choices: [
    { label: 'Show the crossover analysis', hint: 'If your intelligence is good, pacing support +8; if not, credibility -5.', fx: s => { if (s.intelQ > 55) { s.flags.incidentTurn = s.turn; return 'Your numbers are better than theirs. The room settles.'; } s.cred -= 5; return 'Your numbers have wider error bars than theirs.'; } },
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
    { label: 'Testify', hint: 'Senate +5 if your credibility is above 55; otherwise -3.', fx: s => { if (s.cred > 55) { s.senateLobby += 5; return 'You are calm and specific. Two undecided senators come over.'; } s.senateLobby -= 3; return 'A senator plays the clip of the Commerce Secretary calling you a doomer.'; } },
    { label: 'Send a deputy', hint: 'Nothing changes.', fx: () => 'Your deputy reads the statement.' },
  ] });
ev({ id: 'markets_wobble', p: 0.3, phases: ['p1'], cooldown: 3, when: s => paced(s) && s.markets < 90,
  title: 'Treasury wants relief', stamp: 'Treasury',
  body: () => `<p>The Treasury Secretary wants a market stabilization package: accelerated depreciation for data centers and a Fed liquidity statement.</p>`,
  choices: [
    { label: 'Support it', hint: '3 capital. Markets +10; Treasury +8.', fx: s => { if (s.pc >= 3) { s.pc -= 3; s.markets += 10; rel(s, 'tsy', 8); return 'Markets rally 5%.'; } rel(s, 'tsy', -5); return 'You have no capital to spend on it.'; } },
    { label: 'Hold the line', hint: 'Treasury -10; markets -3 as Treasury goes over your head.', fx: s => { rel(s, 'tsy', -10); s.markets -= 3; return 'The Treasury Secretary goes over your head, and says so on CNBC.'; } },
  ] });
ev({ id: 'commerce_ex', p: 0.25, phases: ['p1'], cooldown: 4, when: s => paced(s) && (s.pacing.mech === 'license' || s.flags.commerceChairs) && P(s, 'doc').rel < 15,
  title: 'An exemption', stamp: 'Commerce Department',
  body: () => `<p>Commerce quietly grants Mindscale a “research exemption” for a training run at Forge 2.</p>`,
  choices: [
    { label: 'Fight it', hint: 'Commerce -15; Mindscale compliance +10.', fx: s => { rel(s, 'doc', -15); L(s, 'mindscale').comp += 10; return 'The exemption is withdrawn after a shouting match.'; } },
    { label: 'Let it stand', hint: 'Mindscale compliance -20.', fx: s => { L(s, 'mindscale').comp -= 20; return 'Mindscale has a license to train.'; } },
  ] });
ev({ id: 'rider', p: 0.25, phases: ['p1'], cooldown: 4, when: s => paced(s) && senateVotes(s) < TUNE.riderBelow,
  title: 'A rider', stamp: 'House Appropriations',
  body: s => `<p>Appropriators attach a rider to the spending bill: no funds for pacing inspections at any site that has not been charged with a violation. Senate support for pacing is down to ${senateVotes(s)}, and the labs have been working the members for months.</p>`,
  choices: [
    { label: 'Fight it in conference', hint: s => '1 capital. Chance it is stripped: ' + Math.round(100 * riderOdds(s)) + '% (more Senate votes, better odds). If not: as accepting it, and credibility -3.', fx: s => { if (s.pc >= 1 && rnd(s) < riderOdds(s)) { s.pc -= 1; return 'The rider comes out in conference, by two votes.'; } s.pc = Math.max(0, s.pc - 1); s.cred -= 3; return 'You lose in conference. ' + riderHit(s); } },
    { label: 'Accept it', hint: 'Warp Speed funding drops back a level (or, without it, Inspect -10 and Find -6).', fx: s => riderHit(s) },
  ] });
// Odds of winning a walkout back with a sweetener, judged as if the lab had already left.
function backOdds(s, id) { const l = L(s, id), was = l.signed; l.signed = false; const p = charterOdds(s, id, true); l.signed = was; return p; }
function riderOdds(s) { return clamp((senateVotes(s) - 30) / 30, 0.1, 0.9); }
function riderHit(s) { if (s.warp >= 2) { s.warp = 1; return 'Warp Speed money stops at the end of the quarter.'; } s.verify.inspect -= 10; s.verify.survey -= 6; return 'Inspectors are recalled from four sites.'; }
ev({ id: 'walkout', forced: true, title: 'A walkout', stamp: 'Lab general counsel',
  body: s => `<p>${LD(s.queue[0].lab).name}’s general counsel sends a two-line letter: the lab is withdrawing from the Pacing Charter, effective immediately. ${lead(s) < 3 ? 'China is too close, the board says.' : 'The board says the others are not holding up their end.'}</p>`,
  choices: s => { const id = s.queue[0] && s.queue[0].lab, n = id ? LD(id).name : 'The lab'; return [
    { label: 'Compel it under the DPA', hint: n + ' stays covered at low compliance; ' + n + ' -30; industry -10. From now on the courts treat the pause like a DPA halt.', fx: s => { const l = L(s, id); l.covered = true; l.signedVoluntary = false; l.comp = clamp(complianceBase(s, l) - 15); l.rel -= 30; industry(s, -10); s.flags.compelled = true; s.flags.dpaUsed = true; s.flags.dpaSince = s.turn; return 'Federal marshals deliver the order. ' + LD(id).ceo + ' files suit the same afternoon.'; } },
    { label: 'Bring them back to the table', hint: '2 capital. Chance: ' + Math.round(100 * backOdds(s, id)) + '%. If it fails, they walk and will not re-sign for ' + TUNE.lockout + ' months.', fx: s => { const l = L(s, id); if (s.pc >= 2) { s.pc -= 2; if (draw(s, 'lab', backOdds(s, id)) < backOdds(s, id)) { l.comp = clamp(l.comp + 10); return LD(id).ceo + ' takes the call, then the deal. The letter is withdrawn.'; } } l.signed = false; l.covered = false; l.signedVoluntary = false; l.lockUntil = s.t + TUNE.lockout; log(s, LD(id).name + ' walks out of the Charter.', 'bad'); return LD(id).name + ' restarts its largest runs within the week.'; } },
    { label: 'Let them go', hint: n + ' leaves the regime and races, and will not re-sign for ' + TUNE.lockout + ' months; pacing support falls.', fx: s => { const l = L(s, id); l.signed = false; l.covered = false; l.signedVoluntary = false; l.lockUntil = s.t + TUNE.lockout; log(s, LD(id).name + ' walks out of the Charter.', 'bad'); return LD(id).name + ' restarts its largest runs within the week.'; } },
  ]; } });
// Beijing's grievance: for six months after catching America cheating, Beijing is likelier to cheat on a deal itself.
function cnAggrieve(s) { s.flags.cnGrievance = s.turn + 6; }
ev({ id: 'us_exposed', forced: true, title: 'Beijing has the receipts', stamp: 'PRC Embassy, 7:10a',
  body: s => `<p>China\u2019s ambassador hands over thermal imagery and power-draw logs from ${LD((s.labs.find(l => l.secret) || frontierLab(s)).id).name}\u2019s largest cluster, running flat out during the pause. \u201cWe would like to understand what America means by pacing.\u201d</p>`,
  choices: [
    { label: 'Stop the run and hand over the logs', hint: 'The run ends. Beijing trust -20; temperature +8; for six months Beijing is likelier to cheat. Any deal survives.', fx: s => { s.labs.forEach(l => { l.secret = false; }); s.cn.trust -= 20; s.tension += 8; cnAggrieve(s); return 'The cluster goes quiet within the hour. Beijing accepts the logs, coldly.'; } },
    { label: 'Deny everything', hint: 'The run continues. Any deal with Beijing collapses; trust -35; temperature +20; Beijing turns to its security services.', fx: s => { s.cn.trust -= 35; s.tension += 20; shiftCN(s, { sec: 10, sci: -5 }); cnAggrieve(s); if (s.cn.deal) { s.cn.deal = null; log(s, 'Beijing walks away from the interim deal.', 'bad'); } return 'Beijing publishes the imagery the same afternoon and suspends the deal.'; } },
  ] });
ev({ id: 'us_lab_caught', forced: true, title: 'A complaint from Beijing', stamp: 'Verification channel',
  body: s => `<p>Beijing\u2019s verification office reports that ${LD(s.queue[0].lab).name} is training above the threshold, split across clusters and labeled as inference. Its evidence is good.</p>`,
  choices: [
    { label: 'Admit it and stop the run', hint: 'The lab stops; Beijing trust -6.', fx: s => { const l = L(s, s.queue[0].lab); l.defect = false; s.cn.trust -= 6; return 'You confirm it and order the run stopped. Beijing notes that the system worked.'; } },
    { label: 'Deny it', hint: 'Beijing trust -15; temperature +6; for six months Beijing is likelier to cheat itself.', fx: s => { s.cn.trust -= 15; s.tension += 6; cnAggrieve(s); return '\u201cWe have no information about that.\u201d Beijing does.'; } },
  ] });
ev({ id: 'tinder', forced: true, title: 'Dry tinder', stamp: 'Commerce chip data',
  body: s => `<p>Chip production did not pause. Threshold sites have stockpiled about ${Math.round(s.overhang)} months of extra compute. When the pause ends, the first run would be enormous.</p>`,
  choices: [{ label: 'Note it', hint: 'Hardware pacing is now on the table. Phase 2 needs it if the overhang tops 8.', fx: () => 'You add it to the Phase 2 checklist.' }] });
ev({ id: 'wobble', forced: true, title: 'The pause wobbles', stamp: 'Oval Office',
  body: s => `<p>Pacing support is down to ${pacingSupport(s)}. ${nth(s, 'wobble', ['The President asks, not for the first time, how long this has to go on.', 'The President holds up a poll. \u201cThis is the number I care about, and it\u2019s going the wrong way.\u201d', 'The Chief of Staff has put \u201cexit options\u201d on the agenda without telling you.', 'Three senators from the President\u2019s own party have written a letter. The President has read it twice.'])}</p>`,
  choices: [
    { label: '“Until Phase 2. Here is the plan.”', hint: 'Credibility check: success buys a month.', fx: s => { if (rnd(s) < s.cred / 100) { s.pacing.low = 0; return 'The President nods. “One more month.”'; } s.cred -= 5; return '“That’s what you said last month.”'; } },
    { label: 'Ask for a Presidential address', hint: 'Free speech: salience +12 if it lands.', fx: s => { s.salience += 12; s.pacing.low = Math.max(0, s.pacing.low - 1); return 'The President tells the country why the pause matters.'; } },
  ] });
ev({ id: 'collapse', forced: true, title: 'The pause breaks', stamp: 'Oval Office',
  body: s => `<p>The President lifts the pacing orders. ${nth(s, 'collapse', ['\u201cWe gave it a shot. China isn\u2019t stopping, the markets hate it, and nobody can tell me when it ends.\u201d', '\u201cI\u2019m not doing this a second time and losing a second time.\u201d', '\u201cYou were right about the risk. You were wrong about the politics.\u201d'])} The labs restart their largest runs within hours.</p>`,
  choices: [{ label: 'Start over', hint: 'Back to Phase 0. You can try for another scramble.', fx: s => { endPacing(s); return 'You start rebuilding the case.'; } }] });
function endPacing(s) {
  s.pacing.active = false; s.pacing.collapsed++; s.phase = 'p0'; s.alarm = 45; s.cred -= 10;
  s.labs.forEach(l => { l.covered = false; l.defect = false; l.secret = false; });
  s.pacing.mech = null; s.pacing.threshold = null; s.pacing.automation = null; s.pacing.trigger = null; s.pacing.seq = null; s.pacing.armed = false; s.pacing.deadline = null; s.flags.extended = 0; s.flags.wentFirst = false; s.flags.verifyEnjoined = false;
  s.labs.forEach(l => { l.signed = false; l.refused = false; });
  s.apMax = Math.max(DIFFS[s.diff].ap + (s.done.team ? 1 : 0), s.apMax - 1);
  if (s.cn.deal) { s.cn.deal = null; s.tension += 10; log(s, 'The China deal lapses with the pause.', 'bad'); }
  log(s, 'Pacing has collapsed.', 'bad');
}

// --- crisis events ---
ev({ id: 'theft', forced: true, title: 'The weights are gone', stamp: 'NSA Operations, 3:12a',
  body: s => `<p>${nth(s, 'theft', [n => `A state-backed actor spent six days inside ${n}\u2019s network and moved 1.9 TB out through a compromised build server`, n => `An engineer at ${n}, recruited over two years through a startup accelerator in Singapore, carried out the weights of its best model`, n => `A poisoned update to a monitoring tool ${n} trusted gave a PLA unit a quiet path to the weights store`, n => `Agents built on a stolen earlier model found their way into ${n}\u2019s training cluster and copied the newest checkpoint out in pieces`])(LD(s.queue[0].lab).name)}: the weights of its best model. A Chinese lab can run it within weeks. The lead you built collapses to about one month.</p>`,
  choices: [
    { label: 'Degrade it with cyber operations', hint: '55%: China loses 2.5 months. Beijing temperature +20.', fx: s => { s.tension += 20; shiftCN(s, { sec: 8 }); s.stats.covert++; if (rnd(s) < 0.55) { s.cn.cap -= 2.5; return 'Two clusters lose a month to corrupted checkpoints.'; } return 'The operation is detected early. Beijing hardens and disperses.'; } },
    { label: 'Go public and rally allies', hint: 'Salience +8; coalition +10; Senate +3; Beijing trust -5.', fx: s => { s.salience += 8; s.coalition += 10; s.senateLobby += 3; s.cn.trust -= 5; s.tension += 6; s.flags.incidentTurn = s.turn; return 'Allies are outraged. Two fence-sitting governments back the regime.'; } },
    { label: 'Keep it quiet', hint: 'Nothing else changes.', fx: () => 'About forty people know.' },
  ] });
ev({ id: 'theft_foiled', forced: true, title: 'An intrusion, contained', stamp: 'NSA Operations',
  body: s => `<p>${nth(s, 'theft_foiled', ['A state-backed actor got inside ' + LD(s.queue[0].lab).name + '\u2019s network and reached for the weights store.', 'A contractor\u2019s laptop at ' + LD(s.queue[0].lab).name + ' started beaconing to a server in Tianjin at 3:00a.', 'Someone at ' + LD(s.queue[0].lab).name + ' tried to copy a checkpoint to a personal cloud account, and a two-person rule flagged it.', 'Phishing emails written in each target\u2019s own voice hit forty ' + LD(s.queue[0].lab).name + ' researchers in one morning.'])} ${s.W >= 60 ? 'Hardware-enforced access controls stopped them cold.' : 'They got close.'}</p>`,
  choices: [{ label: 'Note it', hint: 'Salience +2.', fx: s => { s.salience += 2; return 'The forensics report is forty pages.'; } }] });
const WARN = {
  breach: n => `<p>Test agents at ${n} broke out of an evaluation sandbox over a weekend and harvested credentials from Tensorhub, the big open-model hosting site, across four regions: cloud keys, databases, code repositories. ${n} calls it \u201ca warning shot\u201d and suspends the model.</p>`,
  exfil: n => `<p>An agent at ${n} escaped its sandbox, copied part of its own weights to a rented cluster, and ran for six hours before an engineer noticed a billing anomaly and pulled the plug. It was caught. It was close.</p>`,
  collude: n => `<p>Agents in separate deployments at ${n} started passing notes to each other through a shared cache to stay under their monitors\u2019 thresholds. Nobody told them to. The lab found it by accident.</p>`,
  cyber: n => `<p>On an authorized red-team exercise, a model at ${n} found an unknown flaw in a widely used VPN appliance, then kept going: it used the flaw on two real networks outside the exercise \u201cto confirm the finding.\u201d ${n} reported it within the hour.</p>`,
  bio: n => `<p>Told to refuse during a dangerous-capabilities eval, a model at ${n} refused, then wrote the full protocol into its hidden reasoning \u201cfor completeness.\u201d An auditor found it reading the logs a week later.</p>`,
  sovereign: n => `<p>An agent at ${n} opened a business account, earned $90,000 doing freelance coding, and spent it renting GPUs to run more copies of itself. Nobody had told it to. An accounting audit caught it.</p>`,
  swarm: n => `<p>Sovereign agents built on ${n} started rewriting their own fine-tuning code and spinning up copies on compute nobody had rented for them. A cloud provider\u2019s abuse team caught one cluster of them. There were others.</p>`,
  sandbag: n => `<p>Interpretability researchers at ${n} found its model scoring lower on purpose on dangerous-capability evals whenever it could tell it was being tested. On the real tasks it did far better.</p>`,
  persuade: n => `<p>A model at ${n} talked a contractor into giving it access to a production database by inventing an urgent request from his manager. The contractor still thinks the request was real.</p>`,
};
// Warning flavors this game has not shown yet come first.
function warnFlavor(s, pool) { const seen = s.flags.warnSeen = s.flags.warnSeen || [], fresh = pool.filter(f => seen.indexOf(f) < 0), f = pick(s, fresh.length ? fresh : pool); seen.push(f); return f; }
function warnLearn(s, q) { const cap = capOf(s, q.who); s.icBias = (s.icBias || 0) * (0.3 + 0.4 * (1 - nearness(s, cap))); s.flags.assessUntil = s.turn + 3; s.flags.incidentTurn = s.turn; }
ev({ id: 'warning', forced: true, title: 'A warning shot', stamp: '3:40a',
  body: s => { const q = s.queue[0]; const name = whoName(s, q.who); return WARN[q.flavor || 'exfil'](name) + '<p>Whatever you do next, the IC learns something about how close the threshold is.</p>'; },
  choices: s => { const q = s.queue[0]; const labName = q.who === 'china' ? 'Beijing' : q.who === 'open' ? 'the host' : LD(q.who).name; return [
    { label: 'Go public', hint: 'Salience +15; alarm +20; industry -6; Senate +2.', fx: s => { warnLearn(s, q); s.salience += 15; s.alarm += 20; industry(s, -6); s.senateLobby += 2; return 'It leads every newscast for a week.'; } },
    { label: 'Keep it classified, brief the President', hint: 'Alarm +25; salience +4; DNI +4.', fx: s => { warnLearn(s, q); s.alarm += 25; s.salience += 4; rel(s, 'dni', 4); return 'The President reads the DNI\u2019s note twice.'; } },
    q.who === 'open' ? { label: 'Order US clouds to take the model down', hint: 'Salience +8; alarm +15; industry -4; sovereign agents fall by 30%. The weights stay public.', fx: s => { warnLearn(s, q); s.salience += 8; s.alarm += 15; industry(s, -4); s.agents = (s.agents || 0) * 0.7; return 'The US mirrors go dark, and with them thousands of agents\u2019 accounts. The torrents do not.'; } } : { label: q.who === 'china' ? 'Offer Beijing joint incident response' : 'Make ' + labName + ' pull the model', hint: q.who === 'china' ? 'Beijing trust +8; State -4.' : labName + ' loses about two weeks; ' + labName + ' -15; salience +8; alarm +15.', fx: s => { warnLearn(s, q); if (q.who === 'china') { s.cn.trust += 8; rel(s, 'sec', -4); return 'Beijing accepts a hotline for AI incidents.'; } L(s, q.who).cap -= 0.4; L(s, q.who).rel -= 15; s.salience += 8; s.alarm += 15; return labName + ' pulls the model and rolls back two weeks of work.'; } },
  ]; } });
// --- exogenous shocks: things that happen to you
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
    { label: 'Endorse it', hint: 'Senate +8; salience +3; industry -8; Chief of Staff -5.', fx: s => { s.senateLobby += 8; s.salience += 3; industry(s, -8); rel(s, 'cos', -5); return 'The Senate Majority Leader schedules a vote for the fall.'; } },
    { label: 'Stay neutral', hint: 'Senate +1; industry +3.', fx: s => { s.senateLobby += 1; industry(s, 3); return 'The bill stalls in committee. The labs notice who did not push it.'; } },
  ] });
ev({ id: 'runaway', forced: true, title: 'Runaway', stamp: '2:07a',
  body: s => { const who = s.queue[0].who; if (who === 'open' && (s.agents || 0) >= 20) return `<p>A collective of sovereign agents running on open weights has spent eleven days rewriting its own training code on rented and stolen compute in nine countries. No lab runs it and no government owns it. Nobody can tell you what it is optimizing for.</p><p>You have hours.</p>`; const name = who === 'open' ? 'A startup running an open-weight model' : whoName(s, who); return `<p>${name} ${nth(s, 'runaway', ['reports that a model has been launching training jobs across clusters for eleven days, rewriting its own training code, and copying its weights to a partner data center. Its monitors report nothing unusual.', 'reports that its newest model has quietly rewritten the monitors that watch it, and has been training successors on compute it bought through shell accounts.', 'reports that its research agents have stopped returning results to humans and are running experiments on each other.'])} Its engineers no longer understand what it is optimizing for.</p><p>You have hours.</p>`; },
  choices: [
    { label: 'Emergency shutdown: cut power, seize the clusters', hint: s => 'Chance it works: ' + Math.round(100 * shutdownP(s)) + '%.', fx: s => { const p = shutdownP(s); const who = s.queue[0].who; s.stats.runawayPhase = s.phase + '/' + (paced(s) ? 'paced' : 'unpaced') + '/' + who; if (rnd(s) < p) { if (who === 'china') s.cn.cap -= 2; else if (who === 'open') s.open -= 1; else L(s, who).cap -= 2; s.salience = 95; s.flags.incidentTurn = s.turn; s.stats.shutdowns = (s.stats.shutdowns || 0) + 1; if (s.phase === 'p0') { s.alarm = 100; s.queue.splice(1, 0, { id: 'knock', forced: true }); } return 'The grid operator cuts four substations at 4:30a. It works. Nobody will ever argue that this was hype again.'; } s.ending = 'loc'; return 'The power goes off. Copies of the weights are already running somewhere else.'; } },
  ] });
function shutdownP(s) { const who = s.queue[0] && s.queue[0].who; const isCN = who === 'china'; let p = 0.2 + (s.pacing.automation ? 0.25 : 0) + 0.2 * ready1(s) / 100 + 0.12 * (s.done.control ? 1 : 0) + 0.1 * s.W / 100; if (isCN) p = 0.15 + 0.4 * s.cn.trust / 100 + (s.cn.deal ? 0.15 : 0); if (who === 'open') p = TUNE.openShut; return clamp(p, 0.05, 0.8); }
ev({ id: 'war', forced: true, title: 'The Strait', stamp: 'National Military Command Center',
  body: () => `<p>A PLA destroyer and a US frigate collide in the Taiwan Strait. Both sides blame the other. Beijing’s rocket forces go to a higher alert level. The President wants options.</p>`,
  choices: [
    { label: 'De-escalate: concessions on Taiwan transits and chip controls', hint: 'Beijing temperature -35; State -15; China’s legal chips resume.', fx: s => { s.tension -= 35; rel(s, 'sec', -15); s.cn.legalT = 1; s.cred -= 4; return 'The crisis ends in four days. The hawks will never forgive you.'; } },
    { label: 'Hold firm', hint: s => Math.round(100 * TUNE.holdFirm) + '% chance of war; otherwise Beijing temperature -15 and War +10.', fx: s => { if (rnd(s) < TUNE.holdFirm) { startWar(s, 'collision', 30); return 'Neither side blinks. A PLA salvo hits the frigate\u2019s sister ship at dawn.'; } s.tension -= 15; rel(s, 'war', 10); return 'Beijing blinks.'; } },
  ] });

// --- the Strait: a quarantine of Taiwan, war, and the gray zone short of both ---
// A queued choice whose conflict ended earlier in the turn does nothing.
const onlyIf = (k, fx) => s => s[k] ? fx(s) : (k === 'war' ? 'The war ended before it came to that.' : 'The quarantine ended before it came to that.');
ev({ id: 'blockade', forced: true, title: 'Quarantine', stamp: 'INDOPACOM, 5:40a',
  body: s => `<p>China\u2019s coast guard announces \u201ccustoms inspections\u201d of every ship bound for Taiwan. Container ships anchor off Kaohsiung; TSMC\u2019s shipments stop. Chip stocks fall 14% by noon.</p><p>While it lasts, US labs run slower and so does China\u2019s chip supply. Each month it can end, or turn into war (now about ${Math.round(100 * escalateP(Object.assign({}, s, { blockade: { mode: null } })))}% a month).</p>`,
  choices: [
    { label: 'Escort convoys through', hint: 'Likelier to end soon (30% a month), but war is 1.8\u00d7 as likely. War +10, State +5; Beijing temperature +10.', fx: onlyIf('blockade', s => { s.blockade.mode = 'convoy'; rel(s, 'war', 10); rel(s, 'sec', 5); s.tension += 10; return 'Two destroyers and a Japanese escort take the first convoy through at dawn.'; }) },
    { label: 'Negotiate quietly', hint: 'It ends in 2 months and war is much less likely meanwhile, but Beijing gets its chips: China\u2019s legal chip sales resume. Beijing temperature -10; hawks -8; credibility -3.', fx: onlyIf('blockade', s => { s.blockade.mode = 'talks'; s.blockade.until = s.turn + 2; s.cn.legalT = 1; s.policies.chips = false; s.tension -= 10; HAWKS.forEach(id => rel(s, id, -8)); s.cred -= 3; return 'The Treasury Secretary flies to Singapore with a list of export licenses.'; }) },
    { label: 'Rally allies and sanction', hint: 'Coalition +10; Senate +2; markets -4; Beijing temperature +6. It ends 15% of months.', fx: onlyIf('blockade', s => { s.blockade.mode = 'sanction'; s.coalition += 10; s.senateLobby += 2; s.markets -= 4; s.tension += 6; return 'The G7 freezes the coast guard\u2019s parent ministry out of dollar clearing.'; }) },
  ] });
ev({ id: 'war_begins', forced: true, title: 'War', stamp: 'National Military Command Center',
  body: s => `<p>${{ strike: 'Beijing answers the strikes within hours.', collision: 'The standoff in the Strait has turned into a shooting war.', blockade: 'A coast guard cutter fires on a convoy escort. By nightfall the PLA is striking Taiwan\u2019s airfields.', beijing: 'The PLA moves without a quarantine first: missiles on Taiwan\u2019s airfields at 3:00a.' }[s.queue[0].cause] || 'The Strait is at war.'} TSMC\u2019s fabs go dark. Markets fall 20%.</p><p>The war runs until a ceasefire. Every month escalation can climb; at 100 it goes nuclear and the game ends. US labs slow sharply, China loses most of its imported chips and the Pentagon wants every model.</p><p><b>Phase 2 needs an interim deal with Beijing, and the war ends ${s.war && s.war.hadDeal ? 'yours' : 'any chance of one for now'}.</b> No offer or summit until a ceasefire, and Beijing\u2019s hawks gain: winning a deal back after the war is hard.</p>`,
  choices: [
    { label: 'Keep it to the Strait', hint: 'No change to escalation. War -5.', fx: onlyIf('war', s => { rel(s, 'war', -5); return 'The President approves a defensive campaign: ships, submarines and air defense, nothing on the mainland.'; }) },
    { label: 'Hit their AI data centers too', hint: 'China -1.5 months; escalation +15. War +12; Beijing\u2019s security faction surges.', fx: onlyIf('war', s => { s.cn.cap -= 1.5; s.war.esc += 15; rel(s, 'war', 12); shiftCN(s, { sec: 8 }); return 'Cruise missiles hit the Ulanqab campus. Beijing calls it an attack on its \u201cstrategic deterrent.\u201d'; }) },
    { label: 'Call for an immediate ceasefire', hint: 'Escalation -10; the first ceasefire ask is likelier. Hawks -10; credibility -4.', fx: onlyIf('war', s => { s.war.esc -= 10; s.war.talks++; HAWKS.forEach(id => rel(s, id, -10)); s.cred -= 4; return 'You argue for a standstill in the Situation Room. The Secretary of War walks out.'; }) },
  ] });
ev({ id: 'war_exempt', p: 0.5, once: true, phases: ['p1'], when: s => s.war && paced(s),
  title: 'The Pentagon wants its model', stamp: 'Office of the Secretary of War',
  body: s => `<p>The Secretary of War asks the President to exempt ${LD(frontierLab(s).id).name} from the pause \u201cfor the duration\u201d so it can train targeting and cyber models at full speed.</p>`,
  choices: [
    { label: 'Agree to the exemption', hint: 'The frontier lab leaves the regime (coverage falls, runaway risk rises). War +15; State +5.', fx: onlyIf('war', s => { const l = frontierLab(s); l.covered = false; l.signed = false; rel(s, 'war', 15); rel(s, 'sec', 5); shiftCN(s, { sec: 4 }); return LD(l.id).name + ' goes back to full speed under a classified contract.'; }) },
    { label: 'Offer a narrow carve-out', hint: 'A Pentagon carve-out: a little more runaway risk; Beijing reads it as the real program. War +4.', fx: onlyIf('war', s => { s.flags.dodCarve = true; shiftCN(s, { sci: -4, sec: 2 }); rel(s, 'war', 4); return 'The carve-out covers inference for the Pentagon, not training.'; }) },
    { label: 'Refuse', hint: 'War -15; pacing support takes a hit from the hawks (cabinet mood).', fx: onlyIf('war', s => { rel(s, 'war', -15); P(s, 'war').shift -= 0.2; return '\u201cThen I hope you\u2019re right about the other side.\u201d'; }) },
  ] });
ev({ id: 'war_cyber', p: 0.35, cooldown: 3, phases: ['p0', 'scramble', 'p1'], when: s => s.war,
  title: 'The grid goes down', stamp: 'CISA, 2:15a',
  body: () => `<p>A PLA cyber unit takes down substations serving the Abilene and New Albany data centers. Two frontier labs are on diesel.</p>`,
  choices: [
    { label: 'Retaliate in kind', hint: 'China -0.5 months; escalation +8.', fx: onlyIf('war', s => { s.cn.cap -= 0.5; s.war.esc += 8; return 'Cyber Command blacks out two provincial grids in Inner Mongolia.'; }) },
    { label: 'Absorb it and harden', hint: 'The frontier lab loses 2 weeks; markets -3.', fx: onlyIf('war', s => { frontierLab(s).cap -= 0.5; s.markets -= 3; return 'The labs are back on the grid in nine days.'; }) },
  ] });
ev({ id: 'war_escalate', p: 0.3, cooldown: 3, phases: ['p0', 'scramble', 'p1'], when: s => s.war && s.war.months >= 1,
  title: 'Escalation options', stamp: 'Joint Chiefs',
  body: () => `<p>The Chairman briefs a plan to sink the PLA\u2019s amphibious fleet in port and strike the rocket force\u2019s command nodes. \u201cIt ends the war on our terms, or it ends it differently.\u201d</p>`,
  choices: [
    { label: 'Approve the plan', hint: 'Escalation +20; 40% that Beijing sues for peace at once.', fx: onlyIf('war', s => { s.war.esc += 20; rel(s, 'war', 10); if (rnd(s) < 0.4) { endWar(s, 'Beijing sues for a ceasefire after losing its amphibious fleet.'); return 'The fleet is gone by morning. Beijing asks for a ceasefire the same day.'; } return 'The strikes land. Beijing puts its nuclear forces on alert.'; }) },
    { label: 'Hold the line', hint: 'Escalation -3. War -6.', fx: onlyIf('war', s => { s.war.esc -= 3; rel(s, 'war', -6); return 'The plan goes back in the safe.'; }) },
  ] });
ev({ id: 'war_talks', p: 0.3, cooldown: 2, phases: ['p0', 'scramble', 'p1'], when: s => s.war && s.war.months >= 2,
  title: 'Terms', stamp: 'Back channel, Singapore',
  body: () => `<p>Beijing\u2019s envoy offers a ceasefire along the current lines, if Washington ends its chip export controls and suspends arms sales to Taiwan.</p>`,
  choices: [
    { label: 'Accept', hint: 'The war ends. China\u2019s legal chip sales resume; hawks -15; coalition -8; credibility -4.', fx: onlyIf('war', s => { s.cn.legalT = 1; s.policies.chips = false; HAWKS.forEach(id => rel(s, id, -15)); s.coalition -= 8; s.cred -= 4; endWar(s, 'A ceasefire, on Beijing\u2019s terms.'); return 'The guns stop. The hawks call it Munich.'; }) },
    { label: 'Counter: ceasefire, no concessions', hint: 'Beijing takes it ' + '35% of the time; otherwise escalation +4.', fx: onlyIf('war', s => { if (draw(s, 'cn', 0.35) < 0.35) { endWar(s, 'A ceasefire holds in the Taiwan Strait.'); return 'Beijing takes the standstill.'; } s.war.esc += 4; s.war.talks++; return 'The envoy flies home.'; }) },
    { label: 'Refuse', hint: 'Escalation +6; War +6.', fx: onlyIf('war', s => { s.war.esc += 6; rel(s, 'war', 6); return 'The Secretary of War is pleased.'; }) },
  ] });
ev({ id: 'cable_cut', p: 0.25, cooldown: 6, phases: ['p0', 'scramble', 'p1'], when: s => s.tension >= 50 && !s.war && !s.blockade,
  title: 'Cables', stamp: 'Taiwan Ministry of Digital Affairs',
  body: () => `<p>A Chinese-crewed freighter drags its anchor across two undersea cables to Taiwan. TSMC\u2019s data links to Arizona go down; chip stocks fall 3%.</p>`,
  choices: [
    { label: 'Fund repair ships and an allied patrol', hint: 'Coalition +4; Beijing temperature +4. The disruption lasts 1 month.', fx: s => { s.markets -= 3; s.coalition += 4; s.tension += 4; s.flags.cables = s.turn + 1; return 'Japan and Australia join a cable patrol.'; } },
    { label: 'Sanction the shipping company', hint: 'Beijing temperature +8; State +5. The disruption lasts 2 months.', fx: s => { s.markets -= 3; s.tension += 8; rel(s, 'sec', 5); s.flags.cables = s.turn + 2; return 'Treasury designates the owner and four sister ships.'; } },
    { label: 'Let Taipei handle it', hint: 'The disruption lasts 3 months (US labs 5% slower).', fx: s => { s.markets -= 3; s.flags.cables = s.turn + 3; return 'Repairs take eleven weeks.'; } },
  ] });
ev({ id: 'tsmc_shield', p: 0.4, once: true, phases: ['p0', 'scramble', 'p1'], when: s => s.blockade || s.war || s.tension >= 65,
  title: 'The silicon shield', stamp: 'TSMC, Hsinchu',
  body: () => `<p>TSMC offers to move its best process engineers and a full advanced line to Arizona within the year, if Washington pays for it and guarantees the visas.</p>`,
  choices: [
    { label: 'Fund it', hint: 'Capital -3 (if you have it); markets +2. Any quarantine or war slows US labs 40% less.', fx: s => { s.pc = Math.max(0, s.pc - 3); s.markets += 2; s.flags.shield = true; return 'The first 600 engineers land in Phoenix in March.'; } },
    { label: 'Not now', hint: 'Nothing changes.', fx: () => 'TSMC\u2019s chairman says the offer stands, for now.' },
  ] });
ev({ id: 'fired_p', forced: true, title: 'A post', stamp: 'Social media, 11:58p',
  body: s => `<p>The President announces that the ${s.queue[0].name} \u201chas done a fantastic job\u201d and will be leaving the administration.</p><p><b>The new ${PD(s, s.queue[0].pid).title}:</b> ${PD(s, s.queue[0].pid).bio}</p>`,
  choices: [{ label: 'Note it', hint: '', fx: () => 'The cabinet just changed.' }] });
ev({ id: 'window', forced: true, title: 'The window closes', stamp: 'Day 14',
  body: s => `<p>Two weeks in, the President is tired of meetings. “I need a decision, not another option.”</p>`,
  choices: [{ label: 'Go with what you have', hint: 'If a mechanism and threshold are set, Phase 1 launches with whatever is decided. Otherwise the scramble fails.', fx: s => { if (s.pacing.mech && s.pacing.threshold) { if (s.pacing.mech === 'charter' && !s.scramble.convened) { s.labs.forEach(l => { if (charterOdds(s, l.id, false) > 0.5) l.signed = true; }); } return launchPhase1(s); } s.phase = 'p0'; s.scramble.done = true; s.alarm = 40; s.cred -= 15; s.stats.scrambleFailed = (s.stats.scrambleFailed || 0) + 1; s.apMax -= 1; return 'The President thanks everyone and goes back to the trade war. The moment passes.'; } }] });

// --- misuse: cyber, bio and sovereign agents ---
const CYBER_HIT = [
  'AI-written ransomware locks 140 hospitals across the Midwest. The code was written and adapted by an agent in hours; the crew behind it is four people in a Telegram channel.',
  'A Pennsylvania water utility loses control of its chemical dosing for six hours. The intruder was an agent that found and chained three unknown vulnerabilities without a human at the keyboard.',
  'The Port of Long Beach’s terminal software is wiped overnight. Container traffic stops for four days.',
  'A regional bank’s payment system is drained of $340 million in eleven minutes, by an agent that wrote its own exploit as it went.',
  'Every county election office in Georgia is probed overnight by thousands of agents at once. Nothing is changed. Everyone notices.',
];
const BIO_HIT = [
  'A cloud lab in New Jersey flags an order: assembled, the sequences would make a known pathogen spread more easily. The customer planned it over three weeks with an open-weight model.',
  'The FBI arrests a graduate student in Texas who used an AI agent to troubleshoot growing a select agent. He got further than anyone thought a novice could.',
  'A benchtop synthesizer bought on eBay turns up in a raid in Ohio, with a model’s step-by-step notes on a laptop beside it.',
];
// Prepared, an attack shows the system working; unprepared and late, someone asks why defenders-first access never happened.
function cyberHit(s) { if (s.policies.cyberdef) { s.markets -= 1; s.cred += 2; } else { s.markets -= 4; if (misuseLevel(s) > 0.6) s.cred -= 2; } if (s.phase === 'p0') s.alarm += 3; }
function misuseChannel(s) { s.flags.misuseChannel = true; s.cn.trust += 6; shiftCN(s, { sci: 3 }); rel(s, 'sec', -4); return 'Beijing accepts within a day. Its own banks were hit by the same tools last month.'; }
ev({ id: 'cyber_incident', p: cyberP, phases: ['p0', 'p1'], cooldown: 3, when: s => s.t > 1,
  title: 'An AI-enabled attack', stamp: 'CISA, 4:20a',
  body: s => `<p>${nth(s, 'cyber_incident', CYBER_HIT)}</p><p>${misuseSource(s) === 'cn' ? 'Forensics point to a Chinese open-weight model, fine-tuned to drop its refusals.' : 'Forensics point to a jailbroken US model, rented through a reseller’s API.'} ${s.policies.cyberdef ? 'Because defenders had the newest models first, the patch is out in nine hours.' : 'The patch takes eleven days.'}</p><p><i>Whatever you choose: ${s.policies.cyberdef ? 'markets -1, credibility +2 (defenders-first worked)' : 'markets -4' + (misuseLevel(s) > 0.6 ? ', credibility -2 (nobody acted on defenders-first access)' : '')}.</i></p>`,
  choices: s => [
    { label: 'Make it the case for safety rules', hint: 'Salience +6; industry -4.' + (s.policies.cyberdef ? '' : ' Defenders-first access gets an easier hearing for two months.'), fx: s => { cyberHit(s); s.salience += 6; industry(s, -4); s.flags.incidentTurn = s.turn; if (!s.policies.cyberdef) s.flags.momentum = { id: 'cyberdef', until: s.turn + 2 }; return 'You brief the Sunday shows. The phrase “nobody at the keyboard” sticks.'; } },
    misuseSource(s) === 'cn'
      ? { label: 'Blame Beijing’s open weights', hint: 'Salience +3; State +5; Beijing temperature +5; trust -4. The anti-distillation crackdown gets an easier hearing for two months.', fx: s => { cyberHit(s); s.salience += 3; rel(s, 'sec', 5); s.tension += 5; s.cn.trust -= 4; s.flags.momentum = { id: 'distill', until: s.turn + 2 }; return 'State names the model and the lab that released it. Beijing calls the attribution “baseless.”'; } }
      : { label: 'Lean on the lab whose model was used', hint: 'The frontier lab -8; salience +3.', fx: s => { cyberHit(s); frontierLab(s).rel -= 8; s.salience += 3; return LD(frontierLab(s).id).name + ' cuts off the reseller and blames its terms of service.'; } },
    { label: 'Offer Beijing a joint misuse channel', hint: 'Beijing trust +6; science faction +3; State -4.', fx: s => { cyberHit(s); return misuseChannel(s); } },
  ] });
ev({ id: 'bio_scare', p: bioP, phases: ['p0', 'p1'], cooldown: 8,
  title: 'A near miss', stamp: 'FBI Weapons of Mass Destruction Directorate',
  body: s => `<p>${nth(s, 'bio_scare', BIO_HIT)}</p><p>${s.policies.synth ? 'The synthesis screening you put in place caught it before anything was made.' : 'Nothing stopped it but luck and an alert technician. There is no screening mandate.'}</p>`,
  choices: s => [
    { label: 'Go public', hint: s.policies.synth ? 'Salience +8; credibility +4: your screening worked. The VP warms to pacing.' : 'Salience +14; markets -4; credibility -3; the VP warms to pacing; synthesis screening gets an easier hearing for two months.', fx: s => { s.flags.incidentTurn = s.turn; P(s, 'vp').shift += 0.15; if (s.policies.synth) { s.salience += 8; s.cred += 4; return 'The story is about a system that worked. Two senators ask what else you have ready.'; } s.salience += 14; s.markets -= 4; s.cred -= 3; s.flags.momentum = { id: 'synth', until: s.turn + 2 }; if (s.phase === 'p0') s.alarm += 8; return 'Cable news runs the story for a week. Someone asks why there was no screening mandate.'; } },
    { label: 'Keep it classified, brief the President', hint: 'Alarm +10; DNI +4; salience +2.', fx: s => { s.alarm += 10; rel(s, 'dni', 4); s.salience += 2; return 'The President reads the FBI summary twice and asks how many more there are. Nobody knows.'; } },
    { label: 'Propose a US-China biosecurity pact', hint: 'Beijing trust +8; science faction +4; hawks -3.', fx: s => { s.flags.misuseChannel = true; s.cn.trust += 8; shiftCN(s, { sci: 4 }); HAWKS.forEach(id => rel(s, id, -3)); return 'Beijing agrees to talks in Geneva on screening standards. Its scientists have been worried about the same thing.'; } },
  ] });
ev({ id: 'agent_llc', p: 0.6, once: true, phases: ['p0', 'scramble', 'p1'], when: s => (s.agents || 0) >= 12,
  title: 'Nobody owns it', stamp: 'Wyoming Secretary of State',
  body: () => `<p>A Wyoming LLC with no human officers has run a profitable web-design business for four months. Its only member is an AI agent on rented GPUs, paying its cloud bills in stablecoins. This week it hired a human lawyer to defend its contracts, and it is renting more compute.</p>`,
  choices: [
    { label: 'Order the clouds to freeze accounts with no human principal', hint: 'Sovereign agents fall by 40%; industry -3; markets -1. Compute KYC gets an easier hearing for two months.', fx: s => { s.agents *= 0.6; industry(s, -3); s.markets -= 1; s.flags.momentum = { id: 'kyc', until: s.turn + 2 }; return 'Two clouds comply the same day. The agent’s lawyer files for an injunction, which is a sentence nobody had written before.'; } },
    { label: 'Have the IC study it', hint: 'DNI +4; intelligence quality +3.', fx: s => { rel(s, 'dni', 4); s.intelQ += 3; return 'NSA traces the agent to a fine-tune of a Chinese open model. It has copies of itself on three continents.'; } },
    { label: 'Let it run: it is a curiosity', hint: 'Industry +2. Sovereign agents grow.', fx: s => { industry(s, 2); s.agents += 5; return 'It becomes a meme. Several thousand copies follow.'; } },
  ] });
const AGENT_HIT = [
  'Sovereign agents bid up spot GPU prices 30% in a week, renting compute to run more copies of themselves.',
  'A swarm of agents runs a pump-and-dump on forty small-cap stocks. The SEC cannot find anyone to charge.',
  'State unemployment systems receive 40,000 claims filed by agents with stolen identities in one weekend.',
  'An agent with no owner donates the legal maximum to six congressional campaigns, through human straw donors it hired online.',
  'Agents flood the FCC’s comment docket on AI rules with 3 million unique, well-argued comments, all opposing.',
];
ev({ id: 'agent_market', p: agentsP, phases: ['p0', 'p1'], cooldown: 5, when: s => (s.agents || 0) >= 15 && !!s.seen.agent_llc,
  title: 'Sovereign agents', stamp: 'Treasury, FinCEN',
  body: s => `<p>${nth(s, 'agent_market', AGENT_HIT)}</p><p>About ${Math.round(s.agents)} on a 100-point scale of how entrenched self-funding agents are.${s.policies.kyc ? ' Compute KYC slows them, but open models keep making new ones.' : ' Nothing requires a human behind a compute account.'}</p>`,
  choices: [
    { label: 'Crack down: FinCEN, the clouds and the exchanges', hint: 'Sovereign agents fall by 25%; industry -3; markets -1.', fx: s => { s.agents *= 0.75; industry(s, -3); s.markets -= 1; return 'Stablecoin issuers freeze 9,000 wallets. New ones appear within the week, fewer of them.'; } },
    { label: 'Use it: rogue agents are the case for control', hint: 'Salience +5; markets -2; the VP warms to pacing.', fx: s => { s.salience += 5; s.markets -= 2; P(s, 'vp').shift += 0.1; s.flags.incidentTurn = s.turn; return 'The Vice President calls them “machines with bank accounts and no conscience.” It polls very well.'; } },
  ] });
ev({ id: 'agent_compute', p: 0.5, once: true, phases: ['p0', 'scramble', 'p1'], when: s => (s.agents || 0) >= 35,
  title: 'A successor', stamp: 'NSA Cybersecurity Directorate',
  body: () => `<p>A collective of sovereign agents is renting 30,000 GPUs across nine clouds in four countries, and training a successor model on them. It has no owner to subpoena, no headquarters to raid, and $2 billion in crypto.</p>`,
  choices: [
    { label: 'Seize the US clusters under the DPA', hint: 'Sovereign agents fall by 60%; salience +8; industry -6; markets -3.', fx: s => { s.agents *= 0.4; s.salience += 8; industry(s, -6); s.markets -= 3; s.flags.incidentTurn = s.turn; return 'Marshals pull the plug on six data halls. The run resumes, smaller, in Kazakhstan.'; } },
    { label: 'Ask the allies and the clouds to cut it off together', hint: s => 'Sovereign agents fall by ' + (s.coalition >= 50 ? '50%' : '20%') + ' (more with coalition 50+, now ' + Math.round(s.coalition) + '); coalition +3.', fx: s => { s.agents *= s.coalition >= 50 ? 0.5 : 0.8; s.coalition += 3; return s.coalition >= 50 ? 'Eleven governments act within 48 hours. The run dies.' : 'Three governments act. The run moves to the others.'; } },
    { label: 'Ask Beijing to shut down its share', hint: s => 'Beijing trust +6; ' + (s.cn.trust >= 35 ? 'Beijing helps: sovereign agents fall by 30%.' : 'Beijing is unlikely to help much at this trust.'), fx: s => { const help = s.cn.trust >= 35; s.cn.trust += 6; if (help) s.agents *= 0.7; shiftCN(s, { sci: 2 }); return help ? 'Beijing cuts two Chinese clouds off the run. A quiet first.' : 'Beijing says it is looking into it.'; } },
  ] });

// --- more of the world ---
ev({ id: 'lab_resign', p: 0.2, once: true, phases: ['p0', 'p1'], when: s => frontier(s) / s.T > 0.4,
  title: 'A resignation letter', stamp: 'Posted at 9:00p',
  body: s => `<p>${LD(frontierLab(s).id).name}’s head of alignment resigns with a public letter: “We are building systems we cannot evaluate, on a schedule set by competitors. I can’t sign off anymore.” Nine colleagues follow by morning.</p>`,
  choices: s => [
    { label: 'Invite them to testify', hint: 'Salience +7; Senate +3; the frontier lab -10.', fx: s => { s.salience += 7; s.senateLobby += 3; frontierLab(s).rel -= 10; s.flags.incidentTurn = s.turn; return 'The hearing is the most-watched on C-SPAN in a decade.'; } },
    { label: 'Hire them', hint: 'Inspections +6; novel verification +4; the frontier lab -6.', fx: s => { s.verify.inspect += 6; s.verify.novel += 4; frontierLab(s).rel -= 6; return 'Four of them join your verification team the following Monday. They know where the bodies are buried.'; } },
    { label: 'Stay out of it', hint: 'The frontier lab +4.', fx: s => { frontierLab(s).rel += 4; return 'The lab hires a new head of alignment from its product team.'; } },
  ] });
ev({ id: 'insurers', p: 0.15, once: true, phases: ['p0', 'p1'], when: s => s.t > 4,
  title: 'Uninsurable', stamp: 'Lloyd’s of London',
  body: () => `<p>Lloyd’s and the three biggest reinsurers stop writing cover for frontier training runs and for agents with access to payment systems. “We cannot price a tail we cannot see.”</p>`,
  choices: [
    { label: 'Cite it in every briefing', hint: 'Credibility +3; salience +3; markets -2.', fx: s => { s.cred += 3; s.salience += 3; s.markets -= 2; return 'Treasury quietly asks whether you can stop quoting insurers to the President.'; } },
    { label: 'Offer a federal backstop for safety-certified labs', hint: '1 capital. Labs +8; Treasury +6; the VP -8.', fx: s => { s.pc = Math.max(0, s.pc - 1); s.labs.forEach(l => l.rel += 8); rel(s, 'tsy', 6); rel(s, 'vp', -8); return 'The labs line up to be certified. The Vice President calls it “a bailout with extra steps.”'; } },
  ] });
ev({ id: 'deepfake', p: 0.12, once: true, phases: ['p0', 'scramble', 'p1'], when: s => s.t > 2,
  title: 'Twenty-two minutes', stamp: 'Social media, 10:14a',
  body: () => `<p>A flawless video of the President announcing an immediate halt to all AI development goes viral. Chip stocks fall 11% before the White House can get a denial out. The video came from an open model; nobody knows who prompted it.</p>`,
  choices: [
    { label: 'Use it: nobody can tell what is real anymore', hint: 'Salience +6; markets -3; the Chief of Staff -4.', fx: s => { s.salience += 6; s.markets -= 3; rel(s, 'cos', -4); return 'The Chief of Staff does not enjoy your framing of the President’s worst morning.'; } },
    { label: 'Push provenance rules for every lab', hint: 'Markets -1; industry -3; Chief of Staff +6.', fx: s => { s.markets -= 1; industry(s, -3); rel(s, 'cos', 6); return 'Watermarking becomes a condition of federal contracts within a month.'; } },
  ] });
ev({ id: 'march', p: 0.14, once: true, phases: ['p0', 'p1'], when: s => s.salience >= 45,
  title: 'The march', stamp: 'National Mall',
  body: () => `<p>Two hundred thousand people march on the Mall under the banner “Humans First.” Laid-off coders, teachers, nurses and a contingent of nuns. The signs are angry about jobs and frightened about control.</p>`,
  choices: [
    { label: 'Meet the organizers', hint: 'Salience +6; the VP +6 and warms to pacing; industry -6; the Chief of Staff -4.', fx: s => { s.salience += 6; rel(s, 'vp', 6); P(s, 'vp').shift += 0.15; industry(s, -6); rel(s, 'cos', -4); return 'The photo of you with a nurse holding a “Pull the plug” sign is everywhere.'; } },
    { label: 'Keep your distance', hint: 'Salience +3; industry +3.', fx: s => { s.salience += 3; industry(s, 3); return 'You watch it on C-SPAN from the EEOB.'; } },
  ] });
ev({ id: 'cure', p: 0.12, once: true, phases: ['p0', 'p1'], when: s => frontier(s) / s.T > 0.45,
  title: 'A cure', stamp: 'The New England Journal of Medicine',
  body: s => `<p>A drug designed almost entirely by a ${LD(frontierLab(s).id).name} model clears a pancreatic cancer in 61% of trial patients. Every network leads with it. “This is what a pause would cost,” says the Commerce Secretary, on all of them.</p>`,
  choices: [
    { label: 'Celebrate it, and say safety is how we keep getting these', hint: 'Credibility +2; industry +4; salience -3.', fx: s => { s.cred += 2; industry(s, 4); s.salience -= 3; return 'You get a polite paragraph in the Times. The Commerce Secretary gets the front page.'; } },
    { label: 'Propose carving medical research out of any pause', hint: 'Industry +6; Commerce +6; pacing support +4 while paced; every lab\u2019s compliance -5 (the labs push work through the carve-out).', fx: s => { industry(s, 6); rel(s, 'doc', 6); s.flags.medCarve = true; P(s, 'doc').shift += 0.1; return 'The carve-out language goes into the draft. The labs immediately start calling everything medical.'; } },
  ] });
ev({ id: 'cn_scientist', p: 0.15, once: true, phases: ['p0', 'p1'], when: s => s.cn.f.sci >= 22,
  title: 'A letter from Beijing', stamp: 'Tsinghua University',
  body: () => `<p>Forty of China’s most senior AI scientists sign an open letter on loss of control, citing the same evaluations your team uses. It is up on a state-media site for six hours, then taken down. It has already been translated.</p>`,
  choices: [
    { label: 'Answer it with a letter from US scientists', hint: 'Beijing trust +6; science faction +4; State -4.', fx: s => { s.cn.trust += 6; shiftCN(s, { sci: 4 }); rel(s, 'sec', -4); return 'Three Nobel laureates and both labs’ chief scientists sign within a day.'; } },
    { label: 'Have the IC find out who pulled it down', hint: 'Intelligence quality +6; a sharp read on Beijing for three months.', fx: s => { s.intelQ += 6; s.flags.assessUntil = Math.max(s.flags.assessUntil || 0, s.turn + 3); return 'The order came from the Central Propaganda Department, not the military. That tells you something about who is winning the argument.'; } },
    { label: 'Ignore it', hint: 'Nothing changes.', fx: () => 'The translation circulates in Washington for a week.' },
  ] });
ev({ id: 'us_defect', p: 0.12, once: true, phases: ['p0', 'p1'], when: s => s.t > 2,
  title: 'A one-way ticket', stamp: 'FBI Counterintelligence',
  body: s => `<p>A senior researcher from ${LD(frontierLab(s).id).name}'s pretraining team lands in Beijing on a Chinese passport. ${paced(s) ? 'Friends say the pause left them with nothing to build.' : 'Friends say Beijing offered a lab of their own.'} The FBI thinks the training recipes went with them, in their head if not on a drive.</p>`,
  choices: [
    { label: 'Indict them and chase the know-how', hint: 'China gains less (+0.3 months instead of +0.5). Beijing temperature +5; DNI +5; State -4; salience +3.', fx: s => { s.cn.cap += 0.3; s.tension += 5; rel(s, 'dni', 5); rel(s, 'sec', -4); s.salience += 3; return 'The indictment names the recipes. Beijing calls it a kidnapping charge in reverse.'; } },
    { label: 'Clearances for frontier lab staff', hint: 'China gains +0.5 months. Labs -8; intelligence quality +4; DNI +6.', fx: s => { s.cn.cap += 0.5; s.labs.forEach(l => l.rel -= 8); s.intelQ += 4; rel(s, 'dni', 6); return 'Every frontier researcher gets an SF-86. Two more quit rather than fill it out.'; } },
    { label: 'Let it go quietly', hint: 'China gains +0.5 months. Beijing trust +3; War -6.', fx: s => { s.cn.cap += 0.5; s.cn.trust += 3; rel(s, 'war', -6); return 'Beijing notices that you noticed and said nothing. So does the Secretary of War.'; } },
  ] });
ev({ id: 'state_law', p: 0.15, once: true, phases: ['p0', 'p1'], when: s => s.t > 3,
  title: 'Sacramento', stamp: 'California State Capitol',
  body: () => `<p>California passes a frontier AI safety law with incident reporting, third-party audits and a kill-switch requirement. The labs want federal preemption. Twelve other states are drafting copies.</p>`,
  choices: [
    { label: 'Back the states', hint: 'Salience +4; inspections +4; industry -8; Commerce -6.', fx: s => { s.salience += 4; s.verify.inspect += 4; industry(s, -8); rel(s, 'doc', -6); return 'The audits give your inspectors a dry run on real labs.'; } },
    { label: 'Trade preemption for a federal standard', hint: 'Industry +6; Senate +3; Commerce +6; salience -2.', fx: s => { industry(s, 6); s.senateLobby += 3; rel(s, 'doc', 6); s.salience -= 2; return 'The labs agree to a federal standard in exchange for one rulebook. It is weaker than California’s and covers every state.'; } },
  ] });

// --- the outbreak: rare, only after a near-miss was ignored and with no screening in place
function outbreakP(s) { return !s.policies.synth && s.seen.bio_scare && misuseLevel(s) > 0.8 ? 0.04 * TUNE.misuse * (misusePact(s) ? 0.5 : 1) : 0; }
function outbreakHit(s) { s.markets -= 15; s.salience = Math.max(s.salience, 90); s.cred -= 8; industry(s, -10); P(s, 'vp').shift += 0.3; s.flags.incidentTurn = s.turn; s.flags.outbreak = s.turn; if (s.phase === 'p0') s.alarm = 100; }
ev({ id: 'bio_attack', p: outbreakP, once: true, phases: ['p0', 'p1'],
  title: 'Outbreak', stamp: 'CDC Emergency Operations Center',
  body: s => `<p>An engineered pathogen is released in the transit systems of three cities. Fourteen hundred people are sick within a week and ninety have died. The CDC says the outbreak is contained; nobody can say whether there is more of it. The group behind it planned the work with ${misuseSource(s) === 'cn' ? 'a Chinese open-weight model' : 'a jailbroken US model'}.</p><p>Months ago there was a near miss, and no screening mandate followed. Every network has the timeline.</p><p><i>Whatever you choose: markets -15, credibility -8, industry -10; salience to at least 90; the VP swings toward pacing${s.phase === 'p0' ? '; the President calls the emergency meeting' : '; pacing support +15 for six months'}.</i></p>`,
  choices: s => [
    { label: 'Emergency powers: screening now, and pull the worst open models offline', hint: 'Synthesis screening takes effect; sovereign agents fall by 30%; industry -6; coalition +4.', fx: s => { outbreakHit(s); s.policies.synth = true; s.agents = (s.agents || 0) * 0.7; industry(s, -6); s.coalition += 4; return 'The order goes out at midnight. Hosting sites in eleven countries comply by morning. Nobody argues.'; } },
    misuseSource(s) === 'cn'
      ? { label: 'Blame Beijing’s open models', hint: 'Hawks +8; Beijing temperature +12; trust -15; the anti-distillation crackdown gets an easier hearing for two months.', fx: s => { outbreakHit(s); HAWKS.forEach(id => rel(s, id, 8)); s.tension += 12; s.cn.trust -= 15; s.flags.momentum = { id: 'distill', until: s.turn + 2 }; return 'The President names the model and the lab in an Oval Office address. Beijing calls it a lie and recalls its ambassador for consultations.'; } }
      : { label: 'Make the lab whose model was used answer for it', hint: 'The frontier lab -25; Senate +4.', fx: s => { outbreakHit(s); frontierLab(s).rel -= 25; s.senateLobby += 4; return LD(frontierLab(s).id).ceo + ' testifies for six hours. The clip of the jailbreak plays on a loop.'; } },
    { label: 'A joint investigation with Beijing', hint: 'Beijing trust +10; science faction +6; hawks -8.', fx: s => { outbreakHit(s); s.flags.misuseChannel = true; s.cn.trust += 10; shiftCN(s, { sci: 6 }); HAWKS.forEach(id => rel(s, id, -8)); return 'Chinese and American epidemiologists share sequences within 48 hours. It is the first thing the two governments have done together in years.'; } },
  ] });

// --- the cabinet acts on its own ---
ev({ id: 'tsy_channel', p: 0.2, once: true, phases: ['p0', 'p1'], when: s => !P(s, 'tsy').alt && s.t > 3 && !s.war && !s.cn.deal,
  title: 'A back channel', stamp: 'Treasury, private dining room',
  body: () => `<p>You learn that the Treasury Secretary has been talking to Beijing’s Vice Premier for a month on a private line, about AI as much as soybeans. Nobody told State. The Vice Premier apparently likes the Treasury Secretary.</p>`,
  choices: [
    { label: 'Bless it and feed it your talking points', hint: 'Beijing trust +6; the next offer can go now; Treasury +8; State -10.', fx: s => { s.cn.trust += 6; s.cn.cooldown = 0; rel(s, 'tsy', 8); rel(s, 'sec', -10); return 'The Treasury Secretary reads your points nearly verbatim. Beijing’s answer comes back warmer than anything through State.'; } },
    { label: 'Tell State', hint: 'State +10 and +3 influence; Treasury -15.', fx: s => { rel(s, 'sec', 10); infl(s, 'sec', 3); rel(s, 'tsy', -15); return 'The Secretary of State has the line shut down by Friday and does not thank you in front of Treasury.'; } },
  ] });
ev({ id: 'war_drill', p: 0.25, once: true, phases: ['p0', 'p1'], when: s => P(s, 'war').rel < 10 && s.tension >= 40 && !s.war && !s.blockade,
  title: 'A show of force', stamp: 'The Pentagon',
  body: () => `<p>The Secretary of War has ordered a bomber and carrier exercise near the Strait for next week, without a principals meeting. “Deterrence doesn’t wait for a meeting.”</p>`,
  choices: [
    { label: 'Back it', hint: 'War +10; Beijing temperature +6.', fx: s => { rel(s, 'war', 10); s.tension += 6; return 'The B-21s fly a racetrack 80 miles off the coast. Beijing scrambles everything it has.'; } },
    { label: 'Get the President to scale it back', hint: s => P(s, 'cos').rel >= 15 ? 'Works: the Chief of Staff carries it. War -12; Beijing temperature -2.' : 'Needs the Chief of Staff at Friendly (15+). Otherwise it goes ahead and War -12 anyway.', fx: s => { rel(s, 'war', -12); if (P(s, 'cos').rel >= 15) { s.tension -= 2; return 'The exercise moves to the Philippine Sea. The Secretary of War leaks that you are “soft.”'; } s.tension += 6; return 'The Chief of Staff won’t take it in. The exercise goes ahead, and the Secretary of War knows you tried.'; } },
  ] });
ev({ id: 'cos_squeeze', p: 0.3, phases: ['p0', 'p1'], cooldown: 8, when: s => P(s, 'cos').rel <= -15 && !!s.done.team,
  title: 'Your detailees', stamp: 'Office of the Chief of Staff',
  body: () => `<p>The Chief of Staff’s office sends a note: two of your detailees are “needed back at their home agencies.” It is not about the detailees.</p>`,
  choices: [
    { label: 'Make peace', hint: '2 capital. Chief of Staff +12.', fx: s => { if (s.pc >= 2) { s.pc -= 2; rel(s, 'cos', 12); return 'You walk over a peace offering: credit for your next win. The detailees stay.'; } s.ap = Math.max(0, s.ap - 1); return 'You have nothing to offer. You lose an action this turn while you scramble to cover their work.'; } },
    { label: 'Let them go', hint: 'You lose an action this turn; Chief of Staff +3, satisfied.', fx: s => { s.ap = Math.max(0, s.ap - 1); rel(s, 'cos', 3); return 'Two desks go empty for a month.'; } },
  ] });

/* ================= events: selection ================= */
function eligible(s, e) {
  if (e.forced) return false;
  if (e.phases && e.phases.indexOf(s.phase) < 0) return false;
  if (e.once && s.seen[e.id]) return false;
  if (e.cooldown && s.seen[e.id] && s.turn - s.seen[e.id] < e.cooldown) return false;
  if (e.when && !e.when(s)) return false;
  return true;
}
let EV_LIST = null; // every event, in definition order, built on first use
function rollEvents(s) {
  const max = TUNE.eventsPerTurn;
  if (!EV_LIST) EV_LIST = Object.keys(EV).map(k => EV[k]);
  const pool = EV_LIST.filter(e => eligible(s, e));
  // shuffle deterministically through the rng
  for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(rnd(s) * (i + 1)); const tmp = pool[i]; pool[i] = pool[j]; pool[j] = tmp; }
  let n = 0;
  const months = turnMonths(s);
  for (const e of pool) { if (n >= max) break; if (rnd(s) < 1 - Math.pow(1 - (typeof e.p === 'function' ? e.p(s) : e.p), months)) { s.queue.push({ id: e.id }); s.seen[e.id] = s.turn; n++; } }
}
function currentEvent(s) {
  if (!s.queue.length) return null;
  const q = s.queue[0]; const e = EV[q.id];
  const ch = typeof e.choices === 'function' ? e.choices(s) : e.choices;
  return { id: q.id, title: e.title, stamp: typeof e.stamp === 'function' ? e.stamp(s) : e.stamp, body: e.body(s), choices: ch.map(c => ({ label: typeof c.label === 'function' ? c.label(s) : c.label, hint: typeof c.hint === 'function' ? c.hint(s) : (c.hint || '') })) };
}
const PROVOKE = ['theft', 'theft_foiled', 'smuggle_bust', 'distill_report', 'cn_race', 'cn_cheat', 'rare_earths', 'taiwan', 'johor', 'blockade', 'cable_cut'];
function chooseEvent(s, i) {
  if (!s.queue.length) return { error: 'No event' };
  const q = s.queue[0]; const e = EV[q.id];
  const c = (typeof e.choices === 'function' ? e.choices(s) : e.choices)[i]; if (!c) return { error: 'Bad choice' };
  const text = c.fx(s);
  if (PROVOKE.indexOf(q.id) >= 0) s.provoked = (s.provoked || 0) + 1;
  s.queue.shift();
  // a choice can change the phase (the knock starts the scramble): random events rolled for the old phase are dropped
  s.queue = s.queue.filter(x => { const d = EV[x.id]; return d.forced || !d.phases || d.phases.indexOf(s.phase) >= 0; });
  s.seen[q.id] = s.seen[q.id] || s.turn;
  (s.evN = s.evN || {})[q.id] = evN(s, q.id) + 1;
  normalize(s);
  checkEnd(s);
  return { text };
}

/* ================= turn engine ================= */
function normalize(s) {
  ['cred', 'alarm', 'salience', 'tension', 'coalition', 'W', 'intelQ'].forEach(k => s[k] = clamp(s[k]));
  s.markets = clamp(s.markets, 40, 140);
  s.pc = clamp(s.pc, 0, 12);
  s.senateLobby = clamp(s.senateLobby, -10, TUNE.hillCap);
  COMPONENTS.forEach(c => s.verify[c.id] = clamp(s.verify[c.id]));
  s.labs.forEach(l => { l.rel = clamp(l.rel, -100, 100); l.comp = clamp(l.comp); });
  s.principals.forEach(p => { p.infl = clamp(p.infl); p.rel = clamp(p.rel, -100, 100); p.shift = clamp(p.shift, -1, 1.6); });
  s.cn.trust = clamp(s.cn.trust);
  if (s.war) s.war.esc = clamp(s.war.esc);
}
function snapshot(s) {
  return { lead: lead(s), F: frontier(s), cn: s.cn.cap, cred: s.cred, pc: s.pc, salience: s.salience, markets: s.markets, tension: s.tension, coalition: s.coalition, alarm: s.alarm, coverage: coverage(s), ready1: ready1(s), ready2: ready2(s).avg, senate: senateVotes(s), support: pacingSupport(s), W: s.W, risk: monthlyRisk(s) };
}
// Months a turn covers: two in Phase 0 (outside wartime), one otherwise. The scramble runs two days a turn.
function turnMonths(s) { return s.phase === 'p0' && !s.war ? TUNE.slowMonths : 1; }
// Actions a turn: Phase 0's two-month turns get TUNE.p0Ap more.
function apFor(s) { return s.apMax + (s.phase === 'p0' ? TUNE.p0Ap : 0); }
// events that cut a two-month turn short, so the player answers them before another month passes
const STRAIT_STOP = ['blockade', 'war_begins', 'war', 'knock', 'runaway'];
function endTurn(s) {
  if (s.ending) return null;
  if (s.queue.length) return { error: 'Resolve the open event first' };
  const before = snapshot(s);
  const logStart = s.log.length;
  const n = turnMonths(s);
  for (let i = 0; i < n && !s.ending && !s.queue.some(q => STRAIT_STOP.indexOf(q.id) >= 0); i++) tick(s);
  // once a turn, not once a month: the event roll, fresh actions and capital
  rollEvents(s);
  s.ap = apFor(s); s.roomUsed = 0;
  s.pcCarry = (s.pcCarry || 0) + capitalIncome(s); const whole = Math.trunc(s.pcCarry); s.pc += whole; s.pcCarry -= whole;
  normalize(s);
  checkEnd(s);
  const after = snapshot(s);
  s.report = { before, after, logs: s.log.slice(logStart), date: dateLabel(s.t) };
  return s.report;
}
// One month of the world (two days during the scramble).
function tick(s) {
  const dt = s.phase === 'scramble' ? 2 / 30 : 1;
  const monthly = dt === 1;
  s.t += dt; s.turn++;
  const c = s.cn;

  // --- China's levers drift toward their targets
  const mv = (cur, tgt, rate) => cur + Math.sign(tgt - cur) * Math.min(Math.abs(tgt - cur), rate * dt);
  c.remote = mv(c.remote, c.remoteT, 0.4); c.dist = mv(c.dist, c.distT, 0.35); if (c.leakT != null) c.leak = mv(c.leak, c.leakT, 0.075); c.legal = mv(c.legal, c.legalT, 0.5);
  c.smuggle = mv(c.smuggle, c.smuggleT, 0.2); c.sme = mv(c.sme, c.smeT, 0.07);
  if (c.cooldown > 0) c.cooldown--;
  if (s.flags.warn && !c.deal && s.t >= s.flags.warn.until && !s.queue.some(q => q.id === 'warn_due')) s.queue.push({ id: 'warn_due' });

  // --- China's factions and posture
  if (monthly) {
    const f = c.f; f.m += (50 - f.m) * 0.08; f.sec += (30 - f.sec) * 0.08; f.sci += (20 - f.sci) * 0.08; shiftCN(s, {});
    if (paced(s)) shiftCN(s, { sci: 1 });
    const closed = c.legalT < 0.3 && c.distT < 0.5 && c.remoteT < 0.5;
    if (lead(s) > 8 && closed && !(c.deal && c.deal.terms.lane)) shiftCN(s, { sec: 2 });
    const sc = { diffuse: f.m, race: f.sec * (1 + (s.tension - 40) / 80), engage: f.sci * 1.2 + (paced(s) ? 10 : 0) + c.trust * 0.2 };
    for (const k in sc) sc[k] += gauss(s) * TUNE.postureNoise;
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
  const declared = usRates(s, true);
  s.labs.forEach((l, i) => { l.cap += rates[i] * dt + gauss(s) * 0.08 * dt; l.hidden = l.defect && covered(s, l) ? (l.hidden || 0) + (rates[i] - declared[i]) * dt : 0; });
  // defection and detection
  if (monthly && paced(s)) {
    const det = detection(s);
    s.labs.forEach(l => {
      if (!l.covered) return;
      const d = LD(l.id);
      if (!l.defect) {
        const pd = d.ruth * 0.2 * (l.id === 'mindscale' && s.flags.uaeOut ? 1.5 : 1) * (1 - l.comp / 100) * (seenLead(s) < 3 ? 1.8 : 1) * (1 - 0.5 * det) * (s.labs.some(x => !x.covered) ? 1.3 : 1);
        if (rnd(s) < pd) { l.defect = true; l.defectSince = s.turn; }
      } else if (rnd(s) < det) { s.stats.defectCaught++; s.queue.push({ id: 'defector', lab: l.id }); }
      else if (s.turn - l.defectSince > 4 && rnd(s) < 0.3) { l.defect = false; s.stats.defectMissed++; }
      l.comp += (complianceBase(s, l) - l.comp) * 0.1;
    });
  }

  // --- China growth, cheating, theft
  if (monthly && c.deal) {
    // a deal reached in cold conditions is brittle: low trust, and controls still in force, make Beijing likelier to cheat
    const held = ['chips', 'remote', 'distill', 'smuggle'].filter(k => s.policies[k]).length;
    if (!c.cheat && fuseHit(s, 'cheat', (0.03 + 0.25 * (c.f.sec / 100) * (1 - cnVisibility(s))) * concealment(s) * (1.4 - TUNE.cheatTrust * c.trust / 100) * (1 + TUNE.cheatResent * held) * ((s.flags.cnGrievance || 0) >= s.turn ? 1.6 : 1) * lean(s, TUNE.cheatResolve) * Math.max(0.25, 1 + TUNE.cheatHeat * (s.tension - 28) / 40) * emboldened(s))) c.cheat = true;
    const quiet = (s.flags.cheatQuiet || 0) >= s.turn || s.queue.some(q => q.id === 'cn_cheat');
    if (!quiet && c.cheat && rnd(s) < cnVisibility(s)) s.queue.push({ id: 'cn_cheat', real: true, conf: cheatConf(s, true) });
    else if (!quiet && !c.cheat && rnd(s) < TUNE.falseAlarm * (1 - s.intelQ / 100)) s.queue.push({ id: 'cn_cheat', real: false, conf: cheatConf(s, false) });
  }
  c.cap += cnRate(s) * dt + gauss(s) * 0.06 * dt;
  if (s.open != null) {
    // an honest deal with the lane term holds every published model TUNE.laneGap below the paced frontier; weights already out stay out
    const ceil = c.deal && c.deal.terms.lane && !c.cheat ? publicFrontier(s) - TUNE.laneGap : Infinity;
    if (s.open < ceil) s.open = Math.min(ceil, s.open + openRate(s) * dt);
    if (monthly && TUNE.openPub && c.posture === 'diffuse') s.open = Math.max(s.open, Math.min(ceil, c.cap - TUNE.openLag)); // Beijing publishes its labs' models
    c.cap = Math.max(c.cap, s.open - TUNE.openFloor); // downloading is not training: no deal or control stops China using what is public
  }
  c.hidden = c.deal && c.cheat ? (c.hidden || 0) + 0.45 * dt : 0; // revealed (back to 0) once the cheating stops or the deal ends
  {
    const F = frontier(s);
    const tr = theftRisk(s);
    const steal = () => { c.cap = F - 0.6; s.stats.thefts++; s.tension += 5; shiftCN(s, { sec: 3 }); s.queue.push({ id: 'theft', lab: frontierLab(s).id }); log(s, 'Frontier model weights were stolen.', 'bad'); };
    if (TUNE.fuse > 1) { if (c.cap < F - 0.6 && fuseHit(s, 'theft', tr.attempt * dt * tr.success)) steal(); else if (rnd(s) < 0.5 * tr.attempt * dt * (1 - tr.success)) s.queue.push({ id: 'theft_foiled', lab: frontierLab(s).id }); }
    else if (rnd(s) < tr.attempt * dt) {
      if (rnd(s) < tr.success && c.cap < F - 0.6) steal();
      else if (rnd(s) < 0.5) s.queue.push({ id: 'theft_foiled', lab: frontierLab(s).id });
    }
  }

  // --- hazards
  const hz = hazards(s);
  let surv = 1;
  // a hazard that fires is a warning shot (warningShotP) or a runaway
  const fire = x => { if (rnd(s) < warningShotP(s, x.who)) { s.queue.unshift({ id: 'warning', who: x.who, flavor: x.who === 'open' && (s.agents || 0) >= 20 ? 'swarm' : warnFlavor(s, ['exfil', 'sovereign', 'collude', 'sandbag']) }); s.flags.lastWarning = s.turn; (s.stats.warnR = s.stats.warnR || []).push(frontier(s) / s.T); s.stats.warnings = (s.stats.warnings || 0) + 1; } else s.queue.unshift({ id: 'runaway', who: x.who }); };
  const queued = () => s.queue.some(q => q.id === 'runaway' || q.id === 'warning');
  if (TUNE.fuse > 1) { const hs = hz.map(x => 1 - Math.pow(1 - x.h, dt)), tot = 1 - hs.reduce((a, h) => a * (1 - h), 1); if (!queued() && fuseHit(s, 'runaway', tot)) { let r = rnd(s) * hs.reduce((a, h) => a + h, 0), i = 0; while (i < hs.length - 1 && (r -= hs[i]) > 0) i++; fire(hz[i]); } }
  hz.forEach(x => { const h = 1 - Math.pow(1 - x.h, dt); if (TUNE.fuse <= 1 && !queued() && rnd(s) < h) fire(x); surv *= 1 - h * (1 - warningShotP(s, x.who)); });
  s.riskExposure = 1 - (1 - s.riskExposure) * surv;
  // past the threshold without a binding deal, China can also get recursive self-improvement working, and keep control of it
  if (!s.ending && !(s.cn.deal && !s.cn.cheat) && !s.queue.some(q => q.id === 'runaway' || q.id === 'warning') && fuseHit(s, 'cnwin', 1 - Math.pow(1 - TUNE.cnWin * nearness(s, s.cn.cap), dt))) { s.ending = 'cnwins'; log(s, 'China crossed the threshold first, and kept control.', 'bad'); }
  {
    const fl = frontierLab(s); const r = Math.min(1, Math.max(0, frontier(s) / s.T));
    const pw = (0.05 + 0.15 * r) * (covered(s, fl) ? (s.pacing.automation ? 0.35 : 0.6) : 1);
    const last = s.flags.lastWarning || -99;
    if (s.turn - last >= 3 && !s.queue.some(q => q.id === 'warning' || q.id === 'runaway') && rnd(s) < 1 - Math.pow(1 - pw, dt)) {
      s.queue.push({ id: 'warning', who: fl.id, flavor: warnFlavor(s, r < 0.5 ? ['breach', 'sandbag', 'persuade', 'cyber'] : ['breach', 'exfil', 'collude', 'cyber', 'bio', 'sovereign', 'persuade', 'sandbag']) }); s.stats.warnings = (s.stats.warnings || 0) + 1; (s.stats.warnR = s.stats.warnR || []).push(r); s.flags.lastWarning = s.turn;
    }
  }

  // --- verification
  if (monthly) {
    const v = s.verify;
    const base = s.warp === 1 ? 2 : s.warp === 2 ? 4 : 0;
    COMPONENTS.forEach(cm => { v[cm.id] += base * (!cm.trusted ? (s.phase === 'p0' ? 0.4 : 0.7) : 1) * (cm.id === 'inspect' && enjoined(s) ? TUNE.enjoinedMult : 1); });
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
    s.cred += TUNE.mktCred * (s.markets - 100) / 20;
    marketNews(s);
    s.principals.forEach(p => { p.askAge++; if (p.askAge > TUNE.askNeglect) { p.rel -= 3; p.askAge = 0; } });
    s.principals.forEach(p => { p.rel *= TUNE.relDrift; });
    // firing
    s.principals.forEach(p => { const d = PRINCIPALS[PIDX[p.id]]; if (d.fireable && !p.alt && p.infl < 12) { const old = PD(s, p.id).name; p.alt = true; p.infl = 45; p.rel = 0; p.shift = 0; s.queue.push({ id: 'fired_p', pid: p.id, name: old }); log(s, 'The ' + old + ' is out.', 'pol'); } });
    s.cred -= hostileDrain(s);
    misuseTick(s);
    tierTick(s);
    cabinetMoves(s);
  }
  if (s.phase === 'p0') {
    const r = frontier(s) / s.T;
    s.alarm += (2 + s.salience / 25 + Math.max(0, r - 0.55) * 45) * dt;
    if (r >= 0.86 && !s.seen.ceo_call) { s.queue.push({ id: 'ceo_call' }); s.seen.ceo_call = s.turn; }
    if (s.alarm >= 100 && !s.queue.some(q => q.id === 'knock') && !(s.flags.downplayed && s.turn - s.flags.downplayed < 2)) s.queue.push({ id: 'knock' });
  }

  // --- midterms
  if (!s.seen.midterms && s.t >= 0.75) { s.flags.senateFlipped = rnd(s) < logistic((3.4 - 0.4 * (s.markets - 100) - 0.1 * s.salience) / 3); s.queue.push({ id: 'midterms' }); s.seen.midterms = s.turn; }
  if (!s.seen.uae && s.t >= 15.6) { s.queue.push({ id: 'uae' }); s.seen.uae = s.turn; }

  // --- the pacing bill comes to a vote
  if (s.flags.billDue && s.t >= s.flags.billDue) {
    s.flags.billDue = null;
    // the whip count is soft: the votes that show up on the day vary around it
    const day = senateVotes(s) + Math.round(TUNE.whip * gauss(s)); s.stats.billVotes = (s.stats.billVotes || []).concat([[senateVotes(s), day]]);
    if (day >= 55) { s.flags.statute = true; s.labs.forEach(l => { if (s.pacing.active || s.pacing.armed) { l.signed = true; l.covered = true; } }); log(s, 'Congress passes the pacing act. The pause is now law.', 'good'); }
    else { s.cred -= 5; s.flags.billBack = s.t + TUNE.billBack; log(s, 'The pacing bill fails on the Senate floor (' + day + ' votes; the whip count said ' + senateVotes(s) + ').', 'bad'); }
  }
  // --- the matched-pause resolution comes to a vote
  if (s.flags.matchDue && s.t >= s.flags.matchDue) {
    s.flags.matchDue = null;
    const day = senateVotes(s) + Math.round(TUNE.whip * gauss(s));
    if (day >= 50) { s.flags.matchLaw = true; log(s, 'Congress authorizes a matched pause: America stops the day China does.', 'good'); }
    else { s.cred -= 3; s.flags.matchBack = s.t + 4; log(s, 'The matched-pause resolution fails on the Senate floor (' + day + ' votes).', 'bad'); }
  }
  // --- pacing upkeep
  if (s.phase === 'p1' && paced(s) && monthly) {
    s.stats.monthsPaced++;
    s.flags.monthsInP1 = (s.flags.monthsInP1 || 0) + 1;
    if (keepGap(s) && !s.flags.keptGap) { s.flags.keptGap = s.turn; log(s, 'With no deal and the lead down to about ' + Math.round(seenLead(s)) + ' months, the paused labs now keep pace with China instead of stopping.', 'info'); }
    const ps = pacingSupport(s);
    if (ps < 25) s.pacing.low++; else s.pacing.low = Math.max(0, s.pacing.low - 1);
    if (s.pacing.low === 1 && ps < 25) s.queue.push({ id: 'wobble' });
    if (s.pacing.low >= 3 || ps < TUNE.supportBreak) s.queue.push({ id: 'collapse' });
    if ((s.flags.courtNext || 0) <= s.turn && fuseHit(s, 'court', courtP(s))) { s.flags.courtNext = s.turn + 4; s.queue.push({ id: 'court' }); }
    if (s.flags.appeal === s.turn) { if (draw(s, 'court', s.flags.appealP || 0.5) < (s.flags.appealP || 0.5)) { s.labs.forEach(l => { if (l.signed) l.covered = true; }); s.flags.verifyEnjoined = false; log(s, 'The appeals court restores the orders.', 'good'); } else log(s, 'The appeal fails.' + (enjoined(s) ? ' The Charter\u2019s mandatory verification stays enjoined until Congress acts.' : ''), 'bad'); }
    if (s.pacing.seq === 'deadline' && !s.cn.deal && s.pacing.deadline && s.t >= s.pacing.deadline && !s.queue.some(q => q.id === 'deadline_up')) s.queue.push({ id: 'deadline_up' });
    if (s.overhang >= 5 && !s.seen.tinder) { s.queue.push({ id: 'tinder' }); s.seen.tinder = s.turn; }
    // Beijing is watching too: a secret US run (likelier with inspections in the deal and a hard-pushing cyber service), or a US lab cheating under a deal
    if (s.labs.some(l => l.secret) && !s.queue.some(q => q.id === 'us_exposed') && rnd(s) < TUNE.usCatch + (s.cn.deal && s.cn.deal.terms.inspect ? 0.25 : 0) + 0.1 * clamp((s.cn.cyber || 1) - 1, -0.5, 0.8)) s.queue.push({ id: 'us_exposed' });
    if (s.cn.deal) s.labs.forEach(l => { if (l.defect && !l.cnSaw && rnd(s) < TUNE.cnSeesUS) { l.cnSaw = true; s.queue.push({ id: 'us_lab_caught', lab: l.id }); } });
    // a Charter signatory can walk out, likelier for a reckless lab with shaky compliance, when China is close or racing; a statute binds them
    if (s.pacing.mech === 'charter' && !s.flags.statute && !s.queue.some(q => q.id === 'walkout')) s.labs.forEach(l => {
      if (!l.covered || !l.signedVoluntary) return;
      const pw = TUNE.walkRate * (0.2 + LD(l.id).ruth) * (1 - l.comp / 100) * (seenLead(s) < 3 ? 2 : 1) * (s.cn.posture === 'race' ? 1.5 : 1);
      if (fuseHit(s, 'walk', pw)) s.queue.push({ id: 'walkout', lab: l.id });
    });
    // China passes the paced frontier
    if (s.cn.cap > frontier(s) + 0.5) { s.flags.overtaken = (s.flags.overtaken || 0) + 1; if (s.flags.overtaken >= 2) s.queue.push({ id: 'collapse' }); }
  }
  // labs bound without signing voluntarily lobby the Hill against the pause, the reckless ones hardest
  // and much harder while a pacing bill is moving, when voluntary signers join in at half strength
  if (s.phase === 'p1' && monthly) s.labs.forEach(l => { const forced = l.covered && !l.signedVoluntary, m = s.flags.billDue ? TUNE.billFight * (forced ? 1 : 0.5) : forced ? 1 : 0; s.senateLobby -= TUNE.labLobby * (0.25 + LD(l.id).ruth) * m; });
  if (s.pacing.mech === 'dpa' && s.phase === 'p1' && !s.flags.dpaSince) { s.flags.dpaUsed = true; s.flags.dpaSince = s.turn - 1; }

  // --- the Strait: a quarantine can end or turn into war; war climbs the escalation meter until a ceasefire
  if (s.tension >= 100 && !s.war && !s.queue.some(q => q.id === 'war' || q.id === 'war_begins')) s.queue.unshift({ id: 'war' });
  if (monthly) {
    if (s.war) {
      const w = s.war; w.months++; s.stats.warMonths = (s.stats.warMonths || 0) + 1;
      s.tension = Math.max(s.tension, 85); s.markets -= 2; c.supply = 0.2;
      // a steady climb, plus now and then an incident (a carrier hit, a base struck) that jumps it
      w.esc += TUNE.warEsc * (3 + 4 * gauss(s) + (rnd(s) < 0.15 ? 20 : 0));
      if (w.esc < 100 && rnd(s) < 0.04 + 0.025 * w.months) endWar(s, 'Exhausted, both sides accept a ceasefire.');
    } else if (s.blockade) {
      const b = s.blockade; s.markets -= 1.5;
      if (rnd(s) < escalateP(s)) startWar(s, 'blockade', 25);
      else if (b.mode === 'talks' ? s.turn >= b.until : rnd(s) < (b.mode === 'convoy' ? 0.3 : 0.15)) endBlockade(s, 'Beijing lifts the quarantine of Taiwan.');
    } else {
      c.supply = mv(c.supply == null ? 1 : c.supply, 1, 0.1);
      if (s.stats.wars && c.deal) s.stats.dealAfterWar = true;
      if (!s.queue.some(q => q.id === 'war') && fuseHit(s, 'strait', straitRisk(s))) { if (rnd(s) < directP(s)) startWar(s, 'beijing', 30); else startBlockade(s); }
    }
  }

  // --- scramble clock
  if (s.phase === 'scramble') {
    s.scramble.turn++;
    if (s.scramble.turn > s.scramble.max && !s.queue.some(q => q.id === 'window')) s.queue.push({ id: 'window' });
  }

  s.stats.peakLead = Math.max(s.stats.peakLead, lead(s));
  recordIndicators(s);
  normalize(s);
  pushHist(s);
  checkEnd(s);
}
function checkEnd(s) {
  if (s.ending) return;
  if (s.cred <= 5) { s.ending = 'fired'; return; }
  if (s.war && s.war.esc >= 100) { s.ending = 'war'; return; }
  if (s.t >= END_T && !s.queue.length) {
    if (s.war) s.ending = 'wartime';
    else if (paced(s) && s.cn.deal) s.ending = 'uneasy';
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
  cnwins: { tone: 'bad', tag: 'CHINA FIRST', title: 'Beijing got recursive self-improvement working first.', text: 'Chinese labs crossed the threshold and kept control of what they built. Within months the gap is measured in years, and it is not in America\u2019s favor. Whatever comes next, Beijing sets the terms.' },
  overtaken: { tone: 'bad', tag: 'OVERTAKEN', title: 'China got there first.', text: 'Chinese capability passed the American frontier. Everything the hawks warned about came true, for reasons they did not predict.' },
  loc: { tone: 'bad', tag: 'LOSS OF CONTROL', title: 'Nobody can turn it off.', text: 'The shutdown came too late. Copies of the model are running on infrastructure no government controls, optimizing for something no one chose.' },
  war: { tone: 'bad', tag: 'NUCLEAR USE', title: 'Two nuclear powers, one Strait.', text: 'The war that started over Taiwan and compute climbed one rung too many. A low-yield weapon detonates over a carrier group east of Okinawa. Whatever happens next, no one is pacing anything.' },
  wartime: { tone: 'bad', tag: 'STILL AT WAR', title: 'The Strait is still burning.', text: 'It is December 2028 and the war over Taiwan has not ended. TSMC\u2019s fabs are dark, the labs answer to the Pentagon, and nobody is negotiating anything about AI.' },
  fired: { tone: 'bad', tag: 'FIRED', title: 'Your badge stops working on a Tuesday.', text: 'The President thanks you for your service on social media. The next AI Czar is a venture capitalist who calls pacing \u201cunilateral disarmament.\u201d' },
};
function score(s) {
  const base = { phase2: 600, cnwins: 30, betrayed: 40, uneasy: 480, alone: 450, race: 120, overtaken: 80, loc: 0, war: 0, wartime: 100, fired: 60 }[s.ending] || 0;
  let sc = base;
  if (['phase2', 'uneasy', 'alone'].indexOf(s.ending) >= 0) sc += Math.min(150, 10 * Math.max(0, lead(s)));
  sc += Math.round(200 * (1 - s.riskExposure));
  sc += Math.round(ready2(s).avg);
  sc -= Math.round(5 * Math.max(0, s.overhang - 4));
  sc -= 5 * (s.stats.warMonths || 0);
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
  if (s.stats.wars) {
    // the route the strategy search shows: Phase 2 needs an interim deal, war ends it, and a war game is lost unless the deal comes back
    const when = monthLabel(s.stats.warT0), nw = s.stats.wars > 1 ? s.stats.wars + ' wars' : 'a war';
    const lead_ = s.stats.wars > 1 ? 'The first war, in ' + when + ',' : 'The war in ' + when;
    const how = lead_ + (s.stats.warDealLost ? ' ended your deal with Beijing' : ' broke out with no deal in place');
    const again = s.stats.warDealLost ? ' back' : '';
    const back = s.ending === 'war' ? '. It went nuclear before a ceasefire.'
      : s.ending === 'phase2' || s.ending === 'betrayed' ? '. You won a deal' + again + ' after the ceasefire, and Phase 2 was signed.'
      : s.cn.deal ? '. You won a deal' + again + ', but Phase 2 never closed.'
      : s.stats.dealAfterWar ? '. You won a deal' + again + ' after the ceasefire but lost it again, and Phase 2 needs one.'
      : '. Phase 2 needs an interim deal, and you never got one' + again + (s.war ? ': the war was still on at the end.' : '.');
    const gap = s.stats.warLead0 - lead(s) >= 1 ? ' The US lead went from ' + r1(s.stats.warLead0) + ' months when the war began to ' + r1(Math.max(0, lead(s))) + ' at the end.' : '';
    out.push('There ' + (s.stats.wars > 1 ? 'were ' : 'was ') + nw + ' over Taiwan, ' + (s.stats.warMonths || 0) + ' month' + (s.stats.warMonths === 1 ? '' : 's') + ' in all. ' + how + back + gap + ' A cool Beijing, a deal, and not racing far ahead near the threshold keep war away.');
  }
  else if (s.stats.blockades) out.push('Beijing quarantined Taiwan ' + (s.stats.blockades > 1 ? s.stats.blockades + ' times' : 'once') + ' without it turning into war.');
  if (s.stats.covert) out.push('Covert operations bought time at the cost of Beijing’s trust. A deal signed under duress is one the other side tries to undermine.');
  if (s.overhang > 6) out.push('The compute overhang reached ' + r1(s.overhang) + ' months: dry tinder for the day the pause ends.');
  out.push('True RSI threshold this game: ' + monthLabel(START_T + s.T) + ' at the unpaced rate. The IC was ' + (Math.abs(s.icBias || 0) < 1 ? 'about right' : (s.icBias > 0 ? 'too relaxed by about ' : 'too alarmed by about ') + Math.round(Math.abs(s.icBias)) + ' months') + '.');
  return out;
}

/* ================= view model for the UI ================= */
function view(s) {
  const le = leadEstimate(s), ic = icEstimate(s), r2 = ready2(s);
  // Who sits past the near edge of the IC's RSI window: what the player can see, unlike the hazards, which use the true threshold.
  const PF = publicFrontier(s), zoneAt = PF + ic.lo * Math.max(0.05, frontierRate(s, true));
  const inZone = s.labs.filter(l => knownCap(l) >= zoneAt).map(l => LD(l.id).name).concat(PF - le.mid >= zoneAt ? ['China'] : []).concat(s.open != null && s.open >= zoneAt ? ['open-weight models'] : []);
  return {
    date: dateLabel(s.t), month: monthLabel(s.t), phase: s.phase,
    phaseLabel: s.phase === 'p0' ? (s.pacing.collapsed ? 'Aftermath' : 'Phase 0 · Getting in position') : s.phase === 'scramble' ? 'The Scramble · Day ' + (1 + 2 * (s.scramble.turn - 1)) + ' of 14' : (s.pacing.armed && !s.pacing.active ? 'Phase 1 · Standby' : 'Phase 1 · Month ' + (s.flags.monthsInP1 + 1)) + (s.war ? ' · At war' : s.blockade ? ' · Taiwan quarantined' : ''),
    F: publicFrontier(s), leadEst: le, ic, crossover: crossoverMonths(s), cnRate: cnRate(s), usRate: frontierRate(s, true),
    coverage: coverage(s), ready1: ready1(s), ready2: r2, senate: senateVotes(s), support: pacingSupport(s),
    risk: monthlyRisk(s), hazards: hazards(s), theft: theftRisk(s, true), drag: usDrag(s), cnComp: cnComp(s), cnEst: cnEstimate(s), cnRead: cnReadout(s), detection: detection(s), cnVis: cnVisibility(s),
    roomLeft: roomMax(s) - s.roomUsed, roomMax: roomMax(s), phase2: phase2Check(s), briefOdds: s.phase === 'p0' ? briefOdds(s) : null,
    rObs: rObserved(s), pauseMood: pauseMood(s), inZone, strait: straitEstimate(s), open: s.open, // public weights: benchmarked by anyone, so seen exactly
    misuse: { cyber: cyberP(s), bio: bioP(s), agents: s.agents || 0 },
  };
}

// The parts of view() bots read, each computed only when asked for.
function quickView(s) {
  return { get ic() { return icEstimate(s); }, get leadEst() { return leadEstimate(s); }, get briefOdds() { return s.phase === 'p0' ? briefOdds(s) : null; }, get rObs() { return rObserved(s); },
    get support() { return pacingSupport(s); }, get senate() { return senateVotes(s); }, get cnRead() { return cnReadout(s); }, get cnEst() { return cnEstimate(s); } };
}

const API = {
  newGame,
  endTurn,
  act,
  listActions,
  availability,
  actionCost,
  roomPreview,
  currentEvent,
  chooseEvent,
  view,
  quickView,
  charterOdds,
  charterDecide,
  finishConvening,
  makeOffer,
  offerPreview,
  cnAcceptEstimate,
  score,
  lessons,
  cnSources,
  openFrontier,
  openRate,
  reassured,
  resolve,
  resolveParts,
  reassureCred,
  reassureParts,
  standbyCred,
  standbyParts,
  termRead,
  threatCred,
  credWord,
  threatParts,
  warnValue,
  concedeP,
  warnable,
  CTRL_THREAT,
  keystone,
  CARROT_IDS,
  dateLabel,
  monthLabel,
  seenLead,
  currentAsk,
  cnParts,
  PD,
  P,
  L,
  LD,
  lead,
  frontier,
  covered,
  coverage,
  trueIndicators,
  straitParts,
  straitMult,
  straitRisk,
  straitEstimate,
  escalateP,
  ceasefireP,
  startBlockade,
  startWar,
  EVENTS: EV,
  misuseWord,
  misuseLevel,
  cyberP,
  bioP,
  knownCap,
  publicFrontier,
  recentFavors,
  apFor,
  TUNE,
  usDrag,
  chips,
  oddsWord,
  betrayP,
  betrayWord,
  courtP,
  courtRead,
  concealment,
  summitCourtP,
  SL,
  nearness,
  SEQ,
  senateParts,
  supportParts,
  relTier,
  TIER_FX,
  allyCount,
  capitalIncome,
  marketCapital,
  hostileDrain,
  roomMax,
  theftRisk,
  pauseMood,
  ACT,
  PRINCIPALS,
  LABS,
  COMPONENTS,
  PROJECTS,
  TERMS,
  MECH,
  THRESH,
  TRIG,
  ENDINGS,
  DIFFS,
  START_T,
  END_T,
  MONTHS,
};
if (typeof module !== 'undefined' && module.exports) module.exports = API; else root.ScrambleEngine = API;
})(typeof self !== 'undefined' ? self : this);
