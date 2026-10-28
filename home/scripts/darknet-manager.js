import { DARKNET_FILES, DARKNET_MANAGER, DARKNET_PROGRAM, DARKNET_WORKER, isExplorer, DARKNET_DIAGNOSTICS, validDarknetReport, darknetReportKey } from "./darknet.js";

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
  let diagnostics = new Map();
  let dirty = false;
  try {
    if (ns.fileExists(DARKNET_DIAGNOSTICS, "home")) {
      const saved = JSON.parse(ns.read(DARKNET_DIAGNOSTICS));
      if (!Array.isArray(saved) || saved.some(r => !validDarknetReport(r) || !Number.isSafeInteger(r.count) || r.count < 1 ||
          !Number.isFinite(r.firstSeen) || !Number.isFinite(r.lastSeen))) throw new Error("Invalid darknet diagnostics");
      diagnostics = new Map(saved.map(r => [darknetReportKey(r), r]));
    }
  } catch (error) {
    ns.tprint(`Darknet diagnostics disabled; existing file preserved: ${String(error)}`);
    diagnostics = null;
  }
  const register = () => {
    for (let reply = ns.readPort(ns.pid); reply !== "NULL PORT DATA"; reply = ns.readPort(ns.pid)) {
      if (!reply || typeof reply !== "object" || !Number.isInteger(reply.pid) || reply.pid <= 0 || typeof reply.host !== "string") continue;
      const process = ns.getRunningScript(reply.pid);
      if (!isExplorer(process, ns.pid) || process.server !== reply.host) continue;
      explorers.add(reply.pid);
      if (!diagnostics || !validDarknetReport(reply)) continue;
      const key = darknetReportKey(reply);
      const previous = diagnostics.get(key);
      // shortcut: retain 512 distinct blockers/timing sources; export fixtures before increasing the cap.
      if (!previous && diagnostics.size >= 512) continue;
      const record = { ...reply };
      delete record.pid;
      diagnostics.set(key, { ...record, firstSeen: previous?.firstSeen ?? Date.now(), lastSeen: Date.now(), count: (previous?.count ?? 0) + 1 });
      dirty = true;
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
    if (dirty && diagnostics) {
      try {
        const text = JSON.stringify([...diagnostics.values()]);
        await ns.write(DARKNET_DIAGNOSTICS, text, "w");
        if (ns.read(DARKNET_DIAGNOSTICS) !== text) throw new Error("Diagnostics write failed");
        dirty = false;
      } catch (error) {
        ns.tprint(`Darknet diagnostics could not be saved: ${String(error)}. Exploration continues.`);
        diagnostics = null;
      }
    }
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
