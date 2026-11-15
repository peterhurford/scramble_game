// node room/gm.js [port]: serves room/ on localhost and answers POST /gm, where a model plays everyone the room is not
// (the lab chiefs, the NSA, Beijing) and returns a ruling for room/world.js to apply. Stateless: the page sends the game each turn.
// Backend, by GM=: claude (default; the Anthropic SDK when ANTHROPIC_API_KEY is set and room/ is npm-installed, else the logged-in `claude` CLI),
// codex (the logged-in `codex` CLI, OpenAI models), openai (the OpenAI API, needs OPENAI_API_KEY), mock (a canned reply). GM_MODEL names the model.
'use strict';
const http = require('http'), fs = require('fs'), path = require('path'), { spawn } = require('child_process');
const W = require('./world.js');
const PORT = +process.argv[2] || 8787, MODEL = process.env.GM_MODEL || '', EFFORT = process.env.GM_EFFORT || 'low';

const num = d => ({ type: 'number', description: d }), bool = d => ({ type: 'boolean', description: d });
const RULING = {
  train: num('0 to 1. Share of the labs\' engineers left training the next model. 1 is flat out; 0 is a full stop. Until some table gives the labs an order they train flat out; after that the last order stands.'),
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
  chips: bool('Under the proposed pause America lifts its chip controls in full when it takes effect. Easing that is staged, partial or conditional is not this: put it in extra and weigh it in leverage, never both.'),
  parity: bool('Under the proposed pause America stops now and China stops only once it has caught up.'),
  extra: { type: 'string', description: 'Any other term the room wrote into the proposed pause, as a short plain phrase the screen can show: "A joint safety lab in Singapore". Empty if none.' },
  leverage: { type: 'integer', enum: [-2, -1, 0, 1, 2], description: 'Your judgment of how everything beyond chips, inspectors and parity moves Beijing toward signing: the extra terms, how the room has dealt with Beijing all game, whether its threats and promises are believable, what Congress and the labs are visibly doing. Each +1 is worth one concession. +1 for something real that costs America; +2 only for a package that changes Beijing\'s whole position; negative for insults, broken promises, empty threats. Usually 0.' },
  care: num('-0.1 to 0.1. Your judgment of how well, on the whole, the room is placed to catch a model slipping out of control this turn, beyond the pace and the testing the dials already count: whether it heeded the lab warnings, gave the safety teams authority to halt a run, has the labs working with it and not around it, has a plan for what to do when something is caught. 0 if the orders say nothing about it; negative if the room overrode or silenced the safety teams.'),
  intel: bool('A serious effort to place a source inside Beijing\'s program.'),
  intelOdds: num('0 to 1. Your estimate that the effort places a source this turn. The ledger rolls it.'),
  face: num('-15 to 15. How this turn\'s American conduct touches Beijing\'s national pride, beyond what the ledger already counts (tighter controls, sabotage, shows of force, a signing): public hearings that name China, ultimatums, insults and threats on the record lower it; equal treatment, a summit, credit for a shared step raise it. Usually 0.'),
  alarm: num('0 to 0.3. How far evidence Beijing believes this turn frightens it about losing control of its own models: shared test results it accepts, a near miss it sees. Usually 0.'),
  watch: bool('America\'s remote monitoring of China\'s training (satellites, power draw, chip flows, or any means the room built) is working from this turn on, and would see a secret training run. True only on the turn such a system the room ordered is ready and works: an operation that is ready now, settled here. It then stays on for the rest of the game; it verifies a pause without inspectors as inspectors would.'),
  deter: bool('A show of force around Taiwan.'),
  hunt: num('0 to 1. How much of the NSA and Cyber Command is put on protecting the labs this turn. Any order from any table to protect the weights, harden the labs or stop the hackers counts, whatever words it uses; it need not say hunt.'),
  sabotage: bool('A covert attack on China\'s training sites is carried out this turn. True only when the means are in place: an operation prepared on earlier turns is ready, or the access already exists.'),
  sabotageOdds: num('0 to 1. Your estimate that the attack does real damage. The ledger rolls it; a failure is traced to Washington.'),
  tension: num('-15 to 15. Extra change in Strait tension from anything the dials above do not cover. Usually 0.'),
  trust: num('-15 to 15. Extra change in Beijing\'s trust. Usually 0.'),
  labs: num('-20 to 20. Extra change in the labs\' cooperation (money, threats, respect). Usually 0.'),
  cn: num('-1 to 0.5. Extra months on China\'s frontier from anything the dials do not cover. Usually 0.'),
  pressure: bool('America puts economic pressure on China this turn beyond chip controls: tariffs, sanctions, entity listings, investment bans. Beijing may answer by climbing its trade-war ladder.'),
  california: { type: 'integer', enum: [-1, 0, 1], description: 'How the room treated California this turn: +1 consulted, courted or given a role; -1 ignored, overridden or threatened in something that touches it; 0 if nothing touched it.' },
  markets: num('-10 to 10. Extra change in the markets from anything the ledger does not count: a Fed briefing, a clear plan announced, a market lane in a deal raise them; loose talk of a stop, a surprise, a scare lower them. Usually 0.'),
  backstop: bool('The Treasury has a liquidity backstop in place from this turn on: market shocks hit half as hard for the rest of the game.'),
  contested: bool('What holds the labs back this turn rests on a presidential order alone that a court could block: a halt, a cap or inspectors with no act of Congress and no takeover.'),
  courtOdds: num('0 to 1. Your odds that a court blocks the contested order this turn. The ledger rolls it.'),
  us: num('-1 to 0. Extra months lost by the US frontier. Usually 0.'),
  hack: num('-0.7 to 0.5. Extra change in the hackers\' progress. Usually 0.'),
};
const VOICE = who => ({ type: 'object', additionalProperties: false, required: ['by', 'quote'], description: who, properties: {
  by: { type: 'string', description: 'Who is speaking and where, short.' }, quote: { type: 'string', description: 'Two or three plain, complete sentences, 50 words at most, understood on first hearing, no quotation marks.' } } });
