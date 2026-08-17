import type { Period, SymbolInfo } from "@klinecharts/pro";

export type SyncKind = "symbol" | "period" | "crosshair" | "range" | "draw";

export interface SyncFlags {
  symbol: boolean;
  period: boolean;
  crosshair: boolean;
  range: boolean;
  draw: boolean;
}

export const DEFAULT_SYNC_FLAGS: SyncFlags = {
  symbol: true,
  period: true,
  crosshair: true,
  range: true,
  draw: true,
};

export interface DrawPoint {
  timestamp?: number;
  value?: number;
}

export interface DrawSyncPayload {
  /** Logical drawing identity shared across cells. */
  opId: string;
  op: "create" | "override" | "remove";
  name?: string;
  points?: DrawPoint[];
  paneId?: string;
  styles?: Record<string, unknown>;
  /** `category:instId` of the source cell; drawings only mirror within the same symbol. */
  sourceSeries?: string;
}

export type SyncPayload =
  | { symbol: SymbolInfo }
  | { period: Period }
  | { timestamp: number | null }
  | { fromTs: number; toTs: number }
  | DrawSyncPayload;

export interface SyncEvent {
  kind: SyncKind;
  /** Index of the cell that produced the event. */
  origin: number;
  payload: SyncPayload;
}

export type SyncListener = (event: SyncEvent) => void;

/**
 * Cross-chart sync bus. Cells register per-index listeners; events are
 * delivered to every other cell (the origin never receives its own event).
 * Per-kind switches gate emission; a disabled kind is dropped entirely.
 */
export class ChartSyncBus {
  private listeners = new Map<number, SyncListener>();
  private flags: SyncFlags = { ...DEFAULT_SYNC_FLAGS };

  register(index: number, listener: SyncListener): () => void {
    this.listeners.set(index, listener);
    return () => {
      if (this.listeners.get(index) === listener) {
        this.listeners.delete(index);
      }
    };
  }

  setFlags(flags: SyncFlags): void {
    this.flags = { ...flags };
  }

  getFlags(): SyncFlags {
    return { ...this.flags };
  }

  isEnabled(kind: SyncKind): boolean {
    return this.flags[kind];
  }

  emit(kind: SyncKind, origin: number, payload: SyncPayload): void {
    if (!this.flags[kind]) return;
    for (const [idx, fn] of [...this.listeners]) {
      if (idx === origin) continue;
      try {
        fn({ kind, origin, payload });
      } catch {
        /* one broken cell must not break the bus */
      }
    }
  }

  clear(): void {
    this.listeners.clear();
    this.flags = { ...DEFAULT_SYNC_FLAGS };
  }
}

/** Shared bus instance for the app. */
export const chartSyncBus = new ChartSyncBus();
