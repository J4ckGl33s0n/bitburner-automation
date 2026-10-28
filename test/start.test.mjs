import assert from "node:assert/strict";
import test from "node:test";
import { main as start } from "../home/scripts/start.js";
import { main as retry } from "../home/scripts/startup-retry.js";
import { RETRY_SCRIPT, RETRY_STATE, STARTUPS, recordAttempt, tryStartup, requestHomeRam } from "../home/scripts/startup.js";
import { PURCHASE_MANAGER, STOCK_MANAGER } from "../home/scripts/spending.js";
import { DARKNET_FILES, DARKNET_MANAGER, DARKNET_PROGRAM } from "../home/scripts/darknet.js";

const CONTRACT_MANAGER = "/scripts/contract-manager.js";
const CONTRACT_SOLVERS = "/scripts/contracts.js";
const GO_MANAGER = "/scripts/go-manager.js";

function game(args = []) {
  const data = new Map();
  const g = {
    processes: [{ pid: 1, filename: "/scripts/start.js", threads: 1 }],
    files: new Set([PURCHASE_MANAGER, "/scripts/spending.js", "/scripts/hacknet-manager.js", "/scripts/hack.js"]), events: [], logs: [], args,
    host: "home", launchFails: false, tor: false, maxRam: 256, usedRam: 30,
  };
  g.ns = {
    read: file => data.get(file) ?? "", write: (file, value) => { data.set(file, value); },
    kill: pid => { g.processes = g.processes.filter(p => p.pid !== pid); },
    disableLog: () => {}, print: message => g.logs.push(message),
    getResetInfo: () => ({ lastAugReset: 1 }), go: { getOpponent: () => "Netburners" },
    stock: { hasTixApiAccess: () => g.tix ?? false, has4SDataTixApi: () => g.fourS ?? false },
    pid: 1, args, self: () => g.processes[0], getHostname: () => g.host,
    getScriptName: () => "/scripts/start.js", ps: () => g.processes,
    scan: () => [],
    fileExists: (file, host) => host === "home" && g.files.has(file),
    hasTorRouter: () => g.tor,
    getScriptRam: file => file === DARKNET_MANAGER ? 4 : file === CONTRACT_MANAGER ? 24 : 8,
    getServerMaxRam: () => g.maxRam, getServerUsedRam: () => g.usedRam,
    tprint: message => g.logs.push(message), isRunning: pid => g.processes.some(p => p.pid === pid),
    exec: (file, host, options, ...scriptArgs) => {
      g.events.push({ type: "exec", file, host, options, args: scriptArgs });
      if (g.launchFails || g.failFile === file) return 0;
      if (g.throwFile === file) throw new Error("launch error");
      const pid = Math.max(...g.processes.map(p => p.pid)) + 1;
      g.processes.push({ pid, filename: file, threads: options.threads, args: scriptArgs });
      if (g.trackRam) g.usedRam += g.ns.getScriptRam(file);
      return pid;
    },
    sleep: async ms => { g.events.push({ type: "sleep", ms }); g.onSleep?.(); },
    spawn: (file, options, ...scriptArgs) => {
      g.events.push({ type: "spawn", file, options, args: scriptArgs });
      g.processes = g.processes.filter(p => p.pid !== 1);
      if (g.spawnError) throw g.spawnError;
    },
  };
  return g;
}

test("startup requests RAM from remote hacking controllers and bounds unavailable handoffs", async () => {
  const g = game(); unlockStocks(g);
  g.usedRam = 250;
  const manager = { pid: 99, filename: "/scripts/hack-manager.js", threads: 1 };
  g.ns.scan = host => host === "home" ? ["remote"] : ["home"];
  g.ns.ps = host => host === "remote" ? [manager] : g.processes;
  const requests = [];
  g.ns.writePort = (pid, request) => requests.push({ port: pid, ...request });
  g.onSleep = () => { g.usedRam = 200; };
  assert.equal((await tryStartup(g.ns, STARTUPS.find(e => e.id === "stocks"))).done, true);
  assert.deepEqual(requests, [{ port: 99, pid: 1, type: "home-ram", ram: 12 }]);
  g.onSleep = undefined; g.usedRam = 250; g.events.length = 0;
  assert.equal(await requestHomeRam(g.ns, 12), false);
  assert.equal(g.events.filter(e => e.type === "sleep").length, 10);
  for (const ram of [Infinity, NaN, 0, -1, 300]) assert.equal(await requestHomeRam(g.ns, ram), false);
});

