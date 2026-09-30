import {
  ArrowRight,
  Bookmark,
  FileText,
  Filter,
  Flame,
  LineChart,
  Monitor,
  Newspaper,
  TrendingDown,
  TrendingUp,
  Users,
} from "lucide-react";
import { motion } from "motion/react";
import type React from "react";
import { useMemo } from "react";
import { useCandles } from "../../hooks/useCandles";
import { amplitudePercent, compactNumber, formatPercent, formatPrice } from "../../lib/format";
import { useGlobalNewsStream } from "../../lib/globalNews";
import { t } from "../../lib/i18n";
import { MAJOR_SYMBOLS, pickMajors } from "../../lib/watchlist";
import type { DesktopViewMode, SymbolInfo } from "../../types/trading";
import { FlashNumber } from "../ui/flash-number";
import { Reveal } from "../ui/reveal";
import { Sparkline } from "../ui/sparkline";

interface Props {
  onOpen: (type: DesktopViewMode) => void;
  symbols: SymbolInfo[];
  onOpenSymbol: (symbol: SymbolInfo) => void;
}

const WORKBENCHES: { type: DesktopViewMode; label: string; icon: React.ReactNode }[] = [
  { type: "chart", label: "SuperCharts", icon: <LineChart className="h-4 w-4" /> },
  { type: "markets", label: "Markets", icon: <Monitor className="h-4 w-4" /> },
  { type: "screener", label: "Screener", icon: <Filter className="h-4 w-4" /> },
  { type: "heatmaps", label: "Heatmaps", icon: <Flame className="h-4 w-4" /> },
  { type: "community", label: "Community", icon: <Users className="h-4 w-4" /> },
  { type: "news", label: "News", icon: <Newspaper className="h-4 w-4" /> },
  { type: "research", label: "Research", icon: <FileText className="h-4 w-4" /> },
];

const WIRE_SIZE = 5;
const WATCH_SIZE = 9;
const MOVER_SIZE = 5;

/** Shared surface recipe for the desk's panels. */
const PANEL = "flex flex-col rounded-xl border border-line bg-surface shadow-e1";

const SectionLabel: React.FC<{ children: React.ReactNode; right?: React.ReactNode }> = ({
  children,
  right,
}) => (
  <div className="flex items-center justify-between gap-3 border-b border-line/70 px-3.5 py-2.5">
    <span className="ta-eyebrow text-faint">{children}</span>
    {right}
  </div>
);

/**
 * Market Desk - the workspace launcher, rebuilt as a live console.
 *
 * The previous version was six equal cards that told the trader nothing. This
 * one opens with the state of the market (focus quote + live wire), then the
 * watchlist and the movers, and only then the workbench launcher as a compact
 * keyboard row. Density is the point: every pixel carries a number or a way in.
 * Rows are matched in weight so the grid reads as composed, not ragged.
 */
