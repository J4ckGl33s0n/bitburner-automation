import assert from "node:assert/strict";
import test from "node:test";
import { setImmediate as yieldTurn } from "node:timers/promises";
import { main as manage, purchaseServer } from "../home/scripts/purchase-manager.js";
import { main as hacknet, purchaseHacknet } from "../home/scripts/hacknet-manager.js";
import { main as programs } from "../home/scripts/program-buyer.js";
import { canAfford, PORT_PROGRAMS, PROGRAM_BUYER, PURCHASE_MANAGER } from "../home/scripts/spending.js";

const STOP = Symbol("stop test loop");

function game({ owned = true, money = 1000000, settings = {}, script = PURCHASE_MANAGER } = {}) {
  const g = {
    money, settings: { reserve: 100000, budget: 0.1, payback: 120, nodes: 20, ...settings },
    programs: new Set(owned ? PORT_PROGRAMS : []), tor: owned,
    prices: new Map(PORT_PROGRAMS.map((name, i) => [name, [500000, 1500000, 5000000, 30000000, 250000000][i]])),
    servers: new Map(), names: new Set(), nodes: [], ports: new Map(), exits: new Map(),
    processes: new Map([[1, { pid: 1, filename: script, threads: 1, args: [] }]]),
    logs: [], spends: [], attempts: [], launches: [], killed: [], tasks: [], fail: new Set(),
    cycle: 0, homeRam: 256, usedRam: 10, buyerRam: 12, serverLimit: 25, ramLimit: 1024,
    serverCost: 100, upgradeCost: 100, nodeCost: 100, levelCost: Infinity, coreCost: Infinity, nodeRamCost: Infinity,
    hostname: "home", buyerFile: true, currentNode: 1, sourceFiles: new Map([[4, 3]]),
  };
  const queue = port => {
    if (!g.ports.has(port)) g.ports.set(port, []);
    return g.ports.get(port);
  };
  const read = port => queue(port).length ? queue(port).shift() : "NULL PORT DATA";
  g.nextCost = () => {
    const name = PORT_PROGRAMS.find(file => !g.programs.has(file));
    return name ? g.tor ? g.prices.get(name) : 200000 : 0;
  };
  const spend = (type, target, cost) => {
    g.attempts.push({ type, target, cycle: g.cycle });
    if (g.fail.has(type)) return false;
    assert.ok(g.money >= cost, "game refuses purchases without enough cash");
    g.spends.push({ type, target, cost, before: g.money, nextCost: g.nextCost(), cycle: g.cycle });
    g.money -= cost;
    return true;
  };
  g.exit = pid => {
    g.exits.get(pid)?.();
    g.processes.delete(pid);
  };
  let nextPid = 10;
  function surface(pid, filename, args = []) {
    const ns = {
      pid, args, flags: schema => ({ ...Object.fromEntries(schema), ...g.settings }),
      getHostname: () => g.hostname, getScriptName: () => filename, self: () => g.processes.get(pid),
      getResetInfo: () => ({ currentNode: g.currentNode, ownedSF: new Map(g.sourceFiles) }),
      ps: () => [...g.processes.values()], isRunning: id => g.processes.has(id),
      disableLog: () => {}, print: message => g.logs.push(message), tprint: message => g.logs.push(message),
      atExit: fn => g.exits.set(pid, fn),
      fileExists: file => file === PROGRAM_BUYER ? g.buyerFile : g.programs.has(file),
      getServerMoneyAvailable: () => g.money,
      serverExists: host => g.names.has(host) || g.servers.has(host),
      getScriptRam: () => g.buyerRam,
      getServerMaxRam: host => host === "home" ? g.homeRam : g.servers.get(host),
      getServerUsedRam: () => g.usedRam + [...g.processes.values()].filter(p => p.filename === PROGRAM_BUYER).length * g.buyerRam,
      hasTorRouter: () => g.tor,
      clearPort: port => { queue(port).length = 0; }, readPort: read,
      writePort: (port, value) => queue(port).push(port === 1 && g.replyOverride ? g.replyOverride(value) : value),
      getPortHandle: port => ({ empty: () => queue(port).length === 0, read: () => read(port) }),
      kill: id => { g.killed.push(id); g.exit(id); return true; },
      exec: (file, host, options, ...childArgs) => {
        assert.equal(file, PROGRAM_BUYER);
        assert.equal(host, "home");
        assert.equal(options.threads, 1);
        if (g.launchFails) return 0;
        const id = nextPid++;
        g.launches.push({ pid: id, cycle: g.cycle });
        g.processes.set(id, { pid: id, filename: file, threads: 1, args: childArgs });
        if (g.crashChild) g.processes.delete(id);
        else if (!g.silentChild) {
          const task = programs(surface(id, file, childArgs)).catch(error => {
            if (error !== STOP) throw error;
          }).finally(() => g.exit(id));
          g.tasks.push(task);
        }
        return id;
      },
      sleep: async ms => {
        if (pid === 1 && ms === 2000) {
          g.cycle++;
          g.onCycle?.(g.cycle);
          if (g.cycle >= g.cycles) throw STOP;
        } else assert.equal(ms, 100);
        await yieldTurn();
        if (!g.processes.has(pid)) throw STOP;
      },
      singularity: {
        getDarkwebProgramCost: name => {
          if (g.noSingularity) throw new Error("Singularity access required");
          return g.prices.get(name);
        },
        purchaseTor: () => {
          if (g.noSingularity) throw new Error("Singularity access required");
          if (!spend("tor", "TOR", 200000)) return false;
          g.tor = true;
          return true;
        },
        purchaseProgram: name => {
          if (!spend("program", name, g.prices.get(name))) return false;
          g.programs.add(name);
          return true;
        },
      },
      cloud: {
        getServerNames: () => [...g.servers.keys()], getServerLimit: () => g.serverLimit,
        getRamLimit: () => g.ramLimit, getServerCost: () => g.serverCost,
        getServerUpgradeCost: () => g.upgradeCost,
        purchaseServer: (host, ram) => {
          if (!spend("server", host, g.serverCost)) return "";
          assert.ok(g.servers.size < g.serverLimit && ram <= g.ramLimit);
          g.servers.set(host, ram);
          return host;
        },
        upgradeServer: (host, ram) => {
          if (!spend("upgrade", host, g.upgradeCost)) return false;
          assert.ok(ram > g.servers.get(host) && ram <= g.ramLimit);
          g.servers.set(host, ram);
          return true;
        },
      },
      hacknet: {
        numNodes: () => g.nodes.length, getNodeStats: i => ({ ...g.nodes[i] }), maxNumNodes: () => 20,
        getPurchaseNodeCost: () => g.nodeCost,
        getLevelUpgradeCost: () => g.levelCost, getRamUpgradeCost: () => g.nodeRamCost,
        getCoreUpgradeCost: () => g.coreCost,
        purchaseNode: () => {
          if (!spend("node", g.nodes.length, g.nodeCost)) return -1;
          g.nodes.push({ level: 1, ram: 1, cores: 1, production: 1 });
          return g.nodes.length - 1;
        },
        upgradeLevel: i => {
          if (!spend("level", i, g.levelCost)) return false;
          g.nodes[i].level++;
          return true;
        },
        upgradeRam: i => {
          if (!spend("ram", i, g.nodeRamCost)) return false;
          g.nodes[i].ram *= 2;
          return true;
        },
        upgradeCore: i => {
          if (!spend("core", i, g.coreCost)) return false;
          g.nodes[i].cores++;
          return true;
        },
      },
    };
    return ns;
  }
  g.ns = surface(1, script);
  return g;
}

