import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ThemeMode, SymbolInfo } from "../../../types/trading";
import type { BacktestJobResult, BacktestParams, FactorDef, SeriesRef } from "../../../api/types";
import { api } from "../../../api/client";
import { resolveFactors, enabledFactors } from "./factorCatalog";
import { DataAvailability } from "./DataAvailability";
import { BacktestControls, DEFAULT_PARAMS } from "./BacktestControls";
import { MetricCards } from "./MetricCards";
import { SeriesChart } from "./SeriesChart";
import { FactorManager } from "./FactorManager";
import { FactorIcTable } from "./FactorIcTable";
import { Panel } from "./ui";

interface Props {
  symbols: SymbolInfo[];
  theme: ThemeMode;
}

export const DlQuantTab: React.FC<Props> = ({ symbols, theme }) => {
  const [symbol, setSymbol] = useState<string>("BTCUSDT");
  const [timeframe, setTimeframe] = useState<string>("1h");
  const [params, setParams] = useState<BacktestParams>(DEFAULT_PARAMS);
  const [factors, setFactors] = useState<FactorDef[]>([]);
  const [result, setResult] = useState<BacktestJobResult | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const runSeq = useRef(0);

  const series: SeriesRef = useMemo(
    () => ({ category: "USDT-FUTURES", symbol, timeframe }),
    [symbol, timeframe],
  );

  // Load persisted factor config on mount.
  useEffect(() => {
    api
      .getConfig()
      .then((cfg) => setFactors(resolveFactors(cfg.factors)))
      .catch(() => setFactors(resolveFactors(null)));
  }, []);

  const run = useCallback(async () => {
    setRunning(true);
    setError(null);
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

  const persistFactors = useCallback((next: FactorDef[]) => {
    setFactors(next);
    api
      .getConfig()
      .then((cfg) => api.putConfig({ ...cfg, factors: next }))
      .catch(() => {
        /* config persistence is best-effort; run still uses local factors */
      });
  }, []);

  const sr = result?.series;

  return (
    <div className="flex flex-col gap-4">
      <DataAvailability series={series} theme={theme} />

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

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <FactorManager factors={factors} onChange={persistFactors} theme={theme} />
        <FactorIcTable series={series} factors={factors} theme={theme} />
      </div>

      {result && (
        <>
          <MetricCards result={result} theme={theme} />
          {sr && sr.equity.length > 1 && (
            <Panel title="权益 / 回撤曲线 (测试集)" theme={theme}>
              <SeriesChart
                lanes={[
                  { name: "equity", color: "#2962ff", values: sr.equity, fill: true },
                  { name: "drawdown", color: "#f23645", values: sr.drawdown },
                ]}
                height={200}
              />
              {result.data_meta && (
                <div className="flex flex-wrap gap-4 text-[11px] text-gray-400 font-mono">
                  <span>训练集: {result.data_meta.n_train} 根</span>
                  <span>测试集: {result.data_meta.n_test} 根</span>
                </div>
              )}
            </Panel>
          )}
        </>
      )}
    </div>
  );
};
