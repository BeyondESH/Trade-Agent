import { Keyboard, X } from "lucide-react";
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
}

export const KeyboardShortcutsModal: React.FC<Props> = ({ isOpen, onClose }) => {
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

  const categories = [
    {
      title: "Navigation & Workspaces",
      shortcuts: [
        { key: "⌘ + K", desc: "Open Global Command Palette" },
        { key: "⌘ + T", desc: "New Workspace Tab" },
        { key: "⌘ + W", desc: "Close Active Tab" },
        { key: "Space", desc: "Cycle to Next Symbol in Watchlist" },
        { key: "Shift + Space", desc: "Cycle to Previous Symbol" },
      ],
    },
    {
      title: "Charting & Drawing Tools",
      shortcuts: [
        { key: "Alt + T", desc: "Select Trend Line Tool" },
        { key: "Alt + H", desc: "Horizontal Line Tool" },
        { key: "Alt + F", desc: "Fibonacci Retracement" },
        { key: "Alt + C", desc: "Crosshair Mode" },
        { key: "/", desc: "Open Technical Indicators Library" },
        { key: "Alt + A", desc: "Create Price Alert" },
      ],
    },
    {
      title: "Chart Navigation",
      shortcuts: [
        { key: "Scroll Wheel", desc: "Zoom In / Out Time Axis" },
        { key: "Click + Drag", desc: "Pan Chart Canvas" },
        { key: "Double Click", desc: "Auto-fit & Reset Chart Scale" },
        { key: "Shift + Drag", desc: "Measure Price & Bars Box" },
      ],
    },
  ];

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          key="keyboard-shortcuts-backdrop"
          variants={scrim}
          initial="hidden"
          animate="show"
          exit="exit"
          className="fixed inset-0 z-50 flex items-center justify-center bg-ink/70 p-4 select-none backdrop-blur-sm"
        >
          <motion.div
            key="keyboard-shortcuts-shell"
            ref={shellRef}
            id="keyboard-shortcuts-modal"
            role="dialog"
            aria-modal="true"
            tabIndex={-1}
            variants={reduce ? scrim : modalShell}
            initial="hidden"
            animate="show"
            exit="exit"
            className="flex w-full max-w-2xl flex-col overflow-hidden rounded-xl border border-line bg-surface text-content shadow-float outline-none"
          >
            {/* Header */}
            <div className="p-3 border-b border-line flex items-center justify-between">
              <div className="flex items-center gap-2 font-bold text-sm">
                <Keyboard className="w-4 h-4 text-signal" />
                <span>{t("BeyondEther Desktop Keyboard Shortcuts")}</span>
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

            {/* Content Body */}
            <div className="p-4 grid grid-cols-1 md:grid-cols-2 gap-4 max-h-[460px] overflow-y-auto">
              {categories.map((cat, i) => (
                <div
                  key={i}
                  className="p-3 rounded-lg border border-line bg-surface-2 flex flex-col gap-2"
                >
                  <div className="font-bold text-xs text-signal uppercase tracking-wider">
                    {cat.title}
                  </div>
                  <div className="flex flex-col gap-1.5 text-xs">
                    {cat.shortcuts.map((s, idx) => (
                      <div key={idx} className="flex items-center justify-between gap-2">
                        <span className="text-content">{s.desc}</span>
                        <kbd className="rounded bg-ink px-1.5 py-0.5 ta-num text-2xs text-muted whitespace-nowrap">
                          {s.key}
                        </kbd>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            {/* Footer */}
            <div className="p-3 border-t border-line flex justify-end bg-surface-2">
              <button
                onClick={onClose}
                className="rounded-md bg-signal px-4 py-1.5 text-xs font-semibold text-signal-ink hover:bg-signal/90"
              >
                Close
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
