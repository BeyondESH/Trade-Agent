import { Calendar as CalIcon, Globe } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import type React from "react";
import { t } from "../../lib/i18n";

interface Props {
  onSelectRange: (range: string) => void;
  selectedRange: string;
  isLogScale: boolean;
  onToggleLogScale: () => void;
  isPercentScale: boolean;
  onTogglePercentScale: () => void;
  isAutoScale: boolean;
  onToggleAutoScale: () => void;
  theme: "dark" | "light";
}

const RANGES = ["1D", "5D", "1M", "3M", "6M", "YTD", "1Y", "5Y", "ALL"];
const SEGMENT_SPRING = { type: "spring" as const, stiffness: 420, damping: 32 };

export const BottomTimebar: React.FC<Props> = ({
  onSelectRange,
  selectedRange,
  isLogScale,
  onToggleLogScale,
  isPercentScale,
  onTogglePercentScale,
  isAutoScale,
  onToggleAutoScale,
}) => {
  const reduce = useReducedMotion();
  const segTransition = reduce ? { duration: 0 } : SEGMENT_SPRING;

  const scaleToggles = [
    {
      id: "toggle-percent-btn",
      active: isPercentScale,
      onClick: onTogglePercentScale,
      label: "%",
      title: "百分比坐标",
    },
    {
      id: "toggle-log-btn",
      active: isLogScale,
      onClick: onToggleLogScale,
      label: "log",
      title: "对数坐标",
    },
    {
      id: "toggle-auto-btn",
      active: isAutoScale,
      onClick: onToggleAutoScale,
      label: "auto",
      title: "自动坐标",
    },
  ];

  return (
    <div
      id="bottom-timebar"
      className="h-[28px] flex-none px-3 flex items-center justify-between border-t border-line bg-surface text-[11px] text-muted select-none"
    >
      {/* Left: time-range segmented control */}
      <div className="flex h-full items-center gap-1.5">
        <div className="flex items-center gap-0.5 rounded-lg bg-surface-2/70 p-0.5">
          {RANGES.map((r) => {
            const isActive = selectedRange === r;
            return (
              <button
                key={r}
                id={`range-btn-${r}`}
                onClick={() => onSelectRange(r)}
                className={`relative h-5 rounded px-1.5 font-medium transition-colors ${
                  isActive ? "text-signal-ink font-bold" : "text-muted hover:text-content"
                }`}
              >
                {isActive && (
                  <motion.span
                    layoutId="timebar-range-pill"
                    transition={segTransition}
                    className="absolute inset-0 rounded bg-signal shadow-e1"
                  />
                )}
                <span className="relative z-10">{r}</span>
              </button>
            );
          })}
        </div>

        <div className="h-3 w-px bg-line/60" />

        <button
          className="flex h-6 items-center gap-1 rounded-md px-1.5 text-muted hover:bg-surface-2 hover:text-content"
          title="Go to specific date"
        >
          <CalIcon className="w-3 h-3" />
        </button>
      </div>

      {/* Right: timezone + scale segmented control */}
      <div className="flex h-full items-center gap-2 ta-num">
        <div className="flex items-center gap-1 text-faint text-2xs">
          <Globe className="w-3 h-3" />
          <span>{t("UTC+0 (Live)")}</span>
        </div>

        <div className="h-3 w-px bg-line/60" />

        <div className="flex items-center gap-0.5 rounded-lg bg-surface-2/70 p-0.5">
          {scaleToggles.map((item) => (
            <button
              key={item.id}
              id={item.id}
              onClick={item.onClick}
              title={item.title}
              className={`relative h-5 rounded px-1.5 font-bold transition-colors ${
                item.active ? "text-signal-ink" : "text-muted hover:text-content"
              }`}
            >
              {item.active && (
                <motion.span
                  layoutId="timebar-scale-pill"
                  transition={segTransition}
                  className="absolute inset-0 rounded bg-signal shadow-e1"
                />
              )}
              <span className="relative z-10">{item.label}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};
