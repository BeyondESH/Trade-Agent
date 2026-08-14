// @vitest-environment jsdom
import { mount } from "@vue/test-utils";
import { describe, expect, it, vi } from "vitest";

const chartProps: any[] = [];
vi.mock("./Chart.vue", () => ({
  default: {
    name: "ChartStub",
    props: ["candles", "analyze", "structure", "layers", "indicators", "drawings", "lastCandle"],
    setup(props: any) {
      chartProps.push(props);
      return () => null;
    },
  },
}));

import ChartTerminal from "./ChartTerminal.vue";

describe("ChartTerminal", () => {
  it("forwards lastCandle to Chart.vue for incremental update", () => {
    const lastCandle = { timestamp: 5000, open: 1, high: 2, low: 0, close: 3, volume: 4 };
    const w = mount(ChartTerminal, {
      props: { candles: [], analyze: null, structure: null, lastCandle },
    });
    const props = chartProps[chartProps.length - 1];
    expect(props.lastCandle).toEqual(lastCandle);
    w.unmount();
  });

  it("forwards null lastCandle when realtime data absent", () => {
    const w = mount(ChartTerminal, {
      props: { candles: [], analyze: null, structure: null, lastCandle: null },
    });
    const props = chartProps[chartProps.length - 1];
    expect(props.lastCandle).toBeNull();
    w.unmount();
  });
});
