# Coordination

The integrator keeps this file current: open branches, batches, and who reports what to Peter. Process rules are in CLAUDE.md.

## Current baseline

Measure against these with `node sim/compare.js <genome>` (4,000 games from seed 900000).

- Rules: main at 6b54475 (v38 batch: launch-backing; v37 added fun events and theft-rsi). Genomes: v38, 7 runs at 1200 x 150 from the best v37 genomes (N: small change). compare.js: main 771.1 / 730.4; hawk on the old pin 663.3 / 647.4; dove 767.0; together 670.0 / 659.9 (each ± 4.8-5.6). Measure branches against sim/v38_run0.json (771.1; it kept its v37_run0 start, as did dove0 and together0). Dove minus old-pin hawk: 103.7 with v38hawk_run0 (v37: 109.6, accepted AK 5 Nov). launch-backing off on the best genomes: main -1.0 ± 1.6, dove -0.2 ± 1.6, hawk -7.0 ± 3.2, together -5.4 ± 3.1. v37 credit (variant minus v37): theft-rsi all off +46.0 / +34.3 / +38.2 / +55.7; fun 0 -9.9 / -9.4 / -24.9 / -22.3. True hawk since Peter's J (5 Nov, hawk-sl4 fd207e9, 98): PIN polFirst SL4 > distill > remote > chips > smuggle, rest free (the HAWK pin in sim/v38hawk2_run*.json). v38hawk2: 615.5 / 583.9 / 628.9 (± 4.8-5.3), SL4+ in 92-95% of games; dove minus true hawk 138.1 with v38hawk2_run2 (old-pin hawk: 103.7). TUNE, the engine API, GENES, expertGenome and exports are one entry per line since 58d9b5b: add a new key on its own line. Since e5e44e2 each search run keeps its start when the start beats the final on 4000 held-out games (seeds 700000+); Peter kept that rule (D, 22 Oct).
- Search size (Peter's N, 22 Oct): a big rule change (best genome moves more than ~30 points) gets all 13 runs; a small one (a gene or two) gets 2 main, 1 dove, 2 hawk, 2 together. Over v32-v33, main and dove gained +2.7 per run on held-out games (9 of 14 runs kept their start); hawk and together gained +19.6 per run (3 of 12 kept their start). v34 (a big change) gained more: main and dove +11.2 per run (1 of 7 kept its start), hawk and together +25.1.
- Fitness: mean score (since 3dea930). Report mean score ± SE first, Phase 2 second.
- Fun events and p(doom) (0410be7, 29 Oct, landed by scramble-game-86 on Peter's F while no integrator ran): 22 events (m_* movement, w_* world) at TUNE.fun 0.35 a turn, on their own hash01 draws; IC p(doom) in the side panel (display only, refit with sim/doom.js after rule changes). Taken in by v37. fun 0 on v36: run0 -8.0 ± 3.5, dove0 -9.6 ± 3.5, hawk2_run2 -16.9 ± 4.4, together0 -19.7 ± 4.1; the next search takes them in. f8c8761 fixes a browser crash in draw() (module.exports) from 83573e4.
- Theft and security (theft-rsi, 3 Nov, landed by scramble-game-98 on Peter's H): theftRsi 1.5 (no-deal theft attempts x(1 + 1.5 x^4) on the way to the threshold), stealDeal 0.6 (Beijing deals less while it could steal), slCost 1 (SL4: 3 capital, 2 actions, drag 0.08, labs -12; SL5: 2 capital, drag 0.20 from 0.40, labs -28). All three off on the v36 genomes: run0 +46.0 ± 5.4, dove1 +78.1 ± 5.4, hawk2_run2 +103.4 ± 5.5, together0 +55.7 ± 6.1; taken in by v37 (98 reports SL rates).
- Cores (b270761, 25 Oct, landed by playground-e9 on Peter's OK while no integrator ran): after the search lock, hillclimb.js takes its workers from `cpu-slots`, the machine-wide pool. A search gets at most 8 of the 12 slots (Peter's N2, 25 Oct), so it runs 8 workers (was 12) and takes about 1.5x as long; genomes are unchanged (a 2-gen test gave identical genomes at NW=2 and NW=6).

## Batches

| Batch | Branches | Owner sessions | Peter's decision |
|---|---|---|---|
| v39 (open; v39-candidate) | sl4-action (98, 5381016): sl4Need 1; ctrlUsDrag 0, ctrlLabs 2, ctrlWho 1. theft-prescr (53, b4a9f3a, cherry-picked as aa1938f): theftPreScr 0.8. On the combined candidate, theftPreScr 1 minus on: v38_run0 -5.7 ± 2.0, dove0 -9.4 ± 2.1, hawk2_run2 -9.5 ± 2.5, together0 -8.9 ± 2.0. Small search under N; hawk from v38hawk2 | 98, 53 | Peter's word via 98 and 53; blocked on 98 (ctrlWho); AQ pending |
| v38hawk2 (landed; 3 runs 6:35p-6:58p 5 Nov at fd207e9, every run beat its start: +13.4 / +19.7 / +105.6 held-out) | hawk-sl4 (98, sim/strategy.js only): polFirst pin, true hawk SL4 > distill > remote > chips > smuggle, rest free; 3 hawk-only runs at 1200 x 150 | 98; integrator | J (Peter, via 98); AO yes; AP: v39 sl4-action next, hawk from v38hawk2 |
| v38 (landed; search 5:20p-6:27p 5 Nov at 6b54475; 7 runs per N from the best v37 genomes; 4 of 7 kept their start) | launch-backing (b8): the President refuses a Phase 1 launch under 12 projected pacing support; a pause under 12 gets one deadline month, then breaks. Off: launchBacking 0, supportGrace 0. On minus off: v37_run0 +1.0 ± 1.6, v37dove_run0 +0.2 ± 1.6 (integrator reproduced run0) | b8 | A, B, C1, D1, E1 (via b8); AN: v38 go, 7 runs |
| v37 (landed; search 5:20p-7:35p 3 Nov at d771189, starts: each group's v36 genomes, hawk from v36hawk2_run2; 6 of 13 runs kept their start) | fun events and p(doom) (0410be7, on main since 29 Oct) and theft-rsi (98: theftRsi 1.5, stealDeal 0.6, slCost 1). ui-popups (b8, ec5adaa) and ui-patience (b8, e2f9031) landed on main without a search: UI only | 98; integrator checks fun (owner 86 ended) | H (theft-rsi), E (theftRsi 1.5 smooth); E: v37 go, 13 runs |
| v36hawk2 (done; v36hawk2_run2 committed) | hawk-only follow-up (AM), 3 runs from the v36 hawk genomes: run2 662.9 -> 688.8 held-out (compare.js 686.9 ± 5.3); runs 0 and 1 kept their starts (dropped). Hawk pins cost the main genome -253.5 at v36 vs -230.7 at v35 | integrator | AK diagnose, then accept (gap 104.5; recheck at next search); AM yes |
| v36 (landed 7cfb12f) | luck-f (0734a90 + walkMid, 1e): situ 1, dpaStick 1, spreadT 0.7 / spread 0 / spreadRead 1, gene labMeet, walkMid -40 / walkScale 20 | 1e | H, I, J; AH |
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

War and Taiwan: 12 (closed). Offers, threats, the deal and together: 9c (ended 21 Oct). Open weights and markets: 44 (ended). Misuse, principals' asks and events: f3 (ended). Beijing levers outside the deal: 07. Senate and midterms: c7 (closed; v30 baseline: never flip -14.7 / -22.4, always flip +8.4 / +10.0 on run0 / dove_run1). Luck and variance: 1e (closed 23 Oct, L1; branches removed). Search, merges, hawk/dove and no-deal analysis: integrator (df, since 3 Nov; was 39, ea). Topics whose owner has ended: the integrator checks them at each candidate (diff review, compare.js knobs off and on); a deal change with no off switch goes to Peter (K1, 21 Oct).

## Who reports what to Peter

Each owner reports its own mechanism's results, measured with compare.js on the batch genomes. The integrator reports search results, hawk against dove, and per-branch credit (each branch's change switched off on the winning genome).
