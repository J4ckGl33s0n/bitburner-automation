export const GO_OPPONENTS = [
  "Netburners", "Slum Snakes", "The Black Hand", "Tetrads", "Daedalus", "Illuminati",
];

function neighbors(point, size) {
  const adjacent = [];
  if (point >= size) adjacent.push(point - size);
  if (point < size * (size - 1)) adjacent.push(point + size);
  if (point % size > 0) adjacent.push(point - 1);
  if (point % size < size - 1) adjacent.push(point + 1);
  return adjacent;
}

function analyze(board, size) {
  const ids = Array(board.length).fill(-1);
  const groups = [];
  let territory = 0;
  let whiteTerritory = 0;
  for (let point = 0; point < board.length; point++) {
    if (board[point] === "#" || ids[point] !== -1) continue;
    const group = { color: board[point], points: [], liberties: new Set(), owner: null };
    const borders = new Set();
    const pending = [point];
    ids[point] = groups.length;
    while (pending.length) {
      const current = pending.pop();
      group.points.push(current);
      for (const adjacent of neighbors(current, size)) {
        const color = board[adjacent];
        if (color === group.color && ids[adjacent] === -1) {
          ids[adjacent] = groups.length;
          pending.push(adjacent);
        }
        if (color === ".") group.liberties.add(adjacent);
        if (color === "X" || color === "O") borders.add(color);
      }
    }
    // A nearly empty opening is contested, matching the game's territory rule.
    if (group.color === "." && borders.size === 1 && group.points.length <= size * size - 3) {
      group.owner = [...borders][0];
      if (group.owner === "X") territory += group.points.length;
      else whiteTerritory += group.points.length;
    }
    groups.push(group);
  }
  return { ids, groups, territory, whiteTerritory };
}

