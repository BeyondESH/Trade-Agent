## Why

The 全域快讯 feed shipped in `global-news-feed` renders as a single-column ticker trapped inside a nested `max-h-[62vh] overflow-y-auto` box — on typical screens only 1–2 cards are visible below the title and the rest hide behind an inner scrollbar, so "the list below the title is never fully shown". Cards clamp content to 4 lines (`line-clamp-4`), so full stories are not readable in the feed. The layout is also ticker-style (newest appended at the bottom with a manual auto-scroll toggle) whereas a news reader expects newest-on-top. Finally, every SSE reconnect replays the whole 500-item ring buffer in the `snapshot` frame (potentially ~300KB).

## What Changes

- **Backend (small, additive)**:
  - `GET /news/history?offset=&limit=&category=` — paginate the ring buffer (0..500), newest-first, returns `{items, total}`.
  - `/news/stream` `snapshot` capped to the latest `SNAPSHOT_MAX_ITEMS` (100) and sent newest-first, bounding reconnect payloads.
  - All waterfall payloads (snapshot, `/news/history`) share one newest-first ordering.
- **Frontend (UI rework of `GlobalNewsFeed`)**:
  - JS masonry (hand-rolled column hook): cards placed into the shortest measured column; `ResizeObserver` measures real heights; threshold-based rebalance avoids churn.
  - Portrait cards with **full content** (`line-clamp` removed).
  - **Newest-on-top** with live prepend + **scroll anchoring** (anchor card id, `scrollTop` compensation) so auto-flush never jumps the viewport.
  - **"N 条新快讯" pill**: when the user has scrolled down, incoming items buffer; the pill flushes and scrolls to top on click.
  - **Windowed rendering**: only the newest N cards are mounted; an IntersectionObserver sentinel reveals older items in chunks, with a fallback "加载更早" button.
  - The cramped nested `62vh` scroll box is removed — the feed scrolls in the page.
  - The auto-scroll toggle is removed (superseded by pill + anchoring).
- **BREAKING**: none externally. BlockBeats path untouched. The 全域快讯 pane changes order/layout/scroll UX; its tests are rewritten.

## Capabilities

### New Capabilities
<!-- none: reuses `global-news-pipeline` and `global-news-ui` -->

### Modified Capabilities
- `global-news-pipeline`: snapshot ordering/cap; new `/news/history` paging endpoint; newest-first ordering for waterfall payloads.
- `global-news-ui`: waterfall layout, full-content portrait cards, newest-on-top with anchoring + "N 条新快讯" pill, windowed rendering + scroll-to-load-more.

## Impact

- **Backend code**: `news_broker.py` (`SNAPSHOT_MAX_ITEMS`, `recent(offset, limit)`, newest-first helper); `webapi.py` (`/news/history` route, snapshot cap/order).
- **Backend tests**: `test_news_broker.py` / `test_webapi.py` — snapshot cap + ordering, paging (offset/limit/category/bounds/total).
- **Frontend code**: new `lib/useMasonry.ts` (column hook); `lib/globalNews.ts` (newest-first, pending queue, window slice, `fetchNewsHistory`); `api/client.ts` (`newsHistory`); `GlobalNewsFeed.tsx` rework; `i18n.ts` strings; `NewsCalendarView.tsx` unchanged except still rendering the reworked feed.
- **Frontend tests**: new `lib/useMasonry.test.ts`; rewritten `GlobalNewsFeed.test.tsx`; extended `lib/globalNews.test.ts`.
- **Data**: none persisted — paging is bounded by the 500-item in-memory ring (deep disk-backed history is explicitly out of scope).