async function run(g, cycles = 1, onCycle, entry = manage) {
  g.cycles = cycles;
  g.onCycle = onCycle;
  try { await entry(g.ns); }
  catch (error) { if (error !== STOP) throw error; }
  finally {
    g.exit(1);
    await Promise.all(g.tasks);
  }
}

test("spending uses exact reserve and fractional budget boundaries, rejecting invalid prices", () => {
  const g = game({ money: 101000 });
  assert.equal(canAfford(g.ns, 100, 100000, 0.1), true);
  assert.equal(canAfford(g.ns, 100.01, 100000, 0.1), false);
  assert.equal(canAfford(g.ns, 1000, 100000), true);
  g.money = 100000;
  assert.equal(canAfford(g.ns, 1, 100000), false);
  for (const price of [0, -1, NaN, Infinity]) assert.equal(canAfford(g.ns, price, 0), false);
});

test("both entrypoints validate settings, host, thread count, and competing buyers before spending", async () => {
  for (const [script, entry] of [[PURCHASE_MANAGER, manage], ["/scripts/hacknet-manager.js", hacknet]]) {
    for (const settings of [{ reserve: -1 }, { reserve: Infinity }, { budget: 0 }, { budget: 1.1 },
      { payback: 0 }, { payback: NaN }, { nodes: 1.5 }, { nodes: 0 }]) {
      const g = game({ script, settings });
      await run(g, 1, undefined, entry);
      assert.equal(g.attempts.length, 0);
      assert.ok(g.logs.some(s => s.includes("Invalid settings")));
    }
    for (const filename of ["scripts/hacknet-manager.js", "scripts/purchase-manager.js"]) {
      const g = game({ script });
      g.processes.set(99, { pid: 99, filename, threads: 1 });
      await run(g, 1, undefined, entry);
      assert.equal(g.attempts.length, 0);
      assert.ok(g.logs.some(s => s.includes("only one")));
    }
    for (const invalid of ["host", "threads"]) {
      const g = game({ script });
      if (invalid === "host") g.hostname = "remote";
      else g.processes.get(1).threads = 2;
      await run(g, 1, undefined, entry);
      assert.equal(g.attempts.length, 0);
      assert.equal(g.cycle, 0);
    }
    const help = game({ script, settings: { help: true } });
    await run(help, 1, undefined, entry);
    assert.equal(help.attempts.length, 0);
    assert.ok(help.logs[0].includes(script));
  }
});

