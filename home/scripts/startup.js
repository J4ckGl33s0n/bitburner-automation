// Eligibility checks stay here; importing managers would load their optional APIs.
export const RETRY_SCRIPT = "/scripts/startup-retry.js";
export const RETRY_STATE = "/data/startup-retry-state.txt";
export const STARTUPS = [
  { id: "purchases", label: "Purchase manager", file: "/scripts/purchase-manager.js", files: ["/scripts/spending.js", "/scripts/hacknet-manager.js"] },
  { id: "darknet", label: "Darknet", file: "/scripts/darknet-manager.js", files: ["/scripts/darknet-worker.js", "/scripts/darknet.js"] },
  { id: "contracts", label: "Contracts", file: "/scripts/contract-manager.js", files: ["/scripts/contracts.js"] },
  { id: "stocks", label: "Stocks", file: "/scripts/stock-manager.js", files: ["/scripts/spending.js"] },
  { id: "go", label: "IPvGO", file: "/scripts/go-manager.js", files: ["/scripts/go.js"] },
];

/** Buyers can start while the master is yielding; retain its pending hacking handoff.
 * @param {import("@ns").NS} ns
 */
export function homeHeadroom(ns) {
  const master = ns.ps("home").find(p => p.filename.replace(/^\/+/, "") === "scripts/start.js");
  if (!master) return 4;
  const handoff = ns.getScriptRam("/scripts/hack.js", "home");
  const released = ns.getScriptRam(master.filename, "home");
  if (![handoff, released].every(n => Number.isFinite(n) && n > 0)) return Infinity;
  return Math.max(4, handoff + 4 - released);
}

/** @param {import("@ns").NS} ns */
export function startupBlocker(ns, entry, extraRam = 4) {
  if (entry.id === "purchases" && ns.ps("home").some(p => p.filename.replace(/^\/+/, "") === "scripts/hacknet-manager.js")) return "standalone Hacknet owns spending";
  if (entry.id === "darknet" && (!ns.hasTorRouter() || !ns.fileExists("DarkscapeNavigator.exe", "home"))) return "TOR and DarkscapeNavigator.exe required";
  if (entry.id === "stocks" && (!ns.stock.hasTixApiAccess() || !ns.stock.has4SDataTixApi())) return "TIX and 4S API access required";
  if (entry.id === "go" && !["Netburners", "Slum Snakes", "The Black Hand", "Tetrads", "Daedalus", "Illuminati"].includes(ns.go.getOpponent())) return "board preserved";
  if ([entry.file, ...entry.files].some(file => !ns.fileExists(file, "home"))) return "restore source files";
  const ram = ns.getScriptRam(entry.file, "home");
  if (!Number.isFinite(ram) || ram <= 0) return "invalid script RAM";
  if (ns.getServerMaxRam("home") - ns.getServerUsedRam("home") < ram + extraRam) return `free home RAM (needs ${(ram + extraRam).toFixed(2)} GB)`;
  return "";
}

/** @param {import("@ns").NS} ns */
export async function requestHomeRam(ns, ram) {
  if (!Number.isFinite(ram) || ram < 4 || ram > ns.getServerMaxRam("home")) return false;
  const hosts = ["home"];
  for (let i = 0; i < hosts.length; i++) {
    const manager = ns.ps(hosts[i]).find(p => p.filename.replace(/^\/+/, "") === "scripts/hack-manager.js");
    if (manager) {
      ns.writePort(manager.pid, { type: "home-ram", pid: ns.pid, ram });
      for (let polls = 0; polls < 10; polls++) {
        await ns.sleep(100);
        if (ns.getServerMaxRam("home") - ns.getServerUsedRam("home") >= ram) return true;
      }
      return false;
    }
    for (const host of ns.scan(hosts[i])) if (!hosts.includes(host)) hosts.push(host);
  }
  return false;
}

/** @param {import("@ns").NS} ns */
export async function tryStartup(ns, entry, extraRam = 4) {
  try {
    if (ns.ps("home").some(p => p.filename.replace(/^\/+/, "") === entry.file.slice(1))) return { done: true, reason: "running" };
    let reason = startupBlocker(ns, entry, extraRam);
    if (reason.startsWith("free home RAM") && await requestHomeRam(ns, ns.getScriptRam(entry.file, "home") + extraRam)) {
      reason = startupBlocker(ns, entry, extraRam);
    }
    if (reason) return { done: reason === "board preserved", reason };
    const pid = ns.exec(entry.file, "home", { threads: 1, preventDuplicates: true });
    if (pid) await ns.sleep(200);
    if (pid && ns.isRunning(pid)) return { done: true, reason: "started" };
    return { done: false, failed: true, reason: "startup failed; check manager logs" };
  } catch (error) {
    return { done: false, failed: true, reason: `startup failed: ${String(error)}` };
  }
}

export function recordAttempt(entry, result, now = Date.now()) {
  entry.reason = result.reason;
  if (result.done) return false;
  if (result.failed) entry.failures++;
  entry.nextAt = now + (result.failed ? [30000, 60000, 120000][entry.failures - 1] ?? 0 : 30000);
  entry.suspended = entry.failures > 3;
  return true;
}

/** @param {import("@ns").NS} ns */
export async function saveRetries(ns, state) {
  const saved = JSON.stringify(state);
  await ns.write(RETRY_STATE, saved, "w");
  if (ns.read(RETRY_STATE) !== saved) throw new Error("Cannot persist startup retries");
}
