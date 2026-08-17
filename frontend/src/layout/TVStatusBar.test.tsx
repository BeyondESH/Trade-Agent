// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { TVStatusBar } from "./TVStatusBar";

function setup(conn?: "live" | "reconnecting" | "closed") {
  return render(
    <TVStatusBar symbol="BTCUSDT" price={60000} change={1.2} up={true} conn={conn} onTimezone={() => {}} />,
  );
}

describe("TVStatusBar connection badge", () => {
  it("shows the live badge by default", () => {
    setup();
    const badge = screen.getByTestId("conn-badge");
    expect(badge.dataset.conn).toBe("live");
    expect(badge.style.color).toBe("var(--tv-up)");
    expect(badge.textContent).toContain("实时");
  });

  it("shows the reconnecting badge", () => {
    setup("reconnecting");
    const badge = screen.getByTestId("conn-badge");
    expect(badge.dataset.conn).toBe("reconnecting");
    expect(badge.textContent).toContain("重连中");
  });

  it("shows the offline badge", () => {
    setup("closed");
    const badge = screen.getByTestId("conn-badge");
    expect(badge.dataset.conn).toBe("closed");
    expect(badge.textContent).toContain("已断开");
  });
});
