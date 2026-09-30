import { AlertTriangle, Calendar } from "lucide-react";
import type React from "react";
import { t } from "../../lib/i18n";
import type { EconomicEvent } from "../../types/trading";

interface Props {
  events: EconomicEvent[];
  theme: "dark" | "light";
}

export const CalendarPanel: React.FC<Props> = ({ events }) => {
  return (
    <div
      id="calendar-panel"
      className="flex flex-col h-full w-full select-none text-xs bg-surface text-content"
    >
      <div className="p-2.5 border-b border-line flex items-center justify-between">
        <div className="flex items-center gap-1.5 font-bold text-sm">
          <Calendar className="w-4 h-4 text-signal" />
          <span>{t("Economic Calendar")}</span>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto divide-y divide-line/60">
        {events.map((ev) => (
          <div
            key={ev.id}
            className="p-3 flex flex-col gap-1.5 transition-colors hover:bg-surface-2/50"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <span className="font-mono ta-num font-bold text-xs">{ev.time}</span>
                <span className="font-bold text-2xs px-1 py-0.2 rounded bg-surface-2 text-muted">
                  {ev.currency}
                </span>
              </div>
              <span
                className={`text-2xs font-bold uppercase px-1.5 py-0.5 rounded ${
                  ev.impact === "high"
                    ? "bg-down/15 text-down"
                    : ev.impact === "medium"
                      ? "bg-signal/15 text-signal"
                      : "bg-surface-2 text-muted"
                }`}
              >
                {ev.impact} Impact
              </span>
            </div>

            <div className="font-semibold text-xs leading-snug">{ev.event}</div>

            <div className="grid grid-cols-3 gap-1 text-2xs font-mono ta-num text-muted pt-1">
              <div>
                <span className="text-faint block">{t("Actual")}</span>
                <span className="font-semibold text-content">{ev.actual || "-"}</span>
              </div>
              <div>
                <span className="text-faint block">{t("Forecast")}</span>
                <span>{ev.forecast || "-"}</span>
              </div>
              <div>
                <span className="text-faint block">{t("Previous")}</span>
                <span>{ev.previous || "-"}</span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
