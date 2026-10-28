import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import ts from "typescript";
import { SOLVERS } from "../home/scripts/contracts.js";
import { main } from "../home/scripts/contract-manager.js";

const fixtures = {
  "Find Largest Prime Factor": [[2, 2], [17, 17], [64, 2], [13195, 29], [600851475143, 6857]],
  "Subarray with Maximum Sum": [[[1, -2, 3, 4, -1], 7], [[-5, -2, -9], -2], [[0], 0]],
  "Total Ways to Sum": [[1, 0], [2, 1], [5, 6], [10, 41]],
  "Total Ways to Sum II": [[[10, [2, 5, 3, 6]], 5], [[3, [2]], 0], [[4, [1, 2]], 3]],
  "Spiralize Matrix": [[[[1, 2, 3], [4, 5, 6], [7, 8, 9]], [1, 2, 3, 6, 9, 8, 7, 4, 5]],
    [[[1, 2, 3, 4]], [1, 2, 3, 4]], [[[1], [2], [3]], [1, 2, 3]],
    [[[1, 2, 3], [4, 5, 6]], [1, 2, 3, 6, 5, 4]], [[[1]], [1]]],
  "Array Jumping Game": [[[0], 1], [[0, 1], 0], [[2, 3, 1, 1, 4], 1], [[3, 2, 1, 0, 4], 0]],
  "Array Jumping Game II": [[[0], 0], [[0, 1], 0], [[2, 3, 1, 1, 4], 2], [[3, 2, 1, 0, 4], 0]],
  "Merge Overlapping Intervals": [[[[5, 8], [1, 3], [2, 6], [10, 11]], [[1, 8], [10, 11]]],
    [[[1, 4], [4, 5], [2, 3]], [[1, 5]]], [[], []]],
  "Generate IP Addresses": [["25525511135", ["255.255.11.135", "255.255.111.35"]],
    ["0000", ["0.0.0.0"]], ["010010", ["0.10.0.10", "0.100.1.0"]], ["999999999999", []], ["123", []]],
  "Algorithmic Stock Trader I": [[[7, 1, 5, 3, 6, 4], 5], [[5, 4, 3], 0], [[1], 0]],
  "Algorithmic Stock Trader II": [[[7, 1, 5, 3, 6, 4], 7], [[5, 4, 3], 0], [[1], 0]],
  "Algorithmic Stock Trader III": [[[3, 3, 5, 0, 0, 3, 1, 4], 6], [[1, 2, 3, 4, 5], 4], [[1], 0]],
  "Algorithmic Stock Trader IV": [[[0, [1, 5]], 0], [[2, [3, 2, 6, 5, 0, 3]], 7], [[100, [1, 2, 1, 2]], 2]],
  "Minimum Path Sum in a Triangle": [[[[2], [3, 4], [6, 5, 7], [4, 1, 8, 3]], 11], [[[-10]], -10],
    [[[1], [-2, 3], [4, -5, 6]], -6]],
  "Unique Paths in a Grid I": [[[3, 7], 28], [[1, 5], 1], [[5, 1], 1], [[1, 1], 1]],
  "Unique Paths in a Grid II": [[[[0, 0, 0], [0, 1, 0], [0, 0, 0]], 2], [[[1]], 0], [[[0]], 1],
    [[[0, 0], [0, 1]], 0], [[[0, 1, 0]], 0]],
  "Shortest Path in a Grid": [[[[0, 0], [0, 0]], "DR"], [[[0, 1], [1, 0]], ""], [[[0]], ""],
    [[[0, 0, 0]], "RR"], [[[0], [0], [0]], "DD"]],
  "Sanitize Parentheses in Expression": [["()())()", ["(())()", "()()()"]], ["(a)())()", ["(a())()", "(a)()()"]],
    [")(", [""]], ["abc", ["abc"]], ["", [""]]],
  "Find All Valid Math Expressions": [[["123", 6], ["1+2+3", "1*2*3"]], [["105", 5], ["1*0+5", "10-5"]],
    [["00", 0], ["0+0", "0-0", "0*0"]], [["232", 8], ["2*3+2", "2+3*2"]], [["3456237490", 9191], []]],
  "HammingCodes: Integer to Encoded Binary": [[0, "0000"], [8, "11110000"], [21, "1001101011"]],
  "HammingCodes: Encoded Binary to Integer": [["0000", 0], ["11110000", 8], ["1001101010", 21]],
  "Proper 2-Coloring of a Graph": [[[4, [[0, 1], [2, 3]]], [0, 1, 0, 1]], [[3, []], [0, 0, 0]],
    [[3, [[0, 1], [1, 2], [2, 0]]], []], [[1, [[0, 0]]], []]],
  "Compression I: RLE Compression": [["", ""], ["aabccc", "2a1b3c"], ["aaaaaaaaaaa", "9a2a"], ["1111111111", "9111"]],
  "Compression II: LZ Decompression": [["", ""], ["1a91", "aaaaaaaaaa"], ["9abcdefghi02jk", "abcdefghijk"],
    ["7abracad47", "abracadabra"], ["4miss433ppi", "mississippi"], ["627182844", "2718281828"]],
  "Compression III: LZ Compression": [["", 0], ["abc", 4], ["abcdefghijk", 14], ["aaaaaaaaaa", 4],
    ["abracadabra", 10], ["mississippi", 11], ["aaaaaaaaaaaa", 6]],
  "Encryption I: Caesar Cipher": [[["ABC XYZ", 3], "XYZ UVW"], [["HELLO WORLD", 0], "HELLO WORLD"]],
  "Encryption II: Vigenère Cipher": [[["ATTACKATDAWN", "LEMON"], "LXFOPVEFRNHR"], [["DASHBOARD", "LINUX"], "OIFBYZIEX"],
    [["ZZZ", "B"], "AAA"]],
  "Square Root": [[0n, "0"], [1n, "1"], [2n, "1"], [3n, "2"], [6n, "2"], [7n, "3"], [100n, "10"]],
  "Total Number of Primes": [[[0, 20], 8], [[0, 1], 0], [[2, 2], 1], [[4, 4], 0], [[11, 13], 2]],
  "Largest Rectangle in a Matrix": [[[[1, 0, 0], [0, 0, 0]], [[0, 1], [1, 2]]],
    [[[0, 0, 0, 1], [0, 0, 0, 0], [0, 0, 1, 0], [0, 0, 0, 1]], [[0, 0], [3, 1]]], [[[0]], [[0, 0], [0, 0]]]],
};

