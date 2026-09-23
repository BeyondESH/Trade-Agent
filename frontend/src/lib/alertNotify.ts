const NOTIFY_KEY = "raibro.alerts.notify";

export type NotifyPermission = NotificationPermission | "unsupported";

/** True only where the Notification API is actually available. */
export function isNotifySupported(): boolean {
  return typeof window !== "undefined" && "Notification" in window;
}

/** Persisted user preference for browser notifications. */
export function isNotifyEnabled(): boolean {
  try {
    return localStorage.getItem(NOTIFY_KEY) === "1";
  } catch {
    return false;
  }
}

export function setNotifyEnabled(enabled: boolean): void {
  try {
    localStorage.setItem(NOTIFY_KEY, enabled ? "1" : "0");
  } catch {
    /* storage may be unavailable */
  }
}

export function notifyPermission(): NotifyPermission {
  return isNotifySupported() ? Notification.permission : "unsupported";
}

/**
 * Ask the browser for notification permission. MUST be invoked from a user
 * gesture (the AlertsPanel toggle); never called on mount.
 */
export async function requestNotifyPermission(): Promise<NotifyPermission> {
  if (!isNotifySupported()) return "unsupported";
  try {
    const permission = await Notification.requestPermission();
    if (permission === "granted") setNotifyEnabled(true);
    return permission;
  } catch {
    return "denied";
  }
}

/**
 * Send a browser notification, but only when the user opted in AND permission
 * is granted. Returns false (silently) otherwise so callers fall back to the
 * in-app toast.
 */
export function notifyAlert(title: string, body?: string): boolean {
  if (!isNotifySupported() || !isNotifyEnabled()) return false;
  if (Notification.permission !== "granted") return false;
  try {
    new Notification(title, body ? { body } : undefined);
    return true;
  } catch {
    return false;
  }
}
