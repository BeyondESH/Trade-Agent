import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ThemeMode, SymbolInfo } from "../../../types/trading";
import type {
  BacktestJobResult,
  BacktestParams,
  FactorDef,
  SeriesRef,
  SweepResult,
  WalkForwardResult,
} from "../../../api/types";
import { api } from "../../../api/client";
import { resolveFactors, enabledFactors } from "./factorCatalog";
import { DataAvailability } from "./DataAvailability";
import { BacktestControls, DEFAULT_PARAMS, TimeRange } from "./BacktestControls";
import { ModelPanel } from "./ModelPanel";
import { MetricCards } from "./MetricCards";
import { SeriesChart } from "./SeriesChart";
import { EconCharts } from "./EconCharts";
import { FactorManager } from "./FactorManager";
import { FactorIcTable } from "./FactorIcTable";
import { TradeTable } from "./TradeTable";
import { HistorySidebar } from "./HistorySidebar";
import { SweepView } from "./SweepView";
import { WalkForwardView } from "./WalkForwardView";
import { SignalKLineChart } from "./SignalKLineChart";
import { ModelDiagnostics } from "./ModelDiagnostics";
import { Panel } from "./ui";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../../ui/tabs";

interface Props {
  symbols: SymbolInfo[];
  theme: ThemeMode;
}

/** QUANT LAB: merged DL-quant + backtest workbench with six tabbed views.
 * Shared symbol/timeframe/range/params/model state drives every view. */
