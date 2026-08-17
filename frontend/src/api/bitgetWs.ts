import type { Candle, SeriesRef } from "./types";

export type BitgetWsStatus = "live" | "reconnecting" | "closed";

export interface CandleSubHandle {
  close: () => void;
}

type CandleListener = (candle: Candle) => void;
type StatusListener = (state: BitgetWsStatus) => void;

interface SeriesEntry {
  series: SeriesRef;
  listeners: Set<CandleListener>;
  last: Candle | null;
}

/**
 * Single multiplexed candle WebSocket against the backend `/ws` relay (which
 * itself streams Bitget data). Every series subscription in the app shares this
 * one socket, so there is exactly one live candle stream per distinct
 * `category:symbol:timeframe`, shared across all subscribers. It dedupes
 * subscriptions, reconnects with capped backoff, re-subscribes every active
 * series once on reconnect, and drops repeated identical candles so a quiet
 * market never re-emits the same bar on a timer.
 */
export class BitgetWsClient {
  private sock: WebSocket | null = null;
  private series = new Map<string, SeriesEntry>();
  private statusListeners = new Set<StatusListener>();
  private live = false;
  private retry = 0;
  private manualClose = false;

  /** `category:symbol:timeframe` uniquely identifies a live candle stream. */
  seriesKey(series: SeriesRef): string {
    return `${series.category}:${series.symbol}:${series.timeframe}`;
  }

  /** Register a candle listener for a series; returns a handle to stop it. */
  subscribe(series: SeriesRef, onCandle: CandleListener): CandleSubHandle {
    this.manualClose = false;
    const key = this.seriesKey(series);
    let entry = this.series.get(key);
    if (!entry) {
      entry = { series: { ...series }, listeners: new Set(), last: null };
      this.series.set(key, entry);
      this.sendOp("subscribe", entry.series);
    }
    entry.listeners.add(onCandle);
    this.ensureOpen();
    return {
      close: () => this.unsubscribe(key, onCandle),
    };
  }

  onStatus(listener: StatusListener): () => void {
    this.statusListeners.add(listener);
    return () => {
      this.statusListeners.delete(listener);
    };
  }

  private unsubscribe(key: string, listener: CandleListener): void {
    const entry = this.series.get(key);
    if (!entry) return;
    entry.listeners.delete(listener);
    if (entry.listeners.size === 0) {
      this.series.delete(key);
      this.sendOp("unsubscribe", entry.series);
    }
  }

  private sendOp(op: "subscribe" | "unsubscribe", series: SeriesRef): void {
    if (!this.sock || !this.live) return;
    this.sock.send(
      JSON.stringify({
        op,
        args: [
          {
            channel: "candle",
            symbol: series.symbol,
            category: series.category,
            timeframe: series.timeframe,
          },
        ],
      }),
    );
  }

  /** Open lazily; a no-op when already open/connecting. */
  ensureOpen(): void {
    if (this.sock && this.live) return;
    if (this.sock) return; // connecting
    this.open();
  }

  private status(state: BitgetWsStatus): void {
    for (const fn of [...this.statusListeners]) {
      try {
        fn(state);
      } catch {
        /* a broken listener must not break the client */
      }
    }
  }

  private open(): void {
    const proto = window.location.protocol === "https:" ? "wss" : "ws";
    const url = `${proto}://${window.location.host}/ws`;
    const sock = new WebSocket(url) as WebSocket & { send(data: string): void };
    this.sock = sock;
    this.live = false;
    sock.onopen = () => {
      if (this.sock !== sock) return;
      this.live = true;
      this.retry = 0;
      // Re-subscribe every active series exactly once after a reconnect.
      for (const entry of this.series.values()) {
        this.sendOp("subscribe", entry.series);
      }
      this.status("live");
    };
    sock.onmessage = (ev: MessageEvent) => {
      let frame: {
        channel?: string;
        symbol?: string;
        category?: string;
        data?: { last_candle?: Candle };
      };
      try {
        frame = JSON.parse(ev.data as string);
      } catch {
        return;
      }
      if (frame.channel !== "candle" || !frame.data?.last_candle) return;
      this.deliver(frame.symbol ?? "", frame.category ?? "USDT-FUTURES", frame.data.last_candle);
    };
    sock.onclose = () => {
      if (this.sock !== sock) return;
      this.sock = null;
      this.live = false;
      if (this.manualClose) return;
      if (this.series.size > 0) {
        this.status("reconnecting");
        this.retry += 1;
        window.setTimeout(() => this.open(), Math.min(500 * this.retry, 5000));
      }
    };
    sock.onerror = () => sock.close();
  }

  /** Fan a candle out to every matching series, skipping unchanged buckets. */
  private deliver(symbol: string, category: string, candle: Candle): void {
    for (const entry of this.series.values()) {
      const s = entry.series;
      if (s.symbol !== symbol || s.category !== category) continue;
      if (entry.last && sameCandle(entry.last, candle)) continue; // no duplicate re-delivery
      entry.last = candle;
      for (const fn of [...entry.listeners]) {
        try {
          fn(candle);
        } catch {
          /* a broken listener must not break the client */
        }
      }
    }
  }

  /** Close the socket and drop all subscriptions (used by tests/teardown). */
  teardown(): void {
    this.manualClose = true;
    this.series.clear();
    this.retry = 0;
    this.live = false;
    const s = this.sock;
    this.sock = null;
    if (s) {
      s.onclose = null;
      s.close();
    }
    this.status("closed");
    this.statusListeners.clear();
  }
}

function sameCandle(a: Candle, b: Candle): boolean {
  return (
    a.open_time === b.open_time &&
    a.open === b.open &&
    a.high === b.high &&
    a.low === b.low &&
    a.close === b.close &&
    a.volume === b.volume
  );
}

/** Shared candle socket for the whole app. */
export const bitgetWs = new BitgetWsClient();
