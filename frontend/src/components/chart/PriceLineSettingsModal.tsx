import { useEffect, useState } from "react";
import { X } from "lucide-react";
import {
  ALERT_LINE_COLOR,
  REFERENCE_LINE_COLOR_DARK,
  REFERENCE_LINE_COLOR_LIGHT,
  type Alert,
} from "../../lib/alertsStore";
import type { ThemeMode } from "../../types/trading";

type AlertPatch = Partial<Omit<Alert, "id" | "symbol" | "createdAt">>;

interface Props {
  alert: Alert;
  theme: ThemeMode;
  onSave: (id: string, patch: AlertPatch) => void;
  onDelete: (id: string) => void;
  onClose: () => void;
}

const COLOR_OPTIONS = [
  { label: "警报黄", value: ALERT_LINE_COLOR },
  { label: "深灰", value: REFERENCE_LINE_COLOR_DARK },
  { label: "浅灰", value: REFERENCE_LINE_COLOR_LIGHT },
  { label: "绿色", value: "#089981" },
  { label: "红色", value: "#f23645" },
];

/** Settings popup for a price line / alert line (opened by left-clicking the line). */
export const PriceLineSettingsModal: React.FC<Props> = ({
  alert,
  theme,
  onSave,
  onDelete,
  onClose,
}) => {
  const [threshold, setThreshold] = useState<string>(String(alert.threshold));
  const [color, setColor] = useState<string>(alert.color ?? "");
  const [enabled, setEnabled] = useState<boolean>(alert.enabled);
  const [condition, setCondition] = useState<"above" | "below">(alert.condition);
  const [error, setError] = useState<string | null>(null);
  const isDark = theme === "dark";

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  const handleSave = () => {
    const price = Number(threshold);
    if (!Number.isFinite(price) || price <= 0) {
      setError("请输入有效的价格");
      return;
    }
    onSave(alert.id, {
      threshold: price,
      color: color || undefined,
      enabled,
      condition,
    });
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 select-none"
      onClick={onClose}
    >
      <div
        data-testid="price-line-settings-modal"
        className={`w-full max-w-md rounded-xl shadow-2xl border flex flex-col overflow-hidden ${
          isDark
            ? "bg-[#1e222d] border-[#2a2e39] text-[#d1d4dc]"
            : "bg-white border-[#e0e3eb] text-[#131722]"
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className={`p-3 border-b flex items-center justify-between font-bold text-sm ${
            isDark ? "border-[#2a2e39]" : "border-[#e0e3eb]"
          }`}
        >
          <span>价格线设置 · {alert.symbol}</span>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded hover:bg-gray-500/20 text-gray-400 hover:text-white"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-4 flex flex-col gap-3 text-xs">
          <div>
            <label className="text-gray-400 font-semibold mb-1 block">价格</label>
            <input
              type="number"
              step="any"
              value={threshold}
              onChange={(e) => setThreshold(e.target.value)}
              className={`w-full p-2 rounded border outline-none font-mono font-bold ${
                isDark
                  ? "bg-[#131722] border-[#2a2e39] text-white"
                  : "bg-white border-[#e0e3eb] text-black"
              }`}
            />
          </div>

          <div>
            <label className="text-gray-400 font-semibold mb-1 block">颜色</label>
            <div className="flex flex-wrap gap-2">
              {COLOR_OPTIONS.map((c) => (
                <button
                  type="button"
                  key={c.value}
                  onClick={() => setColor(color === c.value ? "" : c.value)}
                  title={c.label}
                  className={`w-8 h-8 rounded border cursor-pointer transition-transform ${
                    color === c.value
                      ? "border-white ring-2 ring-[#2962ff]"
                      : "border-[#2a2e39]"
                  }`}
                  style={{ backgroundColor: c.value }}
                />
              ))}
            </div>
          </div>

          <div>
            <label className="text-gray-400 font-semibold mb-1 block">类型</label>
            <div className="flex gap-2">
              {(
                [
                  { label: "参考线", value: false },
                  { label: "价格警报", value: true },
                ] as const
              ).map((opt) => (
                <button
                  type="button"
                  key={opt.label}
                  onClick={() => setEnabled(opt.value)}
                  className={`flex-1 py-1.5 rounded border text-xs font-semibold transition-colors cursor-pointer ${
                    enabled === opt.value
                      ? "bg-[#2962ff] text-white border-[#2962ff]"
                      : isDark
                        ? "border-[#2a2e39] hover:bg-[#2a2e39]"
                        : "border-[#e0e3eb] hover:bg-gray-100"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {enabled && (
            <div>
              <label className="text-gray-400 font-semibold mb-1 block">条件</label>
              <div className="flex gap-2">
                {(
                  [
                    { label: "高于", value: "above" },
                    { label: "低于", value: "below" },
                  ] as const
                ).map((opt) => (
                  <button
                    type="button"
                    key={opt.value}
                    onClick={() => setCondition(opt.value)}
                    className={`flex-1 py-1.5 rounded border text-xs font-semibold transition-colors cursor-pointer ${
                      condition === opt.value
                        ? "bg-[#2962ff] text-white border-[#2962ff]"
                        : isDark
                          ? "border-[#2a2e39] hover:bg-[#2a2e39]"
                          : "border-[#e0e3eb] hover:bg-gray-100"
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {error && <div className="text-red-400 font-semibold">{error}</div>}
        </div>

        <div
          className={`p-3 border-t flex justify-between items-center ${
            isDark ? "border-[#2a2e39] bg-[#131722]" : "border-[#e0e3eb] bg-gray-50"
          }`}
        >
          <button
            type="button"
            data-testid="delete-price-line"
            onClick={() => {
              onDelete(alert.id);
              onClose();
            }}
            className="px-3 py-1.5 rounded text-xs font-semibold bg-[#f23645]/15 text-[#f23645] hover:bg-[#f23645]/25 cursor-pointer"
          >
            删除此线
          </button>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className={`px-3 py-1.5 rounded text-xs font-semibold cursor-pointer ${
                isDark ? "hover:bg-[#2a2e39]" : "hover:bg-gray-200"
              }`}
            >
              取消
            </button>
            <button
              type="button"
              data-testid="save-price-line"
              onClick={handleSave}
              className="px-4 py-1.5 rounded text-xs font-semibold bg-[#2962ff] text-white hover:bg-[#1e53e5] transition-colors cursor-pointer"
            >
              保存
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
