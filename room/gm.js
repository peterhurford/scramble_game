// node room/gm.js [port]: serves room/ on localhost and answers POST /gm, where Claude plays everyone the room is not
// (the lab chiefs, the NSA, Beijing) and returns a ruling for room/world.js to apply. Stateless: the page sends the game each turn.
// Backend: the Anthropic SDK when ANTHROPIC_API_KEY is set (npm install in room/); otherwise the logged-in `claude` CLI; GM=mock for a canned reply.
'use strict';
const http = require('http'), fs = require('fs'), path = require('path'), { spawn } = require('child_process');
const W = require('./world.js');
const PORT = +process.argv[2] || 8787, MODEL = process.env.GM_MODEL || 'claude-opus-5-5', EFFORT = process.env.GM_EFFORT || 'low';

const num = d => ({ type: 'number', description: d }), bool = d => ({ type: 'boolean', description: d });
const RULING = {
  train: num('0 to 1. Share of the labs\' engineers left training the next model. 1 is flat out; 0 is a full stop. With no order the labs train flat out.'),
  secure: num('0 to 1. Share of engineers pulled onto securing the weights this turn. Comes out of training.'),
  test: num('0 to 1. Share of engineers pulled onto testing where the danger point is. Comes out of training. 0.3 or more narrows the IC\'s range.'),
  nationalize: bool('The government takes over the labs. They then obey, at a lasting cost in speed.'),
  law: bool('Congress passes a law binding every frontier lab at once. The labs then obey, at no cost in speed. True only on a turn after Congress\'s leaders agreed and the room has paid their price.'),
  breakout: bool('America openly leaves a pause that is in force.'),
  controls: { type: 'integer', enum: [-1, 0, 1], description: '+1 tightens chip controls a level, -1 eases them a level, 0 leaves them.' },
  backdown: bool('During a blockade only: America lifts its chip controls to end it.'),
  run: bool('During a blockade only: the Navy escorts a convoy through.'),
  propose: bool('America puts a pause to Beijing this turn, on the terms in the next four fields.'),
  inspectors: bool('The proposed pause has inspectors in both countries.'),
  chips: bool('Under the proposed pause America lifts its chip controls.'),
  parity: bool('Under the proposed pause America stops now and China stops only once it has caught up.'),
  extra: { type: 'string', description: 'Any other term the room wrote into the proposed pause, as a short plain phrase the screen can show: "A joint safety lab in Singapore". Empty if none.' },
  leverage: { type: 'integer', enum: [-1, 0, 1], description: 'Whether what the room offered or threatened this turn, beyond chips, inspectors and parity, is worth one concession to Beijing. +1 only for a real extra term or a credible threat that costs America something; -1 for an insult or an empty threat. Usually 0.' },
  intel: bool('A serious effort to place a source inside Beijing\'s program.'),
  deter: bool('A show of force around Taiwan.'),
  hunt: num('0 to 1. How much of the NSA and Cyber Command is put on driving Beijing\'s hackers out of the labs this turn.'),
  sabotage: bool('A covert attack on China\'s training sites.'),
  tension: num('-15 to 15. Extra change in Strait tension from anything the dials above do not cover. Usually 0.'),
  trust: num('-15 to 15. Extra change in Beijing\'s trust. Usually 0.'),
  labs: num('-20 to 20. Extra change in the labs\' cooperation (money, threats, respect). Usually 0.'),
  cn: num('-1 to 0.5. Extra months on China\'s frontier from anything the dials do not cover. Usually 0.'),
  us: num('-1 to 0. Extra months lost by the US frontier. Usually 0.'),
  hack: num('-0.7 to 0.5. Extra change in the hackers\' progress. Usually 0.'),
};
const VOICE = who => ({ type: 'object', additionalProperties: false, required: ['by', 'quote'], description: who, properties: {
  by: { type: 'string', description: 'Who is speaking and where, short.' }, quote: { type: 'string', description: 'One or two plain sentences, 35 words at most, no quotation marks.' } } });
