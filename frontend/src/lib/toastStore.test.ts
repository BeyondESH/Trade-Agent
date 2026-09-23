// @vitest-environment jsdom

import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { dismissToast, getToasts, pushToast, subscribeToasts, useToasts } from "./toastStore";

beforeEach(() => {
  vi.useFakeTimers();
  for (const toast of [...getToasts()]) dismissToast(toast.id);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("toastStore", () => {
  it("dedupes toasts by id", () => {
    pushToast({ id: "a", title: "first" });
    pushToast({ id: "a", title: "second" });
    expect(getToasts()).toHaveLength(1);
    expect(getToasts()[0].title).toBe("first");
  });

  it("auto-dismisses a toast after its ttl", () => {
    pushToast({ id: "a", title: "t" }, 1000);
    expect(getToasts()).toHaveLength(1);
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(getToasts()).toHaveLength(0);
  });

  it("notifies subscribers on push and dismiss", () => {
    const spy = vi.fn();
    const off = subscribeToasts(spy);
    pushToast({ id: "a", title: "t" });
    expect(spy).toHaveBeenCalledTimes(1);
    dismissToast("a");
    expect(spy).toHaveBeenCalledTimes(2);
    off();
    pushToast({ id: "b", title: "t" });
    expect(spy).toHaveBeenCalledTimes(2);
  });

  it("exposes the live list through useToasts", () => {
    const { result } = renderHook(() => useToasts());
    expect(result.current).toHaveLength(0);
    act(() => {
      pushToast({ id: "a", title: "t" });
    });
    expect(result.current).toHaveLength(1);
  });
});
