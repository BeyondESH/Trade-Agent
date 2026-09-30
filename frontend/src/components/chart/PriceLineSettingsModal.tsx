import { X } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import {
  ALERT_LINE_COLOR,
  type Alert,
  REFERENCE_LINE_COLOR_DARK,
  REFERENCE_LINE_COLOR_LIGHT,
} from "../../lib/alertsStore";
import { modalShell, scrim } from "../../lib/motion";
import type { ThemeMode } from "../../types/trading";
import { Kbd } from "../ui/kbd";

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
  { label: "绿色", value: "#22b98c" },
  { label: "红色", value: "#ef5a5f" },
];

/** Settings popup for a price line / alert line (opened by left-clicking the line). */
export const PriceLineSettingsModal: React.FC<Props> = ({ alert, onSave, onDelete, onClose }) => {
  const reduce = useReducedMotion();
  const shellRef = useRef<HTMLDivElement>(null);
  const [threshold, setThreshold] = useState<string>(String(alert.threshold));
  const [color, setColor] = useState<string>(alert.color ?? "");
  const [enabled, setEnabled] = useState<boolean>(alert.enabled);
  const [condition, setCondition] = useState<"above" | "below">(alert.condition);
  const [error, setError] = useState<string | null>(null);

  // Escape closes while the dialog is open.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  // Move focus into the dialog on open: first field, else the shell itself.
  useEffect(() => {
    const firstField = shellRef.current?.querySelector<HTMLElement>("input, select, textarea");
    (firstField ?? shellRef.current)?.focus();
  }, []);

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
    <AnimatePresence>
      <motion.div
        key="price-line-backdrop"
        variants={scrim}
        initial="hidden"
        animate="show"
        exit="exit"
        className="fixed inset-0 z-50 flex items-center justify-center bg-ink/70 p-4 select-none backdrop-blur-sm"
        onClick={onClose}
      >
        <motion.div
          key="price-line-shell"
          ref={shellRef}
          data-testid="price-line-settings-modal"
          role="dialog"
          aria-modal="true"
          tabIndex={-1}
          variants={reduce ? scrim : modalShell}
          initial="hidden"
          animate="show"
          exit="exit"
          className="flex w-full max-w-md flex-col overflow-hidden rounded-xl border border-line bg-surface text-content shadow-float outline-none"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="p-3 border-b border-line flex items-center justify-between font-bold text-sm">
            <span>价格线设置 · {alert.symbol}</span>
            <div className="flex items-center gap-2">
              <Kbd>Esc</Kbd>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close"
                className="p-1 rounded hover:bg-surface-2 text-muted hover:text-content"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          <div className="p-4 flex flex-col gap-3 text-xs">
            <div>
              <label className="text-muted font-semibold mb-1 block">价格</label>
              <input
                type="number"
                step="any"
                value={threshold}
                onChange={(e) => setThreshold(e.target.value)}
                className="w-full rounded-md border border-line bg-ink px-2 py-1.5 ta-num font-bold text-content outline-none focus:border-signal"
              />
            </div>

            <div>
              <label className="text-muted font-semibold mb-1 block">颜色</label>
              <div className="flex flex-wrap gap-2">
                {COLOR_OPTIONS.map((c) => (
                  <button
                    type="button"
                    key={c.value}
                    onClick={() => setColor(color === c.value ? "" : c.value)}
                    title={c.label}
                    className={`w-8 h-8 rounded border cursor-pointer transition-transform ${
                      color === c.value ? "border-content ring-2 ring-signal" : "border-line"
                    }`}
                    style={{ backgroundColor: c.value }}
                  />
                ))}
              </div>
            </div>

            <div>
              <label className="text-muted font-semibold mb-1 block">类型</label>
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
                    className={`flex-1 rounded-md border py-1.5 text-xs font-semibold transition-colors cursor-pointer ${
                      enabled === opt.value
                        ? "border-signal bg-signal text-signal-ink"
                        : "border-line bg-surface text-muted hover:text-content"
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {enabled && (
              <div>
                <label className="text-muted font-semibold mb-1 block">条件</label>
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
                      className={`flex-1 rounded-md border py-1.5 text-xs font-semibold transition-colors cursor-pointer ${
                        condition === opt.value
                          ? "border-signal bg-signal text-signal-ink"
                          : "border-line bg-surface text-muted hover:text-content"
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {error && <div className="text-down font-semibold">{error}</div>}
          </div>

          <div className="p-3 border-t border-line flex justify-between items-center bg-surface-2">
            <button
              type="button"
              data-testid="delete-price-line"
              onClick={() => {
                onDelete(alert.id);
                onClose();
              }}
              className="rounded-md bg-down/15 px-3 py-1.5 text-xs font-semibold text-down hover:bg-down/25 cursor-pointer"
            >
              删除此线
            </button>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-3 py-1.5 rounded text-xs font-semibold text-muted hover:bg-surface-2 hover:text-content cursor-pointer"
              >
                取消
              </button>
              <button
                type="button"
                data-testid="save-price-line"
                onClick={handleSave}
                className="rounded-md bg-signal px-4 py-1.5 text-xs font-semibold text-signal-ink hover:bg-signal/90 transition-colors cursor-pointer"
              >
                保存
              </button>
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};
