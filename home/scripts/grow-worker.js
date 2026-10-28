/** @param {import("@ns").NS} ns */
export async function main(ns) {
  if (typeof ns.args[0] !== "string" || !ns.args[0]) {
    ns.tprint("Usage: run /scripts/grow-worker.js <target> [finish-at-ms]");
    return;
  }
  const reportPort = ns.args[2];
  let complete = false;
  if (reportPort !== undefined) {
    if (!Number.isSafeInteger(reportPort) || reportPort <= 0) { ns.tprint("Invalid report port."); return; }
    ns.atExit(() => {
      const self = ns.self();
      ns.tryWritePort(reportPort, { pid: self.pid, target: ns.args[0], money: self.onlineMoneyMade, xp: self.onlineExpGained, complete });
    });
  }
  if (ns.args[1] === undefined || ns.args[1] === 0 && reportPort !== undefined) {
    await ns.grow(ns.args[0]);
    complete = true;
    return;
  }
  const finishAt = ns.args[1];
  if (typeof finishAt !== "number" || !Number.isSafeInteger(finishAt) || finishAt <= 0) {
    ns.tprint("Invalid finish-at-ms; expected a positive integer timestamp.");
    return;
  }
  const additionalMsec = finishAt - Date.now() - ns.getGrowTime(ns.args[0]);
  if (!Number.isFinite(additionalMsec) || additionalMsec < 0) {
    ns.print("WARN grow: unreachable finish deadline; skipping action.");
    return;
  }
  await ns.grow(ns.args[0], { additionalMsec });
  complete = true;
}
