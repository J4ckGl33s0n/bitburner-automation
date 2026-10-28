import { RETRY_SCRIPT, RETRY_STATE, STARTUPS, recordAttempt, saveRetries, tryStartup } from "./startup.js";

/** @param {import("@ns").NS} ns */
export async function main(ns) {
  if (ns.getHostname() !== "home" || ns.self().threads !== 1 || ns.args.length ||
      ns.ps("home").some(p => p.pid !== ns.pid && p.filename.replace(/^\/+/, "") === RETRY_SCRIPT.slice(1))) {
    ns.tprint("Run one startup-retry.js on home with one thread and no arguments.");
    return;
  }
  ns.disableLog("ALL");
  while (true) {
    await ns.sleep(30000);
    try {
      const state = JSON.parse(ns.read(RETRY_STATE));
      if (state.reset !== ns.getResetInfo().lastAugReset) return;
      if (!state.ready) continue;
      if (!Array.isArray(state.pending) || state.pending.some(e =>
        !STARTUPS.some(s => s.id === e.id) || !Number.isInteger(e.failures) || e.failures < 0 ||
        !Number.isFinite(e.nextAt) || e.nextAt < 0 || e.suspended !== (e.failures > 3))) throw new Error("Invalid retry state");
      for (const entry of [...state.pending]) {
        if (entry.suspended || entry.nextAt > Date.now()) continue;
        const result = await tryStartup(ns, STARTUPS.find(s => s.id === entry.id));
        const previous = entry.reason;
        if (!recordAttempt(entry, result)) state.pending.splice(state.pending.indexOf(entry), 1);
        if (entry.suspended) ns.tprint(`${entry.id}: startup retries exhausted; resolve the error and rerun start.js.`);
        else if (entry.reason !== previous || Date.now() - (entry.reportedAt ?? 0) >= 300000) {
          ns.print(`${entry.id}: ${entry.reason}`);
          entry.reportedAt = Date.now();
        }
        await saveRetries(ns, state);
      }
      if (!state.pending.length) return;
    } catch (error) {
      ns.tprint(`Startup retries stopped: ${String(error)}. Repair ${RETRY_STATE} or rerun start.js.`);
      return;
    }
  }
}
