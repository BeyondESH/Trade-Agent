import { useEffect, useState } from "react";
import { api } from "../../api/client";
import type { AgentDecision, AnalyzeResponse } from "../../api/types";
import { Badge, Panel } from "../../ui";

interface Props {
  symbol: string;
  timeframe: string;
}

export function AnalysisPanel({ symbol, timeframe }: Props) {
  const [decision, setDecision] = useState<AgentDecision | null>(null);
  const [analyze, setAnalyze] = useState<AnalyzeResponse | null>(null);
  const [err, setErr] = useState("");

  useEffect(() => {
    let alive = true;
    setErr("");
    api
      .analyze({ category: "USDT-FUTURES", symbol, timeframe })
      .then((a) => alive && setAnalyze(a))
      .catch(() => alive && setAnalyze(null));
    api
      .agentDecide({ category: "USDT-FUTURES", symbol, timeframe })
      .then((d) => alive && setDecision(d))
      .catch(() => alive && setDecision(null));
    return () => {
      alive = false;
    };
  }, [symbol, timeframe]);

  const ind = analyze?.indicators ?? {};
  return (
    <Panel title="AI 分析" className="rounded-none border-0 border-l">
      <div className="flex flex-col gap-2 text-xs">
        {decision ? (
          <div className="flex flex-col gap-1 p-2 bg-panel2 rounded">
            <div className="flex items-center gap-2">
              <Badge tone={decision.action === "open" ? "up" : decision.action === "close" ? "down" : "muted"}>
                {decision.action}
              </Badge>
              <span className="font-semibold">{decision.side ?? "--"}</span>
              <span className="text-muted ml-auto">
                conf={(decision.confidence * 100).toFixed(0)}%
              </span>
            </div>
            <div className="text-muted">{decision.reason}</div>
          </div>
        ) : (
          <div className="text-muted">决策加载中/无数据</div>
        )}
        <div className="grid grid-cols-2 gap-1 tnum">
          {["dif", "dea", "macd_hist", "kdj_k", "kdj_d", "kdj_j", "boll_mid", "vegas_ema144"].map((k) => (
            <span key={k} className="flex justify-between">
              <span className="text-muted">{k}</span>
              <span>{ind[k] == null ? "--" : Number(ind[k]).toFixed(3)}</span>
            </span>
          ))}
        </div>
      </div>
    </Panel>
  );
}