test("resident program buyer purchases TOR then five openers and releases RAM after completion", async () => {
  const g = game({ owned: false, money: 1000000000 });
  await run(g, 6);
  assert.deepEqual(g.spends.filter(s => ["tor", "program"].includes(s.type)).map(s => s.target), ["TOR", ...PORT_PROGRAMS]);
  assert.equal(g.launches.length, 1);
  assert.equal(g.processes.size, 0);
  for (const s of g.spends) {
    assert.ok(s.before - s.cost >= g.settings.reserve);
    if (!["tor", "program"].includes(s.type)) {
      assert.ok(s.cost <= (s.before - g.settings.reserve - s.nextCost) * g.settings.budget);
    }
  }
});

test("owned programs are skipped; complete programs bypass Singularity entirely", async () => {
  const g = game({ money: 300000000 });
  g.programs.delete("SQLInject.exe");
  await run(g);
  assert.deepEqual(g.spends.filter(s => s.type === "program").map(s => s.target), ["SQLInject.exe"]);
  const complete = game();
  complete.noSingularity = true;
  await run(complete);
  assert.equal(complete.launches.length, 0);
  assert.equal(complete.spends[0].type, "server");
});

test("without active SF4, missing programs do not launch a buyer or block reserved investments", async () => {
  for (const sourceFiles of [new Map(), new Map([[4, 0]])]) {
    const g = game({ owned: false, money: 101100 });
    g.sourceFiles = sourceFiles;
    g.noSingularity = true;
    g.usedRam = 250;
    g.buyerFile = false;
    await run(g, 2);
    assert.equal(g.launches.length, 0);
    assert.deepEqual(g.spends.map(s => s.type), ["server", "node"]);
    assert.ok(g.money >= g.settings.reserve);
    assert.ok(g.logs.some(s => s.includes("buy TOR and port programs manually")));
    assert.ok(!g.logs.some(s => s.includes("Investments stopped")));
  }
});

