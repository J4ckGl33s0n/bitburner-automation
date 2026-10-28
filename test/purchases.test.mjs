import assert from "node:assert/strict";
import test from "node:test";
import { setImmediate as yieldTurn } from "node:timers/promises";
import { main as manage, purchaseServer, selectInvestment, serverCandidates, homeRamShortage } from "../home/scripts/purchase-manager.js";
import { main as hacknet, purchaseHacknet, hacknetCandidates, spendHashes } from "../home/scripts/hacknet-manager.js";
import { main as homeBuyer } from "../home/scripts/home-buyer.js";
import { main as marketBuyer, marketMultiplier } from "../home/scripts/market-buyer.js";
import { main as programs } from "../home/scripts/program-buyer.js";
import { canAfford, PORT_PROGRAMS, PROGRAM_BUYER, PURCHASE_MANAGER, STOCK_MANAGER, HOME_BUYER, MARKET_BUYER, purchaseSettings, resetDeadline, repaysBeforeReset, readMetrics, METRICS_FILE } from "../home/scripts/spending.js";

const STOP = Symbol("stop test loop");

test("savings status includes the reserve and refreshes on price changes or after 30 seconds", async () => {
  const g = game({ settings: { unlocks: true }, money: 300000 });
  g.programs.add("DarkscapeNavigator.exe");
  g.prices.set("Formulas.exe", 1000000);
  const originalNow = Date.now;
  let now = 1000000;
  Date.now = () => now;
  try {
    await run(g, 4, cycle => {
      if (cycle === 1) { g.money = 350000; now += 10000; }
      if (cycle === 2) { g.money = 400000; now += 20000; }
      if (cycle === 3) { g.prices.set("Formulas.exe", 2000000); now += 1000; }
    });
  } finally { Date.now = originalNow; }
  assert.deepEqual(g.logs.filter(s => s.startsWith("Saving for")), [
    "Saving for Formulas.exe: $1M target, $800K remaining (reserve $100K).",
    "Saving for Formulas.exe: $1M target, $700K remaining (reserve $100K).",
    "Saving for Formulas.exe: $2M target, $1.7M remaining (reserve $100K).",
  ]);
  assert.equal(g.spends.length, 0);
});

test("savings status names TOR and API goals and reports when no goal remains", async () => {
  const tor = game({ owned: false, money: 50000 });
  await run(tor);
  assert.ok(tor.logs.includes("Saving for TOR: $200K target, $250K remaining (reserve $100K)."));
  const market = game({ settings: { unlocks: true }, money: 100000000000 });
  await run(market, 4);
  const status = market.logs.filter(s => s.startsWith("Saving for") || s.startsWith("No active savings goal"));
  assert.equal(status.length, 4);
  assert.ok(status[0].startsWith("Saving for Formulas.exe:"));
  assert.ok(status[1].startsWith("Saving for TIX API:"));
  assert.ok(status[2].startsWith("Saving for 4S API:"));
  assert.equal(status[3], "No active savings goal; reserve $100K.");
});

test("new purchases default on, validate options, and preserve a reset deadline across reloads", async () => {
  const g = game();
  delete g.settings.unlocks; delete g.settings["home-upgrades"];
  assert.equal(purchaseSettings(g.ns).unlocks, true);
  assert.equal(purchaseSettings(g.ns).homeUpgrades, true);
  for (const settings of [{ "reset-in": -1 }, { unlocks: "maybe" }, { "home-upgrades": "maybe" },
    { "hash-reward": "unknown" }, { "hash-reward": "Increase Maximum Money" }]) {
    const h = game({ settings }); assert.equal(purchaseSettings(h.ns), null);
  }
  const settings = { resetIn: 10 };
  await resetDeadline(g.ns, settings);
  const deadline = settings.deadline;
  const reloaded = { resetIn: 10 };
  await resetDeadline(g.ns, reloaded);
  assert.equal(reloaded.deadline, deadline);
  assert.equal(repaysBeforeReset({ cost: 100, gain: 10 }, { deadline: 11000 }, 1000), true);
  assert.equal(repaysBeforeReset({ cost: 101, gain: 10 }, { deadline: 11000 }, 1000), false);
  assert.equal(repaysBeforeReset({ cost: 1, gain: 0 }, settings), false);
  g.data.set("/data/spending-reset-deadline.txt", "malformed");
  await assert.rejects(resetDeadline(g.ns, { resetIn: 10 }));
});

