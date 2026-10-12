import assert from "node:assert/strict";
import test from "node:test";
import { main as start } from "../home/scripts/start.js";
import { PURCHASE_MANAGER } from "../home/scripts/spending.js";

function game(args = []) {
  const g = {
    processes: [{ pid: 1, filename: "/scripts/start.js", threads: 1 }],
    files: new Set([PURCHASE_MANAGER, "/scripts/hack.js"]), events: [], logs: [], args,
    host: "home", launchFails: false,
  };
  g.ns = {
    pid: 1, args, self: () => g.processes[0], getHostname: () => g.host,
    getScriptName: () => "/scripts/start.js", ps: () => g.processes,
    fileExists: (file, host) => host === "home" && g.files.has(file),
    tprint: message => g.logs.push(message), isRunning: pid => g.processes.some(p => p.pid === pid),
    exec: (file, host, options, ...scriptArgs) => {
      g.events.push({ type: "exec", file, host, options, args: scriptArgs });
      if (g.launchFails) return 0;
      g.processes.push({ pid: 2, filename: file, threads: options.threads, args: scriptArgs });
      return 2;
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
