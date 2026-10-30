// Fits the IC's p(doom) (engine.js DOOM_W): plays bot games, records E.doomFeatures before every end of turn, labels each with whether the game
// ended badly, and fits a logistic regression. Half the games use the v36 genomes, half a v36 genome with a share of its genes randomized, so
// clumsy play (closer to a first-time human) is in the data. Prints the weights to paste into engine.js and a calibration table on held-out games.
// node sim/doom.js [games] [seed]
const path = require('path'), fs = require('fs');
const E = require('../engine.js'), S = require('./strategy.js');
const argv = process.argv.slice(2);
const N = +(argv[0] || 3000), seed0 = +(argv[1] || 500000);
const load = f => { const g = JSON.parse(fs.readFileSync(path.join(__dirname, f), 'utf8')); delete g._rules; return Object.assign(S.expertGenome(), g); };
const BASE = ['v36_run0.json', 'v36dove_run0.json', 'v36hawk2_run2.json', 'v36together_run0.json'].map(load).concat([S.expertGenome()]);
const h = (sd, k) => { let x = (sd * 2654435761 + k * 40503) >>> 0; x ^= x >>> 15; x = Math.imul(x, 2246822519) >>> 0; x ^= x >>> 13; return (x >>> 0) / 4294967296; };
function genome(sd) {
  const G = Object.assign({}, BASE[Math.floor(h(sd, 1) * BASE.length)]);
  if (h(sd, 2) < 0.5) return G;
  const share = 0.1 + 0.5 * h(sd, 3);
  S.GENES.forEach((gn, i) => { if (h(sd, 10 + i) >= share) return; const u = h(sd, 500 + i);
    G[gn.key] = gn.type === 'bool' ? u < 0.5 : gn.type === 'choice' ? gn.a[Math.floor(u * gn.a.length)] : gn.type === 'int' ? gn.a + Math.floor(u * (gn.b - gn.a + 1)) : gn.a + u * (gn.b - gn.a); });
  return G;
}
// record features at every end of turn
let rows = null; const endTurn = E.endTurn;
E.endTurn = s => { if (rows && !s.ending) rows.push(E.doomFeatures(s)); return endTurn(s); };
const X = [], Y = [], game = [];
for (let i = 0; i < N; i++) {
  rows = []; const s = S.play(genome(seed0 + i), seed0 + i); const y = E.ENDINGS[s.ending].tone === 'bad' ? 1 : 0;
  rows.forEach(r => { X.push(r); Y.push(y); game.push(i); }); rows = null;
}
const test = i => game[i] % 5 === 0, K = X[0].length;
const dot = (w, x) => w.reduce((a, v, j) => a + v * x[j], 0), sig = z => 1 / (1 + Math.exp(-z));
let w;
{
  // Newton's method with a small ridge penalty
  w = new Array(K).fill(0); const lam = 1;
  for (let it = 0; it < 25; it++) {
    const g = new Array(K).fill(0), H = Array.from({ length: K }, () => new Array(K).fill(0));
    for (let i = 0; i < X.length; i++) { if (test(i)) continue; const x = X[i], p = sig(dot(w, x)), q = p * (1 - p);
      for (let a = 0; a < K; a++) { g[a] += (p - Y[i]) * x[a]; for (let b = 0; b < K; b++) H[a][b] += q * x[a] * x[b]; } }
    for (let a = 1; a < K; a++) { g[a] += lam * w[a]; H[a][a] += lam; }
    const M = H.map((r, a) => r.concat([g[a]])); // solve H d = g
    for (let c = 0; c < K; c++) { let piv = c; for (let r = c + 1; r < K; r++) if (Math.abs(M[r][c]) > Math.abs(M[piv][c])) piv = r; [M[c], M[piv]] = [M[piv], M[c]];
      for (let r = 0; r < K; r++) if (r !== c) { const f = M[r][c] / M[c][c]; for (let k = c; k <= K; k++) M[r][k] -= f * M[c][k]; } }
    const d = M.map((r, a) => r[K] / r[a]); w = w.map((v, a) => v - d[a]);
    if (Math.max(...d.map(Math.abs)) < 1e-6) break;
  }
  console.log('const DOOM_W = [' + w.map(v => +v.toFixed(3)).join(', ') + '];');
}
// held-out calibration: deciles of predicted p(doom) against the share of those games that ended badly
const idx = X.map((_, i) => i).filter(test), P = idx.map(i => sig(dot(w, X[i])));
{
  const bins = Array.from({ length: 10 }, () => [0, 0, 0]);
  idx.forEach((i, j) => { const b = Math.min(9, Math.floor(P[j] * 10)); bins[b][0]++; bins[b][1] += P[j]; bins[b][2] += Y[i]; });
  console.log(`${N} games, ${X.length} turns (${idx.length} held out); bad endings ${(100 * Y.filter(Boolean).length / Y.length).toFixed(1)}% of turns`);
  console.log('predicted  turns  mean pred  actual');
  bins.forEach((b, k) => b[0] && console.log(`${k * 10}-${k * 10 + 10}%`.padEnd(10), String(b[0]).padStart(6), (100 * b[1] / b[0]).toFixed(1).padStart(9) + '%', (100 * b[2] / b[0]).toFixed(1).padStart(6) + '%'));
  // AUC
  const pos = [], neg = []; idx.forEach((i, j) => (Y[i] ? pos : neg).push(P[j])); neg.sort((a, b) => a - b);
  let auc = 0; for (const p of pos) { let lo = 0, hi = neg.length; while (lo < hi) { const m = (lo + hi) >> 1; if (neg[m] < p) lo = m + 1; else hi = m; } auc += lo; }
  console.log('AUC', (auc / pos.length / neg.length).toFixed(3));
}
