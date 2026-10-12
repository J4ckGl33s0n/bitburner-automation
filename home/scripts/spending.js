export const PURCHASE_MANAGER = "/scripts/purchase-manager.js";
export const PROGRAM_BUYER = "/scripts/program-buyer.js";
export const PORT_PROGRAMS = [
  "BruteSSH.exe", "FTPCrack.exe", "relaySMTP.exe", "HTTPWorm.exe", "SQLInject.exe",
];

/** @param {import("@ns").NS} ns */
export function purchaseSettings(ns) {
  const options = ns.flags([
    ["reserve", 100000], ["budget", 0.1], ["payback", 120], ["nodes", 20], ["help", false],
  ]);
  if (options.help) {
    ns.tprint(`run ${ns.getScriptName()} --reserve 100000 --budget 0.1 --payback 120 --nodes 20`);
    ns.tprint("reserve: dollars to keep; budget: fraction of unreserved cash per investment");
    ns.tprint("payback: maximum Hacknet repayment time in minutes; nodes: Hacknet node count limit");
    return null;
  }
  const settings = {
    reserve: Number(options.reserve), budget: Number(options.budget),
    payback: Number(options.payback), nodes: Number(options.nodes),
  };
  if (!Number.isFinite(settings.reserve) || settings.reserve < 0 ||
      !Number.isFinite(settings.budget) || settings.budget <= 0 || settings.budget > 1 ||
      !Number.isFinite(settings.payback) || settings.payback <= 0 ||
      !Number.isInteger(settings.nodes) || settings.nodes < 1) {
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
export function spendingBudget(ns, protectedCash, fraction) {
  return Math.max(0, ns.getServerMoneyAvailable("home") - protectedCash) * fraction;
}

/** @param {import("@ns").NS} ns */
export function canAfford(ns, cost, protectedCash, fraction = 1) {
  return Number.isFinite(cost) && cost > 0 &&
    cost <= spendingBudget(ns, protectedCash, fraction);
}