for (const [type, cases] of Object.entries(fixtures)) {
  test(`${type}: known answers, edges, and input preservation`, () => {
    for (const [data, expected] of cases) {
      const original = globalThis.structuredClone(data);
      const answer = SOLVERS[type](data);
      if (type === "Compression III: LZ Compression") {
        assert.equal(answer.length, expected);
        assert.equal(SOLVERS["Compression II: LZ Decompression"](answer), data);
      } else if (["Sanitize Parentheses in Expression", "Find All Valid Math Expressions"].includes(type)) {
        assert.deepEqual([...answer].sort(), [...expected].sort());
      } else assert.deepEqual(answer, expected);
      assert.deepEqual(data, original);
    }
  });
}

test("every game-defined contract type has a solver and known-answer coverage", async () => {
  assert.deepEqual(Object.keys(SOLVERS).sort(), Object.keys(fixtures).sort());
  const definitions = ts.createSourceFile("defs.ts", await readFile(new URL("../NetscriptDefinitions.d.ts", import.meta.url), "utf8"), ts.ScriptTarget.Latest, true);
  const signatures = definitions.statements.find(node => ts.isTypeAliasDeclaration(node) && node.name.text === "CodingContractSignatures");
  assert.ok(signatures);
  assert.deepEqual(Object.keys(SOLVERS).sort(), signatures.type.members.map(member => member.name.text).sort());
});

function* arrays(length, values) {
  if (!length) { yield []; return; }
  for (const prefix of arrays(length - 1, values)) {
    for (const value of values) yield [...prefix, value];
  }
}

