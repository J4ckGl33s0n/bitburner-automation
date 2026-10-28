import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import ts from "typescript";
import { main as start } from "../home/scripts/hack.js";
import { main as manage, planBatch, rankTargets, rankFarmTargets } from "../home/scripts/hack-manager.js";
import { main as scan } from "../home/scripts/scan-hosts.js";
import { MANAGER, WORKERS, rootHosts, scanAllHosts } from "../home/scripts/network.js";
import { HACKING_METRICS, metricsWindow, acceptWorkerReport } from "../home/scripts/hacking-metrics.js";

const STOP = Symbol("stop test loop");

test("workers report actual script accounting without changing standalone action calls", async () => {
  for (const action of Object.keys(WORKERS)) {
    const { main } = await import(`../home/scripts/${action}-worker.js`);
    const reports = [];
    let exit;
    let called = false;
    const ns = { args: ["alpha", 0, 7], atExit: fn => { exit = fn; },
      self: () => ({ pid: 42, onlineMoneyMade: 123, onlineExpGained: 45 }),
      tryWritePort: (port, report) => { reports.push({ port, ...report }); return true; },
      [action]: async target => { assert.equal(target, "alpha"); called = true; } };
    await main(ns); exit();
    assert.equal(called, true);
    assert.deepEqual(reports, [{ port: 7, pid: 42, target: "alpha", money: 123, xp: 45, complete: true }]);
    ns.args = ["alpha", 1, 7]; ns.print = () => {}; ns[`get${action[0].toUpperCase() + action.slice(1)}Time`] = () => 1000;
    await main(ns); exit();
    assert.equal(reports.at(-1).complete, false);
  }
});

test("controller accepts only owned, valid, unique worker measurements", () => {
  const owned = new Map([[42, { target: "alpha" }]]);
  const metrics = metricsWindow(0);
  const report = { pid: 42, target: "alpha", money: 100, xp: 5, complete: true };
  for (const changed of [{ pid: 9 }, { target: "beta" }, { money: -1 }, { xp: NaN }, { complete: "true" }]) {
    assert.equal(acceptWorkerReport({ ...report, ...changed }, owned, metrics), false);
  }
  assert.equal(acceptWorkerReport(report, owned, metrics), true);
  assert.equal(acceptWorkerReport(report, owned, metrics), false);
  assert.equal(metrics.money, 100); assert.equal(metrics.xp, 5);
});

test("30-second summaries publish remote measurements and flag missing reports", async () => {
  for (const missing of [false, true]) {
    const g = game({ controller: "remote", args: [1, 0] }); g.target("alpha");
    g.add("runner", { maxRam: 256 });
    await run(g, 31, tick => {
      if (tick % 6) return;
      for (const p of [...g.processes.values()].filter(p => Object.values(WORKERS).includes(p.filename))) {
        if (!missing) g.ns.writePort(1, { pid: p.pid, target: "alpha", money: p.filename === WORKERS.hack ? 1000 : 0, xp: 10, complete: true });
        g.processes.delete(p.pid);
      }
    });
    const m = JSON.parse(g.data.get(HACKING_METRICS));
    assert.equal(m.host, "remote"); assert.equal(m.reset, 1);
    assert.equal(m.complete, !missing);
    assert.ok(m.ramSeconds > 0);
    assert.ok(g.copies.some(c => c.names === HACKING_METRICS && c.host === "home"));
    assert.ok(g.logs.some(l => l.startsWith("METRICS")));
  }
});

function game({ homeRam = 256, controller = "home", script = MANAGER, args = [] } = {}) {
  const servers = new Map();
  const files = new Map([["home", new Set([MANAGER, "/scripts/network.js", "/scripts/hacking-metrics.js", ...Object.values(WORKERS)])]]);
  const processes = new Map([[1, { pid: 1, filename: script, host: controller, threads: 1, args }]]);
  const ram = { [MANAGER]: 12.4, "/scripts/hack.js": 7.7, [WORKERS.hack]: 1.75, [WORKERS.grow]: 1.80, [WORKERS.weaken]: 1.80 };
  const g = { servers, files, processes, ram, nodes: [], programs: new Set(["NUKE.exe"]), launches: [], copies: [], logs: [], killed: [], tick: 0, level: 100 };
  g.add = (hostname, overrides = {}) => {
    servers.set(hostname, {
      hostname, hasAdminRights: true, purchasedByPlayer: false, requiredHackingSkill: 1,
      numOpenPortsRequired: 0, openPortCount: 0, maxRam: 0, baseUsed: 0, cpuCores: 1,
      moneyMax: 0, moneyAvailable: 0, hackDifficulty: 1, minDifficulty: 1, baseDifficulty: 1, ...overrides,
    });
    return servers.get(hostname);
  };
  g.target = (hostname, overrides = {}) => g.add(hostname, { moneyMax: 1000000, moneyAvailable: 1000000, ...overrides });
  g.add("home", { maxRam: homeRam, purchasedByPlayer: true });
  if (controller !== "home") g.add(controller, { maxRam: 16 });
  const used = host => servers.get(host).baseUsed + [...processes.values()]
    .filter(p => p.host === host).reduce((total, p) => total + p.threads * (p.ram ?? ram[p.filename]), 0);
  let pid = 10;
  g.ports = new Map(); g.data = new Map();
  g.ns = {
    getResetInfo: () => ({ lastAugReset: 1 }),
    clearPort: port => g.ports.set(port, []),
    readPort: port => g.ports.get(port)?.shift() ?? "NULL PORT DATA",
    writePort: (port, value) => { if (!g.ports.has(port)) g.ports.set(port, []); g.ports.get(port).push(value); },
    read: file => g.data.get(file) ?? "",
    pid: 1, args, self: () => processes.get(1), getHostname: () => controller, getScriptName: () => script,
    scan: host => host === "home" ? [...servers.keys()].filter(h => h !== "home") : ["home"],
    serverExists: host => servers.has(host), hasRootAccess: host => servers.get(host).hasAdminRights,
    getServerMaxRam: host => servers.get(host).maxRam, getServerUsedRam: used,
    getServer: host => ({ ...servers.get(host), ramUsed: used(host) }),
    getHackingLevel: () => g.level,
    getPlayer: () => ({ skills: { hacking: g.level }, mults: { hacking_exp: 1 } }),
    formulas: { hacking: {
      hackPercent: server => server.fraction ?? 0.01,
      hackChance: server => server.chance ?? 1,
      hackExp: (server, player) => server.baseDifficulty ? (3 + 0.3 * server.baseDifficulty) * player.mults.hacking_exp : 0,
      hackTime: server => server.hackMs ?? 1000,
      growTime: server => (server.hackMs ?? 1000) * 3.2,
      weakenTime: server => (server.hackMs ?? 1000) * 4,
      growPercent: (server, threads, player, cores = 1) => Math.exp(threads * (server.growRate ?? 0.01) * (1 + (cores - 1) / 16)),
      growThreads: (server, player, target, cores = 1) => {
        let lo = 0;
        let hi = 1000000;
        const rate = (server.growRate ?? 0.01) * (1 + (cores - 1) / 16);
        while (lo < hi) {
          const mid = Math.floor((lo + hi) / 2);
          if ((server.moneyAvailable + mid) * Math.exp(mid * rate) >= target) hi = mid;
          else lo = mid + 1;
        }
        return lo;
      },
    } },
    hacknet: { numNodes: () => g.nodes.length, getNodeStats: index => g.nodes[index] },
    getScriptRam: file => ram[file] ?? 0,
    fileExists: (file, host) => host === "home" && g.programs.has(file) || files.get(host)?.has("/" + file.replace(/^\/+/, "")) || false,
    nuke: host => {
      const s = servers.get(host);
      if (g.programs.has("NUKE.exe") && s.openPortCount >= s.numOpenPortsRequired) s.hasAdminRights = true;
    },
    ps: host => [...processes.values()].filter(p => p.host === host),
    isRunning: id => processes.has(id),
    kill: id => { g.killed.push(id); return processes.delete(id); },
    atExit: fn => { g.exit = fn; }, disableLog: () => {},
    print: message => g.logs.push(message), tprint: message => g.logs.push(message),
    hackAnalyze: host => servers.get(host).hackDifficulty >= 100 ? 0 : 0.01,
    hackAnalyzeChance: host => servers.get(host).hackDifficulty >= 100 ? 0 : 1,
    getHackTime: () => 1000,
    getGrowTime: () => 3200,
    getWeakenTime: () => 4000,
    hackAnalyzeSecurity: threads => 0.002 * threads,
    growthAnalyzeSecurity: threads => 0.004 * threads,
    weakenAnalyze: (threads, cores = 1) => threads * 0.05 * (1 + (cores - 1) / 16),
    growthAnalyze: (host, multiplier, cores = 1) => Math.log(multiplier) / (0.01 * (1 + (cores - 1) / 16)),
    scp: async (names, host) => {
      g.copies.push({ names, host, tick: g.tick });
      assert.ok(servers.has(host));
      if (!files.has(host)) files.set(host, new Set());
      for (const file of typeof names === "string" ? [names] : names) files.get(host).add(file);
      return true;
    },
    exec: (file, host, options, ...workerArgs) => {
      assert.ok(Number.isInteger(options.threads) && options.threads > 0);
      if (!servers.has(host) || !g.ns.fileExists(file, host) ||
          servers.get(host).maxRam - used(host) + 1e-9 < options.threads * ram[file]) return 0;
      if (options.preventDuplicates && g.ns.ps(host).some(p => p.filename === file && JSON.stringify(p.args) === JSON.stringify(workerArgs))) return 0;
      const process = { pid: pid++, filename: file, host, threads: options.threads, temporary: options.temporary ?? false, args: workerArgs, startedAt: Date.now() };
      processes.set(process.pid, process);
      g.launches.push({ ...process, tick: g.tick, remainingRam: servers.get(host).maxRam - used(host) });
      return process.pid;
    },
    spawn: (file, options, ...workerArgs) => {
      processes.delete(1);
      assert.ok(g.ns.exec(file, controller, options, ...workerArgs));
    },
    write: async (file, value) => { g.report = { file, value }; g.data.set(file, value); },
  };
  for (const [program, name] of [["BruteSSH.exe", "brutessh"], ["FTPCrack.exe", "ftpcrack"], ["relaySMTP.exe", "relaysmtp"], ["HTTPWorm.exe", "httpworm"], ["SQLInject.exe", "sqlinject"]]) {
    g.ns[name] = host => {
      assert.ok(g.programs.has(program));
      const s = servers.get(host);
      if (!s[name]) { s[name] = true; s.openPortCount++; }
    };
  }
  g.finish = () => { for (const launch of g.launches) processes.delete(launch.pid); };
  return g;
}