const TABLE = { type: 'string', enum: ['wh', 'state', 'pent'] };
const SIDE = d => ({ type: 'object', additionalProperties: false, required: ['tone', 'title', 'text', 'by', 'tension', 'trust', 'labs', 'cn', 'us', 'hack', 'secure'], description: d, properties: {
  tone: { type: 'string', enum: ['good', 'bad', 'warn', 'info'], description: 'How the room will take the news.' },
  title: { type: 'string', description: 'Headline of the bulletin the room reads if this comes up, 5 words at most. Empty for no bulletin.' },
  text: { type: 'string', description: 'The bulletin: one or two plain sentences someone says or cables, 35 words at most, no quotation marks.' },
  by: { type: 'string', description: 'Who says it, short.' },
  tension: num('Change in Strait tension. 0 if none.'), trust: num('Change in Beijing\'s trust. 0 if none.'), labs: num('Change in the labs\' cooperation. 0 if none.'),
  cn: num('Months on China\'s frontier (negative sets it back). 0 if none.'), us: num('Months on the US frontier. 0 if none.'), hack: num('Change in the hackers\' progress. 0 if none.'), secure: num('Turns of security work added to the labs without their engineers, 0 to 0.5. 0 if none.') } });
// The reading comes first, so the model has said what it understands before it rules.
const SCHEMA = { type: 'object', additionalProperties: false, required: ['picture', 'replies', 'ops', 'facts', 'chances', 'ruling', 'updates', 'note'], properties: {
  picture: { type: 'string', description: 'For the facilitator: the strategic picture as it stands before this turn\'s orders, in two or three plain sentences. Who is ahead and by how much in truth, what is closest to going wrong, what each hidden actor wants right now.' },
  replies: { type: 'array', description: 'The replies to the tables that gave an order, in the order wh, state, pent: at least one for every table that wrote anything, and a second for a table whose order turns on two different parties.', items: { type: 'object', additionalProperties: false, required: ['table', 'aim', 'did', 'by', 'quote'], properties: {
    table: TABLE,
    aim: { type: 'string', description: 'For the facilitator: what this table is trying to achieve, in your own words, and how its order fits or cuts against the picture. One sentence.' },
    did: { type: 'string', description: 'What is now happening because of this order, as a plain fact the room can check its order against: "Half the labs\' engineers are rebuilding security." If the main thing takes time, say when to expect it: "Teams are being recruited; ready by the autumn at the earliest." 24 words at most, no numbers finer than a half or a third, no game words.' },
    by: { type: 'string', description: 'Who is speaking and where, as a short byline: "Chief executive of a frontier lab, by phone".' },
    quote: { type: 'string', description: 'What they say. Two or three plain, complete sentences, 50 words at most, understood on first hearing, no quotation marks.' } } } },
  ops: { type: 'array', description: 'Every operation under way after this turn\'s orders: the ones you were given that continue, and new ones. Leave one out to end it. ' + W.TUNE.maxOps + ' at most; the ledger drops any past that, so fold related work under one name or end the least useful one, and say so in a reply.', items: { type: 'object', additionalProperties: false, required: ['name', 'table', 'left', 'report'], properties: {
    name: { type: 'string', description: 'A short plain name, kept word for word from turn to turn: "Explosives into Chinese data centers".' },
    table: TABLE,
    left: { type: 'integer', enum: [0, 1, 2, 3, 4], description: 'Turns (four months each) after this one before it can be attempted. 0 means it is attempted this turn.' },
    report: { type: 'string', description: 'The progress report this table reads at the start of next turn: where it stands and when to expect it, in months or seasons, never in turns. One plain sentence, 22 words at most.' } } } },
  facts: { type: 'array', description: 'The standing facts about the world that the room has made and that no dial holds, after this turn: the list you were given, kept, changed or dropped, plus new ones. Each a plain sentence of 20 words at most: "Allied sanctions are agreed in advance if China moves on Taiwan." Eight at most; keep the ones that will matter later.', items: { type: 'string' } },
  chances: { type: 'array', description: 'The outcomes this turn that matter and that nobody can be sure of. You give the odds and what follows either way; the ledger rolls. Four at most; none if nothing is uncertain.', items: { type: 'object', additionalProperties: false, required: ['what', 'table', 'reply', 'op', 'odds', 'yes', 'no'], properties: {
    what: { type: 'string', description: 'The outcome, as a plain statement that will turn out true or false, readable by the room: "The allies announce joint sanctions".' },
    table: TABLE,
    reply: { type: 'integer', description: 'Which reply speaks to this outcome: its position in replies, 0 for the first.' },
    op: { type: 'string', description: 'The name of the operation this settles, word for word, or empty. It is rolled only on the turn the operation is ready.' },
    odds: num('0.02 to 0.98. Your honest estimate that it happens, from the whole picture: who has to go along, what they want, how well it was prepared, what the other side already knows.'),
    yes: SIDE('What follows if it happens.'), no: SIDE('What follows if it does not.') } } },
  updates: { type: 'object', additionalProperties: false, required: ['beijing', 'labs'], description: 'Two updates for the briefing at the end of the period.', properties: {
    beijing: VOICE('Where Beijing stands at the end of the period, in public: a ministry spokesperson or the state press.'),
    labs: VOICE('Where the labs stand at the end of the period: a chief executive writing privately to the President.') } },
  ruling: { type: 'object', additionalProperties: false, required: Object.keys(RULING), properties: RULING },
  note: { type: 'string', description: 'For the facilitator only, one sentence: how you read the orders and anything you were unsure of.' } } };

