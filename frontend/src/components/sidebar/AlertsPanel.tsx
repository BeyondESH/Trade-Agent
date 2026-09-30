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
}) => {
  return (
    <div
      id="alerts-panel"
      className="flex flex-col h-full w-full select-none text-xs bg-surface text-content"
    >
      <div className="p-2.5 border-b border-line flex items-center justify-between">
        <div className="flex items-center gap-1.5 font-bold text-sm">
          <Bell className="w-4 h-4 text-signal" />
          <span>{t("Alerts Log")}</span>
        </div>
        <button
          id="alerts-create-btn"
          onClick={onOpenCreateAlert}
          className="flex items-center gap-1 px-2 py-1 rounded-md bg-signal font-semibold text-signal-ink hover:bg-signal/90 transition-colors"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>{t("Create")}</span>
        </button>
      </div>

      <div className="px-2.5 py-1.5 border-b border-line flex items-center justify-between">
        <span className="text-2xs text-muted">{t("Browser Notifications")}</span>
        <button
          role="switch"
          aria-checked={notifyEnabled}
          aria-label={t("Browser Notifications")}
          data-testid="alert-notify-toggle"
          onClick={onToggleNotifications}
          className={`p-1 rounded transition-colors ${
            notifyEnabled ? "text-signal hover:bg-signal/20" : "text-muted hover:bg-surface-2"
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
          <div className="flex flex-col items-center justify-center h-48 text-muted gap-2 text-center p-4">
            <Bell className="w-8 h-8 text-faint opacity-30" />
            <p>{t("No active price alerts set")}</p>
            <button
              onClick={onOpenCreateAlert}
              className="text-signal font-semibold hover:underline"
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
                  isTriggered ? "border-signal/40 bg-signal/10" : "bg-surface-2 border-line"
                }`}
              >
                <div className="flex flex-col gap-0.5 min-w-0">
                  <div className="flex items-center gap-1.5 font-bold">
                    <span>{al.symbol}</span>
                    <span className="text-2xs text-signal">{al.condition}</span>
                    <span className="font-mono ta-num min-w-[7ch] text-[11px]">
                      ${al.targetPrice}
                    </span>
                    {isTriggered && (
                      <CheckCircle2
                        data-testid={`alert-triggered-${al.id}`}
                        className="w-3.5 h-3.5 text-signal"
                      />
                    )}
                  </div>
                  <div className="text-2xs text-muted truncate">
                    {al.note || t("Price alert notification")} · {al.frequency}
                  </div>
                  {isTriggered && al.triggerTime && (
                    <div
                      data-testid={`alert-trigger-time-${al.id}`}
                      className="text-2xs text-signal"
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
                      className="rounded-md p-1 text-muted hover:bg-signal/20 hover:text-signal transition-colors"
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
                      enabled ? "text-signal hover:bg-signal/20" : "text-muted hover:bg-surface-2"
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
                    className="rounded-md p-1 text-muted hover:bg-down/20 hover:text-down transition-colors"
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