async function run(g, ticks = 1, onSleep = () => {}, onStep = () => {}) {
  const now = Date.now;
  let elapsed = g.tick * 1000;
  Date.now = () => 1000000 + elapsed;
  g.ns.sleep = async ms => {
    assert.equal(ms, 100);
    elapsed += ms;
    onStep(1000000 + elapsed);
    if (elapsed % 1000 === 0) onSleep(++g.tick);
    if (g.tick >= ticks) throw STOP;
  };
  try { await manage(g.ns); }
  catch (error) { if (error !== STOP) throw error; }
  finally { Date.now = now; }
  assert.equal(g.tick, ticks, "manager should keep running");
}

test("discovery handles cycles; rooting ignores hacking level and retries newly acquired tools", () => {
  const g = game();
  g.level = 1;
  g.add("high", { hasAdminRights: false, requiredHackingSkill: 900 });
  g.add("locked", { hasAdminRights: false, numOpenPortsRequired: 1 });
  g.ns.scan = host => ({ home: ["high", "locked"], high: ["home", "locked"], locked: ["high", "home"] })[host];
  assert.deepEqual(scanAllHosts(g.ns), ["home", "high", "locked"]);
  assert.equal(rootHosts(g.ns, scanAllHosts(g.ns)), 1);
  assert.ok(g.servers.get("high").hasAdminRights);
  assert.equal(g.servers.get("locked").hasAdminRights, false);
  g.programs.add("BruteSSH.exe");
  assert.equal(rootHosts(g.ns, scanAllHosts(g.ns)), 1);
  assert.ok(g.servers.get("locked").hasAdminRights);
});

test("scanner preserves its report, reads one snapshot per host, and adds RAM details", async () => {
  const g = game();
  g.add("opened", { maxRam: 32, baseUsed: 4, cpuCores: 8, numOpenPortsRequired: 1, openPortCount: 5 });
  const counts = new Map();
  const getServer = g.ns.getServer;
  g.ns.getServer = host => { counts.set(host, (counts.get(host) ?? 0) + 1); return getServer(host); };
  await scan(g.ns);
  const report = JSON.parse(g.report.value);
  const opened = report.find(s => s.hostname === "opened");
  assert.equal(g.report.file, "hosts.txt");
  assert.equal(report.find(s => s.hostname === "home").path, "home");
  assert.equal(opened.path, "opened");
  assert.deepEqual([...counts.values()], [1, 1]);
  assert.equal(opened.portsRemaining, 0);
  assert.equal(opened.maxRam, 32);
  assert.equal(opened.ramUsed, 4);
  assert.equal(opened.cpuCores, 8);
  assert.ok(["hasRootAccess", "requiredHackingLevel", "requiredOpenPorts", "openPortCount", "securityLevel", "hackChance", "hackTimeMs", "moneyAvailable"].every(key => key in opened));
});

test("scanner records shortest connection paths once per host despite cycles and equal-length routes", async () => {
  const g = game();
  const network = {
    home: ["joesguns", "relay"],
    joesguns: ["home", "detour", "CSEC"],
    relay: ["home", "CSEC"],
    detour: ["joesguns", "CSEC"],
    CSEC: ["joesguns", "relay", "detour"],
  };
  for (const host of Object.keys(network)) if (host !== "home") g.add(host);
  const scans = [];
  g.ns.scan = host => { scans.push(host); return network[host]; };
  await scan(g.ns);
  const report = JSON.parse(g.report.value);
  assert.deepEqual(report.map(({ hostname, path }) => [hostname, path]), [
    ["home", "home"],
    ["joesguns", "joesguns"],
    ["relay", "relay"],
    ["detour", "joesguns > detour"],
    ["CSEC", "joesguns > CSEC"],
  ]);
  assert.deepEqual(scans, report.map(s => s.hostname));
});

test("startup prefers home at 256 GB and remote placement at 8 GB", async () => {
  for (const homeRam of [8, 256]) {
    const g = game({ homeRam, script: "/scripts/hack.js" });
    g.add("remote", { maxRam: 512, hasAdminRights: false, requiredHackingSkill: 999 });
    await start(g.ns);
    assert.equal(g.launches.length, 1);
    assert.equal(g.launches[0].host, homeRam === 8 ? "remote" : "home");
    if (homeRam === 8) {
      assert.ok(g.copies[0].names.includes("/scripts/network.js"));
      assert.ok(g.copies[0].names.includes(MANAGER));
    }
  }
});

test("startup does not count the home reserve as RAM released by the launcher", async () => {
  const g = game({ homeRam: 8, script: "/scripts/hack.js" });
  g.ram[MANAGER] = 4.5;
  await start(g.ns);
  assert.equal(g.launches.length, 0);
  assert.ok(g.logs.some(s => s.includes("No rooted server")));
});

test("home handoff does not swallow the game's spawn termination", async () => {
  const g = game({ script: "/scripts/hack.js" });
  const death = new Error("ScriptDeath");
  const spawn = g.ns.spawn;
  g.ns.spawn = (...args) => { spawn(...args); throw death; };
  await assert.rejects(start(g.ns), error => error === death);
  assert.equal(g.launches[0].filename, MANAGER);
  assert.ok(g.logs.every(message => !message.includes("WARN")));
});

test("startup retries other hosts after copy and launch failures", async () => {
  const g = game({ homeRam: 8, script: "/scripts/hack.js" });
  for (const [host, maxRam] of [["a", 64], ["b", 32], ["c", 16]]) g.add(host, { maxRam });
  const scp = g.ns.scp;
  g.ns.scp = async (...args) => args[1] === "a" ? false : scp(...args);
  const exec = g.ns.exec;
  g.ns.exec = (...args) => args[1] === "b" ? 0 : exec(...args);
  await start(g.ns);
  assert.equal(g.launches[0].host, "c");
});

test("duplicate controllers on remote hosts and races during copying prevent startup", async () => {
  for (const duringCopy of [false, true]) {
    const g = game({ homeRam: 8, script: "/scripts/hack.js" });
    g.add("remote", { maxRam: 32 });
    const duplicate = () => g.processes.set(99, { pid: 99, filename: "scripts/hack-manager.js", host: "remote", threads: 1, args: [1, 6], ram: 10 });
    if (duringCopy) {
      const scp = g.ns.scp;
      g.ns.scp = async (...args) => { const result = await scp(...args); duplicate(); return result; };
    } else duplicate();
    await start(g.ns);
    assert.equal(g.launches.length, 0);
    assert.ok(g.logs.some(s => s.includes("already running")));
  }
});

test("invalid arguments, invalid scripts, and duplicate direct managers are rejected", async () => {
  for (const args of [[-1, 0], [1, -1], [1.5, 0], [1, Infinity], [0, 0, 2], [0, 0, -1], [0, 0, 0.5], ["bad"], [0, "bad"], [0, 0, "bad"]]) {
    const g = game({ args, script: "/scripts/hack.js" });
    await start(g.ns);
    await manage(g.ns);
    assert.equal(g.launches.length, 0);
    assert.ok(g.logs.every(s => s.includes("Usage:")));
  }
  const g = game();
  g.ram[WORKERS.grow] = 0;
  await manage(g.ns);
  assert.ok(g.logs.some(s => s.includes("Missing or invalid workers")));
  const duplicate = game();
  duplicate.add("remote", { maxRam: 32 });
  duplicate.processes.set(99, { pid: 99, filename: MANAGER.slice(1), host: "remote", threads: 1, args: [], ram: 10 });
  await manage(duplicate.ns);
  assert.ok(duplicate.logs.some(s => s.includes("only one")));
});