test("BitNode 4 and each active SF4 level enable automatic program purchases", async () => {
  for (const [currentNode, sourceFiles] of [[4, new Map()], ...[1, 2, 3].map(level => [1, new Map([[4, level]])])]) {
    const g = game();
    g.currentNode = currentNode;
    g.sourceFiles = sourceFiles;
    g.programs.delete("BruteSSH.exe");
    await run(g);
    assert.equal(g.launches.length, 1);
    assert.equal(g.spends[0].type, "program");
    assert.equal(g.spends[0].target, "BruteSSH.exe");
  }
});

test("program savings pause investments below the next cost and preserve the exact reserve", async () => {
  for (const money of [599999, 600000]) {
    const g = game({ money });
    g.programs.delete("BruteSSH.exe");
    await run(g, 2);
    assert.deepEqual(g.spends.map(s => s.type), money === 600000 ? ["program"] : []);
    assert.ok(g.money >= 100000);
  }
});

test("investments use the fresh post-program balance and protect the following program", async () => {
  const g = game({ owned: false, money: 210100, settings: { reserve: 100 } });
  for (const name of PORT_PROGRAMS) g.prices.set(name, 5000);
  await run(g);
  assert.deepEqual(g.spends.map(s => s.type), ["tor", "server"]);
  assert.equal(g.spends[1].before, 10100);
  assert.equal(g.spends[1].nextCost, 5000);
  assert.ok(g.money >= 5100);
});

test("failed program purchases retry without spending protected savings", async () => {
  const g = game({ owned: false });
  g.fail.add("tor");
  await run(g, 3, cycle => { if (cycle === 2) g.fail.delete("tor"); });
  assert.equal(g.attempts.filter(s => s.type === "tor").length, 3);
  assert.equal(g.spends.filter(s => s.type === "tor").length, 1);
  assert.equal(g.launches.length, 1);
  for (const s of g.spends.filter(s => s.type === "server" || s.type === "node")) {
    assert.ok(s.cost <= (s.before - g.settings.reserve - s.nextCost) * g.settings.budget);
  }
});

test("coordinator alternates investments and falls back when a category has no eligible purchase", async () => {
  const g = game();
  await run(g, 4);
  assert.deepEqual(g.spends.map(s => s.type), ["server", "node", "server", "node"]);
  const noServers = game();
  noServers.serverCost = Infinity;
  await run(noServers);
  assert.deepEqual(noServers.spends.map(s => s.type), ["node"]);
  const noHacknet = game({ settings: { nodes: 1 } });
  noHacknet.nodes.push({ level: 1, ram: 1, cores: 1, production: 0 });
  await run(noHacknet, 2);
  assert.deepEqual(noHacknet.spends.map(s => s.type), ["server", "server"]);
});

test("a failed investment consumes its cycle and is retried on a later opportunity", async () => {
  const g = game();
  g.fail.add("server");
  await run(g, 3, cycle => { if (cycle === 2) g.fail.delete("server"); });
  assert.deepEqual(g.attempts.map(s => s.type), ["server", "node", "server"]);
  assert.deepEqual(g.spends.map(s => s.type), ["node", "server"]);
  assert.equal(g.spends[1].cycle, 2);
});

test("fleet fills with 16 GB servers, then doubles the smallest to live RAM limits", () => {
  const g = game();
  g.serverLimit = 2;
  g.ramLimit = 32;
  g.names.add("pserv-0");
  for (let i = 0; i < 4; i++) assert.equal(purchaseServer(g.ns, g.settings), true);
  assert.deepEqual(g.spends.map(s => s.target), ["pserv-1", "pserv-2", "pserv-1", "pserv-2"]);
  assert.deepEqual([...g.servers.values()], [32, 32]);
  assert.equal(purchaseServer(g.ns, g.settings), false);
  g.ramLimit = 64;
  assert.equal(purchaseServer(g.ns, g.settings), true);
  const capped = game();
  capped.serverLimit = 0;
  assert.equal(purchaseServer(capped.ns, capped.settings), false);
  capped.serverLimit = 1;
  capped.ramLimit = 8;
  assert.equal(purchaseServer(capped.ns, capped.settings), false);
});