test("retry ownership survives reloads, discovers rewarded access, and leaves later stops alone", async () => {
  const g = game();
  g.files.add(RETRY_SCRIPT);
  await start(g.ns);
  const saved = JSON.parse(g.ns.read(RETRY_STATE));
  assert.ok(!saved.pending.some(e => e.id === "purchases"));
  assert.ok(saved.pending.some(e => e.id === "stocks"));
  g.processes = g.processes.filter(p => p.filename !== PURCHASE_MANAGER);
  g.processes = [{ pid: 1, filename: RETRY_SCRIPT, threads: 1 }];
  unlockStocks(g);
  const stop = new Error("test stop");
  let polls = 0;
  const now = Date.now;
  Date.now = () => 10000000000000;
  g.ns.sleep = async ms => { if (ms === 30000 && ++polls > 1) throw stop; };
  try { await assert.rejects(retry(g.ns), e => e === stop); }
  finally { Date.now = now; }
  assert.ok(g.processes.some(p => p.filename === STOCK_MANAGER));
  assert.ok(!g.processes.some(p => p.filename === PURCHASE_MANAGER));
  assert.ok(!JSON.parse(g.ns.read(RETRY_STATE)).pending.some(e => e.id === "stocks"));
});

test("retry delays and bounded failures do not count missing eligibility as a launch failure", () => {
  const e = { failures: 0 };
  for (const delay of [30000, 60000, 120000, 0]) {
    recordAttempt(e, { failed: true, reason: "failed" }, 1000);
    assert.equal(e.nextAt, 1000 + delay);
  }
  assert.equal(e.suspended, true);
  const waiting = { failures: 0 };
  for (let i = 0; i < 20; i++) recordAttempt(waiting, { reason: "missing access" }, 1000);
  assert.equal(waiting.failures, 0);
  assert.equal(waiting.suspended, false);
});

test("retry loop enforces cooldowns, persists exhaustion, and refuses another reset's state", async () => {
  const g = game(); unlockStocks(g); g.failFile = STOCK_MANAGER;
  g.processes = [{ pid: 1, filename: RETRY_SCRIPT, threads: 1 }];
  g.ns.write(RETRY_STATE, JSON.stringify({ reset: 1, ready: true, pending: [{ id: "stocks", failures: 0, nextAt: 0, suspended: false }] }));
  let time = 0;
  const now = Date.now;
  const stop = new Error("stop retry test");
  Date.now = () => time;
  g.ns.sleep = async ms => { time += ms; if (time > 240000) throw stop; };
  try { await assert.rejects(retry(g.ns), e => e === stop); }
  finally { Date.now = now; }
  assert.equal(g.events.filter(e => e.file === STOCK_MANAGER).length, 4);
  assert.equal(JSON.parse(g.ns.read(RETRY_STATE)).pending[0].suspended, true);
  assert.equal(g.logs.filter(l => l.includes("exhausted")).length, 1);
  const h = game(); h.processes = [{ pid: 1, filename: RETRY_SCRIPT, threads: 1 }];
  h.ns.write(RETRY_STATE, JSON.stringify({ reset: 0, ready: true, pending: [] }));
  await retry(h.ns);
  assert.ok(!h.events.some(e => e.type === "exec"));
});

test("preserved Go boards are not launched or queued; retry checks exact RAM boundaries", async () => {
  const g = game(); enableGo(g);
  g.ns.go.getOpponent = () => "No AI";
  assert.deepEqual(await tryStartup(g.ns, STARTUPS.at(-1)), { done: true, reason: "board preserved" });
  for (const free of [11.99, 12]) {
    const h = game(); unlockStocks(h); h.maxRam = h.usedRam + free;
    const result = await tryStartup(h.ns, STARTUPS.find(e => e.id === "stocks"));
    assert.equal(result.done, free === 12);
  }
});

