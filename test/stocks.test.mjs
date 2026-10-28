import assert from "node:assert/strict";
import test from "node:test";
import { main, tradeStocks } from "../home/scripts/stock-manager.js";
import { publishStockPolicy, PURCHASE_MANAGER, STOCK_MANAGER } from "../home/scripts/spending.js";

const STOP = Symbol("stop");
function game() {
  const g = { money: 1000000000, commission: 100000, tix: true, fourS: true,
    rows: new Map(), trades: [], logs: [], ports: new Map(), processes: [
      { pid: 7, filename: STOCK_MANAGER, threads: 1 }], host: "home", reserve: 100000, updates: 0 };
  g.add = (symbol, overrides = {}) => g.rows.set(symbol, {
    longs: 0, shorts: 0, shortPrice: 0, bid: 100, ask: 101, forecast: 0.7, volatility: 0.02,
    max: 100000000, ...overrides,
  });
  const row = s => g.rows.get(s);
  g.ns = {
    pid: 7, flags: schema => ({ ...Object.fromEntries(schema), reserve: g.reserve, _: g.args ?? [] }),
    getHostname: () => g.host, self: () => g.processes.find(p => p.pid === 7), ps: () => g.processes,
    getServerMoneyAvailable: () => g.money, print: msg => g.logs.push(msg), tprint: msg => g.logs.push(msg),
    disableLog: () => {}, atExit: fn => { g.exit = fn; },
    clearPort: pid => g.ports.delete(pid), peek: pid => g.ports.get(pid) ?? "NULL PORT DATA",
    writePort: (pid, data) => { g.ports.set(pid, data); return true; },
    sleep: async ms => { assert.equal(ms, 30000); g.onSleep?.(); throw STOP; },
    stock: {
      hasTixApiAccess: () => g.tix, has4SDataTixApi: () => g.fourS,
      getConstants: () => ({ StockMarketCommission: g.commission }),
      getSymbols: () => [...g.rows.keys()],
      getPosition: s => [row(s).longs, 90, row(s).shorts, row(s).shortPrice],
      getBidPrice: s => row(s).bid, getAskPrice: s => row(s).ask,
      getForecast: s => row(s).forecast, getVolatility: s => row(s).volatility,
      getMaxShares: s => row(s).max,
      buyStock: (s, shares) => {
        assert.ok(Number.isSafeInteger(shares) && shares > 0);
        if (g.failBuy) return 0;
        const cost = shares * row(s).ask + g.commission;
        assert.ok(cost <= g.money);
        assert.ok(shares + row(s).longs + row(s).shorts <= row(s).max);
        g.trades.push({ type: "buy", symbol: s, shares, cost, before: g.money });
        g.money -= cost;
        row(s).longs += shares;
        return row(s).ask;
      },
      sellStock: (s, shares) => {
        if (g.failSell) return 0;
        g.trades.push({ type: "sell", symbol: s, shares });
        g.money += shares * row(s).bid - g.commission;
        row(s).longs -= shares;
        return row(s).bid;
      },
      nextUpdate: async () => { g.updates++; g.onUpdate?.(); throw STOP; },
    },
  };
  g.policy = (changes = {}) => g.ports.set(7, {
    spendingPid: 1, protectedCash: 10000000, ready: true, timestamp: Date.now(), ...changes,
  });
  return g;
}

test("4S longs use forecast hysteresis, sell first, and rank edge with deterministic ties", () => {
  const g = game();
  g.add("held", { longs: 10000, forecast: 0.50 });
  g.add("hold", { longs: 10000, forecast: 0.51 });
  g.add("weak", { forecast: 0.599 });
  g.add("Z"); g.add("A");
  tradeStocks(g.ns);
  assert.equal(g.trades[0].type, "sell");
  assert.equal(g.trades[0].symbol, "held");
  assert.equal(g.trades[1].symbol, "A");
  assert.ok(!g.trades.some(t => ["weak", "hold"].includes(t.symbol)));
  const h = game();
  h.add("low", { forecast: 0.60 }); h.add("high", { forecast: 0.9 });
  tradeStocks(h.ns);
  assert.equal(h.trades[0].symbol, "high");
});

test("purchase costs stay within the 10% allocation and reserve at exact boundaries", () => {
  const g = game();
  g.add("A");
  tradeStocks(g.ns, 500000000);
  assert.equal(g.trades[0].shares, Math.floor((50000000 - g.commission) / 101));
  assert.ok(g.trades[0].cost <= 50000000);
  assert.ok(g.money >= 500000000);
  const count = g.trades.length;
  tradeStocks(g.ns, 999999999);
  assert.equal(g.trades.length, count, "no forced rebalancing or buys above the cap");
  const h = game();
  h.money = 100000; h.add("A");
  tradeStocks(h.ns);
  assert.equal(h.trades.length, 0);
});

test("spread and two commissions must be covered by the 30-tick estimate", () => {
  for (const overrides of [{ volatility: 0.000001 }, { ask: 200 }, { max: 1 }, { volatility: 0 }]) {
    const g = game(); g.add("A", overrides); tradeStocks(g.ns);
    assert.equal(g.trades.length, 0);
  }
  const g = game(); g.add("A", { max: 50000, forecast: 0.60 }); tradeStocks(g.ns);
  assert.equal(g.trades[0].shares, 50000);
});

test("manual longs and short collateral consume allocation; shorts are never traded", () => {
  for (const existing of [{ longs: 2000000 }, { shorts: 2000000, shortPrice: 100 }]) {
    const g = game(); g.add("manual", { forecast: 0.55, ...existing }); g.add("A");
    tradeStocks(g.ns);
    assert.equal(g.trades.length, 0);
    assert.equal(g.rows.get("manual").shorts, existing.shorts ?? 0);
  }
});