test("jumping solvers match breadth-first search for every small input", () => {
  for (let length = 1; length <= 7; length++) {
    for (const data of arrays(length, [0, 1, 2, 3])) {
      const distance = Array(length).fill(Infinity);
      distance[0] = 0;
      for (let i = 0; i < length; i++) {
        for (let j = i + 1; j < length && j <= i + data[i]; j++) {
          distance[j] = Math.min(distance[j], distance[i] + 1);
        }
      }
      assert.equal(SOLVERS["Array Jumping Game"](data), Number(Number.isFinite(distance.at(-1))));
      assert.equal(SOLVERS["Array Jumping Game II"](data), Number.isFinite(distance.at(-1)) ? distance.at(-1) : 0);
    }
  }
});

function exhaustiveProfit(prices, limit, day = 0, holding = false) {
  if (day === prices.length) return holding ? -Infinity : 0;
  const wait = exhaustiveProfit(prices, limit, day + 1, holding);
  if (holding) return Math.max(wait, prices[day] + exhaustiveProfit(prices, limit - 1, day + 1, false));
  return limit ? Math.max(wait, -prices[day] + exhaustiveProfit(prices, limit, day + 1, true)) : wait;
}

test("all stock solvers match exhaustive buy/sell choices for every small price series", () => {
  for (let length = 0; length <= 7; length++) {
    for (const prices of arrays(length, [1, 2, 3])) {
      assert.equal(SOLVERS["Algorithmic Stock Trader I"](prices), exhaustiveProfit(prices, 1));
      assert.equal(SOLVERS["Algorithmic Stock Trader II"](prices), exhaustiveProfit(prices, length));
      assert.equal(SOLVERS["Algorithmic Stock Trader III"](prices), exhaustiveProfit(prices, 2));
      for (let limit = 0; limit <= 4; limit++) {
        assert.equal(SOLVERS["Algorithmic Stock Trader IV"]([limit, prices]), exhaustiveProfit(prices, limit));
      }
    }
  }
});

function exhaustivePaths(grid, row = 0, col = 0) {
  if (row >= grid.length || col >= grid[0].length || grid[row][col]) return 0;
  if (row === grid.length - 1 && col === grid[0].length - 1) return 1;
  return exhaustivePaths(grid, row + 1, col) + exhaustivePaths(grid, row, col + 1);
}

test("grid solvers match enumerated paths across all small obstacle grids", () => {
  for (let rows = 1; rows <= 3; rows++) {
    for (let cols = 1; cols <= 3; cols++) {
      const clear = Array.from({ length: rows }, () => Array(cols).fill(0));
      assert.equal(SOLVERS["Unique Paths in a Grid I"]([rows, cols]), exhaustivePaths(clear));
      for (const cells of arrays(rows * cols, [0, 1])) {
        const grid = Array.from({ length: rows }, (_, row) => cells.slice(row * cols, (row + 1) * cols));
        assert.equal(SOLVERS["Unique Paths in a Grid II"](grid), exhaustivePaths(grid));
      }
    }
  }
});

test("shortest paths match repeated distance relaxation on every small obstacle grid", () => {
  for (let rows = 1; rows <= 3; rows++) {
    for (let cols = 1; cols <= 3; cols++) {
      for (const cells of arrays(rows * cols, [0, 1])) {
        const grid = Array.from({ length: rows }, (_, r) => cells.slice(r * cols, (r + 1) * cols));
        const distance = Array.from({ length: rows }, () => Array(cols).fill(Infinity));
        if (!grid[0][0]) distance[0][0] = 0;
        for (let pass = 0; pass < rows * cols; pass++) {
          for (let r = 0; r < rows; r++) {
            for (let c = 0; c < cols; c++) {
              if (grid[r][c]) continue;
              for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
                distance[r][c] = Math.min(distance[r][c], (distance[r + dr]?.[c + dc] ?? Infinity) + 1);
              }
            }
          }
        }
        const path = SOLVERS["Shortest Path in a Grid"](grid);
        if (!Number.isFinite(distance.at(-1).at(-1))) { assert.equal(path, ""); continue; }
        assert.equal(path.length, distance.at(-1).at(-1));
        let r = 0;
        let c = 0;
        for (const step of path) {
          const [dr, dc] = { U: [-1, 0], D: [1, 0], L: [0, -1], R: [0, 1] }[step];
          r += dr; c += dc;
          assert.equal(grid[r]?.[c], 0);
        }
        assert.deepEqual([r, c], [rows - 1, cols - 1]);
      }
    }
  }
});