export const DashboardView: React.FC<Props> = ({ onOpen, symbols, onOpenSymbol }) => {
  const { items, state } = useGlobalNewsStream();

  // Focus instrument: BTC when listed, otherwise the first symbol.
  const focus = useMemo(
    () => symbols.find((s) => s.id === "BTCUSDT") ?? symbols[0] ?? null,
    [symbols],
  );

  // Real hourly closes for the hero sparkline (one request, not one per row).
  const heroSeries = useMemo(
    () => (focus ? { category: "USDT-FUTURES", symbol: focus.id, timeframe: "1h" } : null),
    [focus],
  );
  const { candles } = useCandles(heroSeries, 72);
  const heroCloses = useMemo(() => candles.map((c) => c.close).filter((n) => n > 0), [candles]);

  // Movers rank within the majors: ranking the whole listing surfaces obscure
  // instruments whose 24h swing is noise rather than signal.
  const movers = useMemo(
    () =>
      [...pickMajors(symbols, undefined, MAJOR_SYMBOLS.length)]
        .sort((a, b) => Math.abs(b.change24hPercent) - Math.abs(a.change24hPercent))
        .slice(0, MOVER_SIZE),
    [symbols],
  );

  const watch = useMemo(() => pickMajors(symbols, undefined, WATCH_SIZE), [symbols]);
  const wire = useMemo(() => items.slice(0, WIRE_SIZE), [items]);

  const focusUp = (focus?.change24hPercent ?? 0) >= 0;
  const focusAmplitude = focus ? amplitudePercent(focus.high24h, focus.low24h) : null;
  const streaming = state === "open";

  // Where the last price sits inside the 24h range, as a percentage.
  const rangePosition = useMemo(() => {
    if (!focus || focus.high24h <= focus.low24h) return null;
    const pct = ((focus.price - focus.low24h) / (focus.high24h - focus.low24h)) * 100;
    return Math.min(100, Math.max(0, pct));
  }, [focus]);

  return (
    <div
      id="dashboard-view"
      className="flex-1 h-full overflow-y-auto overflow-x-hidden bg-ink text-content select-none"
    >
      {/* Command header */}
      <header className="ta-glass sticky top-0 z-20 flex items-center justify-between gap-4 border-b border-line px-6 py-3">
        <div className="flex items-baseline gap-3">
          <h1 className="ta-display text-base tracking-tight text-content">MARKET DESK</h1>
          <span className="ta-eyebrow hidden text-faint sm:inline">{t("Workspace Dashboard")}</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1.5">
            <span className="relative flex h-1.5 w-1.5">
              {streaming && (
                <span className="absolute inline-flex h-full w-full animate-[ta-ping_2s_ease-out_infinite] rounded-full bg-up" />
              )}
              <span
                className={`relative inline-flex h-1.5 w-1.5 rounded-full ${streaming ? "bg-up" : "bg-faint"}`}
              />
            </span>
            <span className={`ta-eyebrow ${streaming ? "text-up" : "text-faint"}`}>
              {streaming ? t("Live") : t("Offline")}
            </span>
          </span>
          <button
            type="button"
            onClick={() => onOpen("chart")}
            className="flex items-center gap-1.5 rounded-md bg-signal px-2.5 py-1.5 text-2xs font-semibold text-signal-ink transition-colors hover:bg-signal/90"
          >
            {t("Open")}
            <ArrowRight className="h-3 w-3" />
          </button>
        </div>
      </header>

      <div className="grid grid-cols-12 gap-4 p-6">
        {/* Row 1 - focus quote */}
        <Reveal delay={0} className="col-span-12 xl:col-span-8">
          <section className={`${PANEL} h-full`}>
            <div className="flex items-start justify-between px-4 pt-3.5">
              <div className="flex items-center gap-2">
                <span className="ta-display text-sm text-content">
                  {focus ? `${focus.baseAsset}/${focus.quoteAsset}` : "\u2014"}
                </span>
                <span className="rounded border border-line/70 bg-surface-2 px-1.5 py-0.5 text-2xs font-semibold text-faint">
                  {focus?.exchange ?? "\u2014"}
                </span>
              </div>
              <span className="ta-eyebrow text-faint">24H</span>
            </div>

            <div className="flex flex-wrap items-end justify-between gap-4 px-4 pt-2">
              <div className="flex items-baseline gap-3">
                <span className="ta-display ta-num min-w-[8.5ch] text-3xl leading-none text-content">
                  {focus ? formatPrice(focus.price, focus.digits) : "\u2014"}
                </span>
                {focus && (
                  <span
                    className={`ta-num flex min-w-[7.5ch] items-center gap-0.5 text-sm font-semibold ${focusUp ? "text-up" : "text-down"}`}
                  >
                    {focusUp ? (
                      <TrendingUp className="h-3.5 w-3.5" />
                    ) : (
                      <TrendingDown className="h-3.5 w-3.5" />
                    )}
                    {formatPercent(focus.change24hPercent)}
                  </span>
                )}
              </div>
              {heroCloses.length > 1 && (
                <Sparkline
                  values={heroCloses}
                  up={focusUp}
                  width={300}
                  height={54}
                  strokeWidth={1.75}
                  className="max-w-full"
                />
              )}
            </div>

            {/* Day range: position of the last price inside the 24h band */}
            {focus && rangePosition !== null && (
              <div className="px-4 pt-4">
                <div className="mb-1.5 flex items-center justify-between">
                  <span className="ta-eyebrow text-faint">24h 区间</span>
                  <span className="ta-num text-2xs text-muted">
                    {formatPrice(focus.low24h, focus.digits)} —{" "}
                    {formatPrice(focus.high24h, focus.digits)}
                  </span>
                </div>
                <div className="relative h-1 rounded-full bg-surface-2">
                  <div className="absolute inset-0 rounded-full bg-gradient-to-r from-down/35 via-signal/35 to-up/35" />
                  <span
                    className="absolute top-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-ink bg-content shadow-e1"
                    style={{ left: `${rangePosition}%` }}
                  />
                </div>
              </div>
            )}

            <dl className="mt-4 grid grid-cols-2 divide-x divide-line/60 border-t border-line/70 text-xs sm:grid-cols-4">
              {[
                { k: "24h 高", v: focus ? formatPrice(focus.high24h, focus.digits) : "\u2014" },
                { k: "24h 低", v: focus ? formatPrice(focus.low24h, focus.digits) : "\u2014" },
                { k: "24h 量", v: focus ? compactNumber(focus.volume24h) : "\u2014" },
                {
                  k: "24h 振幅",
                  v: focusAmplitude === null ? "\u2014" : `${focusAmplitude.toFixed(2)}%`,
                },
              ].map((row) => (
                <div key={row.k} className="flex flex-col gap-1 px-4 py-2.5">
                  <dt className="text-2xs text-faint">{row.k}</dt>
                  <dd className="ta-num font-semibold text-content">{row.v}</dd>
                </div>
              ))}
            </dl>
          </section>
        </Reveal>

        {/* Row 1 - live wire */}
        <Reveal delay={1} className="col-span-12 xl:col-span-4">
          <section className={`${PANEL} h-full overflow-hidden`}>
            <SectionLabel
              right={
                <button
                  type="button"
                  onClick={() => onOpen("news")}
                  className="text-2xs font-semibold text-signal hover:underline"
                >
                  {t("Global News Feed")}
                </button>
              }
            >
              {t("Market News Wire")}
            </SectionLabel>
            <div className="min-h-0 flex-1 overflow-y-auto">
              {wire.length === 0 ? (
                <p className="px-3.5 py-6 text-center text-xs text-muted">
                  {t("News sources unavailable")}
                </p>
              ) : (
                wire.map((item, i) => (
                  <motion.a
                    key={item.id}
                    href={item.url ?? undefined}
                    target={item.url ? "_blank" : undefined}
                    rel="noreferrer"
                    initial={{ opacity: 0, x: -6 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{
                      delay: 0.05 + i * 0.02,
                      type: "spring",
                      stiffness: 340,
                      damping: 32,
                    }}
                    className="group flex gap-2.5 border-b border-line/50 px-3.5 py-2.5 last:border-0 hover:bg-surface-2/60"
                  >
                    <span className="ta-eyebrow mt-0.5 shrink-0 text-signal">
                      {t(item.category)}
                    </span>
                    <span className="line-clamp-2 text-xs leading-snug text-content/90 group-hover:text-content">
                      {item.title}
                    </span>
                  </motion.a>
                ))
              )}
            </div>
          </section>
        </Reveal>

        {/* Row 2 - watchlist tiles */}
        <Reveal delay={2} className="col-span-12 xl:col-span-8">
          <section className={`${PANEL} h-full`}>
            <SectionLabel
              right={
                <button
                  type="button"
                  onClick={() => onOpen("chart")}
                  className="text-2xs font-semibold text-signal hover:underline"
                >
                  {t("Watchlist")}
                </button>
              }
            >
              {t("Watchlist & Details")}
            </SectionLabel>
            <div className="grid flex-1 grid-cols-1 gap-px overflow-hidden rounded-b-xl bg-line/60 sm:grid-cols-3">
              {watch.length === 0
                ? Array.from({ length: 3 }).map((_, i) => (
                    <div key={i} className="h-[62px] animate-pulse bg-surface-2" />
                  ))
                : watch.map((s) => {
                    const up = s.change24hPercent >= 0;
                    return (
                      <button
                        key={s.id}
                        type="button"
                        onClick={() => onOpenSymbol(s)}
                        className="flex flex-col gap-1.5 bg-surface px-3.5 py-3 text-left transition-colors hover:bg-surface-2"
                      >
                        <span className="flex items-center justify-between">
                          <span className="flex items-center gap-1.5">
                            <Bookmark
                              className={`h-3 w-3 shrink-0 ${up ? "text-up" : "text-down"}`}
                            />
                            <span className="ta-display text-xs text-content">{s.baseAsset}</span>
                          </span>
                          <span
                            className={`ta-num min-w-[7.5ch] text-2xs font-semibold ${up ? "text-up" : "text-down"}`}
                          >
                            {formatPercent(s.change24hPercent)}
                          </span>
                        </span>
                        <FlashNumber
                          value={s.price}
                          format={(v) => formatPrice(v, s.digits)}
                          className="min-w-[8.5ch] text-sm font-semibold text-content"
                        />
                      </button>
                    );
                  })}
            </div>
          </section>
        </Reveal>

        {/* Row 2 - movers */}
        <Reveal delay={3} className="col-span-12 xl:col-span-4">
          <section className={`${PANEL} h-full overflow-hidden`}>
            <SectionLabel
              right={
                <button
                  type="button"
                  onClick={() => onOpen("screener")}
                  className="text-2xs font-semibold text-signal hover:underline"
                >
                  {t("Screener")}
                </button>
              }
            >
              {t("Market Hotlists")}
            </SectionLabel>
            <div className="min-h-0 flex-1 overflow-y-auto">
              {movers.length === 0 ? (
                <p className="px-3.5 py-6 text-center text-xs text-muted">
                  {t("No symbols available")}
                </p>
              ) : (
                movers.map((s) => {
                  const up = s.change24hPercent >= 0;
                  return (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => onOpenSymbol(s)}
                      className="flex w-full items-center justify-between gap-3 border-b border-line/50 px-3.5 py-2.5 last:border-0 hover:bg-surface-2/60"
                    >
                      <span className="min-w-0">
                        <span className="ta-display block text-xs text-content">
                          {s.baseAsset}
                          <span className="font-normal text-faint">/{s.quoteAsset}</span>
                        </span>
                        <span className="ta-num block text-2xs text-faint">
                          {t("Volume")} {compactNumber(s.volume24h)}
                        </span>
                      </span>
                      <span className="flex shrink-0 flex-col items-end">
                        <FlashNumber
                          value={s.price}
                          format={(v) => formatPrice(v, s.digits)}
                          className="min-w-[8.5ch] text-xs font-semibold text-content"
                        />
                        <span
                          className={`ta-num min-w-[7.5ch] text-2xs font-semibold ${up ? "text-up" : "text-down"}`}
                        >
                          {formatPercent(s.change24hPercent)}
                        </span>
                      </span>
                    </button>
                  );
                })
              )}
            </div>
          </section>
        </Reveal>

        {/* Row 3 - workbench launcher */}
        <Reveal delay={4} className="col-span-12">
          <section className={PANEL}>
            <SectionLabel>{t("Select an interface to open")}</SectionLabel>
            <div className="flex flex-wrap gap-2 p-3">
              {WORKBENCHES.map((w, i) => (
                <motion.button
                  key={w.type}
                  type="button"
                  onClick={() => onOpen(w.type)}
                  whileHover={{ y: -1 }}
                  transition={{ type: "spring", stiffness: 420, damping: 28, delay: i * 0.02 }}
                  className="group flex items-center gap-2 rounded-lg border border-line bg-surface-2/60 px-3 py-2 text-xs font-semibold text-muted transition-colors hover:border-signal/50 hover:bg-surface-2 hover:text-content"
                >
                  <span className="text-faint transition-colors group-hover:text-signal">
                    {w.icon}
                  </span>
                  {t(w.label)}
                </motion.button>
              ))}
            </div>
          </section>
        </Reveal>
      </div>
    </div>
  );
};