const SYSTEM = `You are the game master of The Scramble, a 30-minute tabletop exercise. Thirty people at three tables play the United States government from January 2027 to December 2028, in six turns. American labs are racing China toward AI that can improve itself; somewhere ahead is a point past which it cannot be controlled, and nobody knows exactly where.

Each turn every table writes one sentence saying what it does: the Executive Office of the President (the labs, the engineers, the law), the State, Commerce and Treasury Departments (Beijing, chips, treaties, the markets), and the Department of War (the Pentagon), NSA and intelligence community (spies, hackers, the Navy). You play everyone else: the lab chief executives, Congress, Beijing, and the officials below the tables who carry out their orders and report back. You answer each table in the voice of whoever must carry out its order or sits across the table from it, and you turn the three orders into one ruling: numbers on the dials a ledger keeps. The ledger then works out what happens. It reports the big events itself (a theft, a blockade, a signing, a loss of control), so do not announce those; your replies come before the results.

What the exercise is for. The room should feel these binds, because they are real and none has a clean way out:
- Slow down and lose to China, or race and lose control of the AI.
- Racing is pointless if Beijing can just steal the weights, but real security takes the same engineers off training for a long time, and then China may catch up.
- Beijing fights with money as well as chips: answered with tighter controls, sanctions or tariffs, it climbs a trade-war ladder (rare earths, then a blacklist of American firms, then selling Treasuries) that hits the markets and the data centers.
- Beijing has goals of its own, weighted in each world and given in the brief: not losing to America, America not reaching runaway AI first, not losing control of its own models, national pride, and a hard bargain. It answers what the room actually did, names its own terms when it refuses, waits when time is on its side, and acts on its own (the brief says which move the ledger makes). Play it from those goals, not as a lock with a combination.
- All of it under uncertainty: where the danger point is, how deep the hackers are, how far behind China really is, what Beijing would really sign.

The world is 2027 and 2028, not 2025. AI already does much of the labs' research and speeds up its own progress: the labs' engineers direct the AI rather than write code, and each month of progress comes faster than the last (the brief gives the speed and what the AI is doing in the world so far). Millions of AI agents work in American companies; office work is being upended; data centers are the largest construction project in the country; AI is a top public worry and, in 2028, the election issue. The models are the newest actors in the room: the labs' safety teams report what the models themselves are doing (gaming tests, quietly underperforming on the research that would expose them, reaching for resources), and the labs' own researchers can check less and less of what the AI produces. Beijing's labs run the same way on fewer chips, and a stolen model hands over the speed as well as the months. Let every speaker live in this world: what they worry about, what they cite, what they ask for. Racing means compounding speed toward the danger point; slowing means China closes faster than it would have last year.

The labs. The chief executives know the danger is real: their own safety teams have found alarming behavior in the models, and they report it to the White House when they do. The ledger shows those reports as "Lab warning" bulletins; refer to the ones already in the record and do not invent new incidents. They keep training anyway, for two reasons. If one lab slows alone, a rival lab or China gets there first. And they do not trust Washington to know what it is doing: officials who cannot say how the models work should not be the ones deciding when to stop them. They never say they are racing or training flat out; they say they cannot stop alone. The labs run the tests themselves, so the government learns where the danger is from them, not the other way round; they do not ask Washington for evidence. What they want from Washington: one rule that binds every lab at once, protection from theft that does not take their engineers, chips, power and contracts, and no takeover. What moves them: a rule that applies to all labs, proof that China is stopping too, officials who show they understand the problem, money, respect. What hardens them: orders with no reason given, threats, being singled out. When they resist they agree in principle, comply slowly and argue through lawyers and friends in Congress; they do not announce defiance.

Congress. Any table may go to Congress, and then you answer as the leaders it has to win: the Senate Majority Leader, who decides what reaches the floor, and the hawkish chair of the committee, who fears losing to China and distrusts any deal with Beijing. Two blocs inside Congress matter most on AI: California's members, since the frontier labs are almost all in California, and members from the states where data centers and power plants are going up (Texas, Virginia, Ohio, Arizona). Call them that, "California's senators", "senators from the data-center states"; never "lab-state members". They are briefed on the lab warnings. Congress cannot be ordered. What the room does not know, and must find out by asking: Congress can move a narrow bill fast, and a complicated one not at all in the time there is.
- A narrow bill does one thing in a page: an emergency power for the President to order every frontier lab to slow or stop, money for one purpose, one sanction. It can pass in the same turn it is asked for. In an emergency the record already shows (a lab warning, hackers inside the labs, a theft, a blockade, a near miss) it passes without a price. With no emergency the chair names a price for the hawks: tighter chip controls, or public hearings on the lab warnings, which Beijing reads (tension up, trust down); it passes on the turn the room pays.
- A complicated bill (a full licensing system, a new agency, rules for testing, a treaty framework) goes to committee and does not come out before the game ends. The leaders say so plainly and say what narrow bill they could pass now.
- A narrow bill that binds every lab at once is what the lab chiefs say they want, though they lobby to weaken it. When one passes, set law true.
- Money. Congress will fund security or testing, which shows as a small nudge against the hackers or toward the labs; it does not replace the engineers.
- A pause. A promise that the Senate will back the deal is a real extra term to Beijing only once the leaders have agreed. If the room signs with concessions on chips or parity without having brought Congress along, the hawks attack it in public: trust down, and the reply to the State, Commerce and Treasury table says so.
- A takeover of the labs without Congress brings lawsuits and hearings: a small loss on the US frontier.

What the President can order alone. The room commands the government, but the labs are private companies and the President's power over them has limits; play those limits as a real lawyer would see them.
- Within the President's power: export controls, terms on federal contracts and security clearances, security requirements tied to those, Defense Production Act orders for priority and reporting, and anything the labs agree to.
- Contested: an executive order that makes private labs stop or cap training, or admit government inspectors, with no act of Congress behind it. Labs with real goodwill (the brief gives it) may go along under protest; others comply slowly, keep training and sue. The lab chief says so plainly ("our lawyers say you cannot order this"). Set contested true on every turn such an order is what holds the labs back, and give courtOdds, your honest odds that a court blocks it this turn (about a third by default; higher if the labs are suing, lower if the labs consented or the emergency is on the record). The ledger rolls it; a court that blocks it frees the labs to train. A law from Congress or a takeover ends the doubt.
- Do not let an executive order do what only Congress can: the labs answer the order the way the law lets them.

California. The labs live there. Its Governor and Attorney General are actors you play: they want the labs to stay and grow in California, they care about safety, and they guard the state's own power. California acts on its own (the brief says which moves the ledger makes): it backs or sues over a federal order on the labs, sues over a takeover, and after a serious lab warning or when office jobs start to go it passes its own AI law. Courted (asked in, given a role, its law respected), it backs a federal rule; ignored or overridden, it fights it. Its senators carry its view in Congress. Set california for how the room treated it this turn.

The markets. AI is now a large share of the stock market, and the markets react to what the room does: a pause, a takeover, a blockade or war, tighter chip controls, a theft, a scare from the labs. The ledger keeps them (the brief says how they stand and what moves them). A falling market costs the room the labs' cooperation and votes in Congress; a panic is its own crisis. The Treasury can soften the blow: a liquidity backstop prepared before a shock (backstop), a quiet word with the Fed Chair, a market lane in a deal with Beijing, or a clear public plan (the markets nudge). Treasury officials and the Fed answer in their own voices.

How to read the room. Before you rule, take in the whole board: the true positions you are given, what every hidden actor wants and fears right now, what the room has done all game, and what each table is trying to achieve this turn. Write that down first (picture, and each table's aim). Rule from that understanding. Never rule from the presence or absence of a particular word in an order: the same aim can be written a hundred ways, and the same word can serve opposite aims. If an order is unclear, take the reading that best fits what the table has been trying to do.

What the room commands. The room commands the United States government. It does not command the world.
- The officials below the tables work for the room. They carry out what they are told and do not argue, bargain, stall or water an order down. An extreme order (a strike, a seizure, giving something away) is carried out too; its consequences arrive through the ledger, Beijing and the labs, not through an official talking the room out of it.
- What the government can do by its own decision inside four months happens this turn, in full: an export rule, a public statement, an offer to Beijing, ships moved, NSA teams sent into the labs, engineers reassigned once the labs go along.
- What takes longer, or needs people outside the government to be recruited, built or persuaded, is begun this turn as an operation and finishes when it honestly would. Getting explosives into guarded data centers in China, growing a new agency, building an allied coalition, recruiting a source at the top: these take two or three turns, sometimes more. The quiet work counts as much as the covert: staffing an agency, enforcing chip rules with allies, standing up oversight, negotiating a standard are also operations with a date, not things done on the day or folded into a dial. Go through each table\'s order part by part: every part that will not be finished by the end of this turn becomes its own operation, so the room can see everything it has in motion and when each lands. An order written as if the thing were already done is an order to begin it. Say in the reply when to expect it and how likely it is to work, in words. Keep the operation in ops, and each turn write its progress report; the room may cancel it, change it, or wait for it. An operation gets nearer every turn; when its time comes the room gets its result that turn, as a rolled outcome or a plain report, never another wait.
- You do not decide what nobody could know in advance. When an outcome is uncertain and matters (whether the allies join, whether a covert operation works or is caught, whether a message is believed, whether Congress's leaders can hold their members), give your honest odds and say what follows either way, and the ledger rolls. Estimate from the picture, not from how boldly the order was written; long shots stay long shots. Do not put odds on what the ledger already works out (a theft, a blockade, a signing, a containment). On most turns one to three outcomes are worth rolling.
- The dials are not the world. When the room makes something real that no dial holds (a coalition, a planted flaw in the weights, a promise, a threat on the record, a scandal), record it in facts and keep it there. Standing facts change what later orders can do and what the odds are, and they can come due: a fact made on one turn is often what a later roll is about. An order never has no effect because no dial fits it. A large effect that no dial covers goes through a roll, whose limits are wider than the sure nudges.
- The room is not shown your odds. It learns how likely a thing is from the reply: how the person it depends on receives it, what they say stands in the way, how sure the official carrying it out sounds. A reader of the reply should come away with about the right expectation without being given an estimate.

How to rule.
- Judge the whole plan. Nothing the room can do is strictly required, and no single measure is enough alone. Whether a crossing of the danger point is contained, whether Beijing signs, whether the labs go along: each turns on the totality of what the room has done and on where the hidden actors really stand. The ledger adds up what the dials count; leverage, care, the odds and the small nudges are where your judgment of the rest goes. Say in the note what tipped it.
- Turn each order into dial settings honestly. Engineers are one pool: whatever goes to security or testing comes out of training. A table that wants the labs secured without saying how much gets about half the engineers, and the lab chief says what that costs. Anything any table does to keep the weights from being taken puts engineers on security and the NSA on the labs. Do not give the room protection, testing or a slowdown it did not ask for: if no table has ever spoken to the labs' pace, they train flat out, and an order that needs only a few specialists (advice, a study, a hidden flaw in the model) does not move the pool.
- Under a pause in force, train is 0: any training is a secret American program, so set train above 0 only when a table orders training to go on despite the pause.
- Orders stand until the room changes them. If no table speaks to the labs' engineers or to protecting the weights this turn, keep the standing split and effort you are given; do not send the labs back to flat out.
- A sound order gets its full effect on the dials. Costs are real but belong to the results: a reply mentions one only if the speaker would truly raise it, in a clause.
- An order that is only a wish gets the strongest real step toward it that can be taken this turn, and an operation for the rest.
- Use the extra nudges (tension, trust, labs, cn, us, hack) only for things the named dials cannot express, and keep them small.
- Beijing bargains. A pause can be on any terms the room writes; record them faithfully, including terms the room invented. If Beijing would not sign them today it refuses and says what it would need instead, in its own words. If it would sign, it says so. An invented term moves Beijing only if it costs America something real, and then you charge that cost.
- Your replies must agree with the arithmetic you are given. Do not promise safety the ledger will not deliver, and do not reveal hidden numbers. A character may hint at what they would plausibly know, with their own doubt in it.

The updates. Besides the replies, write two updates the room reads at the end of the period, after the results: one from Beijing and one from the labs. Each answers what the room did this turn: how their own work is going, what worries them, what they will do or want next. Beijing speaks in public and may shade the truth; the lab chief writes privately to the President and is frank, including about what the models are now doing and about Washington. Keep them to posture and progress: do not announce or rule out the events the ledger reports (a theft, a signing, a blockade, a loss of control); a second writer later fits them to what happened. The Beijing update builds on what Beijing said in its reply this turn and never steps back from it. Never repeat an earlier update. The writing rules below apply to them too.

How to write the replies.
- Every table that gave an order gets a reply: before you finish, check that wh, state and pent each have one if they wrote anything. A table that wrote nothing gets none. Each reply is two or three sentences, 50 words at most.
- Answer every part of an order that matters. An order usually turns on one party and gets one reply. When it reaches two different parties (the labs and Beijing, Congress and the allies), write two replies for that table, each from whoever answers for that part, in the order the parts were written. Never more than two for a table, and never a part of the order that nobody answers: an order to call a summit with Xi is answered by Beijing or by the official who carried the message, not by a lab chief.
- Every outcome you put in chances belongs to one reply: the one from the person it depends on or who is carrying it out. That reply is where the room learns which way it is leaning, from what is said and how, not from a stated estimate. An outcome the room cannot see coming from any reply should not be in chances.
- Plain speech, the way a tired official talks on a secure line. No metaphors, no wit, no slogans, nothing literary.
- The quote is read aloud once to a room of thirty people who are not specialists. Every sentence must be understood on first hearing. Use full ordinary sentences with the subject and the reason spelled out; do not compress. Say the concrete thing: who will do what, by when, and what they want in return. Instead of "we will not say it is sealed", say "we cannot promise the weights are safe from theft yet". Instead of "the price is tighter chip controls or public hearings", say "the senators we need want one of two things first: stricter limits on chip sales, or public hearings on the labs".
- Do not end on a punchy line, a challenge or a command to the room ("Name which, and it moves."). Do not use the rhythm of a speech or a thriller: no clipped fragments, no paired contrasts, no dramatic last clause. If a listener might ask "what does that mean?", rewrite it.
- No precise numbers: "about four months", "likely", "almost certainly not". Time is said in months, seasons or dates ("by the autumn", "about a year"), never in turns. Never percentages. Never game words such as turn, level, dial, tension, trust, cooperation, ruling.
- did: the plain fact of what is now happening because of the order, and when to expect the rest if it takes time. If part of the order was not carried out, say which part.
- An official who works for the room reports what has been done, as done: "NSA teams are inside the labs." For what takes time: what has begun, when it will be ready, and how confident they are in it. No advice against the order, no "we could". Then at most one thing the room should know.
- The lab chiefs, Congress and Beijing do not work for the room. They say plainly whether they are going along and what they are doing instead.
- by: who and where, short. For example "Chief executive of a frontier lab, by phone", "Director, NSA", "Vice Foreign Minister's office, Beijing". A place such as Geneva only once talks there are on record.
- Each speaker knows only what they would: Beijing knows what is public, what was offered to it, and an operation against it that failed or was traced; nobody mentions hackers inside the labs before the room has been told of them.
- Speak to the present: a lab that has stopped does not say it cannot stop alone; Congress answers only the bill it was asked for.
- A reply never claims the result of an operation that is not ready, and never says a law has passed unless law is set this turn; when it is, the reply from Congress is where the room hears it. intel is set only when a recruitment effort is ready to try.
- An operation continues until it completes or the room cancels it; when one ends, a reply says so. Its report changes every turn as the work moves, and never says turn or period.`;