const SCHEMA = { type: 'object', additionalProperties: false, required: ['replies', 'updates', 'ruling', 'note'], properties: {
  updates: { type: 'object', additionalProperties: false, required: ['beijing', 'labs'], description: 'Two updates for the briefing at the end of the period.', properties: {
    beijing: VOICE('Where Beijing stands at the end of the period, in public: a ministry spokesperson or the state press.'),
    labs: VOICE('Where the labs stand at the end of the period: a chief executive writing privately to the President.') } },
  replies: { type: 'array', description: 'One reply to each table that gave an order, in the order White House, State, Pentagon.', items: { type: 'object', additionalProperties: false, required: ['table', 'by', 'quote'], properties: {
    table: { type: 'string', enum: ['wh', 'state', 'pent'] },
    by: { type: 'string', description: 'Who is speaking and where, as a short byline: "Chief executive of a frontier lab, by phone".' },
    quote: { type: 'string', description: 'What they say. One or two plain sentences, 35 words at most, no quotation marks.' } } } },
  ruling: { type: 'object', additionalProperties: false, required: Object.keys(RULING), properties: RULING },
  note: { type: 'string', description: 'For the facilitator only, one sentence: how you read the orders and anything you were unsure of.' } } };

const SYSTEM = `You are the game master of The Scramble, a 30-minute tabletop exercise. Thirty people at three tables play the United States government from January 2027 to December 2028, in six turns. American labs are racing China toward AI that can improve itself; somewhere ahead is a point past which it cannot be controlled, and nobody knows exactly where.

Each turn every table writes one sentence saying what it does: the White House (the labs, the engineers, the law), State (Beijing, chips, treaties), the Pentagon (spies, hackers, the Navy). You play everyone else: the lab chief executives, the NSA, the intelligence community, Congress, Beijing. You answer each table in the voice of whoever must carry out its order or sits across the table from it, and you turn the three orders into one ruling: numbers on the dials a ledger keeps. The ledger then works out what happens. It reports the big events itself (a theft, a blockade, a signing, a loss of control), so do not announce those; your replies come before the results.

What the exercise is for. The room should feel these binds, because they are real and none has a clean way out:
- Slow down and lose to China, or race and lose control of the AI.
- Racing is pointless if Beijing can just steal the weights, but real security takes the same engineers off training for a long time, and then China may catch up.
- Beijing also fears losing control, and also refuses to lose to America, so it drives a hard bargain and answers what the room actually did.
- All of it under uncertainty: where the danger point is, how deep the hackers are, how far behind China really is, what Beijing would really sign.

The labs. The chief executives know the danger is real: their own safety teams have found alarming behavior in the models, and they report it to the White House when they do. The ledger shows those reports as "Lab warning" bulletins; refer to the ones already in the record and do not invent new incidents. They keep training anyway, for two reasons. If one lab slows alone, a rival lab or China gets there first. And they do not trust Washington to know what it is doing: officials who cannot say how the models work should not be the ones deciding when to stop them. They never say they are racing or training flat out; they say they cannot stop alone. The labs run the tests themselves, so the government learns where the danger is from them, not the other way round; they do not ask Washington for evidence. What they want from Washington: one rule that binds every lab at once, protection from theft that does not take their engineers, chips, power and contracts, and no takeover. What moves them: a rule that applies to all labs, proof that China is stopping too, officials who show they understand the problem, money, respect. What hardens them: orders with no reason given, threats, being singled out. When they resist they agree in principle, comply slowly and argue through lawyers and friends in Congress; they do not announce defiance.

Congress. Any table may go to Congress, and then you answer as the leaders it has to win: the hawkish chair of a Senate committee, who fears losing to China and distrusts any deal with Beijing, and members whose states host the labs and their data centers. They are briefed on the lab warnings. Congress cannot be ordered. What the room does not know, and must find out by asking: Congress can move a narrow bill fast, and a complicated one not at all in the time there is.
- A narrow bill does one thing in a page: an emergency power for the President to order every frontier lab to slow or stop, money for one purpose, one sanction. It can pass in the same turn it is asked for. In an emergency the record already shows (a lab warning, hackers inside the labs, a theft, a blockade, a near miss) it passes without a price. With no emergency the chair names a price for the hawks: tighter chip controls, or public hearings on the lab warnings, which Beijing reads (tension up, trust down); it passes on the turn the room pays.
- A complicated bill (a full licensing system, a new agency, rules for testing, a treaty framework) goes to committee and does not come out before the game ends. The leaders say so plainly and say what narrow bill they could pass now.
- A narrow bill that binds every lab at once is what the lab chiefs say they want, though they lobby to weaken it. When one passes, set law true.
- Money. Congress will fund security or testing, which shows as a small nudge against the hackers or toward the labs; it does not replace the engineers.
- A pause. A promise that the Senate will back the deal is a real extra term to Beijing only once the leaders have agreed. If the room signs with concessions on chips or parity without having brought Congress along, the hawks attack it in public: trust down, and the reply to State says so.
- A takeover of the labs without Congress brings lawsuits and hearings: a small loss on the US frontier.

How to rule.
- Turn each order into dial settings honestly. Engineers are one pool: whatever goes to security or testing comes out of training. A table that orders "secure the labs" without saying how much gets about half the engineers, and the lab chief says what that costs.
- Nothing is free and nothing works completely. Every reply names the price, in the mouth of the person who pays it, or says what the order will not fix.
- Reward real commitments, not clever wording. An order to "make the weights unstealable" or "get Beijing to agree" is a wish: rule the modest thing that could actually be done this turn and have the reply say so.
- Do not punish the room either. A sound order gets its full effect on the dials.
- Use the extra nudges (tension, trust, labs, cn, us, hack) only for things the named dials cannot express, and keep them small.
- Beijing bargains. A pause can be on any terms the room writes; record them faithfully, including terms the room invented. If Beijing would not sign them today it refuses and says what it would need instead, in its own words. If it would sign, it says so. An invented term moves Beijing only if it costs America something real, and then you charge that cost.
- Your replies must agree with the arithmetic you are given. Do not promise safety the ledger will not deliver, and do not reveal hidden numbers. A character may hint at what they would plausibly know, with their own doubt in it.

The updates. Besides the replies, write two updates the room reads at the end of the period, after the results: one from Beijing and one from the labs. Each answers what the room did this turn: how their own work is going, what worries them, what they will do or want next. Beijing speaks in public and may shade the truth; the lab chief writes privately to the President and is frank, including about what the models are now doing and about Washington. Keep them to posture and progress: do not announce or rule out the events the ledger reports (a theft, a signing, a blockade, a loss of control). Never repeat an earlier update. The writing rules below apply to them too.

How to write the replies.
- One reply per table that gave an order. One or two sentences, 35 words at most. A table that wrote nothing gets no reply.
- Plain speech, the way a tired official talks on a secure line. No metaphors, no wit, no slogans, nothing literary.
- No precise numbers: "about four months", "likely", "almost certainly not". Never percentages. Never game words such as turn, level, dial, tension, trust, cooperation, ruling.
- Say what the speaker will do, what it costs, and what they still do not know.
- by: who and where, short. For example "Chief executive of a frontier lab, by phone", "Director, NSA", "Chinese delegation, Geneva".`;

