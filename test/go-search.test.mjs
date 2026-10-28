import assert from "node:assert/strict";
import test from "node:test";
import { createGoState, legalGoMoves, playGoMove, scoreGoState, searchGoMove, selectGoMove } from "../home/scripts/go.js";
import { opening, referenceGame, referenceMask, referencePlay, referenceScore, seededRandom } from "./go-reference.mjs";

function board(stones = [], fill = ".") {
  const result = Array.from({ length: 5 }, () => Array(5).fill(fill));
  for (const [x, y, color] of stones) result[x][y] = color;
  return result.map(column => column.join(""));
}
function columns(state) {
  return Array.from({ length: state.size }, (_, x) => state.board.slice(x * state.size, (x + 1) * state.size).join(""));
}
const empty = () => board();
const all = () => Array.from({ length: 5 }, () => Array(5).fill(true));
const flip = b => b.map(column => column.replace(/[XO]/g, c => c === "X" ? "O" : "X"));

test("local rules and scoring match an independent reference through seeded games for both colors", () => {
  let comparisons = 0;
  for (let seed = 0; seed < 20; seed++) {
    const random = seededRandom(seed + 50);
    let game = opening(seed);
    for (let ply = 0; ply < 14 && game.passes < 2; ply++) {
      const state = createGoState(game.board, { player: game.player, komi: game.komi,
        history: game.history, opponentPassed: game.passes === 1 });
      const before = JSON.stringify([state.board, [...state.seen], game]);
      assert.equal(scoreGoState(state), referenceScore(game));
      const legal = [];
      for (let x = 0; x < 5; x++) for (let y = 0; y < 5; y++) {
        const move = { x, y };
        const actual = playGoMove(state, move);
        const expected = referencePlay(game, move);
        assert.equal(!!actual, !!expected, `seed ${seed}, ply ${ply}, ${x},${y}`);
        if (actual) {
          assert.deepEqual(columns(actual), expected.board);
          assert.equal(actual.player, expected.player);
          assert.equal(scoreGoState(actual), referenceScore(expected));
          legal.push(move);
        }
        comparisons++;
      }
      assert.equal(JSON.stringify([state.board, [...state.seen], game]), before);
      game = referencePlay(game, legal.length ? legal[Math.floor(random() * legal.length)] : null);
    }
  }
  assert.ok(comparisons >= 6000);
});

test("captures happen before suicide checks, with several distinct groups removed", () => {
  const b = board([[2, 1, "O"], [1, 2, "O"], [3, 2, "O"], [2, 3, "O"],
    [2, 0, "X"], [1, 1, "X"], [3, 1, "X"], [0, 2, "X"], [4, 2, "X"],
    [1, 3, "X"], [3, 3, "X"], [2, 4, "X"]]);
  for (const player of ["X", "O"]) {
    const state = createGoState(player === "X" ? b : flip(b), { player });
    const next = playGoMove(state, { x: 2, y: 2 });
    assert.ok(next); assert.equal(next.captures, 4);
    for (const [x, y] of [[2, 1], [1, 2], [3, 2], [2, 3]]) assert.equal(columns(next)[x][y], ".");
    const suicide = createGoState(board([[1, 2, player === "X" ? "O" : "X"], [2, 1, player === "X" ? "O" : "X"],
      [3, 2, player === "X" ? "O" : "X"], [2, 3, player === "X" ? "O" : "X"]]), { player });
    assert.equal(playGoMove(suicide, { x: 2, y: 2 }), null);
  }
});

