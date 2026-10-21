// Print a genome as a plain-English playbook, what each of its departures from the expert is worth,
// and a turn-by-turn annotated game. Usage: node sim/narrate.js [genome.json] [seed]
const E = require('../engine.js');
const S = require('./strategy.js');
const file = process.argv[2] || __dirname + '/best_genome_advisor_v2.json';
const G = S.loadGenome(file);
const X = S.expertGenome();
const out = [];
const P = x => out.push(x);
const pct = x => Math.round(100 * x) + '%';
const name = id => E.PD(E.newGame({ seed: 1 }), id).name;

// --- worth of each departure from the expert: remove it from the best and measure the drop
const seeds = Array.from({ length: 800 }, (_, i) => 600000 + i);
const base = S.evaluate(G, seeds);
const worth = {};
S.genes(G).filter(k => JSON.stringify(G[k]) !== JSON.stringify(X[k])).forEach(k => { worth[k] = base.win - S.evaluate(Object.assign({}, G, { [k]: X[k] }), seeds).win; });
const w = k => worth[k] == null ? '' : ` _(worth ${worth[k] >= 0 ? '+' : ''}${(100 * worth[k]).toFixed(1)} pts vs the expert's choice)_`;

P(`# The optimized strategy\n\n_Genome ${file}, searched under ${G._rules ? G._rules.commit : 'unstamped rules'}; narrated under ${S.rulesStamp().commit}._\n\nWins ${pct(base.win)} of 800 fresh Advisor games (loss of control ${pct(base.loc)}). "Worth" = how many points of win rate are lost if that one rule is switched back to the scripted expert's choice.\n`);

P('## Phase 0 (two-month turns)\n');
const projs = S.PROJ.filter(p => G['proj.' + p] >= 0).sort((a, b) => G['proj.' + b] - G['proj.' + a]);
const skip = S.PROJ.filter(p => G['proj.' + p] < 0);
const pname = id => E.PROJECTS.find(p => p.id === id).name;
P(`- **Projects, in order:** ${projs.map(pname).join(' → ')}.`);
P(`- **Never builds:** ${skip.map(p => pname(p) + w('proj.' + p)).join('; ') || 'nothing'}.`);
const pols = S.POL0.filter(p => G['pol.' + p] >= 0).sort((a, b) => G['pol.' + b] - G['pol.' + a]);
P(`- **One Oval policy per turn, in order:** ${pols.map(p => E.ACT[p].name).join(' → ')}. **Never pushes:** ${S.POL0.filter(p => G['pol.' + p] < 0).map(p => E.ACT[p].name).join(', ')}.`);
const gates = Object.keys(S.GATE).filter(p => G['gate.' + p] > 0 && G['pol.' + p] >= 0);
const rd = (k, x) => ['cyber', 'hide', 'courts'].indexOf(k) >= 0 ? x.toFixed(2) + '× typical' : k === 'sci' ? Math.round(x) : pct(x);
if (gates.length) P(`- **Reads the Beijing tab first:** ${gates.map(p => `skips ${E.ACT[p].name} unless ${S.GATE[p][0]} reads at least ${rd(S.GATE[p][0], G['gate.' + p])}${w('gate.' + p)}`).join('; ')}.`);
const pgates = Object.keys(S.PGATE).filter(p => G['pgate.' + p] > 0 && G['proj.' + p] >= 0);
if (pgates.length) P(`- **Builds only when it pays this game:** ${pgates.map(p => `skips ${pname(p)} unless ${S.PGATE[p][0]} reads at least ${rd(S.PGATE[p][0], G['pgate.' + p])}${w('pgate.' + p)}`).join('; ')}.`);
P(`- **Meetings:** ${!G.meetEvery ? 'none on a schedule' : `every ${G.meetEvery} turns, ${G.meetA === G.meetB ? 'always the ' + name(G.meetA) : `alternating the ${name(G.meetA)} and the ${name(G.meetB)}`}`}.${w('meetEvery')}${w('meetA')}${w('meetB')}`);
const favs = E.PRINCIPALS.map(p => p.id).filter(p => G['fav.' + p]);
P(`- **Favors:** grants every ask from ${favs.map(name).join(', ') || 'nobody'}, as long as capital stays at ${G.favReserve} or more.${favs.map(p => w('fav.' + p)).filter(Boolean).slice(0, 3).join('')}`);
P(`- **Emergency meeting:** asks only when the indicators are ${pct(G.briefR)} of the way to the threshold **and** the President is ${pct(G.briefOdds)} likely to agree${G.briefIc > 0.5 ? `, or when the IC says RSI is within ${G.briefIc.toFixed(1)} months and the odds exceed ${pct(G.briefIcOdds)}` : ''}.${w('briefOdds')}`);
if (G.speechIc > 0.5) P(`- **Speeches:** pushes a presidential address when the IC says RSI is within ${G.speechIc.toFixed(1)} months and the meeting isn't winnable yet.`);
P(`- **Spare actions:** ${G.alliesIdle ? 'build the treaty coalition' : 'nothing'}.\n`);

