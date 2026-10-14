// A parameterized strategy for The Scramble. A genome is a flat object of genes; GENES says how each mutates.
// play(genome, seed, diff) runs one game and returns the final state. The default genome encodes the scripted expert.
const E = require('../engine.js');

const PROJ = ['team', 'memo', 'charter', 'geoint', 'sl5', 'inspect', 'legal', 'control', 'track2', 'zk'];
const POL0 = ['distill', 'fund', 'remote', 'smuggle', 'sl4', 'chips', 'accelerate', 'speech', 'malaysia', 'assess'];
// China policies a strategy can make conditional on the Beijing readout: skip unless the reading is at least the gate.
const GATE = { distill: ['dist', 1], remote: ['offshore', 0.4], malaysia: ['offshore', 0.4], smuggle: ['smuggled', 0.2], chips: ['legal', 0.15] };
const PEOPLE = E.PRINCIPALS.map(p => p.id);
const EVENTS = ['knock', 'midterms', 'distill_report', 'smuggle_bust', 'trade_summit', 'czar_podcast', 'lantern_oped', 'kite', 'oversight', 'power', 'titan_feud', 'leak', 'johor', 'cyberattack', 'bio', 'capex', 'ceo_call', 'near_miss', 'rare_earths', 'taiwan', 'verdant', 'cn_un', 'g7', 'czar_endrun', 'feud', 'vp_issue', 'hawk_push', 'debate', 'deadline_up', 'cn_beg', 's_leak', 's_beijing', 's_titan', 's_hill', 'defector', 'cn_cheat', 'court', 'lobby_end', 'uae', 'hearing', 'markets_wobble', 'commerce_ex', 'wobble', 'theft', 'war', 'warning', 'resign', 'algo_break', 'bill'];

const GENES = [];
const g = (key, type, a, b) => GENES.push({ key, type, a, b });
PROJ.forEach(p => g('proj.' + p, 'real', -1, 1));
POL0.forEach(p => g('pol.' + p, 'real', -1, 1));
Object.keys(GATE).forEach(p => g('gate.' + p, 'real', 0, GATE[p][1]));
g('meetEvery', 'int', 0, 4); g('meetA', 'choice', PEOPLE); g('meetB', 'choice', PEOPLE);
PEOPLE.forEach(p => g('fav.' + p, 'bool'));
g('favReserve', 'int', 0, 8);
g('briefR', 'real', 0.3, 0.95); g('briefOdds', 'real', 0.1, 0.95); g('briefIc', 'real', 0, 10); g('briefIcOdds', 'real', 0.05, 0.9);
g('saveIc', 'real', 0, 10); g('saveReserve', 'int', 0, 6); g('speechIc', 'real', 0, 10); g('alliesIdle', 'bool');
g('mech', 'choice', ['charter', 'dpa', 'license']); g('thr', 'choice', ['1e20', '1e21', '1e22']); g('auto', 'bool');
g('trig', 'choice', ['200c', '200', '425', 'none']); g('seq', 'choice', ['first', 'deadline', 'together', 'adaptive']); g('seqIc', 'real', 2, 10);
g('dealBelow', 'real', 0, 1); g('dealMinShare', 'real', 0, 0.3); g('waitFull', 'bool'); g('scrIdle', 'choice', ['remote', 'meet', 'allies', 'none']); g('scrOffer', 'bool');
['inspect', 'lane', 'institute', 'relief', 'visas', 'freeze', 'chips'].forEach(t => g('o.' + t, 'bool'));
g('threatLead', 'real', 4, 15); g('fundFirst', 'bool'); g('hwOver', 'real', 2, 10); g('speechSup', 'real', 15, 60); g('alliesCoal', 'real', 30, 80); g('senateT', 'real', 55, 90);
g('surge', 'choice', ['lowest', 'novel', 'inspect']); g('meetSup', 'real', 0, 70); g('covertWithin', 'real', 0, 5); g('gofirstIc', 'real', 0, 8); g('p1proj', 'bool');
EVENTS.forEach(e => g('ev.' + e, 'int', 0, 3));

