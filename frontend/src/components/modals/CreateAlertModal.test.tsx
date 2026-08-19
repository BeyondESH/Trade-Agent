// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { CreateAlertModal } from "./CreateAlertModal";
import type { SymbolInfo } from "../../types/trading";

function makeSymbol(): SymbolInfo {
  return {
    id: "BTCUSDT",
    ticker: "BTCUSDT",
    name: "Bitcoin",
    exchange: "USDT-FUTURES",
    category: "crypto",
    price: 90000,
    change24h: 0,
    change24hPercent: 0,
    high24h: 91000,
    low24h: 89000,
    volume24h: "-",
    digits: 2,
    baseAsset: "BTC",
    quoteAsset: "USDT",
    description: "",
  };
}

function renderModal(initialPrice?: number) {
  const onAddAlert = vi.fn();
  const onClose = vi.fn();
  render(
    <CreateAlertModal
      isOpen
      onClose={onClose}
      symbol={makeSymbol()}
      onAddAlert={onAddAlert}
      theme="dark"
      initialPrice={initialPrice}
    />,
  );
  return { onAddAlert, onClose };
}

describe("CreateAlertModal", () => {
  it("prefills the target price from initialPrice", () => {
    renderModal(95000);
    const input = screen.getByRole("spinbutton") as HTMLInputElement;
    expect(input.value).toBe("95000");
  });

  it("falls back to the symbol price when initialPrice is absent", () => {
    renderModal();
    const input = screen.getByRole("spinbutton") as HTMLInputElement;
    expect(input.value).toBe("90000");
  });

  it("submits an alert carrying the prefilled price", () => {
    const { onAddAlert } = renderModal(95000);
    fireEvent.click(screen.getByText("Create Alert"));
    expect(onAddAlert).toHaveBeenCalledWith(
      expect.objectContaining({ symbol: "BTCUSDT", targetPrice: 95000 }),
    );
  });
});
