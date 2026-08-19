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
  const utils = render(
    <CreateAlertModal
      isOpen
      onClose={onClose}
      symbol={makeSymbol()}
      onAddAlert={onAddAlert}
      theme="dark"
      initialPrice={initialPrice}
    />,
  );
  return { ...utils, onAddAlert, onClose };
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

  it("re-prefills the price after being reopened with a new initialPrice", () => {
    const first = renderModal(95000);
    expect((screen.getByRole("spinbutton") as HTMLInputElement).value).toBe("95000");
    first.unmount();

    renderModal(97000);
    expect((screen.getByRole("spinbutton") as HTMLInputElement).value).toBe("97000");
  });

  it("resets condition, frequency and note to defaults on reopen", () => {
    const first = renderModal();
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "Greater Than" } });
    fireEvent.click(screen.getByText("Every Time"));
    const note = screen.getByPlaceholderText("e.g. BTC breakout confirmation at key resistance");
    fireEvent.change(note, { target: { value: "my note" } });
    first.unmount();

    renderModal();
    expect((screen.getByRole("combobox") as HTMLSelectElement).value).toBe("Crossing");
    expect(
      (screen.getByPlaceholderText("e.g. BTC breakout confirmation at key resistance") as HTMLInputElement).value,
    ).toBe("");
    expect(screen.getByText("Only Once").className).toContain("bg-[#2962ff]");
  });
});