test("graph coloring matches all possible assignments for every graph up to five vertices", () => {
  for (let count = 0; count <= 5; count++) {
    const pairs = [];
    for (let a = 0; a < count; a++) for (let b = a + 1; b < count; b++) pairs.push([a, b]);
    for (const present of arrays(pairs.length, [0, 1])) {
      const edges = pairs.filter((_, i) => present[i]);
      const possible = [...arrays(count, [0, 1])].some(colors => edges.every(([a, b]) => colors[a] !== colors[b]));
      const answer = SOLVERS["Proper 2-Coloring of a Graph"]([count, edges]);
      if (!possible) assert.deepEqual(answer, []);
      else {
        assert.equal(answer.length, count);
        assert.ok(answer.every(color => color === 0 || color === 1));
        assert.ok(edges.every(([a, b]) => answer[a] !== answer[b]));
      }
    }
  }
});

function balanced(text) {
  let balance = 0;
  for (const char of text) {
    if (char === "(") balance++;
    if (char === ")" && --balance < 0) return false;
  }
  return balance === 0;
}

test("parentheses sanitizing matches exhaustive deletions and preserves other characters", () => {
  for (let length = 0; length <= 7; length++) {
    for (const chars of arrays(length, ["(", ")", "a"])) {
      const candidates = new Set();
      let longest = -1;
      for (const keep of arrays(length, [0, 1])) {
        if (chars.some((char, i) => char === "a" && !keep[i])) continue;
        const text = chars.filter((_, i) => keep[i]).join("");
        if (!balanced(text) || text.length < longest) continue;
        if (text.length > longest) { candidates.clear(); longest = text.length; }
        candidates.add(text);
      }
      const answers = SOLVERS["Sanitize Parentheses in Expression"](chars.join(""));
      assert.equal(new Set(answers).size, answers.length);
      assert.deepEqual([...answers].sort(), [...candidates].sort());
    }
  }
});

test("math expressions match independently evaluated operator placements for small digit strings", () => {
  for (let length = 1; length <= 4; length++) {
    for (const digits of arrays(length, ["0", "1", "2"])) {
      const byValue = new Map();
      for (const operators of arrays(length - 1, ["", "+", "-", "*"])) {
        const expression = digits.map((digit, i) => digit + (operators[i] ?? "")).join("");
        if (/(?:^|[+*-])0\d/.test(expression)) continue;
        const value = expression.split(/(?=[+-])/).reduce((sum, term) =>
          sum + term.split("*").map(Number).reduce((product, number) => product * number, 1), 0);
        if (!byValue.has(value)) byValue.set(value, []);
        byValue.get(value).push(expression);
      }
      for (let target = -10; target <= 10; target++) {
        const answers = SOLVERS["Find All Valid Math Expressions"]([digits.join(""), target]);
        assert.equal(new Set(answers).size, answers.length);
        assert.deepEqual([...answers].sort(), (byValue.get(target) ?? []).sort());
      }
    }
  }
});

test("Hamming codes preserve wide payloads and correct every single-bit corruption", () => {
  const encode = SOLVERS["HammingCodes: Integer to Encoded Binary"];
  const decode = SOLVERS["HammingCodes: Encoded Binary to Integer"];
  for (const value of [...Array.from({ length: 257 }, (_, i) => i), 2 ** 32 + 1234567, Number.MAX_SAFE_INTEGER, 2 ** 57]) {
    const encoded = encode(value);
    const bits = [...encoded].map(Number);
    assert.equal(bits.reduce((sum, bit) => sum + bit, 0) % 2, 0);
    for (let parity = 1; parity < bits.length; parity *= 2) {
      assert.equal(bits.reduce((sum, bit, index) => sum + ((index & parity) ? bit : 0), 0) % 2, 0);
    }
    assert.equal(bits.filter((_, i) => i > 0 && (i & (i - 1)) !== 0).join(""), value.toString(2));
    assert.equal(decode(encoded), value);
    for (let i = 0; i < encoded.length; i++) {
      const corrupted = encoded.slice(0, i) + (encoded[i] === "0" ? "1" : "0") + encoded.slice(i + 1);
      assert.equal(decode(corrupted), value);
    }
  }
});

