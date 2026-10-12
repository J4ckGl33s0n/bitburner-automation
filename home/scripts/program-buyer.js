import { PORT_PROGRAMS, PROGRAM_BUYER, PURCHASE_MANAGER, canAfford } from "./spending.js";

/** @param {import("@ns").NS} ns */
export async function main(ns) {
  const parentPid = Number(ns.args[0]);
  const reserve = Number(ns.args[1]);
  const processes = ns.ps("home");
  const parent = processes.find(p => p.pid === parentPid);
  if (ns.getHostname() !== "home" || ns.self().threads !== 1 ||
      !Number.isInteger(parentPid) || parentPid <= 0 ||
      !Number.isFinite(reserve) || reserve < 0 ||
      parent?.filename.replace(/^\/+/, "") !== PURCHASE_MANAGER.slice(1) || parent.threads !== 1 ||
      processes.some(p => p.pid !== ns.pid && p.filename.replace(/^\/+/, "") === PROGRAM_BUYER.slice(1))) {
    ns.tprint("program-buyer.js is an internal child of the purchase manager.");
    return;
  }
  ns.disableLog("ALL");
  const commands = ns.getPortHandle(ns.pid);
  ns.atExit(() => ns.clearPort(ns.pid));
  while (ns.isRunning(parentPid)) {
    if (commands.empty()) {
      await ns.sleep(100);
      continue;
    }
    if (commands.read() !== "check") {
      ns.writePort(parentPid, { error: "Invalid program-buyer command." });
      return;
    }
    try {
      const next = nextPurchase(ns);
      let message = "";
      if (next && canAfford(ns, next.cost, reserve)) {
        const success = next.program ? ns.singularity.purchaseProgram(next.program) : ns.singularity.purchaseTor();
        message = success ? `Bought ${next.program ?? "TOR"} for $${next.cost.toFixed(0)}.` : "Program purchase failed; retrying next cycle.";
      }
      const nextCost = nextPurchase(ns)?.cost ?? 0;
      ns.writePort(parentPid, { nextCost, message });
      if (nextCost === 0) return;
    } catch (error) {
      ns.writePort(parentPid, { error: String(error) });
      return;
    }
  }
}

function nextPurchase(ns) {
  const program = PORT_PROGRAMS.find(file => !ns.fileExists(file, "home"));
  if (!program) return null;
  // shortcut: TOR has no price API; update this price if the game changes it.
  if (!ns.hasTorRouter()) return { program: null, cost: 200000 };
  const cost = ns.singularity.getDarkwebProgramCost(program);
  if (!Number.isFinite(cost) || cost <= 0) throw new Error(`Invalid price for ${program}: ${cost}`);
  return { program, cost };
}