test("retry startup reserves its own RAM and persistence failures leave hacking available", async () => {
  const g = game(); g.files.add(RETRY_SCRIPT); enableGo(g); g.trackRam = true;
  g.maxRam = g.usedRam + 24;
  await start(g.ns);
  assert.ok(g.events.some(e => e.file === RETRY_SCRIPT));
  assert.ok(!g.events.some(e => e.file === GO_MANAGER));
  assert.equal(g.events.at(-1).type, "spawn");
  const h = game(); h.files.add(RETRY_SCRIPT); h.ns.write = () => {};
  await start(h.ns);
  assert.equal(h.events.at(-1).type, "spawn");
  assert.ok(h.logs.some(l => l.includes("Cannot persist")));
});

test("master starts purchases first, yields, then hands off RAM to hacking with defaults", async () => {
  const g = game();
  await start(g.ns);
  assert.deepEqual(g.events, [
    { type: "exec", file: PURCHASE_MANAGER, host: "home", options: { threads: 1, preventDuplicates: true }, args: [] },
    { type: "sleep", ms: 200 },
    { type: "spawn", file: "/scripts/hack.js", options: { threads: 1, spawnDelay: 0 }, args: [0, 0, 0] },
  ]);
  assert.ok(!g.processes.some(p => p.pid === 1));
  assert.ok(g.processes.some(p => p.pid === 2));
});

function unlockDarknet(g) {
  g.tor = true;
  for (const file of [DARKNET_PROGRAM, DARKNET_MANAGER, ...DARKNET_FILES]) g.files.add(file);
}

function unlockStocks(g) {
  g.tix = true; g.fourS = true;
  g.files.add(STOCK_MANAGER); g.files.add("/scripts/spending.js");
}

function enableGo(g) {
  g.files.add(GO_MANAGER); g.files.add("/scripts/go.js");
}

test("master starts IPvGO after stocks and all existing managers, or reuses it", async () => {
  const g = game([5, 4]); unlockDarknet(g); unlockStocks(g); enableGo(g);
  g.files.add(CONTRACT_MANAGER); g.files.add(CONTRACT_SOLVERS);
  await start(g.ns);
  assert.deepEqual(g.events.filter(e => e.type === "exec").map(e => e.file),
    [PURCHASE_MANAGER, DARKNET_MANAGER, CONTRACT_MANAGER, STOCK_MANAGER, GO_MANAGER]);
  assert.deepEqual(g.events.at(-1).args, [5, 4, 0]);
  const h = game(); enableGo(h);
  h.processes.push({ pid: 99, filename: "scripts/go-manager.js", threads: 1 });
  await start(h.ns);
  assert.ok(!h.events.some(e => e.type === "exec" && e.file === GO_MANAGER));
});

test("IPvGO startup failures, missing files and RAM never prevent hacking", async () => {
  for (const failure of ["manager", "helper", "ram", "launch", "throw", "exit", "invalid RAM"]) {
    const g = game(); enableGo(g);
    if (failure === "manager") g.files.delete(GO_MANAGER);
    if (failure === "helper") g.files.delete("/scripts/go.js");
    if (failure === "ram") g.maxRam = g.usedRam;
    if (failure === "launch") g.failFile = GO_MANAGER;
    if (failure === "throw") g.throwFile = GO_MANAGER;
    if (failure === "exit") g.onSleep = () => { g.processes = g.processes.filter(p => p.filename !== GO_MANAGER); };
    if (failure === "invalid RAM") g.ns.getScriptRam = file => file === GO_MANAGER ? NaN : 8;
    await start(g.ns);
    assert.equal(g.events.at(-1).type, "spawn", failure);
    assert.ok(g.logs.some(l => l.includes("IPvGO")), failure);
  }
});

test("IPvGO checks fresh RAM and preserves hacking handoff at the exact boundary", async () => {
  for (const free of [11.99, 12]) {
    const g = game(); enableGo(g); g.maxRam = g.usedRam + free;
    await start(g.ns);
    assert.equal(g.events.some(e => e.type === "exec" && e.file === GO_MANAGER), free === 12);
  }
  const g = game(); enableGo(g); unlockStocks(g); g.trackRam = true;
  g.maxRam = g.usedRam + 20;
  await start(g.ns);
  assert.ok(g.events.some(e => e.type === "exec" && e.file === STOCK_MANAGER));
  assert.ok(!g.events.some(e => e.type === "exec" && e.file === GO_MANAGER));
  assert.equal(g.events.at(-1).type, "spawn");
});

