import { canAfford, purchaseSettings, spendingBudget, publishStockPolicy, resetDeadline, repaysBeforeReset } from "./spending.js";

/** @param {import("@ns").NS} ns */
export async function main(ns) {
  const settings = purchaseSettings(ns);
  if (!settings) return;
  try { await resetDeadline(ns, settings); } catch (error) { ns.tprint(`Hacknet stopped: ${String(error)}`); return; }
  ns.disableLog("ALL");
  ns.tprint(`Hacknet manager started. Reserve: $${settings.reserve.toFixed(0)}; node limit: ${settings.nodes}.`);
  while (true) {
    publishStockPolicy(ns, settings.reserve, true);
    spendHashes(ns, settings);
    purchaseHacknet(ns, settings);
    await ns.sleep(2000);
  }
}

/**
 * Returns true after an attempted purchase, false when waiting.
 * @param {import("@ns").NS} ns
 */
export function purchaseHacknet(ns, settings, protectedCash = settings.reserve) {
  const budget = spendingBudget(ns, protectedCash, settings.budget);
  const best = hacknetCandidates(ns, settings).filter(action =>
    Number.isFinite(action.cost) && action.cost > 0 && action.cost <= budget &&
    (action.type === "cache" || action.starter || Number.isFinite(action.gain) && action.gain > 0) &&
    (action.type === "node" || action.type === "cache" || action.cost / action.gain <= settings.payback * 60) &&
    (action.type === "cache" ? settings.deadline === undefined || settings.deadline > Date.now() : repaysBeforeReset(action, settings)))
    .sort((a, b) => Number(b.type === "cache") - Number(a.type === "cache") || b.gain / b.cost - a.gain / a.cost || a.cost - b.cost)[0];
  if (!best || !canAfford(ns, best.cost, protectedCash, settings.budget)) {
    ns.print(`Waiting: no Hacknet purchase fits budget $${budget.toFixed(0)}, payback, and reset horizon.`);
    return false;
  }
  return buyHacknet(ns, best, settings, protectedCash);
}

/** @param {import("@ns").NS} ns */
export function hacknetCandidates(ns, settings) {
  const count = ns.hacknet.numNodes();
  const stats = Array.from({ length: count }, (_, i) => ns.hacknet.getNodeStats(i));
  const hashMode = count ? stats.some(node => node.cache !== undefined) : Number.isFinite(ns.hacknet.maxNumNodes());
  if (!hashMode) {
    if (!count) {
      let gain = 0;
      if (ns.fileExists("Formulas.exe", "home")) {
        try { gain = ns.formulas.hacknetNodes.moneyGainRate(1, 1, 1, ns.getHacknetMultipliers().production); }
        catch (error) { ns.print(`Starter production estimate unavailable: ${String(error)}`); }
      }
      return count < settings.nodes && count < ns.hacknet.maxNumNodes() ?
        [{ type: "node", label: "Buy starter node", cost: ns.hacknet.getPurchaseNodeCost(), gain, starter: Number.isFinite(gain) && gain === 0 }] : [];
    }
    return getCandidates(ns, stats, settings.nodes);
  }
  const candidates = hashCandidates(ns, stats, settings.nodes);
  const reward = selectedHashReward(ns, settings);
  const cost = ns.hacknet.hashCost(reward);
  const capacity = ns.hacknet.hashCapacity();
  const production = stats.reduce((sum, n) => sum + n.production, 0);
  if (stats.length && (cost > capacity || production * 2 > capacity)) {
    const cache = stats.map((_, index) => ({ type: "cache", index, label: `Server ${index}: +1 cache`,
      cost: ns.hacknet.getCacheUpgradeCost(index, 1), gain: 0 })).filter(c => Number.isFinite(c.cost) && c.cost > 0)
      .sort((a, b) => a.cost - b.cost)[0];
    return cache ? [cache] : [];
  }
  return candidates;
}

