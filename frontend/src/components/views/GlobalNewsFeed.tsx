import { AlertCircle, ChevronUp, ExternalLink, Globe } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import type React from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  allSourcesUnavailable,
  fetchNewsCategories,
  formatNewsTime,
  NEWS_WINDOW_SIZE,
  REVEAL_CHUNK,
  useGlobalNewsStream,
} from "../../lib/globalNews";
import { t } from "../../lib/i18n";
import { useMasonry } from "../../lib/useMasonry";
import type { GlobalNewsItem, ThemeMode } from "../../types/trading";

interface Props {
  theme: ThemeMode;
}

/** Scroll position (px) considered "at the top" for auto-flushing pending items. */
const AT_TOP_THRESHOLD = 24;
/** Page-level scroll container (NewsCalendarView root) that owns the feed scroll. */
const SCROLL_ROOT_SELECTOR = "#news-calendar-view";

const SPRING = { type: "spring", stiffness: 380, damping: 30 } as const;

/** Rough pre-mount card height: title + content lines * line height. */
function estimateHeight(item: GlobalNewsItem): number {
  const titleLines = Math.max(1, Math.ceil(item.title.length / 26));
  const content = item.content && item.content !== item.title ? item.content : "";
  const contentLines = content ? Math.max(1, Math.ceil(content.length / 30)) : 0;
  return 64 + titleLines * 20 + contentLines * 18;
}

function findScrollRoot(el: Element | null): HTMLElement | null {
  if (!el) return null;
  return el.closest(SCROLL_ROOT_SELECTOR) as HTMLElement | null;
}

/** First card currently visible in the scroll container (anchor for D3). */
function topVisibleCard(container: HTMLElement): HTMLElement | null {
  const cTop = container.getBoundingClientRect().top;
  const cards = Array.from(container.querySelectorAll<HTMLElement>("[data-item-id]"));
  for (const card of cards) {
    const r = card.getBoundingClientRect();
    if (r.bottom >= cTop + 1) return card;
  }
  return cards[0] ?? null;
}

function scheduleFrame(cb: () => void): void {
  if (typeof requestAnimationFrame === "function") {
    requestAnimationFrame(() => cb());
  } else {
    setTimeout(cb, 0);
  }
}

