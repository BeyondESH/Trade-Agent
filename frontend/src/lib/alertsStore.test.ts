// @vitest-environment jsdom
import { describe, expect, it, beforeEach, vi } from "vitest";
import {
  createAlert,
  evalAlert,
  loadAlerts,
  mirrorAlertCreate,
  mirrorAlertDelete,
  mirrorAlertUpdate,
  saveAlerts,
  subscribeAlerts,
  syncAlertsFromServer,
} from "./alertsStore";

const m = vi.hoisted(() => ({
  alerts: vi.fn(),
  saveAlert: vi.fn(),
  updateAlert: vi.fn(),
  deleteAlert: vi.fn(),
}));

vi.mock("../api/client", () => ({
  api: {
    alerts: m.alerts,
    saveAlert: m.saveAlert,
    updateAlert: m.updateAlert,
    deleteAlert: m.deleteAlert,
  },
}));

beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
});

describe("alertsStore", () => {
  it("persists alerts and reloads them", () => {
    saveAlerts([createAlert({ symbol: "BTCUSDT", condition: "above", threshold: 70000, enabled: true })]);
    const loaded = loadAlerts();
    expect(loaded).toHaveLength(1);
    expect(loaded[0].symbol).toBe("BTCUSDT");
    expect(loaded[0].triggered).toBe(false);
  });

  it("returns an empty list when storage is empty or corrupt", () => {
    expect(loadAlerts()).toEqual([]);
    localStorage.setItem("raibro.alerts", "{oops");
    expect(loadAlerts()).toEqual([]);
  });

  it("triggers above/below conditions exactly once", () => {
    const above = createAlert({ symbol: "BTCUSDT", condition: "above", threshold: 70000, enabled: true });
    const below = createAlert({ symbol: "BTCUSDT", condition: "below", threshold: 60000, enabled: true });
    expect(evalAlert(above, 69999)).toBe(false);
    expect(evalAlert(above, 70000)).toBe(true);
    expect(evalAlert({ ...above, triggered: true }, 71000)).toBe(false);
    expect(evalAlert(below, 60001)).toBe(false);
    expect(evalAlert(below, 60000)).toBe(true);
  });

  it("does not evaluate disabled alerts", () => {
    const a = createAlert({ symbol: "BTCUSDT", condition: "above", threshold: 1, enabled: false });
    expect(evalAlert(a, 99999)).toBe(false);
  });

  it("notifies subscribers when alerts are saved", () => {
    const spy = vi.fn();
    const off = subscribeAlerts(spy);
    saveAlerts([createAlert({ symbol: "BTCUSDT", condition: "above", threshold: 1, enabled: true })]);
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy.mock.calls[0][0]).toHaveLength(1);
    off();
    saveAlerts([]);
    expect(spy).toHaveBeenCalledTimes(1); // unsubscribed
  });
});

describe("alertsStore server sync", () => {
  it("syncAlertsFromServer merges server list and persists it", async () => {
    m.alerts.mockResolvedValue({
      alerts: [
        { id: "s1", symbol: "ETHUSDT", condition: "below", threshold: 2500, enabled: true, triggered: false, createdAt: 1 },
      ],
    });
    // a local-only alert that the server does not know about
    saveAlerts([createAlert({ symbol: "SOLUSDT", condition: "above", threshold: 9, enabled: true })]);
    const merged = await syncAlertsFromServer();
    expect(merged).not.toBeNull();
    expect(merged!.map((a) => a.symbol).sort()).toEqual(["ETHUSDT", "SOLUSDT"]);
    expect(loadAlerts()).toHaveLength(2);
  });

  it("syncAlertsFromServer returns null when the backend is unreachable", async () => {
    m.alerts.mockRejectedValue(new Error("offline"));
    expect(await syncAlertsFromServer()).toBeNull();
    expect(loadAlerts()).toEqual([]);
  });

  it("mirrors are best-effort and never throw", () => {
    m.saveAlert.mockRejectedValue(new Error("offline"));
    m.updateAlert.mockRejectedValue(new Error("offline"));
    m.deleteAlert.mockRejectedValue(new Error("offline"));
    const a = createAlert({ symbol: "BTCUSDT", condition: "above", threshold: 1, enabled: true });
    expect(() => mirrorAlertCreate(a)).not.toThrow();
    expect(() => mirrorAlertUpdate(a.id, { triggered: true })).not.toThrow();
    expect(() => mirrorAlertDelete(a.id)).not.toThrow();
  });

  it("mirrors call the corresponding server endpoints", () => {
    m.saveAlert.mockResolvedValue({ ok: true });
    m.updateAlert.mockResolvedValue({ ok: true });
    m.deleteAlert.mockResolvedValue({ ok: true });
    const a = createAlert({ symbol: "BTCUSDT", condition: "above", threshold: 1, enabled: true });
    mirrorAlertCreate(a);
    expect(m.saveAlert).toHaveBeenCalledWith(a);
    mirrorAlertUpdate(a.id, { enabled: false });
    expect(m.updateAlert).toHaveBeenCalledWith(a.id, { enabled: false });
    mirrorAlertDelete(a.id);
    expect(m.deleteAlert).toHaveBeenCalledWith(a.id);
  });
});
