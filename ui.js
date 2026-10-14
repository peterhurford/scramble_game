/* The Scramble: UI. Renders engine state into the page; all game logic lives in engine.js. */
(function () {
'use strict';
const E = window.ScrambleEngine;
const KEY = 'scramble.save.v2';
let S = null;
const ui = { side: null, sel: null, params: {}, result: null, charter: null, offer: null, prev: null };
const $ = s => document.querySelector(s);
const app = $('#app');
const esc = x => String(x).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const pct = x => Math.round(100 * x) + '%';
const f1 = x => (Math.round(x * 10) / 10).toFixed(1);

/* ---------------- icons ---------------- */
const IC = {
  bolt: '<polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>',
  coin: '<circle cx="12" cy="12" r="9"/><path d="M14.5 9.2c-.4-1-1.4-1.6-2.5-1.6-1.4 0-2.5.8-2.5 2s1.1 1.7 2.5 2 2.5.8 2.5 2.1-1.1 2.1-2.5 2.1c-1.2 0-2.2-.6-2.6-1.6M12 6v1.6M12 16.4V18"/>',
  star: '<polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>',
  shield: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>',
  eye: '<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>',
  trend: '<polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/>',
  therm: '<path d="M14 14.76V3.5a2.5 2.5 0 0 0-5 0v11.26a4.5 4.5 0 1 0 5 0z"/>',
  alert: '<path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>',
  tool: '<path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>',
  doc: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/>',
  users: '<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
  globe: '<circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>',
  search: '<circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>',
  cpu: '<rect x="4" y="4" width="16" height="16" rx="2"/><rect x="9" y="9" width="6" height="6"/><line x1="9" y1="1" x2="9" y2="4"/><line x1="15" y1="1" x2="15" y2="4"/><line x1="9" y1="20" x2="9" y2="23"/><line x1="15" y1="20" x2="15" y2="23"/><line x1="20" y1="9" x2="23" y2="9"/><line x1="20" y1="14" x2="23" y2="14"/><line x1="1" y1="9" x2="4" y2="9"/><line x1="1" y1="14" x2="4" y2="14"/>',
  cross: '<circle cx="12" cy="12" r="10"/><line x1="22" y1="12" x2="18" y2="12"/><line x1="6" y1="12" x2="2" y2="12"/><line x1="12" y1="6" x2="12" y2="2"/><line x1="12" y1="22" x2="12" y2="18"/>',
  grid: '<rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/>',
  lock: '<rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
  chart: '<line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/>',
  flag: '<path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" y1="22" x2="4" y2="15"/>',
};
const icon = (n, cls) => `<svg class="ico ${cls || ''}" viewBox="0 0 24 24" aria-hidden="true">${IC[n]}</svg>`;
const CATS = [['all', 'All', 'grid'], ['crisis', 'Decisions', 'alert'], ['prep', 'Prepare', 'tool'], ['policy', 'Policy', 'doc'], ['politics', 'Politics', 'users'], ['diplo', 'Diplomacy', 'globe'], ['intel', 'Intel', 'eye'], ['verify', 'Verify', 'search'], ['labs', 'Labs', 'cpu'], ['covert', 'Covert', 'cross']];
const CAT_ICON = {}; CATS.forEach(c => CAT_ICON[c[0]] = c[2]);
const FACTION_COLOR = { Populist: '#8A5A2B', Politics: '#5B5F97', Dealmaker: '#2E7D5B', Ambition: '#A35A1F', Hawk: '#9B2C2C', Agencies: '#3D5368', Builder: '#7D6A12', Industry: '#A35A1F' };
const SEAT = { vp: 'VP', cos: 'COS', tsy: 'TSY', doc: 'DOC', sec: 'ST', war: 'WAR', dni: 'DNI' };
const EVTYPE = {
  crisis: ['quake', 'debate', 'deadline_up', 'warning', 'knock', 'runaway', 'war', 'theft', 'theft_foiled', 'ceo_call', 'near_miss', 'window', 'collapse', 'wobble', 'intro'],
  beijing: ['cn_breakthrough', 'cn_beg', 'cn_race', 'cn_cheat', 'kite', 'rare_earths', 'taiwan', 's_beijing', 'johor', 'cn_un'],
  labs: ['resign', 'algo_break', 'distill_report', 'lantern_oped', 'oversight', 'titan_feud', 's_titan', 'defector', 'control_fail', 'bio', 'uae', 'lobby_end', 'commerce_ex', 'tinder', 'cyberattack'],
  markets: ['grid', 'flash_crash', 'ipo', 'capex', 'markets_wobble', 'trade_summit', 'verdant', 'power', 'jobs'],
};
const EVMETA = { crisis: ['Crisis', 'alert', 'var(--bad)'], beijing: ['Beijing', 'globe', 'var(--cn)'], labs: ['The labs', 'cpu', 'var(--accent)'], markets: ['The economy', 'trend', 'var(--warn)'], politics: ['The cabinet', 'users', '#5B5F97'] };
function evType(id) { for (const k in EVTYPE) if (EVTYPE[k].indexOf(id) >= 0) return k; return 'politics'; }
const IND = [
  { k: 'uplift', name: 'AI R&D speedup', mark: 10, fmt: v => f1(v) + '×', markLabel: '10×' },
  { k: 'cobench', name: 'Internal R&D eval', mark: 85, fmt: v => Math.round(v) + '%', markLabel: '85%' },
  { k: 'horizon', name: 'Task horizon (80%)', mark: 174, fmt: v => v >= 1000 ? Math.round(v / 100) / 10 + 'k h' : Math.round(v) + ' h', markLabel: '174 h', log: true },
  { k: 'arr', name: 'Top lab revenue', mark: 1000, fmt: v => v >= 1000 ? '$' + f1(v / 1000) + 'T' : '$' + Math.round(v) + 'B', markLabel: '$1T', log: true },
];

/* ---------------- persistence ---------------- */
function save() { try { if (S) localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { /* storage blocked */ } }
function loadSave() { try { const x = localStorage.getItem(KEY); return x ? JSON.parse(x) : null; } catch (e) { return null; } }
function clearSave() { try { localStorage.removeItem(KEY); } catch (e) { /* ignore */ } }

/* ---------------- helpers ---------------- */
function toast(msg) { const t = $('#toast'); t.textContent = msg; t.hidden = false; clearTimeout(toast._t); toast._t = setTimeout(() => { t.hidden = true; }, 2600); }
function meter(v, cls, marks) { return `<div class="meter ${cls || ''}"><i style="width:${Math.max(0, Math.min(100, v))}%"></i>${(marks || []).map(m => `<span class="mk" style="left:${m}%"></span>`).join('')}</div>`; }
function stanceBar(x) { const w = Math.abs(x) * 50; const left = x >= 0 ? 50 : 50 - w; const col = x > 0.25 ? 'var(--good)' : x < -0.25 ? 'var(--bad)' : 'var(--faint)'; return `<div class="stance"><i style="left:${left}%;width:${w}%;background:${col}"></i><span class="mid"></span></div>`; }
function pStance(id) { const d = E.PD(S, id), p = E.P(S, id); const x = d.prefs.pause + p.shift + d.sal * (S.salience - 35) / 40 + p.rel / 120; return Math.tanh(x / 1.6); }
function chipList(list, small) { return `<div class="fx ${small ? 'sm' : ''}">${list.map(c => { const t = c[0] === '+' ? 'g' : c[0] === '-' ? 'b' : 'n'; return `<span class="fxc ${t}">${esc(c.slice(1))}</span>`; }).join('')}</div>`; }
// Event hints in words: the engine writes exact deltas, the player sees direction and rough size.
// Capital costs and durations stay exact; odds become oddsWord.
function wordify(p) {
  const big = (n, u) => { const a = Math.abs(n); return /mo/.test(u || '') ? (a <= 0.5 ? 1 : a <= 1.5 ? 2 : 3) : (a <= 3 ? 1 : a <= 10 ? 2 : 3); };
  const cap = x => x.charAt(0).toUpperCase() + x.slice(1);
  return p
    .replace(/^(\d+)%:\s*/, (m, n) => cap(E.oddsWord(n / 100)) + ': ')
    .replace(/\b(loses|gains|buys|loses about) (\d+(?:\.\d+)?) months?/g, '$1 time')
    .replace(/\b\d+(?:\.\d+)?% (slower|faster)/g, '$1')
    .replace(/([+\-−])(\d+(?:\.\d+)?)(?:\s*(%|°|months?\b|mo\b))?(?: (influence|relationship|compliance|votes?)\b)?/g, (m, sg, n, u, noun) => {
      const up = sg === '+', k = big(+n, u);
      // "+4 influence" reads "more influence"; "Salience +6" reads "Salience up"
      if (noun) return (k === 1 ? 'a bit ' : k === 3 ? 'much ' : '') + ({ relationship: up ? 'warmer' : 'cooler', compliance: up ? 'more compliant' : 'less compliant' }[noun] || (up ? 'more ' : 'less ') + noun);
      return (up ? 'up' : 'down') + (k === 1 ? ' slightly' : k === 3 ? ' sharply' : '');
    });
}
function hintChips(h) {
  if (!h) return '';
  const parts = h.split(/;\s+|\.\s+(?=[A-Z0-9])/).map(x => x.replace(/\.$/, '').trim()).filter(Boolean);
  return chipList(parts.map(p => {
    let t = /\+\d/.test(p) ? '+' : /(-|−)\d/.test(p) ? '-' : '~';
    // for these, going up is bad for you
    if (/temperature|slower|court|runaway|risk \+|China compute|China copying|overhang/i.test(p) && t !== '~') t = t === '+' ? '-' : '+';
    if (/odds|chance|\d+%: /i.test(p)) t = '~';
    return t + wordify(p);
  }), true);
}
function costHtml(c, room) { return `<span class="cost">${c.ap ? `<span title="Actions">${icon('bolt')}${c.ap}</span>` : ''}${c.pc ? `<span title="Political capital">${icon('coin')}${c.pc}</span>` : ''}${room ? `<span title="Needs the President">${icon('star')}</span>` : ''}${!c.ap && !c.pc ? 'free' : ''}</span>`; }
function bannerLevel() { if (!S) return 'U'; if (S.phase === 'scramble') return 'TS'; if (S.phase === 'p1') return 'S'; return 'U'; }
function stats() { return S ? { cred: S.cred, pc: S.pc, sal: S.salience, mk: S.markets, tens: S.tension } : null; }

/* ---------------- what changed ---------------- */
function snap() {
  if (!S) return {};
  const v = E.view(S); const o = {};
  // words: [rising, falling] phrasing for things an advisor senses but cannot measure; those show without numbers.
  const put = (k, label, val, dir, words) => { o[k] = { label, val, dir, words }; };
  put('cred', 'Credibility', S.cred, 1); put('pc', 'Capital', S.pc, 1); put('sal', 'Salience', S.salience, 1); put('mk', 'Markets', S.markets, 1);
  put('tens', 'Beijing temperature', S.tension, -1); put('coal', 'Coalition', S.coalition, 1);
  if (S.phase === 'p0') put('alarm', 'Alarm', S.alarm, 1);
  put('senate', 'Senate votes', v.senate, 1); if (S.pacing.active) put('sup', 'Pacing support', v.support, 1);
  E.COMPONENTS.forEach(c => put('v_' + c.id, 'Verification: ' + c.short, S.verify[c.id], 1));
  put('sl', 'Security level', S.sl, 1); put('intel', 'Intelligence', S.intelQ, 1); put('apMax', 'Actions per turn', S.apMax, 1); put('warp', 'Verification funding', S.warp, 1);
  const gain = n => ['Beijing\u2019s ' + n + ' faction gaining ground', 'Beijing\u2019s ' + n + ' faction losing ground'];
  put('trust', 'Beijing trust', S.cn.trust, 1, ['Beijing trusts Washington more', 'Beijing trusts Washington less']); put('sci', '', S.cn.f.sci, 1, gain('science')); put('secf', '', S.cn.f.sec, -1, gain('security')); put('mktf', '', S.cn.f.m, 0, gain('market'));
  put('drag', 'US labs slowed (%)', 100 * v.drag.total, 0); put('cov', 'Coverage (%)', v.coverage, 1);
  S.principals.forEach(p => { const n = E.PD(S, p.id).name; put('r_' + p.id, n + ' (with you)', p.rel, 1); put('s_' + p.id, '', 100 * pStance(p.id), 1, [n + ' warming to pacing', n + ' cooling on pacing']); put('i_' + p.id, '', p.infl, 0, [n + ' gaining influence', n + ' losing influence']); });
  E.LABS.forEach(l => { const L = E.L(S, l.id); put('lr_' + l.id, l.name + ' (with you)', L.rel, 1); if (E.covered(S, L)) put('lc_' + l.id, '', L.comp, 1, [l.name + ' more compliant', l.name + ' less compliant']); });
  return o;
}
function diffList(a, b) {
  // Headline numbers first, then per-person and per-lab moves, each by size.
  const out = [];
  for (const k in b) { if (!a[k]) continue; const d = b[k].val - a[k].val; if (Math.abs(d) < 0.95) continue; const tone = b[k].dir === 0 ? '~' : ((d > 0) === (b[k].dir > 0) ? '+' : '-'); const w = b[k].words, size = Math.abs(d) <= 3 ? ', slightly' : Math.abs(d) > 10 ? ', sharply' : '';
    out.push({ s: tone + (w ? w[d > 0 ? 0 : 1] + size : b[k].label + ' ' + (d > 0 ? '+' : '\u2212') + Math.round(Math.abs(d))), side: /^(r|s|i|lr|lc)_/.test(k) ? 1 : 0, m: Math.abs(d) }); }
  return out.sort((x, y) => x.side - y.side || y.m - x.m).map(x => x.s);
}
function changedBox(list, title) {
  if (!list.length) return '';
  const more = list.slice(5);
  return `<div class="changed"><div class="lbl">${title || 'What changed'}</div>${chipList(list.slice(0, 5), true)}${more.length ? `<details><summary>${more.length} more</summary>${chipList(more, true)}</details>` : ''}</div>`;
}

/* ---------------- title ---------------- */
function renderTitle() {
  const saved = loadSave();
  $('#banner').dataset.level = 'U'; $('#banner').textContent = 'UNCLASSIFIED // FOR EXERCISE ONLY';
  closeModal();
  const diffs = Object.keys(E.DIFFS).map(k => `<button class="opt ${k === 'advisor' ? 'on' : ''}" data-diff="${k}"><b>${E.DIFFS[k].label}</b><small>${E.DIFFS[k].desc}</small></button>`).join('');
  app.innerHTML = `<div class="title"><div class="tcard">
    <div class="thero"><div class="eb">A game about pacing the frontier · Oct 2026 – Dec 2028</div><h1>The Scramble</h1>
    <div class="tgrid"><p>You are the White House AI Czar. Recursive self-improvement may be a year away. When the moment comes it will look like the Cuban Missile Crisis, not a treaty negotiation. Get in position, win the room, pace the frontier, and bring Beijing in before it’s too late.</p>
    <ol class="steps">
      <li><span><b>Phase 0.</b> Prepare, win allies in the cabinet, read the indicators.</span></li>
      <li><span><b>The scramble.</b> Fourteen days to decide how America paces.</span></li>
      <li><span><b>Phase 1.</b> Hold the pause, catch cheaters, bring Beijing in.</span></li>
      <li><span><b>Phase 2.</b> A verified treaty. That’s the win.</span></li></ol></div></div>
    <div class="tbody">
      <div><div class="lbl">Difficulty</div><div class="diffs">${diffs}</div></div>
      <div class="row"><button class="btn" id="newgame">New game</button>${saved && !saved.ending ? `<button class="ghost" id="cont">Continue · ${esc(E.dateLabel(saved.t))}</button>` : ''}<button class="ghost" id="howto">How to play</button></div>
      <div class="sub">Fictional people and companies; real places and mechanisms. Numbers follow the AIPI pacing concept note and “The Scramble” (The Power Law). Every probability is a game estimate.</div>
    </div></div></div>`;
  let diff = 'advisor';
  app.querySelectorAll('[data-diff]').forEach(b => b.onclick = () => { diff = b.dataset.diff; app.querySelectorAll('[data-diff]').forEach(x => x.classList.toggle('on', x === b)); });
  $('#newgame').onclick = () => { S = E.newGame({ difficulty: diff }); ui.sel = null; ui.result = null; ui.prev = null; save(); renderGame(); afterChange(); };
  if ($('#cont')) $('#cont').onclick = () => { S = saved; renderGame(); afterChange(); };
  $('#howto').onclick = showHelp;
}

/* ---------------- main render ---------------- */
// Race strip across the top, then two columns: the desk (goal and actions) and one tabbed sidebar.
const SIDE = [['room', 'Cabinet'], ['cn', 'Beijing'], ['labs', 'Labs'], ['log', 'Log']];
function renderGame() {
  if (!S) return renderTitle();
  const v = E.view(S);
  $('#banner').dataset.level = bannerLevel();
  $('#banner').textContent = { U: 'UNCLASSIFIED // FOR EXERCISE ONLY', S: 'SECRET // EXERCISE // NOFORN', TS: 'TOP SECRET // EXERCISE // NOFORN' }[bannerLevel()];
  app.innerHTML = `${topBar(v)}<div class="wrap">${raceStrip(v)}<div class="main"><div class="desk">${deskPanel(v)}</div>${sidePanel(v)}</div></div>`;
  bindGame();
  showDeltas();
}
function showDeltas() {
  const now = stats(); const prev = ui.prev; ui.prev = now;
  if (!prev) return;
  const map = { cred: ['#c-cred', 1], pc: ['#c-pc', 1], sal: ['#c-sal', 1], mk: ['#c-mk', 1], tens: ['#c-tens', -1] };
  for (const k in map) {
    const d = Math.round(now[k] - prev[k]); if (!d) continue;
    const el = $(map[k][0]); if (!el) continue;
    const good = d * map[k][1] > 0;
    el.insertAdjacentHTML('beforeend', `<em class="dl ${good ? 'up' : 'dn'}">${d > 0 ? '+' : ''}${d}</em>`);
    el.classList.add(good ? 'flashg' : 'flashb');
  }
}
function phaseLabel() { return { p0: 'Phase 0 · Prepare', scramble: 'The scramble', p1: 'Phase 1 · Hold the pause' }[S.phase] || ''; }
function topBar(v) {
  const dots = '●'.repeat(S.ap) + '○'.repeat(Math.max(0, S.apMax - S.ap));
  const stat = (id, lab, val, tip, cls) => `<button class="stat ${cls || ''}" id="${id}" title="${esc(tip)}"><span>${lab}</span><b>${val}</b></button>`;
  return `<div class="top"><div class="top-in">
    <div class="mark">The Scramble<small>${esc(v.date)} · ${phaseLabel()}</small></div>
    <div class="stats">
      <div class="sgroup">
        ${stat('c-ap', 'Actions', `<span class="dots">${dots}</span>`, 'Staff actions left this turn. Hire a team to get more.')}
        ${stat('c-pc', 'Capital', S.pc + '<small>/12</small>', 'Political capital: spent on policies and favors, earned each turn (more with high credibility).')}
        ${stat('c-oval', 'Oval', v.roomLeft + '<small>/' + v.roomMax + '</small>', 'Decisions the President will take this turn.')}
      </div>
      <div class="sgroup">
        ${stat('c-cred', 'Credibility', Math.round(S.cred), 'The President’s trust in you. Wins raise it; losses and false alarms lower it. At 5 you are fired.', S.cred < 30 ? 'hot' : '')}
        ${stat('c-sal', 'Salience', Math.round(S.salience), 'How seriously Washington takes AI risk. Moves the cabinet toward pacing and sustains it.')}
        ${stat('c-mk', 'Markets', Math.round(S.markets), 'Stock index, 100 at the start. Pacing, chip bans and slowing the labs cost; deals help.', S.markets < 88 ? 'hot' : '')}
        ${stat('c-tens', 'Beijing', Math.round(S.tension) + '°', 'Beijing temperature. High makes deals unlikely; 100 means a military crisis.', S.tension >= 70 ? 'hot' : '')}
      </div>
    </div>
    <div class="row"><button class="ghost sm" id="help">Help</button><button class="ghost sm" id="menu">Menu</button><button class="btn" id="endturn" title="End turn (E)">End turn <span class="kbd">E</span></button></div>
  </div></div>`;
}

/* ---- the race strip: US, China and the RSI zone on one track ---- */
function raceStrip(v) {
  const F = v.F, le = v.leadEst, cn = F - le.mid;
  const ic = v.ic, rate = Math.max(0.05, v.usRate);
  const Tm = F + ic.mid * rate, Tlo = F + ic.lo * rate, Thi = F + ic.hi * rate;
  const x0 = Math.min(cn - le.err - 1.2, F - 8), x1 = Math.max(Math.min(Thi, F + 14) + 1.5, F + 4);
  const W = 1000, H = 92, L = 24, R = 24, Y = 48;
  const X = c => L + (c - x0) / (x1 - x0) * (W - L - R);
  let g = '';
  const dzx = X(Math.max(x0, Math.min(Tlo, x1)));
  g += `<rect x="${dzx}" y="${Y - 16}" width="${Math.max(2, W - R - dzx)}" height="32" rx="4" fill="var(--bad)" opacity=".1"/>`;
  if (Tm <= x1) g += `<line x1="${X(Tm)}" x2="${X(Tm)}" y1="${Y - 16}" y2="${Y + 16}" stroke="var(--bad)" stroke-width="1.5" stroke-dasharray="3 3"/>`;
  g += `<text x="${Math.min(dzx + 8, W - R - 4)}" y="${Y - 24}" text-anchor="${dzx > W - 160 ? 'end' : 'start'}" class="dz">RSI possible (IC estimate)</text>`;
  g += `<line x1="${L}" x2="${W - R}" y1="${Y}" y2="${Y}" stroke="var(--rule)" stroke-width="2"/>`;
  for (let m = Math.ceil(x0 - F); m <= Math.floor(x1 - F); m++) { if (m % 3) continue; const x = X(F + m); g += `<line x1="${x}" x2="${x}" y1="${Y + 3}" y2="${Y + 7}" stroke="var(--faint)"/><text x="${x}" y="${Y + 34}" text-anchor="middle">${m === 0 ? 'now' : (m > 0 ? '+' : '') + m + ' mo'}</text>`; }
  E.LABS.forEach(ld => { g += `<circle cx="${X(E.L(S, ld.id).cap)}" cy="${Y}" r="3" fill="var(--us)" opacity=".5"><title>${esc(ld.name)}</title></circle>`; });
  g += `<rect x="${X(cn - le.err)}" y="${Y - 3}" width="${Math.max(0, X(cn + le.err) - X(cn - le.err))}" height="6" rx="3" fill="var(--cn)" opacity=".2"><title>Uncertainty in China’s position</title></rect>`;
  g += `<path d="M${X(cn)} ${Y - 17} V${Y - 21} H${X(F)} V${Y - 17}" fill="none" stroke="var(--faint)"/><text x="${(X(cn) + X(F)) / 2}" y="${Y - 26}" text-anchor="middle" class="big">US ahead by ${f1(le.mid)} ± ${f1(le.err)} mo</text>`;
  g += `<circle cx="${X(cn)}" cy="${Y}" r="11" fill="var(--cn)"/><text x="${X(cn)}" y="${Y + 3.5}" text-anchor="middle" class="tok">CN</text>`;
  g += `<circle cx="${X(F)}" cy="${Y}" r="11" fill="var(--us)"/><text x="${X(F)}" y="${Y + 3.5}" text-anchor="middle" class="tok">${S.pacing.active ? '⏸' : 'US'}</text>`;
  // Where the lead is headed at today's speeds, six months out.
  const ahead = le.mid + 6 * (v.usRate - v.cnRate);
  const cross = S.pacing.active ? (isFinite(v.crossover) && v.crossover < 36 ? `China catches the paced frontier ≈ <b>${esc(E.monthLabel(S.t + v.crossover))}</b>` : 'China is not closing the gap') : Math.abs(ahead - le.mid) < 0.3 ? `Lead <b>steady</b> at this pace` : ahead <= 0 ? `At this pace China <b>catches up within 6 months</b>` : `In 6 months at this pace: <b>~${f1(ahead)} mo</b> lead`;
  const rsi = v.ic.lo > 24 ? 'RSI: 24+ months away' : `RSI possible in <b>${Math.round(v.ic.lo)}–${v.ic.hi > 24 ? '24+' : Math.round(v.ic.hi)} mo</b>`;
  return `<section class="panel race"><div class="ph"><h2>The race</h2><div class="readouts">
      <span>${rsi}</span><span>${cross}</span>
      ${v.inZone.length ? `<span class="hot" title="Past the near edge of the IC’s RSI window. Nobody knows the true threshold; danger rises the deeper anyone goes.">In the RSI window: <b>${esc(v.inZone.join(', '))}</b></span>` : ''}
    </div></div>
    <div class="sx"><svg class="strip" viewBox="0 0 ${W} ${H}" role="img" aria-label="Race track: US, China and the RSI threshold">${g}</svg></div></section>`;
}

/* ---- sidebar ---- */
function sidePanel(v) {
  const side = ui.side || (S.phase === 'p0' ? 'labs' : 'room'); // RSI signals drive Phase 0; the cabinet matters after
  const body = { room: roomPanel, cn: chinaPanel, labs: labPanel, log: logPanel }[side](v);
  return `<aside class="panel side"><div class="stabs">${SIDE.map(([k, n]) => `<button class="stab ${side === k ? 'on' : ''}" data-side="${k}">${n}</button>`).join('')}</div>${body}</aside>`;
}
function historyChart(v) {
  const W = 320, H = 150, padL = 24, padR = 14, padT = 8, padB = 18;
  const h = S.hist;
  const x1 = Math.min(E.END_T, Math.max(S.t + 2, 8)), x0 = 0;
  const ys = []; h.forEach(p => ys.push(p.F, p.F - p.cnEst));
  const y1 = Math.max.apply(null, ys) + 1, y0 = Math.min.apply(null, ys) - 1;
  const X = t => padL + (t - x0) / (x1 - x0) * (W - padL - padR);
  const Y = y => padT + (1 - (y - y0) / (y1 - y0)) * (H - padT - padB);
  let g = '';
  for (let i = 1; i < h.length; i++) if (h[i].paced) g += `<rect x="${X(h[i - 1].t)}" y="${padT}" width="${Math.max(0.5, X(h[i].t) - X(h[i - 1].t))}" height="${H - padT - padB}" fill="var(--accent)" opacity=".12"/>`;
  const step = (x1 - x0) > 15 ? 6 : 3;
  for (let t = 1; t <= x1; t++) if ((t + 9) % step === 0) { const d = E.dateLabel(t + 0.4).split(' '); g += `<line x1="${X(t)}" x2="${X(t)}" y1="${padT}" y2="${H - padB}" stroke="var(--rule)" stroke-width=".6"/><text x="${Math.min(X(t), W - 14)}" y="${H - 5}" text-anchor="middle">${d[1]} ${d[2].slice(2)}</text>`; }
  g += `<path d="${h.map((p, i) => (i ? 'L' : 'M') + X(p.t).toFixed(1) + ' ' + Y(p.F).toFixed(1)).join(' ')}" fill="none" stroke="var(--us)" stroke-width="2.2"/>`;
  g += `<path d="${h.map((p, i) => (i ? 'L' : 'M') + X(p.t).toFixed(1) + ' ' + Y(p.F - p.cnEst).toFixed(1)).join(' ')}" fill="none" stroke="var(--cn)" stroke-width="2" stroke-dasharray="5 3"/>`;
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="US and China capability over time">${g}</svg>`;
}
const stanceCol = st => st > 0.25 ? 'var(--good)' : st < -0.25 ? 'var(--bad)' : 'var(--faint)';
function roomPanel(v) {
  const ps = S.principals.map(p => ({ p, d: E.PD(S, p.id), st: pStance(p.id) }));
  const tot = ps.reduce((a, x) => a + x.p.infl, 0) || 1;
  const share = f => Math.round(100 * ps.filter(x => f(x.st)).reduce((a, x) => a + x.p.infl, 0) / tot);
  const sF = share(st => st > 0.25), sA = share(st => st < -0.25), sO = Math.max(0, 100 - sF - sA);
  const mood = v.pauseMood;
  return `<div class="sb"><div class="row"><b>${mood > 0.15 ? 'Leans toward pacing' : mood < -0.15 ? 'Leans against pacing' : 'Split on pacing'}</b><span class="sp"></span><span class="sub">by influence</span></div>
    <div class="split"><i style="width:${sF}%;background:var(--good)"></i><i style="width:${sO}%;background:var(--faint)"></i><i style="width:${sA}%;background:var(--bad)"></i></div>
    <div class="legend"><span><i style="background:var(--good)"></i>for ${sF}%</span><span><i style="background:var(--faint)"></i>open ${sO}%</span><span><i style="background:var(--bad)"></i>against ${sA}%</span></div></div>
    ${ps.map(({ p, d, st }) => {
      const ask = E.currentAsk(S, p.id); const fav = E.availability(S, 'favor', { who: p.id });
      return `<div class="pc"><button class="av" data-who="${p.id}" style="background:${stanceCol(st)}" title="${st > 0.25 ? 'For' : st < -0.25 ? 'Against' : 'Open on'} pacing · influence ${Math.round(p.infl)}. Click to meet.">${SEAT[p.id]}</button>
        <div class="pcb"><div class="nm"><button class="who" data-who="${p.id}" title="${esc(d.faction)} · click to meet">${esc(d.name)}</button>${p.alt ? '<span class="pill muted">new</span>' : ''}<span class="tier ${E.relTier(p.rel)}" title="Ally 40+: every three Allies give +1 capital a turn. Hostile -40 or less: costs you 2 credibility a month. Every 10 points tilts their vote toward you.">${E.relTier(p.rel)}</span><span class="sp"></span><span class="rel ${p.rel >= 0 ? 'up' : 'dn'}" title="Relationship with you">${p.rel > 0 ? '+' : ''}${Math.round(p.rel)}</span></div>
        <div class="ask"><span>Wants: ${esc(ask.text)}</span><button class="ghost sm" data-favor="${p.id}" ${fav === true ? '' : 'disabled title="' + esc(fav) + '"'}>Grant ${icon('coin')}${ask.pc}</button></div></div></div>`;
    }).join('')}`;
}
function chinaPanel(v) {
  const c = S.cn, f = c.f;
  const post = { diffuse: ['Diffusing', 'muted', 'Cheap, open, everywhere. Not chasing the frontier.'], race: ['Racing', 'bad', 'State-directed push for the frontier. Theft risk is up.'], engage: ['Open to a deal', 'good', 'The science faction has the floor.'] }[c.posture];
  const segs = [['Domestic', 0.45 * (0.8 + 0.2 * c.sme), '#6B7C93'], ['Offshore', 0.25 * c.remote, '#B8323A'], ['Smuggled', 0.08 * c.smuggle, '#D9822B'], ['Legal', 0.12 * c.legal, '#3B8A7E'], ['Other', 0.10, '#9AA7B4']];
  const deal = c.deal ? `<div class="okbox">${icon('flag')} Interim deal in force since ${esc(E.monthLabel(c.deal.since))}</div>` : '';
  return `<div class="sb"><div class="row"><span class="pill ${post[1]}">${post[0]}</span><span class="sub">${post[2]}</span></div>${deal}</div>
    <div class="sb"><div class="lbl">Who has the floor</div>
      <div class="fac"><div class="m" style="width:${f.m}%">MARKET</div><div class="sec" style="width:${f.sec}%">SECURITY</div><div class="sci" style="width:${f.sci}%">SCIENCE</div></div></div>
    <div class="sb"><div class="lbl">Training compute: ${Math.round(100 * v.cnComp)}% of baseline</div>
      <div class="stack">${segs.map(sg => `<i style="width:${100 * sg[1]}%;background:${sg[2]}" title="${sg[0]} ${Math.round(100 * sg[1])}%"></i>`).join('')}</div>
      <div class="legend">${segs.map(sg => `<span><i style="background:${sg[2]}"></i>${sg[0]}</span>`).join('')}</div>
      <div class="kv" style="margin-top:10px"><span>Copying US models</span><span class="v">${Math.round(100 * c.dist)}%</span><span>Trust in Washington</span><span class="v">${c.trust < 20 ? 'none' : c.trust < 40 ? 'low' : c.trust < 60 ? 'guarded' : c.trust < 80 ? 'real' : 'high'}</span><span>Growth</span><span class="v">${f1(v.cnRate)} mo/mo</span></div></div>
    <div class="sb"><div class="row"><div class="lbl">Frontier so far</div><span class="sp"></span><span class="legend" style="margin:0"><span><i style="background:var(--us)"></i>US</span><span><i style="background:var(--cn)"></i>China</span><span><i style="background:var(--accent);opacity:.3"></i>paced</span></span></div>${historyChart(v)}</div>`;
}
function labPanel(v) {
  const i = S.ind[S.ind.length - 1];
  const sharp = S.flags.assessUntil >= S.turn;
  const frac = d => { const x = i[d.k]; return d.log ? Math.max(0, Math.min(1, 1 + Math.log(x / d.mark) / Math.log(20))) : Math.min(1, x / d.mark); };
  const F = E.frontier(S);
  return `<div class="sb"><div class="row"><div class="lbl">Is RSI close?</div><span class="sp"></span><span class="sub">${sharp ? 'IC assessment: sharp' : 'noisy readings'}</span></div>
      ${IND.map(d => { const f = frac(d); return `<div class="ind" title="Fills toward ${d.markLabel}, one definition of “RSI is possible.”"><div class="n">${d.name}</div><div class="val">${d.fmt(i[d.k])}</div>${meter(100 * f, f > 0.85 ? 'bad' : f > 0.65 ? 'warn' : '')}<div class="mkl">of ${d.markLabel}</div></div>`; }).join('')}</div>
    <div class="sb"><div class="row"><div class="lbl">The labs</div><span class="sp"></span><span class="sub">coverage ${v.coverage}%</span></div>
      ${E.LABS.map(ld => {
        const l = E.L(S, ld.id);
        const status = E.covered(S, l) ? '<span class="pill good">Paced</span>' : l.signed ? '<span class="pill acc">Signed</span>' : l.refused ? '<span class="pill bad">Refused</span>' : S.pacing.active ? '<span class="pill warn">Unbound</span>' : '<span class="pill muted">Racing</span>';
        const behind = F - l.cap;
        return `<div class="lab" title="${Math.round(ld.share * 100)}% of compute · safety ${ld.safety}"><div class="lt"><b>${esc(ld.name)}</b><span class="sub">${behind < 0.05 ? 'at the frontier' : f1(behind) + ' mo back'}${E.covered(S, l) ? ' · compliance ' + (l.comp < 40 ? 'shaky' : l.comp < 70 ? 'mixed' : 'solid') : ''}</span></div><span class="rel ${l.rel >= 0 ? 'up' : 'dn'}">${l.rel > 0 ? '+' : ''}${Math.round(l.rel)}</span>${status}</div>`;
      }).join('')}
      <div class="kv" style="margin-top:8px"><span title="${esc(v.drag.parts.map(x => x[0] + ': ' + Math.round(100 * x[1]) + '%').join('; ') || 'Nothing is slowing US labs')}">Slowed by our own moves</span><span class="v">${Math.round(100 * v.drag.total)}%</span>
        <span title="Beijing tries to steal weights ${Math.round(100 * v.theft.attempt)}% of months; an attempt succeeds ${Math.round(100 * v.theft.success)}% of the time at SL${S.sl}.">Security SL${S.sl} · theft risk</span><span class="v">${(100 * v.theft.net).toFixed(1)}%/mo</span></div></div>
    <div class="sb"><div class="row"><div class="lbl">Verification</div><span class="sp"></span><span class="sub">funding ${S.warp}/2</span></div>
      ${E.COMPONENTS.map(c => `<div class="vrow" title="${esc(c.desc)}"><span>${esc(c.short)}${c.trusted ? '' : '*'}</span>${meter(S.verify[c.id], S.verify[c.id] >= 65 ? 'good' : S.verify[c.id] < 35 ? 'warn' : '', [65])}<span class="v">${Math.round(S.verify[c.id])}</span></div>`).join('')}
      <div class="sub" style="margin-top:6px">Phase 2 needs all three at 65. Cheating labs caught <b>${pct(v.detection)}</b>/month. *Not trusted until Phase 2.</div></div>`;
}
function logPanel() {
  return `<div class="cables">${S.log.slice(-60).reverse().map(l => `<div class="cab ${l.tone}"><span class="d">${esc(E.dateLabel(l.t))}</span><span class="x">${esc(l.text)}</span></div>`).join('')}</div>`;
}

/* ---- desk ---- */
function presidentLine(v) {
  if (S.phase === 'scramble') return 'I need a decision, not another option.';
  if (S.cred < 30) return 'I’m hearing things about you. Not great things.';
  if (S.tension >= 75) return 'Beijing is very angry. Is that good or bad? Tell me it’s good.';
  if (S.markets < 88) return 'The market is down. Everybody is calling me about the market.';
  if (S.cn.deal) return 'Great deal. Maybe the best deal. Now don’t screw it up.';
  if (S.pacing.active && v.support < 35) return 'How long does this pause go on? People are asking. Smart people.';
  if (S.pacing.active) return 'We paused, and we’re still ahead. That’s the story. Keep it the story.';
  if (v.drag.total > 0.15) return 'The labs say we’re slowing them down. Are we slowing them down?';
  if (S.alarm > 60) return 'The CEOs keep calling me. What do they know that I don’t?';
  if (v.leadEst.mid > 6.5) return 'We’re way ahead of China, right? Way ahead.';
  return 'Are we winning? Tell me we’re winning.';
}
function objective(v) {
  let body = '';
  if (S.phase === 'p0') {
    body = `<h3>${S.pacing.collapsed ? 'Rebuild the case' : 'Get in position'}</h3>
      <div class="obrow"><span>Alarm</span>${meter(S.alarm, S.alarm > 70 ? 'bad' : '')}<b class="mono">${Math.round(S.alarm)}<small>/100</small></b></div>
      <div class="sub">At 100 the President calls the emergency meeting. Ask sooner and your read is it’s <b>${E.oddsWord(v.briefOdds)}</b> to work. <button class="whylink" data-why="alarm">What raises alarm?</button></div>`;
  } else if (S.phase === 'scramble') {
    const p = S.pacing;
    const items = [[p.mech, 'Mechanism', p.mech ? E.MECH[p.mech].label : '—'], [p.threshold, 'Threshold', p.threshold ? E.THRESH[p.threshold].label : '—'], [p.automation, 'Automation limits', p.automation ? 'yes' : 'optional'], [p.trigger, 'Monitoring trigger', p.trigger ? E.TRIG[p.trigger].label : 'optional']];
    if (p.mech === 'charter') items.push([S.scramble.convened, 'Signatures', S.scramble.convened ? E.LABS.filter(l => E.L(S, l.id).signed).length + ' of ' + E.LABS.length : '—']);
    items.push([p.seq, 'Go first?', p.seq ? E.SEQ[p.seq].label : '—']);
    items.push([false, 'Launch Phase 1', '']);
    body = `<h3>Day ${1 + 2 * (S.scramble.turn - 1)} of 14</h3><div class="ticks">${items.map(it => `<span class="${it[0] ? 'ok' : ''}">${it[0] ? '✓' : '○'} ${it[1]}${it[2] ? ': <b>' + esc(it[2]) + '</b>' : ''}</span>`).join('')}</div>`;
  } else if (!S.pacing.active) {
    body = S.pacing.armed ? `<h3>Standing by for Beijing</h3><div class="sub">The labs have signed, but the pause starts only when Beijing signs too. Until then the labs keep racing toward the threshold. Make Beijing an offer, or go first after all.</div>` : '<h3>Unpaced</h3><div class="sub">No pacing regime is in force.</div>';
  } else {
    const r = v.ready2;
    const rows = [
      [!!S.cn.deal && (S.t - S.cn.deal.since) >= 3 && S.cn.deal.terms.inspect, 'Deal with inspections, 3 months', S.cn.deal ? (S.cn.deal.terms.inspect ? f1(S.t - S.cn.deal.since) + ' mo' : 'no inspections') : 'none'],
      [r.min >= 65, 'Verification 65 each', E.COMPONENTS.map(c => Math.round(S.verify[c.id])).join(' / ')],
      [S.coalition >= 50, 'Coalition 50', Math.round(S.coalition)],
      [v.senate >= 67, 'Senate 67 <button class="whylink" data-why="senate">why?</button>', v.senate],
      [S.overhang <= 8 || S.policies.hardware, 'Overhang', f1(S.overhang) + ' mo'],
      [S.t - S.pacing.since >= 6, 'Pause held 6 months', f1(S.t - S.pacing.since) + ' mo'],
    ];
    body = `<h3>Hold the pause, build Phase 2</h3>
      <div class="obrow"><span>Pacing support <button class="whylink" data-why="support">why?</button></span>${meter(v.support, v.support < 30 ? 'bad' : v.support < 45 ? 'warn' : 'good', [25])}<b class="mono">${v.support}</b></div>
      <div class="ticks">${rows.map(it => `<span class="${it[0] ? 'ok' : ''}">${it[0] ? '✓' : '○'} ${it[1]}: <b>${esc(String(it[2]))}</b></span>`).join('')}</div>`;
  }
  return `<div class="obj"><div class="goal">${body}</div><div class="pres"><span>The President</span>“${esc(presidentLine(v))}”</div></div>`;
}
function deskPanel(v) {
  const acts = E.listActions(S);
  if (ui.sel && !acts.some(a => a.id === ui.sel)) ui.sel = null;
  const ready = acts.filter(a => a.avail === true), later = acts.filter(a => a.avail !== true);
  if (!ui.sel && acts.length) { const first = ready[0] || acts[0]; ui.sel = first.id; ui.params = defaultParams(first.id); }
  const row = a => {
    const off = a.avail !== true;
    const pr = a.project ? E.PROJECTS.find(p => p.id === a.project) : null;
    const prog = pr ? `<span class="pips">${Array.from({ length: pr.need }, (_, i) => `<i class="${i < (S.projects[a.project] || 0) ? 'on' : ''}"></i>`).join('')}</span>` : '';
    return `<button class="act ${off ? 'off' : ''} ${ui.sel === a.id ? 'on' : ''}" data-act="${a.id}"><span class="at"><span class="t">${esc(a.name)} ${prog}</span>${off ? `<span class="why">${esc(a.avail)}</span>` : chipList(E.chips(S, a.id, defaultParams(a.id)).slice(0, 2), true)}</span>${costHtml(a.cost, a.room)}</button>`;
  };
  const groups = CATS.filter(c => ready.some(a => a.cat === c[0])).map(c => `<div class="agrp">${c[1]}</div>${ready.filter(a => a.cat === c[0]).map(row).join('')}`).join('');
  const rest = later.length ? `<details class="later" ${later.some(a => a.id === ui.sel) ? 'open' : ''}><summary>Not available now (${later.length})</summary>${later.map(row).join('')}</details>` : '';
  return `<section class="panel">${objective(v)}${ui.result ? resultCard() : ''}
    <div class="deskgrid"><div class="alist">${groups || '<div class="pb sub">Nothing you can do right now. End the turn.</div>'}${rest}</div><div class="detail">${detailPane()}</div></div></section>`;
}
function resultCard() { const r = ui.result; return `<div class="result ${r.tone}"><button class="x" data-dismiss title="Dismiss">×</button><b>${esc(r.head)}</b> ${r.text}</div>`; }
function defaultParams(id) {
  const a = E.ACT[id]; if (!a.params) return {};
  if (a.params.kind === 'variant') { const o = a.params.options(S); const pref = o.find(x => x.id === '1e21' || x.id === '200c' || x.id === 'charter'); return { variant: (pref || o[0]).id }; }
  return {};
}
function oddsBar(p, roll) { const known = roll != null; return `<div class="dice"><div class="zone" style="width:${known ? 100 * p : 25 * Math.round(4 * p)}%"></div>${known ? `<div class="marker" data-roll="${roll}" style="left:0%"></div>` : ''}<span class="dl2">${known ? pct(p) : E.oddsWord(p)}</span></div>`; }
function detailPane() {
  if (!ui.sel) return '<div class="sub">Pick an action.</div>';
  const a = E.ACT[ui.sel]; const prm = ui.params || {};
  const av = E.availability(S, ui.sel, prm);
  const cost = E.actionCost(S, ui.sel, prm);
  let h = `<div class="dh"><h3>${esc(a.name)}</h3>${costHtml(cost, a.room)}</div>`;
  h += chipList(E.chips(S, ui.sel, prm));
  h += `<p class="desc">${esc(typeof a.desc === 'function' ? a.desc(S) : a.desc)}</p>`;
  if (a.project) { const pr = E.PROJECTS.find(p => p.id === a.project); h += `<div class="obrow"><span>Progress</span>${meter(100 * (S.projects[pr.id] || 0) / pr.need)}<b class="mono">${S.projects[pr.id] || 0}/${pr.need}</b></div>`; }
  if (a.params) h += paramPicker(a, prm);
  const ready = av === true && paramReady(a, prm);
  if (a.room && paramReady(a, prm)) {
    const rp = E.roomPreview(S, ui.sel, prm);
    h += `<div class="lbl">Chance the President says yes</div>${oddsBar(rp.p)}${whip(rp.positions, true)}`;
  }
  h += `<div class="row" style="margin-top:10px"><button class="btn" id="doit" ${ready ? '' : 'disabled'}>${a.room ? 'Put it to the President' : a.modal === 'offer' ? 'Open the offer table' : a.modal === 'charter' ? 'Bring them in' : 'Do it'}</button>${av !== true ? `<span class="sub">${esc(av)}</span>` : (!paramReady(a, prm) ? '<span class="sub">Choose an option above.</span>' : '')}</div>`;
  return h;
}
function paramReady(a, prm) { if (!a.params) return true; const k = a.params.kind; return !!(k === 'variant' ? prm.variant : k === 'principal' ? prm.who : k === 'lab' ? prm.lab : prm.comp); }
function paramPicker(a, prm) {
  const k = a.params.kind;
  if (k === 'variant') return `<div class="opts">${a.params.options(S).map(o => `<button class="opt ${prm.variant === o.id ? 'on' : ''}" data-pv="${o.id}"><b>${esc(o.label)}</b><small>${esc(o.desc)}</small>${chipList(E.chips(S, a.id, { variant: o.id }), true)}</button>`).join('')}</div>`;
  if (k === 'principal') return `<div class="opts grid">${S.principals.map(p => { const d = E.PD(S, p.id); const ask = a.id === 'favor' ? `<small>${esc(E.currentAsk(S, p.id).text)} (${E.currentAsk(S, p.id).pc} capital)</small>` : `<small>with you ${Math.round(p.rel)} · ${pStance(p.id) > 0.25 ? 'for pacing' : pStance(p.id) < -0.25 ? 'against pacing' : 'open'}</small>`; return `<button class="opt ${prm.who === p.id ? 'on' : ''}" data-pw="${p.id}"><b>${esc(d.name)}</b>${ask}</button>`; }).join('')}</div>`;
  if (k === 'lab') return `<div class="opts grid">${E.LABS.filter(l => !a.params.filter || a.params.filter(S, E.L(S, l.id))).map(l => `<button class="opt ${prm.lab === l.id ? 'on' : ''}" data-pl="${l.id}"><b>${esc(l.name)}</b><small>with you ${Math.round(E.L(S, l.id).rel)} · safety ${l.safety}</small></button>`).join('')}</div>`;
  if (k === 'comp') return `<div class="opts grid">${E.COMPONENTS.map(c => `<button class="opt ${prm.comp === c.id ? 'on' : ''}" data-pc="${c.id}"><b>${esc(c.short)} · ${Math.round(S.verify[c.id])}</b><small>${esc(c.name)}</small></button>`).join('')}</div>`;
  return '';
}
function whip(pos, compact) {
  return `<div class="whip ${compact ? 'compact' : 'reveal'}">${pos.map((x, i) => `<div class="p" style="--d:${i}"><div class="nm"><span class="seat" style="background:${stanceCol(x.stance)}">${SEAT[x.id]}</span><b>${esc(x.name)}</b></div>${stanceBar(x.stance)}${compact ? '' : `<div class="q">“${esc(x.quote)}”</div>`}</div>`).join('')}</div>`;
}

/* ---------------- bindings ---------------- */
function bindGame() {
  $('#endturn').onclick = endTurnClick;
  app.querySelectorAll('.stat').forEach(c => c.onclick = () => showGlossary(window.ScrambleGlossary.CHIPKEY[c.id]));
  app.querySelectorAll('[data-why]').forEach(b => b.onclick = () => showGlossary(b.dataset.why));
  $('#help').onclick = showHelp;
  $('#menu').onclick = showMenu;
  app.querySelectorAll('[data-side]').forEach(b => b.onclick = () => { ui.side = b.dataset.side; renderGame(); });
  app.querySelectorAll('[data-dismiss]').forEach(b => b.onclick = () => { ui.result = null; renderGame(); });
  app.querySelectorAll('[data-act]').forEach(b => b.onclick = () => { ui.sel = b.dataset.act; ui.params = defaultParams(ui.sel); renderDetail(); app.querySelectorAll('[data-act]').forEach(x => x.classList.toggle('on', x === b)); });
  app.querySelectorAll('[data-favor]').forEach(b => b.onclick = () => { ui.sel = 'favor'; ui.params = { who: b.dataset.favor }; renderGame(); });
  app.querySelectorAll('[data-who]').forEach(g => g.onclick = () => { ui.sel = 'meet'; ui.params = { who: g.dataset.who }; renderGame(); });
  bindDetail();
}
function renderDetail() { const d = app.querySelector('.detail'); if (d) { d.innerHTML = detailPane(); bindDetail(); } }
function bindDetail() {
  const d = app.querySelector('.detail'); if (!d) return;
  d.querySelectorAll('[data-pv]').forEach(b => b.onclick = () => { ui.params.variant = b.dataset.pv; renderDetail(); });
  d.querySelectorAll('[data-pw]').forEach(b => b.onclick = () => { ui.params.who = b.dataset.pw; renderDetail(); });
  d.querySelectorAll('[data-pl]').forEach(b => b.onclick = () => { ui.params.lab = b.dataset.pl; renderDetail(); });
  d.querySelectorAll('[data-pc]').forEach(b => b.onclick = () => { ui.params.comp = b.dataset.pc; renderDetail(); });
  const go = d.querySelector('#doit'); if (go) go.onclick = doAction;
}
function doAction() {
  const id = ui.sel, a = E.ACT[id];
  const before = snap();
  const res = E.act(S, id, Object.assign({}, ui.params));
  if (res.error) { toast(res.error); return; }
  if (res.modal === 'offer') { openOffer(); return; }
  if (res.modal === 'charter') { ui.before = before; save(); openCharter(); return; }
  if (a.room) { ui.result = null; save(); showVote(a, res, diffList(before, snap())); return; }
  ui.result = { tone: 'good', head: a.name + '.', text: esc(res.text) + changedBox(diffList(before, snap())) };
  if (a.params && a.params.kind !== 'variant') ui.params = {};
  save(); renderGame(); afterChange();
}

/* ---------------- modals ---------------- */
function openModal(html, wide) { $('#modal').className = 'modal' + (wide ? ' wide' : ''); $('#modal').innerHTML = html; $('#ov').hidden = false; const f = $('#modal').querySelector('.choice,.btn'); if (f) f.focus({ preventScroll: true }); }
function closeModal() { $('#ov').hidden = true; $('#modal').innerHTML = ''; }
function modalOpen() { return !$('#ov').hidden; }
function rollDice() { setTimeout(() => { $('#modal').querySelectorAll('.marker[data-roll]').forEach(m => { m.style.left = (100 * +m.dataset.roll) + '%'; }); }, 60); }

function showVote(a, res, diffs) {
  const rp = res.room;
  openModal(`<div class="mh"><span>${icon('star')} The Oval Office</span><span>${esc(E.dateLabel(S.t))}</span></div><div class="mb">
    <h2>${esc(a.name)}</h2>
    <div class="lbl">The room</div>${whip(rp.positions)}
    <div class="lbl" style="margin-top:12px">The President decides: needed under ${Math.round(100 * rp.p)}, drew ${Math.round(100 * res.roll)}</div>${oddsBar(rp.p, res.roll)}
    <div class="verdict"><span class="stamp big ${res.pass ? 'good' : 'bad'}">${res.pass ? 'APPROVED' : 'REJECTED'}</span><div class="prose"><p>${esc(res.text)}</p></div></div>
    ${changedBox(diffs || [])}
    <div class="row" style="margin-top:12px"><button class="btn" id="mclose">Continue</button></div></div>`);
  rollDice();
  $('#mclose').onclick = () => { closeModal(); renderGame(); afterChange(); };
}
function afterChange() { if (!S) return; if (S.ending) return showEnding(); if (S.queue.length) return showEvent(); }
function eventHeader(id) { const m = EVMETA[evType(id)]; return `<div class="evband" style="--c:${m[2]}">${icon(m[1])}<span>${m[0]}</span></div>`; }
function showEvent() {
  const ev = E.currentEvent(S); if (!ev) return;
  openModal(`${eventHeader(ev.id)}<div class="mh"><span>${esc(ev.stamp || '')}</span><span>${esc(E.dateLabel(S.t))}</span></div><div class="mb">
    <h2>${esc(ev.title)}</h2><div class="prose">${ev.body}</div>
    <div class="choices">${ev.choices.map((c, i) => `<button class="choice" data-ch="${i}"><span class="k">${i + 1}</span><span class="l">${esc(c.label)}</span>${hintChips(c.hint)}</button>`).join('')}</div></div>`);
  $('#modal').querySelectorAll('[data-ch]').forEach(b => b.onclick = () => pickEvent(+b.dataset.ch));
}
function pickEvent(i) {
  const ev = E.currentEvent(S); if (!ev) return;
  const before = snap();
  const r = E.chooseEvent(S, i); save();
  const diffs = diffList(before, snap());
  if (!r.text && !diffs.length) { closeModal(); renderGame(); afterChange(); return; }
  openModal(`${eventHeader(ev.id)}<div class="mh"><span>${esc(ev.stamp || '')}</span><span>${esc(E.dateLabel(S.t))}</span></div><div class="mb">
    <h2>${esc(ev.title)}</h2><div class="prose"><p>${esc(r.text || '')}</p></div>${changedBox(diffs)}<div class="row" style="margin-top:12px"><button class="btn" id="mclose">Continue</button></div></div>`);
  $('#mclose').onclick = () => { closeModal(); renderGame(); afterChange(); };
}
function endTurnClick() {
  if (!S || S.ending) return;
  if (S.queue.length) { showEvent(); return; }
  if (S.ap > 0 && !endTurnClick.armed) { endTurnClick.armed = true; toast('You have ' + S.ap + ' action' + (S.ap > 1 ? 's' : '') + ' left. Press End turn again to proceed.'); setTimeout(() => { endTurnClick.armed = false; }, 3000); return; }
  endTurnClick.armed = false;
  const before = E.view(S); const b = { cred: S.cred, mk: S.markets, tens: S.tension, pc: S.pc, alarm: S.alarm, sal: S.salience }; ui.turnBefore = snap();
  const rep = E.endTurn(S);
  if (!rep || rep.error) { if (rep && rep.error) toast(rep.error); return; }
  ui.result = null; save();
  renderGame();
  if (S.ending && !S.queue.length) return showEnding();
  showReport(before, b, rep);
}
function showReport(before, b, rep) {
  const v = E.view(S);
  const tile = (label, x0, x1, fmt, goodUp) => { const d = x1 - x0; const cls = Math.abs(d) < 0.05 ? '' : ((d > 0) === goodUp ? 'up' : 'dn'); return `<div class="tile"><span>${label}</span><b>${fmt(x1)}</b><em class="${cls}">${Math.abs(d) < 0.05 ? '—' : (d > 0 ? '+' : '') + fmt(d)}</em></div>`; };
  const r0 = x => String(Math.round(x));
  let tiles = tile('US lead (est.)', before.leadEst.mid, v.leadEst.mid, f1, true);
  tiles += S.phase === 'p0' ? tile('Alarm', b.alarm, S.alarm, r0, true) : S.phase === 'p1' && S.pacing.active ? tile('Pacing support', before.support, v.support, r0, true) : tile('Salience', b.sal, S.salience, r0, true);
  tiles += tile('Credibility', b.cred, S.cred, r0, true) + tile('Capital', b.pc, S.pc, r0, true) + tile('Markets', b.mk, S.markets, r0, true) + tile('Beijing', b.tens, S.tension, x => Math.round(x) + '°', false);
  if (S.phase === 'p1') tiles += tile('Verification (min)', before.ready2.min, v.ready2.min, r0, true) + tile('Senate', before.senate, v.senate, r0, true);
  openModal(`<div class="mh"><span>${icon('doc')} The morning brief</span><span>${esc(rep.date)}</span></div><div class="mb">
    <div class="tiles">${tiles}</div>
    ${changedBox(diffList(ui.turnBefore || {}, snap()).filter(x => !/^.(Credibility|Capital|Markets|Beijing temperature|Alarm|Salience|Pacing support|Senate votes) /.test(x)), 'Everything else that moved')}
    ${rep.logs.length ? `<div class="lbl" style="margin-top:10px">Overnight</div><ul class="heads">${rep.logs.map(l => `<li class="${l.tone}">${esc(l.text)}</li>`).join('')}</ul>` : '<div class="sub">A quiet night.</div>'}
    <div class="row" style="margin-top:14px"><button class="btn" id="mclose">${S.queue.length ? 'Open the inbox (' + S.queue.length + ')' : 'To work'}</button></div></div>`);
  $('#mclose').onclick = () => { closeModal(); afterChange(); };
}

/* ---- charter signing ---- */
function openCharter() {
  ui.charter = ui.charter || {};
  const rows = E.LABS.map(ld => {
    const l = E.L(S, ld.id); const r = ui.charter[ld.id];
    if (l.signed && !r) return `<div class="labrow"><div><b>${esc(ld.name)}</b></div><span class="pill good">Signed</span></div>`;
    if (r) return `<div class="labrow"><div><b>${esc(ld.name)}</b> <span class="sub">needed under ${Math.round(100 * r.p)}, drew ${Math.round(100 * r.roll)}</span></div><span class="stamp ${r.signed ? 'good' : 'bad'}">${r.signed ? 'SIGNED' : 'REFUSED'}</span><div class="res">${esc(r.text)}</div></div>`;
    const p0 = E.charterOdds(S, ld.id, false), p1 = E.charterOdds(S, ld.id, true);
    return `<div class="labrow"><div><b>${esc(ld.name)}</b> <span class="sub">${Math.round(ld.share * 100)}% of compute · safety ${ld.safety} · with you ${Math.round(l.rel)}</span><div class="sub">${esc(ld.blurb)}</div>${oddsBar(p0)}</div>
      <div class="col2"><button class="ghost" data-ask="${ld.id}">Ask · ${E.oddsWord(p0)}</button><button class="ghost" data-deal="${ld.id}" ${S.pc >= ld.deal.pc ? '' : 'disabled'} title="${esc(ld.deal.name)}">Sweeten (${ld.deal.pc} ${icon('coin')}) · ${E.oddsWord(p1)}</button><span class="sub">${esc(ld.deal.name)}</span></div></div>`;
  }).join('');
  const signedShare = E.LABS.reduce((a, ld) => a + (E.L(S, ld.id).signed ? ld.share : 0), 0);
  openModal(`<div class="mh"><span>${icon('cpu')} Roosevelt Room</span><span>${esc(E.dateLabel(S.t))} · capital ${S.pc}</span></div><div class="mb">
    <h2>The signing table</h2><div class="sub" style="margin-bottom:8px">Every signature makes the next one likelier. Start with the labs most likely to sign.</div>
    <div class="obrow"><span>Signed</span>${meter(100 * signedShare, 'good')}<b class="mono">${Math.round(100 * signedShare)}%</b></div>
    <div>${rows}</div>
    <div class="row" style="margin-top:14px"><span class="sp"></span><button class="btn" id="cdone">Done</button></div></div>`, true);
  $('#modal').querySelectorAll('[data-ask]').forEach(b => b.onclick = () => { const r = E.charterDecide(S, b.dataset.ask, false); if (r.error) return toast(r.error); ui.charter[b.dataset.ask] = r; save(); openCharter(); });
  $('#modal').querySelectorAll('[data-deal]').forEach(b => b.onclick = () => { const r = E.charterDecide(S, b.dataset.deal, true); if (r.error) return toast(r.error); ui.charter[b.dataset.deal] = r; save(); openCharter(); });
  $('#cdone').onclick = () => { E.finishConvening(S); ui.charter = null; ui.result = { tone: 'good', head: 'The signing table.', text: changedBox(diffList(ui.before || {}, snap())) }; save(); closeModal(); renderGame(); afterChange(); };
}

/* ---- offer table ---- */
function openOffer() {
  ui.offer = ui.offer || { inspect: true };
  const t = ui.offer;
  const pv = E.offerPreview(S, t);
  const terms = E.TERMS.map(x => `<label class="term ${x.fixed || t[x.id] ? 'on' : ''}"><input type="checkbox" id="term_${x.id}" data-term="${x.id}" ${x.fixed || t[x.id] ? 'checked' : ''} ${x.fixed ? 'disabled' : ''}><b>${esc(x.label)}</b><small>${esc(x.desc)}</small></label>`).join('');
  const f = S.cn.f;
  openModal(`<div class="mh"><span>${icon('globe')} Offer to Beijing</span><span>${esc(E.dateLabel(S.t))} · capital ${S.pc}</span></div><div class="mb">
    <h2>The offer table</h2>
    <div class="fac" style="margin-bottom:6px"><div class="m" style="width:${f.m}%">MARKET</div><div class="sec" style="width:${f.sec}%">SECURITY</div><div class="sci" style="width:${f.sci}%">SCIENCE</div></div>
    <div class="sub" style="margin-bottom:10px">Market wants a lane for its models; Security hates inspections; Science responds to shared evaluations. ${S.pacing.active ? 'America is already pacing.' : 'America is not pacing: Beijing will ask why it should stop first.'}</div>
    <div class="terms">${terms}</div>
    <div class="twoodds"><div><div class="lbl">President approves</div>${oddsBar(pv.room.p)}</div><div><div class="lbl">Beijing accepts (IC read)</div>${oddsBar(pv.cn.mid)}</div></div>
    ${whip(pv.room.positions, true)}
    <div class="row"><button class="btn" id="osend">Send it (${icon('bolt')}1 ${icon('coin')}2)</button><button class="ghost" id="ocancel">Not yet</button></div></div>`, true);
  $('#modal').querySelectorAll('[data-term]').forEach(c => c.onchange = () => { t[c.dataset.term] = c.checked; openOffer(); });
  $('#ocancel').onclick = () => { closeModal(); };
  $('#osend').onclick = () => {
    const before = snap();
    const r = E.makeOffer(S, Object.assign({}, t));
    if (r.error) return toast(r.error);
    save(); const diffs = diffList(before, snap());
    openModal(`<div class="mh"><span>${icon('globe')} Beijing</span><span>${esc(E.dateLabel(S.t))}</span></div><div class="mb">
      <div class="lbl">The President: needed under ${Math.round(100 * r.room.p)}, drew ${Math.round(100 * r.roll)}</div>${oddsBar(r.room.p, r.roll)}
      ${r.pass ? `<div class="lbl" style="margin-top:10px">Beijing: needed under ${Math.round(100 * r.p)}, drew ${Math.round(100 * r.cnRoll)}</div>${oddsBar(r.p, r.cnRoll)}` : ''}
      <div class="verdict"><span class="stamp big ${r.accepted ? 'good' : 'bad'}">${!r.pass ? 'VETOED' : r.accepted ? 'ACCEPTED' : 'REJECTED'}</span><div class="prose"><p>${esc(r.text)}</p></div></div>
      ${changedBox(diffs)}
      <div class="row" style="margin-top:12px"><button class="btn" id="mclose">Continue</button></div></div>`);
    rollDice();
    $('#mclose').onclick = () => { closeModal(); renderGame(); afterChange(); };
  };
}

/* ---- ending: the front page ---- */
const HEADLINES = { phase2: 'U.S., CHINA SIGN AI TREATY', uneasy: 'AI PAUSE HOLDS, BARELY', alone: 'U.S. PAUSES AI ALONE', race: 'AI RACE ROARS ON', overtaken: 'CHINA TAKES AI LEAD', loc: 'SYSTEMS DARK; ORIGIN UNKNOWN', war: 'SHOTS FIRED IN TAIWAN STRAIT', fired: 'AI ADVISER OUSTED' };
function showEnding() {
  const en = E.ENDINGS[S.ending]; const sc = E.score(S);
  closeModal();
  $('#banner').dataset.level = en.tone === 'good' ? 'S' : 'TS';
  const v = E.view(S);
  openModal(`<div class="paper">
    <div class="mast"><span>${esc(E.dateLabel(S.t))}</span><b>The Federal Ledger</b><span>Final edition</span></div>
    <h1 class="hl">${HEADLINES[S.ending] || en.tag}</h1>
    <div class="deck">${esc(en.title)} ${esc(en.text)}</div>
    <div class="pcols">
      <div><div class="scorebox"><span class="stamp big ${en.tone}">${en.tag}</span><div><span class="lbl">Score</span><b>${sc.score}</b></div><div><span class="lbl">Grade</span><b class="gr">${sc.grade}</b></div></div>
        ${historyChart(v)}
        <table class="rep"><tbody>
          <tr><td>US lead at the end</td><td class="n">${f1(E.lead(S))} months</td></tr>
          <tr><td>Months paced</td><td class="n">${S.stats.monthsPaced}</td></tr>
          <tr><td>Catastrophe risk taken</td><td class="n">${(100 * S.riskExposure).toFixed(1)}%</td></tr>
          <tr><td>Deal with Beijing</td><td class="n">${S.cn.deal ? 'yes' : 'no'}</td></tr>
          <tr><td>Weights stolen</td><td class="n">${S.stats.thefts}</td></tr>
          <tr><td>Oval decisions won / lost</td><td class="n">${S.stats.roomWon} / ${S.stats.roomLost}</td></tr>
        </tbody></table></div>
      <div class="analysis"><div class="lbl">Analysis</div><ul>${E.lessons(S).map(l => `<li>${esc(l)}</li>`).join('')}</ul></div>
    </div>
    <div class="row" style="margin-top:16px"><button class="btn" id="again">New game</button><button class="ghost" id="look">Look at the board</button></div></div>`, true);
  $('#again').onclick = () => { clearSave(); S = null; closeModal(); renderTitle(); };
  $('#look').onclick = () => { closeModal(); };
}

/* ---- glossary ---- */
function showGlossary(key) {
  const G = window.ScrambleGlossary.G;
  const body = G.map((g, gi) => `<section id="g${gi}"><h3>${esc(g.group)}</h3>${g.items.map(it => `<div class="gi ${it.key === key ? 'hi' : ''}" id="gl-${it.key}"><h4>${esc(it.name)}</h4><ul>${it.does.map(d => `<li>${esc(d)}</li>`).join('')}</ul>
    <div class="ud"><b>Raised by</b><span>${esc(it.up)}</span><b>Lowered by</b><span>${esc(it.down)}</span></div>${S ? `<div class="now">Right now: ${it.now(S)}</div>` : ''}</div>`).join('')}</section>`).join('');
  openModal(`<div class="mh"><span>${icon('doc')} Glossary</span><span>What every number does</span></div><div class="mb"><h2>What every number does</h2>
    <div class="glnav">${G.map((g, gi) => `<button class="ghost sm" data-gj="${gi}">${esc(g.group)}</button>`).join('')}</div>
    <div class="gl">${body}</div><div class="row" style="margin-top:12px"><button class="btn" id="mclose">Back</button></div></div>`, true);
  $('#modal').querySelectorAll('[data-gj]').forEach(b => b.onclick = () => { const el = $('#g' + b.dataset.gj); if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' }); });
  $('#mclose').onclick = () => { closeModal(); if (S) { renderGame(); afterChange(); } };
  if (key) { const el = $('#gl-' + key); if (el) setTimeout(() => el.scrollIntoView({ block: 'center' }), 30); }
}

/* ---- help & menu ---- */
function showHelp() {
  openModal(`<div class="mh"><span>${icon('doc')} Briefing book</span><span>How to play</span></div><div class="mb help">
    <h2>How to play</h2>
    <p>Each turn you spend ${icon('bolt')} <b>actions</b> and ${icon('coin')} <b>political capital</b>. Moves marked ${icon('star')} need the President, who weighs the cabinet: each principal’s view times their influence, plus your credibility. You get a read on the odds before you commit, and see the dice after. The President wants a trade deal with Xi: hawkish moves are a hard sell until Beijing provokes (a theft, a smuggling bust, a racing posture).</p>
    <h4>The race</h4>
    <p>The track at the top is the game. US and China move right; each tick is a month of US frontier progress. The red band is the IC’s estimate of where recursive self-improvement becomes possible. Danger rises smoothly as anyone doing unconstrained automated research nears it; some escapes are caught in time (warning shots), and the rest are runaways.</p>
    <ul><li>Unpaced labs move about a tick a month. Paced labs crawl, especially with automation limits.</li>
    <li>China’s speed depends on its compute (home, offshore, smuggled, legal) and on copying US models. Your levers cut both, and Beijing gets angrier.</li>
    <li>Some of your moves slow US labs too. Slower US labs reach the danger zone later, but the lead shrinks, markets sag and the labs resent it. Security is the big one: SL4 slows them somewhat and SL5 a lot, in exchange for making stolen weights much rarer. A theft nearly erases the lead.</li></ul>
    <h4>Three phases</h4>
    <ul><li><b>Phase 0</b> (monthly): prepare, win policies, cultivate the cabinet, watch the RSI bars. Ask for the emergency meeting when the evidence and your credibility can carry it.</li>
    <li><b>The scramble</b> (2-day turns, 14 days): choose a mechanism, threshold, automation limits and trigger; get the labs to sign; launch.</li>
    <li><b>Phase 1</b> (monthly): hold pacing support above 25 against fatigue, catch cheaters, make Beijing an offer, build verification, then call the Phase 2 summit.</li></ul>
    <h4>Winning</h4>
    <p>The summit needs the pause held 6 months, a deal with inspections held 3 months, all three verification components at 65, a coalition of 50, 67 Senate votes, and the compute overhang under control.</p>
    <h4>Every number</h4><p>Click any stat at the top, or the Glossary button below, to see what it does, what moves it and where it stands now. After every move, a \u201cWhat changed\u201d box lists everything that moved.</p>
    <h4>Keys</h4><p><span class="kbd">E</span> end turn · <span class="kbd">1</span>–<span class="kbd">4</span> event choices · <span class="kbd">Esc</span> close</p>
    <div class="row" style="margin-top:12px"><button class="btn" id="mclose">Back</button><button class="ghost" id="hgloss">Glossary: what every number does</button></div></div>`, true);
  $('#mclose').onclick = () => { closeModal(); if (S) afterChange(); };
  $('#hgloss').onclick = () => showGlossary();
}
function showMenu() {
  openModal(`<div class="mh"><span>Menu</span><span>seed ${S.seed}</span></div><div class="mb"><h2>Menu</h2>
    <div class="sub" style="margin-bottom:12px">The game saves after every move in this browser.</div>
    <div class="row"><button class="btn" id="mclose">Resume</button><button class="ghost" id="mtitle">Title screen</button><button class="ghost" id="mnew">Abandon and start over</button></div></div>`);
  $('#mclose').onclick = closeModal;
  $('#mtitle').onclick = () => { save(); S = null; closeModal(); renderTitle(); };
  let armed = false;
  $('#mnew').onclick = e => { if (!armed) { armed = true; e.target.textContent = 'Click again to abandon'; return; } clearSave(); S = null; closeModal(); renderTitle(); };
}

/* ---------------- keyboard ---------------- */
document.addEventListener('keydown', e => {
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;
  if (modalOpen()) {
    const n = +e.key; if (n >= 1 && n <= 4) { const b = $('#modal').querySelector(`[data-ch="${n - 1}"]`); if (b) { b.click(); e.preventDefault(); } }
    if (e.key === 'Escape') { const ev = S && S.queue.length && $('#modal').querySelector('[data-ch]'); const end = S && S.ending; if (!ev && !end) { closeModal(); if (S) renderGame(); } }
    return;
  }
  if ((e.key === 'e' || e.key === 'E') && S && !S.ending) { e.preventDefault(); endTurnClick(); }
});

/* ---------------- boot ---------------- */
renderTitle();

/* Demo: index.html#demo-p0 / -scramble / -p1 / -end / -vote / -event fast-forwards a seeded game for screenshots. */
if (/^#demo/.test(location.hash)) {
  const want = location.hash.slice(6) || 'p0';
  S = E.newGame({ seed: 4242 });
  const clearQ = () => { let g = 0; while (S.queue.length && g++ < 30) E.chooseEvent(S, S.queue[0].id === 'knock' ? 1 : 0); };
  clearQ();
  const stopAt = want === 'vote' || want === 'event' || want === 'did' || want === 'beg' ? 'p0' : want === 'debate' ? 'p0' : want === 'gloss' ? 'p1' : want;
  for (let i = 0; i < 60 && !S.ending; i++) {
    if (stopAt === S.phase && (stopAt !== 'p0' || S.turn >= 6) && (stopAt !== 'p1' || S.flags.monthsInP1 >= 3) && (stopAt !== 'scramble' || S.scramble.turn >= 2)) break;
    if (S.phase === 'p0') { for (const id of ['proj_team', 'proj_memo', 'sl4', 'distill', 'proj_charter', 'proj_geoint', 'fund', 'proj_inspect', 'proj_sl5']) { if (E.availability(S, id) === true) { E.act(S, id, {}); clearQ(); } } if (S.turn > 8 && E.availability(S, 'brief') === true) { E.act(S, 'brief', {}); clearQ(); } }
    if (S.phase === 'scramble') { [['mech', { variant: 'charter' }], ['threshold', { variant: '1e21' }], ['automation', {}], ['trigger', { variant: '200c' }]].forEach(([id, p]) => { if (E.availability(S, id, p) === true) { E.act(S, id, p); clearQ(); } }); if (E.availability(S, 'convene') === true && want !== 'scramble') { E.act(S, 'convene', {}); E.LABS.forEach(l => E.charterDecide(S, l.id, false)); E.finishConvening(S); } if (E.availability(S, 'launch') === true && want !== 'scramble') { E.act(S, 'launch', {}); } }
    if (S.phase === 'p1') { for (const id of ['fund', 'automation']) if (E.availability(S, id) === true) { E.act(S, id, {}); clearQ(); } if (E.availability(S, 'offer') === true) E.makeOffer(S, { inspect: true, lane: true, institute: true }); if (E.availability(S, 'surge', { comp: 'novel' }) === true) E.act(S, 'surge', { comp: 'novel' }); }
    clearQ(); E.endTurn(S); clearQ();
  }
  renderGame();
  if (want === 'end') { S.ending = S.ending || 'phase2'; showEnding(); }
  if (want === 'vote') { S.roomUsed = 0; S.ap = S.apMax; S.pc = 12; const r = E.act(S, 'speech', {}); if (!r.error) { showVote(E.ACT.speech, r); setTimeout(() => {}, 0); } }
  if (want === 'event') { S.queue.push({ id: 'feud' }); showEvent(); }
  if (want === 'gloss') showGlossary('support');
  if (want === 'debate') { S.queue.push({ id: 'debate' }); showEvent(); }
  if (want === 'beg') { S.policies.remote = true; S.queue.push({ id: 'cn_beg' }); showEvent(); }
  if (want === 'did') { ui.sel = 'meet'; ui.params = { who: 'vp' }; doAction(); }
}

/* Self-test: open index.html#autotest to play random moves through the real UI and report errors. */
if (location.hash === '#autotest') {
  const errs = [];
  window.addEventListener('error', e => errs.push(e.message));
  try {
    for (let g = 0; g < 6; g++) {
      S = E.newGame({ seed: 77 + g }); renderGame(); afterChange();
      for (let step = 0; step < 400 && !S.ending; step++) {
        if (modalOpen()) {
          const b = $('#modal').querySelector('[data-ch]') || $('#modal').querySelector('#mclose') || $('#modal').querySelector('[data-ask]') || $('#modal').querySelector('#cdone') || $('#modal').querySelector('#osend');
          if (b) { b.click(); continue; } closeModal(); continue;
        }
        const acts = app.querySelectorAll('.act:not(.off)');
        if (acts.length && Math.random() < 0.75 && S.ap > 0) {
          acts[Math.floor(Math.random() * acts.length)].click();
          const opt = app.querySelector('.detail .opt'); if (opt) opt.click();
          const go = app.querySelector('#doit'); if (go && !go.disabled) go.click();
        } else { endTurnClick(); endTurnClick(); }
      }
      if (modalOpen()) { const b = $('#modal').querySelector('#look'); if (b) b.click(); }
    }
  } catch (e) { errs.push(e.stack || String(e)); }
  document.body.dataset.test = errs.length ? 'FAIL ' + errs.join(' | ') : 'PASS';
}
})();
