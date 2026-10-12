import { WORKERS, findManagers, freeRam, getRunners, rootHosts, scanAllHosts } from "./network.js";

/** @param {import("@ns").NS} ns */
export async function main(ns) {
  const maxTargets = Number(ns.args[0] ?? 3);
  const threadCap = Number(ns.args[1] ?? 0);
  if (!Number.isInteger(maxTargets) || maxTargets < 1 ||
      !Number.isInteger(threadCap) || threadCap < 0) {
    ns.tprint("Usage: run /scripts/hack-manager.js [max-targets=3] [thread-cap=0 (auto)]");
    return;
  }
  if (ns.self().threads !== 1 ||
      findManagers(ns, scanAllHosts(ns)).some(process => process.pid !== ns.pid)) {
    ns.tprint("Run only one hacking manager, with one thread.");
    return;
  }
  const workerRam = Object.fromEntries(Object.entries(WORKERS).map(([action, file]) =>
    [action, ns.getScriptRam(file, "home")]
  ));
  if (Object.values(workerRam).some(ram => !Number.isFinite(ram) || ram <= 0)) {
    ns.tprint("Missing or invalid workers on home. Restore the worker files and restart.");
    return;
  }
  ns.disableLog("ALL");
  const jobs = new Map();
  const copied = new Set(["home"]);
  ns.atExit(() => {
    for (const pids of jobs.values()) {
      for (const pid of pids) ns.kill(pid);
    }
  });
  ns.tprint(`Manager PID ${ns.pid} on ${ns.getHostname()}: ${maxTargets} targets, ${threadCap || "automatic"} threads per phase; home reserve: 4 GB.`);
  const workerFiles = Object.values(WORKERS);
  // Recognise old workers during migration, but never take ownership of them.
  const workerNames = new Set([...workerFiles, "/scripts/hgw-worker.js"].map(file => file.slice(1)));
  let runners = [];
  let ranked = [];
  let refreshIn = 0;
  let cursor = 0;
  let lastSelection = "";
  let lastStatus = "";

  while (true) {
    for (const [target, pids] of jobs) {
      const active = pids.filter(pid => ns.isRunning(pid));
      if (active.length > 0) jobs.set(target, active);
      else jobs.delete(target);
    }
    if (refreshIn <= 0) {
      const hosts = scanAllHosts(ns);
      rootHosts(ns, hosts);
      runners = getRunners(ns, hosts);
      for (const host of copied) {
        if (!runners.includes(host)) copied.delete(host);
      }
      for (const host of runners) {
        if (host === "home") {
          copied.add(host);
          continue;
        }
        if (copied.has(host) && workerFiles.every(file => ns.fileExists(file, host))) continue;
        copied.delete(host);
        try {
          if (await ns.scp(workerFiles, host, "home")) copied.add(host);
          else ns.print(`Could not copy workers to ${host}; retrying next refresh.`);
        } catch (error) {
          ns.print(`WARN ${host}: worker copy failed: ${String(error)}`);
        }
      }
      ranked = rankTargets(ns, scanAllHosts(ns));
      refreshIn = 30000;
    }

    const availableHosts = runners.filter(host => ns.serverExists(host) && ns.hasRootAccess(host));
    const busy = new Set(jobs.keys());
    for (const host of availableHosts) {
      for (const process of ns.ps(host)) {
        if (workerNames.has(process.filename.replace(/^\/+/, ""))) busy.add(String(process.args[0]));
      }
    }
    // Finish existing phases even when a refresh changes the ranking.
    const selected = [...new Set([...jobs.keys(), ...ranked])].slice(0, maxTargets);
    if (selected.join(",") !== lastSelection) {
      lastSelection = selected.join(",");
      ns.print(`Selected targets (heuristic ranking): ${selected.join(", ") || "none"}`);
    }
    const offset = selected.length ? cursor % selected.length : 0;
    const idle = [...selected.slice(offset), ...selected.slice(0, offset)].filter(host => !busy.has(host));
    const capacity = availableHosts.filter(host => copied.has(host)).map(host => ({
      host, free: freeRam(ns, host), cores: ns.getServer(host).cpuCores,
    })).sort((a, b) => Number(a.host === "home") - Number(b.host === "home") ||
      b.free - a.free || a.host.localeCompare(b.host));
    const minWorkerRam = Math.min(...Object.values(workerRam));
    const slots = Math.min(idle.length, capacity.reduce((total, runner) =>
      total + Math.floor(runner.free / minWorkerRam), 0
    ));
    for (let i = 0; i < slots; i++) {
      const target = idle[i];
      if (!ns.serverExists(target) || !ns.hasRootAccess(target)) continue;
      const budget = capacity.reduce((total, runner) =>
        total + (ns.serverExists(runner.host) ? freeRam(ns, runner.host) : 0), 0
      ) / (slots - i);
      const pids = launchPhase(ns, ns.getServer(target), capacity, budget, threadCap, workerRam);
      if (pids.length > 0) {
        jobs.set(target, pids);
        cursor = (selected.indexOf(target) + 1) % selected.length;
      }
    }
    const status = selected.length === 0 ? "Waiting for eligible targets; discovery continues." :
      slots === 0 && jobs.size === 0 && idle.length > 0 ? "Waiting for usable worker RAM; home keeps 4 GB reserved." : "";
    if (status && status !== lastStatus) ns.tprint(status);
    lastStatus = status;
    await ns.sleep(1000);
    refreshIn -= 1000;
  }
}

