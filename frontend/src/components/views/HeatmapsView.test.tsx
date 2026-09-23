// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { HeatmapsView } from "./HeatmapsView";

describe("HeatmapsView metric switch removal", () => {
  it("does not render the unsupported 24h/1w/1m metric toggle", () => {
    const { queryByRole } = render(<HeatmapsView onOpenChartWithTicker={vi.fn()} theme="dark" />);
    expect(queryByRole("button", { name: "24h" })).toBeNull();
    expect(queryByRole("button", { name: "1w" })).toBeNull();
    expect(queryByRole("button", { name: "1m" })).toBeNull();
  });

  it("renders localized headings instead of hardcoded English", () => {
    render(<HeatmapsView onOpenChartWithTicker={vi.fn()} theme="dark" />);
    expect(screen.getByText("实时可视化相对市值与板块表现。")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "标普 500 成分股" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "加密货币市值领先" })).toBeInTheDocument();
    expect(screen.getByText(/追踪总市值/)).toBeInTheDocument();
  });
});
