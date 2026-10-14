# The Scramble

A strategy game about advising the President through the moment the US decides to pace frontier AI. Built from "The Scramble: getting in position to pace the frontier" and the AIPI pacing concept note (v3). People and companies are fictional; places, mechanisms and numbers follow the note.

Open `index.html` in a browser. The game saves to localStorage after every move.

## Files

- `engine.js`: the whole simulation (state, actions, events, China, labs, endings). No DOM; runs in node.
- `ui.js`, `index.html`: rendering only.
- `sim/playtest.js [games] [difficulty] [bot]`: plays scripted strategies (random, expert, hawk, hawksec, hawkpure, passive, early, noprep, reader, noauto, dpa, nosec, sl4only) and prints the endings.
- `sim/trace.js [seed] [bot]`: one game, turn by turn.
- `sim/loc.js [bot]`: breaks down what the bot's losses came from.
- `sim/levers.js`: months for China to catch a paced frontier under each lever.
- `sim/strategy.js`: a strategy with 132 adjustable choices; its default settings reproduce the scripted expert.
- `sim/hillclimb.js [gens] [games] [difficulty] [run]`: searches for better settings on 12 CPU cores and checks the winner on 4,000 fresh games. Compare rule changes using the average of 3 runs; single runs vary by about ±1.5 points.
- `sim/narrate.js [genome.json]`: writes `sim/playbook.md`, which describes a strategy in plain English, says what each choice is worth, and walks through one game turn by turn.
- `sim/ablate.js`, `sim/uae.js`, `sim/hostile.js`: one-off analyses (what each choice is worth, the UAE choice, credibility lost to hostile principals).

Tunables for the UAE event and the President's hawk bias (`hawkBase`, `hawkProvoke`, `hawkRace`) live in `TUNE` in `engine.js`.

`index.html#autotest` plays random games through the real UI and sets `body[data-test]` to PASS or FAIL. `#demo-p0`, `#demo-scramble`, `#demo-p1` and `#demo-end` fast-forward a seeded game for screenshots.

## Model in one paragraph

Capability is in months of US frontier progress. Unpaced labs gain 1.0/month, minus "drag" from our own moves (SL4 8% or SL5 20% instead, control protocols 5%, chip and cloud rules 1.5–3%, mineral curbs and Strait disruption while they last). Drag also lowers the markets' resting level and the labs' goodwill. Paced labs gain 0.12/month with automation limits and 0.40 without. China gains `0.1 + 0.6 × compute + 0.3 × distillation (×0.4 when the US is paced)`. Baseline compute is domestic 45% (tool controls can cut it by up to a fifth), offshore 25%, legal 12%, smuggled 8% and 10% other. Each game hides its own offshore (0.5–1.5× baseline), smuggling (0.4–1.6×) and distillation (60–100%) levels, and a channel no rule covers can grow unannounced (4% a month each). Intelligence quality also scales how far the indicator markers and the IC's standing bias sit from the true threshold (1.2 - 0.8 × quality/100), and Phase 2 needs it at 60 (`TUNE.intelP2`). The Beijing tab shows these as words, ranges or numbers depending on intelligence quality (under 45, 45–69, 70+; an IC assessment counts +20). Weight theft: Beijing attempts in 4.5% of months (×2.2 racing, ×1.3 when the US is paced, ×1.3 when more than 6 months behind); an attempt succeeds 45% at SL3, 18% at SL4 and 4% at SL5. A hidden RSI threshold (lognormal, median 12.5 months out on Advisor) sets the runaway hazard per month for any actor past it: 30% for an uncovered lab, 2% for a covered lab with automation limits, and 15% for China without a deal.