test("program and market goals are enabled in order and stocks protect the entire next cost", async () => {
  const g = game({ settings: { unlocks: true }, money: 100000000000 });
  g.processes.set(99, { pid: 99, filename: STOCK_MANAGER, threads: 1 });
  await run(g, 4, cycle => {
    const q = g.ports.get(99)[0];
    const costs = [5000000000, 1000, 10000, 0];
    assert.equal(q.protectedCash, g.settings.reserve + costs[cycle - 1]);
  });
  assert.deepEqual(g.spends.filter(s => ["program", "tix", "4s"].includes(s.type)).map(s => s.target), ["DarkscapeNavigator.exe", "Formulas.exe", "TIX", "4S"]);
});

test("market unlocks need no Singularity, use the BitNode price, and never buy UI access", async () => {
  const g = game({ settings: { unlocks: true }, money: 1000000 });
  g.sourceFiles.clear(); g.sourceFiles.set(5, 1); g.noSingularity = true; g.marketMult = 3;
  await run(g, 2);
  assert.deepEqual(g.spends.filter(s => ["tix", "4s"].includes(s.type)).map(s => s.cost), [1000, 30000]);
  assert.ok(g.launches.length >= 1);
});

test("market prices work without SF5, including repeated BN12 and disabled 4S", async () => {
  const g = game({ settings: { unlocks: true } });
  g.ns.getBitNodeMultipliers = () => { throw new Error("SF5 required"); };
  for (const [node, multiplier] of [[1, 1], [7, 2], [9, 4], [11, 4], [13, 10], [15, 1]]) {
    g.currentNode = node; assert.equal(marketMultiplier(g.ns), multiplier);
  }
  g.currentNode = 12; g.sourceFiles.set(12, 4);
  assert.equal(marketMultiplier(g.ns), 1.02 ** 5);
  const h = game({ settings: { unlocks: true } });
  h.sourceFiles.clear(); h.tix = true;
  const info = h.ns.getResetInfo;
  h.ns.getResetInfo = () => ({ ...info(), bitNodeOptions: { disable4SData: true } });
  await run(h);
  assert.ok(!h.spends.some(s => s.type === "4s"));
});

test("quotes never authorize a changed or newly unaffordable program", async () => {
  const g = game({ owned: false });
  const pid = g.ns.exec(PROGRAM_BUYER, "home", { threads: 1 }, 1, 100000);
  g.ns.writePort(pid, { command: "quote", id: 1 });
  while (!g.ports.get(1)?.length) await yieldTurn();
  const quote = g.ns.readPort(1).quote;
  assert.equal(g.attempts.length, 0);
  g.money = 100000;
  g.ns.writePort(pid, { command: "buy", id: 2, expected: quote, protectedCash: 100000, fraction: 1 });
  while (!g.ports.get(1)?.length) await yieldTurn();
  assert.equal(g.attempts.length, 0);
  g.processes.delete(1); await Promise.all(g.tasks);
});

test("manager RAM shortages take priority and do not spend another goal's savings", async () => {
  const g = game({ settings: { "home-upgrades": true } });
  g.data.set("/data/startup-retry-state.txt", JSON.stringify({ reset: 1, pending: [{ id: "contracts", suspended: false }] }));
  g.programs.add("/scripts/contract-manager.js"); g.programs.add("/scripts/contracts.js");
  g.homeRam = 64; g.usedRam = 48;
  g.ns.getScriptRam = file => file === "/scripts/contract-manager.js" ? 24 : 12;
  assert.ok(homeRamShortage(g.ns) > 0);
  await run(g);
  assert.equal(g.spends[0].type, "homeRam");
  const h = game({ settings: { "home-upgrades": true } });
  h.homeRam = 16; h.usedRam = 10;
  h.data.set("/data/startup-retry-state.txt", JSON.stringify({ reset: 1, pending: [{ id: "contracts" }] }));
  h.programs.add("/scripts/contract-manager.js"); h.programs.add("/scripts/contracts.js");
  await run(h);
  assert.equal(h.attempts.length, 0);
  assert.ok(h.logs.some(s => s.includes("manually")));
});

