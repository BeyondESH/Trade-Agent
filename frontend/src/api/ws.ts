import type { SeriesRef, Snapshot } from "./types";

export type ConnStatus = "live" | "reconnecting" | "closed";

export interface SnapshotConn {
  close: () => void;
}

/**
 * Connect to the /ws snapshot stream. Calls onMsg for each snapshot.
 * Reconnects automatically with capped exponential backoff when the socket
 * drops (unless closed manually via the returned handle), and reports
 * connection lifecycle through onStatus.
 */
export function connectSnapshot(
  series: SeriesRef,
  onMsg: (snap: Snapshot) => void,
  interval = 5,
  onStatus?: (state: ConnStatus) => void,
): SnapshotConn {
  const proto = window.location.protocol === "https:" ? "wss" : "ws";
  const url =
    `${proto}://${window.location.host}/ws` +
    `?symbol=${series.symbol}&timeframe=${series.timeframe}` +
    `&category=${series.category}&interval=${interval}`;

  let sock: WebSocket | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let retry = 0;
  let manualClose = false;

  const open = (): void => {
    const s = new WebSocket(url);
    sock = s;
    s.onopen = () => {
      retry = 0;
      onStatus?.("live");
    };
    s.onmessage = (ev) => {
      try {
        onMsg(JSON.parse(ev.data) as Snapshot);
      } catch {
        /* ignore malformed */
      }
    };
    s.onclose = () => {
      if (sock !== s) return;
      sock = null;
      if (manualClose) return;
      onStatus?.("reconnecting");
      retry += 1;
      timer = setTimeout(open, Math.min(500 * retry, 5000));
    };
    s.onerror = () => s.close();
  };

  open();

  return {
    close: () => {
      manualClose = true;
      if (timer != null) {
        clearTimeout(timer);
        timer = null;
      }
      const s = sock;
      sock = null;
      if (s) {
        s.onclose = null;
        s.close();
      }
      onStatus?.("closed");
    },
  };
}
