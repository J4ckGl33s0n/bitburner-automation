import assert from "node:assert/strict";
import console from "node:console";
import { performance } from "node:perf_hooks";
import { pathToFileURL } from "node:url";
import { searchGoMove, selectGoMove } from "../home/scripts/go.js";
import { opening, referenceMask, referencePlay, referenceScore } from "./go-reference.mjs";

export async function runBenchmark(seeds = 20) {
  assert.ok(Number.isInteger(seeds) && seeds > 0 && seeds <= 20);
  const start = performance.now();
  let wins = 0;
  let searches = 0;
  let searchMs = 0;
  let cutoffs = 0;
  for (let seed = 0; seed < seeds; seed++) {
    for (const searchColor of ["X", "O"]) {
      let game = opening(seed);
      let ply = 0;
      for (; ply < 100 && game.passes < 2; ply++) {
        const mask = referenceMask(game);
        let move;
        if (game.player === searchColor) {
          const stats = {};
          const before = performance.now();
          move = await searchGoMove(game.board, mask, { player: game.player, komi: game.komi,
            history: game.history, opponentPassed: game.passes === 1, seed: seed * 1000 + ply + 1,
            simulations: 128, now: () => 0, stats });
          searchMs += performance.now() - before; searches++;
          assert.ok(stats.simulations === 128 || stats.simulations === 0, "fixed completed-simulation budget");
        } else {
          const board = game.player === "X" ? game.board : game.board.map(column => column.replace(/[XO]/g, c => c === "X" ? "O" : "X"));
          move = selectGoMove(board, mask);
        }
        const next = referencePlay(game, move);
        assert.ok(next, `illegal ${game.player} action at seed ${seed}, ply ${ply}`);
        game = next;
      }
      if (game.passes < 2) cutoffs++;
      const score = referenceScore(game);
      const won = (score >= 0 ? "X" : "O") === searchColor;
      if (won) wins++;
      console.log(JSON.stringify({ seed, searchColor, won, score, plies: ply, cutoff: game.passes < 2 }));
    }
  }
  const summary = { games: seeds * 2, wins, winRate: wins / (seeds * 2), cutoffs, searches,
    meanSearchMs: Math.round(searchMs / Math.max(1, searches)), elapsedMs: Math.round(performance.now() - start) };
  console.log(JSON.stringify(summary));
  assert.ok(summary.winRate >= 0.60, "search must win at least 60% against the unchanged tactical policy");
  return summary;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await runBenchmark(Number(process.argv[2] ?? 20));