function rankTargets(ns, hosts) {
  const level = ns.getHackingLevel();
  return hosts.map(host => ns.getServer(host))
    .filter(server => server.hostname !== "home" && !server.purchasedByPlayer &&
      server.hasAdminRights && server.requiredHackingSkill <= level && server.moneyMax > 0)
    .map(server => {
      const score = server.moneyMax * ns.hackAnalyze(server.hostname) *
        ns.hackAnalyzeChance(server.hostname) / Math.max(0.001, ns.getHackTime(server.hostname) / 1000);
      return {
        hostname: server.hostname,
        score: Number.isFinite(score) ? Math.max(0, score) : 0,
        fallback: server.moneyMax / Math.max(1, server.minDifficulty),
      };
    }).sort((a, b) => b.score - a.score || b.fallback - a.fallback || a.hostname.localeCompare(b.hostname))
    .map(server => server.hostname);
}

function launchPhase(ns, server, capacity, budget, threadCap, workerRam) {
  const target = server.hostname;
  let action;
  let remaining;
  if (server.hackDifficulty > server.minDifficulty + 1) {
    action = "weaken";
    remaining = server.hackDifficulty - server.minDifficulty - 1;
  } else if (server.moneyAvailable < server.moneyMax * 0.90) {
    action = "grow";
    // shortcut: use a conservative $1 base for empty targets, remeasure after the phase.
    remaining = server.moneyAvailable > 0 ? Math.log(server.moneyMax / server.moneyAvailable) :
      Math.log(Math.max(2, server.moneyMax));
  } else {
    action = "hack";
    const fraction = ns.hackAnalyze(target);
    if (!Number.isFinite(fraction) || fraction <= 0) return [];
    // shortcut: one hack thread may exceed 10%, use batching for finer control later.
    remaining = Math.max(1, Math.floor(0.10 / fraction));
  }
  let cap = threadCap || Infinity;
  // A fair share smaller than one worker must still allow a target to make progress.
  budget = Math.max(budget, workerRam[action]);
  const pids = [];
  for (const { host, cores } of capacity) {
    if (remaining <= 1e-10 || cap < 1 || budget < workerRam[action]) break;
    if (!ns.serverExists(host) || !ns.hasRootAccess(host)) continue;
    let effect = 1;
    let needed = remaining;
    if (action === "weaken") {
      effect = ns.weakenAnalyze(1, cores);
      if (!Number.isFinite(effect) || effect <= 0) continue;
      needed = Math.ceil(remaining / effect);
    } else if (action === "grow") {
      needed = ns.growthAnalyze(target, Math.exp(remaining), cores);
      if (Number.isNaN(needed) || needed <= 0) continue;
      effect = remaining / needed;
      needed = Math.ceil(needed);
    }
    const threads = Math.min(needed, cap, Math.floor(budget / workerRam[action]),
      Math.floor(freeRam(ns, host) / workerRam[action]));
    if (threads < 1) continue;
    try {
      const pid = ns.exec(WORKERS[action], host, { threads, preventDuplicates: true }, target);
      if (!pid) {
        ns.print(`Could not launch ${action} for ${target} on ${host}; retrying.`);
        continue;
      }
      pids.push(pid);
      budget -= threads * workerRam[action];
      cap -= threads;
      remaining = Math.max(0, remaining - threads * effect);
      ns.print(`${action.toUpperCase()} ${target} on ${host}: ${threads} threads`);
    } catch (error) {
      ns.print(`WARN ${host}: ${action} launch failed: ${String(error)}`);
    }
  }
  return pids;
}
