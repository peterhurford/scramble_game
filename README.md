# The Scramble

A strategy game about the moment the US decides to pace frontier AI. You are the President's AI Czar. You have until the end of 2028 to get the government in position, call the pause when the warning signs say it is time, hold it against the courts, the labs and Congress, and bring Beijing into a verified agreement before anyone builds an AI that improves itself out of control.

The game is built from "The Scramble: getting in position to pace the frontier" and the AIPI pacing concept note (v3). The people and companies are fictional; the places, mechanisms and numbers follow the note.

Play it at [thescramble.pages.dev](https://thescramble.pages.dev).

## Two games

**AI Czar** is the full single-player game. Open `index.html` in a browser; there is nothing to build or install. It saves to the browser after every move.

**The Situation Room** is a shorter version for a room of people split into three tables: the Executive Office of the President; State, Commerce and Treasury; and the Department of War with the intelligence community. Each turn every table says what it does in a sentence, and a facilitator types it in. Claude plays everyone else (the labs, Congress, Beijing) and rules on what happens. To run it:

```
node room/gm.js
```

then open http://localhost:8787. The game master uses the `claude` command line tool you are logged in to. To use the API instead, set `ANTHROPIC_API_KEY` and run `npm install` in `room/`. Other backends are listed at the top of `room/gm.js`.

## What is in here

| Path | What it is |
|---|---|
| `engine.js` | The whole AI Czar simulation. No browser needed, so the bots can play it in node. Every tunable number is in `TUNE`, with its sources in the comments. |
| `ui.js`, `index.html` | The AI Czar interface. |
| `room/world.js`, `room/live.html`, `room/gm.js` | The Situation Room: the rules, the page and the game master. |
| `room/replay.js` | Replays a recorded room game and writes a page explaining why each turn went as it did. |
| `room/index.html`, `room/engine.js`, `room/sim.js` | An earlier Situation Room where tables picked moves from a menu. Not on the site. |
| `site/index.html` | The public front page. |
| `sim/` | Bots that play AI Czar, and the tools that measure and search strategies. |

## Bots and balance

The game is balanced by having bots play it thousands of times. A bot's strategy is a "genome", a JSON file of choices that `sim/strategy.js` plays out. The current best genomes and their scores are listed in `COORDINATION.md`.

| Command | What it does |
|---|---|
| `node sim/compare.js <genome.json>` | The standard measurement: mean score over 4,000 fixed games. Use this to compare a rule change before and after. |
| `node sim/narrate.js <genome.json>` | Writes `sim/playbook.md`: the strategy in plain English, and one game turn by turn. |
| `node sim/trace.js [seed] [bot]` | One game, turn by turn. |
| `node sim/playtest.js [games] [difficulty] [bot]` | Plays the hand-written bots and prints how their games ended. |
| `node sim/hillclimb.js` | Searches for a better genome. Takes hours; read `CLAUDE.md` before starting one. |

The other scripts in `sim/` are one-off analyses. Each says what it does and how to run it in its first lines.

## Testing

- `node sim/fuzz.js` plays 3,000 random games and exits 1 if the game state ever breaks a rule. Run it after any change to `engine.js`.
- `index.html#autotest` plays random games through the real interface and sets `body[data-test]` to PASS or FAIL.
- `index.html#demo-p0` (also `-scramble`, `-p1`, `-end`, `-vote`, `-event`, `-strait`, `-blockade`, `-war`) jumps a fixed game to that point, for screenshots.

## The site

thescramble.pages.dev is a Cloudflare Pages site assembled by hand from these files:

| On the site | From the repo |
|---|---|
| `index.html` | `site/index.html` |
| `aiczar.html`, `engine.js`, `ui.js` | `index.html`, `engine.js`, `ui.js` |
| `situationroom.html`, `world.js` | `room/live.html`, `room/world.js` |

The Situation Room page on the site still needs `node room/gm.js` running on the facilitator's laptop; the page calls it at localhost:8787.

## Working on it

Several Claude sessions work in this repo at once. `CLAUDE.md` has the rules (worktrees, who merges to `main`, how to measure) and `COORDINATION.md` has the current baseline and open work.
