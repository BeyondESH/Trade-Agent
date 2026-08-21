// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { TradeTable } from "./TradeTable";
import type { BacktestTrade } from "../../../api/types";

const trade = (net: number, gross: number, side: "long" | "short" = "long"): BacktestTrade => ({
  side,
  entry_time: 1700000000000,
  entry_price: 100.5,
  exit_time: 1700003600000,
  exit_price: 105.25,
  bars: 2,
  gross_return: gross,
  net_return: net,
});

describe("TradeTable", () => {
  it("renders an empty-state hint when there are no trades", () => {
    render(<TradeTable trades={[]} theme="dark" />);
    expect(screen.getByText("本次回测无开单记录")).toBeInTheDocument();
  });

  it("renders trade rows with side and returns", () => {
    render(<TradeTable trades={[trade(0.05, 0.051), trade(-0.02, -0.019, "short")]} theme="dark" />);
    expect(screen.getByText("开单列表 (2)")).toBeInTheDocument();
    expect(screen.getByText("多")).toBeInTheDocument();
    expect(screen.getByText("空")).toBeInTheDocument();
    expect(screen.getByText("5.00%")).toBeInTheDocument(); // net win
    expect(screen.getByText("5.10%")).toBeInTheDocument(); // gross win
    expect(screen.getByText("-2.00%")).toBeInTheDocument();
    expect(screen.getByText("-1.90%")).toBeInTheDocument();
  });

  it("sorts rows by net return descending when header clicked", () => {
    render(
      <TradeTable
        trades={[trade(0.05, 0.051), trade(-0.02, -0.019, "short"), trade(0.01, 0.011)]}
        theme="dark"
      />,
    );
    const rows = screen.getAllByRole("row").slice(1);
    expect(rows[0]).toHaveTextContent("多");
    fireEvent.click(screen.getByText("净利"));
    const sorted = screen.getAllByRole("row").slice(1);
    expect(sorted[0]).toHaveTextContent("多"); // 5.00% stays first
    expect(sorted[2]).toHaveTextContent("空");
  });
});
