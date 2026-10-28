import assert from "node:assert/strict";
import test from "node:test";
import { main as manager } from "../home/scripts/darknet-manager.js";
import { main as worker } from "../home/scripts/darknet-worker.js";
import { DARKNET_FILES, DARKNET_MANAGER, DARKNET_PROGRAM, DARKNET_WORKER, passwordCandidates, DARKNET_DIAGNOSTICS, validDarknetReport } from "../home/scripts/darknet.js";

const STOP = new Error("stop mock clock");

test("darknet blockers retain reproducible hints, RAM and timings from owned explorers only", async () => {
  const g = game();
  g.servers.get("alpha").modelId = "Unseen model";
  g.servers.get("alpha").data = "fixture data";
  g.servers.get("beta").maxRam = 4;
  await run(g, worker, 2);
  const reports = g.ports.get(1).filter(r => r.reason);
  const unsupported = reports.find(r => r.reason === "unsupported");
  assert.equal(unsupported.data, "fixture data");
  assert.equal(unsupported.requiredRam, 8);
  assert.ok(reports.some(r => r.reason === "ram" && r.availableRam === 4));
  assert.ok(reports.every(validDarknetReport));
  g.sleepLimit = 2;
  g.sleepHook = (pid, count) => {
    if (pid !== 1 || count !== 1) return;
    const q = g.ports.get(1);
    q.push(unsupported, unsupported, { ...unsupported, pid: 999 }, { ...unsupported, authMs: NaN });
  };
  await run(g, manager, 1);
  const saved = JSON.parse(g.data.get(DARKNET_DIAGNOSTICS));
  assert.equal(saved.length, 1);
  assert.equal(saved[0].count, 2);
  assert.equal(saved[0].pid, undefined);
  const previous = g.data.get(DARKNET_DIAGNOSTICS);
  g.sleepHook = null; await run(g, manager, 1);
  assert.equal(g.data.get(DARKNET_DIAGNOSTICS), previous);
});

test("corrupt diagnostic files are preserved and failed writes leave exploration running", async () => {
  const g = game(); g.data.set(DARKNET_DIAGNOSTICS, "broken");
  await run(g, manager, 1);
  assert.equal(g.data.get(DARKNET_DIAGNOSTICS), "broken");
  assert.ok(g.logs.some(l => l.includes("existing file preserved")));
  const h = game(); h.servers.get("alpha").modelId = "Unknown";
  await run(h, worker, 2);
  const blocker = h.ports.get(1).find(r => r.reason === "unsupported");
  h.failWrite = true; h.sleepLimit = 2;
  h.sleepHook = (pid, count) => { if (pid === 1 && count === 1) h.ports.get(1).push(blocker); };
  await run(h, manager, 1);
  assert.ok(h.logs.some(l => l.includes("Exploration continues")));
});
const binary = password => [...password].map(char => char.charCodeAt(0).toString(2).padStart(8, "0")).join(" ");
const hint = (modelId, passwordLength, passwordFormat = "numeric", data = "", passwordHint = "") =>
  ({ modelId, passwordLength, passwordFormat, data, passwordHint });

test("five darknet password models decode bounded candidates and preserve zeroes", () => {
  assert.deepEqual(passwordCandidates(hint("ZeroLogon", 0)), [""]);
  for (const prefix of ["The password is", "The PIN is", "Remember to use", "It's set to", "The key is", "The secret is"]) {
    assert.deepEqual(passwordCandidates(hint("DeskMemo_3.1", 3, "numeric", "", `${prefix} 007`)), ["007"]);
  }
  assert.deepEqual(passwordCandidates(hint("CloudBlare(tm)", 3, "numeric", "0[╬]0-7")), ["007"]);
  assert.deepEqual(passwordCandidates(hint("110100100", 3, "numeric", binary("007"))), ["007"]);
  for (const [password, format] of [["admin", "alphabetic"], ["password", "alphabetic"], ["0000", "numeric"], ["12345", "numeric"]]) {
    assert.deepEqual(passwordCandidates(hint("FreshInstall_1.0", password.length, format)), [password]);
  }
  for (const [password, format] of [["abc", "alphabetic"], ["A1b", "alphanumeric"], ["!? ", "ASCII"], ["é", "unicode"]]) {
    assert.deepEqual(passwordCandidates(hint("110100100", password.length, format, binary(password))), [password]);
  }
});

