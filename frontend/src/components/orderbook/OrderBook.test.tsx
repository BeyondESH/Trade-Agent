// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { OrderBook } from "./OrderBook";

describe("OrderBook", () => {
  it("renders asks reversed above the spread and bids below", () => {
    render(
      <OrderBook
        asks={[{ price: 101, size: 5 }, { price: 102, size: 3 }]}
        bids={[{ price: 100, size: 4 }, { price: 99, size: 2 }]}
        spread={1}
        precision={1}
      />,
    );
    expect(screen.getByText("订单簿 · 价差 1.0")).toBeInTheDocument();
    expect(screen.getByText("买一 100.0")).toBeInTheDocument();
    expect(screen.getByText("卖一 101.0")).toBeInTheDocument();
    // both ask rows render
    expect(screen.getAllByTestId("book-ask")).toHaveLength(2);
    expect(screen.getAllByTestId("book-bid")).toHaveLength(2);
  });
});
