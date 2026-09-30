import { Monitor, Settings, X } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import type React from "react";
import { useEffect, useRef } from "react";
import { t } from "../../lib/i18n";
import { modalShell, scrim } from "../../lib/motion";
import type { ThemeMode } from "../../types/trading";
import { Kbd } from "../ui/kbd";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  theme: ThemeMode;
  onToggleTheme: () => void;
}

export const DesktopSettingsModal: React.FC<Props> = ({
  isOpen,
  onClose,
  theme,
  onToggleTheme,
}) => {
  const reduce = useReducedMotion();
  const shellRef = useRef<HTMLDivElement>(null);

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

  // When closed, AnimatePresence renders nothing (no wrapper is left behind).
  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          key="desktop-settings-backdrop"
          variants={scrim}
          initial="hidden"
          animate="show"
          exit="exit"
          className="fixed inset-0 z-50 flex items-center justify-center bg-ink/70 p-4 select-none backdrop-blur-sm"
        >
          <motion.div
            key="desktop-settings-shell"
            ref={shellRef}
            id="desktop-settings-modal"
            role="dialog"
            aria-modal="true"
            tabIndex={-1}
            variants={reduce ? scrim : modalShell}
            initial="hidden"
            animate="show"
            exit="exit"
            className="flex w-full max-w-xl flex-col overflow-hidden rounded-xl border border-line bg-surface text-content shadow-float outline-none"
          >
            {/* Header */}
            <div className="p-3 border-b border-line flex items-center justify-between">
              <div className="flex items-center gap-2 font-bold text-sm">
                <Settings className="w-4 h-4 text-signal" />
                <span>{t("Desktop App Settings")}</span>
              </div>
              <div className="flex items-center gap-2">
                <Kbd>Esc</Kbd>
                <button
                  onClick={onClose}
                  aria-label="Close"
                  className="p-1 rounded hover:bg-surface-2 text-muted hover:text-content"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Content */}
            <div className="p-4 flex flex-col gap-4 text-xs max-h-[460px] overflow-y-auto">
              {/* Section: Appearance — the only real, persisted setting. */}
              <div className="p-3 rounded-lg border border-line bg-surface-2 flex flex-col gap-3">
                <div className="font-bold text-xs text-signal uppercase tracking-wider flex items-center gap-1.5">
                  <Monitor className="w-3.5 h-3.5" />
                  <span>{t("Display & Theme")}</span>
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-semibold text-content">{t("Color Theme")}</div>
                    <div className="text-muted text-[11px]">
                      {t("Choose between Elegant Dark and Clean Light")}
                    </div>
                  </div>
                  <button
                    onClick={onToggleTheme}
                    className="rounded-md bg-signal px-3 py-1 font-semibold text-signal-ink"
                  >
                    {theme === "dark" ? "Dark Theme" : "Light Theme"}
                  </button>
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="p-3 border-t border-line flex justify-end bg-surface-2">
              <button
                onClick={onClose}
                className="rounded-md bg-signal px-4 py-1.5 text-xs font-semibold text-signal-ink hover:bg-signal/90"
              >
                {t("Close")}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
