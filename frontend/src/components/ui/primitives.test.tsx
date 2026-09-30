// @vitest-environment jsdom
import { act, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FlashNumber } from "./flash-number";
import { Kbd } from "./kbd";
import { Reveal } from "./reveal";
import { Skeleton } from "./skeleton";
import { Sparkline } from "./sparkline";

describe("Sparkline", () => {
  it("draws a line, an area fill and an end-point marker", () => {
    const { container } = render(<Sparkline values={[1, 3, 2]} up />);
    expect(container.querySelector("polyline")).not.toBeNull();
    expect(container.querySelector("polygon")).not.toBeNull();
    expect(container.querySelector("circle")).not.toBeNull();
    expect(container.querySelector("svg")?.getAttribute("class")).toContain("text-up");
  });

  it("renders nothing with fewer than two points", () => {
    const { container } = render(<Sparkline values={[5]} up={false} />);
    expect(container.querySelector("svg")).toBeNull();
  });

  it("marks a falling series with the down tone", () => {
    const { container } = render(<Sparkline values={[5, 4]} up={false} />);
    expect(container.querySelector("svg")?.getAttribute("class")).toContain("text-down");
  });
});

describe("FlashNumber", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("renders the formatted value", () => {
    render(<FlashNumber value={1234.5} format={(v) => v.toFixed(2)} />);
    expect(screen.getByText("1234.50")).toBeInTheDocument();
  });

  it("washes the cell on an uptick and clears shortly after", () => {
    vi.useFakeTimers();
    const { rerender } = render(<FlashNumber value={10} format={(v) => `${v}`} />);
    rerender(<FlashNumber value={11} format={(v) => `${v}`} />);
    expect(screen.getByText("11").className).toContain("bg-up/25");
    act(() => {
      vi.advanceTimersByTime(500);
    });
    expect(screen.getByText("11").className).not.toContain("bg-up/25");
  });

  it("flags a downtick with the down wash", () => {
    const { rerender } = render(<FlashNumber value={10} format={(v) => `${v}`} />);
    rerender(<FlashNumber value={9} format={(v) => `${v}`} />);
    expect(screen.getByText("9").className).toContain("bg-down/25");
  });

  it("colours signed values by sign when asked to", () => {
    const { rerender } = render(<FlashNumber value={-2} format={(v) => `${v}`} tone="signed" />);
    expect(screen.getByText("-2").className).toContain("text-down");
    rerender(<FlashNumber value={3} format={(v) => `${v}`} tone="signed" />);
    expect(screen.getByText("3").className).toContain("text-up");
  });
});

describe("Skeleton", () => {
  it("is hidden from assistive tech and shimmers", () => {
    const { container } = render(<Skeleton className="h-4" />);
    const el = container.firstElementChild as HTMLElement;
    expect(el.getAttribute("aria-hidden")).toBe("true");
    expect(el.querySelector("div")?.className).toContain("animate-");
  });
});

describe("Kbd", () => {
  it("renders its shortcut inside a kbd element", () => {
    render(<Kbd>⌘K</Kbd>);
    expect(screen.getByText("⌘K").tagName).toBe("KBD");
  });
});

describe("Reveal", () => {
  it("renders its children", () => {
    render(
      <Reveal delay={1}>
        <span>content</span>
      </Reveal>,
    );
    expect(screen.getByText("content")).toBeInTheDocument();
  });
});