test("master starts stocks after existing managers and reuses active stocks", async () => {
  const g = game([5, 4]);
  unlockDarknet(g); unlockStocks(g);
  g.files.add(CONTRACT_MANAGER); g.files.add(CONTRACT_SOLVERS);
  await start(g.ns);
  assert.deepEqual(g.events.filter(e => e.type === "exec").map(e => e.file),
    [PURCHASE_MANAGER, DARKNET_MANAGER, CONTRACT_MANAGER, STOCK_MANAGER]);
  assert.deepEqual(g.events.at(-1).args, [5, 4, 0]);
  const h = game(); unlockStocks(h);
  h.processes.push({ pid: 99, filename: "scripts/stock-manager.js", threads: 1 });
  await start(h.ns);
  assert.ok(!h.events.some(e => e.type === "exec" && e.file === STOCK_MANAGER));
});

test("stocks never prevent hacking when locked, missing files, short on RAM or failing startup", async () => {
  for (const failure of ["tix", "fourS", "source", "helper", "ram", "launch", "throw", "exit", "invalid RAM"]) {
    const g = game(); unlockStocks(g);
    if (["tix", "fourS"].includes(failure)) g[failure] = false;
    if (failure === "source") g.files.delete(STOCK_MANAGER);
    if (failure === "helper") g.files.delete("/scripts/spending.js");
    if (failure === "ram") g.maxRam = g.usedRam;
    if (failure === "launch") g.failFile = STOCK_MANAGER;
    if (failure === "throw") g.throwFile = STOCK_MANAGER;
    if (failure === "exit") g.onSleep = () => { g.processes = g.processes.filter(p => p.filename !== STOCK_MANAGER); };
    if (failure === "invalid RAM") g.ns.getScriptRam = file => file === STOCK_MANAGER ? NaN : 8;
    await start(g.ns);
    assert.equal(g.events.at(-1).type, "spawn", failure);
    assert.ok(g.logs.some(l => /Stock/.test(l)), failure);
  }
});

test("stock startup uses fresh RAM and preserves the exact hacking handoff boundary", async () => {
  for (const free of [11.99, 12]) {
    const g = game(); unlockStocks(g);
    g.maxRam = g.usedRam + free;
    await start(g.ns);
    assert.equal(g.events.some(e => e.type === "exec" && e.file === STOCK_MANAGER), free === 12);
  }
  const g = game(); unlockStocks(g); unlockDarknet(g); g.trackRam = true;
  g.maxRam = g.usedRam + 20;
  await start(g.ns);
  assert.ok(!g.events.some(e => e.type === "exec" && e.file === STOCK_MANAGER));
  assert.equal(g.events.at(-1).type, "spawn");
});

test("master starts darknet after purchases and before hacking, or reuses an active coordinator", async () => {
  const g = game([4, 7]);
  unlockDarknet(g);
  await start(g.ns);
  assert.deepEqual(g.events.map(e => e.type), ["exec", "sleep", "exec", "sleep", "spawn"]);
  assert.equal(g.events[2].file, DARKNET_MANAGER);
  assert.deepEqual(g.events[2].args, []);
  assert.deepEqual(g.events.at(-1).args, [4, 7, 0]);
  const active = game();
  active.processes.push({ pid: 88, filename: DARKNET_MANAGER, threads: 1, args: [] });
  await start(active.ns);
  assert.ok(!active.events.some(e => e.type === "exec" && e.file === DARKNET_MANAGER));
  assert.ok(active.processes.some(p => p.pid === 88));
});

