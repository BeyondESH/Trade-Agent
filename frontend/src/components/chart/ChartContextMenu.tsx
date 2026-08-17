import { useI18n } from "../../lib/i18n";

interface Props {
  x: number;
  y: number;
  onClose: () => void;
  onAlert: () => void;
  onIndicator: () => void;
  onCopy: () => void;
  onSettings: () => void;
  onReset: () => void;
}

function Item({
  label,
  onClick,
  kbd,
}: {
  label: string;
  onClick: () => void;
  kbd?: string;
}) {
  return (
    <button
      onClick={onClick}
      className="flex w-full items-center justify-between gap-6 rounded-chip px-2 py-1 text-left text-xs text-text hover:bg-hover"
    >
      <span>{label}</span>
      {kbd && <span className="text-[10px] text-muted">{kbd}</span>}
    </button>
  );
}

/** TradingView-style right-click context menu over the chart. */
export function ChartContextMenu({ x, y, onClose, onAlert, onIndicator, onCopy, onSettings, onReset }: Props) {
  const { t } = useI18n();
  return (
    <>
      <div className="fixed inset-0 z-40" onClick={onClose} data-testid="ctx-backdrop" />
      <div
        className="fixed z-50 min-w-56 rounded-float border border-border bg-panel p-1 shadow-float"
        style={{ left: Math.min(x, window.innerWidth - 240), top: Math.min(y, window.innerHeight - 180) }}
        data-testid="ctx-menu"
      >
        <Item label={t("ctx.alert")} onClick={onAlert} />
        <Item label={t("ctx.indicator")} onClick={onIndicator} />
        <Item label={t("ctx.copy")} onClick={onCopy} kbd="⌘C" />
        <div className="my-1 h-px bg-border" />
        <Item label={t("ctx.settings")} onClick={onSettings} />
        <Item label={t("ctx.reset")} onClick={onReset} />
      </div>
    </>
  );
}
