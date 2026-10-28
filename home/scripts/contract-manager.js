import { scanAllHosts } from "./network.js";
import { SOLVERS } from "./contracts.js";

const DISABLED_FILE = "/data/contract-disabled-types.txt";
const describe = value => JSON.stringify(value, (_, entry) => typeof entry === "bigint" ? entry.toString() : entry);

/** @param {import("@ns").NS} ns */
export async function main(ns) {
  if (ns.getHostname() !== "home" || ns.self().threads !== 1 || ns.args.length !== 0) {
    ns.tprint("Run /scripts/contract-manager.js on home with one thread and no arguments.");
    return;
  }
  if (ns.ps("home").some(p => p.pid !== ns.pid && p.filename.replace(/^\/+/, "") === "scripts/contract-manager.js")) {
    ns.tprint("The contract manager is already running.");
    return;
  }
  let disabled;
  try {
    const saved = ns.fileExists(DISABLED_FILE, "home") ? JSON.parse(ns.read(DISABLED_FILE)) : [];
    if (!Array.isArray(saved) || saved.some(type => typeof type !== "string" || type.length === 0)) {
      throw new Error("Expected a JSON array of nonempty contract type names");
    }
    disabled = new Set(saved);
  } catch (error) {
    ns.tprint(`Contract manager stopped: cannot load ${DISABLED_FILE}: ${String(error)}. Repair the file and restart.`);
    return;
  }
  ns.disableLog("ALL");
  ns.tprint(`Contract manager PID ${ns.pid}: ${Object.keys(SOLVERS).length} solver types, scanning every 30 seconds; submissions include the last attempt. Disabled: ${[...disabled].join(", ") || "none"}.`);
  const reported = new Set();
  const disable = async (type, message) => {
    disabled.add(type);
    ns.tprint(`${message}. Disabled ${type}; fix and test the solver, then stop the manager, clear its entry in ${DISABLED_FILE}, and restart.`);
    try {
      await ns.write(DISABLED_FILE, JSON.stringify([...disabled]), "w");
      if (ns.read(DISABLED_FILE) !== JSON.stringify([...disabled])) throw new Error("Disabled types were not saved");
      return true;
    } catch (error) {
      ns.tprint(`Contract manager stopped: cannot persist disabled types: ${String(error)}. Save ${JSON.stringify([...disabled])} to ${DISABLED_FILE} before restarting.`);
      return false;
    }
  };
  while (true) {
    let hosts;
    try {
      hosts = scanAllHosts(ns);
    } catch (error) {
      ns.print(`WARN contract discovery failed: ${String(error)}; retrying next pass.`);
      await ns.sleep(30000);
      continue;
    }
    for (const host of hosts) {
      let files;
      try {
        files = ns.ls(host, ".cct").filter(file => file.endsWith(".cct"));
      } catch (error) {
        ns.print(`WARN ${host}: contract listing failed: ${String(error)}`);
        continue;
      }
      for (const file of files) {
        let contract;
        try {
          contract = ns.codingcontract.getContract(file, host);
        } catch (error) {
          ns.print(`WARN ${host}/${file}: contract read failed: ${String(error)}`);
          continue;
        }
        const { type, data } = contract;
        if (disabled.has(type)) continue;
        if (!Object.hasOwn(SOLVERS, type)) {
          const key = JSON.stringify([host, file, type]);
          if (!reported.has(key)) {
            ns.print(`SKIP ${host}/${file}: unsupported contract type ${type}`);
            reported.add(key);
          }
          continue;
        }
        let answer;
        try {
          answer = SOLVERS[type](data);
        } catch (error) {
          if (!await disable(type, `SOLVER ERROR ${host}/${file} (${type}): ${String(error)}; input=${describe(data)}`)) return;
          continue;
        }
        let reward;
        try {
          if (contract.numTriesRemaining() <= 0) continue;
          reward = contract.submit(answer);
        } catch (error) {
          if (!await disable(type, `SUBMISSION ERROR ${host}/${file} (${type}): ${String(error)}; input=${describe(data)}; answer=${describe(answer)}`)) return;
          continue;
        }
        if (reward) ns.tprint(`SOLVED ${host}/${file} (${type}): ${reward}`);
        else if (!await disable(type, `FAILED ${host}/${file} (${type}); input=${describe(data)}; answer=${describe(answer)}`)) return;
      }
    }
    await ns.sleep(30000);
  }
}