test("fresh owned telemetry ranks an existing-server upgrade ahead of filling slots", () => {
  const g = game(); g.servers.set("existing", 16); g.serverCost = 1000; g.upgradeCost = 100;
  const choices = serverCandidates(g.ns).map(c => ({ ...c, gain: Math.min(c.ramGain, 8) * 10 }));
  const best = selectInvestment(g.ns, [...choices, { type: "level", cost: 100, gain: 1 }], g.settings, g.settings.reserve);
  assert.equal(best.host, "existing");
  assert.equal(selectInvestment(g.ns, choices, { ...g.settings, deadline: Date.now() - 1 }, g.settings.reserve), undefined);
  const m = { pid: 99, host: "remote", reset: 1, timestamp: Date.now(), complete: true, money: 100, xp: 10, ramSeconds: 100, demand: 8, homeSupportRam: 2, seconds: 30 };
  g.processes.set(99, { pid: 99, filename: "/scripts/hack-manager.js", server: "remote", threads: 1 });
  g.data.set(METRICS_FILE, JSON.stringify(m)); assert.deepEqual(readMetrics(g.ns), m);
  for (const changed of [{ timestamp: Date.now() - 61000 }, { reset: 2 }, { pid: 1 }, { complete: false }, { demand: NaN }]) {
    g.data.set(METRICS_FILE, JSON.stringify({ ...m, ...changed })); assert.equal(readMetrics(g.ns), null);
  }
});

test("coordinator consumes telemetry for fleet upgrades and measured home-core investments", async () => {
  for (const cores of [false, true]) {
    const g = game({ settings: { "home-upgrades": cores } });
    g.servers.set("existing", 16); g.serverCost = 1000; g.upgradeCost = 100;
    g.homeRamCost = 1e12; g.homeCoreCost = 1;
    g.processes.set(99, { pid: 99, filename: "/scripts/hack-manager.js", server: "remote", threads: 1 });
    g.data.set(METRICS_FILE, JSON.stringify({ pid: 99, host: "remote", reset: 1, timestamp: Date.now(),
      complete: true, money: 1000, xp: 10, ramSeconds: 100, demand: 8, homeSupportRam: 50, seconds: 30 }));
    await run(g);
    assert.equal(g.spends[0].type, cores ? "homeCores" : "upgrade");
    assert.ok(g.spends.every(s => s.before - s.cost >= g.settings.reserve));
  }
});

test("reset horizons refuse an unmeasured starter but accept a profitable Formula estimate", () => {
  const g = game(); g.settings.deadline = Date.now() + 60000;
  assert.equal(purchaseHacknet(g.ns, g.settings), false);
  g.programs.add("Formulas.exe");
  g.ns.getHacknetMultipliers = () => ({ production: 2 });
  g.ns.formulas = { hacknetNodes: { moneyGainRate: (level, ram, cores, mult) => 10 * mult } };
  assert.equal(purchaseHacknet(g.ns, g.settings), true);
});

test("hash Formula estimates and storage shortages never buy unusable extra production", () => {
  const g = game(); g.hashMode = true;
  g.nodes.push({ level: 2, ram: 2, cores: 1, ramUsed: 0, production: 4, cache: 1 });
  g.programs.add("Formulas.exe"); g.ns.getHacknetMultipliers = () => ({ production: 3 });
  g.ns.formulas = { hacknetServers: { hashGainRate: (level, used, ram, cores, mult) => level * ram * cores * mult } };
  const choices = hacknetCandidates(g.ns, g.settings);
  assert.equal(choices.find(c => c.type === "level").hashGain, 6);
  g.capacity = 4; g.cacheCost = 1000; g.levelCost = 1; g.money = g.settings.reserve + 100;
  assert.equal(purchaseHacknet(g.ns, g.settings), false);
  assert.equal(g.attempts.length, 0);
  g.hashes = 4; g.failHash = true;
  spendHashes(g.ns, g.settings); assert.equal(g.hashes, 4);
});

test("hash mode is detected before the first purchase and gains use hashes with cash opportunity value", () => {
  const g = game(); g.hashMode = true;
  assert.equal(purchaseHacknet(g.ns, g.settings), true);
  assert.equal(g.nodes[0].cache, 1);
  g.levelCost = 100; g.nodeRamCost = 100; g.coreCost = 100;
  const choices = hacknetCandidates(g.ns, g.settings);
  assert.ok(Math.abs(choices.find(c => c.type === "ram").hashGain - 0.07) < 1e-12);
  assert.equal(choices.find(c => c.type === "core").gain, 50000);
  g.settings.deadline = Date.now();
  assert.equal(purchaseHacknet(g.ns, g.settings), false);
});