test("upgrades preserve existing servers and processes and break RAM ties by hostname", () => {
  const g = game();
  g.serverLimit = 2;
  g.servers.set("b-manual", 16);
  g.servers.set("a-manual", 16);
  g.processes.set(99, { pid: 99, filename: "/manual.js", threads: 1, host: "a-manual" });
  assert.equal(purchaseServer(g.ns, g.settings), true);
  assert.equal(g.spends[0].target, "a-manual");
  assert.equal(g.servers.get("a-manual"), 32);
  assert.ok(g.processes.has(99));
  assert.deepEqual(g.killed, []);
});

test("server purchases and upgrades reject invalid costs and recheck changing balances", () => {
  for (const cost of [-1, 0, NaN, Infinity]) {
    const g = game();
    g.serverCost = cost;
    assert.equal(purchaseServer(g.ns, g.settings), false);
    g.serverLimit = 1;
    g.servers.set("existing", 16);
    g.upgradeCost = cost;
    assert.equal(purchaseServer(g.ns, g.settings), false);
    assert.equal(g.attempts.length, 0);
  }
  const g = game();
  g.ns.serverExists = () => { g.money = 100000; return false; };
  assert.equal(purchaseServer(g.ns, g.settings), false);
  assert.equal(g.attempts.length, 0);
  g.servers.set("existing", 16);
  g.serverLimit = 1;
  g.money = 1000000;
  g.ns.cloud.getServerUpgradeCost = () => { g.money = 100000; return 100; };
  assert.equal(purchaseServer(g.ns, g.settings), false);
});

test("both managers buy new nodes above the payback limit while rejecting slow upgrades", async () => {
  for (const [script, entry] of [[PURCHASE_MANAGER, manage], ["/scripts/hacknet-manager.js", hacknet]]) {
    const g = game({ script });
    for (let i = 0; i < 5; i++) g.nodes.push({ level: 84, ram: 2, cores: 1, production: 138.435 });
    g.nodeCost = 20414;
    g.levelCost = 12212;
    g.nodeRamCost = 72348;
    g.coreCost = 471015;
    g.serverLimit = 0;
    await run(g, 1, undefined, entry);
    assert.deepEqual(g.spends.map(s => s.type), ["node"]);
    assert.equal(g.nodes.length, 6);
    assert.ok(g.logs.some(s => s.includes("payback 213.7 min")));
  }
});

test("exempt new nodes still require valid prices, production, protected cash, and a fresh budget", () => {
  const g = game();
  g.nodes.push({ level: 1, ram: 1, cores: 1, production: 1.59 });
  for (const cost of [-1, 0, NaN, Infinity]) {
    g.nodeCost = cost;
    assert.equal(purchaseHacknet(g.ns, g.settings), false);
  }
  g.nodeCost = 20414;
  for (const production of [-1, 0, NaN, Infinity]) {
    g.nodes[0].production = production;
    assert.equal(purchaseHacknet(g.ns, g.settings), false);
  }
  g.nodes[0].production = 1.59;
  const protectedCash = g.settings.reserve + 500000;
  const boundary = protectedCash + g.nodeCost / g.settings.budget;
  for (const money of [protectedCash, boundary - 1]) {
    g.money = money;
    assert.equal(purchaseHacknet(g.ns, g.settings, protectedCash), false);
  }
  let reads = 0;
  g.ns.getServerMoneyAvailable = () => ++reads === 1 ? boundary : protectedCash;
  assert.equal(purchaseHacknet(g.ns, g.settings, protectedCash), false);
  assert.equal(g.attempts.length, 0);
  g.money = boundary;
  g.ns.getServerMoneyAvailable = () => g.money;
  g.fail.add("node");
  assert.equal(purchaseHacknet(g.ns, g.settings, protectedCash), true);
  assert.equal(g.spends.length, 0);
  g.fail.delete("node");
  assert.equal(purchaseHacknet(g.ns, g.settings, protectedCash), true);
  assert.equal(g.spends[0].type, "node");
  assert.equal(g.money, boundary - g.nodeCost);
});

