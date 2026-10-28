import { PURCHASE_MANAGER, STOCK_MANAGER } from "./spending.js";

/** @param {import("@ns").NS} ns */
export async function main(ns) {
  const options = ns.flags([["reserve", 100000], ["help", false]]);
  if (options.help) {
    ns.tprint("run /scripts/stock-manager.js [--reserve 100000] (TIX and 4S API access required; purchase-manager.js can buy it)");
    return;
  }
  const reserve = Number(options.reserve);
  if (!Number.isFinite(reserve) || reserve < 0 || options._.length ||
      ns.getHostname() !== "home" || ns.self().threads !== 1 ||
      ns.ps("home").some(p => p.pid !== ns.pid && p.filename.replace(/^\/+/, "") === STOCK_MANAGER.slice(1))) {
    ns.tprint("Run one stock manager on home with one thread and a nonnegative --reserve.");
    return;
  }
  ns.disableLog("ALL");
  ns.clearPort(ns.pid);
  ns.atExit(() => ns.clearPort(ns.pid));
  ns.tprint("Stock manager started: manages all longs, 10% purchase cap, no shorts or unlock purchases.");
  let waiting = false;
  while (true) {
    if (!ns.stock.hasTixApiAccess() || !ns.stock.has4SDataTixApi()) {
      if (!waiting) ns.print("Waiting for TIX and 4S Market Data TIX API access; trading paused.");
      waiting = true;
      await ns.sleep(30000);
      continue;
    }
    waiting = false;
    try { tradeStocks(ns, reserve); }
    catch (error) { ns.print(`Stock pass failed; retrying: ${String(error)}`); }
    await ns.stock.nextUpdate();
  }
}

function protectedCash(ns, reserve) {
  const spenders = ns.ps("home").filter(p =>
    [PURCHASE_MANAGER.slice(1), "scripts/hacknet-manager.js"].includes(p.filename.replace(/^\/+/, "")));
  if (!spenders.length) return reserve;
  const policy = ns.peek(ns.pid);
  if (spenders.length !== 1 || !policy || typeof policy !== "object" ||
      policy.spendingPid !== spenders[0].pid || spenders[0].threads !== 1 || policy.ready !== true ||
      !Number.isFinite(policy.protectedCash) || policy.protectedCash < 0 ||
      !Number.isFinite(policy.timestamp) || Date.now() - policy.timestamp < 0 ||
      Date.now() - policy.timestamp > 10000) return null;
  return policy.protectedCash;
}

function quote(ns, symbol) {
  const [longs, , shorts, shortPrice] = ns.stock.getPosition(symbol);
  const bid = ns.stock.getBidPrice(symbol);
  const ask = ns.stock.getAskPrice(symbol);
  const forecast = ns.stock.getForecast(symbol);
  const volatility = ns.stock.getVolatility(symbol);
  const max = ns.stock.getMaxShares(symbol);
  if (![longs, shorts, max].every(n => Number.isSafeInteger(n) && n >= 0) ||
      ![bid, ask, forecast, volatility, shortPrice].every(Number.isFinite) ||
      bid <= 0 || ask < bid || forecast < 0 || forecast > 1 || volatility < 0 || volatility > 1 || shortPrice < 0) {
    throw new Error(`Invalid market data for ${symbol}`);
  }
  return { symbol, longs, shorts, bid, ask, forecast, volatility, max,
    value: longs * bid + shorts * shortPrice, edge: (2 * forecast - 1) * volatility };
}

/** One synchronous market pass; no yield between a budget check and its trade.
 * @param {import("@ns").NS} ns
 */
export function tradeStocks(ns, reserve = 100000) {
  if (!ns.stock.hasTixApiAccess() || !ns.stock.has4SDataTixApi()) return;
  const commission = ns.stock.getConstants().StockMarketCommission;
  if (!Number.isFinite(commission) || commission < 0) throw new Error("Invalid stock commission");
  const symbols = ns.stock.getSymbols();
  let valid = true;
  const rows = [];
  for (const symbol of symbols) {
    try {
      const row = quote(ns, symbol);
      rows.push(row);
      if (row.longs && row.forecast <= 0.50 && row.longs * row.bid > commission) {
        const price = ns.stock.sellStock(symbol, row.longs);
        ns.print(price > 0 ? `Sold ${row.longs} ${symbol} at $${price.toFixed(2)}.` : `Sale failed: ${symbol}; retrying next tick.`);
      }
    } catch (error) {
      valid = false;
      ns.print(`Skipping ${symbol}: ${String(error)}`);
    }
  }
  // Unknown holdings must never become spare allocation for another symbol.
  if (!valid) return;
  const candidates = rows.filter(row => row.forecast >= 0.60 && row.edge > 0)
    .sort((a, b) => b.edge - a.edge || a.symbol.localeCompare(b.symbol));
  for (const candidate of candidates) {
    if (!ns.stock.hasTixApiAccess() || !ns.stock.has4SDataTixApi()) return;
    const floor = protectedCash(ns, reserve);
    if (floor === null) return;
    const holdings = symbols.map(symbol => quote(ns, symbol));
    const row = holdings.find(row => row.symbol === candidate.symbol);
    if (row.forecast < 0.60 || row.edge <= 0) continue;
    const exposure = holdings.reduce((sum, row) => sum + row.value, 0);
    const cash = ns.getServerMoneyAvailable("home");
    const budget = Math.min(cash - floor, 0.10 * Math.max(0, cash + exposure - floor) - exposure);
    const shares = Math.min(row.max - row.longs - row.shorts, Math.floor((budget - commission) / row.ask));
    if (!Number.isSafeInteger(shares) || shares < 1 || !Number.isFinite(budget)) continue;
    // shortcut: 30-tick linear drift assumes today's forecast; revisit if adding pre-4S signals.
    if (shares * row.bid * row.edge / 2 * 30 <= shares * (row.ask - row.bid) + 2 * commission) continue;
    const price = ns.stock.buyStock(row.symbol, shares);
    ns.print(price > 0 ? `Bought ${shares} ${row.symbol} at $${price.toFixed(2)}.` : `Purchase failed: ${row.symbol}; retrying next tick.`);
  }
}