function shortestEncodingLength(text) {
  // Dijkstra over all valid chunks, independent of the production prefix DP.
  const queue = [[0, 0, 0]];
  const seen = new Set();
  while (queue.length) {
    queue.sort((a, b) => a[0] - b[0]);
    const [cost, position, mode] = queue.shift();
    const key = `${position},${mode}`;
    if (seen.has(key)) continue;
    seen.add(key);
    if (position === text.length) return cost;
    queue.push([cost + 1, position, 1 - mode]);
    for (let length = 1; length <= 9 && position + length <= text.length; length++) {
      if (mode === 0) queue.push([cost + 1 + length, position + length, 1]);
      else {
        for (let distance = 1; distance <= Math.min(9, position); distance++) {
          let matches = true;
          for (let i = 0; i < length; i++) if (text[position + i] !== text[position + i - distance]) matches = false;
          if (matches) queue.push([cost + 2, position + length, 0]);
        }
      }
    }
  }
  assert.fail("Literal chunks must always provide an encoding");
}

test("LZ encodings are shortest and round-trip for exhaustive short strings", () => {
  for (let length = 0; length <= 7; length++) {
    for (const chars of arrays(length, ["a", "b", "0"])) {
      const text = chars.join("");
      const encoded = SOLVERS["Compression III: LZ Compression"](text);
      assert.equal(encoded.length, shortestEncodingLength(text));
      assert.equal(SOLVERS["Compression II: LZ Decompression"](encoded), text);
    }
  }
  const decode = SOLVERS["Compression II: LZ Decompression"];
  for (const invalid of ["x", "3ab", "1110", "012", "1a99x"]) assert.throws(() => decode(invalid));
});

test("Square Root keeps 200-digit precision and rounds at both integer boundaries", () => {
  const solve = SOLVERS["Square Root"];
  for (const root of [2n, 10n, 10n ** 100n + 123456789n]) {
    assert.equal(solve(root * root), root.toString());
    assert.equal(solve(root * root - root), (root - 1n).toString());
    assert.equal(solve(root * root - root + 1n), root.toString());
    assert.equal(solve(root * root + root), root.toString());
    assert.equal(solve(root * root + root + 1n), (root + 1n).toString());
  }
  assert.throws(() => solve(-1n));
  assert.throws(() => solve(100));
});

function isPrime(value) {
  if (value < 2) return false;
  for (let divisor = 2; divisor * divisor <= value; divisor++) if (value % divisor === 0) return false;
  return true;
}

test("prime counts match trial division, inclusive boundaries, and the maximum generated endpoint", () => {
  for (let low = 0; low <= 50; low++) {
    for (let high = low; high <= 80; high++) {
      let count = 0;
      for (let value = low; value <= high; value++) if (isPrime(value)) count++;
      assert.equal(SOLVERS["Total Number of Primes"]([low, high]), count);
    }
  }
  assert.equal(SOLVERS["Total Number of Primes"]([0, 1000000]), 78498);
  const low = 5999900;
  const high = 6000000;
  assert.equal(SOLVERS["Total Number of Primes"]([low, high]), Array.from({ length: high - low + 1 }, (_, i) => low + i).filter(isPrime).length);
});

