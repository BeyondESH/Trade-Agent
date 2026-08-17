// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Period, SymbolInfo } from "@klinecharts/pro";

const cap = vi.hoisted(() => ({ props: [] as Array<Record<string, unknown>> }));

vi.mock("./ChartCell", () => ({
  ChartCell: (props: Record<string, unknown>) => {
    cap.props.push(props);
    return <div data-testid="cell-mock">{(props.symbol as SymbolInfo).ticker}</div>;
  },
}));

import { ChartGrid, CHART_LAYOUTS } from "./ChartGrid";

const SYM = (t: string, market = "USDT-FUTURES"): SymbolInfo => ({
  ticker: t,
  shortName: t,
  market,
});
const P5M: Period = { multiplier: 5, timespan: "minute", text: "5m" };
const P1H: Period = { multiplier: 1, timespan: "hour", text: "1H" };

const CELLS = [
  { symbol: SYM("BTCUSDT"), period: P5M },
  { symbol: SYM("ETHUSDT", "SPOT"), period: P5M },
  { symbol: SYM("SOLUSDT"), period: P5M },
  { symbol: SYM("BNBUSDT"), period: P5M },
];

function renderGrid(overrides: Record<string, unknown> = {}) {
  return render(
    <ChartGrid
      count={2}
      cells={CELLS.slice(0, 2)}
      periods={[P5M, P1H]}
      theme="dark"
      locale="zh-CN"
      activeIndex={0}
      onActivate={vi.fn()}
      onCellHandle={vi.fn()}
      onCellReady={vi.fn()}
      onCellSymbolChange={vi.fn()}
      onCellPeriodChange={vi.fn()}
      {...overrides}
    />,
  );
}

beforeEach(() => {
  cap.props = [];
});

afterEach(() => {
  cap.props = [];
});

describe("ChartGrid", () => {
  it("exports the standard layout counts", () => {
    expect(CHART_LAYOUTS).toEqual([1, 2, 4, 6, 8]);
  });

  it("renders one peer cell per layout slot with each cell's own symbol", () => {
    renderGrid();
    expect(screen.getByTestId("chart-cell-0")).toBeInTheDocument();
    expect(screen.getByTestId("chart-cell-1")).toBeInTheDocument();
    expect(screen.getByText("BTCUSDT")).toBeInTheDocument();
    expect(screen.getByText("ETHUSDT")).toBeInTheDocument();
  });

  it("marks the active cell and activates on mousedown", () => {
    const onActivate = vi.fn();
    renderGrid({ activeIndex: 1, onActivate });
    expect(screen.getByTestId("chart-cell-1").dataset.active).toBe("true");
    expect(screen.getByTestId("chart-cell-0").dataset.active).toBe("false");
    fireEvent.mouseDown(screen.getByTestId("chart-cell-0"));
    expect(onActivate).toHaveBeenCalledWith(0);
  });

  it("routes a cell's internal symbol/period changes with the cell index", () => {
    const onCellSymbolChange = vi.fn();
    const onCellPeriodChange = vi.fn();
    renderGrid({ onCellSymbolChange, onCellPeriodChange });
    // The second cell's mock captured its callbacks in cell order.
    const cell1 = cap.props[1];
    expect(cell1.symbol).toMatchObject({ ticker: "ETHUSDT" });
    (cell1.onSymbolChange as (s: SymbolInfo) => void)(SYM("ETHUSDT"));
    expect(onCellSymbolChange).toHaveBeenCalledWith(1, expect.objectContaining({ ticker: "ETHUSDT" }));
    (cell1.onPeriodChange as (p: Period) => void)(P1H);
    expect(onCellPeriodChange).toHaveBeenCalledWith(1, P1H);
  });

  it("passes the shared datafeed only to the first cell", () => {
    const shared = {};
    renderGrid({ datafeed: shared });
    expect(cap.props[0].datafeed).toBe(shared);
    expect(cap.props[1].datafeed).toBeUndefined();
  });

  it("passes theme, locale and per-cell watermark down to each cell", () => {
    const watermarkFor = vi.fn((c: { symbol: SymbolInfo; period: Period }) => `${c.symbol.ticker}·x`);
    renderGrid({ theme: "light", locale: "en-US", watermarkFor });
    expect(cap.props[0].theme).toBe("light");
    expect(cap.props[0].locale).toBe("en-US");
    expect((cap.props[0] as { watermarkText?: string }).watermarkText).toBe("BTCUSDT·x");
    expect((cap.props[1] as { watermarkText?: string }).watermarkText).toBe("ETHUSDT·x");
    expect(watermarkFor).toHaveBeenCalledTimes(2);
  });

  it("renders nothing for a missing cell slot", () => {
    renderGrid({ count: 3, cells: [CELLS[0]] });
    expect(screen.getAllByTestId("cell-mock")).toHaveLength(1);
  });
});
