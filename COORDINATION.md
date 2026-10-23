# Coordination

The integrator keeps this file current: open branches, batches, and who reports what to Peter. Process rules are in CLAUDE.md.

## Current baseline

Measure against these with `node sim/compare.js <genome>` (4,000 games from seed 900000).

- Rules: main at 360e2a5 (v35 batch: dpa-cost, walkCompel 3). Genomes: v35, committed in 92f2772, 7 runs at 1200 games x 150 steps from the best v34 runs (X: 7). compare.js: main 788.5 / 798.8; true hawk 731.7 / 673.2; dove 796.6; together 710.2 / 680.8 (each ± 4.4-5.6). Measure branches against sim/v35_run1.json (798.8). Dove minus true hawk: 64.9 (v34: 72.4). walkCompel 0 on the best genomes: main +0.5 ± 0.3, dove, hawk and together +0.0. TUNE, the engine API, GENES, expertGenome and exports are one entry per line since 58d9b5b: add a new key on its own line. Since e5e44e2 each search run keeps its start when the start beats the final on 4000 held-out games (seeds 700000+); Peter kept that rule (D, 22 Oct).
- Search size (Peter's N, 22 Oct): a big rule change (best genome moves more than ~30 points) gets all 13 runs; a small one (a gene or two) gets 2 main, 1 dove, 2 hawk, 2 together. Over v32-v33, main and dove gained +2.7 per run on held-out games (9 of 14 runs kept their start); hawk and together gained +19.6 per run (3 of 12 kept their start). v34 (a big change) gained more: main and dove +11.2 per run (1 of 7 kept its start), hawk and together +25.1.
- Fitness: mean score (since 3dea930). Report mean score ± SE first, Phase 2 second.

## Batches

| Batch | Branches | Owner sessions | Peter's decision |
|---|---|---|---|
| v36 (open; candidate v36-candidate at 7fb5f66) | luck-f (0eceb05 + 7fb5f66 walkMid -40, walkScale 20; 1e): situ 1, dpaStick 1, spreadT 0.7 / spread 0 / spreadRead 1, gene labMeet (gene list changes, so every stamp changes). Knobs off reproduces main (798.8). v35_run1 722.5 ± 5.2, paired -76.4 ± 5.8 (integrator re-measured); vX36x_run0 790.7 ± 4.6. Full 13 runs under N; main, dove and together start partly from vX36x genomes (scratchpad copies), hawk mostly from v35 | 1e OK at 7fb5f66; integrator | H, I, J (Peter, via 1e); v36 go pending |
| vX36x (exploratory, closed; 1e analysed it, files moved out of main; a candidate may follow) | mech-explore (b75dcd2, 1e): situ 1 + dpaStick 1; 7 unpinned runs, run k from vX35_run<k>, OUT=sim/vX36x; queues behind any real batch | 1e | G (Peter, via 1e) |
| vX35 (exploratory, closed; 1e analysed it, files moved out of main) | mech-explore (cb6402a, 1e): situ 1; 7 unpinned runs from the v35 genomes, OUT=sim/vX35; queues behind any real batch | 1e | C1 (Peter, via 1e) |
| v35 (landed 92f2772) | dpa-cost (360e2a5, 1e): walkCompel 3. Before the search: v34_run1 -35.4 ± 2.8; after it, walkCompel 0 on v35_run1 is +0.5 ± 0.3 | 1e | K yes; X: 7 runs |
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

Shared mechanisms to watch: loss-of-control hazards (loosethr, flavor and openweights), theft attempts (leverage and the P2 cheatSteal term), Senate votes (institute-cost and senate-*).

## Topic owners

War and Taiwan: 12 (closed). Offers, threats, the deal and together: 9c (ended 21 Oct). Open weights and markets: 44 (ended). Misuse, principals' asks and events: f3 (ended). Beijing levers outside the deal: 07. Senate and midterms: c7 (closed; v30 baseline: never flip -14.7 / -22.4, always flip +8.4 / +10.0 on run0 / dove_run1). Luck and variance: 1e. Search, merges, hawk/dove and no-deal analysis: integrator (39, since 22 Oct; was ea). Topics whose owner has ended: the integrator checks them at each candidate (diff review, compare.js knobs off and on); a deal change with no off switch goes to Peter (K1, 21 Oct).

## Who reports what to Peter

Each owner reports its own mechanism's results, measured with compare.js on the batch genomes. The integrator reports search results, hawk against dove, and per-branch credit (each branch's change switched off on the winning genome).
