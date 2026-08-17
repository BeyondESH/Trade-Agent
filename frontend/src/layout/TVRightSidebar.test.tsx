// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { TVRightSidebar, type RightTabDef } from "./TVRightSidebar";

const TABS: RightTabDef[] = [
  { id: "watchlist", labelKey: "sidebar.watchlist", icon: <span>W</span> },
  { id: "alerts", labelKey: "alerts.title", icon: <span>A</span> },
];

describe("TVRightSidebar", () => {
  it("renders the icon rail and opens the panel on tab click", () => {
    const onTabChange = vi.fn();
    render(
      <TVRightSidebar
        tabs={TABS}
        activeTab="watchlist"
        onTabChange={onTabChange}
        panelOpen
        onTogglePanel={vi.fn()}
        width={300}
        onWidthChange={vi.fn()}
        renderPanel={(id) => <div data-testid={`panel-${id}`} />}
      />,
    );
    expect(screen.getByTestId("rail-watchlist")).toBeInTheDocument();
    expect(screen.getByTestId("rail-alerts")).toBeInTheDocument();
    expect(screen.getByTestId("panel-watchlist")).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("rail-alerts"));
    expect(onTabChange).toHaveBeenCalledWith("alerts");
  });

  it("collapses the panel when the active tab is clicked again", () => {
    const onToggle = vi.fn();
    render(
      <TVRightSidebar
        tabs={TABS}
        activeTab="watchlist"
        onTabChange={vi.fn()}
        panelOpen
        onTogglePanel={onToggle}
        width={300}
        onWidthChange={vi.fn()}
        renderPanel={() => null}
      />,
    );
    fireEvent.click(screen.getByTestId("rail-watchlist"));
    expect(onToggle).toHaveBeenCalled();
  });

  it("reports width changes while dragging the left edge", () => {
    const onWidthChange = vi.fn();
    render(
      <TVRightSidebar
        tabs={TABS}
        activeTab="watchlist"
        onTabChange={vi.fn()}
        panelOpen
        onTogglePanel={vi.fn()}
        width={300}
        onWidthChange={onWidthChange}
        renderPanel={() => null}
      />,
    );
    const handle = screen.getByTestId("right-panel-drag");
    fireEvent.mouseDown(handle, { clientX: 400 });
    fireEvent.mouseMove(window, { clientX: 350 });
    fireEvent.mouseUp(window);
    // start 300 + (400-350) = 350
    expect(onWidthChange).toHaveBeenCalledWith(350);
  });
});
