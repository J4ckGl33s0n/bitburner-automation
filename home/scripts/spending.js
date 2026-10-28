export const PURCHASE_MANAGER = "/scripts/purchase-manager.js";
export const PROGRAM_BUYER = "/scripts/program-buyer.js";
export const STOCK_MANAGER = "/scripts/stock-manager.js";
export const HOME_BUYER = "/scripts/home-buyer.js";
export const MARKET_BUYER = "/scripts/market-buyer.js";
export const METRICS_FILE = "/data/hacking-metrics.txt";
const RESET_DEADLINE = "/data/spending-reset-deadline.txt";
export const PORT_PROGRAMS = [
  "BruteSSH.exe", "FTPCrack.exe", "relaySMTP.exe", "HTTPWorm.exe", "SQLInject.exe",
];

/** @param {import("@ns").NS} ns */
export function purchaseSettings(ns) {
  const options = ns.flags([
    ["reserve", 100000], ["budget", 0.1], ["payback", 120], ["nodes", 20], ["help", false],
    ["unlocks", "true"], ["home-upgrades", "true"], ["reset-in", 0],
    ["hash-reward", "Sell for Money"], ["hash-target", ""],
  ]);
  if (options.help) {
    ns.tprint(`run ${ns.getScriptName()} --reserve 100000 --budget 0.1 --payback 120 --nodes 20`);
    ns.tprint("reserve: dollars to keep; budget: fraction of unreserved cash per investment");
    ns.tprint("payback: maximum Hacknet upgrade repayment time in minutes (new nodes exempt); nodes: Hacknet node count limit");
    ns.tprint("--unlocks false / --home-upgrades false disable new purchases; --reset-in minutes bounds all production payback");
    ns.tprint('--hash-reward "Sell for Money|Increase Maximum Money|Reduce Minimum Security" [--hash-target hostname]');
    return null;
  }
  const settings = {
    reserve: Number(options.reserve), budget: Number(options.budget),
    payback: Number(options.payback), nodes: Number(options.nodes),
    unlocks: options.unlocks === true || options.unlocks === "true",
    homeUpgrades: options["home-upgrades"] === true || options["home-upgrades"] === "true",
    resetIn: Number(options["reset-in"]), hashReward: options["hash-reward"], hashTarget: options["hash-target"],
  };
  if (!Number.isFinite(settings.reserve) || settings.reserve < 0 ||
      !Number.isFinite(settings.budget) || settings.budget <= 0 || settings.budget > 1 ||
      !Number.isFinite(settings.payback) || settings.payback <= 0 ||
      !Number.isInteger(settings.nodes) || settings.nodes < 1 ||
      ![true, false, "true", "false"].includes(options.unlocks) ||
      ![true, false, "true", "false"].includes(options["home-upgrades"]) ||
      !Number.isFinite(settings.resetIn) || settings.resetIn < 0 ||
      !["Sell for Money", "Increase Maximum Money", "Reduce Minimum Security"].includes(settings.hashReward) ||
      typeof settings.hashTarget !== "string" ||
      (settings.hashReward !== "Sell for Money" && !settings.hashTarget) || options._?.length) {
    ns.tprint("Invalid settings. Run with --help for usage.");
    return null;
  }
  if (ns.getHostname() !== "home") {
    ns.tprint("Run this script on home.");
    return null;
  }
  const buyers = [PURCHASE_MANAGER.slice(1), "scripts/hacknet-manager.js"];
  const processes = ns.ps("home");
  if (processes.find(p => p.pid === ns.pid)?.threads !== 1 ||
      processes.some(p => p.pid !== ns.pid && buyers.includes(p.filename.replace(/^\/+/, "")))) {
    ns.tprint("Run only one purchase or Hacknet manager, with one thread.");
    return null;
  }
  return settings;
}

/** @param {import("@ns").NS} ns */
export async function resetDeadline(ns, settings) {
  if (!settings.resetIn) return;
  const reset = ns.getResetInfo().lastAugReset;
  let saved = ns.fileExists(RESET_DEADLINE, "home") ? JSON.parse(ns.read(RESET_DEADLINE)) : null;
  if (saved && (!Number.isFinite(saved.deadline) || !Number.isFinite(saved.minutes) || !Number.isFinite(saved.reset))) throw new Error("Invalid reset deadline file");
  if (!saved || saved.reset !== reset || saved.minutes !== settings.resetIn) {
    saved = { reset, minutes: settings.resetIn, deadline: Date.now() + settings.resetIn * 60000 };
    const text = JSON.stringify(saved);
    await ns.write(RESET_DEADLINE, text, "w");
    if (ns.read(RESET_DEADLINE) !== text) throw new Error("Cannot persist reset deadline");
  }
  settings.deadline = saved.deadline;
}

export function repaysBeforeReset(action, settings, now = Date.now()) {
  return settings.deadline === undefined || (Number.isFinite(action.gain) && action.gain > 0 &&
    action.cost / action.gain <= (settings.deadline - now) / 1000);
}

/** @param {import("@ns").NS} ns */
export function readMetrics(ns) {
  try {
    const m = JSON.parse(ns.read(METRICS_FILE));
    const process = ns.getRunningScript(m.pid);
    if (m.reset !== ns.getResetInfo().lastAugReset || m.host !== process?.server ||
        process?.filename.replace(/^\/+/, "") !== "scripts/hack-manager.js" || process.threads !== 1 ||
        !Number.isFinite(m.timestamp) || Date.now() - m.timestamp < 0 || Date.now() - m.timestamp > 60000 ||
        m.complete !== true || ![m.money, m.xp, m.ramSeconds, m.demand, m.homeSupportRam, m.seconds].every(n => Number.isFinite(n) && n >= 0) ||
        m.ramSeconds <= 0 || m.seconds <= 0 || m.money <= 0) return null;
    return m;
  } catch { return null; }
}

/** @param {import("@ns").NS} ns */
export function spendingBudget(ns, protectedCash, fraction) {
  return Math.max(0, ns.getServerMoneyAvailable("home") - protectedCash) * fraction;
}

/** @param {import("@ns").NS} ns */
export function canAfford(ns, cost, protectedCash, fraction = 1) {
  return Number.isFinite(cost) && cost > 0 &&
    cost <= spendingBudget(ns, protectedCash, fraction);
}

/** @param {import("@ns").NS} ns */
export function publishStockPolicy(ns, protectedCash, ready) {
  for (const process of ns.ps("home")) {
    if (process.filename.replace(/^\/+/, "") !== STOCK_MANAGER.slice(1)) continue;
    ns.clearPort(process.pid);
    ns.writePort(process.pid, { spendingPid: ns.pid, protectedCash, ready, timestamp: Date.now() });
  }
}