test("worker capacity scales at 8, 16, and 256 GB without spending the home reserve", async () => {
  const totals = [];
  for (const homeRam of [8, 16, 256]) {
    const g = game({ homeRam, controller: homeRam <= 16 ? "remote" : "home", args: [1, 0] });
    g.target("alpha", { hackDifficulty: 100 });
    await run(g);
    assert.ok(g.launches.length > 0);
    assert.ok(g.launches.every(p => p.filename === WORKERS.weaken));
    assert.ok(g.launches.filter(p => p.host === "home").every(p => p.remainingRam >= 4));
    totals.push(g.launches.reduce((sum, p) => sum + p.threads, 0));
  }
  assert.ok(totals[2] > 6 && totals[2] > totals[0] && totals[2] > totals[1]);
});

test("core bonuses size weaken and grow; remote capacity is used before home", async () => {
  for (const action of ["weaken", "grow"]) {
    const g = game({ args: [1, 0] });
    g.add("remote", { maxRam: 16, cpuCores: 32 });
    g.target("alpha", action === "weaken" ? { hackDifficulty: 2 } : { moneyAvailable: 850000 });
    await run(g);
    assert.equal(g.launches.length, 1);
    assert.equal(g.launches[0].filename, WORKERS[action]);
    assert.equal(g.launches[0].host, "remote");
    const expected = action === "weaken" ? Math.ceil(1 / g.ns.weakenAnalyze(1, 32)) :
      Math.ceil(g.ns.growthAnalyze("alpha", 1000000 / 850000, 32));
    assert.equal(g.launches[0].threads, expected);
  }
});

test("explicit thread caps apply to the entire distributed phase", async () => {
  const g = game({ homeRam: 8, controller: "remote", args: [1, 6] });
  g.add("small", { maxRam: 4 });
  g.target("alpha", { hackDifficulty: 100 });
  await run(g);
  assert.equal(g.launches.reduce((sum, p) => sum + p.threads, 0), 6);
  assert.ok(new Set(g.launches.map(p => p.host)).size > 1);
});

test("one-slot scheduling rotates targets instead of starving the second target", async () => {
  const g = game({ homeRam: 32, args: [2, 0] });
  g.servers.get("home").baseUsed = 13.8;
  g.target("alpha", { moneyMax: 2000000, moneyAvailable: 2000000 });
  g.target("beta");
  await run(g, 4, () => g.finish());
  assert.deepEqual(g.launches.map(p => p.args[0]), ["alpha", "beta", "alpha", "beta"]);
});

test("fair shares below one grow worker still make progress and rotate", async () => {
  const g = game({ homeRam: 32, args: [2, 0] });
  g.servers.get("home").baseUsed = 12.6;
  g.ram[WORKERS.hack] = 1;
  g.ram[WORKERS.grow] = g.ram[WORKERS.weaken] = 2;
  g.target("alpha", { moneyAvailable: 0 });
  g.target("beta", { moneyAvailable: 0 });
  await run(g, 4, () => g.finish());
  assert.deepEqual(g.launches.map(p => p.args[0]), ["alpha", "beta", "alpha", "beta"]);
});

test("a phase waits for every PID; the next phase re-reads target money", async () => {
  const g = game({ homeRam: 8, controller: "remote", args: [1, 0] });
  g.add("other", { maxRam: 16 });
  g.target("alpha", { hackDifficulty: 100 });
  let initialCount;
  await run(g, 3, tick => {
    if (tick === 1) {
      initialCount = g.launches.length;
      assert.ok(initialCount > 1);
      g.processes.delete(g.launches[0].pid);
    } else if (tick === 2) {
      assert.equal(g.launches.length, initialCount);
      g.finish();
      Object.assign(g.servers.get("alpha"), { hackDifficulty: 1, moneyAvailable: 0 });
    }
  });
  assert.ok(g.launches.slice(initialCount).every(p => p.filename === WORKERS.grow));
  assert.ok(g.launches.length > initialCount);
});

test("no-target startup keeps polling and detects levels, tools, new hosts, and RAM upgrades", async () => {
  const g = game({ homeRam: 16, args: [1, 0] });
  g.level = 1;
  g.target("alpha", { hasAdminRights: false, requiredHackingSkill: 50, numOpenPortsRequired: 1, hackDifficulty: 100 });
  await run(g, 31, tick => {
    if (tick === 30) {
      assert.equal(g.launches.length, 0);
      g.level = 60;
      g.programs.add("BruteSSH.exe");
      g.servers.get("home").maxRam = 256;
      g.add("new", { maxRam: 32, hasAdminRights: false, requiredHackingSkill: 999 });
      g.add("hacknet-server-0", { maxRam: 1024 });
      g.nodes.push({ name: "hacknet-server-0", cache: 1 });
    }
  });
  assert.ok(g.servers.get("alpha").hasAdminRights && g.servers.get("new").hasAdminRights);
  assert.ok(g.launches.some(p => p.tick === 30 && p.host === "new"));
  assert.ok(g.launches.reduce((sum, p) => sum + p.threads, 0) > 6);
  assert.ok(!g.copies.some(p => p.host === "hacknet-server-0"));
  assert.ok(!g.launches.some(p => p.host === "hacknet-server-0"));
});

test("refreshes do not replace an in-flight target with a newly higher-ranked target", async () => {
  const g = game({ args: [1, 0] });
  g.target("alpha", { moneyMax: 2000000, moneyAvailable: 2000000 });
  g.target("beta");
  await run(g, 32, tick => {
    if (tick === 30) Object.assign(g.servers.get("beta"), { moneyMax: 1000000000, moneyAvailable: 1000000000 });
    if (tick === 31) {
      assert.deepEqual([...new Set(g.launches.map(p => p.args[0]))], ["alpha"]);
      g.finish();
    }
  });
  assert.deepEqual([...new Set(g.launches.map(p => p.args[0]))], ["alpha", "beta"]);
});

test("worker copies retry on refresh and launch failures do not charge capacity", async () => {
  const g = game({ homeRam: 8, controller: "remote", args: [1, 0] });
  g.servers.get("home").baseUsed = 4;
  g.target("alpha", { hackDifficulty: 100 });
  const scp = g.ns.scp;
  g.ns.scp = async (...args) => g.tick < 30 ? false : scp(...args);
  await run(g, 31);
  assert.ok(g.launches.length > 0 && g.launches.every(p => p.tick === 30));

  const retry = game({ args: [1, 0] });
  retry.target("alpha");
  const exec = retry.ns.exec;
  let failed = false;
  retry.ns.exec = (...args) => { if (!failed) { failed = true; return 0; } return exec(...args); };
  await run(retry, 2);
  assert.equal(retry.launches.length, 4);
  assert.equal(retry.launches[0].threads, 10);
});

test("disappearing worker hosts are skipped and cleanup preserves manual processes", async () => {
  const g = game({ args: [2, 0] });
  g.add("remote", { maxRam: 16 });
  g.target("alpha");
  g.target("beta");
  g.processes.set(99, { pid: 99, filename: "scripts/hgw-worker.js", host: "home", args: ["alpha", "hack"], threads: 1, ram: 2 });
  await run(g, 2, tick => {
    if (tick === 1) {
      g.servers.delete("remote");
      for (const [pid, process] of g.processes) if (process.host === "remote") g.processes.delete(pid);
    }
  });
  assert.ok(g.launches.every(p => p.args[0] === "beta"));
  g.exit();
  assert.ok(g.processes.has(99));
  assert.ok(!g.killed.includes(99) && !g.killed.includes(1));
  assert.ok(!g.ns.ps("home").some(p => p.filename === WORKERS.hack));
});

test("empty targets with tiny money caps still launch grow workers", async () => {
  const g = game({ args: [1, 0] });
  g.target("alpha", { moneyMax: 0.5, moneyAvailable: 0 });
  await run(g);
  assert.equal(g.launches[0].filename, WORKERS.grow);
});

test("renamed Hacknet servers are excluded and the scanner avoids unsupported analyses", async () => {
  const g = game({ args: [1, 0] });
  g.nodes.push({ name: "renamed-hash-server", cache: 1 });
  g.add("renamed-hash-server", {
    maxRam: 1024, requiredHackingSkill: undefined, moneyMax: undefined, moneyAvailable: undefined,
    minDifficulty: undefined, hackDifficulty: undefined, numOpenPortsRequired: undefined, openPortCount: undefined,
  });
  g.target("alpha");
  const analyze = g.ns.hackAnalyzeChance;
  g.ns.hackAnalyzeChance = host => {
    assert.notEqual(host, "renamed-hash-server", "Hacknet servers reject hacking analyses");
    return analyze(host);
  };
  await run(g);
  assert.ok(g.launches.every(p => p.host !== "renamed-hash-server"));
  assert.ok(g.copies.every(p => p.host !== "renamed-hash-server"));
  await scan(g.ns);
  const report = JSON.parse(g.report.value).find(s => s.hostname === "renamed-hash-server");
  assert.equal(report.hackChance, null);
  assert.equal(report.portsRemaining, null);
  assert.equal(report.maxRam, 1024);
});

