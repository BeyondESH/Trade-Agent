import type { Candle } from "../api/types";

export type ReplaySpeed = 1 | 3 | 10;

export interface ReplaySnapshot {
  active: boolean;
  playing: boolean;
  speed: ReplaySpeed;
  cursor: number;
  total: number;
  timestamp: number | null;
}

const BASE_INTERVAL_MS = 500;

/**
 * Bar-replay engine: owns the full history of one symbol/period and a cursor;
 * `slice()` yields the data visible up to the current replay moment. The
 * chart is driven by applying the slice on every change; live data must be
 * suspended by the caller while a replay is active.
 */
export class ReplayEngine {
  private candles: Candle[] = [];
  private cursor = 0;
  private playing = false;
  private speed: ReplaySpeed = 1;
  private timer: ReturnType<typeof setInterval> | null = null;
  private listeners = new Set<() => void>();

  subscribe(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  }

  private notify(): void {
    for (const fn of [...this.listeners]) {
      try {
        fn();
      } catch {
        /* listener errors must not break the engine */
      }
    }
  }

  get snapshot(): ReplaySnapshot {
    return {
      active: this.candles.length > 0,
      playing: this.playing,
      speed: this.speed,
      cursor: this.cursor,
      total: this.candles.length,
      timestamp: this.candles[this.cursor]?.open_time ?? null,
    };
  }

  /** Load history and enter replay at `startCursor` (paused). */
  load(candles: Candle[], startCursor: number): void {
    this.exit();
    this.candles = [...candles];
    this.cursor = Math.max(1, Math.min(startCursor, Math.max(1, candles.length - 1)));
    this.notify();
  }

  /** Data visible at the current replay moment. */
  slice(): Candle[] {
    return this.candles.slice(0, this.cursor + 1);
  }

  /** Bar at the cursor (null when inactive). */
  get last(): Candle | null {
    return this.candles[this.cursor] ?? null;
  }

  seek(cursor: number): void {
    if (!this.candles.length) return;
    this.cursor = Math.max(1, Math.min(cursor, this.candles.length - 1));
    this.notify();
  }

  /** Advance one bar; returns false when the end is reached (auto-pauses). */
  step(): boolean {
    if (this.cursor + 1 >= this.candles.length) {
      this.pause();
      return false;
    }
    this.cursor += 1;
    this.notify();
    return true;
  }

  play(): void {
    if (this.playing || !this.candles.length) return;
    this.playing = true;
    this.schedule();
    this.notify();
  }

  pause(): void {
    if (this.timer != null) {
      clearInterval(this.timer);
      this.timer = null;
    }
    if (this.playing) {
      this.playing = false;
      this.notify();
    }
  }

  setSpeed(s: ReplaySpeed): void {
    this.speed = s;
    if (this.playing) this.schedule();
    this.notify();
  }

  private schedule(): void {
    if (this.timer != null) clearInterval(this.timer);
    this.timer = setInterval(() => {
      this.step();
    }, BASE_INTERVAL_MS / this.speed);
  }

  /** Leave replay and clear all state. */
  exit(): void {
    this.pause();
    if (this.candles.length > 0) {
      this.candles = [];
      this.cursor = 0;
      this.notify();
    }
  }
}
