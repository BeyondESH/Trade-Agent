import { useState } from "react";
import type { Chart } from "klinecharts";

type AxisType = "normal" | "percentage" | "log";

const BUTTONS: { id: AxisType; label: string }[] = [
  { id: "percentage", label: "%" },
  { id: "log", label: "log" },
  { id: "normal", label: "auto" },
];

/** Price-axis %/log/auto switcher; fades in when hovering the chart area. */
export function ChartAxisControls({ chart }: { chart: Chart | null }) {
  const [type, setType] = useState<AxisType>("normal");
  const apply = (t: AxisType) => {
    setType(t);
    chart?.setStyles({ yAxis: { type: t as import("klinecharts").YAxisType } });
  };
  return (
    <div
      className="pointer-events-none absolute bottom-8 right-1 z-20 flex items-center gap-0.5 rounded-modal border border-border bg-panel/85 px-1 py-0.5 opacity-0 shadow-float transition group-hover:opacity-100"
      data-testid="axis-controls"
    >
      {BUTTONS.map((b) => (
        <button
          key={b.id}
          onClick={() => apply(b.id)}
          className={`rounded-chip px-1.5 text-[10px] ${
            type === b.id ? "text-accent" : "text-muted hover:text-text"
          }`}
        >
          {b.label}
        </button>
      ))}
    </div>
  );
}
