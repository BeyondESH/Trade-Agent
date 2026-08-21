import React, { useEffect, useState } from "react";
import { ThemeMode } from "../../../types/trading";
import type { DataWindow, SeriesRef } from "../../../api/types";
import { api } from "../../../api/client";
import { cardCls, fmtTime } from "./ui";

interface Props {
  series: SeriesRef;
  range?: DataWindow;
  theme: ThemeMode;
}

interface Availability {
  count: number;
  start: number | null;
  end: number | null;
  loading: boolean;
}

const SPARSE_THRESHOLD = 500;

/** Fetches a cheap sample of the selected series (within the window) and surfaces data availability. */
export const DataAvailability: React.FC<Props> = ({ series, range, theme }) => {
  const [state, setState] = useState<Availability>({ count: 0, start: null, end: null, loading: true });

  useEffect(() => {
    let cancelled = false;
    setState((s) => ({ ...s, loading: true }));
    api
      .candles(series, range?.start, range?.end, 5000)
      .then((r) => {
        if (cancelled) return;
        const first = r.candles[0];
        const last = r.candles[r.candles.length - 1];
        setState({
          count: r.count,
          start: first ? first.open_time : null,
          end: last ? last.open_time : null,
          loading: false,
        });
      })
      .catch(() => {
        if (cancelled) return;
        setState({ count: 0, start: null, end: null, loading: false });
      });
    return () => {
      cancelled = true;
    };
  }, [series.category, series.symbol, series.timeframe, range?.start, range?.end]);

  const sparse = !state.loading && state.count > 0 && state.count < SPARSE_THRESHOLD;
  const empty = !state.loading && state.count === 0;

  return (
    <div className={`${cardCls(theme)} p-3 flex flex-col gap-1 text-xs`}>
      <span className="font-semibold text-gray-400">数据可用性</span>
      {state.loading ? (
        <span className="text-gray-500">加载中...</span>
      ) : empty ? (
        <span className="text-[#f23645]">无数据 — 请先通过 /candles/backfill 回填</span>
      ) : (
        <>
          <span className="font-mono">
            {state.count.toLocaleString()} 根 bar · {state.start ? fmtTime(state.start) : "-"} →{" "}
            {state.end ? fmtTime(state.end) : "-"}
          </span>
          {sparse && (
            <span className="text-[#ff9800]">⚠️ 数据稀疏(不足 {SPARSE_THRESHOLD} 根),回测效果有限,建议先回填</span>
          )}
        </>
      )}
    </div>
  );
};
