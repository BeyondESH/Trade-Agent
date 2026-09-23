import { Bell, Copy, RotateCcw, Settings, SlidersHorizontal } from "lucide-react";
import { useEffect } from "react";
import type { ThemeMode } from "../../types/trading";

interface Props {
  x: number;
  y: number;
  price: number;
  symbol: string;
  theme: ThemeMode;
  onCreateAlertAt: (price: number) => void;
  onAddIndicator: () => void;
  onCopyPrice: (price: number) => void;
  onOpenSettings: () => void;
  onResetView: () => void;
  onClose: () => void;
}

function formatPrice(p: number): string {
  return Number.isInteger(p) ? String(p) : String(parseFloat(p.toFixed(6)));
}

/** Right-click context menu shown over the candle pane. */
export const ChartContextMenu: React.FC<Props> = ({
  x,
  y,
  price,
  symbol,
  theme,
  onCreateAlertAt,
  onAddIndicator,
  onCopyPrice,
  onOpenSettings,
  onResetView,
  onClose,
}) => {
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
        return;
      }
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const key = e.key.toLowerCase();
      if (key === "a") onCreateAlertAt(price);
      else if (key === "i") onAddIndicator();
      else if (key === "c") onCopyPrice(price);
      else if (key === "s") onOpenSettings();
      else if (key === "r") onResetView();
      else return;
      e.preventDefault();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose, onCreateAlertAt, onAddIndicator, onCopyPrice, onOpenSettings, onResetView, price]);

  const style: React.CSSProperties = {
    left: Math.min(x, (typeof window !== "undefined" ? window.innerWidth : 0) - 220),
    top: Math.min(y, (typeof window !== "undefined" ? window.innerHeight : 0) - 240),
  };
  const isDark = theme === "dark";

  const items = [
    {
      testId: "menu-create-alert",
      label: "在此创建价格警报",
      icon: Bell,
      shortcut: "A",
      run: () => onCreateAlertAt(price),
    },
    {
      testId: "menu-add-indicator",
      label: "添加指标",
      icon: SlidersHorizontal,
      shortcut: "I",
      run: onAddIndicator,
    },
    {
      testId: "menu-copy-price",
      label: "复制价格",
      icon: Copy,
      shortcut: "C",
      run: () => onCopyPrice(price),
    },
    {
      testId: "menu-open-settings",
      label: "设置",
      icon: Settings,
      shortcut: "S",
      run: onOpenSettings,
    },
    {
      testId: "menu-reset-view",
      label: "重置视图",
      icon: RotateCcw,
      shortcut: "R",
      run: onResetView,
    },
  ];

  return (
    <div
      className="fixed inset-0 z-40"
      data-testid="chart-context-menu-backdrop"
      onClick={onClose}
      onContextMenu={(e) => e.preventDefault()}
    >
      <div
        role="menu"
        data-testid="chart-context-menu"
        className={`fixed z-50 min-w-[220px] rounded-lg border shadow-2xl py-1 text-xs font-medium select-none ${
          isDark
            ? "bg-[#1e222d] border-[#2a2e39] text-[#d1d4dc]"
            : "bg-white border-[#e0e3eb] text-[#131722]"
        }`}
        style={style}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className={`px-3 py-1.5 border-b font-semibold truncate ${
            isDark ? "border-[#2a2e39] text-gray-400" : "border-[#e0e3eb] text-gray-500"
          }`}
        >
          {symbol} · {formatPrice(price)}
        </div>
        {items.map(({ testId, label, icon: Icon, shortcut, run }) => (
          <button
            key={testId}
            type="button"
            role="menuitem"
            data-testid={testId}
            onClick={run}
            className={`w-full flex items-center justify-between gap-3 px-3 py-2 cursor-pointer ${
              isDark ? "hover:bg-[#2a2e39]" : "hover:bg-gray-100"
            }`}
          >
            <span className="flex items-center gap-2">
              <Icon className="w-3.5 h-3.5 opacity-70" />
              <span>{label}</span>
            </span>
            <kbd
              className={`px-1.5 py-0.5 rounded text-[10px] font-mono ${
                isDark ? "bg-[#131722] text-gray-500" : "bg-gray-100 text-gray-500"
              }`}
            >
              {shortcut}
            </kbd>
          </button>
        ))}
      </div>
    </div>
  );
};
