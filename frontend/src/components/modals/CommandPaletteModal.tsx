import {
  ChevronRight,
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
  X,
} from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import type React from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { formatPercent, formatPrice } from "../../lib/format";
import { SPRING_SNAPPY, modalShell, scrim } from "../../lib/motion";
import { MAJOR_SYMBOLS } from "../../lib/watchlist";
import type { DesktopViewMode, SymbolInfo, ThemeMode } from "../../types/trading";
import { Kbd } from "../ui/kbd";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  symbols: SymbolInfo[];
  onSelectSymbol: (symbol: SymbolInfo) => void;
  onSelectView: (view: DesktopViewMode) => void;
  onToggleTheme: () => void;
  onOpenSettings: () => void;
  onOpenShortcuts: () => void;
  theme: ThemeMode;
}

/** How many instruments the palette will ever render at once. */
const SYMBOL_LIMIT = 6;

type PaletteItem =
  | { kind: "action"; id: string; label: string; icon: React.ReactNode; run: () => void }
  | { kind: "symbol"; id: string; label: string; symbol: SymbolInfo };

const GROUP_ACTION = "Workspace & Navigation";
const GROUP_SYMBOL = "Trading Instruments";

/**
 * Command palette (⌘K).
 *
 * Keyboard-first: the list is a single flattened sequence driven by ↑/↓ and
 * ↵, with the selection rendered as one shared `layoutId` pill that glides
 * between rows. Results are grouped but navigated as one list, and instruments
 * are ranked so the majors surface before the thousands of obscure listings.
 */