test("rectangle coordinates achieve exhaustive maximal all-zero areas, including ties", () => {
  for (let rows = 1; rows <= 3; rows++) {
    for (let cols = 1; cols <= 3; cols++) {
      for (const cells of arrays(rows * cols, [0, 1])) {
        const grid = Array.from({ length: rows }, (_, r) => cells.slice(r * cols, (r + 1) * cols));
        let maxArea = 0;
        for (let top = 0; top < rows; top++) {
          for (let bottom = top; bottom < rows; bottom++) {
            for (let left = 0; left < cols; left++) {
              for (let right = left; right < cols; right++) {
                if (grid.slice(top, bottom + 1).every(row => row.slice(left, right + 1).every(cell => !cell))) {
                  maxArea = Math.max(maxArea, (bottom - top + 1) * (right - left + 1));
                }
              }
            }
          }
        }
        if (!maxArea) { assert.throws(() => SOLVERS["Largest Rectangle in a Matrix"](grid)); continue; }
        const [[top, left], [bottom, right]] = SOLVERS["Largest Rectangle in a Matrix"](grid);
        assert.ok(top >= 0 && left >= 0 && bottom < rows && right < cols && top <= bottom && left <= right);
        assert.ok(grid.slice(top, bottom + 1).every(row => row.slice(left, right + 1).every(cell => !cell)));
        assert.equal((bottom - top + 1) * (right - left + 1), maxArea);
      }
    }
  }
});

const DISABLED_FILE = "/data/contract-disabled-types.txt";
const STOP = new Error("stop test loop");

function game(saved = new Map()) {
  const g = {
    saved, contracts: new Map(), submitted: [], logs: [], sleeps: [], writes: [], pass: 0,
    host: "home", threads: 1, args: [], processes: [{ pid: 1, filename: "/scripts/contract-manager.js" }],
    graph: { home: ["locked", "other"], locked: ["home", "other"], other: ["home", "locked"] },
  };
  g.add = (host, file, type = "Find Largest Prime Factor", data = 21, expected = 7, tries = 1) => {
    g.contracts.set(`${host}/${file}`, { host, file, type, data, expected, tries });
  };
  g.ns = {
    pid: 1, args: g.args, getHostname: () => g.host, self: () => ({ threads: g.threads }),
    ps: () => g.processes, fileExists: file => saved.has(file), read: file => saved.get(file) ?? "",
    write: async (file, value, mode) => {
      g.writes.push({ file, value, mode });
      if (g.writeFails) throw new Error("disk error");
      if (!g.dropWrite) saved.set(file, value);
      g.onWrite?.();
    },
    scan: host => { g.onScan?.(host); return g.graph[host]; },
    ls: (host, filter) => {
      g.onList?.(host);
      return [...g.contracts.values()].filter(c => c.host === host && c.file.includes(filter)).map(c => c.file);
    },
    codingcontract: {
      getContract: (file, host) => {
        g.onRead?.(host, file);
        const c = g.contracts.get(`${host}/${file}`);
        return {
          type: c.type, data: globalThis.structuredClone(c.data), numTriesRemaining: () => c.tries,
          submit: answer => {
            g.submitted.push({ host, file, type: c.type, answer });
            if (g.throwSubmit || g.throwSubmitType === c.type) throw new Error("submission error");
            c.tries--;
            if (g.reject || !assertAnswer(answer, c.expected)) {
              if (c.tries <= 0) g.contracts.delete(`${host}/${file}`);
              return "";
            }
            g.contracts.delete(`${host}/${file}`);
            return "$100 reward";
          },
        };
      },
    },
    tprint: message => g.logs.push(message), print: message => g.logs.push(message), disableLog: () => {},
    sleep: async ms => {
      g.sleeps.push(ms);
      g.pass++;
      g.onSleep?.();
      if (g.pass >= (g.passes ?? 1)) throw STOP;
    },
  };
  return g;
}

function assertAnswer(answer, expected) {
  try { assert.deepEqual(answer, expected); return true; } catch { return false; }
}

async function run(g) {
  try { await main(g.ns); } catch (error) { if (error !== STOP) throw error; }
}

