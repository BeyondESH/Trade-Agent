import {
  Bell,
  ChevronDown,
  Cloud,
  FileText,
  Filter,
  Flame,
  Keyboard,
  Layout,
  Monitor,
  Newspaper,
  Pin,
  Plus,
  Search,
  Settings,
  TrendingUp,
  Users,
  X,
} from "lucide-react";
import { AnimatePresence, motion, Reorder, useReducedMotion } from "motion/react";
import type React from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { t } from "../../lib/i18n";
import { formatRelativeTime } from "../../lib/newsfeed";
import type { AlertItem, DesktopTab, DesktopViewMode, ThemeMode } from "../../types/trading";
import { Kbd } from "../ui/kbd";

interface Props {
  tabs: DesktopTab[];
  activeTabId: string;
  onSelectTab: (id: string) => void;
  onCloseTab: (id: string) => void;
  onNewTab: (type: DesktopViewMode | "dashboard") => void;
  onPinTab: (id: string) => void;
  theme: ThemeMode;
  onToggleTheme: () => void;
  onOpenCommandPalette: () => void;
  onOpenDesktopSettings: () => void;
  onOpenShortcutsModal: () => void;
  /** Real triggered alerts drive the notification dropdown (empty → empty state). */
  triggeredAlerts?: AlertItem[];
}

/** Shared spring for the small chrome transitions on this bar. */
const CHROME_SPRING = { type: "spring" as const, stiffness: 380, damping: 30 };

