// How much does each China lever move the race? Pacing starts Jul 2027 with automation limits;
// theft and runaway are switched off so only the levers differ. Reports lead at pacing and months until China catches up.
const E = require('../engine.js');
Object.keys(E.DIFFS).forEach(k => E.DIFFS[k].theft = 0); // isolate the levers from weight theft
const LEVERS = {
  none: {},
  'distillation crackdown (Jan 27)': { distT: 0.68, at: 3, pol: ['distill'] },
  'distillation crackdown (at pacing)': { distT: 0.68, at: 9, pol: ['distill'] },
  'remote-access rule (Jan 27)': { remoteT: 0.15, at: 3, pol: ['remote'] },
  'remote-access rule (at pacing)': { remoteT: 0.15, at: 9, pol: ['remote'] },
  'smuggling crackdown (Jan 27)': { smuggleT: 0.5, at: 3 },
  'end chip sales + tool servicing (Jan 27)': { legalT: 0, smeT: 0.2, at: 3, pol: ['chips'] },
  'SL5 security (Jan 27), no China levers': { at: 3, pol: [], W: 1 },
  'everything (Jan 27)': { distT: 0.68, remoteT: 0.15, smuggleT: 0.5, legalT: 0, smeT: 0.2, at: 3, pol: ['distill', 'remote', 'chips'] },
};
function run(lv, seed, extra) {
  const s = E.newGame({ seed }); s.queue = []; s.T = 999; s.W = 25;
  const rng = () => 0;
  for (let i = 0; i < 40; i++) {
    if (s.t >= 0.4 + lv.at - 1e-9 && !s._applied) { for (const k in lv) if (k !== 'at' && k !== 'pol') s.cn[k] = k === 'distT' ? lv[k] * s.cn.base.dist : lv[k]; (lv.pol || []).forEach(x => s.policies[x] = true); if (lv.W) { s.sl = 5; s.W = 92; } s._applied = true; }
    if (Math.abs(s.t - 9.4) < 1e-6) { // pacing begins
      s.pacing.active = true; s.pacing.threshold = '1e21'; s.pacing.automation = true; s.phase = 'p1';
      s.labs.forEach(l => { l.covered = l.signed = true; l.comp = 100; });
      s._leadAtPace = E.lead(s);
      if (extra === 'deal') s.cn.deal = { terms: {}, since: s.t };
    }
    if (s._leadAtPace != null && s.cn.cap >= E.frontier(s)) return { lead: s._leadAtPace, months: s.t - 9.4 };
    s.queue = []; E.endTurn(s); s.queue = []; s.cn.posture = 'diffuse'; s.cn.race = 0; s.cn.cheat = false;
    s.labs.forEach(l => l.defect = false);
  }
  return { lead: s._leadAtPace, months: 31 };
}
for (const [name, lv] of Object.entries(LEVERS)) {
  let L = 0, M = 0; const n = 60;
  for (let i = 0; i < n; i++) { const r = run(Object.assign({ at: 99 }, lv), 500 + i); L += r.lead; M += r.months; }
  console.log(name.padEnd(42), 'lead at pacing', (L / n).toFixed(1), '| China catches the paced frontier after', (M / n).toFixed(1), 'months');
}