test("documented RAM budgets hold and Singularity costs stay isolated in the program buyer", async () => {
  const definitions = ts.createSourceFile("defs.ts", await readFile(new URL("../NetscriptDefinitions.d.ts", import.meta.url), "utf8"), ts.ScriptTarget.Latest, true);
  const costs = new Map();
  const prefixes = { NS: "", Hacknet: "hacknet.", Cloud: "cloud.", Singularity: "singularity.", Darknet: "dnet.", CodingContract: "codingcontract.", Stock: "stock.", Go: "go.", GoAnalysis: "go.analysis." };
  for (const statement of definitions.statements) {
    // Formula methods are explicitly free in v3.0.1's Netscript/RamCostGenerator.ts.
    if (ts.isInterfaceDeclaration(statement) && statement.name.text === "HackingFormulas") {
      for (const member of statement.members) if (member.name) costs.set("formulas.hacking." + member.name.getText(definitions), 0);
    }
    if (ts.isInterfaceDeclaration(statement) && ["HacknetNodesFormulas", "HacknetServersFormulas"].includes(statement.name.text)) {
      for (const member of statement.members) if (member.name) costs.set((statement.name.text === "HacknetNodesFormulas" ? "formulas.hacknetNodes." : "formulas.hacknetServers.") + member.name.getText(definitions), 0);
    }
    if (!ts.isInterfaceDeclaration(statement) || !Object.hasOwn(prefixes, statement.name.text)) continue;
    for (const member of statement.members) {
      const cost = member.getFullText(definitions).match(/RAM cost:\s*([\d.]+)\s*GB/i);
      const multiplier = /GB\s*\*\s*16/.test(member.getFullText(definitions)) ? 16 : 1;
      if (cost && member.name) costs.set(prefixes[statement.name.text] + member.name.getText(definitions), Number(cost[1]) * multiplier);
    }
  }
  async function methodsIn(url, seen = new Set(), methods = new Set()) {
    if (seen.has(url.href)) return methods;
    seen.add(url.href);
    const file = ts.createSourceFile(url.href, await readFile(url, "utf8"), ts.ScriptTarget.Latest, true);
    function visit(node) {
      if (ts.isCallExpression(node)) {
        const method = node.expression.getText(file);
        if (/^ns\.(?:[A-Za-z_$][\w$]*\.)*[A-Za-z_$][\w$]*$/.test(method)) methods.add(method.slice(3));
      }
      ts.forEachChild(node, visit);
    }
    visit(file);
    for (const statement of file.statements) {
      if (ts.isImportDeclaration(statement)) await methodsIn(new URL(statement.moduleSpecifier.text, url), seen, methods);
    }
    return methods;
  }
  const measured = {};
  for (const name of ["start", "startup-retry", "home-buyer", "market-buyer", "hack", "hack-manager", "hack-worker", "grow-worker", "weaken-worker", "purchase-manager", "hacknet-manager", "program-buyer", "darknet-manager", "darknet-worker", "contract-manager", "stock-manager", "go-manager"]) {
    const methods = await methodsIn(new URL(`../home/scripts/${name}.js`, import.meta.url));
    assert.deepEqual([...methods].filter(method => !costs.has(method)), [], "Every API call needs a documented RAM cost");
    if (!["program-buyer", "home-buyer"].includes(name)) assert.ok([...methods].every(method => !method.startsWith("singularity.")));
    // Include all imported helper calls, making this a conservative upper bound.
    measured[name] = Math.round((1.6 + [...methods].reduce((sum, method) => sum + costs.get(method), 0)) * 100) / 100;
  }
  assert.ok(measured["startup-retry"] <= 8);
  assert.ok(measured["home-buyer"] <= 160, `Home buyer: ${measured["home-buyer"]} GB`);
  assert.ok(measured["market-buyer"] <= 16);
  assert.ok(measured["hacknet-manager"] <= 20);
  assert.ok(measured.hack <= 8, "Launcher must fit a starter home");
  assert.ok(measured.start <= 8, "Master launcher must fit a starter home");
  assert.ok(measured["hack-manager"] <= 16, "Controller must fit a rooted starter server");
  assert.ok(measured["hack-worker"] <= 1.75);
  assert.ok(measured["grow-worker"] <= 1.80);
  assert.ok(measured["weaken-worker"] <= 1.80);
  assert.ok(measured["purchase-manager"] <= 24, `Purchase coordinator: ${measured["purchase-manager"]} GB`);
  assert.ok(measured["program-buyer"] <= 80, `Program buyer at SF4 level 1: ${measured["program-buyer"]} GB`);
  assert.ok(measured["darknet-manager"] <= 8, `Darknet coordinator: ${measured["darknet-manager"]} GB`);
  assert.ok(measured["darknet-worker"] <= 12, `Darknet explorer: ${measured["darknet-worker"]} GB`);
  assert.ok(measured["contract-manager"] <= 32, `Contract manager: ${measured["contract-manager"]} GB`);
  assert.ok(measured["stock-manager"] <= 32, `Stock manager: ${measured["stock-manager"]} GB`);
  assert.ok(measured["go-manager"] <= 24, `IPvGO manager: ${measured["go-manager"]} GB`);
});

test("single-action workers validate targets and invoke only their action", async () => {
  for (const action of Object.keys(WORKERS)) {
    const { main } = await import(`../home/scripts/${action}-worker.js`);
    const called = [];
    for (const target of [undefined, "", 42, "alpha"]) {
      await main({ args: [target], tprint: () => {}, [action]: async value => called.push(value) });
    }
    assert.deepEqual(called, ["alpha"]);
  }
});

function workerRam(g) {
  return Object.fromEntries(Object.entries(WORKERS).map(([action, file]) => [action, g.ram[file]]));
}

function completeTimedWorkers(g, now) {
  g.events ??= [];
  const finish = p => {
    const time = p.filename === WORKERS.hack ? g.ns.getHackTime(p.args[0]) :
      p.filename === WORKERS.grow ? g.ns.getGrowTime(p.args[0]) : g.ns.getWeakenTime(p.args[0]);
    return p.args[1] || p.startedAt + time;
  };
  const due = [...g.processes.values()].filter(p => Object.values(WORKERS).includes(p.filename) && finish(p) <= now)
    .sort((a, b) => finish(a) - finish(b));
  for (const p of due) {
    const server = g.servers.get(p.args[0]);
    const cores = g.servers.get(p.host).cpuCores;
    const action = Object.keys(WORKERS).find(action => WORKERS[action] === p.filename);
    let money = 0;
    let xp = (3 + 0.3 * server.baseDifficulty) * p.threads;
    if (action === "hack") {
      const before = server.moneyAvailable;
      server.moneyAvailable *= Math.max(0, 1 - 0.01 * p.threads);
      money = before - server.moneyAvailable;
      if (!money) xp /= 4;
      server.hackDifficulty += 0.002 * p.threads;
    } else if (action === "grow") {
      const before = server.moneyAvailable;
      server.moneyAvailable = Math.min(server.moneyMax,
        (server.moneyAvailable + p.threads) * Math.exp(0.01 * p.threads * (1 + (cores - 1) / 16)));
      if (server.moneyAvailable !== before) server.hackDifficulty += 0.004 * Math.min(p.threads,
        g.ns.formulas.hacking.growThreads({ ...server, moneyAvailable: before }, g.ns.getPlayer(), server.moneyAvailable, cores));
    } else server.hackDifficulty = Math.max(server.minDifficulty,
      server.hackDifficulty - 0.05 * p.threads * (1 + (cores - 1) / 16));
    g.events.push({ action, target: server.hostname, finishAt: finish(p), money: server.moneyAvailable, security: server.hackDifficulty, xp, earned: money });
    if (p.args[2]) g.ns.writePort(p.args[2], { pid: p.pid, target: server.hostname, money, xp, complete: true });
    g.processes.delete(p.pid);
  }
}

test("balanced matrix rewards both money and XP and includes restoration costs", () => {
  const g = game();
  g.programs.add("Formulas.exe");
  g.target("income", { moneyMax: 10000000, baseDifficulty: 1 });
  g.target("xp", { moneyMax: 1000000, baseDifficulty: 100 });
  g.target("balanced", { moneyMax: 8000000, baseDifficulty: 80 });
  const rows = rankTargets(g.ns, [...g.servers.keys()], workerRam(g), 0, g.ns.getPlayer());
  assert.equal(rows[0].hostname, "balanced");
  assert.equal(rows.find(row => row.hostname === "income").moneyEfficiency, Math.max(...rows.map(row => row.moneyEfficiency)));
  assert.equal(rows.find(row => row.hostname === "xp").xpEfficiency, Math.max(...rows.map(row => row.xpEfficiency)));
  for (const row of rows) {
    const expected = 0.5 * (row.moneyEfficiency / Math.max(...rows.map(row => row.moneyEfficiency))) +
      0.5 * (row.xpEfficiency / Math.max(...rows.map(row => row.xpEfficiency)));
    assert.ok(Math.abs(row.score - expected) < 1e-12);
  }
  const restore = game();
  restore.programs.add("Formulas.exe");
  restore.target("expensive", { moneyMax: 20000000, growRate: 0.001 });
  restore.target("efficient", { moneyMax: 9000000 });
  assert.equal(rankTargets(restore.ns, [...restore.servers.keys()], workerRam(restore), 0, restore.ns.getPlayer())[0].hostname, "efficient");
});

