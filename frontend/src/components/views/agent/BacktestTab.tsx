import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ThemeMode, SymbolInfo } from "../../../types/trading";
import type { BacktestJobResult, BacktestParams, FactorDef, SeriesRef } from "../../../api/types";
import { api } from "../../../api/client";
import { enabledFactors, resolveFactors } from "./factorCatalog";
import { BacktestControls, DEFAULT_PARAMS } from "./BacktestControls";
import { MetricCards } from "./MetricCards";
import { TradeTable } from "./TradeTable";
import { EconCharts } from "./EconCharts";
import { HistorySidebar } from "./HistorySidebar";

interface Props {
  symbols: SymbolInfo[];
  theme: ThemeMode;
}

/** Tab3: 回测 — self-contained backtest run with trade list + econ charts +
 * server-persisted run history. Reads enabled factors from /config. */
export const BacktestTab: React.FC<Props> = ({ symbols, theme }) => {
  const [symbol, setSymbol] = useState<string>("BTCUSDT");
  const [timeframe, setTimeframe] = useState<string>("1h");
  const [params, setParams] = useState<BacktestParams>(DEFAULT_PARAMS);
  const [factors, setFactors] = useState<FactorDef[]>([]);
  const [result, setResult] = useState<BacktestJobResult | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [historyId, setHistoryId] = useState<string | null>(null);
  const runSeq = useRef(0);

  const series: SeriesRef = useMemo(
    () => ({ category: "USDT-FUTURES", symbol, timeframe }),
    [symbol, timeframe],
  );

  useEffect(() => {
    api
      .getConfig()
      .then((cfg) => setFactors(resolveFactors(cfg.factors)))
      .catch(() => setFactors(resolveFactors(null)));
  }, []);

  const run = useCallback(async () => {
    setRunning(true);
    setError(null);
    setHistoryId(null);
    const seq = ++runSeq.current;
    try {
      const { job_id } = await api.backtest(series, {
        factors: enabledFactors(factors),
        params,
      });
      let done = false;
      for (let i = 0; i < 120 && !done; i++) {
        await new Promise((r) => setTimeout(r, 400));
        if (seq !== runSeq.current) return; // superseded by a newer run
        const job = await api.job(job_id);
        if (job.status === "done") {
          setResult(job.result ?? null);
          done = true;
        } else if (job.status === "error") {
          setError(job.error ?? "回测任务失败");
          done = true;
        }
      }
      if (!done && seq === runSeq.current) setError("回测超时");
    } catch (e) {
      if (seq === runSeq.current) setError(String(e));
    } finally {
      if (seq === runSeq.current) setRunning(false);
    }
  }, [series, factors, params]);

  const viewHistory = useCallback(async (id: string) => {
    try {
      const detail = await api.backtestHistoryDetail(id);
      setResult({
        ...detail.metrics,
        trade_list: detail.trade_list,
        series: detail.series,
        data_meta: detail.data_meta,
      });
      setHistoryId(id);
      setError(null);
    } catch (e) {
      setError(String(e));
    }
  }, []);

  const historyDeleted = useCallback((id: string) => {
    if (historyId === id) {
      setHistoryId(null);
      setResult(null);
    }
  }, [historyId]);

  return (
    <div className="flex flex-col gap-4">
      <BacktestControls
        symbols={symbols}
        symbol={symbol}
        timeframe={timeframe}
        params={params}
        running={running}
        error={error}
        onSymbol={setSymbol}
        onTimeframe={setTimeframe}
        onParams={setParams}
        onRun={run}
        theme={theme}
      />

      <div className="grid grid-cols-1 xl:grid-cols-[1fr_300px] gap-4 items-start">
        <div className="flex flex-col gap-4 min-w-0">
          {result ? (
            <>
              {historyId && (
                <div className="text-xs text-[#2962ff] font-semibold">
                  正在回看历史回测 #{historyId.slice(0, 6)}
                </div>
              )}
              <MetricCards result={result} theme={theme} />
              <TradeTable trades={result.trade_list ?? []} theme={theme} />
              <EconCharts result={result} theme={theme} />
            </>
          ) : (
            <div className="text-sm text-gray-400 py-8 text-center">
              设置参数后点击 Run Backtest;完成后可在此查看开单列表与收益图形
            </div>
          )}
        </div>
        <HistorySidebar
          activeId={historyId}
          onSelect={viewHistory}
          onDeleted={historyDeleted}
          theme={theme}
        />
      </div>
    </div>
  );
};