test("unknown models, malformed hints, lengths, and formats are never guessed or evaluated", () => {
  for (const details of [null, {}, hint("MathML", 1, "numeric", "globalThis.injected = true"),
    hint("DeskMemo_3.1", 1, "numeric", "", "The password is 1; alert('oops')"),
    hint("DeskMemo_3.1", 1, "numeric", "", null), hint("CloudBlare(tm)", 1, "numeric", "alert(1)"),
    hint("CloudBlare(tm)", 1, "numeric", null), hint("110100100", 1, "numeric", "0011001"),
    hint("110100100", 1, "numeric", "00110002"), hint("110100100", 2, "numeric", binary("a1")),
    hint("110100100", 1, "ASCII", binary("é")), hint("110100100", 1, "unknown", binary("1")),
    hint("ZeroLogon", -1), hint("ZeroLogon", NaN), hint("ZeroLogon", 0.5), hint("ZeroLogon", 1)]) {
    assert.deepEqual(passwordCandidates(details), []);
  }
});

function game() {
  const g = {
    data: new Map(),
    processes: new Map(), servers: new Map(), neighbours: new Map(), sessions: new Set(), authenticated: new Set(),
    files: new Set([DARKNET_MANAGER, ...DARKNET_FILES, DARKNET_PROGRAM]), tor: true, nextPid: 10,
    launches: [], copies: [], attempts: [], reclaims: [], caches: [], killed: [], logs: [], exits: new Map(),
    ports: new Map(), sleeps: new Map(), failCopies: new Set(), failLaunches: new Set(), responses: new Map(),
    copyHook: null, authHook: null, ramHook: null, sleepHook: null, sleepLimit: 1, portFull: false,
  };
  g.process = (pid, filename, server, args = [], threads = 1) => {
    const p = { pid, filename, server, args, threads };
    g.processes.set(pid, p);
    return p;
  };
  g.add = (host, options = {}) => {
    g.servers.set(host, {
      ...hint("ZeroLogon", 0), password: "", online: true, maxRam: 16, blockedRam: 0,
      caches: new Set(), ...options,
    });
  };
  g.process(1, DARKNET_MANAGER, "home");
  g.process(2, DARKNET_WORKER, "darkweb", [1]);
  g.add("darkweb", { maxRam: 64 });
  g.add("alpha");
  g.add("beta");
  g.neighbours.set("home", ["darkweb"]);
  g.neighbours.set("darkweb", ["alpha", "beta"]);
  g.neighbours.set("alpha", ["darkweb", "beta"]);
  g.neighbours.set("beta", ["darkweb", "alpha"]);
  const session = (pid, target) => `${pid}:${target}`;
  g.surface = pid => {
    const p = g.processes.get(pid);
    const queue = port => {
      if (!g.ports.has(port)) g.ports.set(port, []);
      return g.ports.get(port);
    };
    const used = target => g.servers.get(target).blockedRam + [...g.processes.values()]
      .filter(process => process.server === target && process.filename === DARKNET_WORKER).length * 8;
    return {
      pid, args: p.args, self: () => p, getHostname: () => p.server,
      disableLog: () => {}, tprint: message => g.logs.push(message), print: message => g.logs.push(message),
      hasTorRouter: () => g.tor, fileExists: (file, host) => host === "home" && (g.files.has(file) || g.data.has(file)),
      read: file => g.data.get(file) ?? "",
      write: (file, value) => { if (!g.failWrite) g.data.set(file, value); },
      getScriptRam: () => g.workerRam ?? 8,
      getServerMaxRam: target => g.servers.get(target).maxRam,
      getServerUsedRam: used,
      getRunningScript: id => g.processes.get(id) ?? null,
      ps: host => [...g.processes.values()].filter(process => process.server === host),
      isRunning: id => g.processes.has(id),
      atExit: callback => g.exits.set(pid, callback),
      kill: id => { g.killed.push(id); return g.processes.delete(id); },
      clearPort: port => { g.ports.set(port, []); }, readPort: port => queue(port).length ? queue(port).shift() : "NULL PORT DATA",
      tryWritePort: (port, message) => { if (g.portFull) return false; queue(port).push(message); return true; },
      ls: host => [...g.servers.get(host).caches, "notes.lit", "fake.cache.txt"],
      scp: async (files, target, source) => {
        g.copies.push({ pid, files, target, source });
        assert.ok(target === "darkweb" || g.sessions.has(session(pid, target)), "scp requires this script's session");
        g.copyHook?.(pid, target);
        return !g.failCopies.has(target);
      },
      exec: (file, target, options, rootPid) => {
        assert.ok(target === "darkweb" || g.sessions.has(session(pid, target)), "exec requires this script's session");
        const duplicate = [...g.processes.values()].some(process => process.server === target && process.filename === file && process.args[0] === rootPid);
        if (duplicate || g.failLaunches.has(target)) return 0;
        assert.ok(used(target) + 8 <= g.servers.get(target).maxRam, "exec must fit current RAM");
        const childPid = g.nextPid++;
        g.process(childPid, file, target, [rootPid]);
        g.launches.push({ pid: childPid, target, options, args: [rootPid] });
        return childPid;
      },
      sleep: async ms => {
        const count = (g.sleeps.get(pid) ?? 0) + 1;
        g.sleeps.set(pid, count);
        g.sleepHook?.(pid, count, ms);
        if (count >= g.sleepLimit) throw STOP;
      },
      enums: { DarknetResponseCode: { AuthFailure: 401 } },
      dnet: {
        isDarknetServer: () => g.servers.has(p.server),
        probe: () => (g.neighbours.get(p.server) ?? []).filter(target => g.servers.get(target)?.online),
        getServerDetails: target => ({ ...g.servers.get(target), isOnline: g.servers.get(target)?.online ?? false,
          isConnectedToCurrentServer: (g.neighbours.get(p.server) ?? []).includes(target), hasSession: g.sessions.has(session(pid, target)) }),
        connectToSession: (target, password) => {
          const success = g.servers.get(target)?.password === password && g.authenticated.has(target);
          if (success) g.sessions.add(session(pid, target));
          return { success };
        },
        authenticate: async (target, password) => {
          g.attempts.push({ pid, target, password });
          g.authHook?.(pid, target, password);
          const s = g.servers.get(target);
          const queued = g.responses.get(target)?.shift();
          const code = queued ?? (!s.online ? 503 : !(g.neighbours.get(p.server) ?? []).includes(target) ? 351 : s.password === password ? 200 : 401);
          if (code === 200) { g.sessions.add(session(pid, target)); g.authenticated.add(target); }
          return { success: code === 200, code, message: `response ${code}` };
        },
        memoryReallocation: async target => {
          assert.ok(g.sessions.has(session(pid, target)));
          g.reclaims.push(target);
          g.servers.get(target).blockedRam = Math.max(0, g.servers.get(target).blockedRam - 8);
          g.ramHook?.(pid, target);
          const code = g.ramCode ?? 200;
          return { success: code === 200, code, message: "RAM result" };
        },
        openCache: file => {
          assert.notEqual(p.server, "home", "cache opening is local to a darknet server");
          assert.ok(g.servers.get(p.server).caches.delete(file));
          g.caches.push({ host: p.server, file });
          return { success: true, message: "reward", karmaLoss: -1 };
        },
      },
    };
  };
  return g;
}

