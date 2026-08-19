// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render } from "@testing-library/react";
import { PriceLineSettingsModal } from "./PriceLineSettingsModal";
import type { Alert } from "../../lib/alertsStore";

function makeAlert(partial: Partial<Alert> = {}): Alert {
  return {
    id: "alt-1",
    symbol: "BTCUSDT",
    condition: "above",
    threshold: 90000,
    enabled: true,
    triggered: false,
    createdAt: 1,
    ...partial,
  };
}

function renderModal(alert: Alert, extra: Partial<React.ComponentProps<typeof PriceLineSettingsModal>> = {}) {
  const onSave = vi.fn();
  const onDelete = vi.fn();
  const onClose = vi.fn();
  const utils = render(
    <PriceLineSettingsModal
      alert={alert}
      theme="dark"
      onSave={onSave}
      onDelete={onDelete}
      onClose={onClose}
      {...extra}
    />,
  );
  return { ...utils, onSave, onDelete, onClose };
}

describe("PriceLineSettingsModal", () => {
  it("echoes the current alert values", () => {
    const { getByTestId } = renderModal(makeAlert({ threshold: 90000, enabled: true, condition: "below" }));
    expect(getByTestId("price-line-settings-modal")).toBeTruthy();
    expect((getByTestId("price-line-settings-modal").querySelector('input[type="number"]') as HTMLInputElement).value).toBe("90000");
  });

  it("shows the condition selector only for alert lines", () => {
    const alert = renderModal(makeAlert({ enabled: true }));
    expect(alert.getByText("条件")).toBeTruthy();
    alert.unmount();
    const reference = renderModal(makeAlert({ enabled: false }));
    expect(reference.queryByText("条件")).toBeNull();
  });

  it("saves price, color, type and condition together", () => {
    const { getByTestId, getByText, onSave } = renderModal(makeAlert({ enabled: false, color: "" }));
    const priceInput = getByTestId("price-line-settings-modal").querySelector('input[type="number"]') as HTMLInputElement;
    fireEvent.change(priceInput, { target: { value: "96000" } });
    fireEvent.click(getByText("价格警报"));
    fireEvent.click(getByText("低于"));
    fireEvent.click(getByTestId("save-price-line"));
    expect(onSave).toHaveBeenCalledWith("alt-1", {
      threshold: 96000,
      color: undefined,
      enabled: true,
      condition: "below",
    });
  });

  it("rejects an invalid price and keeps the modal open", () => {
    const { getByTestId, onSave } = renderModal(makeAlert());
    const priceInput = getByTestId("price-line-settings-modal").querySelector('input[type="number"]') as HTMLInputElement;
    fireEvent.change(priceInput, { target: { value: "" } });
    fireEvent.click(getByTestId("save-price-line"));
    expect(onSave).not.toHaveBeenCalled();
  });

  it("deletes the line", () => {
    const { getByTestId, onDelete, onClose } = renderModal(makeAlert());
    fireEvent.click(getByTestId("delete-price-line"));
    expect(onDelete).toHaveBeenCalledWith("alt-1");
    expect(onClose).toHaveBeenCalled();
  });

  it("closes on Escape", () => {
    const { onClose } = renderModal(makeAlert());
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalled();
  });
});
