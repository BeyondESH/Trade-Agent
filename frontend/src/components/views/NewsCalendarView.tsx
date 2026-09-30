import { AlertCircle, Calendar, Clock, ExternalLink, Globe, Newspaper, Radio } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import type React from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { INITIAL_CALENDAR } from "../../data/marketData";
import { t } from "../../lib/i18n";
import {
  fetchNewsflashPage,
  formatRelativeTime,
  NEWSFLASH_TYPES,
  type NewsflashType,
} from "../../lib/newsfeed";
import type { NewsItem, ThemeMode } from "../../types/trading";
import { Reveal } from "../ui/reveal";
import { GlobalNewsFeed } from "./GlobalNewsFeed";

interface Props {
  onOpenChartWithTicker: (ticker: string) => void;
  theme: ThemeMode;
}

const PAGE_SIZE = 20;
const SCROLL_THRESHOLD = 120;

/** Shared surface recipe for this desk's panels. */
const PANEL = "flex flex-col rounded-xl border border-line bg-surface shadow-e1";

/** Section header: a real label on the left, an action/control on the right. */
const SectionLabel: React.FC<{ children: React.ReactNode; right?: React.ReactNode }> = ({
  children,
  right,
}) => (
  <div className="flex items-center justify-between gap-3 border-b border-line/70 px-3.5 py-2.5">
    <span className="ta-eyebrow text-faint">{children}</span>
    {right}
  </div>
);

interface SegItem<T extends string> {
  value: T;
  label: string;
  icon?: React.ReactNode;
}

/**
 * Segmented control with a single sliding indicator (`layoutId`). The indicator
 * is one shared element that springs between positions, so the active state
 * reads as a physical toggle rather than a colour swap.
 */
function Segmented<T extends string>({
  items,
  value,
  onChange,
  layoutId,
  size = "sm",
}: {
  items: SegItem<T>[];
  value: T;
  onChange: (value: T) => void;
  layoutId: string;
  size?: "sm" | "md";
}) {
  const reduce = useReducedMotion();
  return (
    <div className="flex items-center gap-0.5 rounded-lg border border-line bg-ink/60 p-0.5">
      {items.map((item) => {
        const active = item.value === value;
        return (
          <button
            key={item.value}
            type="button"
            onClick={() => onChange(item.value)}
            className={`relative flex items-center rounded-md font-semibold transition-colors ${
              size === "md" ? "px-3 py-1.5 text-xs" : "px-2.5 py-1 text-2xs"
            } ${active ? "text-signal-ink" : "text-muted hover:text-content"}`}
          >
            {active && (
              <motion.span
                layoutId={layoutId}
                className="absolute inset-0 rounded-md bg-signal"
                transition={
                  reduce ? { duration: 0 } : { type: "spring", stiffness: 380, damping: 30 }
                }
              />
            )}
            <span className="relative z-10 flex items-center gap-1.5 whitespace-nowrap">
              {item.icon}
              {item.label}
            </span>
          </button>
        );
      })}
    </div>
  );
}

const ImpactPill: React.FC<{ impact: "high" | "medium" | "low" }> = ({ impact }) => (
  <span
    className={`ta-eyebrow inline-flex rounded px-1.5 py-0.5 ${
      impact === "high"
        ? "bg-down/15 text-down"
        : impact === "medium"
          ? "bg-signal/15 text-signal"
          : "bg-surface-2 text-muted"
    }`}
  >
    {impact}
  </span>
);

