// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import type { ComponentProps } from "react";
import { describe, expect, it, vi } from "vitest";
import type { SymbolInfo } from "../../types/trading";
import { CommandPaletteModal } from "./CommandPaletteModal";

const make = (
  id: string,
  price = 1,
  change24hPercent = 0,
  name = `${id} contract`,
): SymbolInfo => ({
  id,
  ticker: id,
  name,
  exchange: "USDT-FUTURES",
  category: "crypto",
  price,
  change24h: 0,
  change24hPercent,
  high24h: 0,
  low24h: 0,
  volume24h: "-",
  digits: 2,
  baseAsset: id.replace(/USDT$/, ""),
  quoteAsset: "USDT",
  description: "",
});

const setup = (over: Partial<ComponentProps<typeof CommandPaletteModal>> = {}) => {
  const props = {
    isOpen: true,
    onClose: vi.fn(),
    symbols: [make("ZZZUSDT"), make("BTCUSDT", 83917.7, 1.24)],
    onSelectSymbol: vi.fn(),
    onSelectView: vi.fn(),
    onToggleTheme: vi.fn(),
    onOpenSettings: vi.fn(),
    onOpenShortcuts: vi.fn(),
    theme: "dark" as const,
    ...over,
  };
  return { props, ...render(<CommandPaletteModal {...props} />) };
};

describe("CommandPaletteModal", () => {
  it("renders nothing while closed", () => {
    const { container } = render(
      <CommandPaletteModal
        isOpen={false}
        onClose={vi.fn()}
        symbols={[]}
        onSelectSymbol={vi.fn()}
        onSelectView={vi.fn()}
        onToggleTheme={vi.fn()}
        onOpenSettings={vi.fn()}
        onOpenShortcuts={vi.fn()}
        theme="dark"
      />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("groups workspace actions separately from instruments", () => {
    setup();
    expect(screen.getByText("Workspace & Navigation")).toBeInTheDocument();
    expect(screen.getByText("Trading Instruments")).toBeInTheDocument();
  });

  it("ranks majors ahead of obscure listings", () => {
    setup();
    const btc = screen.getByText("BTCUSDT");
    const zzz = screen.getByText("ZZZUSDT");
    // BTC must precede ZZZ despite ZZZ sorting first alphabetically.
    expect(btc.compareDocumentPosition(zzz) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("runs the first action on Enter and closes", () => {
    const { props } = setup();
    fireEvent.keyDown(window, { key: "Enter" });
    expect(props.onSelectView).toHaveBeenCalledWith("chart");
    expect(props.onClose).toHaveBeenCalled();
  });

  it("moves the selection with the arrow keys before activating", () => {
    const { props } = setup();
    fireEvent.keyDown(window, { key: "ArrowDown" });
    fireEvent.keyDown(window, { key: "Enter" });
    expect(props.onSelectView).toHaveBeenCalledWith("markets");
  });

  it("closes on Escape", () => {
    const { props } = setup();
    fireEvent.keyDown(window, { key: "Escape" });
    expect(props.onClose).toHaveBeenCalled();
  });

  it("filters actions by the query", () => {
    setup();
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "heatmaps" } });
    expect(screen.getByText("Open Market Heatmaps")).toBeInTheDocument();
    expect(screen.queryByText("Open SuperCharts")).toBeNull();
  });

  it("opens the chart for a chosen instrument", () => {
    const { props } = setup();
    const row = screen.getByText("BTCUSDT").closest("button");
    expect(row).not.toBeNull();
    fireEvent.click(row as HTMLButtonElement);
    expect(props.onSelectSymbol).toHaveBeenCalledWith(expect.objectContaining({ id: "BTCUSDT" }));
    expect(props.onSelectView).toHaveBeenCalledWith("chart");
    expect(props.onClose).toHaveBeenCalled();
  });

  it("tells the user when nothing matches", () => {
    setup();
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "zzzzz" } });
    expect(screen.getByText("没有匹配的结果")).toBeInTheDocument();
  });
});
