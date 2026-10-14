// How often are principals Hostile, and how much credibility does it drain? (expert bot)
const fs=require('fs'),Module=require('module');
const src=fs.readFileSync(__dirname+'/playtest.js','utf8').split('const bots = ONLY')[0].replace("require('../engine.js')","require(__dirname + '/../engine.js')");
const m=new Module(__filename);m.paths=module.paths;m._compile(src+'\nmodule.exports={BOTS,resolveEvents,evChooserExpert};',__filename);
const {BOTS,resolveEvents,evChooserExpert}=m.exports; const E=require('../engine.js');
const months={}, drain=[]; let games=0;
for(let i=0;i<200;i++){const s=E.newGame({seed:3000+i});resolveEvents(s,evChooserExpert);let d=0;games++;
 for(let k=0;k<80&&!s.ending;k++){BOTS.expert(s);resolveEvents(s,evChooserExpert);if(s.ending)break;const mo=s.phase!=='scramble';E.endTurn(s);resolveEvents(s,evChooserExpert);
  if(mo) d+=E.hostileDrain(s); if(mo) s.principals.forEach(p=>{if(p.rel<=-40){months[p.id]=(months[p.id]||0)+1;}});}
 drain.push(d);}
const turns=drain.length;console.log('share of months each principal is Hostile (expert, 200 games):');
for(const k in months)console.log(' ',k.padEnd(5),(months[k]/games).toFixed(1),'months per game');
drain.sort((a,b)=>a-b);console.log('credibility drained per game: median',drain[100],'p90',drain[180],'max',drain[199]);
