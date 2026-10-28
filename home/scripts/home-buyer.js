import { serveBuyer } from "./buyer.js";

/** @param {import("@ns").NS} ns */
export async function main(ns) {
  await serveBuyer(ns, kind => {
    if (kind !== "homeRam" && kind !== "homeCores") throw new Error("Invalid home upgrade");
    const cost = kind === "homeRam" ? ns.singularity.getUpgradeHomeRamCost() : ns.singularity.getUpgradeHomeCoresCost();
    return cost === Infinity ? null : { kind, cost };
  }, q => q.kind === "homeRam" ? ns.singularity.upgradeHomeRam() : ns.singularity.upgradeHomeCores());
}
