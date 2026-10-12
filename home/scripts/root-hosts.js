import { rootHosts, scanAllHosts } from "./network.js";

/** @param {import("@ns").NS} ns */
export async function main(ns) {
  if (ns.getHostname() !== "home") {
    ns.tprint("Run root-hosts on home.");
    return;
  }
  ns.disableLog("ALL");
  const rooted = rootHosts(ns, scanAllHosts(ns));
  ns.tprint(`Finished. Gained root access on ${rooted} new hosts.`);
  if (ns.fileExists("/scripts/scan-hosts.js", "home")) {
    ns.spawn("/scripts/scan-hosts.js", { threads: 1, spawnDelay: 0 });
  }
}