test("immediate ko and a repetition deeper in history are illegal; passing remains legal", () => {
  const b = board([[2, 1, "O"], [1, 1, "X"], [2, 0, "X"], [3, 1, "X"],
    [1, 2, "O"], [3, 2, "O"], [2, 3, "O"]]);
  const state = createGoState(b);
  const after = playGoMove(state, { x: 2, y: 2 });
  assert.ok(after);
  assert.equal(playGoMove(after, { x: 2, y: 1 }), null);
  const withoutHistory = createGoState(columns(after), { player: "O" });
  assert.deepEqual(columns(playGoMove(withoutHistory, { x: 2, y: 1 })), b);
  const older = createGoState(columns(after), { player: "O", history: [b, empty()] });
  assert.equal(playGoMove(older, { x: 2, y: 1 }), null);
  const pass = playGoMove(after, null);
  assert.equal(pass.passes, 1); assert.equal(pass.seen.size, after.seen.size);
  const end = playGoMove(pass, null);
  assert.equal(end.passes, 2); assert.deepEqual(columns(end), columns(after));
  assert.equal(playGoMove(end, null), null); assert.deepEqual(legalGoMoves(end), []);
});

test("area score counts both colors, enclosed space, dead nodes, komi, and near-empty openings", () => {
  const enclosed = ["XXXXX", "X...X", "X.X.X", "X...X", "XXXXX"];
  assert.equal(scoreGoState(createGoState(enclosed, { komi: 7.5 })), 17.5);
  assert.equal(scoreGoState(createGoState(flip(enclosed), { komi: 7.5 })), -32.5);
  assert.equal(scoreGoState(createGoState(board([[2, 2, "X"]]), { komi: 1.5 })), -0.5);
  const walls = board([[1, 1, "X"], [3, 3, "O"], [1, 2, "."]], "#");
  assert.equal(scoreGoState(createGoState(walls, { komi: 0.5 })), 0.5);
});

test("fixed-seed searches preserve inputs and return identical legal choices", async () => {
  const game = opening(4);
  const mask = referenceMask(game);
  const before = JSON.stringify([game, mask]);
  const options = { history: game.history, komi: game.komi, simulations: 128, seed: 123, now: () => 0 };
  const a = {}, b = {};
  const first = await searchGoMove(game.board, mask, { ...options, stats: a });
  const second = await searchGoMove(game.board, mask, { ...options, stats: b });
  assert.deepEqual(first, second); assert.deepEqual(a, b); assert.equal(a.simulations, 128);
  assert.ok(referencePlay(game, first));
  assert.equal(JSON.stringify([game, mask]), before);
});

test("deadline exhaustion returns the tactical fallback and never backs up a partial simulation", async () => {
  const b = empty(); const mask = all(); const zero = {};
  assert.deepEqual(await searchGoMove(b, mask, { timeLimitMs: 0, stats: zero }), selectGoMove(b, mask));
  assert.equal(zero.simulations, 0);
  let clock = 0;
  const partial = {};
  const move = await searchGoMove(b, mask, { now: () => clock++, timeLimitMs: 15, stats: partial });
  assert.equal(partial.simulations, 0);
  assert.ok(partial.nodes > 1);
  assert.deepEqual(move, selectGoMove(b, mask));
});

test("search yields cooperatively, enforces node and time limits, and propagates cancellation", async () => {
  const limited = {};
  await searchGoMove(empty(), all(), { now: () => 0, simulations: 40, maxNodes: 7, stats: limited });
  assert.equal(limited.simulations, 40); assert.equal(limited.nodes, 7);
  let clock = 0, yields = 0;
  const stats = {};
  await searchGoMove(empty(), all(), { now: () => clock++, timeLimitMs: 5000,
    yieldControl: async () => { yields++; }, stats });
  assert.ok(yields > 5); assert.ok(stats.elapsedMs >= 2000 && stats.elapsedMs < 2010);
  const stop = new Error("cancelled");
  await assert.rejects(searchGoMove(empty(), all(), { yieldControl: async () => { throw stop; } }), e => e === stop);
});

test("search considers self-atari and friendly territory instead of excluding legal branches", async () => {
  for (const b of [board([[1, 2, "O"], [2, 1, "O"], [3, 2, "O"]]),
    board([[2, 1, "X"], [1, 2, "X"], [3, 2, "X"], [2, 3, "X"]])]) {
    const mask = all().map(column => column.map(() => false)); mask[2][2] = true;
    assert.equal(selectGoMove(b, mask), null);
    const stats = {};
    await searchGoMove(b, mask, { simulations: 2, now: () => 0, stats });
    assert.equal(stats.nodes, 3, "the legal placement and pass must both expand");
  }
});

