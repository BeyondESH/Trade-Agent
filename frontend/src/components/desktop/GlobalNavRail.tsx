import {
  Bell,
  FileText,
  Filter,
  Flame,
  Keyboard,
  Monitor,
  Moon,
  Newspaper,
  Search,
  Settings,
  Sun,
  TrendingUp,
  Users,
} from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import type React from "react";
import { useState } from "react";
import { t } from "../../lib/i18n";
import type { DesktopViewMode, ThemeMode } from "../../types/trading";

interface Props {
  activeView: DesktopViewMode;
  onSelectView: (view: DesktopViewMode) => void;
  theme: ThemeMode;
  onToggleTheme: () => void;
  onOpenCommandPalette: () => void;
  onOpenShortcuts: () => void;
  onOpenSettings: () => void;
  onOpenAlertModal?: () => void;
}

const RAIL_SPRING = { type: "spring" as const, stiffness: 380, damping: 30 };

export const GlobalNavRail: React.FC<Props> = ({
  activeView,
  onSelectView,
  theme,
  onToggleTheme,
  onOpenCommandPalette,
  onOpenShortcuts,
  onOpenSettings,
  onOpenAlertModal,
}) => {
  const [hovered, setHovered] = useState<string | null>(null);
  const reduce = useReducedMotion();

  const navItems: {
    id: DesktopViewMode;
    label: string;
    icon: React.ReactNode;
    badge?: string;
  }[] = [
    {
      id: "chart",
      label: t("SuperCharts"),
      icon: <TrendingUp className="w-4 h-4" />,
    },
    {
      id: "markets",
      label: t("Markets"),
      icon: <Monitor className="w-4 h-4" />,
    },
    {
      id: "screener",
      label: t("Screener"),
      icon: <Filter className="w-4 h-4" />,
      badge: "2.0",
    },
    {
      id: "heatmaps",
      label: t("Heatmaps"),
      icon: <Flame className="w-4 h-4" />,
    },
    {
      id: "community",
      label: t("Community"),
      icon: <Users className="w-4 h-4" />,
    },
    {
      id: "news",
      label: t("News"),
      icon: <Newspaper className="w-4 h-4" />,
    },
    {
      id: "research",
      label: t("Research"),
      icon: <FileText className="w-4 h-4" />,
    },
  ];

  const labelFor = (id: string) => (hovered === id ? id : null);

  return (
    <aside
      id="global-nav-rail"
      className="w-[52px] h-full flex flex-col items-center border-r border-line bg-ink py-2 select-none z-40 shrink-0"
    >
      {/* Top: primary workbench modes */}
      <div className="flex flex-col items-center gap-1.5 w-full">
        {navItems.map((item) => {
          const isActive = activeView === item.id;
          return (
            <button
              key={item.id}
              onClick={() => onSelectView(item.id)}
              onMouseEnter={() => setHovered(item.id)}
              onMouseLeave={() => setHovered(null)}
              onFocus={() => setHovered(item.id)}
              onBlur={() => setHovered(null)}
              className="group relative w-10 h-10 rounded-xl flex items-center justify-center transition-colors"
              title={item.label}
            >
              {isActive && (
                <motion.span
                  layoutId="navrail-active-pill"
                  transition={reduce ? { duration: 0 } : RAIL_SPRING}
                  className="absolute inset-0 rounded-xl bg-signal shadow-e1"
                />
              )}

              <span
                className={`relative z-10 ${
                  isActive ? "text-signal-ink" : "text-muted group-hover:text-content"
                }`}
              >
                {item.icon}
              </span>

              {item.badge && !isActive && (
                <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 rounded-full bg-signal" />
              )}

              {/* Spring hover label slides in from the left of the rail */}
              <AnimatePresence>
                {labelFor(item.id) && (
                  <motion.span
                    initial={reduce ? { opacity: 0 } : { opacity: 0, x: -8 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={reduce ? { opacity: 0 } : { opacity: 0, x: -8 }}
                    transition={reduce ? { duration: 0 } : RAIL_SPRING}
                    className="pointer-events-none absolute left-full ml-2 z-50 whitespace-nowrap rounded-md border border-line bg-surface-2 px-2 py-1 text-[11px] font-semibold text-content shadow-float"
                  >
                    {item.label}
                  </motion.span>
                )}
              </AnimatePresence>
            </button>
          );
        })}
      </div>

      <div className="flex-1" />

      {/* Labelled hairline divider: workbench modes vs. global action cluster */}
      <div className="flex w-full flex-col items-center gap-1 pb-1.5">
        <span className="ta-eyebrow text-faint">{t("other")}</span>
        <span className="h-px w-6 bg-line" />
      </div>

      {/* Bottom: global action controls */}
      <div className="flex flex-col items-center gap-1.5 w-full">
        {onOpenAlertModal && (
          <button
            data-testid="nav-create-alert"
            onClick={onOpenAlertModal}
            className="w-10 h-10 rounded-xl flex items-center justify-center text-muted hover:bg-surface-2 hover:text-content transition-colors"
            title={t("Create Alert")}
          >
            <Bell className="w-3.5 h-3.5 text-signal" />
          </button>
        )}

        <button
          data-testid="nav-command-palette"
          onClick={onOpenCommandPalette}
          className="w-10 h-10 rounded-xl flex items-center justify-center text-muted hover:bg-surface-2 hover:text-content transition-colors"
          title={t("Command Palette (⌘K)")}
        >
          <Search className="w-3.5 h-3.5" />
        </button>

        <button
          onClick={onToggleTheme}
          className="w-10 h-10 rounded-xl flex items-center justify-center text-muted hover:bg-surface-2 hover:text-content transition-colors"
          title={`${theme === "dark" ? t("Switch to Light Mode") : t("Switch to Dark Mode")}`}
        >
          {theme === "dark" ? <Sun className="w-3.5 h-3.5" /> : <Moon className="w-3.5 h-3.5" />}
        </button>

        <button
          onClick={onOpenShortcuts}
          className="w-10 h-10 rounded-xl flex items-center justify-center text-muted hover:bg-surface-2 hover:text-content transition-colors"
          title={t("Keyboard Shortcuts (?)")}
        >
          <Keyboard className="w-3.5 h-3.5" />
        </button>

        <button
          onClick={onOpenSettings}
          className="w-10 h-10 rounded-xl flex items-center justify-center text-muted hover:bg-surface-2 hover:text-content transition-colors"
          title={t("Desktop Settings")}
        >
          <Settings className="w-3.5 h-3.5" />
        </button>
      </div>
    </aside>
  );
};
