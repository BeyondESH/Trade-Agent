// @vitest-environment jsdom

import { fireEvent, render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { COMMUNITY_IDEAS_DATA } from "../../data/marketData";
import { CommunityIdeasView } from "./CommunityIdeasView";

describe("CommunityIdeasView filter + inert-control removal", () => {
  it("filters the (documented static) ideas by the active category", () => {
    const { container, getByTestId, queryByTestId } = render(
      <CommunityIdeasView onOpenChartWithTicker={vi.fn()} theme="dark" />,
    );
    expect(container.querySelectorAll('[data-testid^="community-idea-"]')).toHaveLength(
      COMMUNITY_IDEAS_DATA.length,
    );

    fireEvent.click(getByTestId("community-filter-crypto"));
    const cryptoIdeas = container.querySelectorAll('[data-testid^="community-idea-"]');
    expect(cryptoIdeas).toHaveLength(1);
    expect(cryptoIdeas[0].textContent).toContain("BTCUSDT.P");
    expect(queryByTestId("community-idea-idea-2")).toBeNull();

    fireEvent.click(getByTestId("community-filter-forex"));
    expect(container.querySelectorAll('[data-testid^="community-idea-"]')).toHaveLength(2);
  });

  it("does not render the unsupported comment / share controls", () => {
    const { container } = render(
      <CommunityIdeasView onOpenChartWithTicker={vi.fn()} theme="dark" />,
    );
    expect(container.querySelector(".lucide-message-square")).toBeNull();
    expect(container.querySelector(".lucide-share-2")).toBeNull();
  });
});
