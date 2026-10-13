import { PURCHASE_MANAGER } from "./spending.js";

// Keep optional darknet files out of imports so missing files cannot stop hacking.
const DARKNET_MANAGER = "/scripts/darknet-manager.js";
const DARKNET_FILES = ["/scripts/darknet-worker.js", "/scripts/darknet.js"];
const DARKNET_PROGRAM = "DarkscapeNavigator.exe";
const CONTRACT_MANAGER = "/scripts/contract-manager.js";
const CONTRACT_SOLVERS = "/scripts/contracts.js";

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
  if (!ns.ps("home").some(p => p.filename.replace(/^\/+/, "") === DARKNET_MANAGER.slice(1))) {
    if (!ns.hasTorRouter() || !ns.fileExists(DARKNET_PROGRAM, "home")) {
      ns.tprint(`Darknet skipped: buy TOR and ${DARKNET_PROGRAM} manually, then rerun the master or darknet manager.`);
    } else {
      try {
        const ram = ns.getScriptRam(DARKNET_MANAGER, "home");
        const handoffRam = ns.getScriptRam(hacking, "home");
        const releasedRam = ns.getScriptRam(ns.getScriptName(), "home");
        const free = ns.getServerMaxRam("home") - ns.getServerUsedRam("home");
        if ([DARKNET_MANAGER, ...DARKNET_FILES].some(file => !ns.fileExists(file, "home")) ||
            !Number.isFinite(ram) || ram <= 0 || !Number.isFinite(handoffRam) || handoffRam <= 0 ||
            !Number.isFinite(releasedRam) || releasedRam <= 0 ||
            free < ram + Math.max(0, handoffRam + 4 - releasedRam)) {
          ns.tprint("Darknet skipped: restore explorer files or free home RAM, then retry. Starting hacking now.");
        } else {
          const darknetPid = ns.exec(DARKNET_MANAGER, "home", { threads: 1, preventDuplicates: true });
          if (darknetPid) await ns.sleep(200);
          if (!darknetPid || !ns.isRunning(darknetPid)) ns.tprint("Darknet startup failed; starting hacking now. Retry the darknet manager separately.");
        }
      } catch (error) {
        ns.tprint(`Darknet startup failed: ${String(error)}. Starting hacking now.`);
      }
    }
  }
  if (!ns.ps("home").some(p => p.filename.replace(/^\/+/, "") === CONTRACT_MANAGER.slice(1))) {
    try {
      const ram = ns.getScriptRam(CONTRACT_MANAGER, "home");
      const handoffRam = ns.getScriptRam(hacking, "home");
      const releasedRam = ns.getScriptRam(ns.getScriptName(), "home");
      const free = ns.getServerMaxRam("home") - ns.getServerUsedRam("home");
      if ([CONTRACT_MANAGER, CONTRACT_SOLVERS].some(file => !ns.fileExists(file, "home")) ||
          !Number.isFinite(ram) || ram <= 0 || !Number.isFinite(handoffRam) || handoffRam <= 0 ||
          !Number.isFinite(releasedRam) || releasedRam <= 0 ||
          free < ram + Math.max(0, handoffRam + 4 - releasedRam)) {
        ns.tprint("Contracts skipped: restore contract source files or free home RAM, then rerun the master or contract manager. Starting hacking now.");
      } else {
        const contractPid = ns.exec(CONTRACT_MANAGER, "home", { threads: 1, preventDuplicates: true });
        if (contractPid) await ns.sleep(200);
        if (!contractPid || !ns.isRunning(contractPid)) ns.tprint("Contract startup failed; starting hacking now. Retry the contract manager separately.");
      }
    } catch (error) {
      ns.tprint(`Contract startup failed: ${String(error)}. Starting hacking now.`);
    }
  }
  // spawn releases this launcher's RAM and terminates it; do not catch that termination.
  ns.spawn(hacking, { threads: 1, spawnDelay: 0 }, maxTargets, threadCap);
}