test("hash spending handles live costs, cash conversion, targeted saving, overflow and cache need", () => {
  const g = game(); g.hashMode = true; g.names.add("target");
  g.nodes.push({ level: 1, ram: 1, cores: 1, ramUsed: 0, production: 4, cache: 1 });
  g.hashes = 12;
  spendHashes(g.ns, g.settings);
  assert.equal(g.hashes, 0);
  assert.equal(g.hashSpends.reduce((n, s) => n + s.count, 0), 3);
  const settings = { ...g.settings, hashReward: "Increase Maximum Money", hashTarget: "target" };
  g.hashes = 15; spendHashes(g.ns, settings); assert.equal(g.hashes, 15);
  g.hashes = 16; spendHashes(g.ns, settings); assert.equal(g.hashes, 0);
  g.hashCosts[settings.hashReward] = 100; g.hashes = 63;
  spendHashes(g.ns, settings); assert.ok(g.hashes + 8 <= 64);
  g.cacheCost = 100;
  assert.ok(hacknetCandidates(g.ns, settings).some(c => c.type === "cache"));
  g.hashCosts[settings.hashReward] = 16;
  assert.ok(!hacknetCandidates(g.ns, settings).some(c => c.type === "cache"));
  assert.throws(() => spendHashes(g.ns, { ...settings, hashTarget: "missing" }), /target/);
});

test("spending managers publish paused checks and live protected cash to stocks", async () => {
  for (const [script, entry] of [[PURCHASE_MANAGER, manage], ["/scripts/hacknet-manager.js", hacknet]]) {
    const g = game({ script, owned: false, money: 4000000, settings: { reserve: 2000000 } });
    g.processes.set(99, { pid: 99, filename: STOCK_MANAGER, threads: 1 });
    const policies = [];
    const write = g.ns.writePort;
    g.ns.writePort = (pid, data) => { if (pid === 99) policies.push(data); return write(pid, data); };
    await run(g, 1, () => {
      const policy = g.ports.get(99)[0];
      assert.equal(policy.ready, true);
      assert.equal(policy.spendingPid, 1);
      assert.equal(policy.protectedCash, g.settings.reserve + (entry === manage ? g.nextCost() : 0));
    }, entry);
    assert.ok(policies.some(p => p.ready));
    assert.equal(policies.some(p => p.ready === false), entry === manage);
  }
});

test("program-buyer RAM waiting leaves the stock policy paused", async () => {
  const g = game({ owned: false });
  g.homeRam = 10;
  g.processes.set(99, { pid: 99, filename: STOCK_MANAGER, threads: 1 });
  await run(g, 1, () => assert.equal(g.ports.get(99)[0].ready, false));
  assert.equal(g.spends.length, 0);
});

test("a buyer starting during the master yield preserves the pending hacking handoff", async () => {
  const g = game({ owned: false });
  g.homeRam = 32; g.usedRam = 10;
  g.processes.set(88, { pid: 88, filename: "/scripts/start.js", threads: 1 });
  g.ns.getScriptRam = file => file === "/scripts/hack.js" ? 20 : file === "/scripts/start.js" ? 8 : 12;
  await run(g);
  assert.equal(g.launches.length, 0);
  assert.equal(g.attempts.length, 0);
  assert.ok(g.logs.some(s => s.includes("28.00 GB")));
});

test("Hacknet Formula gains use current multipliers and switch back on access loss or invalid results", () => {
  const g = game({ settings: { nodes: 1 } });
  g.nodes.push({ level: 1, ram: 1, cores: 1, production: 1, ...(g.hashMode ? { cache: 1, ramUsed: 0 } : {}) });
  g.levelCost = 100; g.coreCost = 100; g.nodeRamCost = 100;
  let calls = 0;
  let invalid = false;
  g.ns.getHacknetMultipliers = () => ({ production: 3 });
  g.ns.formulas = { hacknetNodes: { moneyGainRate: (level, ram, cores, mult) => {
    calls++; assert.equal(mult, 3);
    if (invalid) return NaN;
    return (level * 10 + ram + cores * 1000) * mult;
  } } };
  purchaseHacknet(g.ns, g.settings);
  assert.equal(g.attempts.at(-1).type, "level"); assert.equal(calls, 0);
  g.programs.add("Formulas.exe");
  purchaseHacknet(g.ns, g.settings);
  assert.equal(g.attempts.at(-1).type, "core"); assert.equal(calls, 5);
  g.programs.delete("Formulas.exe");
  purchaseHacknet(g.ns, g.settings);
  assert.equal(g.attempts.at(-1).type, "level"); assert.equal(calls, 5);
  g.programs.add("Formulas.exe"); invalid = true;
  purchaseHacknet(g.ns, g.settings);
  assert.equal(g.attempts.at(-1).type, "level");
  assert.ok(g.logs.some(l => l.includes("using measured production")));
});