/** @param {import("@ns").NS} ns */
export function spendHashes(ns, settings) {
  const count = ns.hacknet.numNodes();
  if (!(count ? ns.hacknet.getNodeStats(0).cache !== undefined : Number.isFinite(ns.hacknet.maxNumNodes()))) return;
  const reward = selectedHashReward(ns, settings);
  const target = settings.hashTarget ?? "";
  for (let i = 0; i < 100; i++) {
    const cost = ns.hacknet.hashCost(reward);
    if (!Number.isFinite(cost) || cost <= 0 || ns.hacknet.numHashes() < cost) break;
    const before = ns.hacknet.numHashes();
    if (!ns.hacknet.spendHashes(reward, target) || ns.hacknet.numHashes() >= before) break;
  }
  if (reward !== "Sell for Money") {
    const rate = Array.from({ length: count }, (_, i) => ns.hacknet.getNodeStats(i).production).reduce((a, b) => a + b, 0);
    const cashCost = ns.hacknet.hashCost("Sell for Money");
    const overflow = ns.hacknet.numHashes() + rate * 2 - ns.hacknet.hashCapacity();
    const sales = Math.min(Math.floor(ns.hacknet.numHashes() / cashCost), Math.ceil(overflow / cashCost));
    if (Number.isSafeInteger(sales) && sales > 0) ns.hacknet.spendHashes("Sell for Money", "", sales);
  } else {
    const cost = ns.hacknet.hashCost("Sell for Money");
    const sales = Math.floor(ns.hacknet.numHashes() / cost);
    if (Number.isSafeInteger(sales) && sales > 0) ns.hacknet.spendHashes("Sell for Money", "", sales);
  }
}

function selectedHashReward(ns, settings) {
  const reward = settings.hashReward ?? "Sell for Money";
  if (reward === "Sell for Money") return reward;
  const target = settings.hashTarget;
  if (!ns.serverExists(target)) throw new Error(`Hash target unavailable: ${target}`);
  const server = ns.getServer(target);
  if (target === "home" || server.purchasedByPlayer || !server.hasAdminRights || !(server.moneyMax > 0)) throw new Error("Hash target must be a rooted money server");
  return reward === "Reduce Minimum Security" && server.minDifficulty <= 1 ? "Sell for Money" : reward;
}

function hashCandidates(ns, stats, maxNodes) {
  // shortcut: cash hash rewards pay $1m in v3.0.1; revisit if the reward changes.
  const value = 1000000 / ns.hacknet.hashCost("Sell for Money");
  let rate = null;
  if (ns.fileExists("Formulas.exe", "home")) {
    try {
      const mult = ns.getHacknetMultipliers().production;
      rate = (level, used, ram, cores) => ns.formulas.hacknetServers.hashGainRate(level, used, ram, cores, mult);
      const checks = [rate(1, 0, 1, 1), ...stats.flatMap(n => [rate(n.level, n.ramUsed ?? 0, n.ram, n.cores),
        rate(n.level + 1, n.ramUsed ?? 0, n.ram, n.cores), rate(n.level, n.ramUsed ?? 0, n.ram * 2, n.cores), rate(n.level, n.ramUsed ?? 0, n.ram, n.cores + 1)])];
      if (!checks.every(n => Number.isFinite(n) && n >= 0)) throw new Error("Invalid hash production");
    } catch (error) { ns.print(`Hash Formulas unavailable; using measured production: ${String(error)}`); rate = null; }
  }
  const candidates = [];
  for (let i = 0; i < stats.length; i++) {
    const n = stats[i];
    const used = n.ramUsed ?? 0;
    const current = rate ? rate(n.level, used, n.ram, n.cores) : n.production;
    const gains = rate ? [rate(n.level + 1, used, n.ram, n.cores) - current,
      rate(n.level, used, n.ram * 2, n.cores) - current, rate(n.level, used, n.ram, n.cores + 1) - current] :
      [n.production / n.level, used < n.ram ? n.production * (1.07 * (1 - used / (n.ram * 2)) / (1 - used / n.ram) - 1) : 0,
        n.production / (n.cores + 4)];
    for (const [j, type] of ["level", "ram", "core"].entries()) candidates.push({ type, index: i,
      label: `Server ${i}: +1 ${type}`, cost: [ns.hacknet.getLevelUpgradeCost(i, 1), ns.hacknet.getRamUpgradeCost(i, 1), ns.hacknet.getCoreUpgradeCost(i, 1)][j],
      hashGain: gains[j], gain: gains[j] * value });
  }
  if (stats.length < maxNodes && stats.length < ns.hacknet.maxNumNodes()) {
    const n = stats.find(n => n.production > 0 && (n.ramUsed ?? 0) < n.ram);
    const starter = rate ? rate(1, 0, 1, 1) : n ? n.production /
      (n.level * 1.07 ** Math.log2(n.ram) * ((n.cores + 4) / 5) * (1 - (n.ramUsed ?? 0) / n.ram)) : 0;
    candidates.push({ type: "node", label: "Buy hash server", cost: ns.hacknet.getPurchaseNodeCost(),
      hashGain: starter, gain: starter * value, starter: !stats.length && !starter });
  }
  return candidates;
}

