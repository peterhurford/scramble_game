// Where do expert losses come from?
const fs=require('fs'),Module=require('module');
const src=fs.readFileSync(__dirname+'/playtest.js','utf8').split('const bots = ONLY')[0].replace("require('../engine.js')","require(__dirname + '/../engine.js')");
const m=new Module(__filename);m.paths=module.paths;m._compile(src+'\nmodule.exports={play};',__filename);
const E=require('../engine.js');
const out={};let n=0;
for(let i=0;i<300;i++){const s=m.exports.play(process.argv[2]||'expert',1000+i);if(s.ending==='phase2')continue;n++;
 const key=s.ending+' | first scramble at r='+(s.stats.firstScrambleR==null?'none':(Math.round(s.stats.firstScrambleR*10)/10))+' | runaway '+(s.stats.runawayPhase||'-');
 out[key]=(out[key]||0)+1;}
function S_T(s){return E.START_T+s.T}
console.log(n,'non-wins');Object.entries(out).sort((a,b)=>b[1]-a[1]).forEach(([k,v])=>console.log(v,k));
