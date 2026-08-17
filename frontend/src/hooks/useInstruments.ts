import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "../api/client";
import type { Instrument, MarketCategory, SeriesRef } from "../api/types";

export interface UseInstrumentsState {
  instruments: Instrument[];
  /** `category:instId` keys, sorted. */
  symbols: string[];
  byKey: Record<string, Instrument>;
  loading: boolean;
  error: string | null;
  reload: () => void;
}

export function instrumentKey(category: string | undefined, symbol: string): string {
  return `${category ?? "USDT-FUTURES"}:${symbol}`;
}

/** Fetch the full instrument catalog (all categories) once, with reload. */
export function useInstruments(): UseInstrumentsState {
  const [instruments, setInstruments] = useState<Instrument[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(() => {
    setLoading(true);
    api
      .instruments()
      .then(({ instruments }) => {
        setInstruments(instruments);
        setError(null);
      })
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
  }, []);

  useEffect(reload, [reload]);

  const byKey = useMemo(() => {
    const m: Record<string, Instrument> = {};
    for (const inst of instruments) {
      m[instrumentKey(inst.category, inst.symbol)] = inst;
    }
    return m;
  }, [instruments]);

  const symbols = useMemo(
    () => Object.keys(byKey).sort((a, b) => a.localeCompare(b)),
    [byKey],
  );

  return { instruments, symbols, byKey, loading, error, reload };
}

/** Resolve the instrument for a series ref, if present in the catalog. */
export function findInstrument(
  byKey: Record<string, Instrument>,
  series: SeriesRef,
): Instrument | null {
  return byKey[instrumentKey(series.category, series.symbol)] ?? null;
}

export type { MarketCategory };
