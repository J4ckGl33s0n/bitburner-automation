import assert from "node:assert/strict";
import test from "node:test";
import { GO_OPPONENTS, selectGoMove } from "../home/scripts/go.js";
import { main } from "../home/scripts/go-manager.js";

function board(stones = [], size = 5, fill = ".") {
  const columns = Array.from({ length: size }, () => Array(size).fill(fill));
  for (const [x, y, color] of stones) columns[x][y] = color;
  return columns.map(column => column.join(""));
}

function mask(points, size = 5) {
  return Array.from({ length: size }, (_, x) => Array.from({ length: size }, (_, y) =>
    points === undefined || points.some(p => p[0] === x && p[1] === y)));
}

test("opening, symmetry ties, and API coordinates are deterministic and preserve inputs", () => {
  const state = Object.freeze(board());
  const legal = Object.freeze(mask().map(column => Object.freeze(column)));
  assert.deepEqual(selectGoMove(state, legal), { x: 2, y: 2 });
  assert.deepEqual(selectGoMove(state, mask([[1, 2], [2, 1]])), { x: 1, y: 2 });
  assert.deepEqual(selectGoMove(state, mask([[4, 0]])), { x: 4, y: 0 });
  assert.deepEqual(state, board());
  assert.ok(legal.every(column => column.every(Boolean)));
});

test("captures beat expansion and the legal mask excludes repetition or occupied points", () => {
  const state = board([[2, 1, "O"], [1, 1, "X"], [2, 0, "X"], [2, 2, "X"]]);
  const before = state.slice();
  assert.deepEqual(selectGoMove(state, mask([[3, 1], [0, 4]])), { x: 3, y: 1 });
  assert.deepEqual(selectGoMove(state, mask([[0, 4], [2, 1], [2, 2]])), { x: 0, y: 4 });
  assert.deepEqual(state, before);
});

test("captured groups touching a move twice count once", () => {
  const stones = [[1, 1, "O"], [1, 2, "O"], [2, 1, "O"],
    [1, 0, "X"], [0, 1, "X"], [0, 2, "X"], [1, 3, "X"], [2, 0, "X"], [3, 1, "X"], [6, 1, "X"]];
  for (let y = 2; y <= 5; y++) stones.push([6, y, "O"], [5, y, "X"], [7, y, "X"]);
  assert.deepEqual(selectGoMove(board(stones, 9), mask([[2, 2], [6, 6]], 9)), { x: 6, y: 6 });
});

test("saving atari groups and threatening enemy groups beat quiet expansion", () => {
  const rescue = board([[2, 2, "X"], [1, 2, "O"], [2, 1, "O"], [3, 2, "O"]]);
  assert.deepEqual(selectGoMove(rescue, mask([[2, 3], [0, 4]])), { x: 2, y: 3 });
  const threat = board([[2, 2, "O"], [1, 2, "X"], [2, 1, "X"]]);
  assert.deepEqual(selectGoMove(threat, mask([[3, 2], [0, 4]])), { x: 3, y: 2 });
});

test("connections use distinct friendly groups and liberties rather than adjacent-stone counts", () => {
  const state = board([[1, 2, "X"], [3, 2, "X"]]);
  assert.deepEqual(selectGoMove(state, mask([[2, 2], [1, 3]])), { x: 2, y: 2 });
  const isolated = board([[2, 2, "X"], [1, 2, "X"], [1, 3, "X"],
    [2, 3, "."], [3, 3, "."]], 5, "#");
  assert.equal(selectGoMove(isolated, mask([[2, 3]])), null, "one shared liberty is still self-atari");
});

test("noncapturing self-atari and suicide are rejected but captures may use the last liberty", () => {
  const unsafe = board([[1, 2, "O"], [2, 1, "O"], [3, 2, "O"]]);
  assert.equal(selectGoMove(unsafe, mask([[2, 2]])), null);
  const suicide = board([[1, 2, "O"], [2, 1, "O"], [3, 2, "O"], [2, 3, "O"]]);
  assert.equal(selectGoMove(suicide, mask([[2, 2]])), null);
  const capture = board([[2, 1, "O"], [1, 1, "X"], [2, 0, "X"], [3, 1, "X"],
    [1, 2, "#"], [3, 2, "#"], [2, 3, "#"]]);
  assert.deepEqual(selectGoMove(capture, mask([[2, 2]])), { x: 2, y: 2 });
});

test("controlled friendly territory is preserved unless the move rescues a group", () => {
  const eye = board([[2, 1, "X"], [1, 2, "X"], [3, 2, "X"], [2, 3, "X"]]);
  assert.equal(selectGoMove(eye, mask([[2, 2]])), null);
  const rescue = board([[1, 2, "X"], [2, 2, "."], [3, 2, "."], [2, 3, "."]], 5, "#");
  assert.deepEqual(selectGoMove(rescue, mask([[2, 2]])), { x: 2, y: 2 });
});

