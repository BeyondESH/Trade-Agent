import type { SymbolInfo } from "../types/trading";

/**
 * Curated instrument list for the tape, the desk movers and the watchlist.
 *
 * The exchange returns several thousand instruments, most of them obscure
 * listings (1000BONK/USDT, 100000MOG/USDT...). Ordering by price change or by
 * list position therefore surfaces junk. A terminal should lead with the
 * instruments a trader actually recognises.
 */
export const MAJOR_SYMBOLS: readonly string[] = [
  "BTCUSDT",
  "ETHUSDT",
  "SOLUSDT",
  "BNBUSDT",
  "XRPUSDT",
  "DOGEUSDT",
  "ADAUSDT",
  "AVAXUSDT",
  "LINKUSDT",
  "TONUSDT",
  "SUIUSDT",
  "DOTUSDT",
  "TRXUSDT",
  "LTCUSDT",
  "APTUSDT",
  "ARBUSDT",
  "OPUSDT",
  "NEARUSDT",
];

/**
 * Pick the instruments worth showing first: the active one, then the majors in
 * their canonical order, then (only if nothing matched) the head of the list.
 * Capped because both the tape and the watchlist are glanceable surfaces, not
 * directories.
 */
export function pickMajors(symbols: SymbolInfo[], activeId?: string, max = 14): SymbolInfo[] {
  const byId = new Map(symbols.map((s) => [s.id, s]));
  const out: SymbolInfo[] = [];

  if (activeId) {
    const active = byId.get(activeId);
    if (active) out.push(active);
  }
  for (const id of MAJOR_SYMBOLS) {
    const symbol = byId.get(id);
    if (symbol && !out.includes(symbol)) out.push(symbol);
    if (out.length >= max) return out;
  }
  if (out.length === 0) out.push(...symbols.slice(0, max));
  return out.slice(0, max);
}
