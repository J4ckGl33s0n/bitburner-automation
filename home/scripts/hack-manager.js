import { HACKING_METRICS, metricsWindow, acceptWorkerReport } from "./hacking-metrics.js";
import { WORKERS, findManagers, freeRam, getRunners, rootHosts, scanAllHosts } from "./network.js";

const GAP = 200;
const LAUNCH_ALLOWANCE = 1000;

function prepared(server) {
  return server.hackDifficulty <= server.minDifficulty + 0.000001 &&
    server.moneyAvailable >= server.moneyMax * 0.999;
}

/** @param {import("@ns").NS} ns */
export async function main(ns) {
  const maxTargets = Number(ns.args[0] ?? 0);
  const threadCap = Number(ns.args[1] ?? 0);
  const idleXp = Number(ns.args[2] ?? 0);
  if (!Number.isInteger(maxTargets) || maxTargets < 0 ||
      !Number.isInteger(threadCap) || threadCap < 0 || ![0, 1].includes(idleXp)) {
    ns.tprint("Usage: run /scripts/hack-manager.js [max-targets=0 (auto)] [thread-cap=0 (auto)] [idle-xp=0|1]");
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
  const owned = new Map();
  const preparing = new Set();
  let xpSequence = 0;
  const homeRequests = new Map();
  let homeExtra = 0;
  let metrics = metricsWindow();
  let lastSample = Date.now();
  const reset = ns.getResetInfo().lastAugReset;
  ns.clearPort(ns.pid);
  ns.atExit(() => {
    ns.clearPort(ns.pid);
    for (const worker of owned.values()) ns.kill(worker.pid);
  });
  ns.tprint(`Manager PID ${ns.pid} on ${ns.getHostname()}: ${maxTargets ? `manual cap ${maxTargets}` : "automatic"} targets, ${threadCap || "automatic"} threads per wave; ${maxTargets ? 10 : 90}% theft goal; idle XP ${idleXp ? "enabled" : "disabled"}; balanced money/XP, one batch per target; home reserve: 4 GB.`);
  const workerFiles = Object.values(WORKERS);
  // Recognise old workers during migration, but never take ownership of them.
  const workerNames = new Set([...workerFiles, "/scripts/hgw-worker.js"].map(file => file.slice(1)));
  let runners = [];
  let hosts = [];
  let ranked = [];
  let farmRanked = [];
  let refreshIn = 0;
  let cursor = 0;
  let lastSelection = "";
  let lastStatus = "";
  let lastAllocation = "";

  function recordJob(target, job) {
    if (job.cancelled) { metrics.cancelled++; metrics.missing++; }
    for (const worker of job.workers) owned.set(worker.pid, { ...worker, target, reported: false });
    if (job.workers.length) jobs.set(target, job);
  }

  const activeXp = () => [...owned.values()].filter(w => w.farm && !w.preempted && ns.isRunning(w.pid));
  function stopXp(worker) {
    if (!ns.kill(worker.pid)) return;
    worker.preempted = true;
    metrics.farmPreemptions++;
    ns.print(`XP ${worker.target}: reclaiming ${worker.ram.toFixed(2)} GB on ${worker.host}.`);
  }
  function clearGrowth(target) {
    for (const worker of activeXp().filter(w => w.target === target && w.action === "grow")) stopXp(worker);
    return !activeXp().some(w => w.target === target && w.action === "grow");
  }
  function reclaimRam(host, ram) {
    const required = ram + (host === "home" ? homeExtra : 0);
    for (const worker of activeXp().filter(w => w.host === host).sort((a, b) => a.ram - b.ram)) {
      if (freeRam(ns, host) + 1e-9 >= required) break;
      stopXp(worker);
    }
    return freeRam(ns, host) + 1e-9 >= required;
  }
  function recordXp(target, workers, preparation = false) {
    for (const worker of workers) owned.set(worker.pid, { ...worker, target, farm: true, preparation, reported: false });
    if (workers.length) ns.print(`XP ${target}: ${workers.reduce((sum, w) => sum + w.threads, 0)} ${preparation ? "preparation" : workers[0].action} threads.`);
  }

  while (true) {
    const now = Date.now();
    const seconds = Math.max(0, now - lastSample) / 1000;
    lastSample = now;
    metrics.ramSeconds += [...owned.values()].filter(w => !w.farm).reduce((sum, w) => sum + w.ram, 0) * seconds;
    metrics.farmRamSeconds += [...owned.values()].filter(w => w.farm && !w.preempted).reduce((sum, w) => sum + w.ram, 0) * seconds;
    metrics.homeSupportRamSeconds += [...owned.values()].filter(w => !w.farm && w.host === "home" && w.action !== "hack").reduce((sum, w) => sum + w.ram, 0) * seconds;
    metrics.preparationSeconds += preparing.size * seconds;
    for (let report = ns.readPort(ns.pid); report !== "NULL PORT DATA"; report = ns.readPort(ns.pid)) {
      if (report?.type === "home-ram") {
        const requester = ns.ps("home").find(p => p.pid === report.pid);
        if (requester?.threads === 1 && ["scripts/start.js", "scripts/startup-retry.js", "scripts/purchase-manager.js"].includes(requester.filename.replace(/^\/+/, "")) &&
            Number.isSafeInteger(report.pid) && report.pid > 0 && Number.isFinite(report.ram) && report.ram >= 4 && report.ram <= ns.getServerMaxRam("home")) {
          homeRequests.set(report.pid, { ram: report.ram, until: now + 5000 });
        }
      } else acceptWorkerReport(report, owned, metrics);
    }
    for (const [pid, request] of homeRequests) if (request.until <= now || !ns.isRunning(pid)) homeRequests.delete(pid);
    homeExtra = Math.max(4, ...[...homeRequests.values()].map(r => r.ram)) - 4;
    if (homeExtra) reclaimRam("home", 0);
    for (const [target, job] of jobs) {
      const active = job.workers.filter(worker => ns.isRunning(worker.pid));
      const interrupted = job.workers.some(worker => !ns.isRunning(worker.pid) &&
        worker.finishAt && Date.now() + 50 < worker.finishAt);
      if (interrupted) {
        for (const worker of active) ns.kill(worker.pid);
        jobs.delete(target);
        metrics.cancelled++; metrics.recoveries++;
        ns.print(`WARN BATCH ${target}: worker stopped early; cancelling owned workers and remeasuring.`);
      } else if (active.length > 0) continue;
      else {
        jobs.delete(target);
        if (job.batch) metrics.completed++;
        if (job.batch && ns.serverExists(target)) {
          const server = ns.getServer(target);
          if (!prepared(server)) metrics.recoveries++;
          ns.print(`BATCH ${target} complete: money ${server.moneyAvailable}/${server.moneyMax}, security ${server.hackDifficulty}/${server.minDifficulty}; ${prepared(server) ? "ready" : "recovering"}.`);
        }
      }
    }
    for (const [pid, worker] of owned) {
      if (ns.isRunning(pid)) continue;
      if (!worker.reported && !worker.preempted) {
        if (worker.farm) metrics.farmMissing++; else metrics.missing++;
      }
      owned.delete(pid);
    }
    if (refreshIn <= 0) {
      hosts = scanAllHosts(ns);
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
      const player = ns.fileExists("Formulas.exe", "home") ? ns.getPlayer() : null;
      ranked = rankTargets(ns, hosts, workerRam, threadCap, player, maxTargets ? 0.10 : 0.90);
      farmRanked = idleXp ? rankFarmTargets(ns, hosts, workerRam.grow, player) : [];
      refreshIn = 30000;
      lastSelection = "";
    }

    const availableHosts = runners.filter(host => ns.serverExists(host) && ns.hasRootAccess(host));
    const busy = new Set(jobs.keys());
    const externalBusy = new Set();
    for (const host of hosts.filter(host => ns.serverExists(host))) {
      for (const process of ns.ps(host)) {
        if (workerNames.has(process.filename.replace(/^\/+/, "")) && !owned.get(process.pid)?.farm) {
          busy.add(String(process.args[0]));
          if (!owned.has(process.pid)) externalBusy.add(String(process.args[0]));
        }
      }
    }
    const capacity = (reclaimable = true) => availableHosts.filter(host => copied.has(host)).map(host => ({
      host, free: Math.max(0, freeRam(ns, host) - (host === "home" ? homeExtra : 0)) + (reclaimable ? [...owned.values()].filter(w =>
        w.farm && w.host === host && ns.isRunning(w.pid)).reduce((sum, w) => sum + w.ram, 0) : 0),
      cores: ns.getServer(host).cpuCores,
    })).sort((a, b) => Number(a.host === "home") - Number(b.host === "home") ||
      b.free - a.free || a.host.localeCompare(b.host));
    const player = () => ns.fileExists("Formulas.exe", "home") ? ns.getPlayer() : null;
    // Finish owned work even when a refresh changes the ranking.
    let selected;
    if (maxTargets) {
      selected = [...new Set([...jobs.keys(), ...ranked.map(row => row.hostname)])].slice(0, maxTargets);
      for (const target of preparing) if (!selected.includes(target)) preparing.delete(target);
      const offset = selected.length ? cursor % selected.length : 0;
      const idle = [...selected.slice(offset), ...selected.slice(0, offset)].filter(host => !busy.has(host));
      const slots = Math.min(idle.length, capacity().reduce((total, runner) =>
        total + Math.floor(runner.free / Math.min(...Object.values(workerRam))), 0));
      for (let i = 0; i < slots; i++) {
        const target = idle[i];
        if (!ns.serverExists(target) || !ns.hasRootAccess(target)) continue;
        const runners = capacity();
        const budget = runners.reduce((sum, runner) => sum + runner.free, 0) / (slots - i);
        const server = ns.getServer(target);
        const plan = prepared(server) ? planBatch(ns, server, runners, budget, threadCap, workerRam, player()) : null;
        const action = server.hackDifficulty > server.minDifficulty + 0.000001 ? "weaken" :
          server.moneyAvailable < server.moneyMax * 0.999 ? "grow" : "hack";
        if (!plan && !runners.some(r => r.free + 1e-9 >= workerRam[action])) continue;
        if (!clearGrowth(target)) continue;
        if (prepared(server)) preparing.delete(target); else preparing.add(target);
        recordJob(target, plan ? launchBatch(ns, target, plan, workerRam, reclaimRam) : {
          batch: false, workers: launchPhase(ns, server, capacity(), budget, threadCap, workerRam, false, 0.10, reclaimRam),
        });
        if (jobs.has(target)) cursor = (selected.indexOf(target) + 1) % selected.length;
      }
    } else {
      for (const target of preparing) {
        if (!jobs.has(target) && (!ranked.some(row => row.hostname === target) || prepared(ns.getServer(target)))) preparing.delete(target);
      }
      const launchFallback = (target, budget) => {
        if (!target || busy.has(target) || !ns.serverExists(target) || !ns.hasRootAccess(target)) return;
        const server = ns.getServer(target);
        const action = server.hackDifficulty > server.minDifficulty + 0.000001 ? "weaken" :
          server.moneyAvailable < server.moneyMax * 0.999 ? "grow" : "hack";
        const runners = capacity();
        if (!runners.some(r => r.free + 1e-9 >= workerRam[action])) return;
        if (!clearGrowth(target)) return;
        recordJob(target, { batch: false, workers: launchPhase(ns, server, runners,
          budget, threadCap, workerRam, false, 0.90, reclaimRam) });
        if (jobs.has(target)) {
          busy.add(target);
          if (prepared(server)) preparing.delete(target); else preparing.add(target);
        }
      };
      const pending = [...preparing].filter(target => !busy.has(target));
      for (let i = 0; i < pending.length; i++) {
        launchFallback(pending[i], capacity().reduce((sum, r) => sum + r.free, 0) / (pending.length - i));
      }
      for (const row of ranked) {
        const target = row.hostname;
        if (busy.has(target) || !ns.serverExists(target) || !ns.hasRootAccess(target)) continue;
        const server = ns.getServer(target);
        if (!prepared(server)) continue;
        const runners = capacity();
        const budget = runners.reduce((sum, runner) => sum + runner.free, 0);
        const plan = planBatch(ns, server, runners, budget, threadCap, workerRam, player(), 0.90);
        if (!plan) continue;
        if (!clearGrowth(target)) continue;
        recordJob(target, launchBatch(ns, target, plan, workerRam, reclaimRam));
        if (jobs.has(target)) {
          busy.add(target);
          preparing.delete(target);
        }
      }
      const remaining = ranked.filter(row => !busy.has(row.hostname));
      for (let i = 0; i < remaining.length; i++) {
        launchFallback(remaining[i].hostname, capacity().reduce((sum, r) => sum + r.free, 0) / (remaining.length - i));
      }
      selected = [...jobs.keys()];
    }

    for (const worker of activeXp()) if (externalBusy.has(worker.target)) stopXp(worker);
    if (idleXp) {
      const target = farmRanked.find(row => !selected.includes(row.hostname) && !externalBusy.has(row.hostname) &&
        ns.serverExists(row.hostname) && ns.hasRootAccess(row.hostname))?.hostname;
      if (target) {
        const server = ns.getServer(target);
        if (!(server.moneyAvailable >= server.moneyMax && prepared(server)) &&
            !activeXp().some(w => w.target === target && (w.preparation || w.action === "grow"))) {
          const action = server.hackDifficulty > server.minDifficulty + 0.000001 ? "weaken" : "grow";
          const cap = threadCap ? Math.max(0, threadCap - activeXp().filter(w => w.target === target && w.action === action)
            .reduce((sum, w) => sum + w.threads, 0)) : Infinity;
          const runners = capacity(false);
          if (cap >= 1) recordXp(target, launchPhase(ns, server, runners,
            runners.reduce((sum, runner) => sum + runner.free, 0), Number.isFinite(cap) ? cap : 0, workerRam, true), true);
        }
      }
      const grow = farmRanked.find(row => {
        if (selected.includes(row.hostname) || externalBusy.has(row.hostname) ||
            !ns.serverExists(row.hostname) || !ns.hasRootAccess(row.hostname)) return false;
        const server = ns.getServer(row.hostname);
        return prepared(server) && server.moneyAvailable >= server.moneyMax;
      });
      const filler = grow ?? farmRanked.find(row => !externalBusy.has(row.hostname) &&
        ns.serverExists(row.hostname) && ns.hasRootAccess(row.hostname));
      if (filler) {
        const action = grow ? "grow" : "weaken";
        const cap = threadCap ? Math.max(0, threadCap - activeXp().filter(w => w.target === filler.hostname && w.action === action)
          .reduce((sum, w) => sum + w.threads, 0)) : Infinity;
        recordXp(filler.hostname, launchXpFill(ns, filler.hostname, action, capacity(false), cap, workerRam, ++xpSequence));
      }
    }
    if (selected.join(",") !== lastSelection) {
      lastSelection = selected.join(",");
      ns.print(`Selected targets (balanced money/XP): ${selected.join(", ") || "none"}`);
      for (const target of selected) {
        const row = ranked.find(row => row.hostname === target);
        if (row) ns.print(`${target}: score ${row.score.toFixed(3)}, money/GB/s ${row.moneyEfficiency.toFixed(2)}, ${row.method === "Formulas" ? "XP" : "relative XP"}/GB/s ${row.xpEfficiency.toFixed(4)}, chance ${(row.chance * 100).toFixed(1)}%, ${row.seconds.toFixed(2)}s, ${row.ram.toFixed(2)} GB (${row.method}).`);
      }
    }
    const allocation = `${jobs.size} money targets, ${[...owned.values()].filter(w => !w.farm && ns.isRunning(w.pid)).reduce((sum, w) => sum + w.threads, 0)} money threads, ${activeXp().reduce((sum, w) => sum + w.threads, 0)} XP threads`;
    if (allocation !== lastAllocation) ns.print(`ALLOCATION ${maxTargets ? "manual caps" : "automatic"}: ${allocation}.`);
    lastAllocation = allocation;
    const waiting = ranked.find(row => !selected.includes(row.hostname) && !externalBusy.has(row.hostname));
    const status = ranked.length === 0 ? "Waiting for eligible targets; discovery continues." :
      jobs.size === 0 || !maxTargets && waiting ? "Waiting for usable worker RAM; home keeps 4 GB reserved." : "";
    if (status && status !== lastStatus) ns.tprint(status);
    lastStatus = status;
    const idleRam = availableHosts.reduce((sum, host) => sum + freeRam(ns, host), 0);
    metrics.idleRamSeconds += idleRam * seconds;
    if (now - metrics.since >= 30000) {
      const elapsed = (now - metrics.since) / 1000;
      const usable = idleRam + [...owned.values()].filter(w => ns.isRunning(w.pid)).reduce((sum, w) => sum + w.ram, 0);
      const demand = Math.max(0, selected.reduce((sum, target) => sum + (ranked.find(r => r.hostname === target)?.ram ?? 0), 0) +
        (!maxTargets ? waiting?.ram ?? 0 : 0) - usable);
      const snapshot = { ...metrics, pid: ns.pid, host: ns.getHostname(), reset, timestamp: now,
        seconds: elapsed, complete: metrics.missing === 0 && metrics.reports > 0, demand,
        idleRam: metrics.idleRamSeconds / elapsed, homeSupportRam: metrics.homeSupportRamSeconds / elapsed };
      ns.print(`METRICS ${snapshot.complete ? "complete" : "incomplete"}: ${(metrics.money / elapsed).toFixed(2)}/sec, ${(metrics.xp / elapsed).toFixed(2)} XP/sec; ${metrics.ramSeconds.toFixed(1)} GB-seconds, idle ${snapshot.idleRam.toFixed(1)} GB, prep ${metrics.preparationSeconds.toFixed(1)} target-seconds; batches ${metrics.completed}, cancellations ${metrics.cancelled}, recoveries ${metrics.recoveries}, missing reports ${metrics.missing}. Ranking estimates remain separate.`);
      if (idleXp) ns.print(`XP METRICS: ${(metrics.farmXp / elapsed).toFixed(2)} XP/sec; ${metrics.farmRamSeconds.toFixed(1)} GB-seconds, worker preemptions ${metrics.farmPreemptions}, missing reports ${metrics.farmMissing}. Excluded from money investment metrics.`);
      try {
        const text = JSON.stringify(snapshot);
        await ns.write(HACKING_METRICS, text, "w");
        if (ns.read(HACKING_METRICS) !== text) throw new Error("Metrics write failed");
        if (ns.getHostname() !== "home" && !await ns.scp(HACKING_METRICS, "home", ns.getHostname())) throw new Error("Metrics copy to home failed");
      } catch (error) { ns.print(`WARN metrics: ${String(error)}; buyers will reject stale data.`); }
      metrics = metricsWindow(now);
    }
    await ns.sleep(100);
    refreshIn -= 100;
  }
}

export function rankFarmTargets(ns, hosts, growRam, player = null) {
  if (player && !ns.fileExists("Formulas.exe", "home")) player = null;
  const rows = [];
  for (const hostname of hosts) {
    try {
      const server = ns.getServer(hostname);
      if (hostname === "home" || server.purchasedByPlayer || !server.hasAdminRights || !(server.moneyMax > 0)) continue;
      const snapshot = { ...server, moneyAvailable: server.moneyMax, hackDifficulty: server.minDifficulty };
      const exp = player ? ns.formulas.hacking.hackExp(snapshot, player) :
        (server.baseDifficulty ? 3 + 0.3 * server.baseDifficulty : 0);
      if (exp === 0) continue;
      const seconds = (player ? ns.formulas.hacking.growTime(snapshot, player) : ns.getGrowTime(hostname)) / 1000;
      const efficiency = exp / (growRam * seconds);
      if (!Number.isFinite(efficiency) || efficiency <= 0 || !Number.isFinite(seconds) || seconds <= 0 || !(growRam > 0)) {
        throw new Error("Invalid farm estimate");
      }
      rows.push({ hostname, efficiency });
    } catch (error) {
      ns.print(`WARN ${hostname}: farm estimate failed: ${String(error)}`);
      if (player) rows.push(...rankFarmTargets(ns, [hostname], growRam));
    }
  }
  return rows.sort((a, b) => b.efficiency - a.efficiency || a.hostname.localeCompare(b.hostname));
}

export function rankTargets(ns, hosts, workerRam, threadCap = 0, player = null, hackGoal = 0.10) {
  if (player && !ns.fileExists("Formulas.exe", "home")) player = null;
  const level = ns.getHackingLevel();
  const rows = [];
  for (const host of hosts) {
    try {
      const server = ns.getServer(host);
      if (host === "home" || server.purchasedByPlayer || !server.hasAdminRights ||
          !(server.requiredHackingSkill <= level) || !(server.moneyMax > 0)) continue;
      const snapshot = { ...server, moneyAvailable: server.moneyMax };
      if (player) snapshot.hackDifficulty = server.minDifficulty;
      const stats = batchStats(ns, snapshot, player);
      const exp = player ? ns.formulas.hacking.hackExp(snapshot, player) :
        (server.baseDifficulty ? 3 + 0.3 * server.baseDifficulty : 0);
      let ram = workerRam.weaken;
      let seconds = stats.times.weaken / 1000;
      let money = 0;
      let xp = exp;
      if (stats.fraction > 0 && stats.fraction <= 1) {
        let hacks = Math.min(threadCap || Infinity, Math.max(1, Math.floor(hackGoal / stats.fraction)));
        let grows;
        let weakens;
        while (true) {
          grows = player ? ns.formulas.hacking.growThreads({ ...snapshot,
            moneyAvailable: snapshot.moneyAvailable * Math.max(0, 1 - hacks * stats.fraction),
          }, player, snapshot.moneyMax, 1) :
            Math.ceil(growRequired(snapshot, hacks, stats.fraction) / stats.growEffect(1));
          if (!Number.isFinite(grows) || grows < 0) throw new Error("Invalid growth estimate");
          grows = Math.max(1, grows);
          weakens = [Math.ceil(ns.hackAnalyzeSecurity(hacks) / ns.weakenAnalyze(1)),
            Math.ceil(ns.growthAnalyzeSecurity(grows) / ns.weakenAnalyze(1))];
          if (!threadCap || Math.max(grows, ...weakens) <= threadCap || hacks === 1) break;
          hacks = Math.max(1, Math.floor(hacks / 2));
        }
        ram = hacks * workerRam.hack + grows * workerRam.grow +
          (weakens[0] + weakens[1]) * workerRam.weaken;
        seconds = (Math.max(...Object.values(stats.times)) + LAUNCH_ALLOWANCE + 3 * GAP) / 1000;
        if (threadCap && Math.max(grows, ...weakens) > threadCap) {
          seconds = (stats.times.hack + Math.ceil(grows / threadCap) * stats.times.grow +
            weakens.reduce((sum, threads) => sum + Math.ceil(threads / threadCap) * stats.times.weaken, 0)) / 1000;
        }
        money = server.moneyMax * Math.min(1, hacks * stats.fraction) * stats.chance;
        xp = exp * (hacks * (stats.chance + (1 - stats.chance) / 4) + grows + weakens[0] + weakens[1]);
      }
      const moneyEfficiency = money / (ram * seconds);
      const xpEfficiency = xp / (ram * seconds);
      if (![ram, seconds, stats.chance, moneyEfficiency, xpEfficiency].every(Number.isFinite) ||
          ram <= 0 || seconds <= 0 || stats.chance < 0 || stats.chance > 1 || moneyEfficiency < 0 || xpEfficiency < 0) {
        throw new Error("Invalid target estimate");
      }
      rows.push({ hostname: host, moneyEfficiency, xpEfficiency, ram, seconds,
        chance: stats.chance, method: player ? "Formulas" : "approximate", score: 0 });
    } catch (error) {
      ns.print(`WARN ${host}: target estimate failed: ${String(error)}`);
      if (player) rows.push(...rankTargets(ns, [host], workerRam, threadCap, null, hackGoal));
    }
  }
  const bestMoney = Math.max(0, ...rows.map(row => row.moneyEfficiency));
  const bestXp = Math.max(0, ...rows.map(row => row.xpEfficiency));
  for (const row of rows) row.score = 0.5 * (bestMoney ? row.moneyEfficiency / bestMoney : 0) +
    0.5 * (bestXp ? row.xpEfficiency / bestXp : 0);
  return rows.sort((a, b) => b.score - a.score || b.moneyEfficiency - a.moneyEfficiency ||
    b.xpEfficiency - a.xpEfficiency || a.hostname.localeCompare(b.hostname));
}

function batchStats(ns, server, player) {
  const target = server.hostname;
  const stats = {
    fraction: player ? ns.formulas.hacking.hackPercent(server, player) : ns.hackAnalyze(target),
    chance: player ? ns.formulas.hacking.hackChance(server, player) : ns.hackAnalyzeChance(target),
    times: {
      hack: player ? ns.formulas.hacking.hackTime(server, player) : ns.getHackTime(target),
      grow: player ? ns.formulas.hacking.growTime(server, player) : ns.getGrowTime(target),
      weaken: player ? ns.formulas.hacking.weakenTime(server, player) : ns.getWeakenTime(target),
    },
    // Ignore grow's additive dollars, guaranteeing enough multiplicative growth across mixed cores.
    growEffect: cores => player ? Math.log(ns.formulas.hacking.growPercent(server, 1, player, cores)) :
      1 / ns.growthAnalyze(target, Math.E, cores),
  };
  if (player && (![stats.fraction, stats.chance, ...Object.values(stats.times), stats.growEffect(1)].every(Number.isFinite) ||
      stats.fraction < 0 || stats.fraction > 1 || stats.chance < 0 || stats.chance > 1 ||
      Object.values(stats.times).some(time => time <= 0) || stats.growEffect(1) <= 0)) {
    throw new Error("Invalid Formulas batch estimate");
  }
  return stats;
}

function growRequired(server, hacks, fraction) {
  const moneyAfter = server.moneyAvailable * Math.max(0, 1 - hacks * fraction);
  return moneyAfter > 0 ? Math.log(server.moneyMax / moneyAfter) * 1.01 : Math.log(Math.max(2, server.moneyMax));
}

export function planBatch(ns, server, capacity, budget, threadCap, workerRam, player = null, hackGoal = 0.10) {
  if (player && ns.fileExists("Formulas.exe", "home")) {
    try { return batchPlan(ns, server, capacity, budget, threadCap, workerRam, player, hackGoal); }
    catch (error) { ns.print(`WARN ${server.hostname}: Formulas batch failed; using ordinary analysis: ${String(error)}`); }
  }
  return batchPlan(ns, server, capacity, budget, threadCap, workerRam, null, hackGoal);
}

function batchPlan(ns, server, capacity, budget, threadCap, workerRam, player, hackGoal) {
  const stats = batchStats(ns, server, player);
  if (!Number.isFinite(stats.fraction) || stats.fraction <= 0 || stats.fraction > 1 ||
      !Object.values(stats.times).every(time => Number.isFinite(time) && time > 0)) return null;
  let hacks = Math.min(threadCap || Infinity, Math.max(1, Math.floor(hackGoal / stats.fraction)));
  while (true) {
    const slots = capacity.map(runner => ({ ...runner }));
    const plan = [];
    let remainingBudget = budget;
    function allocate(action, remaining, effectFor, wave) {
      let cap = threadCap || Infinity;
      for (const runner of slots) {
        const effect = effectFor(runner.cores);
        if (!Number.isFinite(effect) || effect <= 0) {
          if (player) throw new Error("Invalid Formulas allocation effect");
          continue;
        }
        const threads = Math.min(Math.ceil(remaining / effect), cap,
          Math.floor((runner.free + 1e-9) / workerRam[action]), Math.floor((remainingBudget + 1e-9) / workerRam[action]));
        if (threads < 1) continue;
        plan.push({ action, wave, host: runner.host, threads });
        runner.free -= threads * workerRam[action];
        remainingBudget -= threads * workerRam[action];
        cap -= threads;
        remaining -= threads * effect;
        if (remaining <= 1e-10) return true;
      }
      return false;
    }
    if (allocate("hack", hacks, () => 1, 0) &&
        allocate("weaken", ns.hackAnalyzeSecurity(hacks), cores => ns.weakenAnalyze(1, cores), 1) &&
        allocate("grow", growRequired(server, hacks, stats.fraction), stats.growEffect, 2) &&
        allocate("weaken", ns.growthAnalyzeSecurity(plan.filter(part => part.action === "grow")
          .reduce((sum, part) => sum + part.threads, 0)), cores => ns.weakenAnalyze(1, cores), 3)) return plan;
    if (hacks === 1) return null;
    hacks = Math.max(1, Math.floor(hacks / 2));
  }
}

function launchBatch(ns, target, plan, workerRam, reclaimRam) {
  const workers = [];
  const times = { hack: ns.getHackTime(target), grow: ns.getGrowTime(target), weaken: ns.getWeakenTime(target) };
  const firstFinish = Math.ceil(Date.now() + Math.max(...Object.values(times)) + LAUNCH_ALLOWANCE);
  try {
    for (const part of plan) {
      const finishAt = firstFinish + part.wave * GAP;
      if (!reclaimRam(part.host, part.threads * workerRam[part.action])) throw new Error(`RAM unavailable on ${part.host}`);
      const pid = ns.exec(WORKERS[part.action], part.host,
        { threads: part.threads, temporary: true, preventDuplicates: true }, target, finishAt, ns.pid);
      if (!pid) throw new Error(`${part.action} on ${part.host} could not start`);
      workers.push({ pid, finishAt, host: part.host, action: part.action, threads: part.threads, ram: part.threads * workerRam[part.action] });
    }
    ns.print(`BATCH ${target}: ${plan.map(part => `${part.action}:${part.threads}@${part.host}`).join(" ")}; finishes ${firstFinish}/${firstFinish + GAP}/${firstFinish + 2 * GAP}/${firstFinish + 3 * GAP}.`);
  } catch (error) {
    for (const worker of workers) ns.kill(worker.pid);
    workers.length = 0;
    ns.print(`WARN BATCH ${target}: ${String(error)}; cancelled owned workers, retrying after remeasurement.`);
    return { workers, batch: true, cancelled: true };
  }
  return { workers, batch: true };
}

function launchPhase(ns, server, capacity, budget, threadCap, workerRam, farm = false, hackGoal = 0.10, reclaimRam = null) {
  const target = server.hostname;
  let action;
  let remaining;
  if (server.hackDifficulty > server.minDifficulty + 0.000001) {
    action = "weaken";
    remaining = server.hackDifficulty - server.minDifficulty;
  } else if (farm || server.moneyAvailable < server.moneyMax * 0.999) {
    action = "grow";
    // shortcut: use a conservative $1 base for empty targets, remeasure after the phase.
    remaining = farm && server.moneyAvailable >= server.moneyMax ? Infinity :
      server.moneyAvailable > 0 ? Math.log(server.moneyMax / server.moneyAvailable) : Math.log(Math.max(2, server.moneyMax));
    if (farm) remaining = Math.max(1e-9, remaining);
  } else {
    action = "hack";
    const fraction = ns.hackAnalyze(target);
    if (!Number.isFinite(fraction) || fraction <= 0) return [];
    // One thread can exceed the goal; subsequent preparation restores the actual state.
    remaining = Math.max(1, Math.floor(hackGoal / fraction));
  }
  let cap = threadCap || Infinity;
  // A fair share smaller than one worker must still allow a target to make progress.
  budget = Math.max(budget, workerRam[action]);
  let exactThreads = null;
  if (action === "grow" && Number.isFinite(remaining) && ns.fileExists("Formulas.exe", "home")) {
    try {
      const currentPlayer = ns.getPlayer();
      for (const runner of capacity) {
        if (!ns.serverExists(runner.host) || !ns.hasRootAccess(runner.host)) continue;
        const needed = ns.formulas.hacking.growThreads({ ...server }, currentPlayer, server.moneyMax, runner.cores);
        if (Number.isSafeInteger(needed) && needed > 0 && needed <= cap &&
            needed * workerRam.grow <= Math.min(budget, reclaimRam ? runner.free : freeRam(ns, runner.host)) + 1e-9) {
          exactThreads = needed;
          capacity = [runner];
          break;
        }
      }
    } catch (error) { ns.print(`WARN ${target}: Formulas preparation failed; using ordinary analysis: ${String(error)}`); }
  }
  const pids = [];
  for (const { host, cores, free } of capacity) {
    if (remaining <= 1e-10 || cap < 1 || budget < workerRam[action]) break;
    if (!ns.serverExists(host) || !ns.hasRootAccess(host)) continue;
    let effect = 1;
    let needed = remaining;
    if (action === "weaken") {
      effect = ns.weakenAnalyze(1, cores);
      if (!Number.isFinite(effect) || effect <= 0) continue;
      needed = Math.ceil(remaining / effect);
    } else if (action === "grow" && Number.isFinite(remaining)) {
      needed = exactThreads ?? ns.growthAnalyze(target, Math.exp(remaining), cores);
      if (Number.isNaN(needed) || needed <= 0) continue;
      effect = remaining / needed;
      needed = Math.ceil(needed);
    }
    const threads = Math.min(needed, cap, Math.floor((budget + 1e-9) / workerRam[action]),
      Math.floor(((reclaimRam ? free : Math.min(free, freeRam(ns, host))) + 1e-9) / workerRam[action]));
    if (threads < 1) continue;
    try {
      if (reclaimRam && !reclaimRam(host, threads * workerRam[action])) continue;
      const pid = ns.exec(WORKERS[action], host, { threads, temporary: true, preventDuplicates: true }, target, 0, ns.pid);
      if (!pid) {
        ns.print(`Could not launch ${action} for ${target} on ${host}; retrying.`);
        continue;
      }
      pids.push({ pid, finishAt: 0, host, action, threads, ram: threads * workerRam[action] });
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

function launchXpFill(ns, target, action, capacity, cap, workerRam, token) {
  const workers = [];
  for (const { host, free } of capacity) {
    if (cap < 1) break;
    if (!ns.serverExists(host) || !ns.hasRootAccess(host)) continue;
    const threads = Math.min(cap, Math.floor((Math.min(free, freeRam(ns, host)) + 1e-9) / workerRam[action]));
    if (threads < 1) continue;
    try {
      const pid = ns.exec(WORKERS[action], host, { threads, temporary: true, preventDuplicates: true }, target, 0, ns.pid, token);
      if (!pid) { ns.print(`WARN XP ${target}: ${action} launch failed on ${host}; retrying.`); continue; }
      workers.push({ pid, finishAt: 0, host, action, threads, ram: threads * workerRam[action] });
      cap -= threads;
    } catch (error) { ns.print(`WARN XP ${target}: ${String(error)}; retrying.`); }
  }
  return workers;
}
