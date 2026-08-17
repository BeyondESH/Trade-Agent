import { AnalysisPanel } from "../ai/AnalysisPanel";

interface Props {
  symbol: string;
  timeframe: string;
}

/** Bottom dock AI analysis tab. */
export function AiDockPanel({ symbol, timeframe }: Props) {
  return (
    <div className="h-full min-h-0 overflow-auto bg-base">
      <AnalysisPanel symbol={symbol} timeframe={timeframe} />
    </div>
  );
}