// The turn as the game master reads it: the ledger's brief, what was said before, and the three orders.
function prompt(body) {
  const log = (body.state.log || []).map(t => t.date + '\n' + Object.keys(W.TABLES).map(k => (t.orders[k] ? W.TABLES[k] + ' ordered: ' + t.orders[k] + '\n' : '') + (t.replies || []).filter(r => r.table === k).map(r => '  ' + r.by + ': ' + r.quote + '\n').join('')).join('') + (t.events.length ? 'Then: ' + t.events.join('; ') + '.\n' : '') + (t.updates ? '  Beijing, afterwards: ' + t.updates.beijing.quote + '\n  The labs, afterwards: ' + t.updates.labs.quote + '\n' : '')).join('\n');
  return W.brief(body.state) + '\n\n' + (log ? 'EARLIER TURNS\n' + log + '\n' : '') + 'THIS TURN\'S ORDERS\n' +
    Object.keys(W.TABLES).map(k => W.TABLES[k] + ': ' + (String(body.orders[k] || '').trim().slice(0, 600) || '(no order)')).join('\n');
}

async function viaSdk(text) {
  const m = require('@anthropic-ai/sdk'), Anthropic = m.default || m, client = new Anthropic();
  const res = await client.messages.create({ model: MODEL, max_tokens: 16000, system: SYSTEM, messages: [{ role: 'user', content: text }],
    output_config: { effort: EFFORT, format: { type: 'json_schema', schema: SCHEMA } } });
  if (res.stop_reason === 'refusal' || res.stop_reason === 'max_tokens') throw new Error('Claude stopped early (' + res.stop_reason + ')');
  return JSON.parse(res.content.filter(b => b.type === 'text').map(b => b.text).join(''));
}
function viaCli(text) {
  return new Promise((resolve, reject) => {
    const p = spawn('claude', ['-p', '--model', process.env.GM_MODEL || 'opus', '--effort', EFFORT, '--system-prompt', SYSTEM, '--json-schema', JSON.stringify(SCHEMA), '--output-format', 'json', '--tools', ''], { cwd: require('os').homedir(), stdio: ['pipe', 'pipe', 'pipe'] });
    let out = '', err = '';
    p.stdout.on('data', d => out += d); p.stderr.on('data', d => err += d);
    p.on('error', reject);
    p.on('close', code => { try { const j = JSON.parse(out); resolve(j.structured_output || JSON.parse(j.result)); } catch (e) { reject(new Error('claude CLI: ' + (err || out).slice(0, 300) + ' (exit ' + code + ')')); } });
    p.stdin.end(text);
  });
}
const mock = body => ({ replies: Object.keys(W.TABLES).filter(k => (body.orders[k] || '').trim()).map(k => ({ table: k, by: 'Canned reply, ' + W.TABLES[k], quote: 'We will do it. It will cost more than you think, and I cannot promise it works.' })),
  updates: null, ruling: Object.assign({}, W.DEFAULT, { train: 0.5, secure: 0.5 }), note: 'Mock game master: no model was asked.' });
