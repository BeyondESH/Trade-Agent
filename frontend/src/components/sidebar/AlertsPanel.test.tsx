// @vitest-environment jsdom

import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { formatRelativeTime } from "../../lib/newsfeed";
import type { AlertItem, SymbolInfo } from "../../types/trading";
import { AlertsPanel } from "./AlertsPanel";

const SYMBOL: SymbolInfo = {
  id: "BTCUSDT",
  ticker: "BTCUSDT",
  name: "Bitcoin",
  exchange: "USDT-FUTURES",
  category: "crypto",
  price: 90000,
  change24h: 0,
  change24hPercent: 0,
  high24h: 0,
  low24h: 0,
  volume24h: "-",
  digits: 2,
  baseAsset: "BTC",
  quoteAsset: "USDT",
  description: "",
};

function makeAlert(overrides: Partial<AlertItem> = {}): AlertItem {
  return {
    id: "a1",
    symbol: "BTCUSDT",
    condition: "Greater Than",
    targetPrice: 95000,
    createdAt: "2026-01-01T00:00",
    enabled: true,
    triggered: false,
    note: "",
    frequency: "Every Time",
    ...overrides,
  };
}

function renderPanel(alerts: AlertItem[], notifyEnabled = false) {
  const onRemoveAlert = vi.fn();
  const onToggleAlert = vi.fn();
  const onResetAlert = vi.fn();
  const onToggleNotifications = vi.fn();
  const onOpenCreateAlert = vi.fn();
  render(
    <AlertsPanel
      alerts={alerts}
      onRemoveAlert={onRemoveAlert}
      onToggleAlert={onToggleAlert}
      onResetAlert={onResetAlert}
      notifyEnabled={notifyEnabled}
      onToggleNotifications={onToggleNotifications}
      onOpenCreateAlert={onOpenCreateAlert}
      activeSymbol={SYMBOL}
      theme="dark"
    />,
  );
  return {
    onRemoveAlert,
    onToggleAlert,
    onResetAlert,
    onToggleNotifications,
    onOpenCreateAlert,
  };
}

describe("AlertsPanel", () => {
  it("toggles an enabled alert off via the switch", () => {
    const { onToggleAlert } = renderPanel([makeAlert()]);
    fireEvent.click(screen.getByTestId("alert-toggle-a1"));
    expect(onToggleAlert).toHaveBeenCalledWith("a1", false);
  });

  it("toggles a disabled alert back on", () => {
    const { onToggleAlert } = renderPanel([makeAlert({ enabled: false })]);
    expect(screen.getByTestId("alert-toggle-a1")).toHaveAttribute("aria-checked", "false");
    fireEvent.click(screen.getByTestId("alert-toggle-a1"));
    expect(onToggleAlert).toHaveBeenCalledWith("a1", true);
  });

  it("shows reset only for triggered alerts and calls onResetAlert", () => {
    renderPanel([makeAlert({ triggered: false })]);
    expect(screen.queryByTestId("alert-reset-a1")).not.toBeInTheDocument();
  });

  it("calls onResetAlert for a triggered alert", () => {
    const { onResetAlert } = renderPanel([
      makeAlert({
        id: "a2",
        triggered: true,
        triggerTime: new Date(Date.now() - 5000).toISOString(),
      }),
    ]);
    fireEvent.click(screen.getByTestId("alert-reset-a2"));
    expect(onResetAlert).toHaveBeenCalledWith("a2");
  });

  it("highlights triggered alerts and renders the trigger time", () => {
    const iso = new Date(Date.now() - 3 * 60_000).toISOString();
    renderPanel([makeAlert({ triggered: true, triggerTime: iso })]);
    expect(screen.getByTestId("alert-item-a1")).toHaveAttribute("data-triggered", "true");
    expect(screen.getByTestId("alert-triggered-a1")).toBeInTheDocument();
    expect(screen.getByTestId("alert-trigger-time-a1").textContent).toContain(
      formatRelativeTime(iso),
    );
  });

  it("toggles the browser notification preference", () => {
    const { onToggleNotifications } = renderPanel([makeAlert()], false);
    expect(screen.getByTestId("alert-notify-toggle")).toHaveAttribute("aria-checked", "false");
    fireEvent.click(screen.getByTestId("alert-notify-toggle"));
    expect(onToggleNotifications).toHaveBeenCalledTimes(1);
  });

  it("still deletes alerts", () => {
    const { onRemoveAlert } = renderPanel([makeAlert()]);
    fireEvent.click(screen.getByTestId("alert-delete-a1"));
    expect(onRemoveAlert).toHaveBeenCalledWith("a1");
  });
});