test("matrix accounts for failed hack XP, prepared Formulas snapshots, ties and invalid estimates", () => {
  const g = game();
  g.programs.add("Formulas.exe");
  const original = g.target("alpha", { chance: 0.25, hackDifficulty: 100, moneyAvailable: 0 });
  const before = JSON.parse(JSON.stringify(original));
  const percent = g.ns.formulas.hacking.hackPercent;
  g.ns.formulas.hacking.hackPercent = server => {
    assert.equal(server.hackDifficulty, server.minDifficulty);
    assert.equal(server.moneyAvailable, server.moneyMax);
    return percent(server);
  };
  const [row] = rankTargets(g.ns, ["alpha"], workerRam(g), 0, g.ns.getPlayer());
  assert.equal(row.method, "Formulas");
  assert.ok(Math.abs(row.moneyEfficiency * row.ram * row.seconds - 25000) < 1e-8);
  assert.ok(Math.abs(row.xpEfficiency * row.ram * row.seconds - 3.3 * (10 * (0.25 + 0.75 / 4) + 13)) < 1e-8);
  assert.deepEqual(original, before);
  const [approximate] = rankTargets(g.ns, ["alpha"], workerRam(g));
  assert.equal(approximate.method, "approximate");
  assert.equal(approximate.moneyEfficiency, 0);
  g.target("beta");
  g.target("gamma");
  g.target("bad", { hackMs: NaN });
  g.target("throws");
  g.ns.formulas.hacking.hackPercent = server => {
    if (server.hostname === "throws") throw new Error("unavailable");
    return percent(server);
  };
  const recovered = rankTargets(g.ns, ["gamma", "bad", "throws", "beta"], workerRam(g), 0, g.ns.getPlayer());
  assert.equal(recovered.length, 4);
  assert.ok(recovered.filter(row => ["bad", "throws"].includes(row.hostname)).every(row => row.method === "approximate"));
  assert.ok(g.logs.some(line => line.includes("throws") && line.includes("estimate failed")));
});

test("Formulas acquisition is discovered on refresh without restarting the manager", async () => {
  const g = game({ args: [1, 0] });
  g.target("alpha", { hackDifficulty: 100 });
  await run(g, 31, tick => { if (tick === 30) g.programs.add("Formulas.exe"); });
  assert.ok(g.logs.some(line => line.includes("(approximate)")));
  assert.ok(g.logs.some(line => line.includes("(Formulas)")));
});

test("Formulas ranking sizes additive growth from a copied post-hack server", () => {
  const g = game(); g.programs.add("Formulas.exe");
  const server = g.target("tiny", { moneyMax: 100, moneyAvailable: 0, hackDifficulty: 50 });
  const before = { ...server };
  const grow = g.ns.formulas.hacking.growThreads;
  let calls = 0;
  g.ns.formulas.hacking.growThreads = (snapshot, player, target, cores) => {
    calls++;
    assert.equal(snapshot.moneyAvailable, 90);
    assert.equal(snapshot.hackDifficulty, snapshot.minDifficulty);
    assert.equal(target, 100); assert.equal(cores, 1);
    return grow(snapshot, player, target, cores);
  };
  const [row] = rankTargets(g.ns, ["tiny"], workerRam(g), 0, g.ns.getPlayer());
  assert.equal(calls, 1); assert.equal(row.method, "Formulas");
  assert.deepEqual(server, before);
});

test("Formula preparation fits a full grow on one runner, including an empty target", async () => {
  for (const moneyAvailable of [0, 1, 500000]) {
    const g = game({ homeRam: 4096, args: [1, 0] });
    g.programs.add("Formulas.exe");
    const server = g.target("alpha", { moneyAvailable });
    const expected = g.ns.formulas.hacking.growThreads(server, g.ns.getPlayer(), server.moneyMax, 1);
    await run(g);
    assert.equal(g.launches.length, 1);
    assert.equal(g.launches[0].filename, WORKERS.grow);
    assert.equal(g.launches[0].threads, expected);
    assert.ok((moneyAvailable + expected) * Math.exp(expected * 0.01) >= server.moneyMax);
  }
});

test("fragmented mixed-core Formula preparation retains conservative distributed sizing and caps", async () => {
  const g = game({ homeRam: 32, args: [1, 20] });
  g.programs.add("Formulas.exe");
  g.target("alpha", { moneyAvailable: 1 });
  g.add("remote", { maxRam: 16, cpuCores: 8 });
  await run(g);
  assert.ok(g.launches.length > 1);
  assert.ok(g.launches.every(p => p.filename === WORKERS.grow));
  assert.ok(g.launches.reduce((sum, p) => sum + p.threads, 0) <= 20);
  assert.ok(g.launches.every(p => p.remainingRam >= (p.host === "home" ? 4 : 0) - 1e-9));
});

test("Formulas access loss before execution and unusable batch estimates fall back safely", async () => {
  const g = game({ args: [1, 0] });
  g.target("alpha"); g.programs.add("Formulas.exe");
  const getServer = g.ns.getServer;
  let reads = 0;
  g.ns.getServer = host => {
    if (host === "alpha" && ++reads === 2) g.programs.delete("Formulas.exe");
    return getServer(host);
  };
  await run(g);
  assert.equal(g.launches.length, 4);
  const h = game(); const server = h.target("alpha");
  const capacity = [{ host: "home", free: 1000, cores: 1 }];
  const expected = planBatch(h.ns, server, capacity, 1000, 0, workerRam(h));
  for (const broken of [() => NaN, () => { throw new Error("access lost"); }]) {
    h.programs.add("Formulas.exe");
    h.ns.formulas.hacking.growPercent = broken;
    assert.deepEqual(planBatch(h.ns, server, capacity, 1000, 0, workerRam(h), h.ns.getPlayer()), expected);
  }
  h.programs.delete("Formulas.exe");
  assert.equal(rankTargets(h.ns, ["alpha"], workerRam(h), 0, h.ns.getPlayer())[0].method, "approximate");
});

test("failed and invalid Formula preparation estimates retain ordinary grow progress", async () => {
  for (const broken of [() => NaN, () => { throw new Error("access lost"); }]) {
    const g = game({ args: [1, 0] });
    g.target("alpha", { moneyAvailable: 100000 });
    g.programs.add("Formulas.exe");
    g.ns.formulas.hacking.growThreads = broken;
    await run(g);
    assert.ok(g.launches.length > 0);
    assert.ok(g.launches.every(p => p.filename === WORKERS.grow));
  }
});

test("complete batches finish HWGW, restore state and repeat without overlapping targets", async () => {
  const g = game({ args: [2, 0] });
  g.target("alpha");
  g.target("beta");
  await run(g, 30, () => {}, now => completeTimedWorkers(g, now));
  for (const target of ["alpha", "beta"]) {
    const events = g.events.filter(event => event.target === target);
    assert.equal(events.length, 20);
    for (let i = 0; i < events.length; i += 4) {
      const batch = events.slice(i, i + 4);
      assert.deepEqual(batch.map(event => event.action), ["hack", "weaken", "grow", "weaken"]);
      assert.deepEqual(batch.slice(1).map((event, n) => event.finishAt - batch[n].finishAt), [200, 200, 200]);
      assert.ok(batch[3].money >= g.servers.get(target).moneyMax * 0.999);
      assert.equal(batch[3].security, 1);
    }
  }
  assert.ok(g.launches.every(p => p.temporary));
  assert.ok(g.launches.filter(p => p.host === "home").every(p => p.remainingRam >= 4 - 1e-9));
  assert.ok(g.logs.filter(line => line.includes("complete:") && line.includes("ready")).length >= 10);
});

test("batch preflight splits waves, applies core bonuses and caps, halves to fit, and preserves input", () => {
  const g = game();
  const server = g.target("alpha");
  const capacity = [{ host: "remote", free: 7.2, cores: 32 }, { host: "other", free: 12, cores: 1 }, { host: "home", free: 60, cores: 1 }];
  const before = JSON.parse(JSON.stringify({ server, capacity }));
  const plan = planBatch(g.ns, server, capacity, 79.2, 12, workerRam(g));
  assert.ok(plan);
  assert.equal(plan[0].host, "remote");
  assert.ok(plan.filter(part => part.wave === 0).length > 1);
  for (const wave of [0, 1, 2, 3]) assert.ok(plan.filter(part => part.wave === wave).reduce((sum, part) => sum + part.threads, 0) <= 12);
  for (const runner of capacity) assert.ok(plan.filter(part => part.host === runner.host)
    .reduce((sum, part) => sum + part.threads * workerRam(g)[part.action], 0) <= runner.free + 1e-9);
  assert.deepEqual({ server, capacity }, before);
  const highCore = planBatch(g.ns, server, [{ host: "remote", free: 100, cores: 32 }], 100, 0, workerRam(g));
  const oneCore = planBatch(g.ns, server, [{ host: "remote", free: 100, cores: 1 }], 100, 0, workerRam(g));
  assert.ok(highCore.filter(part => part.action === "grow").reduce((sum, part) => sum + part.threads, 0) <
    oneCore.filter(part => part.action === "grow").reduce((sum, part) => sum + part.threads, 0));
  const small = planBatch(g.ns, server, [{ host: "remote", free: 14, cores: 1 }], 14, 0, workerRam(g));
  assert.equal(small.filter(part => part.action === "hack").reduce((sum, part) => sum + part.threads, 0), 2);
  assert.equal(planBatch(g.ns, server, [{ host: "remote", free: 7, cores: 1 }], 7, 0, workerRam(g)), null);
  const fragmented = Array.from({ length: 5 }, (_, i) => ({ host: `r${i}`, free: 1.75, cores: 1 }));
  assert.equal(planBatch(g.ns, server, fragmented, 8.75, 0, workerRam(g)), null);
});

