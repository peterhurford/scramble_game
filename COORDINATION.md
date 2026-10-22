# Coordination

The integrator keeps this file current: open branches, batches, and who reports what to Peter. Process rules are in CLAUDE.md.

## Current baseline

Measure against these with `node sim/compare.js <genome>` (4,000 games from seed 900000).

- Rules: main at aac720c (v34 batch: luck, fuseMean 0.65). Genomes: v34, committed in e494f0e, 13 runs at 1200 games x 150 steps from v33 starts (main run2 from v33dove_run1). compare.js: main 791.9 / 802.9 / 802.1 / 795.2; true hawk 689.9 / 730.5 / 729.0; dove 784.5 / 801.3 / 802.9; together 689.8 / 705.5 / 690.8 (each ± 4.4-5.6). Measure branches against sim/v34_run1.json (802.9, tied with v34dove_run2). Dove minus true hawk: 72.4 (v33: 36.8). Luck off on the best genomes: main -117.2 ± 6.6, dove -133.9 ± 6.9, hawk -90.7 ± 6.6, together -125.6 ± 7.4. TUNE, the engine API, GENES, expertGenome and exports are one entry per line since 58d9b5b: add a new key on its own line. Since e5e44e2 each search run keeps its start when the start beats the final on 4000 held-out games (seeds 700000+); Peter kept that rule (D, 22 Oct).
- Search size (Peter's N, 22 Oct): a big rule change (best genome moves more than ~30 points) gets all 13 runs; a small one (a gene or two) gets 2 main, 1 dove, 2 hawk, 2 together. Over v32-v33, main and dove gained +2.7 per run on held-out games (9 of 14 runs kept their start); hawk and together gained +19.6 per run (3 of 12 kept their start). v34 (a big change) gained more: main and dove +11.2 per run (1 of 7 kept its start), hawk and together +25.1.
- Fitness: mean score (since 3dea930). Report mean score ± SE first, Phase 2 second.

## Batches

| Batch | Branches | Owner sessions | Peter's decision |
|---|---|---|---|
| v35 (batch closed; search running from detached ../scramble_search_v35 at 49c04df) | dpa-cost (49c04df, 1e): walkCompel 3; walkCompel 0 reproduces main. On v34_run1: 767.5 ± 4.8 vs 802.9 ± 4.4, paired -35.4 ± 2.8; expert fill -19.1 ± 3.1. 7 runs (X: 7): main from v34_run1/run2, dove from v34dove_run2, hawk from v34hawk_run1/run2, together from v34together_run1/run2 | 1e OK; integrator | K yes; X: go, 7 runs |
| v34 (landed e494f0e) | luck (aac720c, 1e): spread 0.5, luckFix 0.5, fuse 4, fuseMean 0.65 | 1e | G 0.65; AG; O; no hint change |
| v33 (landed 86b712b) | red line cut (83f7d64, 07): Peter's H, cut the cyber red line; integrator re-measured with --vs-root: run2 +0.0 ± 0.0, dove0 -0.3 ± 1.1, hawk2 +1.9 ± 1.3, together0 +0.4 ± 1.6. W (leverage2 696b443, 07): resolve raises or lowers cheating, theft and the Strait; theft rises with the lead; reassurance from weak resolve emboldens. On minus off: run2 -20.0 ± 3.6, dove0 -11.3 ± 3.4, hawk2 +20.1 ± 3.9, together0 -28.7 ± 3.8; six knobs at 0 reproduce redline-cut | 07; integrator checks the deal-side cheating term (K1) | H; L: W in, on by default; M: v33 go; D no (keep threshold stays: any margin); E: every run at 1200 games x 150 steps; G: close when W handed off |
| v27 (landed 2cc5967) | senate-midterms, openweights | c7, 44 | ED: open weights measured without loosethr |
| v28 (landed 7b98fb5) | cut-guard-ultimatum, loosethr, flavor, institute-cost, leverage, senate-odds, senate-probes | 44, f3, 9c, 07, c7 | EE: one batch; M: institute at TUNE.inst default; EX: hawk and dove with RUNS=0,1,2, one main run started from the dove |
| v28 (landed 7b98fb5) | "Only together" search (PIN seq=together, gofirstIc=0), sim/v28together_run* | 9c reports | T |
| v32 (landed 7320a63) | search setup (HW): main runs 0-1 at 600 games x 300 gens as control, every other run 1200 x 150; cabinet2 (c37dd47, f3): relDrift 0.96, cabHurt 1; pactWorth 0.75 (Peter); candidate 1e371f3 | integrator; f3 | HW yes; P4 (cabinet2, per f3); HI-b 0.75; IA/IB4 and IC: 9c prototypes and measures |
| v31 (landed ce49602) | markets2 (e2d790e) mktCred 1.3 and marketNews; cabinet (36eca18) with pactWorth 1; hillclimb KEEP check on seeds 700000+ | 44, f3 verified e5e44e2 | HH, HI-a, GX; HI-b (pactWorth 0.25) held for v32 |
| v30 (landed beb00dd) | fr (d5faa8e): controls' heat x0.5, markets +1, hawks +3; China compute weight 0.4 as a slope (07's M); gene ctrlLate; hawk runs pin ctrlLate | integrator; 07 verifies M | FR, GL, GM, GR, GT, GA, GQ: start when v29 lands |
| v29 (landed 6f358c7) | probe-free (e60eac1), cut-ratchet (eb984e8), markets (fff3f4f, mktCred 0.8) | c7; 44 | F: investigation uses no action, salience +8; cut the ratchet action and ratchetGap gene; markets move credibility, softer capital hit, larger Senate and support effects |

## Open branches and what they touch

| Branch | Session | Touches |
|---|---|---|
| dpa-cost (49c04df) | 1e | for v35: TUNE.walkCompel 3, walkout compel costs 3 capital (Peter's K); walkCompel 0 reproduces luck; v33dove_run1 -27.3 ± 2.7, expert -19.1 ± 3.1; rebase onto aac720c+ and re-measure on sim/v34_run1.json |

Shared mechanisms to watch: loss-of-control hazards (loosethr, flavor and openweights), theft attempts (leverage and the P2 cheatSteal term), Senate votes (institute-cost and senate-*).

## Topic owners

War and Taiwan: 12 (closed). Offers, threats, the deal and together: 9c (ended 21 Oct). Open weights and markets: 44 (ended). Misuse, principals' asks and events: f3 (ended). Beijing levers outside the deal: 07. Senate and midterms: c7 (closed; v30 baseline: never flip -14.7 / -22.4, always flip +8.4 / +10.0 on run0 / dove_run1). Luck and variance: 1e. Search, merges, hawk/dove and no-deal analysis: integrator (39, since 22 Oct; was ea). Topics whose owner has ended: the integrator checks them at each candidate (diff review, compare.js knobs off and on); a deal change with no off switch goes to Peter (K1, 21 Oct).

## Who reports what to Peter

Each owner reports its own mechanism's results, measured with compare.js on the batch genomes. The integrator reports search results, hawk against dove, and per-branch credit (each branch's change switched off on the winning genome).
