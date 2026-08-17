// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SearchModal, type SearchHit } from "./SearchModal";

const HITS: SearchHit[] = [
  { ticker: "BTCUSDT", market: "USDT-FUTURES", pricePrecision: 1, volumePrecision: 4 },
  { ticker: "BTCUSDT", market: "SPOT", pricePrecision: 2, volumePrecision: 5 },
  { ticker: "ETHUSDT", market: "USDT-FUTURES", pricePrecision: 2, volumePrecision: 4 },
];

function setup(overrides: Partial<{ onClose: () => void; onSelect: (c: string) => void }> = {}) {
  const searchSymbols = vi.fn(async () => HITS);
  const onClose = overrides.onClose ?? vi.fn();
  const onSelect = overrides.onSelect ?? vi.fn();
  render(
    <SearchModal
      open
      onClose={onClose}
      searchSymbols={searchSymbols}
      priceMap={{ BTCUSDT: 60000, ETHUSDT: 3000 }}
      onSelect={onSelect}
    />,
  );
  return { searchSymbols, onClose, onSelect };
}

beforeEach(() => {
  vi.useRealTimers();
});

describe("SearchModal", () => {
  it("searches via the provider and shows rows with category/precision", async () => {
    const { searchSymbols } = setup();
    await waitFor(() => expect(screen.getByTestId("search-row-USDT-FUTURES:BTCUSDT")).toBeInTheDocument());
    expect(searchSymbols).toHaveBeenCalledWith("");
    expect(screen.getByTestId("search-row-SPOT:BTCUSDT")).toBeInTheDocument();
    expect(screen.getByTestId("search-row-USDT-FUTURES:BTCUSDT").textContent).toContain("60000");
  });

  it("filters rows by category tab", async () => {
    setup();
    await waitFor(() => expect(screen.getByTestId("search-row-SPOT:BTCUSDT")).toBeInTheDocument());
    fireEvent.click(screen.getByTestId("search-tab-SPOT"));
    expect(screen.getByTestId("search-row-SPOT:BTCUSDT")).toBeInTheDocument();
    expect(screen.queryByTestId("search-row-USDT-FUTURES:BTCUSDT")).not.toBeInTheDocument();
    expect(screen.queryByTestId("search-row-USDT-FUTURES:ETHUSDT")).not.toBeInTheDocument();
  });

  it("selecting a row returns the composite category:instId and closes", async () => {
    const onSelect = vi.fn();
    const onClose = vi.fn();
    setup({ onSelect, onClose });
    await waitFor(() => expect(screen.getByTestId("search-row-SPOT:BTCUSDT")).toBeInTheDocument());
    fireEvent.click(screen.getByTestId("search-row-SPOT:BTCUSDT"));
    expect(onSelect).toHaveBeenCalledWith("SPOT:BTCUSDT");
    expect(onClose).toHaveBeenCalled();
  });

  it("supports keyboard navigation (down moves highlight / enter selects)", async () => {
    const onSelect = vi.fn();
    setup({ onSelect });
    await waitFor(() => expect(screen.getByTestId("search-row-USDT-FUTURES:BTCUSDT")).toBeInTheDocument());
    const input = screen.getByTestId("search-modal-input");
    fireEvent.keyDown(input, { key: "ArrowDown" });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onSelect).toHaveBeenCalledWith("SPOT:BTCUSDT");
  });

  it("closes on Escape", async () => {
    const onClose = vi.fn();
    setup({ onClose });
    await waitFor(() => expect(screen.getByTestId("search-modal-input")).toBeInTheDocument());
    fireEvent.keyDown(screen.getByTestId("search-modal-input"), { key: "Escape" });
    expect(onClose).toHaveBeenCalled();
  });

  it("closes when the mask is clicked", async () => {
    const onClose = vi.fn();
    setup({ onClose });
    await waitFor(() => expect(screen.getByTestId("search-modal-mask")).toBeInTheDocument());
    fireEvent.mouseDown(screen.getByTestId("search-modal-mask"));
    expect(onClose).toHaveBeenCalled();
  });

  it("returns null when closed", () => {
    const { container } = render(
      <SearchModal open={false} onClose={vi.fn()} searchSymbols={vi.fn()} onSelect={vi.fn()} />,
    );
    expect(container.innerHTML).toBe("");
  });
});
