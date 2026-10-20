// Balance harness: plays many games with scripted strategies and reports outcomes.
// usage: node sim/playtest.js [games] [difficulty] [bot]
const E = require('../engine.js');

const N = +(process.argv[2] || 400);
const DIFF = process.argv[3] || 'advisor';
const ONLY = process.argv[4] || null;

function avail(s, id, prm) { return E.availability(s, id, prm || {}) === true; }
function tryAct(s, id, prm) { if (!avail(s, id, prm)) return false; const r = E.act(s, id, prm || {}); if (r.error) return false; if (r.modal === 'charter') runCharter(s, true); return true; }
function runCharter(s, smart) {
  E.LABS.forEach(ld => {
    const l = E.L(s, ld.id); if (l.signed) return;
    let deal = false;
    if (smart && E.charterOdds(s, ld.id, false) < 0.55 && s.pc >= ld.deal.pc + 1 && ld.share >= 0.15) deal = true;
    E.charterDecide(s, ld.id, deal);
  });
  E.finishConvening(s);
}
function resolveEvents(s, chooser) { let g = 0; while (s.queue.length && !s.ending && g++ < 20) { const ev = E.currentEvent(s); const i = chooser(s, ev); E.chooseEvent(s, i); } }

const PREF = { distill_report: 0, smuggle_bust: 2, trade_summit: 1, czar_podcast: 1, lantern_oped: 0, kite: 0, oversight: 0, power: 0, titan_feud: 1, leak: 1, johor: 0, cyberattack: 1, bio: 1, capex: 0, ceo_call: 1, near_miss: 0, rare_earths: 1, taiwan: 1, verdant: 0, cn_un: 0, g7: 0, s_leak: 0, s_beijing: 0, s_titan: 0, s_hill: 0, defector: 2, cn_cheat: 0, court: 0, lobby_end: 1, uae: 0, hearing: 0, markets_wobble: 0, commerce_ex: 0, wobble: 0, theft: 1, war: 0, knock: 1, debate: 0, deadline_up: 1, cn_beg: 2, czar_endrun: 0, feud: 0, vp_issue: 0, hawk_push: 1 };

const BOTS = {
  random(s) {
    let guard = 0;
    while (s.ap > 0 && guard++ < 30) {
      const acts = E.listActions(s).filter(a => a.avail === true);
      if (!acts.length || Math.random() < 0.08) break;
      const a = acts[Math.floor(Math.random() * acts.length)];
      const prm = {};
      if (a.params) {
        if (a.params.kind === 'principal') prm.who = E.PRINCIPALS[Math.floor(Math.random() * E.PRINCIPALS.length)].id;
        if (a.params.kind === 'lab') prm.lab = E.LABS[Math.floor(Math.random() * E.LABS.length)].id;
        if (a.params.kind === 'comp') prm.comp = E.COMPONENTS[Math.floor(Math.random() * E.COMPONENTS.length)].id;
        if (a.params.kind === 'variant') { const o = E.ACT[a.id].params.options(s); prm.variant = o[Math.floor(Math.random() * o.length)].id; }
      }
      if (a.modal === 'offer') { const t = {}; E.TERMS.forEach(x => { if (!x.fixed && Math.random() < 0.4) t[x.id] = true; }); E.makeOffer(s, t); continue; }
      tryAct(s, a.id, prm);
      resolveEvents(s, (s, ev) => Math.floor(Math.random() * ev.choices.length));
      if (s.ending) return;
    }
  },
  expert(s) { expertTurn(s, { hawk: false }); },
  hawk(s) { expertTurn(s, { hawk: true }); },
  hawksec(s) { expertTurn(s, { hawk: true, sec: true }); },
  together(s) { expertTurn(s, { seq: 'together' }); },
  adaptive(s) { expertTurn(s, { adaptive: true }); },
  deadline(s) { expertTurn(s, { seq: 'deadline' }); },
  lifter(s) { expertTurn(s, { lift: true }); },
  hawkpure(s) { expertTurn(s, { hawk: true, pure: true }); },
  passive(s) { /* does nothing but answer events */ },
  early(s) { expertTurn(s, { early: true }); },
  noprep(s) { expertTurn(s, { noprep: true }); },
  reader(s) { expertTurn(s, { ic: true }); },
  nosec(s) { expertTurn(s, { nosec: true }); },
  sl4only(s) { expertTurn(s, { sl4only: true }); },
  noauto(s) { expertTurn(s, { noauto: true }); },
  dpa(s) { expertTurn(s, { dpa: true }); },
};
const evChooserExpert = (s, ev) => { const p = PREF[ev.id]; return p != null && p < ev.choices.length ? p : 0; };

