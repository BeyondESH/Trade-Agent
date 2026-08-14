// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { TradesTape } from "./TradesTape";

describe("TradesTape", () => {
  it("renders trades with direction colors", () => {
    render(
      <TradesTape
        trades={[
          { instId: "BTCUSDT", price: "60000.5", size: "0.5", side: "buy", ts: "1700000000000" },
          { instId: "BTCUSDT", price: "59999", size: "0.2", side: "sell", ts: "1700000001000" },
        ]}
        precision={2}
      />,
    );
    expect(screen.getByText("最新成交")).toBeInTheDocument();
    expect(screen.getByText("60000.50")).toBeInTheDocument();
    expect(screen.getByText("59999.00")).toBeInTheDocument();
  });

  it("shows empty state", () => {
    render(<TradesTape trades={[]} precision={2} />);
    expect(screen.getByText("暂无成交")).toBeInTheDocument();
  });
});
