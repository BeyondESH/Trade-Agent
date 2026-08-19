import { useEffect } from "react";
import type { ThemeMode } from "../../types/trading";

interface Props {
  x: number;
  y: number;
  price: number;
  symbol: string;
  theme: ThemeMode;
  onAddPriceLine: (price: number) => void;
  onCreateAlertAt: (price: number) => void;
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
  onAddPriceLine,
  onCreateAlertAt,
  onClose,
}) => {
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  const style: React.CSSProperties = {
    left: Math.min(x, (typeof window !== "undefined" ? window.innerWidth : 0) - 220),
    top: Math.min(y, (typeof window !== "undefined" ? window.innerHeight : 0) - 140),
  };
  const isDark = theme === "dark";

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
        <button
          type="button"
          role="menuitem"
          data-testid="menu-add-price-line"
          onClick={() => onAddPriceLine(price)}
          className={`w-full text-left px-3 py-2 cursor-pointer ${
            isDark ? "hover:bg-[#2a2e39]" : "hover:bg-gray-100"
          }`}
        >
          在此添加价格线
        </button>
        <button
          type="button"
          role="menuitem"
          data-testid="menu-set-alert"
          onClick={() => onCreateAlertAt(price)}
          className={`w-full text-left px-3 py-2 cursor-pointer ${
            isDark ? "hover:bg-[#2a2e39]" : "hover:bg-gray-100"
          }`}
        >
          在此设置价格警报
        </button>
      </div>
    </div>
  );
};