test("eligible upgrades with better income per dollar beat exempt new nodes", () => {
  const g = game();
  g.nodes.push({ level: 84, ram: 2, cores: 1, production: 138.435 });
  g.nodeCost = 20414;
  g.levelCost = 10000;
  assert.equal(purchaseHacknet(g.ns, g.settings), true);
  assert.deepEqual(g.spends.map(s => s.type), ["level"]);
});

test("Hacknet preserves starter exemption, ROI choice, upgrade payback filter, and configured/game node limits", () => {
  const starter = game({ settings: { payback: 0.0001 } });
  assert.equal(purchaseHacknet(starter.ns, starter.settings), true);
  const g = game({ settings: { nodes: 1 } });
  g.nodes.push({ level: 10, ram: 2, cores: 2, production: 100 });
  g.levelCost = 100;
  g.nodeRamCost = 100;
  g.coreCost = 100;
  assert.equal(purchaseHacknet(g.ns, g.settings), true);
  assert.equal(g.spends[0].type, "core");
  g.settings.payback = 0.0001;
  assert.equal(purchaseHacknet(g.ns, g.settings), false);
  g.settings.payback = 120;
  g.levelCost = g.nodeRamCost = g.coreCost = Infinity;
  assert.equal(purchaseHacknet(g.ns, g.settings), false);
  g.settings.nodes = 20;
  g.ns.hacknet.maxNumNodes = () => 1;
  assert.equal(purchaseHacknet(g.ns, g.settings), false);
  g.ns.hacknet.maxNumNodes = () => 20;
  assert.equal(purchaseHacknet(g.ns, g.settings), true);
  assert.equal(g.spends.at(-1).type, "node");
});

test("Hacknet rechecks balances after candidate pricing and retries failed starter/upgrade purchases", () => {
  const g = game();
  for (const cost of [-1, 0, NaN, Infinity]) {
    g.nodeCost = cost;
    assert.equal(purchaseHacknet(g.ns, g.settings), false);
  }
  g.nodeCost = 100;
  g.fail.add("node");
  assert.equal(purchaseHacknet(g.ns, g.settings), true);
  assert.equal(g.nodes.length, 0);
  g.fail.delete("node");
  assert.equal(purchaseHacknet(g.ns, g.settings), true);
  g.settings.nodes = 1;
  g.levelCost = 100;
  g.fail.add("level");
  assert.equal(purchaseHacknet(g.ns, g.settings), true);
  assert.equal(g.nodes[0].level, 1);
  g.fail.delete("level");
  assert.equal(purchaseHacknet(g.ns, g.settings), true);
  g.ns.hacknet.getLevelUpgradeCost = () => { g.money = 100000; return 100; };
  assert.equal(purchaseHacknet(g.ns, g.settings), false);
});

test("hash-producing Hacknet servers stop standalone spending but do not stop server coordination", async () => {
  const g = game({ script: "/scripts/hacknet-manager.js" });
  g.nodes.push({ cache: 1, name: "renamed-hash-server" });
  await run(g, 1, undefined, hacknet);
  assert.equal(g.attempts.length, 0);
  assert.equal(g.cycle, 0);
  const coordinated = game();
  coordinated.nodes.push({ cache: 1, name: "renamed-hash-server" });
  await run(coordinated, 4);
  assert.ok(coordinated.spends.every(s => s.type === "server"));
  assert.equal(coordinated.logs.filter(s => s.includes("Hash-producing")).length, 1);
});

test("standalone Hacknet retains its flags and two-second purchase loop", async () => {
  const g = game({ script: "/scripts/hacknet-manager.js", money: 100100, settings: { budget: 1, nodes: 1 } });
  await run(g, 2, undefined, hacknet);
  assert.deepEqual(g.spends.map(s => s.type), ["node"]);
  assert.equal(g.money, 100000);
});