test("invalid quotes and holdings cannot turn into spare allocation", () => {
  for (const invalid of [{ bid: NaN }, { ask: Infinity }, { longs: -1 }, { shorts: 1.5 },
    { forecast: 1.1 }, { volatility: -1 }, { shortPrice: NaN }, { bid: 200, ask: 100 }]) {
    const g = game(); g.add("bad", invalid); g.add("A"); tradeStocks(g.ns);
    assert.equal(g.trades.length, 0);
  }
  const g = game(); g.commission = NaN;
  assert.throws(() => tradeStocks(g.ns), /commission/);
});

test("active spender policies protect custom reserves and savings and reject stale or mismatched records", () => {
  for (const changes of [null, { ready: false }, { ready: "yes" }, { protectedCash: -1 },
    { spendingPid: 2 }, { timestamp: Date.now() - 10001 }, { timestamp: Date.now() + 60000 }]) {
    const g = game(); g.add("A");
    g.processes.push({ pid: 1, filename: PURCHASE_MANAGER, threads: 1 });
    if (changes) g.policy(changes);
    tradeStocks(g.ns);
    assert.equal(g.trades.length, 0, JSON.stringify(changes));
  }
  const g = game(); g.add("A");
  g.processes.push({ pid: 1, filename: PURCHASE_MANAGER, threads: 1 });
  g.policy({ protectedCash: 800000000 });
  tradeStocks(g.ns);
  assert.ok(g.trades[0].cost <= 20000000);
  g.processes[1].pid = 2;
  const count = g.trades.length;
  tradeStocks(g.ns);
  assert.equal(g.trades.length, count);
});

test("paused buying still permits exits, failed trades retry, and cash is rechecked after sales", () => {
  const g = game(); g.add("exit", { longs: 20000, forecast: 0.4 }); g.add("A");
  g.processes.push({ pid: 1, filename: PURCHASE_MANAGER, threads: 1 });
  g.policy({ ready: false }); tradeStocks(g.ns);
  assert.deepEqual(g.trades.map(t => t.type), ["sell"]);
  const h = game(); h.add("A"); h.failBuy = true; tradeStocks(h.ns);
  assert.equal(h.trades.length, 0);
  h.failBuy = false; tradeStocks(h.ns); assert.equal(h.trades.length, 1);
  const j = game(); j.add("exit", { longs: 20000, forecast: 0.4 }); j.failSell = true;
  tradeStocks(j.ns); assert.equal(j.trades.length, 0);
  j.failSell = false; tradeStocks(j.ns); assert.equal(j.trades.length, 1);
  const k = game(); k.add("A");
  k.ns.stock.getMaxShares = () => { k.money = 100000; return 100000000; };
  tradeStocks(k.ns); assert.equal(k.trades.length, 0);
});

test("publisher targets only stock PID ports and policies follow the active spender", () => {
  const g = game();
  g.processes.push({ pid: 1, filename: PURCHASE_MANAGER, threads: 1 });
  g.ports.set(1, "program reply");
  publishStockPolicy({ ...g.ns, pid: 1 }, 123456, false);
  assert.equal(g.ports.get(7).protectedCash, 123456);
  assert.equal(g.ports.get(7).ready, false);
  assert.equal(g.ports.get(1), "program reply");
  publishStockPolicy({ ...g.ns, pid: 1 }, 789012, true);
  assert.equal(g.ports.get(7).protectedCash, 789012);
});

test("entrypoint rejects invalid commands and pauses safely without unlocked APIs", async () => {
  for (const invalid of ["host", "threads", "duplicate", "reserve", "args"]) {
    const g = game();
    if (invalid === "host") g.host = "remote";
    if (invalid === "threads") g.processes[0].threads = 2;
    if (invalid === "duplicate") g.processes.push({ pid: 9, filename: "scripts/stock-manager.js" });
    if (invalid === "reserve") g.reserve = -1;
    if (invalid === "args") g.args = ["unexpected"];
    await main(g.ns); assert.equal(g.updates, 0); assert.equal(g.exit, undefined);
  }
  for (const missing of ["tix", "fourS"]) {
    const g = game(); g[missing] = false;
    g.ns.stock.getSymbols = () => { throw new Error("locked API called"); };
    await assert.rejects(main(g.ns), e => e === STOP);
    assert.equal(g.updates, 0);
    assert.ok(g.logs.some(l => l.includes("trading paused")));
  }
});

test("manager trades immediately, preserves holdings on stop, and reconstructs them on reload", async () => {
  const g = game(); g.add("A");
  await assert.rejects(main(g.ns), e => e === STOP);
  assert.equal(g.updates, 1); assert.equal(g.trades.length, 1);
  g.exit(); assert.equal(g.ports.has(7), false);
  assert.ok(g.rows.get("A").longs > 0);
  g.rows.get("A").forecast = 0.4;
  await assert.rejects(main(g.ns), e => e === STOP);
  assert.equal(g.rows.get("A").longs, 0);
  assert.equal(g.trades.at(-1).type, "sell");
});

test("running manager pauses on API loss and resumes after access returns", async () => {
  const g = game(); g.add("A");
  g.ns.stock.nextUpdate = async () => { g.updates++; g.fourS = false; };
  g.ns.sleep = async ms => {
    assert.equal(ms, 30000);
    g.rows.get("A").forecast = 0.4;
    g.fourS = true;
    g.ns.stock.nextUpdate = async () => { g.updates++; throw STOP; };
  };
  await assert.rejects(main(g.ns), e => e === STOP);
  assert.deepEqual(g.trades.map(t => t.type), ["buy", "sell"]);
  assert.equal(g.updates, 2);
});
