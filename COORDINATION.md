# Coordination

The integrator keeps this file current: open branches, batches, and who reports what to Peter. Process rules are in CLAUDE.md.

## Current baseline

Measure against these with `node sim/compare.js <genome>` (4,000 games from seed 900000).

- Rules: main at cc6a1d1 (v30 batch). Genomes: v30, committed in beb00dd. compare.js: run0 694.4, run1 620.1, run2 640.0, run3 683.8; true hawk (ctrlLate pinned) 553.2 / 588.5 / 597.9; dove 633.5 / 686.3 / 667.0; together 557.3 / 529.6 / 481.7 (each ± 5.3-6.0). Measure branches against sim/v30_run0.json (best unrestricted). TUNE, the engine API, GENES, expertGenome and exports are one entry per line since 58d9b5b: add a new key on its own line.
- Fitness: mean score (since 3dea930). Report mean score ± SE first, Phase 2 second.

## Batches

| Batch | Branches | Owner sessions | Peter's decision |
|---|---|---|---|
| v27 (landed 2cc5967) | senate-midterms, openweights | c7, 44 | ED: open weights measured without loosethr |
| v28 (landed 7b98fb5) | cut-guard-ultimatum, loosethr, flavor, institute-cost, leverage, senate-odds, senate-probes | 44, f3, 9c, 07, c7 | EE: one batch; M: institute at TUNE.inst default; EX: hawk and dove with RUNS=0,1,2, one main run started from the dove |
| v28 (landed 7b98fb5) | "Only together" search (PIN seq=together, gofirstIc=0), sim/v28together_run* | 9c reports | T |
| v30 (landed beb00dd) | fr (d5faa8e): controls' heat x0.5, markets +1, hawks +3; China compute weight 0.4 as a slope (07's M); gene ctrlLate; hawk runs pin ctrlLate | integrator; 07 verifies M | FR, GL, GM, GR, GT, GA, GQ: start when v29 lands |
| v29 (landed 6f358c7) | probe-free (e60eac1), cut-ratchet (eb984e8), markets (fff3f4f, mktCred 0.8) | c7; 44 | F: investigation uses no action, salience +8; cut the ratchet action and ratchetGap gene; markets move credibility, softer capital hit, larger Senate and support effects |

## Open branches and what they touch

| Branch | Session | Touches |
|---|---|---|
| markets2 (e2d790e, queued for v31) | 44 | markets: mktCred 0.8 to 1.3; marketNews line (hash01, play unchanged) |
| cabinet (36eca18, queued for v31) | f3 | principals: standing tiers, cabinet odds, pact cost, event us_defect; Treasury tier moves markets. TUNE.pactWorth 0.25 is pending Peter (set 1 in the candidate if unanswered; touches 9c deal acceptance). One-line conflict with markets2 at the askAge tick (keep both) |

Shared mechanisms to watch: loss-of-control hazards (loosethr, flavor and openweights), theft attempts (leverage and the P2 cheatSteal term), Senate votes (institute-cost and senate-*).

## Topic owners

War and Taiwan: 12 (closed). Offers, threats and the deal: 9c. Open weights and thresholds: 44. Misuse, principals' asks and events: f3. Beijing levers outside the deal: 07. Senate and midterms: c7 (closed; v30 baseline: never flip -14.7 / -22.4, always flip +8.4 / +10.0 on run0 / dove_run1). Search, merges, hawk/dove and no-deal analysis: integrator (ee).

## Who reports what to Peter

Each owner reports its own mechanism's results, measured with compare.js on the batch genomes. The integrator reports search results, hawk against dove, and per-branch credit (each branch's change switched off on the winning genome).