test("offline nodes, boundaries, and exhausted legal masks lead to safe moves or passes", () => {
  const state = board([[4, 1, "#"], [2, 2, "#"]]);
  assert.equal(selectGoMove(state, mask([[4, 0], [2, 2]])), null);
  assert.equal(selectGoMove(board(), mask([])), null);
  for (const size of [5, 7, 9, 13]) {
    const middle = (size - 1) / 2;
    assert.deepEqual(selectGoMove(board([], size), mask(undefined, size)), { x: middle, y: middle });
  }
});

test("invalid boards and legal masks fail before a move can be chosen", () => {
  for (const invalid of [null, [], ["."], Array(5).fill("...."), Array(5).fill("..Q..")]) {
    assert.throws(() => selectGoMove(invalid, mask()), /Invalid IPvGO/);
  }
  for (const invalid of [null, [], Array(5).fill([true]), Array(5).fill(Array(5).fill(1))]) {
    assert.throws(() => selectGoMove(board(), invalid), /Invalid IPvGO/);
  }
});

const STOP = Symbol("stop test loop");
async function run(g) {
  const now = Date.now;
  Date.now = () => now() + g.searchClock;
  try { await main(g.ns); }
  finally { Date.now = now; }
}
function game({ opponent = "Netburners", currentPlayer = "Black", size = 5, history = [] } = {}) {
  const g = { opponent, currentPlayer, history, board: board([], size), moves: [], resets: [], logs: [],
    host: "home", threads: 1, args: [], steps: 0, stopAt: 1, legal: mask([[2, 2]], size), stats: {},
    searchClock: 0, processes: [{ pid: 1, filename: "/scripts/go-manager.js", threads: 1 }] };
  g.ns = {
    pid: 1, args: g.args, getHostname: () => g.host, self: () => ({ threads: g.threads }), ps: () => g.processes,
    disableLog: () => {}, print: msg => g.logs.push(msg), tprint: msg => g.logs.push(msg),
    sleep: async ms => {
      if (ms === 0) { g.searchClock += 2100; g.onSearch?.(); return; }
      assert.equal(ms, 100); g.steps++; g.onSleep?.(g.steps); if (g.steps >= g.stopAt) throw STOP;
    },
    go: {
      getOpponent: () => g.opponent, getBoardState: () => g.board.slice(), getMoveHistory: () => g.history,
      getGameState: () => ({ currentPlayer: g.currentPlayer, blackScore: 10, whiteScore: 8.5, komi: 1.5, previousMove: [0, 0] }),
      resetBoardState: (opponent, size) => {
        g.resets.push({ opponent, size, previousPlayer: g.currentPlayer, previousHistory: g.history.length });
        g.opponent = opponent; g.currentPlayer = "Black"; g.history = [];
        g.board = board([], size); g.legal = mask([[2, 2]], size);
        return g.board.slice();
      },
      makeMove: async (x, y) => {
        assert.equal(g.currentPlayer, "Black"); assert.equal(g.legal[x][y], true);
        g.moves.push({ type: "move", x, y, opponent: g.opponent });
        g.history.push(g.board.slice());
        g.board[x] = g.board[x].slice(0, y) + "X" + g.board[x].slice(y + 1);
        g.onMove?.();
        return g.reply ?? { type: "pass", x: null, y: null };
      },
      passTurn: async () => {
        assert.equal(g.currentPlayer, "Black");
        g.moves.push({ type: "pass", opponent: g.opponent });
        if (g.opponentPassed) g.currentPlayer = "None";
        g.opponentPassed = true;
        return { type: g.currentPlayer === "None" ? "gameOver" : "pass", x: null, y: null };
      },
      opponentNextTurn: async log => {
        assert.equal(g.currentPlayer, "White"); assert.equal(log, false);
        g.moves.push({ type: "await", opponent: g.opponent }); g.currentPlayer = "Black";
        return { type: "move", x: 0, y: 0 };
      },
      analysis: { getValidMoves: () => g.legal, getStats: () => g.stats },
    },
  };
  return g;
}

test("manager rejects wrong hosts, threads, arguments, and duplicate instances", async () => {
  for (const invalid of ["host", "threads", "args", "duplicate"]) {
    const g = game();
    if (invalid === "host") g.host = "remote";
    if (invalid === "threads") g.threads = 2;
    if (invalid === "args") g.args.push("extra");
    if (invalid === "duplicate") g.processes.push({ pid: 2, filename: "scripts/go-manager.js", threads: 1 });
    await run(g);
    assert.equal(g.moves.length, 0); assert.equal(g.resets.length, 0); assert.equal(g.steps, 0);
  }
});

