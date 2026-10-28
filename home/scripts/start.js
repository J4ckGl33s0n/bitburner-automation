import { RETRY_SCRIPT, STARTUPS, recordAttempt, saveRetries, tryStartup } from "./startup.js";

/** @param {import("@ns").NS} ns */
export async function main(ns) {
  if (ns.getHostname() !== "home" || ns.self().threads !== 1) {
    ns.tprint("Run start.js on home with one thread.");
    return;
  }
  const maxTargets = Number(ns.args[0] ?? 0);
  const threadCap = Number(ns.args[1] ?? 0);
  const idleXp = Number(ns.args[2] ?? 0);
  if (!Number.isInteger(maxTargets) || maxTargets < 0 ||
      !Number.isInteger(threadCap) || threadCap < 0 || ![0, 1].includes(idleXp)) {
    ns.tprint("Usage: run /scripts/start.js [max-targets=0 (auto)] [thread-cap=0 (auto)] [idle-xp=0|1]");
    return;
  }
  const hacking = "/scripts/hack.js";
  for (const file of [hacking]) {
    if (!ns.fileExists(file, "home")) {
      ns.tprint(`Missing ${file} on home.`);
      return;
    }
  }
  const processes = ns.ps("home");
  const filename = ns.getScriptName().replace(/^\/+/, "");
  if (processes.some(p => p.pid !== ns.pid && p.filename.replace(/^\/+/, "") === filename)) {
    ns.tprint("The master start script is already running.");
    return;
  }
  const handoff = ns.getScriptRam(hacking, "home");
  const released = ns.getScriptRam(ns.getScriptName(), "home");
  const extra = Number.isFinite(handoff) && handoff > 0 && Number.isFinite(released) && released > 0 ?
    Math.max(0, handoff + 4 - released) : Infinity;
  const state = { reset: ns.getResetInfo().lastAugReset, ready: false, pending: [] };
  const attempt = async entry => {
    const result = await tryStartup(ns, entry, extra);
    if (result.reason === "running" && entry.id === "purchases") await ns.sleep(200);
    if (!result.done || result.reason === "board preserved") ns.tprint(`${entry.label} ${entry.id === "purchases" ? "unavailable" : "skipped"}: ${result.reason}. Hacking continues.`);
    const pending = { id: entry.id, failures: 0, nextAt: 0, suspended: false };
    if (recordAttempt(pending, result)) state.pending.push(pending);
  };
  await attempt(STARTUPS[0]);
  let retry = 0;
  try {
    for (const p of ns.ps("home")) if (p.filename.replace(/^\/+/, "") === RETRY_SCRIPT.slice(1)) ns.kill(p.pid);
    const ram = ns.getScriptRam(RETRY_SCRIPT, "home");
    if (ns.fileExists(RETRY_SCRIPT, "home") && Number.isFinite(ram) && ram > 0 &&
        ns.getServerMaxRam("home") - ns.getServerUsedRam("home") >= ram + extra) {
      await saveRetries(ns, state);
      retry = ns.exec(RETRY_SCRIPT, "home", { threads: 1, preventDuplicates: true });
    }
  } catch (error) { ns.tprint(`Startup retry unavailable: ${String(error)}`); }
  for (const entry of STARTUPS.slice(1)) await attempt(entry);
  if (retry) {
    state.ready = true;
    try { await saveRetries(ns, state); } catch {
      ns.kill(retry);
      ns.tprint("Cannot persist startup retries; retry script stopped. Rerun start.js after fixing storage.");
    }
  } else ns.tprint("Startup retry unavailable: restore retry source or free home RAM, then rerun start.js.");
  // spawn terminates the launcher; never swallow that termination.
  ns.spawn(hacking, { threads: 1, spawnDelay: 0 }, maxTargets, threadCap, idleXp);
}
