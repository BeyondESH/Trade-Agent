// @vitest-environment jsdom

import { fireEvent, render } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SymbolInfo } from "../../types/trading";
import { RightDock } from "./RightDock";
import { RIGHT_DOCK_WIDTH_KEY } from "./rightDockWidth";

vi.mock("./AlertsPanel", () => ({ AlertsPanel: () => <div /> }));
vi.mock("./CalendarPanel", () => ({ CalendarPanel: () => <div /> }));
vi.mock("./CommunityIdeasPanel", () => ({ CommunityIdeasPanel: () => <div /> }));
vi.mock("./DataWindowPanel", () => ({ DataWindowPanel: () => <div /> }));
vi.mock("./HotlistsPanel", () => ({ HotlistsPanel: () => <div /> }));
vi.mock("./NewsPanel", () => ({ NewsPanel: () => <div /> }));
vi.mock("./OrderBookPanel", () => ({ OrderBookPanel: () => <div /> }));
vi.mock("./TradesTape", () => ({ TradesTape: () => <div /> }));
vi.mock("./WatchlistPanel", () => ({ WatchlistPanel: () => <div /> }));

const SYMBOL: SymbolInfo = {
  id: "BTCUSDT",
  ticker: "BTCUSDT",
  name: "BTC Perpetual",
  exchange: "U本位合约",
  category: "crypto",
  price: 60000,
  change24h: 0,
  change24hPercent: 1,
  high24h: 61000,
  low24h: 59000,
  volume24h: "1B",
  digits: 2,
  baseAsset: "BTC",
  quoteAsset: "USDT",
  description: "",
};

function renderDock() {
  return render(
    <RightDock
      symbols={[SYMBOL]}
      activeSymbol={SYMBOL}
      onSelectSymbol={vi.fn()}
      onAddSymbol={vi.fn()}
      activeCandle={null}
      indicators={[]}
      alerts={[]}
      onRemoveAlert={vi.fn()}
      onToggleAlert={vi.fn()}
      onResetAlert={vi.fn()}
      notifyEnabled={false}
      onToggleNotifications={vi.fn()}
      onOpenCreateAlert={vi.fn()}
      events={[]}
      orderBook={{ bids: [], asks: [], spread: null }}
      trades={[]}
      theme="dark"
    />,
  );
}

beforeEach(() => {
  localStorage.clear();
});

describe("RightDock resizable width", () => {
  it("defaults to 280px and persists it", () => {
    const { getByTestId } = renderDock();
    expect(getByTestId("right-dock-panel").style.width).toBe("280px");
    expect(localStorage.getItem(RIGHT_DOCK_WIDTH_KEY)).toBe("280");
  });

  it("grows when dragging the left edge left and clamps at 500px", () => {
    const { getByTestId } = renderDock();
    const handle = getByTestId("right-dock-resize-handle");
    fireEvent.mouseDown(handle, { clientX: 1000 });
    fireEvent.mouseMove(window, { clientX: 700 }); // deltaX -300 -> 580 -> clamp 500
    expect(getByTestId("right-dock-panel").style.width).toBe("500px");
    fireEvent.mouseUp(window);
    expect(localStorage.getItem(RIGHT_DOCK_WIDTH_KEY)).toBe("500");
  });

  it("shrink clamps at the 260px minimum", () => {
    const { getByTestId } = renderDock();
    const handle = getByTestId("right-dock-resize-handle");
    fireEvent.mouseDown(handle, { clientX: 1000 });
    fireEvent.mouseMove(window, { clientX: 1400 }); // deltaX 400 -> -120 -> clamp 260
    expect(getByTestId("right-dock-panel").style.width).toBe("260px");
    fireEvent.mouseUp(window);
  });

  it("restores a persisted width on reload, clamped into range", () => {
    localStorage.setItem(RIGHT_DOCK_WIDTH_KEY, "420");
    const first = renderDock();
    expect(first.getByTestId("right-dock-panel").style.width).toBe("420px");
    first.unmount();

    localStorage.setItem(RIGHT_DOCK_WIDTH_KEY, "9999");
    const second = renderDock();
    expect(second.getByTestId("right-dock-panel").style.width).toBe("500px");
    second.unmount();

    localStorage.setItem(RIGHT_DOCK_WIDTH_KEY, "not-a-number");
    const third = renderDock();
    expect(third.getByTestId("right-dock-panel").style.width).toBe("280px");
  });
});
