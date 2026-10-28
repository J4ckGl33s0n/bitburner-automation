import { PORT_PROGRAMS } from "./spending.js";
import { serveBuyer } from "./buyer.js";

/** @param {import("@ns").NS} ns */
export async function main(ns) {
  const unlocks = ns.args[2] === true;
  await serveBuyer(ns, () => nextPurchase(ns, unlocks), q =>
    q.kind === "tor" ? ns.singularity.purchaseTor() : ns.singularity.purchaseProgram(q.program));
}

function nextPurchase(ns, unlocks) {
  const missing = [...PORT_PROGRAMS, ...(unlocks ? ["DarkscapeNavigator.exe", "Formulas.exe"] : [])].filter(file => !ns.fileExists(file, "home"));
  if (!missing.length) return null;
  // shortcut: TOR has no price API; update this price if the game changes it.
  if (!ns.hasTorRouter()) return { kind: "tor", cost: 200000 };
  for (const program of missing) {
    const cost = ns.singularity.getDarkwebProgramCost(program);
    if (cost === -1) continue;
    if (!Number.isFinite(cost) || cost <= 0) throw new Error(`Invalid price for ${program}: ${cost}`);
    return { kind: "program", program, cost };
  }
  return null;
}