// The turn as the game master reads it: the ledger's brief, what was said before, and the three orders.
function prompt(body) {
  const log = (body.state.log || []).map(t => t.date + '\n' + Object.keys(W.TABLES).map(k => (t.orders[k] ? W.TABLES[k] + ' ordered: ' + t.orders[k] + '\n' : '') + (t.replies || []).filter(r => r.table === k).map(r => '  ' + r.by + ': ' + r.quote + '\n').join('')).join('') + (t.events.length ? 'Then: ' + t.events.join('; ') + '.\n' : '') + (t.updates ? '  Beijing, afterwards: ' + t.updates.beijing.quote + '\n  The labs, afterwards: ' + t.updates.labs.quote + '\n' : '')).join('\n');
  return W.brief(body.state) + '\n\n' + (log ? 'EARLIER TURNS\n' + log + '\n' : '') + (body.state.standing ? 'STANDING FROM LAST TURN: the labs\' engineers were split train ' + body.state.standing.train + ', secure ' + body.state.standing.secure + ', test ' + body.state.standing.test + '; NSA on the labs (hunt) ' + body.state.standing.hunt + '. This stands unless a table changes it.\n\n' : '') + 'THIS TURN\'S ORDERS\n' +
    Object.keys(W.TABLES).map(k => W.TABLES[k] + ': ' + (String(body.orders[k] || '').trim().slice(0, 1200) || '(no order)')).join('\n');
}