/** @param {import("@ns").NS} ns */
export function buyHacknet(ns, action, settings, protectedCash = settings.reserve) {
  const cost = action.type === "node" ? ns.hacknet.getPurchaseNodeCost() :
    action.type === "level" ? ns.hacknet.getLevelUpgradeCost(action.index, 1) :
    action.type === "ram" ? ns.hacknet.getRamUpgradeCost(action.index, 1) :
    action.type === "core" ? ns.hacknet.getCoreUpgradeCost(action.index, 1) : ns.hacknet.getCacheUpgradeCost(action.index, 1);
  if (cost > action.cost || !canAfford(ns, cost, protectedCash, settings.budget) ||
      (action.type !== "cache" && !repaysBeforeReset({ ...action, cost }, settings))) return false;
  action = { ...action, cost };
  const success = buy(ns, action);
  ns.print(success ? `${action.label}: $${action.cost.toFixed(0)}, +$${action.gain.toFixed(2)}/sec${action.hashGain !== undefined ? ` (+${action.hashGain.toFixed(4)} hashes/sec)` : ""}, payback ${action.gain > 0 ? (action.cost / action.gain / 60).toFixed(1) : "unknown"} min.` : "Purchase failed; recalculating next pass.");
  return true;
}

function getCandidates(ns, stats, maxNodes) {
  let production = null;
  if (ns.fileExists("Formulas.exe", "home")) {
    try {
      const mult = ns.getHacknetMultipliers().production;
      const rate = (level, ram, cores) => ns.formulas.hacknetNodes.moneyGainRate(level, ram, cores, mult);
      const rates = stats.map(node => [rate(node.level, node.ram, node.cores),
        rate(node.level + 1, node.ram, node.cores), rate(node.level, node.ram * 2, node.cores),
        rate(node.level, node.ram, node.cores + 1)]);
      const starter = rate(1, 1, 1);
      if (![starter, ...rates.flat()].every(n => Number.isFinite(n) && n >= 0)) throw new Error("Invalid production estimate");
      production = { rates, starter };
    } catch (error) { ns.print(`Hacknet Formulas unavailable; using measured production: ${String(error)}`); }
  }
  const candidates = [];
  for (let i = 0; i < stats.length; i++) {
    const node = stats[i];
    // Extra income from one level, one RAM doubling, or one core.
    candidates.push(
      { type: "level", index: i, label: `Node ${i}: +1 level`,
        cost: ns.hacknet.getLevelUpgradeCost(i, 1), gain: production ? production.rates[i][1] - production.rates[i][0] : node.production / node.level },
      { type: "ram", index: i, label: `Node ${i}: RAM ${node.ram} -> ${node.ram * 2} GB`,
        cost: ns.hacknet.getRamUpgradeCost(i, 1), gain: production ? production.rates[i][2] - production.rates[i][0] : node.production * (1.035 ** node.ram - 1) },
      { type: "core", index: i, label: `Node ${i}: +1 core`,
        cost: ns.hacknet.getCoreUpgradeCost(i, 1), gain: production ? production.rates[i][3] - production.rates[i][0] : node.production / (node.cores + 5) },
    );
  }
  if (stats.length < maxNodes && stats.length < ns.hacknet.maxNumNodes()) {
    const node = stats[0];
    const baseProduction = production ? production.starter : node.production /
      (node.level * 1.035 ** (node.ram - 1) * ((node.cores + 5) / 6));
    candidates.push({ type: "node", label: "Buy new node", cost: ns.hacknet.getPurchaseNodeCost(), gain: baseProduction });
  }
  return candidates;
}

function buy(ns, action) {
  switch (action.type) {
    case "cache": return ns.hacknet.upgradeCache(action.index, 1);
    case "node": return ns.hacknet.purchaseNode() >= 0;
    case "level": return ns.hacknet.upgradeLevel(action.index, 1);
    case "ram": return ns.hacknet.upgradeRam(action.index, 1);
    case "core": return ns.hacknet.upgradeCore(action.index, 1);
    default: return false;
  }
}
