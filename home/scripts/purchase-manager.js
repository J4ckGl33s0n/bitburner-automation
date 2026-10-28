import { purchaseHacknet, hacknetCandidates, buyHacknet, spendHashes } from "./hacknet-manager.js";
import { PORT_PROGRAMS, PROGRAM_BUYER, HOME_BUYER, MARKET_BUYER, canAfford, purchaseSettings, publishStockPolicy, resetDeadline, repaysBeforeReset, readMetrics } from "./spending.js";
import { RETRY_STATE, STARTUPS, startupBlocker, homeHeadroom, requestHomeRam } from "./startup.js";

/** @param {import("@ns").NS} ns */
export async function main(ns) {
  const settings = purchaseSettings(ns);
  if (!settings) return;
  ns.disableLog("ALL");
  const reset = ns.getResetInfo();
  const singularity = reset.currentNode === 4 || (reset.ownedSF.get(4) ?? 0) > 0;
  let buyer = null;
  let requestId = 0;
  let serversFirst = true;
  let lastWait = "";
  let lastSavingsGoal = "";
  let lastSavingsAt = 0;
  const dollars = value => "$" + value.toLocaleString("en-US", { notation: "compact", maximumFractionDigits: 2 });
  ns.clearPort(ns.pid);
  const stopBuyer = () => {
    if (!buyer) return;
    ns.kill(buyer.pid);
    ns.clearPort(buyer.pid);
    buyer = null;
  };
  ns.atExit(() => { stopBuyer(); ns.clearPort(ns.pid); });
  const request = async (file, command = "quote", kind = "", expected = null, protectedCash = settings.reserve, fraction = 1) => {
    if (buyer?.file !== file) stopBuyer();
    if (!buyer) {
      const ram = ns.getScriptRam(file, "home");
      if (!ns.fileExists(file, "home") || !ns.fileExists("/scripts/buyer.js", "home") || !Number.isFinite(ram) || ram <= 0) throw new Error(`Missing or invalid ${file} or buyer.js`);
      const headroom = homeHeadroom(ns);
      if (ns.getServerMaxRam("home") - ns.getServerUsedRam("home") < ram + headroom && !await requestHomeRam(ns, ram + headroom)) {
        const message = `Waiting for ${(ram + headroom).toFixed(2)} GB free on home for ${file}; investments paused. Free RAM or upgrade home manually if the upgrade child cannot fit.`;
        if (message !== lastWait) ns.tprint(message);
        lastWait = message;
        return undefined;
      }
      const pid = ns.exec(file, "home", { threads: 1, preventDuplicates: true }, ns.pid, settings.reserve, settings.unlocks);
      if (!pid) { ns.print("Buyer launch failed; investments paused until next cycle."); return undefined; }
      buyer = { file, pid };
      ns.clearPort(pid);
    }
    ns.clearPort(ns.pid);
    const id = ++requestId;
    ns.writePort(buyer.pid, { id, command, kind, expected, protectedCash, fraction,
      deadline: expected?.gain !== undefined ? settings.deadline : undefined });
    let reply = ns.readPort(ns.pid);
    for (let polls = 0; reply === "NULL PORT DATA" && polls < 100; polls++) {
      if (!ns.isRunning(buyer.pid)) break;
      await ns.sleep(100);
      reply = ns.readPort(ns.pid);
    }
    if (!reply || typeof reply !== "object" || reply.pid !== buyer.pid || reply.id !== id || reply.error ||
        typeof reply.message !== "string" || (reply.quote !== null &&
          (!reply.quote || !(file === PROGRAM_BUYER ? ["program", "tor"] : file === HOME_BUYER ? ["homeRam", "homeCores"] : ["tix", "4s"]).includes(reply.quote.kind) ||
            reply.quote.kind === "program" && ![...PORT_PROGRAMS, "DarkscapeNavigator.exe", "Formulas.exe"].includes(reply.quote.program) ||
            !Number.isFinite(reply.quote.cost) || reply.quote.cost <= 0))) {
      throw new Error(`Buyer stopped, timed out, or returned an error: ${reply?.error ?? "invalid or missing reply"}`);
    }
    if (reply.message) ns.print(reply.message);
    return reply.quote === null ? null : { ...reply.quote, file };
  };
  const goal = async () => {
    const programs = singularity && [...PORT_PROGRAMS, ...(settings.unlocks ? ["DarkscapeNavigator.exe", "Formulas.exe"] : [])].some(f => !ns.fileExists(f, "home"));
    const market = settings.unlocks && (!ns.stock.hasTixApiAccess() || !ns.stock.has4SDataTixApi() && !reset.bitNodeOptions.disable4SData);
    const child = programs ? PROGRAM_BUYER : market ? MARKET_BUYER : null;
    if (singularity && settings.homeUpgrades && homeRamShortage(ns, child, buyer?.file) > 0) {
      const q = await request(HOME_BUYER, "quote", "homeRam");
      if (q !== null) return q;
    }
    if (programs) {
      const q = await request(PROGRAM_BUYER);
      if (q !== null) return q;
    }
    if (market) return request(MARKET_BUYER);
    return null;
  };
  ns.tprint(`Purchase manager started. Reserve: $${settings.reserve.toFixed(0)}; investment budget: ${settings.budget * 100}%.`);
  if (!singularity) ns.tprint("Singularity unavailable: buy TOR and port programs manually. Home upgrades and program savings unavailable; market/server/Hacknet purchases remain eligible.");
  try {
    await resetDeadline(ns, settings);
    while (true) {
      publishStockPolicy(ns, settings.reserve, false);
      spendHashes(ns, settings);
      let next = await goal();
      if (next === undefined) { await ns.sleep(2000); continue; }
      if (next && canAfford(ns, next.cost, settings.reserve)) {
        const result = await request(next.file, "buy", next.kind, next);
        if (result === undefined) { await ns.sleep(2000); continue; }
        next = await goal();
        if (next === undefined) { await ns.sleep(2000); continue; }
      }
      const protectedCash = settings.reserve + (next?.cost ?? 0);
      const savingsGoal = next ? `${next.kind}:${next.program ?? ""}:${next.cost}` : "none";
      if (savingsGoal !== lastSavingsGoal || Date.now() - lastSavingsAt >= 30000) {
        if (next) {
          const label = next.program ?? ({ tor: "TOR", homeRam: "home RAM upgrade", homeCores: "home core upgrade", tix: "TIX API", "4s": "4S API" })[next.kind];
          const remaining = Math.max(0, protectedCash - ns.getServerMoneyAvailable("home"));
          ns.print(`Saving for ${label}: ${dollars(next.cost)} target, ${dollars(remaining)} remaining (reserve ${dollars(settings.reserve)}).`);
        } else ns.print(`No active savings goal; reserve ${dollars(settings.reserve)}.`);
        lastSavingsGoal = savingsGoal;
        lastSavingsAt = Date.now();
      }
      const metrics = readMetrics(ns);
      if (metrics) {
        const candidates = [...serverCandidates(ns), ...hacknetCandidates(ns, settings)];
        if (singularity && settings.homeUpgrades && (metrics.demand > 0 || metrics.homeSupportRam > 0)) {
          for (const kind of ["homeRam", "homeCores"]) {
            const q = await request(HOME_BUYER, "quote", kind);
            if (q === undefined) { next = undefined; break; }
            if (q) candidates.push({ ...q, type: kind, ramGain: kind === "homeRam" ? ns.getServerMaxRam("home") : metrics.homeSupportRam / (ns.getServer("home").cpuCores + 16) });
          }
        }
        if (next === undefined) { await ns.sleep(2000); continue; }
        for (const c of candidates) if (c.ramGain !== undefined) c.gain = metrics.money / metrics.ramSeconds * Math.min(c.ramGain, metrics.demand);
        const best = selectInvestment(ns, candidates, settings, protectedCash);
        if (best?.file) await request(best.file, "buy", best.kind, best, protectedCash, settings.budget);
        else if (best?.ramGain !== undefined) buyServer(ns, best, settings, protectedCash);
        else if (best) buyHacknet(ns, best, settings, protectedCash);
      } else {
        ns.print("Worker return comparison unavailable: waiting for complete, fresh hacking measurements; using conservative spending fallback.");
        for (const category of serversFirst ? ["servers", "hacknet"] : ["hacknet", "servers"]) {
          const attempted = category === "servers" ? settings.deadline === undefined && purchaseServer(ns, settings, protectedCash) : purchaseHacknet(ns, settings, protectedCash);
          if (attempted) break;
        }
      }
      // Quotes and approvals above may yield; publish only the freshly rechecked goal.
      next = await goal();
      if (next !== undefined) publishStockPolicy(ns, settings.reserve + (next?.cost ?? 0), true);
      if (!next) stopBuyer();
      serversFirst = !serversFirst;
      await ns.sleep(2000);
    }
  } catch (error) {
    publishStockPolicy(ns, settings.reserve, false);
    ns.tprint(`${String(error)}. Investments stopped. Resolve the error and restart the purchase manager.`);
  }
}

