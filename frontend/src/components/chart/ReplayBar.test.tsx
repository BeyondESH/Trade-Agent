// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ReplayBar, type ReplayPaperState } from "./ReplayBar";
import type { ReplaySnapshot } from "../../lib/replayEngine";

const SNAP: ReplaySnapshot = {
  active: true,
  playing: false,
  speed: 1,
  cursor: 10,
  total: 100,
  timestamp: 1_700_000_000_000,
};

const PAPER: ReplayPaperState = {
  realized: 25.5,
  floating: -3.2,
  openPositions: 1,
  trades: 3,
  wins: 2,
};

const t = (k: string) => k;

function setup() {
  const cb = {
    onPlayToggle: vi.fn(),
    onStep: vi.fn(),
    onSpeed: vi.fn(),
    onSeek: vi.fn(),
    onExit: vi.fn(),
    onOrder: vi.fn(),
    onCloseAll: vi.fn(),
  };
  render(<ReplayBar snap={SNAP} paper={PAPER} t={t} {...cb} />);
  return cb;
}

describe("ReplayBar", () => {
  it("renders mode, time and pnl figures", () => {
    setup();
    expect(screen.getByTestId("replay-bar")).toBeInTheDocument();
    expect(screen.getByText("replay.mode")).toBeInTheDocument();
    expect(screen.getByText(/25\.50/)).toBeInTheDocument();
    expect(screen.getByText(/-3\.20/)).toBeInTheDocument();
  });

  it("drives play/step/speed/exit callbacks", () => {
    const cb = setup();
    fireEvent.click(screen.getByTestId("replay-play-toggle"));
    expect(cb.onPlayToggle).toHaveBeenCalled();
    fireEvent.click(screen.getByTestId("replay-step"));
    expect(cb.onStep).toHaveBeenCalled();
    fireEvent.click(screen.getByTestId("replay-speed-10"));
    expect(cb.onSpeed).toHaveBeenCalledWith(10);
    fireEvent.click(screen.getByTestId("replay-exit"));
    expect(cb.onExit).toHaveBeenCalled();
  });

  it("opens long/short/close-all with the qty input", () => {
    const cb = setup();
    fireEvent.change(screen.getByTestId("replay-qty"), { target: { value: "2.5" } });
    fireEvent.click(screen.getByTestId("replay-buy"));
    expect(cb.onOrder).toHaveBeenCalledWith("long", 2.5);
    fireEvent.click(screen.getByTestId("replay-sell"));
    expect(cb.onOrder).toHaveBeenCalledWith("short", 2.5);
    fireEvent.click(screen.getByTestId("replay-close-all"));
    expect(cb.onCloseAll).toHaveBeenCalled();
    expect(screen.getByTestId("replay-close-all").textContent).toContain("1");
  });

  it("seeks along the timeline", () => {
    const cb = setup();
    fireEvent.change(screen.getByTestId("replay-seek"), { target: { value: "42" } });
    expect(cb.onSeek).toHaveBeenCalledWith(42);
  });

  it("shows Pause label while playing", () => {
    render(<ReplayBar snap={{ ...SNAP, playing: true }} paper={PAPER} t={t} {...{ onPlayToggle: () => {}, onStep: () => {}, onSpeed: () => {}, onSeek: () => {}, onExit: () => {}, onOrder: () => {}, onCloseAll: () => {} }} />);
    expect(screen.getByTestId("replay-play-toggle").textContent).toBe("replay.pause");
  });
});
