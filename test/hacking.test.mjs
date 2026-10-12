import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import ts from "typescript";
import { main as start } from "../home/scripts/hack.js";
import { main as manage } from "../home/scripts/hack-manager.js";
import { main as scan } from "../home/scripts/scan-hosts.js";
import { MANAGER, WORKERS, rootHosts, scanAllHosts } from "../home/scripts/network.js";

const STOP = Symbol("stop test loop");

function game({ homeRam = 256, controller = "home", script = MANAGER, args = [3, 0] } = {}) {
  const servers = new Map();
  const files = new Map([["home", new Set([MANAGER, "/scripts/network.js", ...Object.values(WORKERS)])]]);
  const processes = new Map([[1, { pid: 1, filename: script, host: controller, threads: 1, args }]]);
  const ram = { [MANAGER]: 12.4, "/scripts/hack.js": 7.7, [WORKERS.hack]: 1.7, [WORKERS.grow]: 1.75, [WORKERS.weaken]: 1.75 };
  const g = { servers, files, processes, ram, nodes: [], programs: new Set(["NUKE.exe"]), launches: [], copies: [], logs: [], killed: [], tick: 0, level: 100 };
  g.add = (hostname, overrides = {}) => {
    servers.set(hostname, {
      hostname, hasAdminRights: true, purchasedByPlayer: false, requiredHackingSkill: 1,
      numOpenPortsRequired: 0, openPortCount: 0, maxRam: 0, baseUsed: 0, cpuCores: 1,
      moneyMax: 0, moneyAvailable: 0, hackDifficulty: 1, minDifficulty: 1, ...overrides,
    });
    return servers.get(hostname);
  };
  g.target = (hostname, overrides = {}) => g.add(hostname, { moneyMax: 1000000, moneyAvailable: 1000000, ...overrides });
  g.add("home", { maxRam: homeRam, purchasedByPlayer: true });
  if (controller !== "home") g.add(controller, { maxRam: 16 });
  const used = host => servers.get(host).baseUsed + [...processes.values()]
    .filter(p => p.host === host).reduce((total, p) => total + p.threads * (p.ram ?? ram[p.filename]), 0);
  let pid = 10;
  g.ns = {
    pid: 1, args, self: () => processes.get(1), getHostname: () => controller, getScriptName: () => script,
    scan: host => host === "home" ? [...servers.keys()].filter(h => h !== "home") : ["home"],
    serverExists: host => servers.has(host), hasRootAccess: host => servers.get(host).hasAdminRights,
    getServerMaxRam: host => servers.get(host).maxRam, getServerUsedRam: used,
    getServer: host => ({ ...servers.get(host), ramUsed: used(host) }),
    getHackingLevel: () => g.level,
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
    weakenAnalyze: (threads, cores = 1) => threads * 0.05 * (1 + (cores - 1) / 16),
    growthAnalyze: (host, multiplier, cores = 1) => Math.log(multiplier) / (0.01 * (1 + (cores - 1) / 16)),
    scp: async (names, host) => {
      g.copies.push({ names, host, tick: g.tick });
      assert.ok(servers.has(host));
      if (!files.has(host)) files.set(host, new Set());
      for (const file of names) files.get(host).add(file);
      return true;
    },
    exec: (file, host, options, ...workerArgs) => {
      assert.ok(Number.isInteger(options.threads) && options.threads > 0);
      if (!servers.has(host) || !g.ns.fileExists(file, host) ||
          servers.get(host).maxRam - used(host) < options.threads * ram[file]) return 0;
      if (options.preventDuplicates && g.ns.ps(host).some(p => p.filename === file && JSON.stringify(p.args) === JSON.stringify(workerArgs))) return 0;
      const process = { pid: pid++, filename: file, host, threads: options.threads, args: workerArgs };
      processes.set(process.pid, process);
      g.launches.push({ ...process, tick: g.tick, remainingRam: servers.get(host).maxRam - used(host) });
      return process.pid;
    },
    spawn: (file, options, ...workerArgs) => {
      processes.delete(1);
      assert.ok(g.ns.exec(file, controller, options, ...workerArgs));
    },
    write: async (file, value) => { g.report = { file, value }; },
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

async function run(g, ticks = 1, onSleep = () => {}) {
  g.ns.sleep = async ms => {
    assert.equal(ms, 1000);
    onSleep(++g.tick);
    if (g.tick >= ticks) throw STOP;
  };
  try { await manage(g.ns); }
  catch (error) { if (error !== STOP) throw error; }
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
  assert.deepEqual([...counts.values()], [1, 1]);
  assert.equal(opened.portsRemaining, 0);
  assert.equal(opened.maxRam, 32);
  assert.equal(opened.ramUsed, 4);
  assert.equal(opened.cpuCores, 8);
  assert.ok(["hasRootAccess", "requiredHackingLevel", "requiredOpenPorts", "openPortCount", "securityLevel", "hackChance", "hackTimeMs", "moneyAvailable"].every(key => key in opened));
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
  for (const args of [[0, 0], [1, -1], [1.5, 0], [1, Infinity]]) {
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
    g.target("alpha", action === "weaken" ? { hackDifficulty: 3 } : { moneyAvailable: 850000 });
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
      assert.deepEqual(g.launches.map(p => p.args[0]), ["alpha"]);
      g.finish();
    }
  });
  assert.deepEqual(g.launches.map(p => p.args[0]), ["alpha", "beta"]);
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
  assert.equal(retry.launches.length, 1);
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

test("documented RAM costs keep the launcher within 8 GB and the controller within 16 GB", async () => {
  const definitions = ts.createSourceFile("defs.ts", await readFile(new URL("../NetscriptDefinitions.d.ts", import.meta.url), "utf8"), ts.ScriptTarget.Latest, true);
  const costs = new Map();
  for (const statement of definitions.statements) {
    if (!ts.isInterfaceDeclaration(statement) || !["NS", "Hacknet"].includes(statement.name.text)) continue;
    for (const member of statement.members) {
      const cost = member.getFullText(definitions).match(/RAM cost:\s*([\d.]+)\s*GB/i);
      if (cost && member.name) costs.set((statement.name.text === "Hacknet" ? "hacknet." : "") + member.name.getText(definitions), Number(cost[1]));
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
  for (const name of ["hack", "hack-manager", "hack-worker", "grow-worker", "weaken-worker"]) {
    const methods = await methodsIn(new URL(`../home/scripts/${name}.js`, import.meta.url));
    assert.deepEqual([...methods].filter(method => !costs.has(method)), [], "Every API call needs a documented RAM cost");
    // Include all imported helper calls, making this a conservative upper bound.
    measured[name] = Math.round((1.6 + [...methods].reduce((sum, method) => sum + costs.get(method), 0)) * 100) / 100;
  }
  assert.ok(measured.hack <= 8, "Launcher must fit a starter home");
  assert.ok(measured["hack-manager"] <= 16, "Controller must fit a rooted starter server");
  assert.ok(measured["hack-worker"] <= 1.7);
  assert.ok(measured["grow-worker"] <= 1.75);
  assert.ok(measured["weaken-worker"] <= 1.75);
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
