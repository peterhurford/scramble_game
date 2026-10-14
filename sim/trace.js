// Trace one expert game turn by turn: node sim/trace.js [seed] [bot]
process.argv[2] = process.argv[2] || '1003';
const E = require('../engine.js');
const seed = +process.argv[2]; const bot = process.argv[3] || 'expert';
// reuse playtest bots without running the batch
const Module = require('module'); const fs = require('fs');
const src = fs.readFileSync(__dirname + '/playtest.js', 'utf8').split('const bots = ONLY')[0].replace("require('../engine.js')", "require(__dirname + '/../engine.js')");
const m = new Module(__filename); m.paths = module.paths; m._compile(src + '\nmodule.exports={BOTS,resolveEvents,evChooserExpert};', __filename);
const { BOTS, resolveEvents, evChooserExpert } = m.exports;
const s = E.newGame({ seed, difficulty: 'advisor' });
console.log('T =', s.T.toFixed(1));
resolveEvents(s, evChooserExpert);
let lastLog = 0;
for (let i = 0; i < 80 && !s.ending; i++) {
  BOTS[bot](s); resolveEvents(s, evChooserExpert); if (s.ending) break;
  E.endTurn(s); resolveEvents(s, evChooserExpert);
  const v = E.view(s);
  console.log([v.date.padEnd(12), s.phase.padEnd(8), 'F', v.F.toFixed(1), 'lead', E.lead(s).toFixed(1), 'cred', s.cred|0, 'pc', s.pc, 'alarm', s.alarm|0, 'rObs', v.rObs.toFixed(2), 'brief', v.briefOdds==null?'-':v.briefOdds.toFixed(2), 'sal', s.salience|0, 'mkt', s.markets|0, 'tens', s.tension|0, 'cov', v.coverage, 'sup', v.support, 'ver', v.ready2.avg|0, '/', v.ready2.min|0, 'sen', v.senate, 'coal', s.coalition|0, 'deal', s.cn.deal?'Y':'-', 'post', s.cn.posture, 'f', Object.values(s.cn.f).map(x=>x|0).join('/'), 'risk', (100*v.risk).toFixed(1)].join(' '));
  for (; lastLog < s.log.length; lastLog++) console.log('      ·', s.log[lastLog].text);
}
console.log('ENDING', s.ending, E.score(s));
