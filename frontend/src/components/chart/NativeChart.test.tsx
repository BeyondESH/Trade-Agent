// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { render } from "@testing-library/react";
import { NativeChart } from "./NativeChart";
import type { SymbolInfo } from "../../types/trading";
import type { Period, SymbolInfo as ProSymbolInfo } from "@klinecharts/pro";

const renderCalls: Array<{ symbol: ProSymbolInfo; period: Period }> = [];
let capturedOnSymbolChange: ((s: ProSymbolInfo) => void) | undefined;
let capturedOnPeriodChange: ((p: Period) => void) | undefined;

vi.mock("./KLineChartProView", () => ({
  NATIVE_PERIODS: [
    { multiplier: 1, timespan: "hour", text: "1h" },
    { multiplier: 4, timespan: "hour", text: "4h" },
  ],
  KLineChartProView: (props: {
    symbol: ProSymbolInfo;
    period: Period;
    onSymbolChange?: (s: ProSymbolInfo) => void;
    onPeriodChange?: (p: Period) => void;
    onReady?: (c: null) => void;
  }) => {
    renderCalls.push({ symbol: props.symbol, period: props.period });
    capturedOnSymbolChange = props.onSymbolChange;
    capturedOnPeriodChange = props.onPeriodChange;
    props.onReady?.(null);
    return <div data-testid="klinepro" />;
  },
}));

function makeSymbol(id: string): SymbolInfo {
  return {
    id,
    ticker: id,
    name: id,
    exchange: "USDT-FUTURES",
    category: "crypto",
    price: 1,
    change24h: 0,
    change24hPercent: 0,
    high24h: 1,
    low24h: 1,
    volume24h: "-",
    digits: 2,
    baseAsset: id,
    quoteAsset: "USDT",
    description: "",
  };
}

describe("NativeChart single-chart wrapper", () => {
  it("renders one native chart with the pro symbol/period", () => {
    renderCalls.length = 0;
    const { getByTestId } = render(
      <NativeChart symbol={makeSymbol("BTCUSDT")} timeframe="1h" theme="dark" />,
    );
    expect(getByTestId("klinepro")).toBeTruthy();
    const last = renderCalls[renderCalls.length - 1];
    expect(last.symbol.ticker).toBe("BTCUSDT");
    expect(last.period.text).toBe("1h");
  });

  it("keeps the pro symbol reference stable across unrelated re-renders", () => {
    renderCalls.length = 0;
    const { rerender } = render(
      <NativeChart symbol={makeSymbol("ETHUSDT")} timeframe="1h" theme="dark" />,
    );
    const first = renderCalls[renderCalls.length - 1].symbol;
    rerender(<NativeChart symbol={makeSymbol("ETHUSDT")} timeframe="1h" theme="light" />);
    const second = renderCalls[renderCalls.length - 1].symbol;
    expect(second).toBe(first);
  });

  it("surfaces native symbol/period changes via the callbacks", () => {
    renderCalls.length = 0;
    const onSymbolChange = vi.fn();
    const onPeriodChange = vi.fn();
    render(
      <NativeChart
        symbol={makeSymbol("BTCUSDT")}
        timeframe="1h"
        theme="dark"
        onSymbolChange={onSymbolChange}
        onPeriodChange={onPeriodChange}
      />,
    );
    expect(capturedOnSymbolChange).toBeDefined();
    expect(capturedOnPeriodChange).toBeDefined();
    capturedOnSymbolChange!({ ticker: "SOLUSDT", market: "USDT-FUTURES" });
    expect(onSymbolChange).toHaveBeenCalledWith({ ticker: "SOLUSDT", market: "USDT-FUTURES" });
    capturedOnPeriodChange!({ multiplier: 4, timespan: "hour", text: "4h" });
    expect(onPeriodChange).toHaveBeenCalledWith({ multiplier: 4, timespan: "hour", text: "4h" });
  });
});