test("one oversized hack thread gets restoration sized for its actual theft, including empty money", () => {
  const g = game();
  const server = g.target("alpha");
  for (const fraction of [0.25, 1]) {
    g.ns.hackAnalyze = () => fraction;
    const plan = planBatch(g.ns, server, [{ host: "home", free: 4000, cores: 1 }], 4000, 0, workerRam(g));
    assert.ok(plan);
    assert.equal(plan.find(part => part.action === "hack").threads, 1);
    const grows = plan.find(part => part.action === "grow").threads;
    const afterHack = server.moneyAvailable * (1 - fraction);
    assert.ok((afterHack + grows) * Math.exp(grows * 0.01) >= server.moneyMax);
  }
});

test("worker deadlines use current durations, reject invalid or missed times, and keep immediate calls", async () => {
  const originalNow = Date.now;
  Date.now = () => 1000000;
  try {
    for (const action of Object.keys(WORKERS)) {
      const { main } = await import(`../home/scripts/${action}-worker.js`);
      const calls = [];
      let duration = 2000;
      const ns = { args: ["alpha"], print: () => {}, tprint: () => {},
        [`get${action[0].toUpperCase() + action.slice(1)}Time`]: () => duration,
        [action]: async (...args) => calls.push(args) };
      await main(ns);
      ns.args = ["alpha", 1005000];
      await main(ns);
      duration = 3000;
      await main(ns);
      for (const deadline of [null, "1005000", 0, -1, NaN, Infinity, 1005000.5, 1002000]) {
        ns.args = ["alpha", deadline];
        await main(ns);
      }
      assert.deepEqual(calls, [["alpha"], ["alpha", { additionalMsec: 3000 }], ["alpha", { additionalMsec: 2000 }]]);
    }
  } finally { Date.now = originalNow; }
});

test("partial launch failures and exceptions cancel only owned batch workers before retry", async () => {
  for (const throws of [false, true]) {
    const g = game({ args: [1, 0] });
    g.target("alpha");
    g.processes.set(99, { pid: 99, filename: "/scripts/manual.js", host: "home", threads: 1, args: [], ram: 1 });
    const exec = g.ns.exec;
    let calls = 0;
    g.ns.exec = (...args) => {
      if (++calls === 3) { if (throws) throw new Error("RAM race"); return 0; }
      return exec(...args);
    };
    await run(g);
    assert.deepEqual(g.killed, g.launches.slice(0, 2).map(p => p.pid));
    assert.ok(g.processes.has(99));
    assert.equal(g.launches.length, 6);
    assert.ok(g.logs.some(line => line.includes("cancelled owned workers")));
  }
});

test("early worker loss cancels the batch; bad final state is prepared before another hack", async () => {
  const g = game({ args: [1, 0] });
  g.target("alpha");
  let first;
  await run(g, 2, tick => {
    if (tick === 1) {
      first = g.launches.slice();
      g.processes.delete(first[0].pid);
      g.servers.get("alpha").hackDifficulty = 2;
    }
  });
  assert.ok(first.slice(1).every(p => g.killed.includes(p.pid)));
  assert.ok(g.launches.slice(first.length).every(p => p.filename === WORKERS.weaken && p.args[1] === 0 && p.args[2] === 1));
  assert.ok(g.logs.some(line => line.includes("worker stopped early")));

  const drift = game({ args: [1, 0] });
  drift.target("alpha");
  let batchCount;
  await run(drift, 7, tick => {
    if (tick === 6) {
      batchCount = drift.launches.length;
      drift.finish();
      drift.servers.get("alpha").moneyAvailable = 800000;
    }
  });
  assert.ok(drift.logs.some(line => line.includes("complete:") && line.includes("recovering")));
  assert.ok(drift.launches.slice(batchCount).every(p => p.filename === WORKERS.grow && p.args[1] === 0 && p.args[2] === 1));
});

test("reload discards temporary deadlines and prepares interrupted target state", async () => {
  const g = game({ args: [1, 0] });
  g.target("alpha");
  await run(g);
  const old = g.launches.slice();
  for (const p of [...g.processes.values()]) if (p.temporary) g.processes.delete(p.pid);
  g.servers.get("alpha").moneyAvailable = 500000;
  await run(g, 2);
  assert.ok(old.every(p => !g.processes.has(p.pid)));
  assert.ok(g.launches.slice(old.length).every(p => p.filename === WORKERS.grow && p.args[1] === 0 && p.args[2] === 1));
});

test("automatic defaults expand beyond three targets while explicit caps and thread caps remain effective", async () => {
  for (const args of [[], [0, 0], [3, 0], [0, 2]]) {
    const g = game({ homeRam: 4096, args });
    for (let i = 0; i < 6; i++) g.target(`t${i}`);
    await run(g);
    assert.equal(new Set(g.launches.map(p => p.args[0])).size, args[0] === 3 ? 3 : 6);
    assert.ok(g.launches.every(p => p.args[1] > 0 && p.temporary));
    if (args[1] === 2) assert.ok(g.launches.every(p => p.threads <= 2));
    assert.ok(g.logs.some(l => l.startsWith("ALLOCATION") && l.includes(args[0] === 3 ? "manual caps" : "automatic")));
  }
});

test("hacking launcher forwards automatic settings and XP through home and remote handoffs", async () => {
  for (const homeRam of [8, 256]) {
    for (const args of [[], [0, 0, 1], [3, 7, 1]]) {
      const g = game({ homeRam, script: "/scripts/hack.js", args });
      g.add("remote", { maxRam: 128 });
      await start(g.ns);
      assert.deepEqual(g.launches[0].args, args.length ? args : [0, 0, 0]);
      assert.equal(g.launches[0].host, homeRam === 8 ? "remote" : "home");
    }
  }
});

test("automatic scheduling prepares multiple targets through ranking refreshes alongside ready batches", async () => {
  const g = game({ homeRam: 4096 });
  g.target("ready");
  g.target("alpha", { hackDifficulty: 2 });
  g.target("beta", { hackDifficulty: 3 });
  await run(g, 32, tick => {
    if (tick % 5 === 0) {
      for (const p of [...g.processes.values()]) if (p.args[0] === "alpha") g.processes.delete(p.pid);
    }
    if (tick === 30) g.servers.get("beta").baseDifficulty = 1000;
  });
  assert.ok(g.launches.some(p => p.args[0] === "ready" && p.args[1] > 0));
  assert.ok(g.launches.filter(p => p.args[1] === 0).length > 1);
  assert.deepEqual([...new Set(g.launches.filter(p => p.args[1] === 0).map(p => p.args[0]))].sort(), ["alpha", "beta"]);
  assert.ok(g.launches.some(p => p.args[0] === "alpha" && p.tick >= 30));
});

test("automatic admission remeasures capacity without cancelling active money jobs", async () => {
  const g = game({ homeRam: 64 });
  for (let i = 0; i < 8; i++) g.target(`t${i}`);
  let initial;
  await run(g, 4, tick => {
    if (tick === 1) {
      initial = g.launches.length;
      g.servers.get("home").baseUsed = 1000;
    }
    if (tick === 2) assert.equal(g.launches.length, initial);
    if (tick === 3) {
      g.servers.get("home").baseUsed = 0;
      g.servers.get("home").maxRam = 512;
    }
  });
  assert.ok(g.launches.length > initial);
  assert.deepEqual(g.killed, []);
  assert.ok(g.launches.slice(0, initial).every(p => g.processes.has(p.pid)));
});

test("automatic fallback makes progress when fragmented RAM cannot fit grow or weaken", async () => {
  const g = game({ homeRam: 8, controller: "remote" });
  g.servers.get("home").baseUsed = 4;
  g.servers.get("remote").baseUsed = 3.6;
  for (let i = 0; i < 6; i++) g.add(`r${i}`, { maxRam: 1.75 });
  g.target("alpha"); g.target("beta");
  await run(g);
  assert.ok(g.launches.length > 0);
  assert.ok(g.launches.every(p => p.filename === WORKERS.hack && p.args[1] === 0));
  assert.deepEqual([...new Set(g.launches.map(p => p.args[0]))].sort(), ["alpha", "beta"]);
});