export const GlobalNewsFeed: React.FC<Props> = ({ theme }) => {
  const { items, state, sources, pendingCount, flushPending, hasMore, loadMore } =
    useGlobalNewsStream();
  const [categories, setCategories] = useState<string[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [renderCount, setRenderCount] = useState(NEWS_WINDOW_SIZE);
  const [atTop, setAtTop] = useState(true);
  const [ioOk, setIoOk] = useState(true);
  const rootRef = useRef<HTMLDivElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const reduce = useReducedMotion();

  useEffect(() => {
    fetchNewsCategories()
      .then(setCategories)
      .catch(() => setCategories([]));
  }, []);

  // Detect the page-level scroll container; "at top" drives auto-flush vs pill.
  useEffect(() => {
    const container = findScrollRoot(rootRef.current);
    if (!container) return;
    const onScroll = () => setAtTop(container.scrollTop <= AT_TOP_THRESHOLD);
    container.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => container.removeEventListener("scroll", onScroll);
  }, []);

  // Flush pending items, anchoring the viewport so a near-top auto-flush does
  // not visibly jump the user's reading position (D3).
  const flushNewItems = useCallback(() => {
    const container = findScrollRoot(rootRef.current);
    let anchor: HTMLElement | null = null;
    let anchorTop = 0;
    if (container && container.scrollTop > 0) {
      anchor = topVisibleCard(container);
      anchorTop = anchor ? anchor.getBoundingClientRect().top : 0;
    }
    const flushed = flushPending();
    if (flushed.length === 0) return;
    if (anchor && container) {
      scheduleFrame(() => {
        if (anchor.isConnected && container.isConnected) {
          container.scrollTop += anchor.getBoundingClientRect().top - anchorTop;
        }
      });
    }
  }, [flushPending]);

  useEffect(() => {
    if (atTop && pendingCount > 0) flushNewItems();
  }, [atTop, pendingCount, flushNewItems]);

  // Reset the rendering window when the topic filter changes.
  useEffect(() => {
    setRenderCount(NEWS_WINDOW_SIZE);
  }, [selected]);

  const visible = selected ? items.filter((i) => i.category === selected) : items;
  const windowed = visible.slice(0, renderCount);
  const hasOlder = visible.length > renderCount || hasMore(selected ?? undefined);

  const revealMore = useCallback(() => {
    if (renderCount < visible.length) {
      setRenderCount((c) => c + REVEAL_CHUNK);
      return;
    }
    void loadMore(selected ?? undefined)
      .then(() => {
        setRenderCount((c) => c + REVEAL_CHUNK);
      })
      .catch(() => {
        /* load failure is silent; the sentinel retries on the next scroll */
      });
  }, [renderCount, visible.length, selected, loadMore]);

  // Keep the IntersectionObserver callback on the latest revealMore.
  const revealRef = useRef(revealMore);
  revealRef.current = revealMore;

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el || !("IntersectionObserver" in window)) {
      setIoOk(false);
      return;
    }
    let observer: IntersectionObserver | null = null;
    try {
      observer = new IntersectionObserver(
        (entries) => {
          if (entries.some((en) => en.isIntersecting)) revealRef.current();
        },
        { root: findScrollRoot(rootRef.current), rootMargin: "200px" },
      );
      observer.observe(el);
    } catch {
      setIoOk(false);
    }
    return () => observer?.disconnect();
  }, []);

  const { columns, measure } = useMasonry(windowed, estimateHeight);
  const unavailable = allSourcesUnavailable(sources);

  const handlePill = () => {
    flushNewItems();
    const container = findScrollRoot(rootRef.current);
    if (container) container.scrollTop = 0;
  };

  const topics: { value: string | null; label: string }[] = [
    { value: null, label: t("All") },
    ...categories.map((c) => ({ value: c as string | null, label: t(c) })),
  ];

  return (
    <div ref={rootRef} data-testid="global-news-feed" className="flex flex-col gap-3">
      {/* Topic chips: one sliding indicator, not a row of toggled fills */}
      <div className="ta-fade-x overflow-x-auto">
        <div className="flex items-center gap-0.5 rounded-lg border border-line bg-ink/60 p-0.5">
          {topics.map((topic) => {
            const active = selected === topic.value;
            return (
              <button
                key={topic.value ?? "__all__"}
                type="button"
                onClick={() => setSelected(active ? null : topic.value)}
                className={`relative flex items-center rounded-md px-3 py-1 text-2xs font-semibold transition-colors ${
                  active ? "text-signal-ink" : "text-muted hover:text-content"
                }`}
              >
                {active && (
                  <motion.span
                    layoutId="gnf-topic-indicator"
                    className="absolute inset-0 rounded-md bg-signal"
                    transition={reduce ? { duration: 0 } : SPRING}
                  />
                )}
                <span className="relative z-10 whitespace-nowrap">{topic.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Status line: a real live badge, not a bare label */}
      <div className="flex min-h-[18px] items-center gap-2 text-xs">
        {state === "connecting" && (
          <span className="ta-eyebrow text-muted">{t("Connecting...")}</span>
        )}
        {state === "open" && (
          <span className="flex items-center gap-1.5 rounded-full border border-up/25 bg-up/10 px-2 py-0.5">
            <span className="relative flex h-1.5 w-1.5">
              <span className="absolute inline-flex h-full w-full animate-[ta-ping_2s_ease-out_infinite] rounded-full bg-up" />
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-up" />
            </span>
            <span className="ta-eyebrow text-up">LIVE</span>
          </span>
        )}
        {unavailable && (
          <span className="flex items-center gap-1 text-xs text-down">
            <AlertCircle className="h-3.5 w-3.5" />
            {t("News sources unavailable")}
          </span>
        )}
      </div>

      {/* "N 条新快讯" pill (floats while the user is scrolled down) */}
      {!atTop && pendingCount > 0 && (
        <div className="sticky top-2 z-10 flex justify-center">
          <motion.button
            type="button"
            onClick={handlePill}
            data-testid="new-items-pill"
            initial={reduce ? false : { opacity: 0, y: -10, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={reduce ? { duration: 0 } : SPRING}
            whileHover={{ y: -1 }}
            whileTap={{ scale: 0.98 }}
            className="flex items-center gap-1.5 rounded-full bg-signal px-3 py-1 text-xs font-semibold text-signal-ink shadow-float transition-colors hover:bg-signal/90"
          >
            <ChevronUp className="h-3.5 w-3.5" />
            <span>
              {pendingCount} {t("New Items")}
            </span>
          </motion.button>
        </div>
      )}

      {/* Waterfall columns */}
      {windowed.length === 0 && !unavailable && (
        <div className="py-6 text-center text-xs text-muted">
          {state === "connecting" ? t("Connecting...") : "--"}
        </div>
      )}
      <div className="flex items-start gap-3" data-testid="global-news-columns">
        {columns.map((col, i) => (
          <div key={i} className="flex min-w-0 flex-1 flex-col gap-3" data-testid={`column-${i}`}>
            {col.map((item) => (
              <NewsCard key={item.id} item={item} onMeasure={measure} />
            ))}
          </div>
        ))}
      </div>

      {/* Scroll-to-load-more: IntersectionObserver sentinel + fallback button */}
      {hasOlder && (
        <div ref={sentinelRef} className="flex justify-center py-2">
          {!ioOk && (
            <button
              type="button"
              onClick={() => void revealMore()}
              data-testid="load-earlier-button"
              className="rounded-md bg-signal px-3 py-1.5 text-xs font-semibold text-signal-ink transition-colors hover:bg-signal/90"
            >
              {t("Load Earlier")}
            </button>
          )}
        </div>
      )}
      {!hasOlder && windowed.length > 0 && (
        <div className="py-2 text-center text-2xs text-faint" data-testid="all-loaded">
          {t("All Loaded")}
        </div>
      )}
    </div>
  );
};

function NewsCard({
  item,
  onMeasure,
}: {
  item: GlobalNewsItem;
  onMeasure: (id: string, height: number) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const report = () => {
      const h = el.offsetHeight;
      if (h > 0) onMeasure(item.id, h);
    };
    report();
    if (typeof ResizeObserver !== "undefined") {
      const ro = new ResizeObserver(report);
      ro.observe(el);
      return () => ro.disconnect();
    }
  }, [item.id, onMeasure]);

  const hasContent = !!(item.content && item.content !== item.title);

  return (
    <motion.div
      ref={ref}
      data-item-id={item.id}
      whileHover={{ y: -2 }}
      transition={SPRING}
      className="group flex flex-col gap-2 rounded-xl border border-line bg-surface p-3.5 shadow-e1 transition-[box-shadow,border-color] hover:border-line-strong hover:shadow-e2"
    >
      <div className="flex items-start justify-between gap-2">
        <span className="ta-eyebrow ta-num text-faint">{formatNewsTime(item.ts)}</span>
        <div className="flex shrink-0 items-center gap-1.5">
          <span className="ta-eyebrow rounded border border-line/70 bg-surface-2 px-1.5 py-0.5 text-muted">
            {item.source}
          </span>
          <span className="ta-eyebrow rounded bg-signal/15 px-1.5 py-0.5 text-signal">
            {t(item.category)}
          </span>
        </div>
      </div>

      <h3 className="text-sm font-bold leading-snug text-content">{item.title}</h3>
      {hasContent && (
        <p className="whitespace-pre-wrap text-xs leading-relaxed text-muted">{item.content}</p>
      )}

      {item.url && (
        <div className="mt-1 flex justify-end border-t border-line/60 pt-2 opacity-0 transition-opacity duration-200 group-hover:opacity-100 group-focus-within:opacity-100">
          <a
            href={item.url}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-1 text-2xs font-semibold text-muted transition-colors hover:text-signal"
          >
            <Globe className="h-3 w-3" />
            <span>{t("Original Article")}</span>
            <ExternalLink className="h-3 w-3" />
          </a>
        </div>
      )}
    </motion.div>
  );
}
