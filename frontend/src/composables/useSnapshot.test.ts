// @vitest-environment jsdom
import { mount, flushPromises } from "@vue/test-utils";
import { defineComponent, ref } from "vue";
import { describe, expect, it, vi } from "vitest";

const closeFn = vi.fn();

vi.mock("../api/ws", () => ({
  connectSnapshot: (_series: unknown, onMsg: (s: unknown) => void) => {
    onMsg({ price: 123.4, portfolio: { equity: 1000, positions: [] } });
    return { close: closeFn };
  },
}));

import { useSnapshot } from "./useSnapshot";

const Host = defineComponent({
  setup() {
    const series = ref({ category: "USDT-FUTURES", symbol: "BTCUSDT", timeframe: "5m" });
    const snap = useSnapshot(series);
    return { snap };
  },
  template: `<div>{{ snap?.price ?? "none" }}</div>`,
});

describe("useSnapshot", () => {
  it("exposes the latest snapshot and closes on unmount", async () => {
    const w = mount(Host);
    await flushPromises();
    expect(w.text()).toContain("123.4");
    w.unmount();
    expect(closeFn).toHaveBeenCalled();
  });
});
