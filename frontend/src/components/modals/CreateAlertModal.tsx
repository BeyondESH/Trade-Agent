import { Bell, Check, X } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import type React from "react";
import { useEffect, useRef, useState } from "react";
import { t } from "../../lib/i18n";
import { modalShell, scrim } from "../../lib/motion";
import type { AlertItem, SymbolInfo } from "../../types/trading";
import { Kbd } from "../ui/kbd";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  symbol: SymbolInfo;
  onAddAlert: (alert: AlertItem) => void;
  theme: "dark" | "light";
  /** Prefill the target price (e.g. from the chart right-click menu). */
  initialPrice?: number;
}

export const CreateAlertModal: React.FC<Props> = ({
  isOpen,
  onClose,
  symbol,
  onAddAlert,
  initialPrice,
}) => {
  const reduce = useReducedMotion();
  const shellRef = useRef<HTMLFormElement>(null);
  const [condition, setCondition] = useState<
    "Crossing" | "Crossing Up" | "Crossing Down" | "Greater Than" | "Less Than"
  >("Crossing");
  const [targetPrice, setTargetPrice] = useState<number>(
    initialPrice ?? Number(symbol.price.toFixed(symbol.digits)),
  );
  const [frequency, setFrequency] = useState<"Only Once" | "Every Time">("Only Once");
  const [note, setNote] = useState("");

  // Escape closes while the dialog is open.
  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isOpen, onClose]);

  // Move focus into the dialog on open: first field, else the shell itself.
  useEffect(() => {
    if (!isOpen) return;
    const firstField = shellRef.current?.querySelector<HTMLElement>("input, select, textarea");
    (firstField ?? shellRef.current)?.focus();
  }, [isOpen]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onAddAlert({
      id: `alt-${Date.now()}`,
      symbol: symbol.ticker,
      condition,
      targetPrice,
      createdAt: "Just now",
      enabled: true,
      triggered: false,
      note: note || `${symbol.ticker} ${condition} $${targetPrice}`,
      frequency,
    });
    onClose();
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          key="create-alert-backdrop"
          variants={scrim}
          initial="hidden"
          animate="show"
          exit="exit"
          className="fixed inset-0 z-50 flex items-center justify-center bg-ink/70 p-4 select-none backdrop-blur-sm"
        >
          <motion.form
            key="create-alert-shell"
            ref={shellRef}
            onSubmit={handleSubmit}
            id="create-alert-modal"
            role="dialog"
            aria-modal="true"
            tabIndex={-1}
            variants={reduce ? scrim : modalShell}
            initial="hidden"
            animate="show"
            exit="exit"
            className="flex w-full max-w-md flex-col overflow-hidden rounded-xl border border-line bg-surface text-content shadow-float outline-none"
          >
            {/* Header */}
            <div className="p-3 border-b border-line flex items-center justify-between">
              <div className="flex items-center gap-2 font-bold text-sm">
                <Bell className="w-4 h-4 text-signal" />
                <span>Create Alert on {symbol.ticker}</span>
              </div>
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

            {/* Form Body */}
            <div className="p-4 flex flex-col gap-3 text-xs">
              <div>
                <label className="text-muted font-semibold mb-1 block">{t("Condition")}</label>
                <select
                  data-testid="alert-condition"
                  value={condition}
                  onChange={(e) => setCondition(e.target.value as any)}
                  className="w-full rounded-md border border-line bg-ink px-2 py-1.5 text-xs text-content outline-none focus:border-signal"
                >
                  <option value="Crossing">{t("Crossing Price")}</option>
                  <option value="Crossing Up">{t("Crossing Up")}</option>
                  <option value="Crossing Down">{t("Crossing Down")}</option>
                  <option value="Greater Than">{t("Greater Than")}</option>
                  <option value="Less Than">{t("Less Than")}</option>
                </select>
              </div>

              <div>
                <label className="text-muted font-semibold mb-1 block">
                  {t("Target Price ($)")}
                </label>
                <input
                  type="number"
                  data-testid="alert-target-price"
                  step="any"
                  value={targetPrice}
                  onChange={(e) => setTargetPrice(Number(e.target.value))}
                  required
                  className="w-full rounded-md border border-line bg-ink px-2 py-1.5 ta-num font-bold text-content outline-none focus:border-signal"
                />
              </div>

              <div>
                <label className="text-muted font-semibold mb-1 block">
                  {t("Trigger Frequency")}
                </label>
                <div className="flex gap-2">
                  {(["Only Once", "Every Time"] as const).map((f) => (
                    <button
                      type="button"
                      key={f}
                      onClick={() => setFrequency(f)}
                      className={`flex-1 rounded-md border py-1.5 text-xs font-semibold transition-colors ${
                        frequency === f
                          ? "border-signal bg-signal text-signal-ink"
                          : "border-line bg-surface text-muted hover:text-content"
                      }`}
                    >
                      {f}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-muted font-semibold mb-1 block">
                  {t("Alert Message / Note")}
                </label>
                <input
                  type="text"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="e.g. BTC breakout confirmation at key resistance"
                  className="w-full rounded-md border border-line bg-ink px-2 py-1.5 text-xs text-content outline-none placeholder:text-faint focus:border-signal"
                />
              </div>
            </div>

            {/* Footer */}
            <div className="p-3 border-t border-line flex justify-end gap-2 bg-surface-2">
              <button
                type="button"
                onClick={onClose}
                className="px-3 py-1.5 rounded text-xs font-semibold text-muted hover:bg-surface-2 hover:text-content"
              >
                Cancel
              </button>
              <button
                type="submit"
                data-testid="alert-submit"
                className="rounded-md bg-signal px-4 py-1.5 text-xs font-semibold text-signal-ink hover:bg-signal/90 transition-colors"
              >
                Create Alert
              </button>
            </div>
          </motion.form>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
