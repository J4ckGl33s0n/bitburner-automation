import { scanAllHosts } from "./network.js";

/** @param {import("@ns").NS} ns */
export async function main(ns) {
  const paths = new Map();
  const hostDetails = scanAllHosts(ns, paths).map(host => {
    const server = ns.getServer(host);
    return {
      hostname: host,
      path: paths.get(host),
      hasRootAccess: server.hasAdminRights,
      requiredHackingLevel: server.requiredHackingSkill ?? null,
      requiredOpenPorts: server.numOpenPortsRequired ?? null,
      openPortCount: server.openPortCount ?? null,
      portsRemaining: server.numOpenPortsRequired === undefined ? null :
        Math.max(0, server.numOpenPortsRequired - server.openPortCount),
      securityLevel: server.hackDifficulty ?? null,
      hackChance: server.requiredHackingSkill === undefined ? null : ns.hackAnalyzeChance(host),
      hackTimeMs: server.requiredHackingSkill === undefined ? null : ns.getHackTime(host),
      moneyAvailable: server.moneyAvailable ?? null,
      maxRam: server.maxRam,
      ramUsed: server.ramUsed,
      cpuCores: server.cpuCores,
    };
  });
  await ns.write("hosts.txt", JSON.stringify(hostDetails, null, 2), "w");
  ns.tprint(`Saved ${hostDetails.length} hosts to hosts.txt`);
}
