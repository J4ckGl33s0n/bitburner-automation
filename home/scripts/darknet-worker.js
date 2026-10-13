import { DARKNET_FILES, DARKNET_MANAGER, DARKNET_WORKER, isExplorer, passwordCandidates } from "./darknet.js";

/** @param {import("@ns").NS} ns */
export async function main(ns) {
  const managerPid = ns.args[0];
  const manager = typeof managerPid === "number" && Number.isInteger(managerPid) && managerPid > 0 ? ns.getRunningScript(managerPid) : null;
  if (ns.args.length !== 1 || ns.self().threads !== 1 || !ns.dnet.isDarknetServer() ||
      manager?.server !== "home" || manager.filename.replace(/^\/+/, "") !== DARKNET_MANAGER.slice(1) || manager.threads !== 1) {
    ns.tprint("darknet-worker.js is an internal explorer of the darknet manager.");
    return;
  }
  ns.disableLog("ALL");
  const host = ns.getHostname();
  while (ns.isRunning(managerPid) && !ns.tryWritePort(managerPid, { pid: ns.pid, host })) await ns.sleep(200);
  const workerRam = ns.getScriptRam(DARKNET_WORKER, "home");
  if (!Number.isFinite(workerRam) || workerRam <= 0) {
    ns.print("Invalid darknet worker RAM on home; restart after restoring source.");
    return;
  }
  const passwords = new Map();
  const reported = new Set();
  while (ns.isRunning(managerPid)) {
    for (const file of ns.ls(host, ".cache").filter(file => file.endsWith(".cache"))) {
      if (!ns.isRunning(managerPid)) return;
      try {
        const result = ns.dnet.openCache(file);
        ns.print(`CACHE ${host}/${file}: ${result.message} (karma ${result.karmaLoss})`);
      } catch (error) {
        ns.print(`WARN ${host}/${file}: cache opening failed: ${String(error)}`);
      }
    }
    for (const target of ns.dnet.probe()) {
      if (!ns.isRunning(managerPid)) return;
      try {
        let details = ns.dnet.getServerDetails(target);
        if (!details.isOnline || !details.isConnectedToCurrentServer || ns.ps(target).some(p => isExplorer(p, managerPid))) continue;
        if (!details.hasSession) {
          const saved = passwords.get(target);
          if (saved === undefined || !ns.dnet.connectToSession(target, saved).success) {
            passwords.delete(target);
            const candidates = passwordCandidates(details);
            if (candidates.length === 0) {
              const key = JSON.stringify([target, details.modelId, details.passwordHint, details.data]);
              if (!reported.has(key)) {
                ns.print(`SKIP ${target}: unsupported model or malformed hint (${details.modelId}): ${details.passwordHint}`);
                reported.add(key);
              }
              continue;
            }
            for (const password of candidates) {
              details = ns.dnet.getServerDetails(target);
              if (!ns.isRunning(managerPid) || !details.isOnline || !details.isConnectedToCurrentServer) break;
              const result = await ns.dnet.authenticate(target, password);
              if (!ns.isRunning(managerPid)) return;
              if (result.success) {
                passwords.set(target, password);
                break;
              }
              ns.print(`AUTH ${target}: ${result.code} ${result.message}`);
              if (result.code !== ns.enums.DarknetResponseCode.AuthFailure) break;
            }
          }
        }
        details = ns.dnet.getServerDetails(target);
        if (!details.isOnline || !details.isConnectedToCurrentServer || !details.hasSession) continue;
        if (ns.getServerMaxRam(target) - ns.getServerUsedRam(target) < workerRam && details.blockedRam > 0) {
          const result = await ns.dnet.memoryReallocation(target);
          if (!ns.isRunning(managerPid)) return;
          if (!result.success) {
            ns.print(`RAM ${target}: ${result.code} ${result.message}`);
            continue;
          }
        }
        details = ns.dnet.getServerDetails(target);
        if (!details.isOnline || !details.isConnectedToCurrentServer || !details.hasSession ||
            ns.getServerMaxRam(target) - ns.getServerUsedRam(target) < workerRam) continue;
        if (!await ns.scp(DARKNET_FILES, target, "home")) {
          ns.print(`COPY ${target}: failed; retrying next refresh.`);
          continue;
        }
        if (!ns.isRunning(managerPid)) return;
        details = ns.dnet.getServerDetails(target);
        if (!details.isOnline || !details.isConnectedToCurrentServer || !details.hasSession ||
            ns.getServerMaxRam(target) - ns.getServerUsedRam(target) < workerRam ||
            ns.ps(target).some(p => isExplorer(p, managerPid))) continue;
        const pid = ns.exec(DARKNET_WORKER, target, { threads: 1, preventDuplicates: true, temporary: true }, managerPid);
        ns.print(pid ? `EXPLORE ${target}: PID ${pid}` : `LAUNCH ${target}: failed; retrying next refresh.`);
      } catch (error) {
        ns.print(`WARN ${target}: exploration failed: ${String(error)}`);
      }
    }
    await ns.sleep(30000);
  }
}
