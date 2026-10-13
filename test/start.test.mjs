import assert from "node:assert/strict";
import test from "node:test";
import { main as start } from "../home/scripts/start.js";
import { PURCHASE_MANAGER } from "../home/scripts/spending.js";
import { DARKNET_FILES, DARKNET_MANAGER, DARKNET_PROGRAM } from "../home/scripts/darknet.js";

const CONTRACT_MANAGER = "/scripts/contract-manager.js";
const CONTRACT_SOLVERS = "/scripts/contracts.js";

function game(args = []) {
  const g = {
    processes: [{ pid: 1, filename: "/scripts/start.js", threads: 1 }],
    files: new Set([PURCHASE_MANAGER, "/scripts/hack.js"]), events: [], logs: [], args,
    host: "home", launchFails: false, tor: false, maxRam: 256, usedRam: 30,
  };
  g.ns = {
    pid: 1, args, self: () => g.processes[0], getHostname: () => g.host,
    getScriptName: () => "/scripts/start.js", ps: () => g.processes,
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

test("master starts purchases first, yields, then hands off RAM to hacking with defaults", async () => {
  const g = game();
  await start(g.ns);
  assert.deepEqual(g.events, [
    { type: "exec", file: PURCHASE_MANAGER, host: "home", options: { threads: 1, preventDuplicates: true }, args: [] },
    { type: "sleep", ms: 200 },
    { type: "spawn", file: "/scripts/hack.js", options: { threads: 1, spawnDelay: 0 }, args: [3, 0] },
  ]);
  assert.ok(!g.processes.some(p => p.pid === 1));
  assert.ok(g.processes.some(p => p.pid === 2));
});

function unlockDarknet(g) {
  g.tor = true;
  for (const file of [DARKNET_PROGRAM, DARKNET_MANAGER, ...DARKNET_FILES]) g.files.add(file);
}

test("master starts darknet after purchases and before hacking, or reuses an active coordinator", async () => {
  const g = game([4, 7]);
  unlockDarknet(g);
  await start(g.ns);
  assert.deepEqual(g.events.map(e => e.type), ["exec", "sleep", "exec", "sleep", "spawn"]);
  assert.equal(g.events[2].file, DARKNET_MANAGER);
  assert.deepEqual(g.events[2].args, []);
  assert.deepEqual(g.events.at(-1).args, [4, 7]);
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
  const g = game([5, 12]);
  g.processes.push({ pid: 99, filename: "scripts/purchase-manager.js", threads: 1, args: ["--reserve", 500000] });
  await start(g.ns);
  assert.deepEqual(g.events.map(e => e.type), ["sleep", "spawn"]);
  assert.deepEqual(g.events.at(-1).args, [5, 12]);
  assert.deepEqual(g.processes.find(p => p.pid === 99).args, ["--reserve", 500000]);
});

test("master rejects invalid arguments, wrong hosts, multiple threads, missing files, and duplicate starts", async () => {
  for (const args of [[0, 0], [3, -1], [1.5, 0], [3, Infinity]]) {
    const g = game(args);
    await start(g.ns);
    assert.deepEqual(g.events, []);
    assert.match(g.logs[0], /Usage:/);
  }
  for (const invalid of ["host", "threads", "purchase file", "hacking file", "duplicate"]) {
    const g = game();
    if (invalid === "host") g.host = "remote";
    if (invalid === "threads") g.processes[0].threads = 2;
    if (invalid === "purchase file") g.files.delete(PURCHASE_MANAGER);
    if (invalid === "hacking file") g.files.delete("/scripts/hack.js");
    if (invalid === "duplicate") g.processes.push({ pid: 99, filename: "scripts/start.js", threads: 1 });
    await start(g.ns);
    assert.deepEqual(g.events, [], invalid);
    assert.equal(g.logs.length, 1);
  }
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
  assert.deepEqual(g.events.at(-1).args, [4, 7]);
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
