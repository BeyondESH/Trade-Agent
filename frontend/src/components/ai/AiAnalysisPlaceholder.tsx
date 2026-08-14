import { Panel } from "../../ui";

/** Placeholder for the bottom AI analysis module (implemented in a later change). */
export function AiAnalysisPlaceholder() {
  return (
    <Panel title="AI 分析" className="h-full rounded-none border-0 border-t">
      <div className="flex h-full items-center justify-center text-xs text-muted">
        AI 分析模块预留 · 后续接入 Agent 决策 / 指标 / S/R
      </div>
    </Panel>
  );
}
