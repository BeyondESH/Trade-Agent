import { Bell, BellOff, BellRing, CheckCircle2, Plus, RotateCcw, Trash2 } from "lucide-react";
import type React from "react";
import { t } from "../../lib/i18n";
import { formatRelativeTime } from "../../lib/newsfeed";
import type { AlertItem, SymbolInfo } from "../../types/trading";

interface Props {
  alerts: AlertItem[];
  onRemoveAlert: (id: string) => void;
  onOpenCreateAlert: () => void;
  onToggleAlert: (id: string, enabled: boolean) => void;
  onResetAlert: (id: string) => void;
  notifyEnabled: boolean;
  onToggleNotifications: () => void;
  activeSymbol: SymbolInfo;
  theme: "dark" | "light";
}

export const AlertsPanel: React.FC<Props> = ({
  alerts,
  onRemoveAlert,
  onOpenCreateAlert,
  onToggleAlert,
  onResetAlert,
  notifyEnabled,
  onToggleNotifications,
  activeSymbol,
  theme,
}) => {
  const isDark = theme === "dark";

  return (
    <div id="alerts-panel" className="flex flex-col h-full w-full select-none text-xs">
      <div
        className={`p-2.5 border-b flex items-center justify-between ${isDark ? "border-[#2a2e39]" : "border-[#e0e3eb]"}`}
      >
        <div className="flex items-center gap-1.5 font-bold text-sm">
          <Bell className="w-4 h-4 text-[#ff9800]" />
          <span>{t("Alerts Log")}</span>
        </div>
        <button
          id="alerts-create-btn"
          onClick={onOpenCreateAlert}
          className="flex items-center gap-1 px-2 py-1 rounded bg-[#2962ff] text-white font-medium hover:bg-[#1e53e5] transition-colors"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>{t("Create")}</span>
        </button>
      </div>

      <div
        className={`px-2.5 py-1.5 border-b flex items-center justify-between ${isDark ? "border-[#2a2e39]" : "border-[#e0e3eb]"}`}
      >
        <span className="text-[10px] text-gray-400">{t("Browser Notifications")}</span>
        <button
          role="switch"
          aria-checked={notifyEnabled}
          aria-label={t("Browser Notifications")}
          data-testid="alert-notify-toggle"
          onClick={onToggleNotifications}
          className={`p-1 rounded transition-colors ${
            notifyEnabled
              ? "text-[#ff9800] hover:bg-[#ff9800]/20"
              : "text-gray-400 hover:bg-gray-500/20"
          }`}
        >
          {notifyEnabled ? (
            <BellRing className="w-3.5 h-3.5" />
          ) : (
            <BellOff className="w-3.5 h-3.5" />
          )}
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-2 flex flex-col gap-2">
        {alerts.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 text-gray-500 gap-2 text-center p-4">
            <Bell className="w-8 h-8 opacity-30" />
            <p>{t("No active price alerts set")}</p>
            <button
              onClick={onOpenCreateAlert}
              className="text-[#2962ff] font-semibold hover:underline"
            >
              + {t("Create alert for").replace("%s", activeSymbol.ticker)}
            </button>
          </div>
        ) : (
          alerts.map((al) => {
            const enabled = al.enabled !== false;
            const isTriggered = al.triggered;
            return (
              <div
                key={al.id}
                data-testid={`alert-item-${al.id}`}
                data-triggered={isTriggered ? "true" : "false"}
                className={`p-2.5 rounded-lg border flex items-center justify-between ${
                  isTriggered
                    ? "border-[#ff9800] bg-[#ff9800]/10"
                    : isDark
                      ? "bg-[#1e222d] border-[#2a2e39]"
                      : "bg-[#f8fafc] border-[#e0e3eb]"
                }`}
              >
                <div className="flex flex-col gap-0.5 min-w-0">
                  <div className="flex items-center gap-1.5 font-bold">
                    <span>{al.symbol}</span>
                    <span className="text-[10px] text-[#2962ff]">{al.condition}</span>
                    <span className="font-mono text-[11px]">${al.targetPrice}</span>
                    {isTriggered && (
                      <CheckCircle2
                        data-testid={`alert-triggered-${al.id}`}
                        className="w-3.5 h-3.5 text-[#ff9800]"
                      />
                    )}
                  </div>
                  <div className="text-[10px] text-gray-400 truncate">
                    {al.note || t("Price alert notification")} · {al.frequency}
                  </div>
                  {isTriggered && al.triggerTime && (
                    <div
                      data-testid={`alert-trigger-time-${al.id}`}
                      className="text-[10px] text-[#ff9800]"
                    >
                      {t("Triggered")} · {formatRelativeTime(al.triggerTime)}
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-1 flex-none">
                  {isTriggered && (
                    <button
                      data-testid={`alert-reset-${al.id}`}
                      onClick={() => onResetAlert(al.id)}
                      className="p-1 rounded hover:bg-[#2962ff]/20 text-gray-400 hover:text-[#2962ff] transition-colors"
                      title={t("Reset Alert")}
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                    </button>
                  )}
                  <button
                    role="switch"
                    aria-checked={enabled}
                    aria-label={enabled ? t("Disable Alert") : t("Enable Alert")}
                    data-testid={`alert-toggle-${al.id}`}
                    onClick={() => onToggleAlert(al.id, !enabled)}
                    className={`p-1 rounded transition-colors ${
                      enabled
                        ? "text-[#ff9800] hover:bg-[#ff9800]/20"
                        : "text-gray-500 hover:bg-gray-500/20"
                    }`}
                    title={enabled ? t("Disable Alert") : t("Enable Alert")}
                  >
                    {enabled ? (
                      <Bell className="w-3.5 h-3.5" />
                    ) : (
                      <BellOff className="w-3.5 h-3.5" />
                    )}
                  </button>
                  <button
                    data-testid={`alert-delete-${al.id}`}
                    onClick={() => onRemoveAlert(al.id)}
                    className="p-1 rounded hover:bg-red-500/20 text-gray-400 hover:text-red-400 transition-colors"
                    title={t("Delete Alert")}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
