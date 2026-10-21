# Coordination

The integrator keeps this file current: open branches, batches, and who reports what to Peter. Process rules are in CLAUDE.md.

## Current baseline

Measure against these with `node sim/compare.js <genome>` (4,000 games from seed 900000).

- Rules: main at 2cc5967 (open weights + Senate midterms). Genomes: v27, committed in 2cc5967. compare.js: run0 642.8 ± 5.5, run1 647.8 ± 5.7, run2 618.3 ± 5.8, hawk 632.6 ± 5.7, dove 661.7 ± 5.5. Measure branches against sim/v27_run1.json (best unrestricted).
- Fitness: mean score (since 3dea930). Report mean score ± SE first, Phase 2 second.

## Batches

| Batch | Branches | Owner sessions | Peter's decision |
|---|---|---|---|
| v27 (landed 2cc5967) | senate-midterms, openweights | c7, 44 | ED: open weights measured without loosethr |
| v28 (candidate branch v28-candidate, awaiting owners' OK) | cut-guard-ultimatum, loosethr, flavor, institute-cost, leverage, senate-odds, senate-probes | 44, f3, 9c, 07, c7 | EE: one batch; M: institute at TUNE.inst default; EX: hawk and dove with RUNS=0,1,2, one main run started from the dove |
| after v28 | "Only together" search (PIN seq=together, gofirstIc=0) | 9c reports | T |
| after v28 | split TUNE, exports, GENES and expertGenome to one entry per line | integrator | EV |

## Open branches and what they touch

| Branch | Session | Touches |
|---|---|---|
| loosethr | 44 | usRates (thGrowth), hazards, TUNE.growRisk |
| flavor | f3 | misuse layer, sovereign agents scaling TUNE.openHaz, ASKS/currentAsk, 23 events, genes proj.cyberdef/synth, pol.kyc, o.misuse |
| institute-cost | 9c | TUNE.inst, senateParts, deal term institute |
| cut-guard-ultimatum | 9c | removes guard action, ultimatum term, genes guard/ultLead |
| leverage | 07 | actions reassure/redline, straitPre, theft attempts, genes reassure*/redline*, ev.redline_due |
| senate-odds, senate-probes | c7 | midterms flip logistic, probe event and action, genes probeSup, ev.probe |

Shared mechanisms to watch: loss-of-control hazards (loosethr, flavor and openweights), theft attempts (leverage and the P2 cheatSteal term), Senate votes (institute-cost and senate-*).

## Topic owners

War and Taiwan: 12 (closed). Offers, threats and the deal: 9c. Open weights and thresholds: 44. Misuse, principals' asks and events: f3. Beijing levers outside the deal: 07. Senate and midterms: c7. Search, merges, hawk/dove and no-deal analysis: integrator (ee).

## Who reports what to Peter

Each owner reports its own mechanism's results, measured with compare.js on the batch genomes. The integrator reports search results, hawk against dove, and per-branch credit (each branch's change switched off on the winning genome).