/** @param {import("@ns").NS} ns */
export function homeRamShortage(ns, child = null, activeChild = null) {
  let needed = homeHeadroom(ns);
  if (child && child !== activeChild) {
    const ram = ns.getScriptRam(child, "home");
    if (Number.isFinite(ram) && ram > 0) needed += ram;
  }
  try {
    const state = JSON.parse(ns.read(RETRY_STATE));
    if (state.reset === ns.getResetInfo().lastAugReset && Array.isArray(state.pending)) {
      for (const pending of state.pending) {
        const entry = STARTUPS.find(e => e.id === pending.id);
        if (pending.suspended || !entry || ns.ps("home").some(p => p.filename.replace(/^\/+/, "") === entry.file.slice(1))) continue;
        if (startupBlocker(ns, entry, 0).startsWith("free home RAM") || startupBlocker(ns, entry, 0) === "") needed += ns.getScriptRam(entry.file, "home");
      }
    }
  } catch { /* Missing retry state means no startup RAM goal has been requested. */ }
  return Math.max(0, needed - (ns.getServerMaxRam("home") - ns.getServerUsedRam("home")));
}

/** @param {import("@ns").NS} ns */
export function selectInvestment(ns, candidates, settings, protectedCash) {
  return candidates.filter(c => Number.isFinite(c.cost) && c.cost > 0 &&
    (c.type === "cache" ? settings.deadline === undefined || settings.deadline > Date.now() :
      Number.isFinite(c.gain) && c.gain > 0 && repaysBeforeReset(c, settings) &&
      (c.ramGain !== undefined || c.type === "node" || c.cost / c.gain <= settings.payback * 60)) &&
    canAfford(ns, c.cost, protectedCash, settings.budget))
    .sort((a, b) => Number(b.type === "cache") - Number(a.type === "cache") ||
      a.cost / a.gain - b.cost / b.gain || a.cost - b.cost)[0];
}

