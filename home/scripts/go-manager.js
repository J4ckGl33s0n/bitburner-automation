import { GO_OPPONENTS, searchGoMove } from "./go.js";

/** @param {import("@ns").NS} ns */
export async function main(ns) {
  if (ns.getHostname() !== "home" || ns.self().threads !== 1 || ns.args.length) {
    ns.tprint("Run /scripts/go-manager.js on home with one thread and no arguments.");
    return;
  }
  if (ns.ps("home").some(p => p.pid !== ns.pid && p.filename.replace(/^\/+/, "") === "scripts/go-manager.js")) {
    ns.tprint("The IPvGO manager is already running.");
    return;
  }
  ns.disableLog("ALL");
  try {
    if (!GO_OPPONENTS.includes(ns.go.getOpponent())) {
      ns.tprint("IPvGO stopped: practice or special board preserved. Choose a normal AI opponent to enable automation.");
      return;
    }
    if (ns.go.getGameState().currentPlayer === "Black" && !ns.go.getMoveHistory().length &&
        ns.go.getBoardState().length !== 5) {
      ns.go.resetBoardState(ns.go.getOpponent(), 5);
    }
    ns.tprint("IPvGO manager started: two-second tree search; resumes normal AI games, then cycles all six opponents on 5x5 boards.");
    while (true) {
      const opponent = ns.go.getOpponent();
      const index = GO_OPPONENTS.indexOf(opponent);
      if (index === -1) {
        ns.tprint("IPvGO stopped: practice or special board preserved.");
        return;
      }
      const state = ns.go.getGameState();
      if (state.currentPlayer === "None") {
        const stats = ns.go.analysis.getStats()[opponent];
        ns.print(`IPvGO ${opponent}: ${state.blackScore >= state.whiteScore ? "win" : "loss"}, score ${state.blackScore}-${state.whiteScore}; wins ${stats?.wins ?? 0}, losses ${stats?.losses ?? 0}, streak ${stats?.winStreak ?? 0}, bonus ${(stats?.bonusPercent ?? 0).toFixed(2)}%.`);
        ns.go.resetBoardState(GO_OPPONENTS[(index + 1) % GO_OPPONENTS.length], 5);
      } else if (state.currentPlayer === "White") {
        await ns.go.opponentNextTurn(false);
      } else if (state.currentPlayer === "Black") {
        const board = ns.go.getBoardState();
        const history = ns.go.getMoveHistory();
        const snapshot = JSON.stringify([opponent, state.currentPlayer, state.komi, state.previousMove, board, history]);
        const stats = {};
        const move = await searchGoMove(board, ns.go.analysis.getValidMoves(), {
          history, komi: state.komi, opponentPassed: state.previousMove === null && history.length > 0,
          yieldControl: () => ns.sleep(0), stats,
        });
        ns.print(`IPvGO search: ${stats.simulations} simulations, ${stats.nodes} nodes, ${stats.elapsedMs} ms.`);
        const fresh = ns.go.getGameState();
        const current = JSON.stringify([ns.go.getOpponent(), fresh.currentPlayer, fresh.komi, fresh.previousMove,
          ns.go.getBoardState(), ns.go.getMoveHistory()]);
        const legal = ns.go.analysis.getValidMoves();
        if (current !== snapshot || move && !legal[move.x]?.[move.y]) {
          ns.print("IPvGO position changed during search; discarding the result.");
          await ns.sleep(100);
          continue;
        }
        if (move) await ns.go.makeMove(move.x, move.y);
        else await ns.go.passTurn();
      } else throw new Error("Invalid IPvGO turn state");
      await ns.sleep(100);
    }
  } catch (error) {
    ns.tprint(`IPvGO stopped: ${String(error)}. Board preserved; resolve the error and rerun the manager.`);
  }
}