export const CommandPaletteModal: React.FC<Props> = ({
  isOpen,
  onClose,
  symbols,
  onSelectSymbol,
  onSelectView,
  onToggleTheme,
  onOpenSettings,
  onOpenShortcuts,
  theme,
}) => {
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const reduce = useReducedMotion();

  const actions = useMemo<PaletteItem[]>(
    () => [
      {
        kind: "action",
        id: "view-chart",
        label: "Open SuperCharts",
        icon: <TrendingUp className="h-4 w-4" />,
        run: () => onSelectView("chart"),
      },
      {
        kind: "action",
        id: "view-markets",
        label: "Open Markets Overview",
        icon: <Monitor className="h-4 w-4" />,
        run: () => onSelectView("markets"),
      },
      {
        kind: "action",
        id: "view-screener",
        label: "Open Screener 2.0",
        icon: <Filter className="h-4 w-4" />,
        run: () => onSelectView("screener"),
      },
      {
        kind: "action",
        id: "view-heatmaps",
        label: "Open Market Heatmaps",
        icon: <Flame className="h-4 w-4" />,
        run: () => onSelectView("heatmaps"),
      },
      {
        kind: "action",
        id: "view-community",
        label: "Open Community Ideas",
        icon: <Users className="h-4 w-4" />,
        run: () => onSelectView("community"),
      },
      {
        kind: "action",
        id: "view-news",
        label: "Open News & Calendar",
        icon: <Newspaper className="h-4 w-4" />,
        run: () => onSelectView("news"),
      },
      {
        kind: "action",
        id: "view-research",
        label: "Open Research Reports",
        icon: <FileText className="h-4 w-4" />,
        run: () => onSelectView("research"),
      },
      {
        kind: "action",
        id: "act-theme",
        label: `Toggle Theme (${theme === "dark" ? "Light Mode" : "Dark Mode"})`,
        icon: theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />,
        run: onToggleTheme,
      },
      {
        kind: "action",
        id: "act-shortcuts",
        label: "View Keyboard Shortcuts",
        icon: <Keyboard className="h-4 w-4" />,
        run: onOpenShortcuts,
      },
      {
        kind: "action",
        id: "act-settings",
        label: "Open Desktop App Settings",
        icon: <Settings className="h-4 w-4" />,
        run: onOpenSettings,
      },
    ],
    [theme, onSelectView, onToggleTheme, onOpenShortcuts, onOpenSettings],
  );

  const filteredActions = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? actions.filter((a) => a.label.toLowerCase().includes(q)) : actions;
  }, [actions, query]);

  const symbolItems = useMemo<PaletteItem[]>(() => {
    const q = query.trim().toLowerCase();
    const majors = new Set(MAJOR_SYMBOLS);
    return symbols
      .filter((s) => !q || s.ticker.toLowerCase().includes(q) || s.name.toLowerCase().includes(q))
      .sort((a, b) => {
        const am = majors.has(a.id) ? 0 : 1;
        const bm = majors.has(b.id) ? 0 : 1;
        if (am !== bm) return am - bm;
        return a.id.localeCompare(b.id);
      })
      .slice(0, SYMBOL_LIMIT)
      .map((s) => ({ kind: "symbol", id: `sym-${s.id}`, label: s.ticker, symbol: s }));
  }, [symbols, query]);

  const flat = useMemo<PaletteItem[]>(
    () => [...filteredActions, ...symbolItems],
    [filteredActions, symbolItems],
  );

  // Reset the query and the selection whenever the palette opens.
  useEffect(() => {
    if (!isOpen) return;
    setQuery("");
    setActive(0);
    const id = window.setTimeout(() => inputRef.current?.focus(), 30);
    return () => window.clearTimeout(id);
  }, [isOpen]);

  // Keep the selection inside the list as the query narrows it.
  useEffect(() => {
    setActive((i) => Math.min(i, Math.max(0, flat.length - 1)));
  }, [flat.length]);

  const activate = useCallback(
    (item: PaletteItem | undefined) => {
      if (!item) return;
      if (item.kind === "action") {
        item.run();
      } else {
        onSelectSymbol(item.symbol);
        onSelectView("chart");
      }
      onClose();
    },
    [onClose, onSelectSymbol, onSelectView],
  );

  // Arrow keys / Enter / Escape. Typing stays with the input.
  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        setActive((i) => Math.min(flat.length - 1, i + 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setActive((i) => Math.max(0, i - 1));
      } else if (e.key === "Enter") {
        e.preventDefault();
        activate(flat[active]);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isOpen, flat, active, activate, onClose]);

  // Keep the selected row visible while arrowing through a long list.
  useEffect(() => {
    if (!isOpen) return;
    listRef.current?.querySelector<HTMLElement>(`[data-index="${active}"]`)?.scrollIntoView({
      block: "nearest",
    });
  }, [active, isOpen]);

  const renderRow = (item: PaletteItem, index: number) => {
    const isActive = index === active;
    return (
      <button
        key={item.id}
        type="button"
        data-index={index}
        onMouseMove={() => setActive(index)}
        onClick={() => activate(item)}
        className="relative flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-left"
      >
        {isActive && (
          <motion.span
            layoutId="palette-active"
            transition={reduce ? { duration: 0 } : SPRING_SNAPPY}
            className="absolute inset-0 rounded-lg bg-surface-2"
          />
        )}
        <span className="relative flex min-w-0 items-center gap-2.5">
          {item.kind === "action" ? (
            <>
              <span className={isActive ? "text-signal" : "text-faint"}>{item.icon}</span>
              <span className="truncate text-xs font-semibold text-content">{item.label}</span>
            </>
          ) : (
            <>
              <span
                className={`ta-num text-xs font-bold ${isActive ? "text-signal" : "text-content"}`}
              >
                {item.symbol.ticker}
              </span>
              <span className="truncate text-2xs text-muted">{item.symbol.name}</span>
            </>
          )}
        </span>
        <span className="relative flex shrink-0 items-center gap-2">
          {item.kind === "symbol" ? (
            <>
              <span className="ta-num text-xs font-semibold text-content">
                {formatPrice(item.symbol.price, item.symbol.digits)}
              </span>
              <span
                className={`ta-num w-14 text-right text-2xs font-semibold ${
                  item.symbol.change24hPercent >= 0 ? "text-up" : "text-down"
                }`}
              >
                {formatPercent(item.symbol.change24hPercent)}
              </span>
            </>
          ) : (
            <ChevronRight className={`h-3.5 w-3.5 ${isActive ? "text-signal" : "text-faint"}`} />
          )}
        </span>
      </button>
    );
  };

  const shell = reduce
    ? {
        hidden: { opacity: 0 },
        show: { opacity: 1, transition: { duration: 0.14 } },
        exit: { opacity: 0, transition: { duration: 0.1 } },
      }
    : modalShell;

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          key="command-palette"
          variants={scrim}
          initial="hidden"
          animate="show"
          exit="exit"
          onClick={onClose}
          className="fixed inset-0 z-50 flex items-start justify-center bg-ink/70 p-4 pt-20 select-none backdrop-blur-sm"
        >
          <motion.div
            id="command-palette-modal"
            variants={shell}
            role="dialog"
            aria-modal="true"
            aria-label="Command palette"
            onClick={(e) => e.stopPropagation()}
            className="flex w-full max-w-xl flex-col overflow-hidden rounded-xl border border-line bg-surface text-content shadow-float"
          >
            {/* Query row */}
            <div className="flex items-center gap-3 border-b border-line px-3.5 py-3">
              <Search className="h-4 w-4 shrink-0 text-faint" />
              <input
                ref={inputRef}
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Type a command, symbol (BTC, NVDA, AAPL), or open a workspace..."
                className="flex-1 bg-transparent text-sm text-content outline-none placeholder:text-faint"
              />
              <Kbd>ESC</Kbd>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close"
                className="rounded-md p-1 text-muted transition-colors hover:bg-surface-2 hover:text-content"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Results */}
            <div ref={listRef} className="max-h-[380px] overflow-y-auto p-2">
              {flat.length === 0 ? (
                <p className="px-3 py-8 text-center text-xs text-muted">没有匹配的结果</p>
              ) : (
                <>
                  {filteredActions.length > 0 && (
                    <div className="px-2 pb-1 pt-2">
                      <span className="ta-eyebrow text-faint">{GROUP_ACTION}</span>
                    </div>
                  )}
                  {filteredActions.map((item, i) => renderRow(item, i))}

                  {symbolItems.length > 0 && (
                    <div className="px-2 pb-1 pt-3">
                      <span className="ta-eyebrow text-faint">{GROUP_SYMBOL}</span>
                    </div>
                  )}
                  {symbolItems.map((item, i) => renderRow(item, filteredActions.length + i))}
                </>
              )}
            </div>

            {/* Key hints */}
            <div className="flex items-center gap-4 border-t border-line bg-surface-2/50 px-3.5 py-2">
              <span className="flex items-center gap-1.5 text-2xs text-muted">
                <Kbd>↑</Kbd>
                <Kbd>↓</Kbd>
                选择
              </span>
              <span className="flex items-center gap-1.5 text-2xs text-muted">
                <Kbd>↵</Kbd>
                打开
              </span>
              <span className="flex items-center gap-1.5 text-2xs text-muted">
                <Kbd>esc</Kbd>
                关闭
              </span>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
