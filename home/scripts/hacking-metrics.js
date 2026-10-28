export const HACKING_METRICS = "/data/hacking-metrics.txt";

export function metricsWindow(now = Date.now()) {
  return { since: now, money: 0, xp: 0, ramSeconds: 0, idleRamSeconds: 0, homeSupportRamSeconds: 0,
    preparationSeconds: 0, completed: 0, cancelled: 0, recoveries: 0, reports: 0, missing: 0,
    farmXp: 0, farmRamSeconds: 0, farmPreemptions: 0, farmReports: 0, farmMissing: 0 };
}

export function acceptWorkerReport(report, owned, metrics) {
  const worker = owned.get(report?.pid);
  if (!worker || worker.reported || report.target !== worker.target || typeof report.complete !== "boolean" ||
      ![report.money, report.xp].every(n => Number.isFinite(n) && n >= 0)) return false;
  worker.reported = true;
  if (worker.farm) {
    metrics.farmXp += report.xp;
    metrics.farmReports++;
    if (!report.complete && !worker.preempted) metrics.farmMissing++;
    return true;
  }
  metrics.money += report.money;
  metrics.xp += report.xp;
  metrics.reports++;
  if (!report.complete) metrics.missing++;
  return true;
}
