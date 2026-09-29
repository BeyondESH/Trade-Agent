// @vitest-environment jsdom
// Research view tests: list/detail render, empty + error states, the SSE
// execution timeline (real `openResearchStream` over a FakeEventSource) and the
// read-only constraint. The REST methods are mocked; the SSE helper is real so
// its parsing/dispatch is exercised.
import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "../../api/client";
import type { ProposalMeta, StrategyProposal } from "../../api/types";
import { ResearchView } from "./ResearchView";

vi.mock("../../api/client", async (importOriginal) => {
  const mod = await importOriginal<typeof import("../../api/client")>();
  return {
    ...mod,
    api: {
      ...mod.api,
      researchProposals: vi.fn(),
      researchProposal: vi.fn(),
      executionRun: vi.fn(),
    },
  };
});

class FakeEventSource {
  static instances: FakeEventSource[] = [];
  url: string;
  closed = false;
  listeners = new Map<string, Set<(e: { data: string }) => void>>();
  onopen: (() => void) | null = null;
  onerror: (() => void) | null = null;

  constructor(url: string) {
    this.url = url;
    FakeEventSource.instances.push(this);
  }

  addEventListener(type: string, cb: (e: { data: string }) => void) {
    const set = this.listeners.get(type) ?? new Set();
    set.add(cb);
    this.listeners.set(type, set);
  }

  emit(type: string, data: unknown) {
    const cbs = this.listeners.get(type);
    if (!cbs) return;
    for (const cb of cbs) cb({ data: JSON.stringify(data) });
  }

  close() {
    this.closed = true;
  }
}

const META_A: ProposalMeta = {
  proposal_id: "p-a",
  produced_at: 1_700_000_000,
  expires_at: 1_700_003_600,
  symbol: "BTCUSDT",
  category: "USDT-FUTURES",
  timeframe: "1h",
  action: "open_long",
  confidence: 0.72,
};

const META_B: ProposalMeta = {
  ...META_A,
  proposal_id: "p-b",
  symbol: "ETHUSDT",
  action: "flat",
  confidence: 0.4,
};

const DETAIL_A: StrategyProposal = {
  ...META_A,
  entry: { kind: "limit", price: 42000 },
  stop_loss: 40000,
  take_profit: 46000,
  horizon: "3d",
  rationale: "突破关键阻力且资金面转多。",
  evidence: ["https://example.com/news-a", "https://example.com/analysis-b"],
  provenance: { model: "anthropic:claude", prompt_ver: "v3", research_thread_id: "research:42" },
};

describe("ResearchView", () => {
  beforeEach(() => {
    FakeEventSource.instances = [];
    (globalThis as unknown as { EventSource: unknown }).EventSource = FakeEventSource;
    vi.mocked(api.researchProposals).mockReset();
    vi.mocked(api.researchProposal).mockReset();
    vi.mocked(api.executionRun).mockReset();
    // projection 404 is tolerated; the stream is the source of truth
    vi.mocked(api.executionRun).mockRejectedValue(new Error("404"));
    vi.mocked(api.researchProposal).mockResolvedValue(DETAIL_A);
  });

  afterEach(() => {
    delete (globalThis as unknown as { EventSource: unknown }).EventSource;
  });

  it("renders the proposal list and opens detail with evidence on click", async () => {
    vi.mocked(api.researchProposals).mockResolvedValue({ proposals: [META_A, META_B] });
    render(<ResearchView theme="dark" />);

    await screen.findByTestId("proposal-list");
    expect(screen.getByTestId("research-readonly-badge")).toBeTruthy();

    fireEvent.click(screen.getByTestId("proposal-p-a"));

    const detail = await screen.findByTestId("proposal-detail");
    expect(detail.textContent).toContain("突破关键阻力且资金面转多。");
    expect(screen.getByTestId("proposal-evidence").textContent).toContain(
      "https://example.com/news-a",
    );
    expect(screen.getByTestId("proposal-provenance").textContent).toContain("v3");
    expect(api.researchProposal).toHaveBeenCalledWith("p-a");
  });

  it("shows an empty state when there are no proposals", async () => {
    vi.mocked(api.researchProposals).mockResolvedValue({ proposals: [] });
    render(<ResearchView theme="dark" />);

    await screen.findByTestId("research-empty");
    expect(screen.queryByTestId("proposal-list")).toBeNull();
  });

  it("shows an error state and recovers after retry", async () => {
    vi.mocked(api.researchProposals).mockRejectedValueOnce(new Error("boom"));
    render(<ResearchView theme="dark" />);

    await screen.findByTestId("research-error");
    expect(screen.getByTestId("research-error").textContent).toContain("boom");

    vi.mocked(api.researchProposals).mockResolvedValue({ proposals: [META_A] });
    fireEvent.click(screen.getByTestId("research-retry"));

    await screen.findByTestId("proposal-list");
  });

  it("appends SSE node events and surfaces a fail-closed reason", async () => {
    vi.mocked(api.researchProposals).mockResolvedValue({ proposals: [META_A] });
    render(<ResearchView theme="dark" />);

    fireEvent.click(await screen.findByTestId("proposal-p-a"));
    await screen.findByTestId("proposal-detail");

    const es = FakeEventSource.instances[0];
    expect(es).toBeTruthy();
    expect(es.url).toContain("/research/exec%3Ap-a/stream");

    act(() => {
      es.onopen?.();
      es.emit("node", { type: "node", node: "risk_gate" });
      es.emit("node", { type: "node", node: "size_position", detail: "qty=0.5" });
    });

    expect(await screen.findByTestId("timeline-event-0")).toBeTruthy();
    expect(screen.getByTestId("timeline-event-1").textContent).toContain("qty=0.5");

    act(() => {
      es.emit("error", { type: "error", message: "max drawdown breached" });
    });

    const reason = await screen.findByTestId("timeline-fail-reason");
    expect(reason.textContent).toContain("max drawdown breached");
    expect(screen.getByTestId("timeline-terminal-failed")).toBeTruthy();
  });

  it("renders no order / mutation controls (read-only)", async () => {
    vi.mocked(api.researchProposals).mockResolvedValue({ proposals: [META_A] });
    const { container } = render(<ResearchView theme="dark" />);

    fireEvent.click(await screen.findByTestId("proposal-p-a"));
    await screen.findByTestId("proposal-detail");

    expect(screen.queryByText(/买入|卖出|下单|buy|sell|place order/i)).toBeNull();
    expect(container.querySelectorAll('input[type="submit"], button[type="submit"]').length).toBe(
      0,
    );
    expect(container.querySelectorAll('[data-testid*="order"]').length).toBe(0);
    // no form input besides the read-only symbol filter
    const inputs = container.querySelectorAll("input");
    expect(inputs.length).toBe(1);
    expect(inputs[0].getAttribute("data-testid")).toBe("research-symbol-filter");
  });
});