test("manager scans cycles, home and unrooted hosts, exact suffixes, native answers and last attempts", async () => {
  const g = game();
  g.add("home", "prime.cct");
  g.add("locked", "jumps.cct", "Array Jumping Game", [0, 1], 0);
  g.add("other", "intervals.cct", "Merge Overlapping Intervals", [[3, 4], [1, 3]], [[1, 4]]);
  g.add("other", "ips.cct", "Generate IP Addresses", "999999999999", []);
  g.add("home", "ignored.cct.txt");
  await run(g);
  assert.deepEqual(g.submitted.map(c => c.answer), [7, 0, [[1, 4]], []]);
  assert.equal(g.contracts.size, 1);
  assert.equal(g.writes.length, 0);
  assert.equal(g.logs.filter(log => log.startsWith("SOLVED")).length, 4);
  assert.match(g.logs.find(log => log.startsWith("SOLVED")), /home\/prime.cct.*Find Largest Prime Factor.*\$100 reward/);
  assert.deepEqual(g.sleeps, [30000]);
});

test("manager discovers later contracts and reports each unsupported contract once per run", async () => {
  const g = game();
  g.passes = 3;
  g.add("home", "unsupported.cct", "Future Contract Type", "data");
  g.add("home", "prototype.cct", "__proto__", "data");
  g.onSleep = () => { if (g.pass === 1) g.add("locked", "new.cct"); };
  await run(g);
  assert.equal(g.logs.filter(log => log.startsWith("SKIP")).length, 2);
  assert.deepEqual(g.submitted.map(c => c.file), ["new.cct"]);
  assert.equal(g.contracts.size, 2);
});

test("scan, listing and read errors retry without preventing other contracts", async () => {
  for (const operation of ["scan", "listing", "read"]) {
    const g = game();
    g.passes = 2;
    g.add("home", "good.cct");
    g.add("locked", "retry.cct");
    const fail = host => { if (g.pass === 0 && host === "locked") throw new Error(`${operation} unavailable`); };
    if (operation === "scan") g.onScan = fail;
    if (operation === "listing") g.onList = fail;
    if (operation === "read") g.onRead = fail;
    await run(g);
    assert.equal(g.submitted.length, 2, operation);
    assert.equal(g.contracts.size, 0, operation);
    assert.ok(g.logs.some(log => log.includes("WARN")), operation);
  }
});

test("failed type is persisted before further work and stays disabled across restarts", async () => {
  const g = game();
  g.passes = 2;
  g.add("home", "bad.cct", "Find Largest Prime Factor", 21, 999, 3);
  g.add("home", "same.cct");
  g.add("locked", "other.cct", "Array Jumping Game", [1, 0], 1);
  g.onWrite = () => assert.equal(g.submitted.length, 1);
  await run(g);
  assert.deepEqual(g.submitted.map(c => c.file), ["bad.cct", "other.cct"]);
  assert.equal(g.contracts.get("home/bad.cct").tries, 2);
  assert.deepEqual(JSON.parse(g.saved.get(DISABLED_FILE)), ["Find Largest Prime Factor"]);
  assert.match(g.logs.find(log => log.startsWith("FAILED")), /input=21; answer=7/);
  const restarted = game(g.saved);
  restarted.add("home", "bad.cct");
  restarted.add("locked", "other.cct", "Array Jumping Game", [1, 0], 1);
  await run(restarted);
  assert.deepEqual(restarted.submitted.map(c => c.file), ["other.cct"]);
  assert.equal(restarted.writes.length, 0);
  g.saved.set(DISABLED_FILE, "[]");
  const cleared = game(g.saved);
  cleared.add("home", "fixed.cct");
  await run(cleared);
  assert.equal(cleared.submitted.length, 1);
});

test("solver and submission exceptions disable their types without repeated attempts", async () => {
  for (const failure of ["solver", "submission"]) {
    const g = game();
    g.add("home", "bad.cct", "Find Largest Prime Factor", failure === "solver" ? 0 : 21, 7, 3);
    g.add("home", "same.cct");
    g.throwSubmit = failure === "submission";
    await run(g);
    assert.equal(g.submitted.length, failure === "solver" ? 0 : 1);
    assert.deepEqual(JSON.parse(g.saved.get(DISABLED_FILE)), ["Find Largest Prime Factor"]);
    assert.ok(g.logs.some(log => log.includes("ERROR")));
  }
});