const PREF = { distill_report: 0, smuggle_bust: 2, trade_summit: 1, czar_podcast: 1, lantern_oped: 0, kite: 0, oversight: 0, power: 0, titan_feud: 1, leak: 1, johor: 0, cyberattack: 1, bio: 1, capex: 0, ceo_call: 1, near_miss: 0, rare_earths: 1, taiwan: 1, verdant: 0, cn_un: 0, g7: 0, s_leak: 0, s_beijing: 0, s_titan: 0, s_hill: 0, defector: 2, cn_cheat: 0, court: 0, lobby_end: 1, uae: 0, hearing: 0, markets_wobble: 0, commerce_ex: 0, wobble: 0, theft: 1, war: 0, knock: 1, debate: 0, deadline_up: 1, cn_beg: 2, czar_endrun: 0, feud: 0, vp_issue: 0, hawk_push: 1, midterms: 0 };
function expertGenome() {
  const G = {};
  PROJ.forEach((p, i) => G['proj.' + p] = 1 - i * 0.1);
  POL0.forEach(p => G['pol.' + p] = -0.5);
  Object.keys(GATE).forEach(p => G['gate.' + p] = 0);
  ['distill', 'fund', 'remote', 'smuggle', 'sl4'].forEach((p, i) => G['pol.' + p] = 1 - i * 0.1);
  Object.assign(G, { meetEvery: 4, meetA: 'vp', meetB: 'cos', favReserve: 8, briefR: 0.68, briefOdds: 0.5, briefIc: 0, briefIcOdds: 0.9, saveIc: 0, saveReserve: 0, speechIc: 0, alliesIdle: true,
    mech: 'charter', thr: '1e21', auto: true, trig: '200c', seq: 'first', seqIc: 6, dealBelow: 0.55, dealMinShare: 0.15, waitFull: true, scrIdle: 'remote', scrOffer: false,
    threatLead: 7, fundFirst: true, hwOver: 5, speechSup: 35, alliesCoal: 55, senateT: 70, surge: 'lowest', meetSup: 45, covertWithin: 0, gofirstIc: 0, p1proj: true });
  PEOPLE.forEach(p => G['fav.' + p] = false);
  ['inspect', 'lane', 'institute'].forEach(t => G['o.' + t] = true); ['relief', 'visas', 'freeze', 'chips'].forEach(t => G['o.' + t] = false);
  EVENTS.forEach(e => G['ev.' + e] = PREF[e] || 0);
  return G;
}

let TRACE = null;
function setTrace(t) { TRACE = t; }
function note(s, kind, what, why) { if (TRACE) TRACE.push({ t: s.t, phase: s.phase, turn: s.turn, kind, what, why }); }
function avail(s, id, prm) { return E.availability(s, id, prm || {}) === true; }
function tryAct(s, id, prm, G, why) {
  if (!avail(s, id, prm)) return false;
  const r = E.act(s, id, prm || {}); if (r.error) return false;
  const a = E.ACT[id]; const lab = a.name + (prm && prm.variant ? ': ' + prm.variant : '') + (prm && prm.who ? ': ' + E.PD(s, prm.who).name : '') + (prm && prm.comp ? ': ' + prm.comp : '');
  note(s, 'act', lab + (a.room ? (r.pass ? ' [APPROVED]' : ' [REJECTED]') : ''), why || '');
  if (r.modal === 'charter') charter(s, G); return true;
}
function charter(s, G) {
  E.LABS.forEach(ld => {
    if (E.L(s, ld.id).signed) return;
    const deal = E.charterOdds(s, ld.id, false) < G.dealBelow && s.pc >= ld.deal.pc + 1 && ld.share >= G.dealMinShare;
    const r = E.charterDecide(s, ld.id, deal); note(s, 'sign', ld.name + (deal ? ' (sweetened: ' + ld.deal.name + ')' : '') + (r.signed ? ' SIGNS' : ' REFUSES'), deal ? 'odds below ' + Math.round(100 * G.dealBelow) + '% and a big lab' : 'ask without a side deal');
  });
  E.finishConvening(s);
}
// What the bot knows about China: the readout (default), the hidden truth, or only the note's baseline.
const SIGHT = process.env.SIGHT || 'readout';
function seen(s) {
  if (SIGHT === 'readout') return E.view(s).cnRead.seen;
  const e = E.view(s).cnEst; const t = SIGHT === 'truth' ? e : null;
  const c = s.cn, src = t ? { domestic: 0.45 * (0.8 + 0.2 * c.sme), offshore: 0.25 * c.remote, smuggled: 0.08 * c.smuggle, legal: 0.12 * c.legal } : { offshore: 0.25 * Math.min(1, c.remoteT), smuggled: 0.08 * Math.min(1, c.smuggleT), legal: 0.12 * c.legalT };
  return Object.assign(src, { dist: t ? c.dist : Math.min(1, c.distT) });
}
const gated = (s, G, p) => { const gt = G['gate.' + p]; if (!gt) return false; const x = seen(s)[GATE[p][0]]; return x < gt ? x : false; };
function chooser(G) { return (s, ev) => { const k = G['ev.' + ev.id]; return k == null ? 0 : k % ev.choices.length; }; }
function resolve(s, G) { let n = 0; const ch = chooser(G); while (s.queue.length && !s.ending && n++ < 25) { const ev = E.currentEvent(s); const i = ch(s, ev); note(s, 'event', ev.title + ' \u2192 ' + ev.choices[i].label, 'event gene ev.' + ev.id + '=' + G['ev.' + ev.id]); E.chooseEvent(s, i); } }

