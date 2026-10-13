import assert from "node:assert/strict";
import test from "node:test";
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
};

for (const [type, cases] of Object.entries(fixtures)) {
  test(`${type}: known answers, edges, and input preservation`, () => {
    for (const [data, expected] of cases) {
      const original = globalThis.structuredClone(data);
      assert.deepEqual(SOLVERS[type](data), expected);
      assert.deepEqual(data, original);
    }
  });
}

test("every advertised solver has known-answer coverage", () => {
  assert.deepEqual(Object.keys(SOLVERS).sort(), Object.keys(fixtures).sort());
  assert.equal(Object.keys(SOLVERS).length, 16);
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
            if (g.throwSubmit) throw new Error("submission error");
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
  g.add("home", "unsupported.cct", "Compression III: LZ Compression", "data");
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