async function run(g, fn, pid) {
  try { await fn(g.surface(pid)); } catch (error) { if (error !== STOP) throw error; }
}

test("coordinator rejects invalid runs, duplicates, prerequisites, and missing or invalid explorers", async () => {
  for (const failure of ["host", "threads", "args", "duplicate", "tor", "program", ...DARKNET_FILES, "RAM"]) {
    const g = game();
    const p = g.processes.get(1);
    if (failure === "host") p.server = "alpha";
    if (failure === "threads") p.threads = 2;
    if (failure === "args") p.args = [1];
    if (failure === "duplicate") g.process(99, "scripts/darknet-manager.js", "home");
    if (failure === "tor") g.tor = false;
    if (failure === "program") g.files.delete(DARKNET_PROGRAM);
    if (DARKNET_FILES.includes(failure)) g.files.delete(failure);
    if (failure === "RAM") g.workerRam = NaN;
    await run(g, manager, 1);
    assert.equal(g.launches.length, 0, failure);
    assert.equal(g.exits.size, 0, failure);
    assert.equal(g.logs.length, 1, failure);
  }
});

test("coordinator launches temporary explorers and retries missing RAM, copies, and launches", async () => {
  for (const failure of ["none", "RAM", "copy", "launch", "throw", "disconnected", "copy RAM race"]) {
    const g = game();
    g.processes.delete(2);
    g.sleepLimit = 31;
    if (failure === "RAM") g.servers.get("darkweb").maxRam = 0;
    if (failure === "copy") g.failCopies.add("darkweb");
    if (failure === "launch") g.failLaunches.add("darkweb");
    if (failure === "throw") g.copyHook = () => { throw new Error("network failure"); };
    if (failure === "disconnected") g.copyHook = () => g.neighbours.set("home", []);
    if (failure === "copy RAM race") g.copyHook = () => { g.servers.get("darkweb").maxRam = 0; };
    g.sleepHook = () => {
      g.servers.get("darkweb").maxRam = 64;
      g.neighbours.set("home", ["darkweb"]);
      g.failCopies.clear(); g.failLaunches.clear(); g.copyHook = null;
    };
    await run(g, manager, 1);
    assert.equal(g.launches.length, 1, failure);
    assert.equal(g.launches[0].target, "darkweb");
    assert.deepEqual(g.launches[0].options, { threads: 1, preventDuplicates: true, temporary: true });
  }
});

