import { PURCHASE_MANAGER, canAfford } from "./spending.js";

/** @param {import("@ns").NS} ns */
export async function serveBuyer(ns, quote, buy) {
  const parentPid = ns.args[0];
  const parent = ns.ps("home").find(p => p.pid === parentPid);
  if (ns.getHostname() !== "home" || ns.self().threads !== 1 ||
      !Number.isInteger(parentPid) || parentPid <= 0 ||
      parent?.filename.replace(/^\/+/, "") !== PURCHASE_MANAGER.slice(1) || parent.threads !== 1 ||
      ns.ps("home").some(p => p.pid !== ns.pid && p.filename === ns.getScriptName())) {
    ns.tprint(`${ns.getScriptName()} is an internal child of the purchase manager.`);
    return;
  }
  ns.disableLog("ALL");
  ns.atExit(() => ns.clearPort(ns.pid));
  const commands = ns.getPortHandle(ns.pid);
  while (ns.isRunning(parentPid)) {
    if (commands.empty()) { await ns.sleep(100); continue; }
    const request = commands.read();
    try {
      if (!request || typeof request !== "object" || !Number.isSafeInteger(request.id) || request.id < 1 ||
          !["quote", "buy"].includes(request.command)) throw new Error("Invalid program-buyer command or buyer request");
      let next = quote(request.kind);
      if (next && (!Number.isFinite(next.cost) || next.cost <= 0 || typeof next.kind !== "string")) throw new Error("Invalid buyer price");
      let message = "";
      if (request.command === "buy") {
        if (!Number.isFinite(request.protectedCash) || request.protectedCash < 0 ||
            !Number.isFinite(request.fraction) || request.fraction <= 0 || request.fraction > 1 ||
            !request.expected || typeof request.expected.kind !== "string" || !Number.isFinite(request.expected.cost) || request.expected.cost <= 0) throw new Error("Invalid purchase approval");
        if (request.deadline !== undefined && (!Number.isFinite(request.deadline) || !Number.isFinite(request.expected.gain) || request.expected.gain <= 0)) throw new Error("Invalid reset horizon approval");
        if (next && next.kind === request.expected.kind && next.cost <= request.expected.cost &&
            next.program === request.expected.program && canAfford(ns, next.cost, request.protectedCash, request.fraction) &&
            (request.deadline === undefined || next.cost / request.expected.gain <= (request.deadline - Date.now()) / 1000)) {
          const success = buy(next);
          message = success ? `Bought ${next.program ?? next.kind} for $${next.cost.toFixed(0)}.` : "Purchase failed; retrying next cycle.";
        } else message = "Purchase changed or no longer affordable; requoting.";
        next = quote(request.kind);
        if (next && (!Number.isFinite(next.cost) || next.cost <= 0)) throw new Error("Invalid buyer price");
      }
      ns.writePort(parentPid, { pid: ns.pid, id: request.id, quote: next, message });
    } catch (error) {
      ns.writePort(parentPid, { pid: ns.pid, id: request?.id, error: String(error) });
      return;
    }
  }
}