test("manager submits precise Square Root strings and valid empty string answers", async () => {
  const g = game();
  const root = 10n ** 100n + 123456789n;
  g.add("home", "root.cct", "Square Root", root * root + root, root.toString());
  g.add("locked", "no-path.cct", "Shortest Path in a Grid", [[0, 1], [1, 0]], "");
  await run(g);
  assert.deepEqual(g.submitted.map(c => c.answer), [root.toString(), ""]);
  assert.equal(g.writes.length, 0);
  assert.ok(g.logs.some(log => log.includes("30 solver types")));
});

for (const failure of ["solver", "rejected", "submission"]) {
  test(`Square Root ${failure} failure logs BigInt, persists its disabled type, and continues safely`, async () => {
    const g = game();
    g.passes = 2;
    const data = failure === "solver" ? -1n : (10n ** 100n) ** 2n;
    g.add("home", "bad-root.cct", "Square Root", data, "wrong answer", 3);
    g.add("home", "same-type.cct", "Square Root", 100n, "10");
    g.add("locked", "prime.cct");
    if (failure === "submission") g.throwSubmitType = "Square Root";
    g.onWrite = () => assert.equal(g.submitted.length, failure === "solver" ? 0 : 1);
    await run(g);
    assert.deepEqual(g.submitted.map(c => c.file), failure === "solver" ? ["prime.cct"] : ["bad-root.cct", "prime.cct"]);
    assert.deepEqual(JSON.parse(g.saved.get(DISABLED_FILE)), ["Square Root"]);
    const diagnostic = g.logs.find(log => /^(SOLVER ERROR|SUBMISSION ERROR|FAILED)/.test(log));
    assert.ok(diagnostic.includes(`input="${data}"`));
    if (failure !== "solver") assert.ok(diagnostic.includes(`answer="${10n ** 100n}"`));
    const restarted = game(g.saved);
    restarted.add("home", "root.cct", "Square Root", 100n, "10");
    await run(restarted);
    assert.equal(restarted.submitted.length, 0);
  });
}

test("malformed persisted state and failed or lost writes stop the manager safely", async () => {
  for (const saved of ["", "bad json", "null", "{}", "[1]", '[""]']) {
    const g = game(new Map([[DISABLED_FILE, saved]]));
    g.add("home", "prime.cct");
    await run(g);
    assert.equal(g.submitted.length, 0);
    assert.equal(g.sleeps.length, 0);
    assert.match(g.logs[0], /stopped: cannot load/);
  }
  for (const failure of ["writeFails", "dropWrite"]) {
    const g = game();
    g[failure] = true;
    g.add("home", "bad.cct", "Find Largest Prime Factor", 21, 999);
    g.add("locked", "other.cct", "Array Jumping Game", [1, 0], 1);
    await run(g);
    assert.equal(g.submitted.length, 1);
    assert.equal(g.sleeps.length, 0);
    assert.ok(g.logs.some(log => log.includes("stopped: cannot persist")));
  }
});

test("manager preserves multiple disabled types and skips exhausted contracts", async () => {
  const g = game(new Map([[DISABLED_FILE, '["Generate IP Addresses"]']]));
  g.add("home", "bad.cct", "Find Largest Prime Factor", 21, 999);
  g.add("home", "disabled.cct", "Generate IP Addresses", "0000", ["0.0.0.0"]);
  g.add("locked", "exhausted.cct", "Array Jumping Game", [0, 1], 0, 0);
  await run(g);
  assert.equal(g.submitted.length, 1);
  assert.deepEqual(JSON.parse(g.saved.get(DISABLED_FILE)), ["Generate IP Addresses", "Find Largest Prime Factor"]);
});

test("manager rejects wrong hosts, threads, arguments and duplicate processes before discovery", async () => {
  for (const invalid of ["host", "threads", "args", "duplicate"]) {
    const g = game();
    if (invalid === "host") g.host = "locked";
    if (invalid === "threads") g.threads = 2;
    if (invalid === "args") g.args.push("extra");
    if (invalid === "duplicate") g.processes.push({ pid: 2, filename: "scripts/contract-manager.js" });
    g.onScan = () => assert.fail("invalid manager must not scan");
    await run(g);
    assert.equal(g.logs.length, 1);
    assert.equal(g.sleeps.length, 0);
  }
});