test("coordinator validates registrations and drains pending registrations before owned cleanup", async () => {
  const g = game();
  g.process(40, DARKNET_WORKER, "alpha", [1]);
  g.process(41, DARKNET_WORKER, "beta", [1]);
  g.process(99, DARKNET_WORKER, "alpha", [999]);
  g.process(98, "/scripts/manual.js", "beta", [1]);
  g.process(97, DARKNET_WORKER, "beta", [1], 2);
  g.sleepHook = () => g.ports.get(1).push(null, 40, { pid: -1, host: "alpha" },
    { pid: 98, host: "beta" }, { pid: 97, host: "beta" }, { pid: 99, host: "alpha" },
    { pid: 40, host: "wrong-host" }, { pid: 40, host: "alpha" }, { pid: 41, host: "beta" });
  await run(g, manager, 1);
  g.exits.get(1)();
  assert.deepEqual(g.killed.sort(), [40, 41]);
  assert.ok(g.processes.has(99) && g.processes.has(98) && g.processes.has(97));
  assert.deepEqual(g.ports.get(1), []);
});

test("explorers traverse cycles with separate sessions, preserve files, and open caches locally", async () => {
  const g = game();
  g.servers.get("darkweb").caches.add("wallet.cache");
  g.servers.get("alpha").caches.add("vault.cache");
  await run(g, worker, 2);
  assert.deepEqual(g.launches.map(p => p.target), ["alpha", "beta"]);
  assert.deepEqual(g.ports.get(1).filter(r => !r.reason), [{ pid: 2, host: "darkweb" }]);
  const alphaPid = g.launches[0].pid;
  g.processes.delete(g.launches[1].pid);
  await run(g, worker, alphaPid);
  assert.ok(g.attempts.some(a => a.pid === alphaPid && a.target === "beta"));
  assert.equal(g.launches.filter(p => p.target === "alpha").length, 1);
  assert.equal(g.launches.filter(p => p.target === "darkweb").length, 0);
  assert.deepEqual(g.caches, [{ host: "darkweb", file: "wallet.cache" }, { host: "alpha", file: "vault.cache" }]);
  assert.ok(g.copies.every(copy => copy.files === DARKNET_FILES && copy.source === "home"));
});

