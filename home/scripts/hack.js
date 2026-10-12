import { HOME_RESERVE, MANAGER, WORKERS, findManagers, freeRam, getRunners, rootHosts, scanAllHosts } from "./network.js";

/** @param {import("@ns").NS} ns */
export async function main(ns) {
  const maxTargets = Number(ns.args[0] ?? 3);
  const threadCap = Number(ns.args[1] ?? 0);
  if (ns.getHostname() !== "home" || ns.self().threads !== 1) {
    ns.tprint("Run hack.js on home with one thread. Worker threads are automatic.");
    return;
  }
  if (!Number.isInteger(maxTargets) || maxTargets < 1 ||
      !Number.isInteger(threadCap) || threadCap < 0) {
    ns.tprint("Usage: run /scripts/hack.js [max-targets=3] [thread-cap=0 (auto)]");
    return;
  }
  ns.disableLog("ALL");
  const files = [MANAGER, "/scripts/network.js", ...Object.values(WORKERS)];
  for (const file of files) {
    if (!ns.fileExists(file, "home")) {
      ns.tprint(`Missing ${file} on home.`);
      return;
    }
  }
  const hosts = scanAllHosts(ns);
  if (findManagers(ns, hosts).length > 0) {
    ns.tprint("The hacking manager is already running.");
    return;
  }
  rootHosts(ns, hosts);
  const managerRam = ns.getScriptRam(MANAGER, "home");
  if (!Number.isFinite(managerRam) || managerRam <= 0) {
    ns.tprint(`Missing or invalid manager: ${MANAGER}`);
    return;
  }
  const releasedRam = ns.getScriptRam(ns.getScriptName(), "home");
  const availableRam = host => host === "home" ?
    ns.getServerMaxRam(host) - ns.getServerUsedRam(host) + releasedRam - HOME_RESERVE : freeRam(ns, host);
  const candidates = getRunners(ns, hosts).map(host => ({
    host, available: availableRam(host),
  })).filter(candidate => candidate.available >= managerRam)
    .sort((a, b) => Number(b.host === "home") - Number(a.host === "home") ||
      b.available - a.available || a.host.localeCompare(b.host));

  for (const { host } of candidates) {
    try {
      if (host !== "home" && !await ns.scp(files, host, "home")) {
        ns.print(`Could not copy controller files to ${host}; trying another host.`);
        continue;
      }
    } catch (error) {
      ns.print(`WARN ${host}: controller copy failed: ${String(error)}`);
      continue;
    }
    if (findManagers(ns, scanAllHosts(ns)).length > 0) {
      ns.tprint("The hacking manager is already running.");
      return;
    }
    if (!ns.serverExists(host) || availableRam(host) < managerRam) continue;
    ns.tprint(`Starting manager on ${host}; home worker reserve: 4 GB.`);
    if (host === "home") {
      // spawn terminates the launcher by throwing; do not catch that termination.
      ns.spawn(MANAGER, { threads: 1, spawnDelay: 0 }, maxTargets, threadCap);
      return;
    }
    try {
      if (ns.exec(MANAGER, host, { threads: 1, preventDuplicates: true }, maxTargets, threadCap)) return;
      ns.print(`Could not start manager on ${host}; trying another host.`);
    } catch (error) {
      ns.print(`WARN ${host}: controller startup failed: ${String(error)}`);
    }
  }
  ns.tprint(`No rooted server can fit the ${managerRam.toFixed(2)} GB controller. Free RAM and retry; home keeps 4 GB reserved.`);
}
