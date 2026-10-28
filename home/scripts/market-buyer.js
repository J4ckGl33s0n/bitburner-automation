import { serveBuyer } from "./buyer.js";

/** @param {import("@ns").NS} ns */
export async function main(ns) {
  await serveBuyer(ns, () => {
    const constants = ns.stock.getConstants();
    if (!ns.stock.hasTixApiAccess()) return { kind: "tix", cost: constants.TixApiCost };
    if (!ns.stock.has4SDataTixApi() && !ns.getResetInfo().bitNodeOptions.disable4SData) return {
      kind: "4s", cost: constants.MarketDataTixApi4SCost * marketMultiplier(ns),
    };
    return null;
  }, q => q.kind === "tix" ? ns.stock.purchaseTixApi() : ns.stock.purchase4SMarketDataTixApi());
}

/** @param {import("@ns").NS} ns */
export function marketMultiplier(ns) {
  const reset = ns.getResetInfo();
  if (reset.currentNode === 5 || (reset.ownedSF.get(5) ?? 0) > 0) return ns.getBitNodeMultipliers().FourSigmaMarketDataApiCost;
  // shortcut: v3.0.1's 4S multipliers without SF5; refresh from BitNode.tsx when upgrading the game.
  if (!Number.isInteger(reset.currentNode) || reset.currentNode < 1 || reset.currentNode > 15) throw new Error("Unknown BitNode market cost; buy 4S manually");
  if (reset.currentNode === 12) return 1.02 ** ((reset.ownedSF.get(12) ?? 0) + 1);
  return ({ 7: 2, 9: 4, 11: 4, 13: 10 })[reset.currentNode] ?? 1;
}