test("unsupported or exhausted passwords leave siblings explorable without evaluating hint data", async () => {
  const g = game();
  g.servers.set("alpha", { ...g.servers.get("alpha"), ...hint("MathML", 1, "numeric", "throw new Error('injected')") });
  await run(g, worker, 2);
  assert.deepEqual(g.launches.map(p => p.target), ["beta"]);
  assert.ok(g.logs.some(message => message.includes("SKIP alpha")));
  const exhausted = game();
  Object.assign(exhausted.servers.get("alpha"), hint("FreshInstall_1.0", 5, "alphanumeric"), { password: "other" });
  await run(exhausted, worker, 2);
  assert.deepEqual(exhausted.attempts.filter(a => a.target === "alpha").map(a => a.password), ["admin", "12345"]);
  assert.deepEqual(exhausted.launches.map(p => p.target), ["beta"]);
});

test("timeouts do not advance password candidates and failed deployments retry later", async () => {
  for (const failure of ["timeout", "copy", "launch", "exception", "offline", "migration", "RAM race", "session lost"]) {
    const g = game();
    g.sleepLimit = 2;
    if (failure === "timeout") {
      Object.assign(g.servers.get("alpha"), hint("FreshInstall_1.0", 5, "alphanumeric"), { password: "admin" });
      g.responses.set("alpha", [408]);
    }
    if (failure === "copy") g.failCopies.add("alpha");
    if (failure === "launch") g.failLaunches.add("alpha");
    if (failure === "exception") g.copyHook = (_pid, target) => { if (target === "alpha") throw new Error("copy broke"); };
    if (failure === "offline") g.authHook = (_pid, target) => { if (target === "alpha") g.servers.get(target).online = false; };
    if (failure === "migration") g.copyHook = () => g.neighbours.set("darkweb", ["beta"]);
    if (failure === "RAM race") g.copyHook = (_pid, target) => { if (target === "alpha") g.servers.get(target).maxRam = 0; };
    if (failure === "session lost") g.copyHook = pid => g.sessions.delete(`${pid}:alpha`);
    g.sleepHook = () => {
      assert.ok(!g.launches.some(p => p.target === "alpha"), failure);
      g.servers.get("alpha").online = true; g.servers.get("alpha").maxRam = 16;
      g.neighbours.set("darkweb", ["alpha", "beta"]);
      g.failCopies.clear(); g.failLaunches.clear(); g.copyHook = null; g.authHook = null;
      g.sleepHook = null;
    };
    await run(g, worker, 2);
    assert.equal(g.launches.filter(p => p.target === "alpha").length, 1, failure);
    assert.equal(g.launches.filter(p => p.target === "beta").length, 1, failure);
    if (failure === "timeout") assert.deepEqual(g.attempts.filter(a => a.target === "alpha").map(a => a.password), ["admin", "admin"]);
  }
});