function expertTurn(s, o) {
  const v = () => E.view(s);
  let guard = 0;
  const step = () => { resolveEvents(s, evChooserExpert); return !s.ending; };
  if (s.phase === 'p0') {
    const order = ['sl4', 'team', 'memo', 'charter', 'geoint', 'sl5', 'inspect', 'legal', 'control', 'track2', 'zk'];
    if (o.ic) { const v0 = v(); if (v0.ic.mid < 5 && v0.briefOdds > 0.3 && tryAct(s, 'brief')) { step(); return; } if (v0.ic.mid < 7) { s.flags._save = true; } }
    // room policy first
    for (const id of (o.hawk ? (o.pure ? ['distill', 'fund', 'sl4', 'remote', 'smuggle', 'chips', 'accelerate'] : o.sec ? ['sl4', 'remote', 'distill', 'chips', 'smuggle', 'accelerate'] : ['remote', 'distill', 'chips', 'smuggle', 'accelerate']) : ['distill', 'fund', 'remote', 'smuggle', 'sl4'])) { if (s.flags._save && s.pc < 5) break; if (o.nosec && id === 'sl4') continue; if (tryAct(s, id)) { step(); break; } }
    const vv = v();
    const wantBrief = o.early ? vv.rObs > 0.55 && vv.briefOdds > 0.35 : (vv.rObs > 0.68 && vv.briefOdds > 0.5) || (o.ic && vv.ic.mid < 4.5 && vv.briefOdds > 0.25);
    if (o.ic && vv.ic.mid < 7 && vv.briefOdds < 0.5) { if (tryAct(s, 'speech')) step(); }
    if (wantBrief && tryAct(s, 'brief')) { step(); return; }
    while (s.ap > 0 && guard++ < 10 && !s.ending) {
      const next = order.find(p => !s.done[p] && !((o.nosec || o.sl4only) && p === 'sl5'));
      if (s.turn % 4 === 2 && avail(s, 'meet', { who: 'vp' })) { tryAct(s, 'meet', { who: s.turn % 8 === 2 ? 'vp' : 'cos' }); step(); continue; }
      if (next && !o.noprep && tryAct(s, 'proj_' + next)) { step(); continue; }
      if (o.noprep && tryAct(s, 'meet', { who: ['vp','cos','sec','doc'][s.ap % 4] })) { step(); continue; }
      if (tryAct(s, 'allies')) { step(); continue; }
      break;
    }
    return;
  }
  if (s.phase === 'scramble') {
    const seq = [['mech', { variant: o.dpa ? 'dpa' : 'charter' }], ['threshold', { variant: '1e21' }], ['sequence', { variant: o.adaptive ? (E.view(s).ic.mid >= 6 ? 'together' : 'first') : (o.seq || 'first') }], ['automation', {}], ['trigger', { variant: '200c' }], ['convene', {}], ['launch', {}]].filter(x => !(o.noauto && x[0] === 'automation'));
    while (s.ap > 0 && guard++ < 12 && !s.ending && s.phase === 'scramble') {
      let did = false;
      for (const [id, prm] of seq) {
        if (id === 'launch' && !((s.pacing.automation || o.noauto) && s.pacing.trigger) && s.scramble.turn < 6) continue;
        if (tryAct(s, id, prm)) { did = true; step(); break; }
      }
      if (!did) {
        if (o.hawk && tryAct(s, 'remote')) { step(); continue; }
        if (tryAct(s, 'remote')) { step(); continue; }
        if (tryAct(s, 'meet', { who: 'doc' })) { step(); continue; }
        if (tryAct(s, 'allies')) { step(); continue; }
        break;
      }
    }
    return;
  }
  if (s.phase === 'p1') {
    while (s.ap > 0 && guard++ < 14 && !s.ending) {
      const vv = v();
      if (tryAct(s, 'summit')) { step(); continue; }
      if (o.adaptive && s.pacing.armed && !s.pacing.active && vv.ic.mid < 3 && tryAct(s, 'gofirst')) { step(); continue; }
      if (o.hawk && s.cn.cap > E.frontier(s) - 3 && tryAct(s, 'covert')) { step(); continue; }
      if (!s.pacing.automation && !o.noauto && tryAct(s, 'automation')) { step(); continue; }
      if (!s.pacing.trigger && tryAct(s, 'trigger', { variant: '200c' })) { step(); continue; }
      if (s.labs.some(l => !l.covered) && tryAct(s, 'convene')) { step(); continue; }
      if (!s.cn.deal && avail(s, 'offer')) { const t = { inspect: true, lane: true, institute: true }; if (E.lead(s) > 7) t.threat = true; E.makeOffer(s, t); step(); continue; }
      if (s.warp < 2 && tryAct(s, 'fund')) { step(); continue; }
      if (s.overhang > 5 && tryAct(s, 'hardware')) { step(); continue; }
      if (vv.support < 35 && tryAct(s, 'speech')) { step(); continue; }
      if (s.coalition < 55 && tryAct(s, 'allies')) { step(); continue; }
      if (vv.senate < 70 && tryAct(s, 'allies')) { step(); continue; }
      const low = E.COMPONENTS.map(c => c.id).sort((a, b) => s.verify[a] - s.verify[b])[0];
      if (tryAct(s, 'surge', { comp: low })) { step(); continue; }
      if (vv.support < 45 && tryAct(s, 'meet', { who: 'vp' })) { step(); continue; }
      const proj = ['inspect', 'geoint', 'sl4', 'sl5', 'team'].find(p => !s.done[p] && !((o.nosec || o.sl4only) && p === 'sl5'));
      if (proj && tryAct(s, 'proj_' + proj)) { step(); continue; }
      break;
    }
  }
}

