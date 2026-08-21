import React, { useCallback, useEffect, useRef, useState } from 'react';
import type { GlobalNewsItem, ThemeMode } from '../../types/trading';
import {
  NEWS_WINDOW_SIZE,
  REVEAL_CHUNK,
  allSourcesUnavailable,
  fetchNewsCategories,
  formatNewsTime,
  useGlobalNewsStream,
} from '../../lib/globalNews';
import { useMasonry } from '../../lib/useMasonry';
import { t } from '../../lib/i18n';
import { AlertCircle, ChevronUp, ExternalLink, Globe } from 'lucide-react';

interface Props {
  theme: ThemeMode;
}

/** Scroll position (px) considered "at the top" for auto-flushing pending items. */
const AT_TOP_THRESHOLD = 24;
/** Page-level scroll container (NewsCalendarView root) that owns the feed scroll. */
const SCROLL_ROOT_SELECTOR = '#news-calendar-view';

/** Rough pre-mount card height: title + content lines * line height. */
function estimateHeight(item: GlobalNewsItem): number {
  const titleLines = Math.max(1, Math.ceil(item.title.length / 26));
  const content = item.content && item.content !== item.title ? item.content : '';
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
  const cards = Array.from(container.querySelectorAll<HTMLElement>('[data-item-id]'));
  for (const card of cards) {
    const r = card.getBoundingClientRect();
    if (r.bottom >= cTop + 1) return card;
  }
  return cards[0] ?? null;
}

