// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ChartContextMenu } from "./ChartContextMenu";

describe("ChartContextMenu", () => {
  it("renders all items and fires their handlers", () => {
    const handlers = {
      onAlert: vi.fn(),
      onIndicator: vi.fn(),
      onCopy: vi.fn(),
      onSettings: vi.fn(),
      onReset: vi.fn(),
      onClose: vi.fn(),
    };
    render(<ChartContextMenu x={100} y={100} {...handlers} />);
    expect(screen.getByTestId("ctx-menu")).toBeInTheDocument();
    fireEvent.click(screen.getByText("在此价格创建警报"));
    expect(handlers.onAlert).toHaveBeenCalled();
    fireEvent.click(screen.getByText("添加指标"));
    expect(handlers.onIndicator).toHaveBeenCalled();
    fireEvent.click(screen.getByText("复制价格"));
    expect(handlers.onCopy).toHaveBeenCalled();
    fireEvent.click(screen.getByText("重置视图"));
    expect(handlers.onReset).toHaveBeenCalled();
  });

  it("closes when the backdrop is clicked", () => {
    const onClose = vi.fn();
    render(
      <ChartContextMenu
        x={100}
        y={100}
        onClose={onClose}
        onAlert={vi.fn()}
        onIndicator={vi.fn()}
        onCopy={vi.fn()}
        onSettings={vi.fn()}
        onReset={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByTestId("ctx-backdrop"));
    expect(onClose).toHaveBeenCalled();
  });
});
