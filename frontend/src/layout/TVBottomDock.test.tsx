// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { TVBottomDock, type DockTabDef } from "./TVBottomDock";

const TABS: DockTabDef[] = [
  { id: "ai", labelKey: "dock.ai" },
  { id: "backtest", labelKey: "dock.backtest" },
];

describe("TVBottomDock", () => {
  it("renders a collapsed tab bar by default", () => {
    render(
      <TVBottomDock
        tabs={TABS}
        activeTab={null}
        onTabChange={vi.fn()}
        expanded={false}
        onToggle={vi.fn()}
        heightVh={30}
        onHeightChange={vi.fn()}
        renderPanel={() => <div data-testid="dock-content" />}
      />,
    );
    expect(screen.getByTestId("dock-tab-ai")).toBeInTheDocument();
    expect(screen.getByTestId("dock-tab-backtest")).toBeInTheDocument();
    expect(screen.queryByTestId("dock-content")).not.toBeInTheDocument();
  });

  it("expands and renders the selected panel", () => {
    render(
      <TVBottomDock
        tabs={TABS}
        activeTab="ai"
        onTabChange={vi.fn()}
        expanded
        onToggle={vi.fn()}
        heightVh={30}
        onHeightChange={vi.fn()}
        renderPanel={(id) => <div data-testid={`dock-content-${id}`} />}
      />,
    );
    expect(screen.getByTestId("dock-content-ai")).toBeInTheDocument();
  });

  it("applies heightVh as explicit height when expanded and none when collapsed", () => {
    const { rerender } = render(
      <TVBottomDock
        tabs={TABS}
        activeTab="ai"
        onTabChange={vi.fn()}
        expanded={false}
        onToggle={vi.fn()}
        heightVh={32}
        onHeightChange={vi.fn()}
        renderPanel={() => <div data-testid="dock-panel-body" />}
      />,
    );
    expect(screen.getByTestId("tv-bottom-dock").style.height).toBe("");
    rerender(
      <TVBottomDock
        tabs={TABS}
        activeTab="ai"
        onTabChange={vi.fn()}
        expanded
        onToggle={vi.fn()}
        heightVh={32}
        onHeightChange={vi.fn()}
        renderPanel={() => <div data-testid="dock-panel-body" />}
      />,
    );
    expect(screen.getByTestId("tv-bottom-dock").style.height).toBe("32vh");
    expect(screen.getByTestId("dock-panel-body")).toBeInTheDocument();
  });

  it("keeps overflowing panel content clipped inside the dock", () => {
    render(
      <TVBottomDock
        tabs={TABS}
        activeTab="ai"
        onTabChange={vi.fn()}
        expanded
        onToggle={vi.fn()}
        heightVh={25}
        onHeightChange={vi.fn()}
        renderPanel={() => <div style={{ height: 9999 }} data-testid="oversized-panel" />}
      />,
    );
    expect(screen.getByTestId("tv-bottom-dock").style.height).toBe("25vh");
    const panel = screen.getByTestId("dock-panel");
    expect(panel.className).toContain("overflow-hidden");
    expect(panel.className).toContain("flex-1");
  });

  it("collapses when the active tab is clicked again", () => {
    const onToggle = vi.fn();
    render(
      <TVBottomDock
        tabs={TABS}
        activeTab="ai"
        onTabChange={vi.fn()}
        expanded
        onToggle={onToggle}
        heightVh={30}
        onHeightChange={vi.fn()}
        renderPanel={() => null}
      />,
    );
    fireEvent.click(screen.getByTestId("dock-tab-ai"));
    expect(onToggle).toHaveBeenCalled();
  });

  it("reports height changes while dragging the top edge", () => {
    const onHeightChange = vi.fn();
    window.innerHeight = 1000;
    render(
      <TVBottomDock
        tabs={TABS}
        activeTab="ai"
        onTabChange={vi.fn()}
        expanded
        onToggle={vi.fn()}
        heightVh={30}
        onHeightChange={onHeightChange}
        renderPanel={() => null}
      />,
    );
    const handle = screen.getByTestId("dock-drag");
    fireEvent.mouseDown(handle, { clientY: 500 });
    fireEvent.mouseMove(window, { clientY: 300 });
    fireEvent.mouseUp(window);
    // start 30 + (500-300)/10 = 50, clamped to DOCK_MAX_VH 40
    expect(onHeightChange).toHaveBeenCalledWith(40);
  });
});
