// node room/replay.js <orders.json> [out-prefix]: plays a recorded game's orders through the game master and the ledger, turn by turn,
// and writes <out>.trace.json and <out>.html: what the room saw against the truth, how the game master read each order, the odds and the dice,
// why each number moved, and what each order changed (room/explain.js). orders.json: { seed, title, turns: [{ wh, state, pent }, ...] }.
// The backend is chosen as for gm.js (GM=, GM_MODEL=). Each run asks the model afresh, so two runs differ; the dice for a given seed do not.
'use strict';
const fs = require('fs'), path = require('path'), W = require('./world.js'), G = require('./gm.js'), X = require('./explain.js');
const src = process.argv[2], out = process.argv[3] || (src || '').replace(/\.json$/, '') + '.' + (process.env.GM || 'claude');
if (!src) { console.error('usage: node room/replay.js <orders.json> [out-prefix]'); process.exit(1); }
const game = JSON.parse(fs.readFileSync(src, 'utf8'));
const esc = t => String(t == null ? '' : t).replace(/&/g, '&amp;').replace(/</g, '&lt;'), f1 = x => (Math.round(x * 10) / 10).toFixed(1), sg = x => (x > 0 ? '+' : '') + f1(x);

(async () => {
  const s = W.newGame(game.seed), turns = [];
  for (let i = 0; i < game.turns.length && !s.over; i++) {
    const orders = game.turns[i], date = W.DATES[s.turn], brief = W.brief(s), view = W.view(s), before = JSON.parse(JSON.stringify(s));
    process.stderr.write(date + ': asking the game master... ');
    const a = await G.gm({ state: s, orders });
    process.stderr.write(a.secs + 's\n');
    const ex = X.explain(before, a.ruling, before.standing);
    const events = W.play(s, a.ruling), up = a.updates || {};
    for (const e of events) { const u = e.title === 'From Beijing' ? up.beijing : e.title === 'From the labs' ? up.labs : null; if (u && u.quote) { e.text = '"' + String(u.quote).replace(/"/g, "'") + '"'; e.src = u.by; } }
    s.standing = { train: a.ruling.train, secure: a.ruling.secure, test: a.ruling.test, hunt: a.ruling.hunt };
    s.log.push({ date, orders, replies: a.replies, updates: a.updates || null, events: events.map(e => e.title) });
    turns.push({ date, orders, view, brief, answer: a, explain: ex, events, ops: s.ops, facts: s.facts });
    fs.writeFileSync(out + '.trace.json', JSON.stringify({ game, turns, over: s.over }, null, 1));
  }
  fs.writeFileSync(out + '.html', page(game, turns, s));
  console.log(out + '.html');
})().catch(e => { console.error(e); process.exit(1); });

const COLS = [['lead', 'US lead'], ['us', 'US frontier'], ['cn', 'China'], ['hack', 'Hackers'], ['tension', 'Strait'], ['trust', 'Beijing\'s trust'], ['labs', 'Labs'], ['secWork', 'Security work'], ['danger', 'To danger point']];
function page(game, turns, s) {
  const row = (label, b) => '<tr><th>' + esc(label) + '</th>' + COLS.map(c => '<td>' + f1(b[c[0]]) + '</td>').join('') + '<td class="l">' + esc(b.security) + (b.flags.length ? '; ' + esc(b.flags.join('; ')) : '') + '</td></tr>';
  let h = '<h1>' + esc(game.title || 'Replay') + '</h1><p class="sub">Seed ' + esc(game.seed) + ' · game master: ' + esc(turns[0] ? turns[0].answer.backend : '') + ' · ' + (s.over ? 'Ended: <b>' + esc(s.over.grade + ', ' + s.over.title) + '</b>. ' + esc(s.over.text) : 'Not finished.') + '</p>';
  h += '<h2>The whole game</h2><p class="sub">True values, hidden ones included. Lead and frontiers in months; hackers are seen at 1 and have the weights at 2; the Strait blockades at ' + f1(turns[0].explain.before.redLine) + '.</p><table><tr><th></th>' + COLS.map(c => '<th>' + c[1] + '</th>').join('') + '<th class="l">State</th></tr>' + row('Start', turns[0].explain.before) + turns.map(t => row('After ' + t.date, t.explain.after)).join('') + '</table>';
  turns.forEach((t, n) => {
    const a = t.answer, x = t.explain, r = a.ruling;
    h += '<section><h2>Turn ' + (n + 1) + ' · ' + t.date + '</h2>';
    h += '<div class="two"><div><h3>What the room saw</h3><p>US lead ' + esc(t.view.leadText.toLowerCase()) + '. Strait ' + esc(t.view.strait.toLowerCase()) + '. Weights: ' + esc(t.view.weights) + '; security ' + esc(t.view.security) + '. Labs: ' + esc(t.view.labsText.toLowerCase()) + '.</p></div>' +
      '<div><h3>The truth</h3><p>China ' + f1(x.before.lead) + ' months behind. Danger point ' + f1(x.before.danger) + ' months ahead. Hackers at ' + f1(x.before.hack) + '. Strait ' + f1(x.before.tension) + ' of ' + f1(x.before.redLine) + '. Beijing\'s trust ' + f1(x.before.trust) + '. Labs ' + f1(x.before.labs) + '.</p></div></div>';
    h += '<h3>How the game master read the board</h3><p>' + esc(a.picture) + '</p>';
    h += '<h3>Orders, and what became of them</h3>';
    for (const k of Object.keys(W.TABLES)) {
      const rep = (a.replies || []).filter(q => q.table === k);
      h += '<div class="order"><b>' + W.TABLES[k] + '</b><p class="said">' + esc(t.orders[k] || '(no order)') + '</p>' + rep.map(q => '<p><i>Read as:</i> ' + esc(q.aim) + '</p><p><i>Result:</i> <b>' + esc(q.did) + '</b></p><p class="q">' + esc(q.quote) + ' <span>' + esc(q.by) + '</span></p>').join('') + '</div>';
    }
    h += '<h3>The ruling</h3><p class="mono">' + esc(Object.keys(r).filter(k => !['ops', 'facts', 'chances'].includes(k) && JSON.stringify(r[k]) !== JSON.stringify(W.DEFAULT[k]) && r[k] !== null && !(k.endsWith('Odds') && !r[k.replace('Odds', '')])).map(k => k + ' ' + (typeof r[k] === 'object' ? JSON.stringify(r[k]) : r[k])).join(' · ')) + '</p><p><i>Game master\'s note:</i> ' + esc(a.note) + ' (' + a.secs + 's)</p>';
    if (x.rolls.length) h += '<h3>The dice</h3><table><tr><th class="l">Outcome</th><th>Odds</th><th>Die</th><th class="l">Came up</th><th class="l">Moved</th><th class="l">Had it gone the other way</th></tr>' + x.rolls.map(k => { const o = x.dice.find(z => z.what === k.what);
      return '<tr><td class="l">' + esc(k.what) + '</td><td>' + (k.word || '') + ' (' + k.odds.toFixed(2) + ')</td><td>' + (k.skipped ? '' : k.u.toFixed(2)) + '</td><td class="l">' + (k.skipped ? 'not rolled: operation not ready' : k.hit ? '<b>yes</b>' : '<b>no</b>') + '</td><td class="l">' + esc(k.moved || '') + '</td><td class="l">' + (o ? esc(delta(o)) : '') + '</td></tr>'; }).join('') + '</table>';
    h += '<h3>What each part changed</h3><p class="sub">This turn as it happened, against the same turn without that one part. Parts interact, so rows need not add up.</p><table><tr><th class="l">Part of the ruling</th>' + COLS.map(c => '<th>' + c[1] + '</th>').join('') + '<th class="l">Bulletins</th></tr>' +
      x.effects.map(e => '<tr><td class="l">' + esc(e.label) + '</td>' + COLS.map(c => '<td>' + (e.d[c[0]] == null ? '' : sg(e.d[c[0]])) + '</td>').join('') + '<td class="l">' + esc(e.gained.map(z => '+ ' + z).concat(e.lost.map(z => '- ' + z)).join('; ')) + '</td></tr>').join('') +
      '<tr class="tot"><td class="l">The whole turn</td>' + COLS.map(c => '<td>' + sg(x.after[c[0]] - x.before[c[0]]) + '</td>').join('') + '<td class="l"></td></tr></table>';
    h += '<h3>Why each number moved</h3><ul>' + x.why.map(w => '<li>' + esc(w) + '</li>').join('') + '</ul>';
    h += '<h3>What the room was then told</h3>' + t.events.map(e => '<p class="ev ' + e.tone + '"><b>' + esc(e.title) + '.</b> ' + esc(e.text) + (e.src ? ' <span>' + esc(e.src) + '</span>' : '') + '</p>').join('');
    if (t.ops.length) h += '<h3>Operations under way</h3><ul>' + t.ops.map(o => '<li><b>' + esc(o.name) + '</b> (' + (o.left ? o.left + ' more turn' + (o.left > 1 ? 's' : '') : 'ready') + '): ' + esc(o.report) + '</li>').join('') + '</ul>';
    if (t.facts.length) h += '<h3>Standing facts</h3><ul>' + t.facts.map(z => '<li>' + esc(z) + '</li>').join('') + '</ul>';
    h += '<details><summary>Everything the game master was told</summary><pre>' + esc(t.brief) + '</pre></details></section>';
  });
  return '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>' + esc(game.title || 'Replay') + '</title><style>' +
    ':root{--bg:#fbfaf7;--ink:#1c1b19;--mut:#6b675f;--rule:#d9d5cc;--good:#1f6b3a;--bad:#a3281e;--warn:#8a5a00;--tint:#f1eee6}@media (prefers-color-scheme:dark){:root{--bg:#161614;--ink:#ece9e2;--mut:#a09b90;--rule:#3a3833;--good:#7fcf9a;--bad:#f08a80;--warn:#e0b25a;--tint:#22211e}}' +
    'body{background:var(--bg);color:var(--ink);font:16px/1.45 Georgia,serif;margin:0;padding:24px 16px 80px}main{max-width:1180px;margin:0 auto}h1{font:800 2em/1.1 system-ui,sans-serif;margin:0}h2{font:800 1.4em system-ui,sans-serif;margin:44px 0 6px;padding-top:14px;border-top:3px solid var(--ink)}h3{font:700 .8em system-ui,sans-serif;text-transform:uppercase;letter-spacing:.06em;color:var(--mut);margin:22px 0 6px}' +
    'p{margin:4px 0}.sub{color:var(--mut)}.two{display:grid;grid-template-columns:1fr 1fr;gap:24px}.order{border-left:4px solid var(--rule);padding:2px 0 2px 14px;margin:12px 0}.said{background:var(--tint);padding:8px 10px}.q{font-style:italic}.q span,.ev span{font-style:normal;color:var(--mut);font-size:.88em}' +
    '.mono,pre{font:13px/1.45 ui-monospace,Menlo,monospace}pre{white-space:pre-wrap;color:var(--mut)}.wrap{overflow-x:auto}table{border-collapse:collapse;font:13.5px system-ui,sans-serif;width:100%;margin:6px 0}th,td{padding:5px 8px;border-bottom:1px solid var(--rule);text-align:right;vertical-align:top;font-variant-numeric:tabular-nums}th{color:var(--mut);font-weight:600}.l,tr>th:first-child{text-align:left}.tot td{font-weight:700;border-top:2px solid var(--ink)}' +
    '.ev{padding-left:12px;border-left:4px solid var(--rule)}.ev.good{border-color:var(--good)}.ev.bad{border-color:var(--bad)}.ev.warn{border-color:var(--warn)}li{margin:3px 0}details{margin-top:14px;color:var(--mut)}@media (max-width:760px){.two{grid-template-columns:1fr}}' +
    '</style></head><body><main>' + h.replace(/<table>/g, '<div class="wrap"><table>').replace(/<\/table>/g, '</table></div>') + '</main></body></html>';
}
function delta(o) { return COLS.filter(c => o.d[c[0]] != null).map(c => c[1] + ' ' + sg(o.d[c[0]])).concat(o.gained.map(z => '+ ' + z), o.lost.map(z => '- ' + z)).join('; ') || 'nothing different'; }