function play(bot, seed) {
  const s = E.newGame({ seed, difficulty: DIFF });
  const chooser = bot === 'random' ? ((s, ev) => Math.floor(Math.random() * ev.choices.length)) : bot === 'lifter' ? ((s, ev) => ev.id === 'cn_beg' ? 0 : evChooserExpert(s, ev)) : evChooserExpert;
  resolveEvents(s, chooser);
  let turns = 0;
  while (!s.ending && turns++ < 200) {
    BOTS[bot](s);
    resolveEvents(s, chooser);
    if (s.ending) break;
    const r = E.endTurn(s);
    if (r && r.error) { resolveEvents(s, chooser); }
    resolveEvents(s, chooser);
  }
  return s;
}

const bots = ONLY ? [ONLY] : Object.keys(BOTS);
for (const bot of bots) {
  const out = {}; let sc = 0, thefts = 0, paced = 0, scr = 0, scrRel = 0, nScr = 0, turns = 0, risk = 0, grades = {};
  for (let i = 0; i < N; i++) {
    let s;
    try { s = play(bot, 1000 + i); } catch (e) { console.error(bot, 'seed', 1000 + i, e.stack); process.exit(1); }
    out[s.ending || 'none'] = (out[s.ending || 'none'] || 0) + 1;
    const g = E.score(s); sc += g.score; grades[g.grade] = (grades[g.grade] || 0) + 1;
    thefts += s.stats.thefts; paced += s.stats.monthsPaced; turns += s.turn; risk += s.riskExposure;
    if (s.stats.scrambleStart != null) { nScr++; scr += s.stats.scrambleStart; scrRel += (s.stats.scrambleStart - E.START_T) / s.T; }
  }
  const pct = k => Math.round(100 * (out[k] || 0) / N) + '%';
  console.log(`\n== ${bot} (${DIFF}, n=${N}) ==`);
  console.log('endings:', Object.keys(out).sort().map(k => k + ' ' + pct(k)).join(', '));
  console.log('grades:', Object.keys(grades).sort().map(k => k + ' ' + grades[k]).join(', '));
  console.log(`avg score ${Math.round(sc / N)} | turns ${(turns / N).toFixed(1)} | months paced ${(paced / N).toFixed(1)} | thefts ${(thefts / N).toFixed(2)} | risk exposure ${(100 * risk / N).toFixed(1)}%`);
  console.log(`scramble reached ${Math.round(100 * nScr / N)}% | avg start t ${(scr / Math.max(1, nScr)).toFixed(1)} | start as fraction of T ${(scrRel / Math.max(1, nScr)).toFixed(2)}`);
}
