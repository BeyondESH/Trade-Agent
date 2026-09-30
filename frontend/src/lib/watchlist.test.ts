import { describe, expect, it } from "vitest";
import type { SymbolInfo } from "../types/trading";
import { MAJOR_SYMBOLS, pickMajors } from "./watchlist";

const make = (id: string): SymbolInfo => ({
  id,
  ticker: id,
  name: `${id} contract`,
  exchange: "USDT-FUTURES",
  category: "crypto",
  price: 1,
  change24h: 0,
  change24hPercent: 0,
  high24h: 0,
  low24h: 0,
  volume24h: "-",
  digits: 2,
  baseAsset: id.replace(/USDT$/, ""),
  quoteAsset: "USDT",
  description: "",
});

describe("pickMajors", () => {
  it("leads with the active symbol, then the majors in canonical order", () => {
    const list = [make("1000BONKUSDT"), make("ETHUSDT"), make("BTCUSDT"), make("SOLUSDT")];
    expect(pickMajors(list, "ETHUSDT").map((s) => s.id)).toEqual(["ETHUSDT", "BTCUSDT", "SOLUSDT"]);
  });

  it("skips majors that are not listed", () => {
    const list = [make("BTCUSDT"), make("SOLUSDT")];
    expect(pickMajors(list).map((s) => s.id)).toEqual(["BTCUSDT", "SOLUSDT"]);
  });

  it("honours the cap", () => {
    const list = MAJOR_SYMBOLS.map((id) => make(id));
    expect(pickMajors(list, undefined, 5)).toHaveLength(5);
  });

  it("falls back to the head of the list when no major is listed", () => {
    const list = [make("ZZZUSDT"), make("YYYUSDT")];
    expect(pickMajors(list, undefined, 1).map((s) => s.id)).toEqual(["ZZZUSDT"]);
  });

  it("returns nothing for an empty list", () => {
    expect(pickMajors([])).toEqual([]);
  });

  it("does not duplicate the active symbol when it is also a major", () => {
    const ids = pickMajors([make("BTCUSDT")], "BTCUSDT").map((s) => s.id);
    expect(ids).toEqual(["BTCUSDT"]);
  });
});