test("blocked RAM is reclaimed only when needed and remains checked after asynchronous work", async () => {
  for (const failure of ["none", "failure", "migration"]) {
    const g = game();
    g.servers.get("alpha").blockedRam = 16;
    if (failure === "failure") g.ramCode = 503;
    if (failure === "migration") g.ramHook = () => g.neighbours.set("darkweb", ["beta"]);
    await run(g, worker, 2);
    assert.deepEqual(g.reclaims, ["alpha"]);
    assert.equal(g.launches.some(p => p.target === "alpha"), failure === "none");
  }
});

test("deployment races reuse a newly started explorer and lost sessions reconnect without sharing another PID's session", async () => {
  const race = game();
  race.copyHook = (_pid, target) => { if (target === "alpha") race.process(77, "scripts/darknet-worker.js", "alpha", [1]); };
  await run(race, worker, 2);
  assert.ok(!race.launches.some(p => p.target === "alpha"));
  assert.ok(race.processes.has(77));

  const reconnect = game();
  reconnect.sleepLimit = 2;
  reconnect.failCopies.add("alpha");
  reconnect.sleepHook = () => { reconnect.sessions.delete("2:alpha"); reconnect.failCopies.clear(); };
  await run(reconnect, worker, 2);
  assert.equal(reconnect.attempts.filter(a => a.target === "alpha").length, 1);
  assert.equal(reconnect.launches.filter(p => p.target === "alpha").length, 1);
});

test("a failed cache does not prevent other rewards or neighbour exploration", async () => {
  const g = game();
  g.servers.get("darkweb").caches = new Set(["broken.cache", "wallet.cache"]);
  const ns = g.surface(2);
  const open = ns.dnet.openCache;
  ns.dnet.openCache = file => { if (file === "broken.cache") throw new Error("cache disappeared"); return open(file); };
  try { await worker(ns); } catch (error) { if (error !== STOP) throw error; }
  assert.deepEqual(g.caches, [{ host: "darkweb", file: "wallet.cache" }]);
  assert.ok(g.logs.some(message => message.includes("cache opening failed")));
  assert.equal(g.launches.length, 2);
});

test("explorers reject direct runs and stop if their coordinator disappears, including during a request", async () => {
  for (const failure of ["args", "pid", "threads", "host", "manager", "manager host", "manager threads", "missing manager"]) {
    const g = game();
    const p = g.processes.get(2);
    if (failure === "args") p.args = [1, 2];
    if (failure === "pid") p.args = ["1"];
    if (failure === "threads") p.threads = 2;
    if (failure === "host") p.server = "home";
    if (failure === "manager") g.processes.get(1).filename = "/scripts/manual.js";
    if (failure === "manager host") g.processes.get(1).server = "alpha";
    if (failure === "manager threads") g.processes.get(1).threads = 2;
    if (failure === "missing manager") g.processes.delete(1);
    await run(g, worker, 2);
    assert.equal(g.attempts.length, 0, failure);
    assert.equal(g.logs.length, 1, failure);
  }
  for (const stopAt of ["auth", "copy", "sleep", "registration"]) {
    const g = game();
    g.sleepLimit = 3;
    if (stopAt === "auth") g.authHook = () => g.processes.delete(1);
    if (stopAt === "copy") g.copyHook = () => g.processes.delete(1);
    if (stopAt === "sleep") g.sleepHook = () => g.processes.delete(1);
    if (stopAt === "registration") { g.portFull = true; g.sleepHook = () => g.processes.delete(1); }
    await run(g, worker, 2);
    if (stopAt !== "sleep") assert.equal(g.launches.length, 0, stopAt);
    assert.equal(g.killed.length, 0);
  }
});

test("coordinator rebuilds temporary explorers with its current PID after reload", async () => {
  const g = game();
  g.processes.clear();
  g.process(50, DARKNET_MANAGER, "home");
  await run(g, manager, 50);
  assert.equal(g.launches.length, 1);
  assert.deepEqual(g.launches[0].args, [50]);
  assert.equal(g.launches[0].options.temporary, true);
});
