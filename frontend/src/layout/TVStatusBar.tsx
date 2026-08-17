import { useEffect, useState } from "react";
import { useI18n } from "../lib/i18n";
import type { ConnStatus } from "../api/ws";

interface Props {
  symbol: string;
  price?: number;
  change?: number;
  up: boolean;
  conn?: ConnStatus;
  onTimezone: () => void;
}

const CONN_BADGE: Record<ConnStatus, { labelKey: "status.live" | "status.reconnecting" | "status.offline"; color: string }> = {
  live: { labelKey: "status.live", color: "var(--tv-up)" },
  reconnecting: { labelKey: "status.reconnecting", color: "#f0b90b" },
  closed: { labelKey: "status.offline", color: "var(--tv-down)" },
};

/** 28px bottom status bar: symbol quote, timezone, exchange clock, latency, fullscreen. */
export function TVStatusBar({ symbol, price, change, up, conn = "live", onTimezone }: Props) {
  const { t } = useI18n();
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  const toggleFullscreen = () => {
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {});
    } else {
      document.documentElement.requestFullscreen().catch(() => {});
    }
  };
  const clock = now.toLocaleTimeString("zh-CN", { hour12: false });
  const badge = CONN_BADGE[conn];

  return (
    <div
      className="flex h-7 shrink-0 items-center gap-4 border-t border-border bg-panel px-3 text-[11px] text-muted"
      data-testid="tv-status-bar"
    >
      <span className="tnum font-medium text-text">{symbol}</span>
      <span className="tnum" style={{ color: up ? "var(--tv-up)" : "var(--tv-down)" }}>
        {price != null ? price.toFixed(2) : "--"}
      </span>
      {change !== undefined && (
        <span className="tnum" style={{ color: up ? "var(--tv-up)" : "var(--tv-down)" }}>
          {up ? "+" : ""}
          {change.toFixed(2)}%
        </span>
      )}
      <button onClick={onTimezone} className="rounded-btn px-1 hover:bg-hover hover:text-text">
        {t("status.timezone")}
      </button>
      <span className="tnum">{clock}</span>
      <span data-testid="conn-badge" data-conn={conn} style={{ color: badge.color }}>
        ● {t(badge.labelKey)}
      </span>
      <span className="ml-auto flex items-center gap-4">
        <span className="tnum">
          {t("status.layoutRatio")} 100%
        </span>
        <button onClick={toggleFullscreen} className="rounded-btn px-1 hover:bg-hover hover:text-text">
          {t("topbar.fullscreen")}
        </button>
      </span>
    </div>
  );
}