P('## The scramble\n');
const mrule = G.mechCut < 2 && G.mechHostile !== G.mech ? `${E.MECH[G.mech].label}, or ${E.MECH[G.mechHostile].label} when counsel reads the courts above ${G.mechCut.toFixed(2)}× typical` : E.MECH[G.mech].label;
const crule = [G.mech, G.mechHostile].indexOf('charter') >= 0 && G.charterMin > 0.02 ? `; the Charter only if Mindscale is at least ${pct(G.charterMin)} likely to sign, else ${E.MECH[G.mechNoSign].label}` : '';
const lrule = G.licRelMin <= 100 ? `Commerce licensing whenever the Commerce Secretary's relationship is at least ${Math.round(G.licRelMin)}; otherwise ` : '';
P(`- **Mechanism:** ${lrule}${mrule}${crule}.${w('mech')}${w('mechHostile')}${w('mechCut')}${w('charterMin')}${w('mechNoSign')}  **Threshold:** ${G.thr}.${w('thr')}  **Automation limits:** ${G.auto ? 'yes' : 'no'}.${w('auto')}  **Monitoring trigger:** ${G.trig === 'none' ? 'none' : E.TRIG[G.trig].label}.${w('trig')}`);
P(`- **Go first?** ${G.seq === 'adaptive' ? `wait for Beijing if the IC says RSI is ${G.seqIc.toFixed(1)}+ months away, otherwise go first` : E.SEQ[G.seq].label}.${w('seq')}${w('seqIc')}`);
P(`- **Signing table:** asks the labs in order; sweetens a lab's deal only if its odds are under ${pct(G.dealBelow)} and it holds at least ${pct(G.dealMinShare)} of US compute.${w('dealMinShare')}`);
P(`- **Launch:** ${G.waitFull ? 'waits until automation limits and the trigger are in (or day 11)' : 'as soon as possible'}. **Spare actions:** ${G.scrIdle}${G.scrOffer ? '; also makes Beijing an offer during the scramble' : ''}.\n`);

P('## Phase 1 (monthly turns), in priority order each action\n');
const terms = ['inspect', 'lane', 'institute', 'relief', 'visas', 'freeze', 'chips'].filter(t => G['o.' + t]);
P(`1. Call the Phase 2 summit the moment every requirement is met.`);
if (G.gofirstIc > 0.5) P(`2. If on standby and the IC says RSI is within ${G.gofirstIc.toFixed(1)} months: go first after all.`);
if (G.covertWithin > 0.5) P(`- Covert disruption whenever China gets within ${G.covertWithin.toFixed(1)} months.`);
P(`3. Add automation limits / trigger / sign missing labs if still missing.`);
P(`4. **Offer Beijing:** mutual cap + ${terms.map(t => E.TERMS.find(x => x.id === t).label.toLowerCase()).join(', ')}${G.threatLead < 14 ? `, plus a threat if the lead is over ${G.threatLead.toFixed(1)} months` : ''}. Re-offers whenever Beijing will take a call.${terms.map(t => w('o.' + t)).filter(Boolean).join('')}`);
P(`5. Fund verification to the top (${G.fundFirst ? 'early' : 'late'}). Hardware pacing once the overhang passes ${G.hwOver.toFixed(1)} months.${w('hwOver')}`);
P(`6. Presidential address if pacing support drops below ${Math.round(G.speechSup)}.${w('speechSup')} Coalition work while coalition < ${Math.round(G.alliesCoal)} or Senate < ${Math.round(G.senateT)}.${w('senateT')}`);
P(`- **Congress:** ${G.statute ? 'works the Hill to 60 votes and sends a pacing bill' + (G.hillMoving ? ', and keeps working it while the bill is moving' : '') : 'stays on executive authority'}${G.hillP0 ? ', and works the Hill with spare Phase 0 actions' : ''}.${w('statute')}${w('hillMoving')}${w('hillP0')} **Intelligence:** commissions IC assessments while intelligence is under ${Math.round(G.intelTarget)}${w('intelTarget')}; calls the summit only when confidence Beijing will comply is ${G.summitConf} or better.${w('summitConf')} **Cheating alerts:** ${G.cheatDismiss === 'never' ? 'never dismissed' : 'dismissed when IC confidence is ' + G.cheatDismiss + ' or lower'}.${w('cheatDismiss')}`);
P(`7. Surge verification (${G.surge}); meet the VP if support < ${Math.round(G.meetSup)}; then leftover projects.\n`);

P('## Every event choice\n');
const dummy = E.newGame({ seed: 3 }); dummy.policies.remote = true; dummy.flags.senateFlipped = true;
const ctx = { lab: 'mindscale', who: 'mindscale', pid: 'doc', name: 'Commerce Secretary' };
S.EVENTS.forEach(id => {
  dummy.queue = [Object.assign({ id }, ctx)];
  let ev; try { ev = E.currentEvent(dummy); } catch (e) { return; }
  const i = (G['ev.' + id] || 0) % ev.choices.length;
  P(`- **${ev.title}** → ${ev.choices[i].label}${ev.choices.length > 1 ? '' : ' (only option)'}.${w('ev.' + id)}`);
});

// --- a turn-by-turn game
const seedArg = +process.argv[3];
let seed = seedArg;
if (!seed) { for (let sd = 910000; sd < 910400; sd++) { const s = S.play(G, sd); if (s.ending === 'phase2' && s.stats.firstScramble > 9 && s.turn > 22) { seed = sd; break; } } }
const trace = []; S.setTrace(trace);
const s = S.play(G, seed);
S.setTrace(null);
P(`\n## One game, turn by turn (seed ${seed}: ${E.ENDINGS[s.ending].tag}, true RSI threshold ${E.monthLabel(E.START_T + s.T)})\n`);
let lastTurn = -1;
trace.forEach(x => {
  if (x.turn !== lastTurn) { P(`\n**${E.dateLabel(x.t)} · ${x.phase === 'p0' ? 'Phase 0' : x.phase === 'scramble' ? 'Scramble' : 'Phase 1'}**`); lastTurn = x.turn; }
  P(`- ${x.kind === 'event' ? 'Event: ' : x.kind === 'sign' ? 'Signing: ' : ''}${x.what}${x.why ? ` — _${x.why}_` : ''}`);
});
const md = out.join('\n');
require('fs').writeFileSync(__dirname + '/playbook.md', md);
console.log(md);
