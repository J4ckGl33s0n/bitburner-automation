/** @param {import("@ns").NS} ns */
export async function main(ns) {
  if (typeof ns.args[0] !== "string" || !ns.args[0]) {
    ns.tprint("Usage: run /scripts/grow-worker.js <target>");
    return;
  }
  await ns.grow(ns.args[0]);
}
