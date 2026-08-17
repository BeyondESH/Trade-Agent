// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AlertsPanel } from "./AlertsPanel";

describe("AlertsPanel", () => {
  it("creates an alert and shows it in the list", () => {
    render(
      <AlertsPanel symbols={["BTCUSDT", "ETHUSDT"]} priceMap={{ BTCUSDT: 60000 }} defaultSymbol="BTCUSDT" />,
    );
    fireEvent.change(screen.getByTestId("alert-threshold"), { target: { value: "65000" } });
    fireEvent.click(screen.getByTestId("alert-add"));
    expect(screen.getByTestId("alerts-panel").textContent).toContain("BTCUSDT");
    expect(screen.getByTestId("alerts-panel").textContent).toContain("65000");
  });

  it("marks an alert as triggered when the live price crosses the threshold", async () => {
    render(
      <AlertsPanel
        symbols={["BTCUSDT"]}
        priceMap={{ BTCUSDT: 60000 }}
        defaultSymbol="BTCUSDT"
      />,
    );
    fireEvent.change(screen.getByTestId("alert-threshold"), { target: { value: "55000" } });
    fireEvent.click(screen.getByTestId("alert-add"));
    // simulate a price tick crossing the threshold
    render(
      <AlertsPanel
        symbols={["BTCUSDT"]}
        priceMap={{ BTCUSDT: 54000 }}
        defaultSymbol="BTCUSDT"
      />,
    );
    await waitFor(() => {
      expect(screen.getAllByText(/已触发/).length).toBeGreaterThan(0);
    });
  });

  it("persists alerts across mounts", () => {
    const first = render(
      <AlertsPanel symbols={["BTCUSDT"]} priceMap={{}} defaultSymbol="BTCUSDT" />,
    );
    fireEvent.change(first.getByTestId("alert-threshold"), { target: { value: "70000" } });
    fireEvent.click(first.getByTestId("alert-add"));
    first.unmount();
    render(<AlertsPanel symbols={["BTCUSDT"]} priceMap={{}} defaultSymbol="BTCUSDT" />);
    expect(screen.getByTestId("alerts-panel").textContent).toContain("70000");
  });
});