export const NewsCalendarView: React.FC<Props> = ({ onOpenChartWithTicker, theme }) => {
  const [activeTab, setActiveTab] = useState<"news" | "calendar" | "global">("news");
  const [newsType, setNewsType] = useState<NewsflashType>("all");
  const [news, setNews] = useState<NewsItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [calendarImpact, setCalendarImpact] = useState<"all" | "high" | "medium">("all");

  // Request sequence guard: a category switch invalidates in-flight responses.
  const loadSeq = useRef(0);
  const pageRef = useRef(1);
  const typeRef = useRef<NewsflashType>(newsType);
  typeRef.current = newsType;

  const load = useCallback(async (type: NewsflashType) => {
    const seq = ++loadSeq.current;
    typeRef.current = type;
    pageRef.current = 1;
    setLoading(true);
    setError(null);
    setNews([]);
    setHasMore(true);
    try {
      const page = await fetchNewsflashPage(type, 1, PAGE_SIZE);
      if (seq !== loadSeq.current) return;
      setNews(page.items);
      setHasMore(page.hasMore);
    } catch (e) {
      if (seq !== loadSeq.current) return;
      setError(String(e));
    } finally {
      if (seq === loadSeq.current) setLoading(false);
    }
  }, []);

  const loadMore = useCallback(async () => {
    if (loading || loadingMore || !hasMore) return;
    const next = pageRef.current + 1;
    setLoadingMore(true);
    try {
      const page = await fetchNewsflashPage(typeRef.current, next, PAGE_SIZE);
      setNews((prev) => {
        const seen = new Set(prev.map((n) => n.id));
        return [...prev, ...page.items.filter((n) => !seen.has(n.id))];
      });
      pageRef.current = next;
      setHasMore(page.hasMore);
    } catch {
      // Keep the current list; hasMore stays true so scrolling retries.
    } finally {
      setLoadingMore(false);
    }
  }, [loading, loadingMore, hasMore]);

  useEffect(() => {
    void load(newsType);
  }, [newsType, load]);

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const el = e.currentTarget;
    if (el.scrollTop + el.clientHeight >= el.scrollHeight - SCROLL_THRESHOLD) {
      void loadMore();
    }
  };

  const filteredCalendar = INITIAL_CALENDAR.filter(
    (c) => calendarImpact === "all" || c.impact === calendarImpact,
  );

  const liveBadge = (
    <span className="flex items-center gap-1.5">
      <span className="relative flex h-1.5 w-1.5">
        <span className="absolute inline-flex h-full w-full animate-[ta-ping_2s_ease-out_infinite] rounded-full bg-up" />
        <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-up" />
      </span>
      <span className="ta-eyebrow text-up">{t("Live")}</span>
    </span>
  );

  return (
    <div
      id="news-calendar-view"
      className="flex-1 h-full overflow-y-auto overflow-x-hidden bg-ink text-content select-none"
      onScroll={handleScroll}
    >
      {/* Sticky command header: title + live state + segmented mode switch */}
      <header className="ta-glass sticky top-0 z-20 flex flex-wrap items-center justify-between gap-3 border-b border-line px-6 py-3">
        <div className="flex min-w-0 items-center gap-3">
          <Newspaper className="h-4 w-4 shrink-0 text-signal" />
          <div className="min-w-0">
            <h1 className="ta-display truncate text-base tracking-tight text-content">
              {t("News & Economic Calendar")}
            </h1>
            <p className="mt-0.5 hidden truncate text-xs text-muted lg:block">
              {t("Real-time crypto newsflash, central bank decisions, and earnings releases.")}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {liveBadge}
          <Segmented
            layoutId="news-mode-indicator"
            value={activeTab}
            onChange={setActiveTab}
            items={[
              {
                value: "news",
                label: t("Market News Wire"),
                icon: <Newspaper className="h-3.5 w-3.5" />,
              },
              {
                value: "calendar",
                label: t("Economic Calendar"),
                icon: <Calendar className="h-3.5 w-3.5" />,
              },
              {
                value: "global",
                label: t("Global News Feed"),
                icon: <Radio className="h-3.5 w-3.5" />,
              },
            ]}
          />
        </div>
      </header>

      <div className="flex flex-col gap-5 p-6">
        {activeTab === "news" ? (
          /* News wire - a true timeline: hairline rail, node dots, staggered rise */
          <section className={PANEL}>
            <SectionLabel
              right={
                <span className="ta-num text-2xs text-faint">
                  {loading ? t("Loading...") : `${news.length}`}
                </span>
              }
            >
              {t("News Headlines")}
            </SectionLabel>

            <div className="p-3.5">
              {/* News-type filter as a scrollable segmented control */}
              <div className="ta-fade-x mb-3 overflow-x-auto">
                <Segmented
                  layoutId="news-type-indicator"
                  value={newsType}
                  onChange={setNewsType}
                  items={NEWSFLASH_TYPES.map((type) => ({
                    value: type.key,
                    label: type.label,
                  }))}
                />
              </div>

              {error && (
                <div className="mb-3 flex items-center gap-2 rounded-lg border border-down/30 bg-down/10 px-3 py-2 text-xs text-down">
                  <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                  <span>
                    {t("News feed unavailable:")} {error}
                  </span>
                </div>
              )}

              <div className="flex flex-col">
                {news.map((n, i) => (
                  <Reveal key={n.id} delay={Math.min(i, 8)} className="relative pl-8 pb-3">
                    {/* hairline left rail */}
                    <span
                      aria-hidden="true"
                      className="absolute left-[9px] top-0 bottom-0 w-px bg-line"
                    />
                    {/* node dot */}
                    <span
                      aria-hidden="true"
                      className="absolute left-[5px] top-[13px] h-2 w-2 rounded-full bg-signal ring-2 ring-ink"
                    />
                    <motion.article
                      whileHover={{ y: -1 }}
                      transition={{ type: "spring", stiffness: 380, damping: 30 }}
                      className="group flex flex-col gap-2 rounded-xl border border-line bg-surface p-3.5 shadow-e1 transition-[box-shadow,border-color] hover:border-line-strong hover:shadow-e2"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="ta-eyebrow ta-num text-signal">
                          {formatRelativeTime(n.time)}
                        </span>
                        <span className="ta-eyebrow rounded border border-line/70 bg-surface-2 px-1.5 py-0.5 text-faint">
                          {n.category}
                        </span>
                      </div>

                      <h3 className="text-sm font-bold leading-snug text-content">{n.title}</h3>
                      <p className="line-clamp-4 text-xs leading-relaxed text-muted">{n.summary}</p>

                      <div className="mt-1 flex items-center justify-between border-t border-line/60 pt-2">
                        <span className="flex items-center gap-1.5 text-muted">
                          <Clock className="h-3 w-3" />
                          <span className="ta-num text-2xs">{n.time}</span>
                        </span>
                        <a
                          href={`https://m.theblockbeats.info/flash/${n.id}`}
                          target="_blank"
                          rel="noreferrer"
                          className="flex items-center gap-1 text-2xs font-semibold text-muted transition-colors hover:text-signal"
                        >
                          <Globe className="h-3 w-3" />
                          <span>{t("Full Article")}</span>
                          <ExternalLink className="h-3 w-3" />
                        </a>
                      </div>
                    </motion.article>
                  </Reveal>
                ))}
              </div>

              {loadingMore && (
                <div className="py-2 text-center text-xs text-muted">{t("Loading...")}</div>
              )}
              {!hasMore && news.length > 0 && (
                <div className="py-2 text-center text-2xs text-faint">{t("All Loaded")}</div>
              )}
            </div>
          </section>
        ) : activeTab === "global" ? (
          /* Global News Feed - AKShare multi-source 7x24 flash, SSE rolling */
          <GlobalNewsFeed theme={theme} />
        ) : (
          /* Economic Calendar - real table with a sticky header */
          <section className={PANEL}>
            <SectionLabel
              right={
                <div className="flex items-center gap-2">
                  <span className="ta-eyebrow text-faint">{t("Impact Filter:")}</span>
                  <Segmented
                    layoutId="calendar-impact-indicator"
                    value={calendarImpact}
                    onChange={setCalendarImpact}
                    items={[
                      { value: "all", label: "all" },
                      { value: "high", label: "high" },
                      { value: "medium", label: "medium" },
                    ]}
                  />
                </div>
              }
            >
              {t("Global Economic Releases")}
            </SectionLabel>

            <div className="max-h-[62vh] overflow-auto">
              <table className="w-full border-collapse text-left text-xs">
                <thead className="sticky top-0 z-10 bg-surface-2">
                  <tr>
                    {[
                      t("Time"),
                      t("Country"),
                      t("Impact"),
                      t("Event"),
                      t("Actual"),
                      t("Forecast"),
                      t("Previous"),
                    ].map((col) => (
                      <th
                        key={col}
                        scope="col"
                        className="ta-eyebrow whitespace-nowrap border-b border-line px-3 py-2.5 text-left text-faint"
                      >
                        {col}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filteredCalendar.map((item) => (
                    <tr
                      key={item.id}
                      className="border-b border-line/50 last:border-0 transition-colors hover:bg-surface-2/60"
                    >
                      <td className="ta-num whitespace-nowrap px-3 py-2.5 text-muted">
                        {item.time} ({item.date})
                      </td>
                      <td className="px-3 py-2.5 font-semibold text-content">{item.currency}</td>
                      <td className="px-3 py-2.5">
                        <ImpactPill impact={item.impact} />
                      </td>
                      <td className="px-3 py-2.5 font-semibold text-content">{item.event}</td>
                      <td className="ta-num px-3 py-2.5 font-semibold text-up">
                        {item.actual || "-"}
                      </td>
                      <td className="ta-num px-3 py-2.5 text-content">{item.forecast || "-"}</td>
                      <td className="ta-num px-3 py-2.5 text-muted">{item.previous || "-"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}
      </div>
    </div>
  );
};
