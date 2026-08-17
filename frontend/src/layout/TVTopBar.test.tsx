// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { CandleType } from "klinecharts";
import type { Period, SymbolInfo } from "@klinecharts/pro";
import { dictionaries } from "../lib/i18n";
import { TVTopBar } from "./TVTopBar";

vi.mock("../components/chart/ChartGrid", () => ({
  ChartGrid: () => null,
  CHART_LAYOUTS: [1, 2, 4, 6, 8],
}));

const t = (k: string): string => (dictionaries.zh as Record<string, string>)[k] ?? k;

const SYMBOL: SymbolInfo = { ticker: "BTCUSDT", shortName: "BTCUSDT", market: "USDT-FUTURES", pricePrecision: 2, volumePrecision: 4 };
const PERIODS: Period[] = [
  { multiplier: 1, timespan: "minute", text: "1m" },
  { multiplier: 5, timespan: "minute", text: "5m" },
  { multiplier: 1, timespan: "day", text: "1D" },
];

function setup(overrides: Record<string, unknown> = {}) {
  const callbacks = {
    onOpenSearch: vi.fn(),
    onPeriodChange: vi.fn(),
    onChartTypeChange: vi.fn(),
    onLayoutChange: vi.fn(),
    onOpenIndicator: vi.fn(),
    onOpenTimezone: vi.fn(),
    onOpenSettings: vi.fn(),
    onOpenAlerts: vi.fn(),
    onSaveTemplate: vi.fn(),
    onLocaleChange: vi.fn(),
    onThemeChange: vi.fn(),
  };
  render(
    <TVTopBar
      symbol={SYMBOL}
      period={PERIODS[1]}
      periods={PERIODS}
      chartType={"candle_solid" as CandleType}
      layoutCount={1}
      t={t as never}
      locale="zh"
      theme="dark"
      {...callbacks}
      {...overrides}
    />,
  );
  return callbacks;
}

describe("TVTopBar", () => {
  it("renders symbol, periods and right-cluster buttons", () => {
    setup();
    expect(screen.getByTestId("topbar-symbol").textContent).toContain("BTCUSDT");
    for (const p of PERIODS) expect(screen.getByTestId(`topbar-period-${p.text}`)).toBeInTheDocument();
    expect(screen.getByTestId("topbar-indicator")).toBeInTheDocument();
    expect(screen.getByTestId("topbar-layout")).toBeInTheDocument();
    expect(screen.getByTestId("topbar-settings")).toBeInTheDocument();
  });

  it("clicking the symbol button opens the search modal", () => {
    const { onOpenSearch } = setup();
    fireEvent.click(screen.getByTestId("topbar-symbol"));
    expect(onOpenSearch).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId("topbar-search-input")).not.toBeInTheDocument();
  });

  it("fires period change", () => {
    const { onPeriodChange } = setup();
    fireEvent.click(screen.getByTestId("topbar-period-1D"));
    expect(onPeriodChange).toHaveBeenCalledWith(PERIODS[2]);
  });

  it("opens chart type menu and fires change", () => {
    const { onChartTypeChange } = setup();
    fireEvent.click(screen.getByTestId("topbar-chart-type"));
    fireEvent.click(screen.getByText(t("chart.bar")));
    expect(onChartTypeChange).toHaveBeenCalledWith("ohlc");
  });

  it("opens layout menu and fires layout change", () => {
    const { onLayoutChange } = setup();
    fireEvent.click(screen.getByTestId("topbar-layout"));
    fireEvent.click(screen.getByText("4"));
    expect(onLayoutChange).toHaveBeenCalledWith(4);
  });

  it("shows per-kind sync switches in the layout menu for multi-cell layouts", () => {
    const onSyncFlagChange = vi.fn();
    setup({
      layoutCount: 2,
      syncFlags: { symbol: true, period: true, crosshair: true, range: true, draw: true },
      onSyncFlagChange,
    });
    fireEvent.click(screen.getByTestId("topbar-layout"));
    expect(screen.getByTestId("layout-sync-flags")).toBeInTheDocument();
    const drawSwitch = screen.getByTestId("sync-flag-draw");
    fireEvent.click(drawSwitch);
    expect(onSyncFlagChange).toHaveBeenCalledWith("draw", false);
  });

  it("account menu switches locale and theme", () => {
    const { onLocaleChange, onThemeChange } = setup();
    fireEvent.click(screen.getByTestId("topbar-account"));
    fireEvent.click(screen.getByTestId("account-locale"));
    expect(onLocaleChange).toHaveBeenCalledWith("en");
    fireEvent.click(screen.getByTestId("account-theme"));
    expect(onThemeChange).toHaveBeenCalledWith("light");
  });

  it("indicator/alerts/settings buttons fire their handlers", () => {
    const { onOpenIndicator, onOpenAlerts, onOpenSettings } = setup();
    fireEvent.click(screen.getByTestId("topbar-indicator"));
    expect(onOpenIndicator).toHaveBeenCalled();
    fireEvent.click(screen.getByTestId("topbar-alerts"));
    expect(onOpenAlerts).toHaveBeenCalled();
    fireEvent.click(screen.getByTestId("topbar-settings"));
    expect(onOpenSettings).toHaveBeenCalled();
  });
});
