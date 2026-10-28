// Independent, deliberately simple rules oracle for tests and the playing-strength benchmark.
export function referenceGame(board, { player = "X", komi = 0, history = [], passes = 0 } = {}) {
  return { board: board.slice(), player, komi, history: history.map(b => b.slice()), passes };
}

function adjacent(board, x, y) {
  return [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]]
    .filter(([a, b]) => a >= 0 && b >= 0 && a < board.length && b < board.length);
}

function groupAt(board, x, y) {
  const points = [[x, y]];
  const visited = new Set([`${x},${y}`]);
  const liberties = new Set();
  const borders = new Set();
  for (let i = 0; i < points.length; i++) {
    for (const [a, b] of adjacent(board, ...points[i])) {
      const key = `${a},${b}`;
      if (board[a][b] === ".") liberties.add(key);
      if (board[a][b] === "X" || board[a][b] === "O") borders.add(board[a][b]);
      if (board[a][b] === board[x][y] && !visited.has(key)) {
        visited.add(key); points.push([a, b]);
      }
    }
  }
  return { points, liberties, borders };
}

export function referencePlay(game, move) {
  if (game.passes >= 2) return null;
  const player = game.player === "X" ? "O" : "X";
  if (move === null) return { ...game, player, passes: game.passes + 1 };
  const { x, y } = move;
  if (!Number.isInteger(x) || !Number.isInteger(y) || game.board[x]?.[y] !== ".") return null;
  const cells = game.board.map(column => column.split(""));
  cells[x][y] = game.player;
  const inspected = new Set();
  for (let a = 0; a < cells.length; a++) {
    for (let b = 0; b < cells.length; b++) {
      if (cells[a][b] !== player || inspected.has(`${a},${b}`)) continue;
      const group = groupAt(cells, a, b);
      for (const [c, d] of group.points) inspected.add(`${c},${d}`);
      if (!group.liberties.size) for (const [c, d] of group.points) cells[c][d] = ".";
    }
  }
  if (!groupAt(cells, x, y).liberties.size) return null;
  const board = cells.map(column => column.join(""));
  const key = board.join("|");
  if (key === game.board.join("|") || game.history.some(prior => prior.join("|") === key)) return null;
  return { ...game, board, player, passes: 0, history: [...game.history, game.board] };
}

export function referenceMask(game) {
  return game.board.map((column, x) => [...column].map((_, y) => !!referencePlay(game, { x, y })));
}

export function referenceScore(game) {
  let score = -game.komi;
  const seen = new Set();
  for (let x = 0; x < game.board.length; x++) {
    for (let y = 0; y < game.board.length; y++) {
      const color = game.board[x][y];
      if (color === "X") score++;
      if (color === "O") score--;
      if (color !== "." || seen.has(`${x},${y}`)) continue;
      const group = groupAt(game.board, x, y);
      for (const [a, b] of group.points) seen.add(`${a},${b}`);
      if (group.points.length <= game.board.length ** 2 - 3 && group.borders.size === 1) {
        score += group.points.length * (group.borders.has("X") ? 1 : -1);
      }
    }
  }
  return score;
}

export function seededRandom(seed) {
  return () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
}

export function opening(seed) {
  const random = seededRandom(seed + 1);
  const cells = Array.from({ length: 5 }, () => Array(5).fill("."));
  const empty = () => cells.flatMap((column, x) => column.flatMap((c, y) => c === "." ? [[x, y]] : []));
  for (let i = 0; i < seed % 4; i++) {
    const points = empty(); const [x, y] = points[Math.floor(random() * points.length)]; cells[x][y] = "#";
  }
  if (seed % 6 === 5) {
    const points = empty(); const [x, y] = points[Math.floor(random() * points.length)]; cells[x][y] = "O";
  }
  let game = referenceGame(cells.map(column => column.join("")), { komi: [1.5, 3.5, 3.5, 5.5, 5.5, 7.5][seed % 6] });
  for (let ply = 0; ply < (seed % 4) * 2; ply++) {
    const mask = referenceMask(game);
    const moves = mask.flatMap((column, x) => column.flatMap((valid, y) => valid ? [{ x, y }] : []));
    game = referencePlay(game, moves.length ? moves[Math.floor(random() * moves.length)] : null);
  }
  return game;
}