test("Formula new-node estimates retain payback exemption and live affordability checks", () => {
  const g = game({ settings: { payback: 0.001 } });
  g.nodes.push({ level: 50, ram: 4, cores: 3, production: 999 });
  g.programs.add("Formulas.exe");
  g.ns.getHacknetMultipliers = () => ({ production: 2 });
  const calls = [];
  g.ns.formulas = { hacknetNodes: { moneyGainRate: (...args) => {
    calls.push(args); return args[0] * args[1] * args[2] * args[3];
  } } };
  purchaseHacknet(g.ns, g.settings);
  assert.ok(calls.some(args => args.join() === "1,1,1,2"));
  assert.equal(g.spends.at(-1).type, "node");
  g.ns.hacknet.getPurchaseNodeCost = () => { g.money = g.settings.reserve; return 100; };
  const count = g.spends.length;
  purchaseHacknet(g.ns, g.settings);
  assert.equal(g.spends.length, count);
});

function game({ owned = true, money = 1000000, settings = {}, script = PURCHASE_MANAGER } = {}) {
  const g = {
    data: new Map(), tix: false, fourS: false, homeCores: 1, homeRamCost: 1000, homeCoreCost: 2000, hashes: 0, capacity: 64, hashCosts: { "Sell for Money": 4, "Increase Maximum Money": 16, "Reduce Minimum Security": 16 }, hashSpends: [],
    money, settings: { reserve: 100000, budget: 0.1, payback: 120, nodes: 20, unlocks: false, "home-upgrades": false, ...settings },
    programs: new Set(owned ? PORT_PROGRAMS : []), tor: owned,
    prices: new Map(PORT_PROGRAMS.map((name, i) => [name, [500000, 1500000, 5000000, 30000000, 250000000][i]])),
    servers: new Map(), names: new Set(), nodes: [], ports: new Map(), exits: new Map(),
    processes: new Map([[1, { pid: 1, filename: script, threads: 1, args: [] }]]),
    logs: [], spends: [], attempts: [], launches: [], killed: [], tasks: [], fail: new Set(),
    cycle: 0, homeRam: 256, usedRam: 10, buyerRam: 12, serverLimit: 25, ramLimit: 1024,
    serverCost: 100, upgradeCost: 100, nodeCost: 100, levelCost: Infinity, coreCost: Infinity, nodeRamCost: Infinity,
    hostname: "home", buyerFile: true, currentNode: 1, sourceFiles: new Map([[4, 3]]),
  };
  g.prices.set("DarkscapeNavigator.exe", 500000); g.prices.set("Formulas.exe", 5000000000);
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
      getResetInfo: () => ({ currentNode: g.currentNode, ownedSF: new Map(g.sourceFiles), lastAugReset: 1, bitNodeOptions: {} }),
      ps: () => [...g.processes.values()], isRunning: id => g.processes.has(id),
      scan: () => [],
      disableLog: () => {}, print: message => g.logs.push(message), tprint: message => g.logs.push(message),
      atExit: fn => g.exits.set(pid, fn),
      fileExists: file => ["/scripts/buyer.js", HOME_BUYER, MARKET_BUYER].includes(file) ? true : file === PROGRAM_BUYER ? g.buyerFile : g.programs.has(file) || g.data.has(file),
      read: file => g.data?.get(file) ?? "",
      write: (file, data) => { (g.data ??= new Map()).set(file, data); },
      getServerMoneyAvailable: () => g.money,
      serverExists: host => g.names.has(host) || g.servers.has(host),
      getScriptRam: () => g.buyerRam,
      getServerMaxRam: host => host === "home" ? g.homeRam : g.servers.get(host),
      getServerUsedRam: () => g.usedRam + [...g.processes.values()].filter(p => [PROGRAM_BUYER, HOME_BUYER, MARKET_BUYER].includes(p.filename)).length * g.buyerRam,
      hasTorRouter: () => g.tor,
      clearPort: port => { queue(port).length = 0; }, readPort: read,
      writePort: (port, value) => queue(port).push(port === 1 && g.replyOverride ? g.replyOverride(value) : value),
      getPortHandle: port => ({ empty: () => queue(port).length === 0, read: () => read(port) }),
      kill: id => { g.killed.push(id); g.exit(id); return true; },
      exec: (file, host, options, ...childArgs) => {
        assert.ok([PROGRAM_BUYER, HOME_BUYER, MARKET_BUYER].includes(file));
        assert.equal(host, "home");
        assert.equal(options.threads, 1);
        if (g.launchFails) return 0;
        const id = nextPid++;
        g.launches.push({ pid: id, cycle: g.cycle });
        g.processes.set(id, { pid: id, filename: file, threads: 1, args: childArgs });
        if (g.crashChild) g.processes.delete(id);
        else if (!g.silentChild) {
          const task = ({ [PROGRAM_BUYER]: programs, [HOME_BUYER]: homeBuyer, [MARKET_BUYER]: marketBuyer })[file](surface(id, file, childArgs)).catch(error => {
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
      getServer: host => host === "home" ? { cpuCores: g.homeCores } : { moneyMax: 1000000, minDifficulty: g.minDifficulty ?? 2, hasAdminRights: true, purchasedByPlayer: false },
      getRunningScript: pid => g.processes.get(pid) ?? null,
      getBitNodeMultipliers: () => ({ FourSigmaMarketDataApiCost: g.marketMult ?? 1 }),
      stock: {
        hasTixApiAccess: () => g.tix, has4SDataTixApi: () => g.fourS,
        getConstants: () => ({ TixApiCost: 1000, MarketDataTixApi4SCost: 10000 }),
        purchaseTixApi: () => { if (!spend("tix", "TIX", 1000)) return false; g.tix = true; return true; },
        purchase4SMarketDataTixApi: () => { assert.ok(g.tix); if (!spend("4s", "4S", 10000 * (g.marketMult ?? 1))) return false; g.fourS = true; return true; },
      },
      singularity: {
        getUpgradeHomeRamCost: () => g.homeRamCost, getUpgradeHomeCoresCost: () => g.homeCoreCost,
        upgradeHomeRam: () => { if (!spend("homeRam", "home", g.homeRamCost)) return false; g.homeRam *= 2; return true; },
        upgradeHomeCores: () => { if (!spend("homeCores", "home", g.homeCoreCost)) return false; g.homeCores++; return true; },
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
        numNodes: () => g.nodes.length, getNodeStats: i => ({ ...g.nodes[i] }), maxNumNodes: () => g.hashMode ? 20 : Infinity,
        hashCapacity: () => g.capacity, numHashes: () => g.hashes, hashCost: reward => g.hashCosts[reward],
        getCacheUpgradeCost: () => g.cacheCost ?? Infinity,
        upgradeCache: i => { if (!spend("cache", i, g.cacheCost)) return false; g.capacity *= 2; return true; },
        spendHashes: (reward, target, count = 1) => { const cost = g.hashCosts[reward] * count; if (g.hashes < cost || g.failHash) return false; g.hashes -= cost; g.hashSpends.push({ reward, target, count }); if (reward === "Sell for Money") g.money += 1000000 * count; else g.hashCosts[reward] += 4; return true; },
        getPurchaseNodeCost: () => g.nodeCost,
        getLevelUpgradeCost: () => g.levelCost, getRamUpgradeCost: () => g.nodeRamCost,
        getCoreUpgradeCost: () => g.coreCost,
        purchaseNode: () => {
          if (!spend("node", g.nodes.length, g.nodeCost)) return -1;
          g.nodes.push({ level: 1, ram: 1, cores: 1, production: 1, ...(g.hashMode ? { cache: 1, ramUsed: 0 } : {}) });
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
    assert.ok(!g.logs.some(s => s.includes("Singularity access required")));
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

test("purchase children request XP RAM before giving up on a full home server", async () => {
  const g = game({ owned: false, money: 700000 });
  g.usedRam = 252;
  g.processes.set(99, { pid: 99, filename: "/scripts/hack-manager.js", threads: 1, args: [] });
  const requests = [];
  const write = g.ns.writePort;
  g.ns.writePort = (pid, value) => {
    if (pid === 99) { requests.push(value); g.usedRam = 200; return 1; }
    return write(pid, value);
  };
  await run(g);
  assert.deepEqual(requests, [{ type: "home-ram", pid: 1, ram: 16 }]);
  assert.ok(g.spends.some(s => s.type === "tor"));
  assert.ok(g.processes.has(99));
  assert.ok(!g.logs.some(l => l.includes("investments paused")));
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
      g.prices.set("BruteSSH.exe", NaN);
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