test("insufficient home RAM pauses all spending and retries after capacity becomes available", async () => {
  const g = game({ owned: false });
  g.usedRam = 250;
  await run(g, 2, cycle => {
    if (cycle === 1) {
      assert.equal(g.attempts.length, 0);
      g.usedRam = 10;
    }
  });
  assert.equal(g.launches[0].cycle, 1);
  assert.ok(g.logs.some(s => s.includes("investments paused")));
});

test("missing buyer scripts stop safely; launch failures wait without investing", async () => {
  const missing = game({ owned: false });
  missing.buyerFile = false;
  await run(missing);
  assert.ok(missing.logs.some(s => s.includes("Missing or invalid")));
  const failed = game({ owned: false });
  failed.launchFails = true;
  await run(failed, 2);
  assert.equal(failed.attempts.length, 0);
  assert.equal(failed.cycle, 2);
});

test("child crashes, missing replies, Singularity errors, and invalid protocol replies stop investments", async () => {
  for (const failure of ["crashChild", "silentChild", "noSingularity", "badPrice", "badReply", "negativeReply", "nanReply"]) {
    const g = game({ owned: false });
    if (failure === "badPrice") {
      g.tor = true;
      g.prices.set("BruteSSH.exe", -1);
    } else if (failure === "badReply") g.replyOverride = () => "invalid";
    else if (failure === "negativeReply") g.replyOverride = () => ({ nextCost: -1, message: "" });
    else if (failure === "nanReply") g.replyOverride = () => ({ nextCost: NaN, message: "" });
    else g[failure] = true;
    await run(g);
    assert.ok(g.spends.every(s => s.type === "tor" || s.type === "program"));
    assert.ok(g.logs.some(s => s.includes("Investments stopped")), failure);
    assert.equal(g.processes.size, 0);
    assert.ok([...g.ports.values()].every(q => q.length === 0));
  }
});

test("program buyer checks fresh cash after price lookup and exits when its parent stops", async () => {
  const g = game({ owned: false });
  g.tor = true;
  g.ns.exec(PROGRAM_BUYER, "home", { threads: 1 }, 1, g.settings.reserve);
  assert.equal(g.attempts.length, 0, "child does not spend without a command");
  g.processes.delete(1);
  await Promise.all(g.tasks);
  assert.equal(g.processes.size, 0);
  const changing = game({ owned: false });
  changing.tor = true;
  // Every surface shares these prices; lowering cash during lookup simulates another spender.
  changing.prices.get = () => { changing.money = 100000; return 500000; };
  await run(changing);
  assert.equal(changing.attempts.length, 0);
});

test("internal program buyer rejects direct runs and invalid commands", async () => {
  const invalid = game();
  await programs(invalid.ns);
  assert.ok(invalid.logs.some(s => s.includes("internal child")));
  const g = game({ owned: false });
  const pid = g.ns.exec(PROGRAM_BUYER, "home", { threads: 1 }, 1, g.settings.reserve);
  g.ns.writePort(pid, "invalid");
  await Promise.all(g.tasks);
  assert.match(g.ns.readPort(1).error, /Invalid program-buyer command/);
  assert.equal(g.attempts.length, 0);
});

test("cleanup stops only the owned child, preserving unrelated processes and ports", async () => {
  const g = game({ owned: false, money: 100000 });
  g.processes.set(99, { pid: 99, filename: "/manual.js", threads: 1 });
  g.ns.writePort(99, "keep");
  await run(g, 2);
  assert.deepEqual(g.killed, [g.launches[0].pid]);
  assert.ok(g.processes.has(99));
  assert.equal(g.ns.readPort(99), "keep");
  assert.equal(g.ns.readPort(1), "NULL PORT DATA");
  assert.equal(g.ns.readPort(g.launches[0].pid), "NULL PORT DATA");
});
