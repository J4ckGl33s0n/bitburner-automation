import { canAfford, purchaseSettings, spendingBudget } from "./spending.js";

/** @param {import("@ns").NS} ns */
export async function main(ns) {
  const settings = purchaseSettings(ns);
  if (!settings) return;
  ns.disableLog("ALL");
  ns.tprint(`Hacknet manager started. Reserve: $${settings.reserve.toFixed(0)}; node limit: ${settings.nodes}.`);
  while (true) {
    if (purchaseHacknet(ns, settings) === null) return;
    await ns.sleep(2000);
  }
}

/**
 * Returns true after an attempted purchase, false when waiting, or null for hash servers.
 * @param {import("@ns").NS} ns
 */
export function purchaseHacknet(ns, settings, protectedCash = settings.reserve) {
  const stats = [];
  const count = ns.hacknet.numNodes();
  for (let i = 0; i < count; i++) stats.push(ns.hacknet.getNodeStats(i));
  if (stats.some(node => node.cache !== undefined)) {
    ns.tprint("This version manages money-producing Hacknet Nodes. Hash-producing Hacknet Servers need a different manager.");
    return null;
  }
  const budget = spendingBudget(ns, protectedCash, settings.budget);
  if (count === 0) {
    // Buy a starter node to measure production, exempt from the payback filter.
    const cost = ns.hacknet.getPurchaseNodeCost();
    if (!canAfford(ns, cost, protectedCash, settings.budget)) {
      ns.print(`Waiting for starter node. Cost: $${cost.toFixed(0)}; budget: $${budget.toFixed(0)}.`);
      return false;
    }
    const index = ns.hacknet.purchaseNode();
    ns.print(index >= 0 ? `Bought starter node ${index} for $${cost.toFixed(0)}.` : "Starter purchase failed; retrying later.");
    return true;
  }
  const best = getCandidates(ns, stats, settings.nodes)
    .filter(action => Number.isFinite(action.cost) && action.cost > 0 &&
      Number.isFinite(action.gain) && action.gain > 0 && action.cost <= budget &&
      action.cost / action.gain <= settings.payback * 60)
    .sort((a, b) => b.gain / b.cost - a.gain / a.cost)[0];
  if (!best || !canAfford(ns, best.cost, protectedCash, settings.budget)) {
    ns.print(`Waiting: no purchase fits budget $${budget.toFixed(0)} and payback limit ${settings.payback} min.`);
    return false;
  }
  if (buy(ns, best)) {
    ns.print(`${best.label}: $${best.cost.toFixed(0)}, +$${best.gain.toFixed(2)}/sec, payback ${(best.cost / best.gain / 60).toFixed(1)} min.`);
  } else {
    ns.print("Purchase failed; recalculating next pass.");
  }
  return true;
}

function getCandidates(ns, stats, maxNodes) {
  const candidates = [];
  for (let i = 0; i < stats.length; i++) {
    const node = stats[i];
    // Extra income from one level, one RAM doubling, or one core.
    candidates.push(
      { type: "level", index: i, label: `Node ${i}: +1 level`,
        cost: ns.hacknet.getLevelUpgradeCost(i, 1), gain: node.production / node.level },
      { type: "ram", index: i, label: `Node ${i}: RAM ${node.ram} -> ${node.ram * 2} GB`,
        cost: ns.hacknet.getRamUpgradeCost(i, 1), gain: node.production * (1.035 ** node.ram - 1) },
      { type: "core", index: i, label: `Node ${i}: +1 core`,
        cost: ns.hacknet.getCoreUpgradeCost(i, 1), gain: node.production / (node.cores + 5) },
    );
  }
  if (stats.length < maxNodes && stats.length < ns.hacknet.maxNumNodes()) {
    const node = stats[0];
    const baseProduction = node.production /
      (node.level * 1.035 ** (node.ram - 1) * ((node.cores + 5) / 6));
    candidates.push({ type: "node", label: "Buy new node", cost: ns.hacknet.getPurchaseNodeCost(), gain: baseProduction });
  }
  return candidates;
}

function buy(ns, action) {
  switch (action.type) {
    case "node": return ns.hacknet.purchaseNode() >= 0;
    case "level": return ns.hacknet.upgradeLevel(action.index, 1);
    case "ram": return ns.hacknet.upgradeRam(action.index, 1);
    case "core": return ns.hacknet.upgradeCore(action.index, 1);
    default: return false;
  }
}