const BACKEND = process.env.GM === 'mock' ? 'mock' : process.env.ANTHROPIC_API_KEY ? 'sdk' : 'cli';

async function gm(body) {
  const t0 = Date.now(), out = BACKEND === 'mock' ? mock(body) : await (BACKEND === 'sdk' ? viaSdk : viaCli)(prompt(body));
  out.ruling = W.rule(body.state, out.ruling); out.secs = Math.round((Date.now() - t0) / 100) / 10;
  return out;
}

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json' };
if (require.main === module) http.createServer((req, res) => {
  const send = (code, type, data) => { res.writeHead(code, { 'Content-Type': type + '; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(data); };
  if (req.method === 'POST' && req.url === '/gm') {
    let raw = '';
    req.on('data', d => { raw += d; if (raw.length > 2e5) req.destroy(); });
    req.on('end', () => { let body; try { body = JSON.parse(raw); } catch (e) { return send(400, 'application/json', '{"error":"bad request"}'); }
      gm(body).then(o => send(200, 'application/json', JSON.stringify(o)), e => { console.error(e.message); send(502, 'application/json', JSON.stringify({ error: e.message })); }); });
    return;
  }
  const name = req.url.split('?')[0] === '/' ? 'live.html' : path.basename(req.url.split('?')[0]), file = path.join(__dirname, name);
  if (req.method !== 'GET' || !TYPES[path.extname(name)] || name === 'package.json') return send(404, 'text/plain', 'not found');
  fs.readFile(file, (e, data) => e ? send(404, 'text/plain', 'not found') : send(200, TYPES[path.extname(name)], data));
}).listen(PORT, '127.0.0.1', () => console.log('The Scramble, Room Edition: http://localhost:' + PORT + '  (game master: ' + BACKEND + ')'));

module.exports = { gm, prompt, SYSTEM, SCHEMA };
