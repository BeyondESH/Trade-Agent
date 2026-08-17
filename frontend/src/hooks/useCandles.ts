import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../api/client";
import type { Candle, SeriesRef } from "../api/types";
import { bitgetWs } from "../api/bitgetWs";

export interface UseCandlesState {
  candles: Candle[];
  loading: boolean;
  error: string | null;
  reload: () => void;
}

/**
 * Load candle history for a series and keep the last bar live-updating from
 * the shared bitget WS client. Returns a new array reference only when data
 * actually changes (memo-friendly for chart consumers).
 */
export function useCandles(series: SeriesRef | null, limit = 200): UseCandlesState {
  const [candles, setCandles] = useState<Candle[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const alive = useRef(true);

  const load = useCallback(() => {
    if (!series) {
      setCandles([]);
      return;
    }
    alive.current = true;
    setLoading(true);
    api
      .candlesRecent(series, limit)
      .then((res) => {
        if (!alive.current) return;
        setCandles(res.candles);
        setError(null);
      })
      .catch((e) => {
        if (alive.current) setError(String(e));
      })
      .finally(() => {
        if (alive.current) setLoading(false);
      });
  }, [series?.category, series?.symbol, series?.timeframe, limit]);

  useEffect(() => {
    load();
    return () => {
      alive.current = false;
    };
  }, [load]);

  // Live updates: patch the last bar (or append when a new bucket opens).
  useEffect(() => {
    if (!series) return;
    const handle = bitgetWs.subscribe(series, (c) => {
      setCandles((prev) => {
        if (prev.length === 0) return [c];
        const last = prev[prev.length - 1];
        if (last.open_time === c.open_time) {
          return [...prev.slice(0, -1), c];
        }
        return [...prev, c];
      });
    });
    return () => handle.close();
  }, [series?.category, series?.symbol, series?.timeframe]);

  return { candles, loading, error, reload: load };
}