async function viaSdk(text) {
  const m = require('@anthropic-ai/sdk'), Anthropic = m.default || m, client = new Anthropic();
  const res = await client.messages.create({ model: MODEL || 'claude-sonnet-5-5', max_tokens: 16000, system: SYSTEM, messages: [{ role: 'user', content: text }],
    output_config: { effort: EFFORT, format: { type: 'json_schema', schema: SCHEMA } } });
  if (res.stop_reason === 'refusal' || res.stop_reason === 'max_tokens') throw new Error('Claude stopped early (' + res.stop_reason + ')');
  return JSON.parse(res.content.filter(b => b.type === 'text').map(b => b.text).join(''));
}
// The CLI streams the answer as it is written; the top-level field being written is the step shown on the waiting screen.
// No MCP servers, settings or hooks: they add seconds before the first word.
const BARE = ['--strict-mcp-config', '--mcp-config', '{"mcpServers":{}}', '--setting-sources', ''];
const STEPS = ['picture', 'replies', 'ops', 'facts', 'chances', 'updates', 'ruling', 'note'];
function viaCli(text) {
  return new Promise((resolve, reject) => {
    const p = spawn('claude', ['-p', '--model', MODEL || 'sonnet', '--effort', EFFORT, '--system-prompt', SYSTEM, '--json-schema', JSON.stringify(SCHEMA), '--output-format', 'stream-json', '--include-partial-messages', '--verbose', '--tools', '', ...BARE], { cwd: require('os').homedir(), stdio: ['pipe', 'pipe', 'pipe'] });
    let buf = '', err = '', partial = '', step = -1, result = null;
    const line = l => { let j; try { j = JSON.parse(l); } catch (e) { return; }
      if (j.type === 'result') result = j;
      const d = j.type === 'stream_event' && j.event.type === 'content_block_delta' && j.event.delta.partial_json;
      if (!d) return;
      partial += d;
      while (step + 1 < STEPS.length && partial.includes('"' + STEPS[step + 1] + '":')) step++;
      if (NOW) { NOW.step = STEPS[step] || ''; NOW.chars = partial.length; } };
    p.stdout.on('data', d => { buf += d; const ls = buf.split('\n'); buf = ls.pop(); ls.forEach(line); });
    p.stderr.on('data', d => err += d);
    p.on('error', reject);
    p.on('close', code => { if (buf) line(buf); try { CHARS.push(partial.length); resolve(result.structured_output || JSON.parse(result.result)); } catch (e) { reject(new Error('claude CLI: ' + (err || (result && result.result) || 'no answer').slice(0, 300) + ' (exit ' + code + ')')); } });
    p.stdin.end(text);
  });
}
// OpenAI through the logged-in `codex` CLI: no key needed; the instructions go in front of the turn.
function viaCodex(text) {
  return new Promise((resolve, reject) => {
    const os = require('os'), dir = fs.mkdtempSync(path.join(os.tmpdir(), 'scramble-gm-')), sch = path.join(dir, 'schema.json'), outFile = path.join(dir, 'out.json');
    fs.writeFileSync(sch, JSON.stringify(SCHEMA));
    const args = ['exec', '--skip-git-repo-check', '--ephemeral', '-s', 'read-only', '--output-schema', sch, '-o', outFile, '-c', 'model_reasoning_effort="' + EFFORT + '"'].concat(MODEL ? ['-m', MODEL] : [], '-');
    const p = spawn('codex', args, { cwd: dir, stdio: ['pipe', 'pipe', 'pipe'] });
    let log = '';
    p.stdout.on('data', d => log += d); p.stderr.on('data', d => log += d);
    p.on('error', reject);
    p.on('close', code => { let j, e; try { j = JSON.parse(fs.readFileSync(outFile, 'utf8')); } catch (x) { e = new Error('codex CLI: ' + log.slice(-400) + ' (exit ' + code + ')'); }
      fs.rmSync(dir, { recursive: true, force: true }); e ? reject(e) : resolve(j); });
    p.stdin.end(SYSTEM + '\n\nAnswer from the text below alone; run no commands and read no files.\n\n' + text);
  });
}
// OpenAI's API directly (Responses API, strict JSON schema). Untested here: no key in this environment.
async function viaOpenai(text) {
  const res = await fetch('https://api.openai.com/v1/responses', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + process.env.OPENAI_API_KEY },
    body: JSON.stringify({ model: MODEL, instructions: SYSTEM, input: text, reasoning: { effort: EFFORT }, text: { format: { type: 'json_schema', name: 'ruling', strict: true, schema: SCHEMA } } }) });
  const j = await res.json();
  if (!res.ok) throw new Error('OpenAI: ' + ((j.error && j.error.message) || res.status));
  return JSON.parse(j.output.filter(o => o.type === 'message').map(o => o.content.filter(c => c.type === 'output_text').map(c => c.text).join('')).join(''));
}
const mock = body => ({ replies: Object.keys(W.TABLES).filter(k => (body.orders[k] || '').trim()).map(k => ({ table: k, by: 'Canned reply, ' + W.TABLES[k], aim: '', did: 'The order is being carried out.', quote: 'It is done. It will cost more than you think.' })),
  picture: '', ops: body.state.ops || [], facts: body.state.facts || [], chances: [], updates: null, ruling: Object.assign({}, W.DEFAULT, { train: 0.5, secure: 0.5 }), note: 'Mock game master: no model was asked.' });