function scheduleFrame(cb: () => void): void {
  if (typeof requestAnimationFrame === 'function') {
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
  const isDark = theme === 'dark';

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
    container.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    return () => container.removeEventListener('scroll', onScroll);
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
    void loadMore(selected ?? undefined).then(() => {
      setRenderCount((c) => c + REVEAL_CHUNK);
    }).catch(() => {
      /* load failure is silent; the sentinel retries on the next scroll */
    });
  }, [renderCount, visible.length, selected, loadMore]);

  // Keep the IntersectionObserver callback on the latest revealMore.
  const revealRef = useRef(revealMore);
  revealRef.current = revealMore;

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el || !('IntersectionObserver' in window)) {
      setIoOk(false);
      return;
    }
    let observer: IntersectionObserver | null = null;
    try {
      observer = new IntersectionObserver(
        (entries) => {
          if (entries.some((en) => en.isIntersecting)) revealRef.current();
        },
        { root: findScrollRoot(rootRef.current), rootMargin: '200px' },
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

  return (
    <div ref={rootRef} className="flex flex-col gap-3">
      {/* Topic chips (全部 + categories from backend) */}
      <div className="flex items-center gap-2 flex-wrap">
        <button
          onClick={() => setSelected(null)}
          className={`px-3 py-1 rounded-lg border text-xs font-medium transition-colors ${
            selected === null
              ? 'bg-[#2962ff] border-[#2962ff] text-white'
              : isDark
                ? 'bg-[#1e222d] border-[#2a2e39] text-gray-400 hover:text-white'
                : 'bg-white border-[#e0e3eb] text-gray-600 hover:text-black'
          }`}
        >
          {t('All')}
        </button>
        {categories.map((c) => (
          <button
            key={c}
            onClick={() => setSelected(selected === c ? null : c)}
            className={`px-3 py-1 rounded-lg border text-xs font-medium transition-colors ${
              selected === c
                ? 'bg-[#2962ff] border-[#2962ff] text-white'
                : isDark
                  ? 'bg-[#1e222d] border-[#2a2e39] text-gray-400 hover:text-white'
                  : 'bg-white border-[#e0e3eb] text-gray-600 hover:text-black'
            }`}
          >
            {t(c)}
          </button>
        ))}
      </div>

      {/* Status line */}
      <div className="flex items-center gap-2 text-xs min-h-[18px]">
        {state === 'connecting' && <span className="text-gray-400">{t('Connecting...')}</span>}
        {state === 'open' && (
          <span className="text-[10px] px-2 py-0.5 rounded bg-[#089981]/20 text-[#089981] font-bold">
            LIVE
          </span>
        )}
        {unavailable && (
          <span className="flex items-center gap-1 text-[#f23645] text-xs">
            <AlertCircle className="w-3.5 h-3.5" />
            {t('News sources unavailable')}
          </span>
        )}
      </div>

      {/* "N 条新快讯" pill (floats while the user is scrolled down) */}
      {!atTop && pendingCount > 0 && (
        <div className="sticky top-2 z-10 flex justify-center">
          <button
            onClick={handlePill}
            data-testid="new-items-pill"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[#2962ff] text-white text-xs font-semibold shadow-lg hover:bg-[#1e4fd8] transition-colors"
          >
            <ChevronUp className="w-3.5 h-3.5" />
            <span>
              {pendingCount} {t('New Items')}
            </span>
          </button>
        </div>
      )}

      {/* Waterfall columns */}
      {windowed.length === 0 && !unavailable && (
        <div className="text-xs text-gray-400 text-center py-6">
          {state === 'connecting' ? t('Connecting...') : '--'}
        </div>
      )}
      <div className="flex gap-3 items-start" data-testid="global-news-columns">
        {columns.map((col, i) => (
          <div key={i} className="flex-1 flex flex-col gap-3 min-w-0" data-testid={`column-${i}`}>
            {col.map((item) => (
              <NewsCard key={item.id} item={item} isDark={isDark} onMeasure={measure} />
            ))}
          </div>
        ))}
      </div>

      {/* Scroll-to-load-more: IntersectionObserver sentinel + fallback button */}
      {hasOlder && (
        <div ref={sentinelRef} className="flex justify-center py-2">
          {!ioOk && (
            <button
              onClick={() => void revealMore()}
              data-testid="load-earlier-button"
              className="px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors bg-[#2962ff] border-[#2962ff] text-white hover:bg-[#1e4fd8]"
            >
              {t('Load Earlier')}
            </button>
          )}
        </div>
      )}
      {!hasOlder && windowed.length > 0 && (
        <div className="text-xs text-gray-400 text-center py-2" data-testid="all-loaded">
          {t('All Loaded')}
        </div>
      )}
    </div>
  );
};

function NewsCard({
  item,
  isDark,
  onMeasure,
}: {
  item: GlobalNewsItem;
  isDark: boolean;
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
    if (typeof ResizeObserver !== 'undefined') {
      const ro = new ResizeObserver(report);
      ro.observe(el);
      return () => ro.disconnect();
    }
  }, [item.id, onMeasure]);

  return (
    <div
      ref={ref}
      data-item-id={item.id}
      className={`p-4 rounded-xl border flex flex-col gap-2 transition-all hover:border-[#2962ff] ${
        isDark ? 'bg-[#1e222d] border-[#2a2e39]' : 'bg-white border-[#e0e3eb]'
      }`}
    >
      <div className="flex items-center justify-between">
        <span className="text-gray-500 text-[10px]">{formatNewsTime(item.ts)}</span>
        <div className="flex items-center gap-1.5">
          <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-[#4caf50]/20 text-[#4caf50]">
            {item.source}
          </span>
          <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-gray-500/20 text-gray-400">
            {t(item.category)}
          </span>
        </div>
      </div>

      <h3 className="font-bold text-sm text-white leading-snug">{item.title}</h3>
      {item.content && item.content !== item.title && (
        <p className="text-xs text-gray-300 leading-relaxed whitespace-pre-wrap">{item.content}</p>
      )}

      {item.url && (
        <div className="flex items-center justify-end pt-2 border-t border-gray-500/20 mt-1">
          <a
            href={item.url}
            target="_blank"
            rel="noreferrer"
            className="text-gray-400 hover:text-white flex items-center gap-1 text-xs"
          >
            <Globe className="w-3 h-3" />
            <span>{t('Original Article')}</span>
            <ExternalLink className="w-3 h-3" />
          </a>
        </div>
      )}
    </div>
  );
}
