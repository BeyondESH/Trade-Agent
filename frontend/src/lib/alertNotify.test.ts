// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  isNotifyEnabled,
  isNotifySupported,
  notifyAlert,
  requestNotifyPermission,
  setNotifyEnabled,
} from "./alertNotify";

const notificationCtor = vi.fn();
let permission: NotificationPermission = "default";
const requestPermission = vi.fn(async () => permission);

class FakeNotification {
  static get permission(): NotificationPermission {
    return permission;
  }
  static requestPermission = requestPermission;
  constructor(title: string, options?: NotificationOptions) {
    notificationCtor(title, options);
  }
}

beforeEach(() => {
  localStorage.clear();
  notificationCtor.mockClear();
  requestPermission.mockClear();
  permission = "default";
  vi.stubGlobal("Notification", FakeNotification);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("alertNotify", () => {
  it("never requests permission on import (no auto-prompt)", () => {
    expect(requestPermission).not.toHaveBeenCalled();
  });

  it("degrades to no browser notification when the user has not opted in", () => {
    permission = "granted";
    expect(isNotifyEnabled()).toBe(false);
    expect(notifyAlert("Price Alert Triggered", "BTCUSDT")).toBe(false);
    expect(notificationCtor).not.toHaveBeenCalled();
  });

  it("does not send when permission is not granted", () => {
    setNotifyEnabled(true);
    permission = "default";
    expect(notifyAlert("Price Alert Triggered")).toBe(false);
    expect(notificationCtor).not.toHaveBeenCalled();
  });

  it("sends a browser notification once opted in and granted", () => {
    setNotifyEnabled(true);
    permission = "granted";
    expect(notifyAlert("Price Alert Triggered", "BTCUSDT \u2265 70000")).toBe(true);
    expect(notificationCtor).toHaveBeenCalledWith("Price Alert Triggered", {
      body: "BTCUSDT \u2265 70000",
    });
  });

  it("persists the opt-in only when permission is granted", async () => {
    permission = "granted";
    await expect(requestNotifyPermission()).resolves.toBe("granted");
    expect(isNotifyEnabled()).toBe(true);

    permission = "denied";
    await expect(requestNotifyPermission()).resolves.toBe("denied");
  });

  it("degrades safely when Notification is unsupported", async () => {
    vi.unstubAllGlobals();
    expect(isNotifySupported()).toBe(false);
    expect(notifyAlert("Price Alert Triggered")).toBe(false);
    await expect(requestNotifyPermission()).resolves.toBe("unsupported");
  });
});
