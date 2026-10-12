import { purchaseHacknet } from "./hacknet-manager.js";
import { PORT_PROGRAMS, PROGRAM_BUYER, canAfford, purchaseSettings } from "./spending.js";

/** @param {import("@ns").NS} ns */
export async function main(ns) {
  const settings = purchaseSettings(ns);
  if (!settings) return;
  ns.disableLog("ALL");
  const reset = ns.getResetInfo();
  const programsEnabled = reset.currentNode === 4 || (reset.ownedSF.get(4) ?? 0) > 0;
  let buyerPid = 0;
  let serversFirst = true;
  let hacknetEnabled = true;
  ns.clearPort(ns.pid);
  ns.atExit(() => {
    if (buyerPid) {
      ns.kill(buyerPid);
      ns.clearPort(buyerPid);
    }
    ns.clearPort(ns.pid);
  });
  ns.tprint(`Purchase manager started. Reserve: $${settings.reserve.toFixed(0)}; investment budget: ${settings.budget * 100}%.`);
  ns.tprint(programsEnabled ? "Saving for port programs." :
    "Singularity unavailable: buy TOR and port programs manually. Server/Hacknet spending continues with the cash reserve, without program savings.");
  while (true) {
    let nextCost = 0;
    if (programsEnabled && (buyerPid || PORT_PROGRAMS.some(file => !ns.fileExists(file, "home")))) {
      if (!buyerPid) {
        const ram = ns.getScriptRam(PROGRAM_BUYER, "home");
        if (!ns.fileExists(PROGRAM_BUYER, "home") || !Number.isFinite(ram) || ram <= 0) {
          ns.tprint(`Missing or invalid ${PROGRAM_BUYER} on home.`);
          return;
        }
        if (ns.getServerMaxRam("home") - ns.getServerUsedRam("home") >= ram) {
          buyerPid = ns.exec(PROGRAM_BUYER, "home", { threads: 1, preventDuplicates: true }, ns.pid, settings.reserve);
          if (buyerPid) ns.clearPort(buyerPid);
        }
        if (!buyerPid) {
          ns.print(`Waiting for ${ram.toFixed(2)} GB free on home for program purchases; investments paused.`);
          await ns.sleep(2000);
          continue;
        }
      }
      ns.writePort(buyerPid, "check");
      let reply = ns.readPort(ns.pid);
      for (let polls = 0; reply === "NULL PORT DATA" && polls < 100; polls++) {
        if (!ns.isRunning(buyerPid)) break;
        await ns.sleep(100);
        reply = ns.readPort(ns.pid);
      }
      if (!reply || typeof reply !== "object" || reply.error ||
          !Number.isFinite(reply.nextCost) || reply.nextCost < 0 || typeof reply.message !== "string") {
        ns.tprint(`Program buyer stopped, timed out, or returned an error: ${reply?.error ?? "invalid or missing reply"}. Investments stopped.`);
        return;
      }
      nextCost = reply.nextCost;
      if (reply.message) ns.print(reply.message);
      if (nextCost === 0) {
        ns.kill(buyerPid);
        ns.clearPort(buyerPid);
        buyerPid = 0;
      }
    }
    const protectedCash = settings.reserve + nextCost;
    for (const category of serversFirst ? ["servers", "hacknet"] : ["hacknet", "servers"]) {
      const attempted = category === "servers" ? purchaseServer(ns, settings, protectedCash) :
        hacknetEnabled ? purchaseHacknet(ns, settings, protectedCash) : false;
      if (attempted === null) hacknetEnabled = false;
      if (attempted === true) break;
    }
    serversFirst = !serversFirst;
    await ns.sleep(2000);
  }
}

/** Returns true after an attempted purchase, including a failed purchase.
 * @param {import("@ns").NS} ns
 */
export function purchaseServer(ns, settings, protectedCash = settings.reserve) {
  const hosts = ns.cloud.getServerNames();
  const limit = ns.cloud.getServerLimit();
  const ramLimit = ns.cloud.getRamLimit();
  if (limit < 1) return false;
  if (hosts.length < limit) {
    if (ramLimit < 16) return false;
    const cost = ns.cloud.getServerCost(16);
    if (!canAfford(ns, cost, protectedCash, settings.budget)) return false;
    let index = 0;
    while (ns.serverExists(`pserv-${index}`)) index++;
    // Recheck after choosing a name; no yield between this check and the purchase.
    if (!canAfford(ns, cost, protectedCash, settings.budget)) return false;
    const host = ns.cloud.purchaseServer(`pserv-${index}`, 16);
    ns.print(host ? `Bought ${host}: 16 GB for $${cost.toFixed(0)}.` : "Server purchase failed; retrying next cycle.");
    return true;
  }
  const smallest = hosts.map(host => ({ host, ram: ns.getServerMaxRam(host) }))
    .filter(server => server.ram > 0 && server.ram * 2 <= ramLimit)
    .sort((a, b) => a.ram - b.ram || a.host.localeCompare(b.host))[0];
  if (!smallest) return false;
  const ram = smallest.ram * 2;
  const cost = ns.cloud.getServerUpgradeCost(smallest.host, ram);
  if (!canAfford(ns, cost, protectedCash, settings.budget)) return false;
  const success = ns.cloud.upgradeServer(smallest.host, ram);
  ns.print(success ? `Upgraded ${smallest.host}: ${ram} GB for $${cost.toFixed(0)}.` : "Server upgrade failed; retrying next cycle.");
  return true;
}
