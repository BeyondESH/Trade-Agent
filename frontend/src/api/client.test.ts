import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError, api } from "./client";

function mockFetch(status: number, body: unknown) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({
      ok: status >= 200 && status < 300,
      status,
      statusText: "err",
      json: async () => body,
    })),
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("api client", () => {
  it("parses JSON on 2xx", async () => {
    mockFetch(200, { price: 100, indicators: {}, levels: [] });
    const r = await api.analyze({ category: "USDT-FUTURES", symbol: "BTCUSDT", timeframe: "5m" });
    expect(r.price).toBe(100);
  });

  it("throws ApiError on non-2xx with detail", async () => {
    mockFetch(422, { detail: "insufficient data" });
    await expect(
      api.analyze({ category: "USDT-FUTURES", symbol: "BTCUSDT", timeframe: "5m" }),
    ).rejects.toMatchObject({ status: 422, message: "insufficient data" });
  });

  it("order returns a token", async () => {
    mockFetch(200, { token: "abc", preview: { margin: 50 } });
    const r = await api.order({
      category: "USDT-FUTURES", symbol: "BTCUSDT", side: "long", leverage: 100, price: 100,
    });
    expect(r.token).toBe("abc");
  });

  it("ApiError is an Error subclass", () => {
    expect(new ApiError(400, "x")).toBeInstanceOf(Error);
  });
});
