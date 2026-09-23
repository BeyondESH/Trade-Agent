import { X } from "lucide-react";
import type React from "react";
import { t } from "../lib/i18n";
import { dismissToast, useToasts } from "../lib/toastStore";

interface Props {
  theme?: "dark" | "light";
}

/** Top-level toast outlet. Mounted once by App; renders nothing when idle. */
export const ToastHost: React.FC<Props> = ({ theme = "dark" }) => {
  const toasts = useToasts();
  if (toasts.length === 0) return null;
  const isDark = theme === "dark";

  return (
    <div
      role="status"
      aria-live="polite"
      data-testid="toast-host"
      className="fixed top-12 right-3 z-[100] flex w-[280px] flex-col gap-2 pointer-events-none"
    >
      {toasts.map((toast) => (
        <div
          key={toast.id}
          data-testid={`toast-${toast.id}`}
          className={`pointer-events-auto flex items-start justify-between gap-2 rounded-lg border p-3 text-xs shadow-2xl ${
            isDark
              ? "bg-[#1e222d] border-[#2a2e39] text-[#d1d4dc]"
              : "bg-white border-[#e0e3eb] text-[#131722]"
          }`}
        >
          <div className="flex flex-col gap-0.5">
            <span className="font-bold text-[#ff9800]">{toast.title}</span>
            {toast.message && <span className="text-[11px] text-gray-400">{toast.message}</span>}
          </div>
          <button
            type="button"
            data-testid={`toast-dismiss-${toast.id}`}
            onClick={() => dismissToast(toast.id)}
            title={t("Dismiss")}
            className="p-0.5 rounded hover:bg-gray-500/20 text-gray-400"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      ))}
    </div>
  );
};