/** @param {import("@ns").NS} ns */
export function serverCandidates(ns) {
  const hosts = ns.cloud.getServerNames();
  const max = ns.cloud.getRamLimit();
  const candidates = [];
  if (hosts.length < ns.cloud.getServerLimit() && max >= 16) candidates.push({ type: "server", ram: 16, ramGain: 16, cost: ns.cloud.getServerCost(16) });
  for (const host of hosts.sort()) {
    const old = ns.getServerMaxRam(host);
    if (old > 0 && old * 2 <= max) candidates.push({ type: "server", host, ram: old * 2, ramGain: old, cost: ns.cloud.getServerUpgradeCost(host, old * 2) });
  }
  return candidates;
}

/** @param {import("@ns").NS} ns */
export function buyServer(ns, action, settings, protectedCash) {
  let host = action.host;
  if (!host) {
    let index = 0;
    while (ns.serverExists(`pserv-${index}`)) index++;
    host = `pserv-${index}`;
  }
  const cost = action.host ? ns.cloud.getServerUpgradeCost(host, action.ram) : ns.cloud.getServerCost(action.ram);
  if (cost > action.cost || !canAfford(ns, cost, protectedCash, settings.budget) || !repaysBeforeReset({ ...action, cost }, settings)) return false;
  const success = action.host ? ns.cloud.upgradeServer(host, action.ram) : ns.cloud.purchaseServer(host, action.ram);
  ns.print(success ? `Expanded ${host} to ${action.ram} GB for $${cost.toFixed(0)}.` : "Server purchase failed; retrying next cycle.");
  return true;
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