test("darknet failures and missing prerequisites/files never prevent the hacking handoff", async () => {
  for (const failure of ["tor", "program", "manager", ...DARKNET_FILES, "ram", "launch", "throw", "exit", "invalid RAM"]) {
    const g = game();
    unlockDarknet(g);
    if (failure === "tor") g.tor = false;
    if (failure === "program") g.files.delete(DARKNET_PROGRAM);
    if (failure === "manager") g.files.delete(DARKNET_MANAGER);
    if (DARKNET_FILES.includes(failure)) g.files.delete(failure);
    if (failure === "ram") g.maxRam = g.usedRam + 7.99;
    if (failure === "launch") g.failFile = DARKNET_MANAGER;
    if (failure === "throw") g.throwFile = DARKNET_MANAGER;
    if (failure === "exit") g.onSleep = () => { g.processes = g.processes.filter(p => p.filename !== DARKNET_MANAGER); };
    if (failure === "invalid RAM") g.ns.getScriptRam = () => NaN;
    await start(g.ns);
    assert.equal(g.events.at(-1).type, "spawn", failure);
    assert.ok(g.logs.some(message => message.includes("Darknet")), failure);
  }
});

test("darknet startup protects the hacking launcher handoff and 4 GB home reserve at the exact boundary", async () => {
  for (const free of [7.99, 8]) {
    const g = game();
    unlockDarknet(g);
    g.maxRam = g.usedRam + free;
    await start(g.ns);
    assert.equal(g.events.some(e => e.type === "exec" && e.file === DARKNET_MANAGER), free === 8);
    assert.equal(g.events.at(-1).type, "spawn");
  }
});

test("master reuses a purchase manager with its existing settings and forwards hacking arguments", async () => {
  const g = game([5, 12, 1]);
  g.processes.push({ pid: 99, filename: "scripts/purchase-manager.js", threads: 1, args: ["--reserve", 500000] });
  await start(g.ns);
  assert.deepEqual(g.events.map(e => e.type), ["sleep", "spawn"]);
  assert.deepEqual(g.events.at(-1).args, [5, 12, 1]);
  assert.deepEqual(g.processes.find(p => p.pid === 99).args, ["--reserve", 500000]);
});

test("master rejects invalid arguments, wrong hosts, multiple threads, missing files, and duplicate starts", async () => {
  for (const args of [[-1, 0], [3, -1], [1.5, 0], [3, Infinity], [0, 0, 2], [0, 0, -1], [0, 0, 0.5], ["bad"], [0, "bad"], [0, 0, "bad"]]) {
    const g = game(args);
    await start(g.ns);
    assert.deepEqual(g.events, []);
    assert.match(g.logs[0], /Usage:/);
  }
  for (const invalid of ["host", "threads", "hacking file", "duplicate"]) {
    const g = game();
    if (invalid === "host") g.host = "remote";
    if (invalid === "threads") g.processes[0].threads = 2;
    if (invalid === "hacking file") g.files.delete("/scripts/hack.js");
    if (invalid === "duplicate") g.processes.push({ pid: 99, filename: "scripts/start.js", threads: 1 });
    await start(g.ns);
    assert.deepEqual(g.events, [], invalid);
    assert.equal(g.logs.length, 1);
  }
});

test("missing purchase source is queued without preventing the hacking handoff", async () => {
  const g = game(); g.files.delete(PURCHASE_MANAGER); g.files.add(RETRY_SCRIPT);
  await start(g.ns);
  assert.equal(g.events.at(-1).type, "spawn");
  assert.ok(JSON.parse(g.ns.read(RETRY_STATE)).pending.some(e => e.id === "purchases" && e.reason === "restore source files"));
});

test("master warns and continues hacking after purchase launch failure, early exit, or standalone Hacknet", async () => {
  for (const failure of ["launch", "exit", "standalone"]) {
    const g = game();
    if (failure === "launch") g.launchFails = true;
    if (failure === "exit") g.onSleep = () => { g.processes = g.processes.filter(p => p.pid !== 2); };
    if (failure === "standalone") g.processes.push({ pid: 99, filename: "scripts/hacknet-manager.js", threads: 1 });
    await start(g.ns);
    assert.equal(g.events.at(-1).type, "spawn");
    assert.match(g.logs[0], /Purchase manager unavailable/);
    if (failure === "standalone") {
      assert.deepEqual(g.events.map(e => e.type), ["spawn"]);
      assert.ok(g.processes.some(p => p.pid === 99));
    }
  }
});

test("master does not swallow spawn termination or stop the purchase manager", async () => {
  const g = game();
  g.spawnError = new Error("ScriptDeath");
  await assert.rejects(start(g.ns), error => error === g.spawnError);
  assert.ok(g.processes.some(p => p.pid === 2));
});