test("practice and special boards are preserved before startup and if selected during play", async () => {
  for (const opponent of ["No AI", "????????????"]) {
    const g = game({ opponent }); await run(g);
    assert.equal(g.moves.length, 0); assert.equal(g.resets.length, 0);
    assert.ok(g.logs.some(l => l.includes("board preserved")));
    const h = game(); h.stopAt = 3; h.onSleep = () => { h.opponent = opponent; };
    await run(h);
    assert.equal(h.moves.length, 1); assert.equal(h.resets.length, 0);
  }
});

test("untouched boards become 5x5 while active larger games continue without reset", async () => {
  const g = game({ size: 7 }); await run(g);
  assert.deepEqual(g.resets.map(r => [r.opponent, r.size]), [["Netburners", 5]]);
  const h = game({ opponent: "Daedalus", size: 9, history: [board([], 9)] }); await run(h);
  assert.equal(h.resets.length, 0); assert.equal(h.board.length, 9);
  assert.equal(h.moves[0].opponent, "Daedalus");
  const waiting = game({ size: 7, currentPlayer: "White" }); await run(waiting);
  assert.equal(waiting.moves[0].type, "await"); assert.equal(waiting.resets.length, 0);
});

test("manager completes all six opponents in order and wraps without resetting active games", async () => {
  const g = game(); g.stopAt = 12; g.onMove = () => { g.currentPlayer = "None"; };
  g.stats.Netburners = { wins: 3, losses: 1, winStreak: 2, bonusPercent: 1.25 };
  await run(g);
  assert.deepEqual(g.moves.map(m => m.opponent), GO_OPPONENTS);
  assert.deepEqual(g.resets.map(r => r.opponent), [...GO_OPPONENTS.slice(1), "Netburners"]);
  assert.ok(g.resets.every(r => r.previousPlayer === "None" && r.size === 5));
  assert.ok(g.logs.some(l => l.includes("wins 3, losses 1, streak 2, bonus 1.25%")));
});

test("white-turn recovery waits for AI and restarts reconstruct progress from live state", async () => {
  const g = game({ opponent: "The Black Hand", currentPlayer: "White", history: [board()] });
  await run(g);
  assert.equal(g.moves[0].type, "await"); assert.equal(g.resets.length, 0);
  g.stopAt = 2; await run(g);
  assert.equal(g.moves[1].type, "move"); assert.equal(g.resets.length, 0);
  g.currentPlayer = "None"; g.stopAt = 3; await run(g);
  assert.equal(g.resets[0].opponent, "Tetrads");
});

test("passes finish the game, while stale gameOver replies do not force resets", async () => {
  const g = game(); g.legal = mask([]); g.stopAt = 3; g.opponentPassed = true;
  await run(g);
  assert.equal(g.moves[0].type, "pass");
  assert.equal(g.resets[0].previousPlayer, "None");
  const h = game(); h.reply = { type: "gameOver" }; await run(h);
  assert.equal(h.currentPlayer, "Black"); assert.equal(h.resets.length, 0);
});

test("invalid data, API failures, and unavailable APIs stop without board resets", async () => {
  for (const failure of ["board", "mask", "move", "read", "turn", "missing"]) {
    const g = game({ history: [board()] });
    const before = g.board.slice();
    if (failure === "board") g.ns.go.getBoardState = () => ["invalid"];
    if (failure === "mask") g.legal = [];
    if (failure === "move") g.ns.go.makeMove = async () => { throw new Error("external move"); };
    if (failure === "read") g.ns.go.getGameState = () => { throw new Error("unavailable"); };
    if (failure === "turn") g.currentPlayer = "invalid";
    if (failure === "missing") delete g.ns.go;
    await run(g);
    assert.deepEqual(g.board, before); assert.equal(g.resets.length, 0);
    assert.ok(g.logs.some(l => l.includes("IPvGO stopped:")), failure);
  }
});

test("manager discards search results when board, turn, history, opponent, komi or legality changes", async () => {
  for (const changed of ["board", "turn", "history", "opponent", "komi", "mask"]) {
    const g = game();
    g.onSearch = () => {
      if (changed === "board") g.board[0] = "X....";
      if (changed === "turn") g.currentPlayer = "White";
      if (changed === "history") g.history.push(board());
      if (changed === "opponent") g.opponent = "Daedalus";
      if (changed === "komi") {
        const state = g.ns.go.getGameState; g.ns.go.getGameState = () => ({ ...state(), komi: 7.5 });
      }
      if (changed === "mask") g.legal[2][2] = false;
    };
    await run(g);
    assert.equal(g.moves.length, 0, changed); assert.equal(g.resets.length, 0, changed);
    assert.ok(g.logs.some(l => l.includes("discarding the result")), changed);
  }
});
