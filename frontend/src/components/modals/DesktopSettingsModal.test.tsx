// @vitest-environment jsdom

import { fireEvent, render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { DesktopSettingsModal } from "./DesktopSettingsModal";

describe("DesktopSettingsModal", () => {
  it("only renders real settings (no inert toggles) and closes explicitly", () => {
    const onClose = vi.fn();
    const onToggleTheme = vi.fn();
    const { getByText, queryByText } = render(
      <DesktopSettingsModal isOpen onClose={onClose} theme="dark" onToggleTheme={onToggleTheme} />,
    );
    // Removed inert switches must be gone.
    expect(queryByText("Hardware GPU Acceleration")).toBeNull();
    expect(queryByText("Crosshair Synchronization")).toBeNull();
    expect(queryByText("Instant Cloud Sync")).toBeNull();
    expect(queryByText("Audio Alerts & Execution Chimes")).toBeNull();

    // The real theme switch works.
    fireEvent.click(getByText("Dark Theme"));
    expect(onToggleTheme).toHaveBeenCalledTimes(1);

    // Save is now an explicit close.
    fireEvent.click(getByText("关闭"));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("renders nothing when closed", () => {
    const { container } = render(
      <DesktopSettingsModal
        isOpen={false}
        onClose={vi.fn()}
        theme="dark"
        onToggleTheme={vi.fn()}
      />,
    );
    expect(container.firstChild).toBeNull();
  });
});
