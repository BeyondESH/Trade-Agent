// @vitest-environment jsdom

import { fireEvent, render } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AlertItem, DesktopTab } from "../../types/trading";
import { DesktopTitleBar } from "./DesktopTitleBar";

const TABS: DesktopTab[] = [{ id: "tab-1", title: "BTCUSDT.P", type: "chart", isPinned: false }];

beforeEach(() => {
  Element.prototype.scrollIntoView = vi.fn();
});

function renderBar(triggeredAlerts: AlertItem[] = []) {
  const utils = render(
    <DesktopTitleBar
      tabs={TABS}
      activeTabId="tab-1"
      onSelectTab={vi.fn()}
      onCloseTab={vi.fn()}
      onNewTab={vi.fn()}
      onPinTab={vi.fn()}
      theme="dark"
      onToggleTheme={vi.fn()}
      onOpenCommandPalette={vi.fn()}
      onOpenDesktopSettings={vi.fn()}
      onOpenShortcutsModal={vi.fn()}
      triggeredAlerts={triggeredAlerts}
    />,
  );
  fireEvent.click(utils.getByTitle("通知"));
  return utils;
}

describe("DesktopTitleBar notifications", () => {
  it("shows an empty state and no fabricated entries when nothing triggered", () => {
    const { getByTestId, queryByTestId, queryByText } = renderBar([]);
    expect(getByTestId("notifications-empty")).toBeTruthy();
    expect(queryByTestId("notifications-badge")).toBeNull();
    expect(queryByText("新的 Pine 脚本更新")).toBeNull();
    expect(queryByText("Mark all read")).toBeNull();
  });

  it("lists real triggered alerts and shows the unread badge", () => {
    const alert: AlertItem = {
      id: "a1",
      symbol: "BTCUSDT",
      condition: "Greater Than",
      targetPrice: 96000,
      createdAt: "2026-01-01T00:00",
      enabled: true,
      triggered: true,
      triggerTime: "2026-01-01T00:00",
      note: "",
      frequency: "Every Time",
    };
    const { getByTestId, queryByTestId } = renderBar([alert]);
    expect(getByTestId("notifications-badge")).toBeTruthy();
    expect(getByTestId("notification-a1").textContent).toContain("BTCUSDT");
    expect(getByTestId("notification-a1").textContent).toContain("96000");
    expect(queryByTestId("notifications-empty")).toBeNull();
  });
});