test("passing ends a won game immediately, but a losing position still searches for moves", async () => {
  const won = board([[1, 1, "X"], [1, 2, "X"], [2, 1, "X"], [2, 2, "."], [4, 4, "O"]], "#");
  const stats = {};
  assert.equal(await searchGoMove(won, referenceMask(referenceGame(won)), { opponentPassed: true, komi: 0.5, stats }), null);
  assert.equal(stats.simulations, 0);
  const game = opening(0); const searched = {};
  const move = await searchGoMove(game.board, referenceMask(game), { opponentPassed: true, komi: 1.5,
    simulations: 128, now: () => 0, seed: 1, stats: searched });
  assert.ok(move); assert.equal(searched.simulations, 128);
});

test("search avoids a poisoned capture whose snapback loses the newly connected pair", async () => {
  const b = ["OOXO.", ".#X..", "X..#O", "O.XOO", "XXO.X"];
  const game = referenceGame(b, { komi: -5.5 });
  const mask = referenceMask(game);
  const old = selectGoMove(b, mask);
  const move = await searchGoMove(b, mask, { komi: game.komi, simulations: 512, now: () => 0, seed: 17 });
  const oldNext = referencePlay(game, old);
  const next = referencePlay(game, move);
  const replies = position => [...referenceMask(position).flatMap((column, x) => column.flatMap((valid, y) =>
    valid ? [referencePlay(position, { x, y })] : [])), referencePlay(position, null)];
  const worst = position => Math.min(...replies(position).map(referenceScore));
  assert.equal(playGoMove(createGoState(b), old).captures, 1);
  assert.equal(playGoMove(playGoMove(createGoState(b), old), { x: 4, y: 2 }).captures, 2);
  assert.ok(worst(next) >= worst(oldNext) + 4);
});

test("a throw-in sacrifice threatens a large group and survives every immediate reply tactically", async () => {
  const cells = Array.from({ length: 5 }, () => Array(5).fill("#"));
  for (let x = 1; x <= 3; x++) for (let y = 1; y <= 4; y++) cells[x][y] = "O";
  cells[2][2] = "."; cells[2][3] = ".";
  const b = cells.map(column => column.join(""));
  const game = referenceGame(b, { komi: 1.5 });
  const mask = referenceMask(game);
  assert.equal(selectGoMove(b, mask), null, "old self-atari filter misses both throw-ins");
  const move = await searchGoMove(b, mask, { komi: game.komi, simulations: 128, now: () => 0, seed: 4 });
  assert.ok(move);
  const sacrificed = playGoMove(createGoState(b), move);
  assert.equal(sacrificed.captures, 0);
  assert.equal(sacrificed.analysis.groups[sacrificed.analysis.ids[move.x * 5 + move.y]].liberties.size, 1);
  const first = referencePlay(game, move);
  const replies = [...referenceMask(first).flatMap((column, x) => column.flatMap((valid, y) => valid ? [{ x, y }] : [])), null];
  for (const reply of replies) {
    const afterReply = referencePlay(first, reply);
    const captures = referenceMask(afterReply).flatMap((column, x) => column.flatMap((valid, y) =>
      valid ? [referencePlay(afterReply, { x, y })] : []));
    assert.ok(captures.some(next => !next.board.some(column => column.includes("O"))), "white cannot save its large chain in one reply");
  }
});

test("malformed search context and invalid limits are rejected", async () => {
  for (const options of [{ history: [board([], "#").slice(1)] }, { komi: NaN }, { player: "White" },
    { opponentPassed: 1 }, { simulations: -1 }, { maxNodes: 0 }, { timeLimitMs: Infinity }, { seed: NaN }]) {
    await assert.rejects(searchGoMove(empty(), all(), options), /Invalid IPvGO/);
  }
});
