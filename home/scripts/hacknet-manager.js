/** @param {NS} ns */
export async function main(ns) {
    const options = ns.flags([
        ["reserve", 100000],
        ["budget", 0.10],
        ["payback", 120],
        ["nodes", 20],
        ["help", false],
    ]);

    if (options.help) {
        ns.tprint("run /scripts/hacknet-manager.js --reserve 100000 --budget 0.1 --payback 120 --nodes 20");
        ns.tprint("reserve: dollars to keep; budget: fraction of spare cash per purchase");
        ns.tprint("payback: maximum repayment time in minutes; nodes: node count limit");
        return;
    }

    const reserve = Number(options.reserve);
    const budgetFraction = Number(options.budget);
    const maxPaybackMinutes = Number(options.payback);
    const maxNodes = Number(options.nodes);

    if (!Number.isFinite(reserve) || reserve < 0 ||
        !Number.isFinite(budgetFraction) || budgetFraction <= 0 || budgetFraction > 1 ||
        !Number.isFinite(maxPaybackMinutes) || maxPaybackMinutes <= 0 ||
        !Number.isInteger(maxNodes) || maxNodes < 1) {
        ns.tprint("Invalid settings. Run with --help for usage.");
        return;
    }

    if (ns.getHostname() !== "home") {
        ns.tprint("Run this script on home.");
        return;
    }

    const filename = ns.getScriptName().replace(/^\/+/, "");
    const processes = ns.ps("home");

    if (processes.find(p => p.pid === ns.pid)?.threads !== 1 ||
        processes.some(p =>
            p.pid !== ns.pid &&
            p.filename.replace(/^\/+/, "") === filename
        )) {
        ns.tprint("Run only one Hacknet manager, with one thread.");
        return;
    }

    ns.disableLog("ALL");
    ns.tprint(`Hacknet manager started. Reserve: $${reserve.toFixed(0)}; node limit: ${maxNodes}.`);

    while (true) {
        // Read fresh stats and prices on every pass.
        const count = ns.hacknet.numNodes();
        const stats = [];

        for (let i = 0; i < count; i++) {
            stats.push(ns.hacknet.getNodeStats(i));
        }

        if (stats.some(node => node.cache !== undefined)) {
            ns.tprint("This version manages money-producing Hacknet Nodes. Hash-producing Hacknet Servers need a different manager.");
            return;
        }

        const spareCash = Math.max(
            0,
            ns.getServerMoneyAvailable("home") - reserve
        );
        const budget = spareCash * budgetFraction;

        if (count === 0) {
            // Buy one starter node to measure actual production.
            // The payback filter applies after this first purchase.
            const cost = ns.hacknet.getPurchaseNodeCost();

            if (Number.isFinite(cost) && cost > 0 && cost <= budget) {
                const index = ns.hacknet.purchaseNode();

                if (index >= 0) {
                    ns.print(`Bought starter node ${index} for $${cost.toFixed(0)}.`);
                } else {
                    ns.print("Starter purchase failed; retrying later.");
                }
            } else {
                ns.print(`Waiting for starter node. Cost: $${cost.toFixed(0)}; budget: $${budget.toFixed(0)}.`);
            }
        } else {
            const candidates = getCandidates(ns, stats, maxNodes);

            const best = candidates
                .filter(action =>
                    Number.isFinite(action.cost) && action.cost > 0 &&
                    Number.isFinite(action.gain) && action.gain > 0 &&
                    action.cost <= budget &&
                    action.cost / action.gain <= maxPaybackMinutes * 60
                )
                .sort((a, b) => b.gain / b.cost - a.gain / a.cost)[0];

            if (best) {
                const success = buy(ns, best);

                if (success) {
                    const minutes = best.cost / best.gain / 60;

                    ns.print(`${best.label}: $${best.cost.toFixed(0)}, +$${best.gain.toFixed(2)}/sec, payback ${minutes.toFixed(1)} min.`);
                } else {
                    ns.print("Purchase failed; recalculating next pass.");
                }
            } else {
                ns.print(`Waiting: no purchase fits budget $${budget.toFixed(0)} and payback limit ${maxPaybackMinutes} min.`);
            }
        }

        // One purchase per pass; yield so the game can keep running.
        await ns.sleep(2000);
    }
}

function getCandidates(ns, stats, maxNodes) {
    const candidates = [];

    for (let i = 0; i < stats.length; i++) {
        const node = stats[i];

        // Extra income from one level, one RAM doubling, or one core.
        candidates.push(
            {
                type: "level",
                index: i,
                label: `Node ${i}: +1 level`,
                cost: ns.hacknet.getLevelUpgradeCost(i, 1),
                gain: node.production / node.level,
            },
            {
                type: "ram",
                index: i,
                label: `Node ${i}: RAM ${node.ram} -> ${node.ram * 2} GB`,
                cost: ns.hacknet.getRamUpgradeCost(i, 1),
                gain: node.production * (1.035 ** node.ram - 1),
            },
            {
                type: "core",
                index: i,
                label: `Node ${i}: +1 core`,
                cost: ns.hacknet.getCoreUpgradeCost(i, 1),
                gain: node.production / (node.cores + 5),
            },
        );
    }

    if (stats.length < maxNodes &&
        stats.length < ns.hacknet.maxNumNodes()) {
        const node = stats[0];

        // Estimate a new level-1, RAM-1, core-1 node's income.
        const baseProduction = node.production /
            (node.level * 1.035 ** (node.ram - 1) *
                ((node.cores + 5) / 6));

        candidates.push({
            type: "node",
            label: "Buy new node",
            cost: ns.hacknet.getPurchaseNodeCost(),
            gain: baseProduction,
        });
    }

    return candidates;
}

function buy(ns, action) {
    switch (action.type) {
        case "node":
            return ns.hacknet.purchaseNode() >= 0;
        case "level":
            return ns.hacknet.upgradeLevel(action.index, 1);
        case "ram":
            return ns.hacknet.upgradeRam(action.index, 1);
        case "core":
            return ns.hacknet.upgradeCore(action.index, 1);
        default:
            return false;
    }
}