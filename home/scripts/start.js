import { PURCHASE_MANAGER } from "./spending.js";

/** @param {import("@ns").NS} ns */
export async function main(ns) {
  if (ns.getHostname() !== "home" || ns.self().threads !== 1) {
    ns.tprint("Run start.js on home with one thread.");
    return;
  }
  const maxTargets = Number(ns.args[0] ?? 3);
  const threadCap = Number(ns.args[1] ?? 0);
  if (!Number.isInteger(maxTargets) || maxTargets < 1 ||
      !Number.isInteger(threadCap) || threadCap < 0) {
    ns.tprint("Usage: run /scripts/start.js [max-targets=3] [thread-cap=0 (auto)]");
    return;
  }
  const hacking = "/scripts/hack.js";
  for (const file of [PURCHASE_MANAGER, hacking]) {
    if (!ns.fileExists(file, "home")) {
      ns.tprint(`Missing ${file} on home.`);
      return;
    }
  }
  const processes = ns.ps("home");
  const filename = ns.getScriptName().replace(/^\/+/, "");
  if (processes.some(p => p.pid !== ns.pid && p.filename.replace(/^\/+/, "") === filename)) {
    ns.tprint("The master start script is already running.");
    return;
  }
  const purchase = processes.find(p => p.filename.replace(/^\/+/, "") === PURCHASE_MANAGER.slice(1));
  const standalone = processes.some(p => p.filename.replace(/^\/+/, "") === "scripts/hacknet-manager.js");
  const pid = purchase?.pid ?? (standalone ? 0 : ns.exec(PURCHASE_MANAGER, "home", { threads: 1, preventDuplicates: true }));
  if (pid) {
    // shortcut: yield one game cycle; add a readiness handshake if startup needs longer.
    await ns.sleep(200);
  }
  if (!pid || !ns.isRunning(pid)) {
    ns.tprint("Purchase manager unavailable. Free home RAM or stop standalone Hacknet and retry; starting hacking now.");
  }
  // spawn releases this launcher's RAM and terminates it; do not catch that termination.
  ns.spawn(hacking, { threads: 1, spawnDelay: 0 }, maxTargets, threadCap);
}
