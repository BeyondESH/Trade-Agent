import { useCallback, useEffect, useRef, useState } from "react";

export interface WsFrame {
  channel: string;
  symbol?: string;
  category?: string;
  action?: "snapshot" | "update";
  event?: "subscribed" | "unsubscribed" | "pong";
  data?: unknown;
}

export interface SubArgs {
  channel: string;
  symbol?: string;
  timeframe?: string;
  category?: string;
}

type Listener = (frame: WsFrame) => void;

/** Raw subscribe/unsubscribe over a single shared exchange WS connection. */
export class ExchangeSocket {
  private sock: WebSocket | null = null;
  private listeners = new Map<string, Set<Listener>>();
  private active = new Map<string, SubArgs>();
  private retry = 0;

  private key(args: SubArgs): string {
    return `${args.channel}/${args.symbol ?? "default"}/${args.category ?? "USDT-FUTURES"}`;
  }

  /** Subscribe to a channel/symbol; the frame is delivered to the listener. */
  subscribe(args: SubArgs, listener: Listener): () => void {
    const k = this.key(args);
    let set = this.listeners.get(k);
    if (!set) {
      set = new Set();
      this.listeners.set(k, set);
    }
    set.add(listener);
    if (!this.active.has(k)) {
      this.active.set(k, { ...args });
      this.sendFrame({ op: "subscribe", args: [args] });
    }
    this.ensureOpen();
    return () => this.unsubscribe(args, listener);
  }

  unsubscribe(args: SubArgs, listener: Listener): void {
    const k = this.key(args);
    const set = this.listeners.get(k);
    if (!set) return;
    set.delete(listener);
    if (set.size === 0) {
      this.listeners.delete(k);
      if (this.active.has(k)) {
        this.active.delete(k);
        this.sendFrame({ op: "unsubscribe", args: [args] });
      }
    }
  }

  private ensureOpen(): void {
    if (this.sock && this.sock.readyState === WebSocket.OPEN) return;
    this.open();
  }

  private open(): void {
    if (this.sock && (this.sock.readyState === WebSocket.OPEN || this.sock.readyState === WebSocket.CONNECTING)) {
      return;
    }
    const proto = window.location.protocol === "https:" ? "wss" : "ws";
    const url = `${proto}://${window.location.host}/ws`;
    const sock = new WebSocket(url);
    this.sock = sock;
    sock.onopen = () => {
      this.retry = 0;
      // resubscribe everything that was requested while disconnected
      for (const args of this.active.values()) {
        this.sendFrame({ op: "subscribe", args: [args] });
      }
    };
    sock.onmessage = (ev) => {
      let frame: WsFrame;
      try {
        frame = JSON.parse(ev.data) as WsFrame;
      } catch {
        return;
      }
      const frameChannel = frame.channel;
      const frameSymbol = frame.symbol ?? "default";
      const frameCategory = (frame as { category?: string }).category ?? "USDT-FUTURES";
      // Deliver to every matching subscription: exact key, or any subscription
      // whose symbol is a wildcard (default / *) for the same channel+category.
      // This lets `ticker/default` receive per-instId update frames from the
      // backend instead of being stuck on the one-shot REST snapshot.
      for (const [k, args] of this.active) {
        if (args.channel !== frameChannel) continue;
        const subCat = args.category ?? "USDT-FUTURES";
        // category "*" matches every category (all-market ticker feed)
        if (subCat !== "*" && subCat !== frameCategory) continue;
        const subSym = args.symbol ?? "default";
        const isWildcard = subSym === "default" || subSym === "*" || subSym === "";
        if (!isWildcard && subSym !== frameSymbol) continue;
        const set = this.listeners.get(k);
        if (!set) continue;
        for (const fn of [...set]) {
          try {
            fn(frame);
          } catch {
            /* listener errors must not break the socket */
          }
        }
      }
    };
    sock.onclose = () => {
      this.sock = null;
      if (this.active.size > 0) {
        this.retry += 1;
        window.setTimeout(() => this.open(), Math.min(500 * this.retry, 5000));
      }
    };
    sock.onerror = () => sock.close();
  }

  private sendFrame(frame: Record<string, unknown>): void {
    if (this.sock && this.sock.readyState === WebSocket.OPEN) {
      this.sock.send(JSON.stringify(frame));
    }
  }

  /** Close the socket and clear all subscriptions (used by tests). */
  teardown(): void {
    this.active.clear();
    this.listeners.clear();
    if (this.sock) {
      this.sock.onclose = null;
      this.sock.close();
      this.sock = null;
    }
  }
}

/** Single shared socket for the whole app. */
export const exchangeSocket = new ExchangeSocket();

/** Subscribe to frames for a channel/symbol via the shared socket. */
export function useExchangeSocket(
  channel: string,
  symbol: string,
  onFrame: (frame: WsFrame) => void,
  extra?: Partial<SubArgs>,
): void {
  const fnRef = useRef(onFrame);
  fnRef.current = onFrame;

  useEffect(() => {
    const args: SubArgs = { channel, symbol, ...extra };
    const off = exchangeSocket.subscribe(args, (frame) => fnRef.current(frame));
    return off;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channel, symbol, JSON.stringify(extra ?? {})]);
}
