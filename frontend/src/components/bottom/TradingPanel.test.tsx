// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AccountState } from "../../types/trading";
import { TradingPanel } from "./TradingPanel";

const m = vi.hoisted(() => ({
  journal: vi.fn(),
  health: vi.fn(),
  control: vi.fn(),
}));

vi.mock("../../api/client", () => ({
  api: { journal: m.journal, health: m.health, control: m.control },
}));

const ACCOUNT: AccountState = {
  balance: 50000,
  equity: 50000,
  usedMargin: 0,
  freeMargin: 50000,
  realizedPnl: 0,
  unrealizedPnl: 0,
};

function renderPanel(overrides: Partial<Parameters<typeof TradingPanel>[0]> = {}) {
  return render(
    <TradingPanel
      account={ACCOUNT}
      positions={[]}
      orders={[]}
      onClosePosition={vi.fn()}
      onCancelOrder={vi.fn()}
      onOpenOrderModal={vi.fn()}
      onResetAccount={vi.fn()}
      theme="dark"
      {...overrides}
    />,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  // TradingPanel fetches run-control state from /health on mount; default to
  // a healthy backend unless a run-control test overrides it.
  m.health.mockResolvedValue({
    status: "ok",
    kill_switch: false,
    live_enabled: false,
  });
});

describe("TradingPanel trade history", () => {
  it("lazily fetches and renders journal records on tab activation", async () => {
    m.journal.mockResolvedValue({
      trades: [
        {
          id: "t1",
          symbol: "BTCUSDT",
          side: "long",
          entry_price: 100,
          exit_price: 110,
          pnl: 12.5,
          closed_at: 1700000000000,
          reflection: "take profit",
        },
      ],
    });
    renderPanel();

    // not fetched before the history tab is opened
    expect(m.journal).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "交易历史" }));

    expect(await screen.findByText("BTCUSDT")).toBeInTheDocument();
    expect(m.journal).toHaveBeenCalledTimes(1);
    expect(screen.getByText("多")).toBeInTheDocument();
    expect(screen.getByText("take profit")).toBeInTheDocument();
    const pnlCell = screen.getByText("+$12.50");
    expect(pnlCell).toHaveClass("text-[#089981]");
  });

  it("renders the empty state when the journal has no records", async () => {
    m.journal.mockResolvedValue({ trades: [] });
    renderPanel();

    fireEvent.click(screen.getByRole("button", { name: "交易历史" }));

    expect(await screen.findByText("暂无交易历史。")).toBeInTheDocument();
  });

  it("renders an error message when the journal request fails", async () => {
    m.journal.mockRejectedValue(new Error("backend down"));
    renderPanel();

    fireEvent.click(screen.getByRole("button", { name: "交易历史" }));

    expect(await screen.findByText("交易历史不可用:")).toBeInTheDocument();
    expect(screen.getByText("backend down")).toBeInTheDocument();
  });

  it("keeps the positions and orders tabs working (regression)", async () => {
    renderPanel();

    expect(screen.getByText("暂无持仓,使用上方买入/卖出进行模拟下单。")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /挂单/ }));
    expect(screen.getByText("暂无挂单或止损单。")).toBeInTheDocument();
    expect(m.journal).not.toHaveBeenCalled();
  });

  it("renders localized sub-tab labels (no raw English keys)", () => {
    renderPanel();

    expect(screen.getByRole("button", { name: "持仓 (0)" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "挂单 (0)" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "交易历史" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "券商概览" })).toBeInTheDocument();
  });
});

describe("TradingPanel run control & reset", () => {
  it("shows the halted state when health reports kill_switch=true", async () => {
    m.health.mockResolvedValue({
      status: "ok",
      kill_switch: true,
      live_enabled: false,
    });
    renderPanel();

    expect(await screen.findByTestId("kill-switch-state")).toHaveTextContent("交易已停止");
    expect(screen.getByTestId("kill-switch-toggle")).toBeEnabled(); // halted → click again to resume
  });

  it("calls api.control with kill_switch=true when toggled on", async () => {
    m.health.mockResolvedValue({
      status: "ok",
      kill_switch: false,
      live_enabled: false,
    });
    m.control.mockResolvedValue({ kill_switch: true, live_enabled: false });
    renderPanel();

    const toggle = await screen.findByTestId("kill-switch-toggle");
    expect(toggle).toBeEnabled();
    fireEvent.click(toggle);

    expect(m.control).toHaveBeenCalledWith({ kill_switch: true });
    expect(await screen.findByTestId("kill-switch-state")).toBeInTheDocument();
  });

  it("calls onResetAccount when Reset Funds is clicked", () => {
    m.health.mockResolvedValue({
      status: "ok",
      kill_switch: false,
      live_enabled: false,
    });
    const onResetAccount = vi.fn();
    renderPanel({ onResetAccount });

    fireEvent.click(screen.getByTestId("reset-account"));
    expect(onResetAccount).toHaveBeenCalledTimes(1);
  });

  it("leaves the control disabled when health is unavailable", async () => {
    m.health.mockRejectedValue(new Error("offline"));
    renderPanel();

    expect(await screen.findByTestId("kill-switch-toggle")).toBeDisabled();
    expect(screen.queryByTestId("kill-switch-state")).not.toBeInTheDocument();
  });
});