test("farm ranking ignores hacking level, validates estimates and uses prepared Formula snapshots", () => {
  const g = game();
  g.target("quick", { requiredHackingSkill: 9999, baseDifficulty: 10 });
  g.target("slow", { baseDifficulty: 100, hackMs: 100000 });
  g.target("zero", { baseDifficulty: 0 });
  g.target("locked", { hasAdminRights: false });
  g.programs.add("Formulas.exe");
  const original = g.ns.formulas.hacking.growTime;
  g.ns.formulas.hacking.growTime = s => { assert.equal(s.hackDifficulty, s.minDifficulty); return original(s); };
  assert.deepEqual(rankFarmTargets(g.ns, [...g.servers.keys()], 1.8, g.ns.getPlayer()).map(r => r.hostname), ["quick", "slow"]);
  g.ns.formulas.hacking.growTime = () => NaN;
  assert.equal(rankFarmTargets(g.ns, ["quick"], 1.8, g.ns.getPlayer())[0].hostname, "quick");
  g.ns.formulas.hacking.hackExp = () => 0;
  assert.deepEqual(rankFarmTargets(g.ns, ["quick"], 1.8, g.ns.getPlayer()), []);
  g.ns.getGrowTime = () => Infinity;
  assert.deepEqual(rankFarmTargets(g.ns, ["quick"], 1.8), []);
});

test("full-money farms award XP without security growth, preserve reserves, and isolate financial metrics", async () => {
  const g = game({ args: [0, 0, 1] });
  g.add("runner", { maxRam: 32, cpuCores: 8 });
  g.target("farm", { requiredHackingSkill: 9999 });
  await run(g, 32, () => {}, now => completeTimedWorkers(g, now));
  assert.ok(g.launches.length > 4);
  assert.ok(g.launches.every(p => p.filename === WORKERS.grow && p.args[1] === 0 && p.temporary));
  assert.equal(g.launches[0].host, "runner");
  assert.ok(g.launches.filter(p => p.host === "home").every(p => p.remainingRam >= 4 - 1e-9));
  assert.ok(g.events.every(e => e.security === 1 && e.money === 1000000 && e.xp > 0));
  const m = JSON.parse(g.data.get(HACKING_METRICS));
  assert.ok(m.farmXp > 0 && m.farmRamSeconds > 0 && m.farmReports > 0);
  assert.equal(m.farmMissing, 0);
  for (const key of ["money", "xp", "ramSeconds", "homeSupportRam", "reports", "missing", "demand"]) assert.equal(m[key], 0, key);
});

test("XP preparation requires exact maximum money then weakens before full-thread growth", async () => {
  for (const moneyAvailable of [999500, 1000000 - 1e-8]) {
    const g = game({ args: [0, 3, 1] });
    g.target("farm", { moneyAvailable, requiredHackingSkill: 9999 });
    await run(g, 15, () => {}, now => completeTimedWorkers(g, now));
    assert.deepEqual(g.events.slice(0, 3).map(e => e.action), ["grow", "weaken", "grow"]);
    assert.equal(g.events[0].money, 1000000);
    assert.equal(g.events[1].security, 1);
    assert.ok(g.launches.every(p => p.threads <= 3));
    assert.ok(g.events.slice(2).every(e => e.security === 1));
  }
});

test("money jobs reclaim only owned XP workers without corrupting complete financial windows", async () => {
  const g = game({ args: [1, 0, 1] });
  g.target("income");
  g.target("farm", { requiredHackingSkill: 9999 });
  g.ns.getGrowTime = target => target === "farm" ? 60000 : 3200;
  g.processes.set(99, { pid: 99, filename: "/scripts/manual.js", host: "home", threads: 1, args: [], ram: 1 });
  await run(g, 32, () => {}, now => completeTimedWorkers(g, now));
  assert.ok(g.killed.length > 0);
  assert.ok(g.killed.every(pid => g.launches.find(p => p.pid === pid)?.args[0] === "farm"));
  assert.ok(g.processes.has(99));
  const m = JSON.parse(g.data.get(HACKING_METRICS));
  assert.ok(m.complete && m.money > 0 && m.ramSeconds > 0 && m.farmPreemptions > 0);
  assert.equal(m.farmMissing, 0);
  assert.equal(m.missing, 0);
});

test("farm reports and intentional interruptions never pollute money accounting", () => {
  const owned = new Map([[42, { target: "farm", farm: true }], [43, { target: "farm", farm: true, preempted: true }],
    [44, { target: "farm", farm: true }]]);
  const m = metricsWindow();
  assert.ok(acceptWorkerReport({ pid: 42, target: "farm", money: 0, xp: 20, complete: true }, owned, m));
  assert.ok(acceptWorkerReport({ pid: 43, target: "farm", money: 0, xp: 0, complete: false }, owned, m));
  assert.equal(m.farmXp, 20); assert.equal(m.farmReports, 2); assert.equal(m.farmMissing, 0);
  assert.ok(acceptWorkerReport({ pid: 44, target: "farm", money: 0, xp: 0, complete: false }, owned, m));
  assert.equal(m.farmMissing, 1);
  assert.equal(m.xp, 0); assert.equal(m.reports, 0); assert.equal(m.missing, 0);
});

test("farms exclude external HGW targets and cleanup preserves manual processes", async () => {
  const g = game({ args: [1, 0, 1] });
  g.target("income");
  g.target("external", { requiredHackingSkill: 9999, baseDifficulty: 100 });
  g.target("farm", { requiredHackingSkill: 9999 });
  g.add("hash-runner", { maxRam: 64 });
  g.nodes.push({ name: "hash-runner", cache: 1 });
  g.processes.set(99, { pid: 99, filename: WORKERS.grow, host: "hash-runner", threads: 1, args: ["external"], ram: 1.8 });
  await run(g);
  assert.ok(g.launches.some(p => p.args[0] === "farm"));
  assert.ok(g.launches.every(p => p.args[0] !== "external"));
  g.exit();
  assert.ok(g.processes.has(99));
  assert.ok(g.launches.every(p => !g.processes.has(p.pid)));
});

test("automatic demand includes the next waiting target and is independent of XP allocation", async () => {
  const results = [];
  for (const idleXp of [0, 1]) {
    const g = game({ homeRam: 64, args: [0, 0, idleXp] });
    for (let i = 0; i < 8; i++) g.target(`income${i}`);
    g.target("farm", { requiredHackingSkill: 9999 });
    await run(g, 32, () => {}, now => completeTimedWorkers(g, now));
    const m = JSON.parse(g.data.get(HACKING_METRICS));
    assert.ok(m.complete && m.demand > 0);
    results.push([m.money, m.ramSeconds, m.demand]);
  }
  assert.deepEqual(results[0], results[1]);
});

test("newly eligible money targets displace their old XP farm after discovery refresh", async () => {
  const g = game({ args: [0, 0, 1] });
  g.level = 1;
  g.target("income");
  g.target("farm", { requiredHackingSkill: 10, baseDifficulty: 50 });
  g.ns.getGrowTime = target => target === "farm" ? 60000 : 3200;
  await run(g, 32, tick => { if (tick === 30) g.level = 10; }, now => completeTimedWorkers(g, now));
  assert.ok(g.launches.some(p => p.args[0] === "farm" && p.args[1] === 0 && p.tick < 30));
  assert.ok(g.launches.some(p => p.args[0] === "farm" && p.args[1] > 0 && p.tick >= 30));
  assert.ok(g.killed.every(pid => g.launches.find(p => p.pid === pid)?.args[1] === 0));
});

test("distributed XP caps, external contention and reloads preserve ownership", async () => {
  const g = game({ homeRam: 32, args: [0, 6, 1] });
  g.add("runner", { maxRam: 3.6 });
  g.target("farm", { requiredHackingSkill: 9999, baseDifficulty: 20 });
  g.target("other", { requiredHackingSkill: 9999 });
  await run(g);
  assert.equal(g.launches.reduce((sum, p) => sum + p.threads, 0), 6);
  assert.equal(new Set(g.launches.map(p => p.host)).size, 2);
  const old = g.launches.slice();
  g.processes.set(99, { pid: 99, filename: WORKERS.grow, host: "home", threads: 1, args: ["farm"], ram: 1.8 });
  await run(g, 2);
  assert.ok(g.launches.slice(old.length).every(p => p.args[0] === "other"));
  assert.ok(g.processes.has(99));
  for (const p of [...g.processes.values()]) if (p.temporary) g.processes.delete(p.pid);
  g.servers.get("other").hackDifficulty = 2;
  const before = g.launches.length;
  await run(g, 3);
  assert.ok(g.launches.slice(before).every(p => p.args[0] === "other" && p.filename === WORKERS.weaken && p.args[1] === 0));
  g.exit();
  assert.ok(g.processes.has(99));
  assert.ok(!g.killed.includes(99));
});

test("five-minute simulated comparison checks income, XP and idle capacity across modes", async t => {
  const results = [];
  for (const [mode, args] of [["three-target baseline", [3, 0]], ["automatic", [0, 0]], ["automatic + XP", [0, 0, 1]]]) {
    const g = game({ homeRam: 512, args });
    for (let i = 0; i < 10; i++) g.target(`income${i}`);
    g.target("farm", { requiredHackingSkill: 9999, baseDifficulty: 10 });
    const windows = [];
    const write = g.ns.write;
    g.ns.write = async (file, value) => { if (file === HACKING_METRICS) windows.push(JSON.parse(value)); await write(file, value); };
    await run(g, 300, () => {}, now => completeTimedWorkers(g, now));
    const completed = g.logs.filter(l => l.startsWith("BATCH") && l.includes("complete:")).length;
    assert.ok(completed >= 5);
    assert.ok(windows.every(w => w.complete && !w.cancelled && !w.recoveries && !w.missing));
    results.push({ mode, seconds: 300, completed,
      moneyPerSecond: g.events.reduce((sum, e) => sum + e.earned, 0) / 300,
      xpPerSecond: g.events.reduce((sum, e) => sum + e.xp, 0) / 300,
      idleRam: windows.reduce((sum, w) => sum + w.idleRam, 0) / windows.length,
      preparationSeconds: windows.reduce((sum, w) => sum + w.preparationSeconds, 0),
      cancellations: windows.reduce((sum, w) => sum + w.cancelled, 0),
      xpPreemptions: windows.reduce((sum, w) => sum + w.farmPreemptions, 0) });
  }
  assert.ok(results[1].moneyPerSecond > results[0].moneyPerSecond);
  assert.equal(results[2].moneyPerSecond, results[1].moneyPerSecond);
  assert.ok(results[2].xpPerSecond > results[1].xpPerSecond);
  assert.ok(results[2].idleRam < results[1].idleRam);
  t.diagnostic(`Deterministic simulation only, not a live-game benchmark: ${JSON.stringify(results)}`);
});

