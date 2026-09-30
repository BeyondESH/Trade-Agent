import { X } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import type React from "react";
import { t } from "../lib/i18n";
import { dismissToast, useToasts } from "../lib/toastStore";

interface Props {
  theme?: "dark" | "light";
}

/** Mirrors toastStore's DEFAULT_TTL_MS; the bar never drives the timer. */
const TOAST_TTL_MS = 5000;
const TOAST_SPRING = { type: "spring" as const, stiffness: 380, damping: 30 };

/**
 * Top-level toast outlet. Mounted once by App. The host always stays mounted so
 * the last toast can still play its exit; an empty stack renders nothing.
 * Newest toasts sit on top and push older ones down; each carries a hairline
 * progress bar that drains over its lifetime.
 */
export const ToastHost: React.FC<Props> = () => {
  const toasts = useToasts();
  const reduce = useReducedMotion();
  const stack = [...toasts].reverse();

  return (
    <div
      role="status"
      aria-live="polite"
      data-testid="toast-host"
      className="fixed top-12 right-3 z-[100] flex w-[280px] flex-col gap-2 pointer-events-none"
    >
      <AnimatePresence initial={false} mode="popLayout">
        {stack.map((toast, index) => (
          <motion.div
            key={toast.id}
            layout
            data-testid={`toast-${toast.id}`}
            initial={reduce ? { opacity: 0 } : { opacity: 0, x: 48, scale: 0.94 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            exit={reduce ? { opacity: 0 } : { opacity: 0, x: 48, scale: 0.94 }}
            transition={reduce ? { duration: 0 } : { ...TOAST_SPRING, delay: index * 0.015 }}
            style={{ zIndex: stack.length - index }}
            className="pointer-events-auto relative flex items-start justify-between gap-2 overflow-hidden rounded-lg border border-line bg-surface text-content shadow-float p-3 text-xs"
          >
            <div className="flex flex-col gap-0.5">
              <span className="font-bold text-signal">{toast.title}</span>
              {toast.message && <span className="text-[11px] text-muted">{toast.message}</span>}
            </div>
            <button
              type="button"
              data-testid={`toast-dismiss-${toast.id}`}
              onClick={() => dismissToast(toast.id)}
              title={t("Dismiss")}
              className="p-0.5 rounded text-muted hover:bg-surface-2 hover:text-content"
            >
              <X className="w-3.5 h-3.5" />
            </button>

            {/* Auto-dismiss progress hairline, drains over the toast lifetime */}
            <motion.span
              aria-hidden="true"
              initial={{ scaleX: 1 }}
              animate={{ scaleX: 0 }}
              transition={{ duration: TOAST_TTL_MS / 1000, ease: "linear" }}
              className="absolute bottom-0 left-0 h-0.5 w-full origin-left bg-signal"
            />
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
};