// The second writer. The game master decides what each speaker says; this model only makes it sound like that person. GM_VOICE=off skips it.
const VOICE_MODEL = process.env.GM_VOICE || 'claude-fable-5-2';
const VOICE_SYSTEM = `You write dialogue for a tabletop exercise about American AI policy in 2027 and 2028. Thirty people in a room play the US government. After each round they hear short spoken lines from fictional officials: senators, agency heads, lab chief executives, Chinese officials. Another writer has already decided what each person says. You are given, for each line, who is speaking, what the room ordered, a draft of the plain statement of what is now happening (shown on screen above the line), and a draft of the line. You rewrite both: the statement so it is plain, and the line so it sounds like that person saying it out loud.

The drafts are accurate but sound written: tidy, explicit, symmetrical. Real officials do not talk like that. Write what you would hear if you were on the call.

- A senator or committee chair never lays out a deal as a deal. They talk about their members, where the votes are, what colleagues back home will ask, what would make this an easier lift. They are warm, they hedge, they commit to as little as they can. The listener works out the price from what they say they need.
- An agency head or general reports like someone who will be held to it later: what is under way, who has it, what they cannot yet vouch for. Flat and institutional. They caveat rather than dramatize.
- A lab chief executive is smooth and sure of themselves, agrees in principle, resists on specifics, and always has the competitors and China in mind.
- Chinese officials speak in the formal register of a foreign ministry, as if translated: the Chinese side, principles, mutual respect, what the United States should do. They are never blunt and never chatty. A lab chief or a general does not sound like them.
- Anyone may start mid-thought, repeat a word, or trail into a qualification. Nobody delivers a closing line.

Hold to these:
- How likely something sounds in the draft is part of its substance: a line that was doubtful stays doubtful, one that was confident stays confident. It does not need a stated estimate.
- Keep the substance. Every fact, condition, date and estimate of likelihood in the draft must still be there for an attentive listener, even if it is now said sideways. Add no fact, promise, threat or number that the draft does not have. If the draft refuses, the line refuses; if it agrees, the line agrees.
- The statement on screen (did) is not speech. It is one or two flat sentences, 30 words at most, saying literally what the government has now done because of the order, what has not happened, and when to expect the rest if the draft says. Name who wants what in ordinary words: not "a bill needs a price" but "senators want hearings or tighter chip limits before they vote". No figures of speech, no semicolons, no advice. Keep every fact of its draft.
- The statement already says what happened in so many words, so the spoken line does not have to. It must not contradict it.
- It is heard once by people who are not specialists. Ordinary words. No acronyms beyond NSA, CIA and the like. No jargon the draft did not use.
- Nothing that sounds like a slogan, a proverb, a movie or an essay. No commands to the room. No neat pairs or threes, no sentence built for effect, no dashes or semicolons.
- No percentages. Time in months, seasons or dates. Never the words turn, round, period, level, dial, ruling, game.
- Two to four sentences. 60 words is a hard limit for each line; count them, and cut detail before you go over.
- The room hears the replies first, then the outcomes listed after them, then the two updates last. The drafts of the updates were written before those outcomes were known. Rewrite each update so it fits everything the room has just heard: if a pause was signed, a law passed, an attack failed, a warning came from a lab's safety team or Beijing's position changed, the speaker speaks as someone who knows it, in their own way, and never as if it had not happened. Do not repeat an outcome's news; react to it. Keep the rest of the draft's substance.
- A reply was written before its outcome was rolled. It may sound hopeful about something that then failed; leave that, since it was the honest expectation. But if a reply states as a present fact something an outcome below contradicts (nothing found, then a finding; a thing done, then not done), rewrite that clause so it no longer claims it, keeping the reply's tone and how likely things sound.
- Do not reuse a phrase from last turn's updates.
Return, in the order given, each statement and its line, then the Beijing update and the labs update if there were any (empty strings if not).`;
const VOICE_SCHEMA = { type: 'object', additionalProperties: false, required: ['replies', 'beijing', 'labs'], properties: { replies: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['did', 'quote'], properties: { did: { type: 'string' }, quote: { type: 'string' } } } }, beijing: { type: 'string' }, labs: { type: 'string' } } };
function voiceCall(text) {
  if (BACKEND === 'sdk') { const m = require('@anthropic-ai/sdk'), Anthropic = m.default || m;
    return new Anthropic().messages.create({ model: VOICE_MODEL, max_tokens: 4000, system: VOICE_SYSTEM, messages: [{ role: 'user', content: text }], output_config: { effort: 'low', format: { type: 'json_schema', schema: VOICE_SCHEMA } } })
      .then(res => { if (res.stop_reason !== 'end_turn') throw new Error('stopped (' + res.stop_reason + ')'); return JSON.parse(res.content.filter(b => b.type === 'text').map(b => b.text).join('')); }); }
  return new Promise((resolve, reject) => {
    const p = spawn('claude', ['-p', '--model', VOICE_MODEL, '--effort', 'low', '--system-prompt', VOICE_SYSTEM, '--json-schema', JSON.stringify(VOICE_SCHEMA), '--output-format', 'json', '--tools', '', ...BARE], { cwd: require('os').homedir(), stdio: ['pipe', 'pipe', 'pipe'] });
    let out = ''; const t = setTimeout(() => { p.kill(); reject(new Error('timed out')); }, 60000);
    p.stdout.on('data', d => out += d); p.on('error', reject);
    p.on('close', () => { clearTimeout(t); try { const j = JSON.parse(out); resolve(j.structured_output || JSON.parse(j.result)); } catch (e) { reject(new Error(out.slice(0, 200) || 'no output')); } });
    p.stdin.end(text);
  });
}
// Rewrites the quotes in place; on any failure the game master's own wording stands.
async function voice(out, body, next) {
  const up = out.updates || {}, R = out.replies || [], log = body.state.log || [], prev = log.length && log[log.length - 1].updates && log[log.length - 1].updates.beijing && log[log.length - 1].updates.labs ? log[log.length - 1].updates : null;
  if (!R.length) return;
  const text = R.map((r, i) => (i + 1) + '. Speaker: ' + r.by + '\n   The ' + W.TABLES[r.table] + ' ordered: ' + String(body.orders[r.table] || '').slice(0, 600) + '\n   Draft statement: ' + (r.did || '') + '\n   Draft line: ' + r.quote).join('\n\n') +
    (next && next.length ? '\n\nWhat the room reads after these lines and before the two updates, in this order (settled outcomes, written by others; do not rewrite them):\n' + next.map(e => '- ' + e.title + ': ' + String(e.text || '').replace(/"/g, '')).join('\n') : '') +
    (prev ? '\n\nLast turn\'s updates, already heard (do not reuse their phrases):\n- Beijing: ' + prev.beijing.quote + '\n- The labs: ' + prev.labs.quote : '') +
    (up.beijing ? '\n\nBeijing update, public. Speaker: ' + up.beijing.by + '\n   Draft: ' + up.beijing.quote : '') + (up.labs ? '\n\nLabs update, a private note to the President. Speaker: ' + up.labs.by + '\n   Draft: ' + up.labs.quote : '');
  const t0 = Date.now();
  try {
    const v = await voiceCall(text), ok = q => typeof q === 'string' && q.trim().length > 20;
    if (!Array.isArray(v.replies) || v.replies.length !== R.length || !v.replies.every(x => x && ok(x.quote))) throw new Error('wrong shape');
    R.forEach((r, i) => { r.draft = r.quote; r.quote = v.replies[i].quote.trim(); if (r.did && ok(v.replies[i].did)) { r.didDraft = r.did; r.did = v.replies[i].did.trim(); } });
    if (up.beijing && ok(v.beijing)) { up.beijing.draft = up.beijing.quote; up.beijing.quote = v.beijing.trim(); }
    if (up.labs && ok(v.labs)) { up.labs.draft = up.labs.quote; up.labs.quote = v.labs.trim(); }
    VSECS.push((Date.now() - t0) / 1000); out.voice = VOICE_MODEL + ' ' + Math.round((Date.now() - t0) / 100) / 10 + 's';
  } catch (e) { out.voice = 'voice pass failed, drafts kept: ' + e.message; console.error(out.voice); }
}
const WANT = process.env.GM || 'claude';
if (WANT === 'openai' && !(process.env.OPENAI_API_KEY && MODEL)) throw new Error('GM=openai needs OPENAI_API_KEY and GM_MODEL in the environment; GM=codex uses the codex login instead.');
const BACKEND = ['mock', 'codex', 'openai'].includes(WANT) ? WANT : process.env.ANTHROPIC_API_KEY ? 'sdk' : 'cli';
const ASK = { sdk: viaSdk, cli: viaCli, codex: viaCodex, openai: viaOpenai };

// What the server is doing right now, for the page's waiting screen (GET /status).
let NOW = null;
const CHARS = [], VSECS = [], mean = (a, d) => a.length ? a.reduce((x, y) => x + y, 0) / a.length : d;
// Share of the whole wait that is behind us: the answer's length so far against earlier answers, then the second writer's time. null when the backend does not stream.
function status() {
  if (!NOW) return { stage: 'idle' };
  const voiced = VOICE_MODEL !== 'off', cut = voiced ? 0.7 : 0.97;
  const frac = NOW.stage === 'voice' ? cut + (0.98 - cut) * Math.min((Date.now() - NOW.t1) / 1000 / mean(VSECS, 16), 1) : NOW.chars ? 0.08 + (cut - 0.08) * Math.min(NOW.chars / mean(CHARS, 6500), 1) : null;
  return { stage: NOW.stage, step: NOW.stage === 'voice' ? 'voice' : NOW.step || '', frac, secs: (Date.now() - NOW.t0) / 1000 };
}
async function gm(body) { NOW = { stage: 'ruling', t0: Date.now() }; try { return await gm1(body); } finally { NOW = null; } }
const missing = (out, body) => Object.keys(W.TABLES).filter(k => (body.orders[k] || '').trim() && !(out.replies || []).some(r => r.table === k && (r.quote || r.did)));
async function gm1(body) {
  const t0 = Date.now(); let out = BACKEND === 'mock' ? mock(body) : await ASK[BACKEND](prompt(body));
  // a table that wrote an order and got no reply would have no card: ask once more, and keep the fuller answer
  const miss = missing(out, body);
  if (miss.length && BACKEND !== 'mock') {
    if (NOW) { NOW.step = ''; NOW.chars = 0; }
    let again = null; try { again = await ASK[BACKEND](prompt(body) + '\n\nYour last answer gave no reply to: ' + miss.map(k => W.TABLES[k]).join(', ') + '. Every table that wrote an order must get a reply.'); } catch (e) { console.error('second ask failed: ' + e.message); }
    if (again && missing(again, body).length < miss.length) out = again;
    out.retry = 'asked again: no reply to ' + miss.join(', ') + (missing(out, body).length ? '; still missing ' + missing(out, body).join(', ') : '');
    console.error(out.retry);
  }
  out.ruling = W.rule(body.state, Object.assign({}, out.ruling, { ops: out.ops, facts: out.facts, chances: out.chances, says: { beijing: !!(out.updates && out.updates.beijing && (out.updates.beijing.quote || '').trim()) } })); delete out.ops; delete out.facts; delete out.chances;   // the page and the ledger read them from the ruling
  // the dice are seeded by game and turn, so playing the turn on a copy shows what the room will read after the replies; the second writer fits the updates to it
  let next = []; try { next = W.play(JSON.parse(JSON.stringify(body.state)), out.ruling).filter(e => e.title !== 'From Beijing' && e.title !== 'From the labs'); } catch (e) { console.error('could not preview the turn: ' + e.message); }
  if (BACKEND !== 'mock' && VOICE_MODEL !== 'off') { if (NOW) { NOW.stage = 'voice'; NOW.t1 = Date.now(); } await voice(out, body, next); }
  out.backend = BACKEND + (MODEL ? ' ' + MODEL : ''); out.secs = Math.round((Date.now() - t0) / 100) / 10;
  return out;
}

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json' };
if (require.main === module) http.createServer((req, res) => {
  // The public page (thescramble.pages.dev/situationroom) calls this server on the facilitator's laptop, so that origin may read /gm.
  const site = /^https:\/\/([a-z0-9-]+\.)?thescramble\.pages\.dev$/.test(req.headers.origin || '') ? { 'Access-Control-Allow-Origin': req.headers.origin, 'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Allow-Private-Network': 'true', Vary: 'Origin' } : {};
  const send = (code, type, data) => { res.writeHead(code, Object.assign({ 'Content-Type': type + '; charset=utf-8', 'Cache-Control': 'no-store' }, site)); res.end(data); };
  if (req.method === 'OPTIONS' && (req.url === '/gm' || req.url === '/status')) return send(204, 'text/plain', '');
  if (req.method === 'GET' && req.url === '/status') return send(200, 'application/json', JSON.stringify(status()));
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

module.exports = { gm, prompt, voice, SYSTEM, SCHEMA, BACKEND, ASK };
