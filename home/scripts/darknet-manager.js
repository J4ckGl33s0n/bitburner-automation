import { DARKNET_FILES, DARKNET_MANAGER, DARKNET_PROGRAM, DARKNET_WORKER, isExplorer } from "./darknet.js";

/** @param {import("@ns").NS} ns */
export async function main(ns) {
  if (ns.getHostname() !== "home" || ns.self().threads !== 1 || ns.args.length !== 0) {
    ns.tprint("Run /scripts/darknet-manager.js on home with one thread and no arguments.");
    return;
  }
  if (ns.ps("home").some(p => p.pid !== ns.pid && p.filename.replace(/^\/+/, "") === DARKNET_MANAGER.slice(1))) {
    ns.tprint("The darknet manager is already running.");
    return;
  }
  if (!ns.hasTorRouter() || !ns.fileExists(DARKNET_PROGRAM, "home")) {
    ns.tprint(`Buy TOR and ${DARKNET_PROGRAM} manually, then rerun the master or darknet manager.`);
    return;
  }
  const workerRam = ns.getScriptRam(DARKNET_WORKER, "home");
  if (DARKNET_FILES.some(file => !ns.fileExists(file, "home")) || !Number.isFinite(workerRam) || workerRam <= 0) {
    ns.tprint("Missing or invalid darknet explorer files on home. Restore source and restart.");
    return;
  }
  ns.disableLog("ALL");
  const explorers = new Set();
  const register = () => {
    for (let reply = ns.readPort(ns.pid); reply !== "NULL PORT DATA"; reply = ns.readPort(ns.pid)) {
      if (!reply || typeof reply !== "object" || !Number.isInteger(reply.pid) || reply.pid <= 0 || typeof reply.host !== "string") continue;
      const process = ns.getRunningScript(reply.pid);
      if (isExplorer(process, ns.pid) && process.server === reply.host) explorers.add(reply.pid);
    }
  };
  ns.clearPort(ns.pid);
  ns.atExit(() => {
    register();
    for (const pid of explorers.keys()) {
      if (isExplorer(ns.getRunningScript(pid), ns.pid)) ns.kill(pid);
    }
    ns.clearPort(ns.pid);
  });
  ns.tprint(`Darknet manager PID ${ns.pid}: exploration and cache collection; cache opening consumes caches and reduces karma.`);
  let refreshIn = 0;
  while (true) {
    register();
    for (const pid of explorers.keys()) {
      if (!ns.isRunning(pid)) explorers.delete(pid);
    }
    if (refreshIn <= 0) {
      try {
        if (ns.dnet.probe().includes("darkweb") && !ns.ps("darkweb").some(p => isExplorer(p, ns.pid))) {
          if (ns.getServerMaxRam("darkweb") - ns.getServerUsedRam("darkweb") < workerRam) {
            ns.print(`Waiting for ${workerRam.toFixed(2)} GB free on darkweb.`);
          } else if (await ns.scp(DARKNET_FILES, "darkweb", "home")) {
            if (ns.dnet.probe().includes("darkweb") &&
                ns.getServerMaxRam("darkweb") - ns.getServerUsedRam("darkweb") >= workerRam) {
              // Explorers are rebuilt after reload because their coordinator PID changes.
              const pid = ns.exec(DARKNET_WORKER, "darkweb", { threads: 1, preventDuplicates: true, temporary: true }, ns.pid);
              if (pid) explorers.add(pid);
              else ns.print("Darkweb explorer launch failed; retrying next refresh.");
            }
          } else ns.print("Darkweb explorer copy failed; retrying next refresh.");
        }
      } catch (error) {
        ns.print(`WARN darkweb: explorer startup failed: ${String(error)}`);
      }
      refreshIn = 30000;
    }
    await ns.sleep(1000);
    refreshIn -= 1000;
  }
}
