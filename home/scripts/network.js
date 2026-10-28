export const HOME_RESERVE = 4;
export const MANAGER = "/scripts/hack-manager.js";
export const WORKERS = {
  hack: "/scripts/hack-worker.js",
  grow: "/scripts/grow-worker.js",
  weaken: "/scripts/weaken-worker.js",
};

/**
 * @param {import("@ns").NS} ns
 * @param {Map<string, string>} [paths]
 */
export function scanAllHosts(ns, paths) {
  const hosts = ["home"];
  const discovered = new Set(hosts);
  paths?.set("home", "home");
  for (let i = 0; i < hosts.length; i++) {
    for (const neighbour of ns.scan(hosts[i])) {
      if (!discovered.has(neighbour)) {
        discovered.add(neighbour);
        hosts.push(neighbour);
        paths?.set(neighbour, hosts[i] === "home" ? neighbour : `${paths.get(hosts[i])} > ${neighbour}`);
      }
    }
  }
  return hosts;
}

/** @param {import("@ns").NS} ns */
export function rootHosts(ns, hosts) {
  const tools = [
    ["BruteSSH.exe", host => ns.brutessh(host)],
    ["FTPCrack.exe", host => ns.ftpcrack(host)],
    ["relaySMTP.exe", host => ns.relaysmtp(host)],
    ["HTTPWorm.exe", host => ns.httpworm(host)],
    ["SQLInject.exe", host => ns.sqlinject(host)],
  ].filter(([file]) => ns.fileExists(file, "home"));
  let rooted = 0;
  for (const host of hosts) {
    if (ns.hasRootAccess(host)) continue;
    for (const [file, openPort] of tools) {
      try {
        openPort(host);
      } catch (error) {
        ns.print(`WARN ${host}: ${file} failed: ${String(error)}`);
      }
    }
    try {
      ns.nuke(host);
      if (ns.hasRootAccess(host)) {
        rooted++;
        ns.tprint(`ROOTED ${host}`);
      } else {
        ns.print(`Waiting to root ${host}: needs open ports or NUKE.exe.`);
      }
    } catch (error) {
      ns.print(`WARN ${host}: rooting failed: ${String(error)}`);
    }
  }
  return rooted;
}

/** @param {import("@ns").NS} ns */
export function getRunners(ns, hosts) {
  const hacknetServers = new Set();
  const count = ns.hacknet.numNodes();
  for (let i = 0; i < count; i++) {
    const node = ns.hacknet.getNodeStats(i);
    if (node.cache !== undefined) hacknetServers.add(node.name);
  }
  return hosts.filter(host =>
    !hacknetServers.has(host) && ns.serverExists(host) &&
    ns.hasRootAccess(host) && ns.getServerMaxRam(host) > 0
  );
}

/** @param {import("@ns").NS} ns */
export function freeRam(ns, host) {
  return Math.max(0, ns.getServerMaxRam(host) - ns.getServerUsedRam(host) -
    (host === "home" ? HOME_RESERVE : 0));
}

/** @param {import("@ns").NS} ns */
export function findManagers(ns, hosts) {
  return hosts.filter(host => ns.serverExists(host)).flatMap(host =>
    ns.ps(host).filter(process =>
      process.filename.replace(/^\/+/, "") === MANAGER.slice(1)
    )
  );
}
