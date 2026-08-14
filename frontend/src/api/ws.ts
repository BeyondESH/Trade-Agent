import type { SeriesRef, Snapshot } from "./types";

export interface SnapshotConn {
  close: () => void;
}

/** Connect to the /ws snapshot stream. Calls onMsg for each snapshot. */
export function connectSnapshot(
  series: SeriesRef,
  onMsg: (snap: Snapshot) => void,
  interval = 5,
): SnapshotConn {
  const proto = window.location.protocol === "https:" ? "wss" : "ws";
  const url =
    `${proto}://${window.location.host}/ws` +
    `?symbol=${series.symbol}&timeframe=${series.timeframe}` +
    `&category=${series.category}&interval=${interval}`;
  const sock = new WebSocket(url);
  sock.onmessage = (ev) => {
    try {
      onMsg(JSON.parse(ev.data) as Snapshot);
    } catch {
      /* ignore malformed */
    }
  };
  return {
    close: () => {
      sock.close();
    },
  };
}