/** Local game state for search and rule validation; history contains column-first boards. */
export function createGoState(board, { history = [], komi = 0, player = "X", opponentPassed = false } = {}) {
  const size = board?.length;
  const validBoard = value => Array.isArray(value) && value.length === size &&
    Array.from(value).every(column => typeof column === "string" && column.length === size && !/[^XO.#]/.test(column));
  if (![5, 7, 9, 13].includes(size) || !validBoard(board) || !Array.isArray(history) ||
      !Array.from(history).every(validBoard) || !Number.isFinite(komi) || !["X", "O"].includes(player) ||
      typeof opponentPassed !== "boolean") throw new Error("Invalid IPvGO search state");
  const flat = board.join("").split("");
  return { board: flat, size, player, komi, passes: opponentPassed ? 1 : 0,
    seen: new Set([...history.map(prior => prior.join("")), flat.join("")]), analysis: analyze(flat, size) };
}

function other(player) { return player === "X" ? "O" : "X"; }

function place(state, point) {
  if (state.passes >= 2 || state.board[point] !== ".") return null;
  const next = state.board.slice();
  next[point] = state.player;
  const capturedIds = new Set(neighbors(point, state.size).filter(p => state.board[p] === other(state.player))
    .map(p => state.analysis.ids[p]));
  let captures = 0;
  for (const id of capturedIds) {
    const group = state.analysis.groups[id];
    if (group.liberties.size !== 1) continue;
    captures += group.points.length;
    for (const p of group.points) next[p] = ".";
  }
  const analysis = analyze(next, state.size);
  const group = analysis.groups[analysis.ids[point]];
  const key = next.join("");
  if (!group.liberties.size || state.seen.has(key)) return null;
  return { ...state, board: next, player: other(state.player), passes: 0,
    seen: new Set([...state.seen, key]), analysis, captures };
}

/** Apply a placement or pass without mutating state; null means an illegal action. */
export function playGoMove(state, move) {
  if (state.passes >= 2) return null;
  if (move === null) return { ...state, player: other(state.player), passes: state.passes + 1, captures: 0 };
  if (!move || !Number.isInteger(move.x) || !Number.isInteger(move.y) ||
      move.x < 0 || move.y < 0 || move.x >= state.size || move.y >= state.size) return null;
  return place(state, move.x * state.size + move.y);
}

/** Black's area score minus white's, including komi. Black wins ties in IPvGO. */
export function scoreGoState(state) {
  let score = state.analysis.territory - state.analysis.whiteTerritory - state.komi;
  for (const color of state.board) score += color === "X" ? 1 : color === "O" ? -1 : 0;
  return score;
}

/** Live masks apply at the root only; descendants use the local repetition history. */
export function legalGoMoves(state, validMoves = null) {
  if (state.passes >= 2) return [];
  const moves = [];
  for (let point = 0; point < state.board.length; point++) {
    const x = Math.floor(point / state.size);
    const y = point % state.size;
    if (validMoves && !validMoves[x][y]) continue;
    const next = place(state, point);
    if (next) moves.push({ point, state: next });
  }
  moves.push({ point: -1, state: playGoMove(state, null) });
  return moves;
}

function orderedMoves(state, validMoves = null) {
  const own = state.player;
  const enemy = other(own);
  const moves = legalGoMoves(state, validMoves);
  for (const move of moves) {
    if (move.point === -1) { move.prior = -100; continue; }
    const next = move.state;
    const group = next.analysis.groups[next.analysis.ids[move.point]];
    let rescued = 0;
    let threatened = 0;
    for (const before of state.analysis.groups) {
      const point = before.points[0];
      if (next.board[point] !== before.color) continue;
      const after = next.analysis.groups[next.analysis.ids[point]];
      if (before.color === own && before.liberties.size === 1 && after.liberties.size >= 2) rescued += before.points.length;
      if (before.color === enemy && before.liberties.size > 1 && after.liberties.size === 1) threatened += before.points.length;
    }
    const friends = new Set(neighbors(move.point, state.size).filter(p => state.board[p] === own).map(p => state.analysis.ids[p]));
    const eye = state.analysis.groups[state.analysis.ids[move.point]].owner === own;
    const selfAtari = group.liberties.size === 1;
    const x = Math.floor(move.point / state.size);
    const y = move.point % state.size;
    move.quiet = eye && !rescued || selfAtari && !next.captures;
    move.prior = 8 * next.captures + 6 * rescued + threatened + Math.max(0, friends.size - 1) +
      0.3 * Math.min(6, group.liberties.size) - (selfAtari ? 8 + group.points.length : 0) -
      (eye && !rescued ? 30 : 0) - 0.03 * (Math.abs(x - (state.size - 1) / 2) + Math.abs(y - (state.size - 1) / 2));
  }
  return moves.sort((a, b) => b.prior - a.prior || (a.point < 0 ? Infinity : a.point) - (b.point < 0 ? Infinity : b.point));
}

function winner(state, player) { return (scoreGoState(state) >= 0 ? "X" : "O") === player ? 1 : 0; }

/** UCT search. The manager supplies yieldControl; deterministic limits also support tests/benchmarks. */
export async function searchGoMove(board, validMoves, options = {}) {
  const { yieldControl = async () => {}, now = Date.now, simulations = Infinity,
    timeLimitMs = 2000, maxNodes = 10000, stats = {} } = options;
  if (!(simulations === Infinity || Number.isSafeInteger(simulations) && simulations >= 0) ||
      !Number.isFinite(timeLimitMs) || timeLimitMs < 0 || !Number.isSafeInteger(maxNodes) || maxNodes < 1 ||
      typeof now !== "function" || typeof yieldControl !== "function") throw new Error("Invalid IPvGO search limits");
  const start = now();
  const deadline = start + Math.min(2000, timeLimitMs);
  const nodeLimit = Math.min(10000, maxNodes);
  const state = createGoState(board, options);
  const colored = state.player === "X" ? board : board.map(column => column.replace(/[XO]/g, c => other(c)));
  const fallback = selectGoMove(colored, validMoves);
  let randomState = options.seed ?? [...state.board.join("") + state.komi + state.player].reduce((hash, c) => Math.imul(hash ^ c.charCodeAt(0), 16777619) >>> 0, 2166136261);
  if (!Number.isSafeInteger(randomState)) throw new Error("Invalid IPvGO random seed");
  const random = () => { randomState = (Math.imul(randomState, 1664525) + 1013904223) >>> 0; return randomState / 4294967296; };
  const root = { state, point: -1, children: [], untried: null, visits: 0, wins: 0 };
  let nodes = 1;
  let completed = 0;
  let lastYield = start;
  const checkpoint = async (force = false) => {
    if (now() >= deadline) return false;
    if (force || now() - lastYield >= 10) {
      await yieldControl();
      lastYield = now();
    }
    return now() < deadline;
  };
  try {
    if (state.passes === 1 && winner(state, state.player)) return null;
    if (!(await checkpoint(true))) return fallback;
    root.untried = orderedMoves(state, validMoves).map(move => move.point);
    if (root.untried.length === 1) return null;
    while (completed < simulations && await checkpoint()) {
      let node = root;
      const path = [node];
      let interrupted = false;
      while (node.state.passes < 2) {
        if (!(await checkpoint())) { interrupted = true; break; }
        node.untried ??= orderedMoves(node.state).map(move => move.point);
        if (node.untried.length && nodes < nodeLimit) {
          const point = node.untried.shift();
          const child = { point, state: point < 0 ? playGoMove(node.state, null) : place(node.state, point),
            children: [], untried: null, visits: 0, wins: 0 };
          node.children.push(child);
          path.push(child);
          node = child;
          nodes++;
          break;
        }
        if (!node.children.length) break;
        const sign = node.state.player === state.player ? 1 : -1;
        let best = null;
        let bestScore = -Infinity;
        for (const child of node.children) {
          const value = child.visits ? (sign === 1 ? child.wins / child.visits : 1 - child.wins / child.visits) +
            Math.sqrt(2 * Math.log(Math.max(1, node.visits)) / child.visits) : Infinity;
          if (value > bestScore) { best = child; bestScore = value; }
        }
        node = best;
        path.push(node);
      }
      let rollout = node.state;
      for (let ply = 0; !interrupted && rollout.passes < 2 && ply < 4 * state.size * state.size; ply++) {
        if (!(await checkpoint())) { interrupted = true; break; }
        if (rollout.passes === 1 && winner(rollout, rollout.player)) {
          rollout = playGoMove(rollout, null);
          break;
        }
        const moves = orderedMoves(rollout);
        const useful = moves.filter(move => move.point >= 0 && !move.quiet);
        let chosen = moves.find(move => move.point === -1);
        if (useful.length) {
          const pool = useful.slice(0, 4);
          const weights = pool.map(move => Math.exp((move.prior - pool[0].prior) / 2));
          let pick = random() * weights.reduce((sum, weight) => sum + weight, 0);
          chosen = pool.at(-1);
          for (let i = 0; i < pool.length; i++) {
            pick -= weights[i];
            if (pick <= 0) { chosen = pool[i]; break; }
          }
        }
        rollout = chosen.state;
      }
      if (interrupted || !(await checkpoint())) break;
      const reward = winner(rollout, state.player);
      for (const visited of path) { visited.visits++; visited.wins += reward; }
      completed++;
    }
    const visited = root.children.filter(child => child.visits).sort((a, b) =>
      b.visits - a.visits || b.wins / b.visits - a.wins / a.visits ||
      (a.point < 0 ? Infinity : a.point) - (b.point < 0 ? Infinity : b.point));
    if (!visited.length) return fallback;
    const point = visited[0].point;
    return point < 0 ? null : { x: Math.floor(point / state.size), y: point % state.size };
  } finally {
    Object.assign(stats, { simulations: completed, nodes, elapsedMs: now() - start });
  }
}

/** Choose a black move from the live legal mask; null means pass. Inputs stay unchanged. */
export function selectGoMove(board, validMoves) {
  const size = board?.length;
  if (!Array.isArray(board) || ![5, 7, 9, 13].includes(size) ||
      board.some(column => typeof column !== "string" || column.length !== size || /[^XO.#]/.test(column)) ||
      !Array.isArray(validMoves) || validMoves.length !== size ||
      validMoves.some(column => !Array.isArray(column) || column.length !== size || column.some(v => typeof v !== "boolean"))) {
    throw new Error("Invalid IPvGO board or legal-move mask");
  }
  const flat = board.join("").split("");
  const before = analyze(flat, size);
  const candidates = [];
  for (let x = 0; x < size; x++) {
    for (let y = 0; y < size; y++) {
      const point = x * size + y;
      if (!validMoves[x][y] || flat[point] !== ".") continue;
      const adjacent = neighbors(point, size);
      const enemyIds = new Set(adjacent.filter(p => flat[p] === "O").map(p => before.ids[p]));
      const friendlyIds = new Set(adjacent.filter(p => flat[p] === "X").map(p => before.ids[p]));
      const next = flat.slice();
      next[point] = "X";
      let captures = 0;
      for (const id of enemyIds) {
        const group = before.groups[id];
        if (group.liberties.size !== 1) continue;
        captures += group.points.length;
        for (const captured of group.points) next[captured] = ".";
      }
      const after = analyze(next, size);
      const liberties = after.groups[after.ids[point]].liberties.size;
      if (!liberties || liberties === 1 && !captures) continue;
      let rescued = 0;
      let threatened = 0;
      for (const group of before.groups) {
        const first = group.points[0];
        const surviving = next[first] === group.color ? after.groups[after.ids[first]] : null;
        if (group.color === "X" && group.liberties.size === 1 && surviving.liberties.size >= 2) rescued += group.points.length;
        if (group.color === "O" && group.liberties.size > 1 && surviving?.liberties.size === 1) threatened += group.points.length;
      }
      if (before.groups[before.ids[point]].owner === "X" && !rescued) continue;
      const score = [captures + rescued, captures, threatened, Math.max(0, friendlyIds.size - 1),
        liberties, after.territory - before.territory,
        -Math.abs(x - (size - 1) / 2) - Math.abs(y - (size - 1) / 2), -x, -y];
      candidates.push({ x, y, score });
    }
  }
  candidates.sort((a, b) => {
    for (let i = 0; i < a.score.length; i++) {
      if (a.score[i] !== b.score[i]) return b.score[i] - a.score[i];
    }
    return 0;
  });
  return candidates.length ? { x: candidates[0].x, y: candidates[0].y } : null;
}
