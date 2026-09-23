// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { DerivativeState } from "../../hooks/useDerivative";
import type { SymbolInfo } from "../../types/trading";
import { OrderBookPanel } from "./OrderBookPanel";

const holder = vi.hoisted<{ state: DerivativeState }>(() => ({
  state: { funding: null, markPrice: null },
}));

vi.mock("../../hooks/useDerivative", () => ({
  useDerivative: () => holder.state,
}));

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
  _productCategory: "USDT-FUTURES",
};

const ORDER_BOOK = {
  bids: [{ price: 59990, amount: 1, total: 1 }],
  asks: [{ price: 60010, amount: 1, total: 1 }],
  spread: 20,
};

beforeEach(() => {
  holder.state = { funding: null, markPrice: null };
});

describe("OrderBookPanel derivative rows", () => {
  it("renders funding rate and mark price from the derivative channels", () => {
    holder.state = {
      funding: { instId: "BTCUSDT", fundingRate: "0.0001" },
      markPrice: { instId: "BTCUSDT", markPrice: "60123.45" },
    };
    const { getByTestId } = render(
      <OrderBookPanel symbol={SYMBOL} orderBook={ORDER_BOOK} theme="dark" />,
    );
    expect(getByTestId("orderbook-funding").textContent).toBe("+0.0100%");
    expect(getByTestId("orderbook-mark-price").textContent).toBe("60,123.45");
  });

  it("shows placeholders when the derivative channels have no data", () => {
    const { getByTestId } = render(
      <OrderBookPanel symbol={SYMBOL} orderBook={ORDER_BOOK} theme="dark" />,
    );
    expect(getByTestId("orderbook-funding").textContent).toBe("--");
    expect(getByTestId("orderbook-mark-price").textContent).toBe("--");
  });

  it("renders localized header and column labels (no raw English keys)", () => {
    render(<OrderBookPanel symbol={SYMBOL} orderBook={ORDER_BOOK} theme="dark" />);
    expect(screen.getByText("订单簿 (DOM)")).toBeInTheDocument();
    expect(screen.getByText("精度: 0.01")).toBeInTheDocument();
    expect(screen.getByText("价格 (USDT)")).toBeInTheDocument();
    expect(screen.getByText("数量 (BTC)")).toBeInTheDocument();
    expect(screen.getByText("合计")).toBeInTheDocument();
    expect(screen.getByText(/价差:/)).toBeInTheDocument();
  });

  it("colors a negative funding rate red", () => {
    holder.state = {
      funding: { instId: "BTCUSDT", fundingRate: "-0.0002" },
      markPrice: null,
    };
    const { getByTestId } = render(
      <OrderBookPanel symbol={SYMBOL} orderBook={ORDER_BOOK} theme="dark" />,
    );
    const funding = getByTestId("orderbook-funding");
    expect(funding.textContent).toBe("-0.0200%");
    expect(funding.className).toContain("text-[#f23645]");
  });
});
