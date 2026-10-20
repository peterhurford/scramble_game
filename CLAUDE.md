# Working in this repo with other sessions

Several Claude sessions often work here at once.

- **Work in your own git worktree** on a branch off `main` (`git worktree add ../scramble_<topic> -b <topic>`), never in the main checkout. The main checkout only receives rebased, committed work.
- **The integrator session owns `main` and the strategy search.** Who it is goes in the line below; when a feature is ready, rebase your branch onto `main` and message the integrator with the branch name and what changed. The integrator merges, batches rule changes, and runs one search per batch.
  - Integrator: `scramble-game-ee` (`#bc78`), since 20 Oct 2026.
- **Searches**: run `sim/hillclimb.js` with `RUNS=0,1,2` (one process, so the code can't change mid-search) and `OUT=sim/v<N>` (named outputs, never `best_genome.json`). `sim/.search.lock` queues a second search behind the first; don't start one around it.
- **Genomes carry a `_rules` stamp** (hash of `engine.js` and the gene list, plus the commit). `S.loadGenome` warns when the rules have changed since a genome was searched; treat its numbers as stale and say so.
