// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { SymbolInfo } from "../../types/trading";
import { MarketTape } from "./MarketTape";

const makeSymbol = (over: Partial<SymbolInfo>): SymbolInfo => ({
  id: "BTCUSDT",
  ticker: "BTCUSDT",
  name: "Bitcoin / Tether",
  exchange: "USDT-FUTURES",
  category: "crypto",
  price: 0,
  change24h: 0,
  change24hPercent: 0,
  high24h: 0,
  low24h: 0,
  volume24h: "-",
  digits: 2,
  baseAsset: "BTC",
  quoteAsset: "USDT",
  description: "",
  ...over,
});

const btc = makeSymbol({ price: 674.5, change24hPercent: 1.236 });
const eth = makeSymbol({ id: "ETHUSDT", baseAsset: "ETH", price: 35.1, change24hPercent: -0.412 });

describe("MarketTape", () => {
  it("renders a tape entry per symbol with a signed delta", () => {
    render(
      <MarketTape live symbols={[btc, eth]} activeSymbolId="BTCUSDT" onSelectSymbol={() => {}} />,
    );
    expect(screen.getByText("674.50")).toBeInTheDocument();
    expect(screen.getByText("+1.24%")).toBeInTheDocument();
    expect(screen.getByText("-0.41%")).toBeInTheDocument();
  });

  it("colours deltas by market direction", () => {
    render(<MarketTape live symbols={[btc, eth]} onSelectSymbol={() => {}} />);
    expect(screen.getByText("+1.24%").className).toContain("text-up");
    expect(screen.getByText("-0.41%").className).toContain("text-down");
  });

  it("selects a symbol when its tape entry is clicked", () => {
    const onSelectSymbol = vi.fn();
    render(<MarketTape live symbols={[btc]} onSelectSymbol={onSelectSymbol} />);
    fireEvent.click(screen.getByRole("button", { name: /BTC\s*\/USDT/ }));
    expect(onSelectSymbol).toHaveBeenCalledWith(btc);
  });

  it("marks the feed offline until quotes arrive", () => {
    render(<MarketTape live={false} symbols={[btc]} onSelectSymbol={() => {}} />);
    expect(screen.getByText("离线")).toBeInTheDocument();
  });

  it("invites action instead of showing an empty strip when there is no feed", () => {
    render(<MarketTape live symbols={[]} onSelectSymbol={() => {}} />);
    expect(screen.getByText("暂无行情数据")).toBeInTheDocument();
  });
});