test("ongoing preparation gets released RAM before a newly eligible batch can starve it", async () => {
  const g = game({ homeRam: 64 });
  g.target("alpha", { hackDifficulty: 2 });
  g.target("ready", { moneyMax: 100000000, moneyAvailable: 100000000, requiredHackingSkill: 9999 });
  await run(g, 32, tick => {
    if (tick === 30) {
      g.finish();
      Object.assign(g.servers.get("alpha"), { hackDifficulty: 1, moneyAvailable: 0 });
      g.servers.get("ready").requiredHackingSkill = 1;
    }
  });
  const resumed = g.launches.filter(p => p.tick >= 30);
  assert.ok(resumed.length > 0);
  assert.ok(resumed.every(p => p.args[0] === "alpha" && p.filename === WORKERS.grow));
});

test("automatic batch goals use surplus RAM for larger theft and fully sized restoration", () => {
  const g = game();
  const server = g.target("income");
  const capacity = [{ host: "runner", free: 8192, cores: 8 }];
  const large = planBatch(g.ns, server, capacity, 8192, 0, workerRam(g), null, 0.90);
  const small = planBatch(g.ns, server, capacity, 8192, 0, workerRam(g));
  const hacks = plan => plan.filter(p => p.action === "hack").reduce((sum, p) => sum + p.threads, 0);
  assert.equal(hacks(large), 90);
  assert.equal(hacks(small), 10);
  const afterHack = server.moneyMax * (1 - hacks(large) * 0.01);
  const grows = large.filter(p => p.action === "grow").reduce((sum, p) => sum + p.threads, 0);
  assert.ok((afterHack + grows) * Math.exp(0.01 * grows * (1 + 7 / 16)) >= server.moneyMax);
  const capped = planBatch(g.ns, server, capacity, 8192, 17, workerRam(g), null, 0.90);
  for (const wave of [0, 1, 2, 3]) assert.ok(capped.filter(p => p.wave === wave).reduce((sum, p) => sum + p.threads, 0) <= 17);
});

test("16 TB home and 25 cloud servers fill during both preparation and all-money-target saturation", async () => {
  for (const scenario of ["all money targets busy", "preparing"]) {
    const g = game({ homeRam: 16384, args: [0, 0, 1] });
    for (let i = 0; i < 25; i++) g.add(`cloud-${i}`, { maxRam: 16384 });
    if (scenario === "preparing") {
      g.target("income");
      g.target("preparing", { hackDifficulty: 2 });
      g.target("xp", { requiredHackingSkill: 9999, hackDifficulty: 2 });
    } else for (let i = 0; i < 6; i++) g.target(`income-${i}`);
    await run(g);
    for (const s of g.servers.values()) {
      if (!s.maxRam) continue;
      const free = g.ns.getServerMaxRam(s.hostname) - g.ns.getServerUsedRam(s.hostname) - (s.hostname === "home" ? 4 : 0);
      assert.ok(free >= -1e-7 && free < g.ram[WORKERS.weaken], `${scenario}: ${s.hostname} left ${free} GB idle`);
    }
    assert.ok(g.launches.some(p => p.args[3] !== undefined && p.filename === WORKERS.weaken));
    assert.ok(g.launches.filter(p => p.args[3] !== undefined).every(p => p.filename !== WORKERS.grow));
  }
});

test("weaken XP filler safely shares money targets through many restored batches", async () => {
  const g = game({ homeRam: 16384, args: [0, 0, 1] });
  g.target("income");
  g.add("cloud", { maxRam: 16384, cpuCores: 8 });
  await run(g, 60, () => {}, now => completeTimedWorkers(g, now));
  assert.ok(g.launches.some(p => p.args[3] !== undefined));
  assert.ok(g.launches.filter(p => p.args[3] !== undefined).every(p => p.filename === WORKERS.weaken));
  assert.ok(g.logs.filter(l => l.startsWith("BATCH income complete:")).length >= 5);
  assert.ok(g.logs.filter(l => l.startsWith("BATCH income complete:")).every(l => l.endsWith("ready.")));
  const m = JSON.parse(g.data.get(HACKING_METRICS));
  assert.ok(m.complete && m.money > 0 && m.farmXp > 0 && m.farmRamSeconds > m.ramSeconds);
  assert.equal(m.recoveries, 0); assert.equal(m.cancelled, 0);
});

test("XP top-ups consume RAM upgrades immediately without cancelling active waves", async () => {
  const g = game({ homeRam: 64, args: [0, 0, 1] });
  g.target("farm", { requiredHackingSkill: 9999 });
  g.ns.getGrowTime = () => 60000;
  let initial;
  await run(g, 2, tick => {
    if (tick === 1) { initial = g.launches.slice(); g.servers.get("home").maxRam = 16384; }
  });
  assert.deepEqual(g.killed, []);
  assert.ok(initial.every(p => g.processes.has(p.pid)));
  assert.ok(g.launches.length > initial.length);
  assert.ok(g.ns.getServerMaxRam("home") - g.ns.getServerUsedRam("home") - 4 < 1.8);
  assert.equal(new Set(g.launches.map(p => JSON.stringify(p.args))).size, g.launches.length);
});

test("money restarts preserve XP unless a particular host actually needs its RAM", async () => {
  for (const largerBatch of [false, true]) {
    const g = game({ homeRam: 256, args: [1, 0, 1] });
    g.add("a", { maxRam: 256 }); g.add("b", { maxRam: 256 });
    g.target("income"); g.target("farm", { requiredHackingSkill: 9999 });
    g.ns.getGrowTime = target => target === "farm" ? 60000 : 3200;
    let initialXp;
    await run(g, 2, tick => {
      if (tick !== 1) return;
      initialXp = g.launches.filter(p => p.args[0] === "farm");
      for (const p of [...g.processes.values()]) if (p.args[0] === "income") g.processes.delete(p.pid);
      if (largerBatch) g.ns.hackAnalyze = () => 0.005;
    });
    if (!largerBatch) assert.deepEqual(g.killed, []);
    else {
      assert.ok(g.killed.length > 0);
      assert.ok(g.killed.every(pid => g.launches.find(p => p.pid === pid)?.host === "a"));
    }
    assert.ok(initialXp.filter(p => p.host !== "a").every(p => g.processes.has(p.pid)));
  }
});

test("XP caps cover preparation and overlapping filler workers on each action", async () => {
  const g = game({ homeRam: 256, args: [0, 3, 1] });
  g.target("farm", { moneyAvailable: 999500, requiredHackingSkill: 9999 });
  await run(g, 20, () => {}, now => {
    completeTimedWorkers(g, now);
    for (const file of [WORKERS.grow, WORKERS.weaken]) {
      const active = [...g.processes.values()].filter(p => p.filename === file);
      assert.ok(active.reduce((sum, p) => sum + p.threads, 0) <= 3);
    }
  });
});

test("validated home RAM requests preempt only owned home XP and expire without a permanent reserve", async () => {
  const g = game({ homeRam: 256, args: [0, 0, 1] });
  g.add("runner", { maxRam: 256 });
  g.target("farm", { requiredHackingSkill: 9999 });
  g.ns.getGrowTime = () => 60000;
  for (const [pid, filename] of [[99, "/scripts/purchase-manager.js"], [98, "/scripts/manual.js"]]) {
    g.processes.set(pid, { pid, filename, host: "home", threads: 1, args: [], ram: 1 });
  }
  const free = () => g.ns.getServerMaxRam("home") - g.ns.getServerUsedRam("home");
  await run(g, 8, tick => {
    if (tick === 1) {
      assert.ok(free() < 6);
      for (const request of [{ pid: 99, ram: 160 }, { pid: 98, ram: 250 }, { pid: 99, ram: Infinity }, { pid: 99, ram: -1 }, { pid: 999, ram: 250 }]) {
        g.ns.writePort(1, { type: "home-ram", ...request });
      }
    }
    if (tick === 2) assert.ok(free() >= 160 && free() < 162);
  });
  assert.ok(free() < 6, "expired requests release the temporary headroom back to XP");
  assert.ok(g.killed.length > 0);
  assert.ok(g.killed.every(pid => g.launches.find(p => p.pid === pid)?.host === "home"));
  assert.ok(g.processes.has(99) && g.processes.has(98));
});