export const QuantLabPanel: React.FC<Props> = ({ symbols, theme }) => {
  const [symbol, setSymbol] = useState<string>("BTCUSDT");
  const [timeframe, setTimeframe] = useState<string>("1h");
  const [range, setRange] = useState<TimeRange>({});
  const [params, setParams] = useState<BacktestParams>(DEFAULT_PARAMS);
  const [factors, setFactors] = useState<FactorDef[]>([]);
  const [result, setResult] = useState<BacktestJobResult | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [historyId, setHistoryId] = useState<string | null>(null);
  const [sweep, setSweep] = useState<SweepResult | null>(null);
  const [sweepRunning, setSweepRunning] = useState(false);
  const [walk, setWalk] = useState<WalkForwardResult | null>(null);
  const [walkRunning, setWalkRunning] = useState(false);
  const [activeTab, setActiveTab] = useState("curves");
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
        start: range.start,
        end: range.end,
      });
      let done = false;
      for (let i = 0; i < 120 && !done; i++) {
        await new Promise((r) => setTimeout(r, 400));
        if (seq !== runSeq.current) return; // superseded by a newer run
        const job = await api.job(job_id);
        if (job.status === "done") {
          const r = job.result ?? null;
          if (r && r.error) {
            // Pipeline-level failure (e.g. insufficient rows) is a successful
            // job with an error payload — surface it instead of empty charts.
            setError(r.error);
            setResult(null);
          } else {
            setResult(r);
            setActiveTab("signals");
          }
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
  }, [series, factors, params, range]);

  const runSweep = useCallback(
    async (thresholds: number[], fees?: number[], slippages?: number[]) => {
      setSweepRunning(true);
      setError(null);
      try {
        const res = await api.sweep(series, {
          thresholds,
          fees,
          slippages,
          factors: enabledFactors(factors),
          params,
          start: range.start,
          end: range.end,
        });
        setSweep(res);
      } catch (e) {
        setError(`参数扫描失败: ${String(e)}`);
      } finally {
        setSweepRunning(false);
      }
    },
    [series, factors, params, range],
  );

  const runWalkForward = useCallback(
    async (nSplits?: number) => {
      setWalkRunning(true);
      setError(null);
      try {
        const res = await api.walkforward(series, {
          n_splits: nSplits,
          factors: enabledFactors(factors),
          params,
          start: range.start,
          end: range.end,
        });
        setWalk(res);
      } catch (e) {
        setError(`Walk-forward 失败: ${String(e)}`);
      } finally {
        setWalkRunning(false);
      }
    },
    [series, factors, params, range],
  );

  const persistFactors = useCallback((next: FactorDef[]) => {
    setFactors(next);
    api
      .getConfig()
      .then((cfg) => api.putConfig({ ...cfg, factors: next }))
      .catch(() => {
        /* config persistence is best-effort; run still uses local factors */
      });
  }, []);

  const viewHistory = useCallback(async (id: string) => {
    try {
      const detail = await api.backtestHistoryDetail(id);
      if (detail.legacy) {
        setError("该记录来自旧引擎,字段口径不同,仅可删除");
        setResult(null);
        return;
      }
      setResult({
        ...detail.metrics,
        stats: detail.stats,
        model_metrics: detail.model_metrics,
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

  const sr = result?.series;

  return (
    <div className="flex flex-col gap-4">
      <DataAvailability series={series} range={range} theme={theme} />

      <BacktestControls
        symbols={symbols}
        symbol={symbol}
        timeframe={timeframe}
        range={range}
        params={params}
        running={running}
        error={error}
        onSymbol={setSymbol}
        onTimeframe={setTimeframe}
        onRange={setRange}
        onParams={setParams}
        onRun={run}
        theme={theme}
      />

      <ModelPanel params={params} onChange={setParams} theme={theme} />

      {result && <MetricCards result={result} theme={theme} />}

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="flex-wrap h-auto">
          <TabsTrigger value="signals">信号K线</TabsTrigger>
          <TabsTrigger value="curves">曲线分析</TabsTrigger>
          <TabsTrigger value="diag">模型诊断</TabsTrigger>
          <TabsTrigger value="sweep">参数扫描</TabsTrigger>
          <TabsTrigger value="walk">Walk-forward</TabsTrigger>
          <TabsTrigger value="ic">因子 IC</TabsTrigger>
          <TabsTrigger value="trades">开单明细</TabsTrigger>
          <TabsTrigger value="history">历史</TabsTrigger>
        </TabsList>

        <TabsContent value="signals" className="flex flex-col gap-4">
          <SignalKLineChart
            symbol={symbol}
            timeframe={timeframe}
            series={series}
            result={result}
            theme={theme}
          />
        </TabsContent>

        <TabsContent value="curves" className="flex flex-col gap-4">
          <FactorManager factors={factors} onChange={persistFactors} theme={theme} />
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
                  {result.stats && (
                    <span>Sharpe: {result.stats.sharpe_ratio?.toFixed(2)}</span>
                  )}
                </div>
              )}
            </Panel>
          )}
          {result && <EconCharts result={result} theme={theme} thresh={params.thresh ?? 0.55} />}
        </TabsContent>

        <TabsContent value="diag" className="flex flex-col gap-4">
          {result ? (
            <ModelDiagnostics result={result} theme={theme} />
          ) : (
            <div className="text-sm text-gray-400 py-8 text-center">
              运行回测后在此查看 ROC 曲线与特征权重
            </div>
          )}
        </TabsContent>

        <TabsContent value="sweep">
          <SweepView
            running={sweepRunning}
            result={sweep}
            onRun={runSweep}
            theme={theme}
          />
        </TabsContent>

        <TabsContent value="walk">
          <WalkForwardView
            running={walkRunning}
            result={walk}
            onRun={runWalkForward}
            theme={theme}
            error={error}
          />
        </TabsContent>

        <TabsContent value="ic">
          <FactorIcTable series={series} factors={factors} range={range} theme={theme} />
        </TabsContent>

        <TabsContent value="trades">
          <TradeTable trades={result?.trade_list ?? []} theme={theme} />
        </TabsContent>

        <TabsContent value="history">
          <div className="grid grid-cols-1 xl:grid-cols-[1fr_320px] gap-4 items-start">
            <div className="flex flex-col gap-4 min-w-0">
              {historyId && (
                <div className="text-xs text-[#2962ff] font-semibold">
                  正在回看历史回测 #{historyId.slice(0, 6)}
                </div>
              )}
              {result ? (
                <>
                  <MetricCards result={result} theme={theme} />
                  <TradeTable trades={result.trade_list ?? []} theme={theme} />
                  <EconCharts result={result} theme={theme} thresh={params.thresh ?? 0.55} />
                </>
              ) : (
                <div className="text-sm text-gray-400 py-8 text-center">
                  点击右侧历史记录回看;新运行的结果也会自动保存到这里
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
        </TabsContent>
      </Tabs>
    </div>
  );
};