export const DesktopTitleBar: React.FC<Props> = ({
  tabs,
  activeTabId,
  onSelectTab,
  onCloseTab,
  onNewTab,
  onPinTab,
  theme,
  onToggleTheme,
  onOpenCommandPalette,
  onOpenDesktopSettings,
  onOpenShortcutsModal,
  triggeredAlerts = [],
}) => {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);
  // Local reorder ledger: display order is (ledger ∩ tabs) followed by tabs
  // that arrived after the last reorder, so drag order survives unrelated
  // re-renders without threading a new callback through App.
  const [order, setOrder] = useState<string[]>(() => tabs.map((tab) => tab.id));
  const reduce = useReducedMotion();

  const tabsScrollRef = useRef<HTMLDivElement>(null);

  // Keep the active tab visible when the tab bar overflows: new tabs are
  // appended to the right and hidden scrollbars leave no manual entry point.
  useEffect(() => {
    const container = tabsScrollRef.current;
    if (!container) return;
    const active = container.querySelector(`[data-tab-id="${activeTabId}"]`);
    if (active) active.scrollIntoView({ inline: "nearest", block: "nearest" });
  }, [activeTabId]);

  // Reconcile the ledger against the live tab list without an effect loop.
  const orderedTabs = useMemo(() => {
    const byId = new Map(tabs.map((tab) => [tab.id, tab]));
    const seen = new Set<string>();
    const out: DesktopTab[] = [];
    for (const id of order) {
      const tab = byId.get(id);
      if (tab) {
        out.push(tab);
        seen.add(id);
      }
    }
    for (const tab of tabs) {
      if (!seen.has(tab.id)) out.push(tab);
    }
    return out;
  }, [tabs, order]);

  const orderedIds = useMemo(() => orderedTabs.map((tab) => tab.id), [orderedTabs]);

  const getTabIcon = (type: DesktopViewMode | "dashboard", isActive = false) => {
    const tone = isActive ? "text-signal" : "text-faint";
    switch (type) {
      case "chart":
        return <TrendingUp className={`w-3.5 h-3.5 ${tone}`} />;
      case "markets":
        return <Monitor className={`w-3.5 h-3.5 ${tone}`} />;
      case "screener":
        return <Filter className={`w-3.5 h-3.5 ${tone}`} />;
      case "heatmaps":
        return <Flame className={`w-3.5 h-3.5 ${tone}`} />;
      case "community":
        return <Users className={`w-3.5 h-3.5 ${tone}`} />;
      case "news":
        return <Newspaper className={`w-3.5 h-3.5 ${tone}`} />;
      case "research":
        return <FileText className={`w-3.5 h-3.5 ${tone}`} />;
      case "dashboard":
        return <Layout className={`w-3.5 h-3.5 ${tone}`} />;
      default:
        return <Layout className={`w-3.5 h-3.5 ${tone}`} />;
    }
  };

  return (
    <div
      id="trade-agent-titlebar"
      className="h-10 w-full flex items-center justify-between border-b border-line bg-ink px-2 select-none z-50 text-xs font-sans text-content"
    >
      {/* Left: brand lockup + multi-tab strip */}
      <div className="flex items-center gap-2 h-full flex-1 min-w-0">
        {/* TA lockup + app menu */}
        <div className="relative shrink-0">
          <motion.button
            type="button"
            onClick={() => setIsMenuOpen((open) => !open)}
            whileTap={reduce ? undefined : { scale: 0.97 }}
            transition={CHROME_SPRING}
            className="flex items-center gap-2 rounded-md px-1.5 py-1 transition-colors hover:bg-surface-2"
          >
            <span className="ta-display flex h-6 w-6 items-center justify-center rounded-md bg-signal text-2xs text-signal-ink">
              TA
            </span>
            <span className="flex items-center gap-1.5">
              <span className="ta-display text-sm tracking-tight text-content">
                {t("BeyondEther")}
              </span>
              <span
                aria-hidden="true"
                title={t("Cloud Sync: Active")}
                className="h-1.5 w-1.5 rounded-full bg-up"
              />
            </span>
            <ChevronDown
              className={`h-3 w-3 text-faint transition-transform duration-150 ${
                isMenuOpen ? "rotate-180" : ""
              }`}
            />
          </motion.button>

          <AnimatePresence>
            {isMenuOpen && (
              <motion.div
                key="app-menu"
                initial={reduce ? { opacity: 0 } : { opacity: 0, y: -6, scale: 0.97 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={reduce ? { opacity: 0 } : { opacity: 0, y: -6, scale: 0.97 }}
                transition={reduce ? { duration: 0 } : CHROME_SPRING}
                className="absolute top-full left-0 mt-1 w-60 origin-top-left overflow-hidden rounded-lg border border-line bg-surface text-content shadow-float py-1 z-50"
              >
                <div className="px-3 py-1.5 border-b border-line/60 ta-eyebrow text-faint">
                  {t("Desktop Pro")}
                </div>

                <button
                  onClick={() => {
                    onNewTab("chart");
                    setIsMenuOpen(false);
                  }}
                  className="w-full text-left px-3 py-1.5 flex items-center justify-between text-content hover:bg-surface-2/60 transition-colors"
                >
                  <span>{t("New Chart Tab")}</span>
                  <Kbd>⌘T</Kbd>
                </button>

                <button
                  data-testid="menu-new-research-tab"
                  onClick={() => {
                    onNewTab("research");
                    setIsMenuOpen(false);
                  }}
                  className="w-full text-left px-3 py-1.5 flex items-center justify-between text-content hover:bg-surface-2/60 transition-colors"
                >
                  <span>{t("New Research Tab")}</span>
                  <FileText className="w-3 h-3 text-signal" />
                </button>

                <button
                  onClick={() => {
                    onOpenCommandPalette();
                    setIsMenuOpen(false);
                  }}
                  className="w-full text-left px-3 py-1.5 flex items-center justify-between text-content hover:bg-surface-2/60 transition-colors"
                >
                  <span>{t("Command Palette")}</span>
                  <Kbd>⌘K</Kbd>
                </button>

                <div className="my-1 border-t border-line/60" />

                <button
                  onClick={() => {
                    onToggleTheme();
                    setIsMenuOpen(false);
                  }}
                  className="w-full text-left px-3 py-1.5 flex items-center justify-between text-content hover:bg-surface-2/60 transition-colors"
                >
                  <span>{t(theme === "dark" ? "Color Theme: Dark" : "Color Theme: Light")}</span>
                  <span className="text-2xs text-signal font-semibold">{t("Toggle")}</span>
                </button>

                <button
                  onClick={() => {
                    onOpenDesktopSettings();
                    setIsMenuOpen(false);
                  }}
                  className="w-full text-left px-3 py-1.5 flex items-center gap-2 text-content hover:bg-surface-2/60 transition-colors"
                >
                  <Settings className="w-3.5 h-3.5" />
                  <span>{t("Desktop App Settings")}</span>
                </button>

                <button
                  onClick={() => {
                    onOpenShortcutsModal();
                    setIsMenuOpen(false);
                  }}
                  className="w-full text-left px-3 py-1.5 flex items-center gap-2 text-content hover:bg-surface-2/60 transition-colors"
                >
                  <Keyboard className="w-3.5 h-3.5" />
                  <span>{t("Keyboard Shortcuts")}</span>
                </button>

                <div className="my-1 border-t border-line/60" />

                <div className="px-3 py-1 flex items-center justify-between text-2xs text-muted">
                  <span>{t("Cloud Sync: Active")}</span>
                  <span className="w-2 h-2 rounded-full bg-up" />
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Multi-Tab Bar — drag-reorderable, overflow fades at the edges */}
        <div ref={tabsScrollRef} className="flex h-full flex-1 min-w-0 items-center">
          <Reorder.Group
            axis="x"
            values={orderedIds}
            onReorder={setOrder}
            className="ta-fade-x flex items-center h-full gap-1 overflow-x-auto no-scrollbar flex-1 min-w-0"
          >
            {orderedTabs.map((tab) => {
              const isActive = tab.id === activeTabId;
              return (
                <Reorder.Item
                  key={tab.id}
                  value={tab.id}
                  data-tab-id={tab.id}
                  onClick={() => onSelectTab(tab.id)}
                  onDoubleClick={() => onPinTab(tab.id)}
                  onAuxClick={(e) => {
                    if (e.button === 1 && tabs.length > 1) {
                      e.preventDefault();
                      onCloseTab(tab.id);
                    }
                  }}
                  whileDrag={reduce ? undefined : { scale: 1.04, zIndex: 6 }}
                  transition={reduce ? { duration: 0 } : CHROME_SPRING}
                  className={`group relative flex items-center gap-1.5 px-3 h-[30px] rounded-t-md cursor-pointer border-t border-x transition-colors select-none ${
                    isActive
                      ? "bg-surface-2 border-line text-content font-medium"
                      : "border-transparent text-muted hover:bg-surface-2/60 hover:text-content"
                  }`}
                >
                  {getTabIcon(tab.type, isActive)}
                  <span className="truncate max-w-[120px] text-[11px]">{tab.title}</span>

                  {tab.isPinned && <Pin className="w-2.5 h-2.5 text-signal rotate-45" />}

                  {tabs.length > 1 && (
                    <motion.button
                      data-testid={`tab-close-${tab.id}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        onCloseTab(tab.id);
                      }}
                      whileTap={{ scale: 0.9 }}
                      className="p-0.5 rounded-full hover:bg-surface-2 opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <X className="w-3 h-3 text-muted hover:text-content" />
                    </motion.button>
                  )}

                  {isActive && (
                    <motion.span
                      layoutId="titlebar-tab-indicator"
                      transition={reduce ? { duration: 0 } : CHROME_SPRING}
                      className="absolute bottom-0 left-0 right-0 h-0.5 rounded-full bg-signal"
                    />
                  )}
                </Reorder.Item>
              );
            })}
          </Reorder.Group>

          {/* "+" New Tab Button -> Dashboard */}
          <button
            data-testid="tab-new"
            onClick={() => onNewTab("dashboard")}
            className="ml-1 shrink-0 rounded-md p-1.5 text-muted hover:bg-surface-2 hover:text-content transition-colors"
            title={t("Add New Workspace Tab")}
          >
            <Plus className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Right: search trigger · status · alerts · utilities · profile */}
      <div className="flex items-center gap-1 shrink-0">
        {/* Search trigger dressed as an input */}
        <motion.button
          type="button"
          onClick={onOpenCommandPalette}
          whileHover={reduce ? undefined : { y: -1 }}
          whileTap={reduce ? undefined : { scale: 0.99 }}
          transition={CHROME_SPRING}
          className="flex h-7 items-center gap-2 rounded-md border border-line bg-surface px-2.5 text-muted hover:text-content hover:border-signal transition-colors text-xs"
        >
          <Search className="w-3.5 h-3.5" />
          <span>{t("Quick search...")}</span>
          <Kbd className="ml-1">⌘K</Kbd>
        </motion.button>

        <span aria-hidden="true" className="mx-1 h-4 w-px bg-line" />

        {/* Cloud auto-save status */}
        <div
          className="flex items-center gap-1 text-[11px] text-muted px-1 cursor-pointer"
          title={t("Cloud Sync: Active")}
        >
          <Cloud className="w-3.5 h-3.5 text-up" />
          <span className="hidden md:inline">{t("Autosaved")}</span>
        </div>

        <span aria-hidden="true" className="mx-1 h-4 w-px bg-line" />

        {/* Notification Bell */}
        <div className="relative">
          <button
            onClick={() => setIsNotificationsOpen((open) => !open)}
            className="p-1.5 rounded-md text-muted hover:bg-surface-2 hover:text-content transition-colors relative"
            title={t("Notifications")}
          >
            <Bell className="w-3.5 h-3.5" />
            {triggeredAlerts.length > 0 && (
              <span
                data-testid="notifications-badge"
                className="absolute top-1 right-1 w-1.5 h-1.5 rounded-full bg-signal"
              />
            )}
          </button>

          <AnimatePresence>
            {isNotificationsOpen && (
              <motion.div
                key="notifications"
                data-testid="notifications-dropdown"
                initial={reduce ? { opacity: 0 } : { opacity: 0, y: -6, scale: 0.97 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={reduce ? { opacity: 0 } : { opacity: 0, y: -6, scale: 0.97 }}
                transition={reduce ? { duration: 0 } : CHROME_SPRING}
                className="absolute top-full right-0 mt-1 w-72 origin-top-right rounded-lg border border-line bg-surface text-content shadow-float p-3 z-50 text-xs"
              >
                <div className="font-bold text-xs mb-2">
                  <span>{t("Notifications")}</span>
                </div>
                {triggeredAlerts.length === 0 ? (
                  <div
                    data-testid="notifications-empty"
                    className="py-4 text-center text-[11px] text-muted"
                  >
                    {t("No notifications")}
                  </div>
                ) : (
                  <div className="flex flex-col gap-2 max-h-64 overflow-y-auto">
                    {triggeredAlerts.map((alert) => (
                      <div
                        key={alert.id}
                        data-testid={`notification-${alert.id}`}
                        className="p-2 rounded bg-signal/10 border border-signal/30 text-[11px]"
                      >
                        <div className="font-bold text-signal">{t("Price Alert Triggered")}</div>
                        <div className="text-muted">
                          {alert.symbol} {alert.condition} ${alert.targetPrice}
                        </div>
                        {alert.triggerTime && (
                          <div className="text-2xs text-faint mt-1">
                            {formatRelativeTime(alert.triggerTime)}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <button
          onClick={onOpenShortcutsModal}
          className="p-1.5 rounded-md text-muted hover:bg-surface-2 hover:text-content transition-colors"
          title={t("Keyboard Shortcuts (?)")}
        >
          <Keyboard className="w-3.5 h-3.5" />
        </button>

        <button
          onClick={onOpenDesktopSettings}
          className="p-1.5 rounded-md text-muted hover:bg-surface-2 hover:text-content transition-colors"
          title={t("Desktop App Settings")}
        >
          <Settings className="w-3.5 h-3.5" />
        </button>

        <span aria-hidden="true" className="mx-1 h-4 w-px bg-line" />

        {/* Profile Avatar */}
        <div
          className="flex items-center gap-1.5 pl-1 pr-2 py-0.5 rounded-md cursor-pointer hover:bg-surface-2"
          title="Trader Profile (Pro Plan Active)"
        >
          <div className="w-5 h-5 rounded-full bg-signal text-signal-ink flex items-center justify-center font-bold text-2xs">
            TA
          </div>
          <span className="font-semibold text-[11px] hidden sm:inline">Pro+</span>
        </div>
      </div>
    </div>
  );
};