test("master starts contracts after darknet and before hacking, or reuses an active manager", async () => {
  const g = game([4, 7]);
  unlockDarknet(g);
  g.files.add(CONTRACT_MANAGER).add(CONTRACT_SOLVERS);
  await start(g.ns);
  assert.deepEqual(g.events.map(e => e.type), ["exec", "sleep", "exec", "sleep", "exec", "sleep", "spawn"]);
  assert.deepEqual(g.events.filter(e => e.type === "exec").map(e => e.file), [PURCHASE_MANAGER, DARKNET_MANAGER, CONTRACT_MANAGER]);
  assert.deepEqual(g.events[4].options, { threads: 1, preventDuplicates: true });
  assert.deepEqual(g.events[4].args, []);
  assert.deepEqual(g.events.at(-1).args, [4, 7, 0]);
  const active = game();
  active.processes.push({ pid: 88, filename: "scripts/contract-manager.js", threads: 1, args: [] });
  await start(active.ns);
  assert.ok(!active.events.some(e => e.type === "exec" && e.file === CONTRACT_MANAGER));
  assert.ok(active.processes.some(p => p.pid === 88));
});

test("missing contract files, invalid RAM and startup failures always preserve hacking", async () => {
  for (const failure of [CONTRACT_MANAGER, CONTRACT_SOLVERS, "ram", "launch", "throw", "exit", "NaN", "zero", "negative", "infinite"]) {
    const g = game();
    g.files.add(CONTRACT_MANAGER).add(CONTRACT_SOLVERS);
    if ([CONTRACT_MANAGER, CONTRACT_SOLVERS].includes(failure)) g.files.delete(failure);
    if (failure === "ram") g.maxRam = g.usedRam + 27.99;
    if (failure === "launch") g.failFile = CONTRACT_MANAGER;
    if (failure === "throw") g.throwFile = CONTRACT_MANAGER;
    if (failure === "exit") g.onSleep = () => { g.processes = g.processes.filter(p => p.filename !== CONTRACT_MANAGER); };
    const invalidRam = { NaN, zero: 0, negative: -1, infinite: Infinity };
    if (Object.hasOwn(invalidRam, failure)) {
      g.ns.getScriptRam = file => file === CONTRACT_MANAGER ? invalidRam[failure] : 8;
    }
    await start(g.ns);
    assert.equal(g.events.at(-1).type, "spawn", failure);
    assert.ok(g.logs.some(log => /Contract/.test(log)), failure);
    if ([CONTRACT_MANAGER, CONTRACT_SOLVERS, "ram", "NaN", "zero", "negative", "infinite"].includes(failure)) {
      assert.ok(!g.events.some(e => e.type === "exec" && e.file === CONTRACT_MANAGER), failure);
    }
  }
});

test("contract startup protects handoff and reserve at exact RAM boundaries", async () => {
  for (const [masterRam, hackingRam, requiredFree] of [[8, 8, 28], [8, 16, 36], [16, 8, 24]]) {
    for (const free of [requiredFree - 0.01, requiredFree]) {
      const g = game();
      g.files.add(CONTRACT_MANAGER).add(CONTRACT_SOLVERS);
      g.maxRam = g.usedRam + free;
      g.ns.getScriptRam = file => file === CONTRACT_MANAGER ? 24 : file === "/scripts/hack.js" ? hackingRam : masterRam;
      await start(g.ns);
      assert.equal(g.events.some(e => e.type === "exec" && e.file === CONTRACT_MANAGER), free === requiredFree);
      assert.equal(g.events.at(-1).type, "spawn");
    }
  }
});

test("contract startup uses fresh RAM after purchase and darknet launches", async () => {
  for (const initialFree of [39.99, 40]) {
    const g = game();
    unlockDarknet(g);
    g.files.add(CONTRACT_MANAGER).add(CONTRACT_SOLVERS);
    g.trackRam = true;
    g.maxRam = g.usedRam + initialFree;
    await start(g.ns);
    assert.ok(g.events.some(e => e.type === "exec" && e.file === DARKNET_MANAGER));
    assert.equal(g.events.some(e => e.type === "exec" && e.file === CONTRACT_MANAGER), initialFree === 40);
    assert.equal(g.events.at(-1).type, "spawn");
  }
});
