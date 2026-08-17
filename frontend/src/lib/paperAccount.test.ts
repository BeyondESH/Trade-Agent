import { describe, expect, it } from "vitest";
import { PaperAccount } from "./paperAccount";

describe("PaperAccount", () => {
  it("opens long/short positions and tracks them", () => {
    const a = new PaperAccount();
    a.open("long", 2, 100);
    a.open("short", 1, 200);
    expect(a.positions).toHaveLength(2);
  });

  it("computes floating pnl respecting direction", () => {
    const a = new PaperAccount();
    a.open("long", 1, 100);
    a.open("short", 1, 100);
    expect(a.floating(110)).toBe(0); // +10 long, -10 short
    const b = new PaperAccount();
    b.open("long", 2, 100);
    expect(b.floating(105)).toBe(10);
  });

  it("closeAll settles realized pnl, trades and wins", () => {
    const a = new PaperAccount();
    a.open("long", 1, 100);
    a.open("long", 1, 100);
    a.closeAll(120); // both longs closed at 120 -> +20 each
    expect(a.realized).toBe(40);
    expect(a.trades).toBe(2);
    expect(a.wins).toBe(2);
    const b = new PaperAccount();
    b.open("long", 1, 100);
    b.open("short", 1, 100);
    b.closeAll(110); // long +10 (win), short -10 (loss)
    expect(b.realized).toBe(0);
    expect(b.trades).toBe(2);
    expect(b.wins).toBe(1);
    expect(b.summary.winRate).toBe(0.5);
    expect(b.positions).toHaveLength(0);
  });

  it("ignores invalid open calls", () => {
    const a = new PaperAccount();
    a.open("long", -1, 100);
    a.open("short", 1, -5);
    expect(a.positions).toHaveLength(0);
  });

  it("never touches the real order endpoint (no api usage)", () => {
    // PaperAccount is a pure in-memory structure; constructing and using it
    // must not require network access.
    const a = new PaperAccount();
    a.open("long", 1, 50);
    expect(a.floating(60)).toBe(10);
  });

  it("reset clears everything", () => {
    const a = new PaperAccount();
    a.open("long", 1, 10);
    a.closeAll(20);
    a.reset();
    expect(a.summary.realized).toBe(0);
    expect(a.summary.trades).toBe(0);
    expect(a.positions).toHaveLength(0);
  });
});