function turn(s, G) {
  const step = () => { resolve(s, G); return !s.ending; };
  let guard = 0;
  if (s.phase === 'p0') {
    const v0 = E.view(s);
    const saving = v0.ic.mid < G.saveIc;
    if (v0.ic.mid < G.speechIc && v0.briefOdds < 0.5 && tryAct(s, 'speech', {}, G, 'IC says RSI within ' + G.speechIc.toFixed(1) + ' months and the meeting is not yet winnable')) step();
    const pols = POL0.filter(p => G['pol.' + p] >= 0).sort((a, b) => G['pol.' + b] - G['pol.' + a]);
    for (const id of pols) { if (saving && s.pc - E.actionCost(s, id, {}).pc < G.saveReserve) break; if (GATE[id] && gated(s, G, id) !== false) continue; if (tryAct(s, id, {}, G, 'highest-priority Phase 0 policy still open (order: ' + pols.join(' > ') + ')')) { step(); break; } }
    if (s.phase !== 'p0') return;
    const v1 = E.view(s);
    const wantBrief = (v1.rObs > G.briefR && v1.briefOdds > G.briefOdds) || (v1.ic.mid < G.briefIc && v1.briefOdds > G.briefIcOdds);
    if (wantBrief && tryAct(s, 'brief', {}, G, 'indicators ' + Math.round(100 * v1.rObs) + '% of the way and odds ' + Math.round(100 * v1.briefOdds) + '% (asks only above ' + Math.round(100 * G.briefOdds) + '%)')) { step(); return; }
    for (const p of PEOPLE) { if (G['fav.' + p] && s.pc - E.currentAsk(s, p).pc >= G.favReserve && tryAct(s, 'favor', { who: p }, G, 'grants this principal\u2019s asks whenever capital stays at ' + G.favReserve + '+')) step(); }
    const projs = PROJ.filter(p => G['proj.' + p] >= 0).sort((a, b) => G['proj.' + b] - G['proj.' + a]);
    while (s.ap > 0 && guard++ < 10 && !s.ending && s.phase === 'p0') {
      if (G.meetEvery && s.turn % G.meetEvery === 2 % G.meetEvery && tryAct(s, 'meet', { who: s.turn % (2 * G.meetEvery) < G.meetEvery ? G.meetA : G.meetB }, G, 'meets every ' + G.meetEvery + ' turns, alternating')) { step(); continue; }
      const next = projs.find(p => !s.done[p] && avail(s, 'proj_' + p));
      if (next && tryAct(s, 'proj_' + next, {}, G, 'next project in priority order')) { step(); continue; }
      if (G.alliesIdle && tryAct(s, 'allies', {}, G, 'spare action: build the coalition')) { step(); continue; }
      break;
    }
    return;
  }
  if (s.phase === 'scramble') {
    const seqV = G.seq === 'adaptive' ? (E.view(s).ic.mid >= G.seqIc ? 'together' : 'first') : G.seq;
    const plan = [['mech', { variant: G.mech }], ['threshold', { variant: G.thr }], ['sequence', { variant: seqV }]];
    if (G.auto) plan.push(['automation', {}]);
    if (G.trig !== 'none') plan.push(['trigger', { variant: G.trig }]);
    plan.push(['convene', {}], ['launch', {}]);
    while (s.ap > 0 && guard++ < 12 && !s.ending && s.phase === 'scramble') {
      let did = false;
      for (const [id, prm] of plan) {
        if (id === 'launch' && G.waitFull && !((s.pacing.automation || !G.auto) && (s.pacing.trigger || G.trig === 'none')) && s.scramble.turn < 6) continue;
        if (tryAct(s, id, prm, G, 'scramble plan, in order')) { did = true; step(); break; }
      }
      if (did) continue;
      if (G.scrOffer && !s.cn.deal && avail(s, 'offer')) { const r = E.makeOffer(s, offerTerms(s, G)); note(s, 'act', 'Offer to Beijing ' + JSON.stringify(Object.keys(offerTerms(s, G))) + (r.accepted ? ' ACCEPTED' : ' rejected'), 'offers early during the scramble'); step(); continue; }
      if (G.scrIdle === 'remote' && tryAct(s, 'remote', {}, G, 'spare scramble action')) { step(); continue; }
      if ((G.scrIdle === 'meet' || G.scrIdle === 'remote') && tryAct(s, 'meet', { who: 'doc' }, G, 'spare scramble action: work on the Commerce Secretary')) { step(); continue; }
      if ((G.scrIdle === 'allies' || G.scrIdle === 'remote') && tryAct(s, 'allies', {}, G, 'spare scramble action')) { step(); continue; }
      break;
    }
    return;
  }
  if (s.phase === 'p1') {
    while (s.ap > 0 && guard++ < 14 && !s.ending) {
      const v = E.view(s);
      if (tryAct(s, 'summit', {}, G, 'every Phase 2 requirement is met')) { step(); continue; }
      if (s.pacing.armed && !s.pacing.active && v.ic.mid < G.gofirstIc && tryAct(s, 'gofirst', {}, G, 'on standby and IC says RSI within ' + G.gofirstIc.toFixed(1) + ' months')) { step(); continue; }
      if (G.covertWithin > 0.5 && v.leadEst.mid < G.covertWithin && tryAct(s, 'covert', {}, G, 'China within ' + G.covertWithin.toFixed(1) + ' months')) { step(); continue; }
      if (G.auto && !s.pacing.automation && tryAct(s, 'automation', {}, G, 'automation limits still missing')) { step(); continue; }
      if (G.trig !== 'none' && !s.pacing.trigger && tryAct(s, 'trigger', { variant: G.trig }, G, 'monitoring trigger still missing')) { step(); continue; }
      if (s.labs.some(l => !l.covered) && tryAct(s, 'convene', {}, G, 'a lab is still outside the regime')) { step(); continue; }
      if (!s.cn.deal && avail(s, 'offer')) { const t = offerTerms(s, G); const r = E.makeOffer(s, t); note(s, 'act', 'Offer to Beijing: ' + Object.keys(t).join(', ') + (!r.pass ? ' [VETOED by the President]' : r.accepted ? ' [ACCEPTED]' : ' [REJECTED by Beijing]'), 'no deal yet; offers every time Beijing will take a call'); step(); continue; }
      if (G.fundFirst && s.warp < 2 && tryAct(s, 'fund', {}, G, 'verification not fully funded')) { step(); continue; }
      if (s.overhang > G.hwOver && tryAct(s, 'hardware', {}, G, 'overhang above ' + G.hwOver.toFixed(1) + ' months')) { step(); continue; }
      if (v.support < G.speechSup && tryAct(s, 'speech', {}, G, 'pacing support below ' + Math.round(G.speechSup))) { step(); continue; }
      if ((s.coalition < G.alliesCoal || v.senate < G.senateT) && tryAct(s, 'allies', {}, G, 'coalition below ' + Math.round(G.alliesCoal) + ' or Senate below ' + Math.round(G.senateT))) { step(); continue; }
      if (!G.fundFirst && s.warp < 2 && tryAct(s, 'fund', {}, G, 'verification not fully funded')) { step(); continue; }
      const comps = E.COMPONENTS.map(c => c.id).sort((a, b) => s.verify[a] - s.verify[b]);
      const comp = G.surge === 'lowest' ? comps[0] : G.surge === 'novel' ? (s.verify.novel < 65 ? 'novel' : comps[0]) : (s.verify.inspect < 65 ? 'inspect' : comps[0]);
      if (tryAct(s, 'surge', { comp }, G, 'surge rule: ' + G.surge)) { step(); continue; }
      if (v.support < G.meetSup && tryAct(s, 'meet', { who: 'vp' }, G, 'pacing support below ' + Math.round(G.meetSup))) { step(); continue; }
      const proj = G.p1proj && ['inspect', 'geoint', 'sl5', 'team'].find(p => !s.done[p] && avail(s, 'proj_' + p));
      if (proj && tryAct(s, 'proj_' + proj, {}, G, 'nothing more urgent: finish projects')) { step(); continue; }
      break;
    }
  }
}
function offerTerms(s, G) {
  const t = {};
  ['inspect', 'lane', 'institute', 'relief', 'visas', 'freeze', 'chips'].forEach(k => { if (G['o.' + k]) t[k] = true; });
  if (E.view(s).leadEst.mid > G.threatLead) t.threat = true; // the IC estimate, not the hidden truth
  return t;
}
function play(G, seed, diff) {
  const s = E.newGame({ seed, difficulty: diff || 'advisor' });
  resolve(s, G);
  let n = 0;
  while (!s.ending && n++ < 200) { turn(s, G); resolve(s, G); if (s.ending) break; E.endTurn(s); resolve(s, G); }
  return s;
}
function evaluate(G, seeds, diff) {
  let wins = 0, score = 0, loc = 0;
  for (const sd of seeds) { const s = play(G, sd, diff); if (s.ending === 'phase2') wins++; if (s.ending === 'loc') loc++; score += E.score(s).score; }
  return { win: wins / seeds.length, score: score / seeds.length, loc: loc / seeds.length };
}
module.exports = { GENES, expertGenome, play, evaluate, setTrace, PROJ, POL0, EVENTS, GATE };
