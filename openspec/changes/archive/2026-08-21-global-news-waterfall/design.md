## Context

`global-news-feed` shipped the pipeline (polling thread, classifier, ring buffer, SSE hub, `/news/categories` `/news/stream` `/news/context` `/news/health`) plus a first-version 全域快讯 pane: a single-column, bottom-append ticker with an auto-scroll toggle, `line-clamp-4` content, and a nested `max-h-[62vh]` scroll box. Feedback: the list below the title is effectively hidden, cards are too small to read full stories, and bottom-append + inner scrollbar is a poor news-reading UX.

This change reworks the pane into a news-native waterfall and adds the paging endpoint that makes history scrollable. The pipeline itself is untouched except payload ordering/cap and one new route.

## Goals / Non-Goals

**Goals:**
- News reading order (newest on top), full content readable directly in the feed.
- A waterfall that stays visually stable while live items stream in (anchoring, no viewport jumps).
- Bounded DOM (windowed render) and bounded SSE frames (snapshot cap).
- History paging within the in-memory ring (500) so "加载更早" works across a session.

**Non-Goals:**
- No persistence: paging stops at the ring-buffer boundary; deep disk-backed history is a future change.
- No new dependencies: the masonry is a hand-rolled hook (repo style avoids state/query/virtualization libs).
- No full virtualization: windowed rendering (mount only newest N) is chosen over virtualization because card heights are text-derived and columns rebalance; N=100 bounds the DOM cheaply.
- BlockBeats modules, `/news/context`, and the AI-agent wiring stay untouched.

## Decisions

### D1 — Hand-rolled JS masonry hook (no new dependency)
`lib/useMasonry.ts` maintains `columns: item[][]` + measured heights per column. Placement:
- **Estimated placement**: before a card mounts, its height is estimated from content length (`chars / chars-per-line × line-height`); the item goes to the currently-shortest column (top-insert keeps the newest row roughly level).
- **Measured rebalance**: each mounted card reports its real height via `ResizeObserver`; the column height is corrected. A card migrates to the truly-shortest column **only when the imbalance exceeds a threshold** (e.g. 30% of its own height) to avoid render churn.
- Live inserts only ever target the top of the shortest column — no full re-columnation on new items.

**Alternatives considered:** CSS `columns` (rejected: column-major order scrambles chronology and live inserts rebalance the whole flow); a masonry library like `react-masonry-css` (rejected: it is CSS-columns under the hood and offers no measured rebalance or insert control); full virtualization (`@tanstack/react-virtual`) (rejected: measure-then-place lifecycle does not fit text-height columns; overkill for N≈100 mounted).

### D2 — Newest-on-top ordering
All waterfall payloads are newest-first. The client `GlobalNewsClient` keeps `_items` newest-first: the snapshot is reversed on ingest (backend sends newest-first anyway) and live `item` events **prepend**. This reverses `global-news-feed`'s append + auto-scroll-to-bottom semantics; the auto-scroll toggle is removed (D4 replaces it).

### D3 — Scroll anchoring on live flush
When new items are flushed while the user is at the top (auto-flush), the viewport must not jump. Procedure: before inserting, record the id of the card currently at the viewport top; after the insert + layout, compute that card's `getBoundingClientRect().top` delta and compensate the page `scrollTop` by the same amount. If the anchor card was evicted from the window, fall back to compensating by the total inserted height estimate.

### D4 — "N 条新快讯" pending pill
New items are only flushed into the columns when the user is at the top (scroll position within a small threshold). Otherwise they accumulate in a `pending` queue and a pill "N 条新快讯" floats above the feed. Clicking the pill (or manually returning to the top) flushes pending items with D3 anchoring and scrolls to the top. This preserves reading position and is the direct replacement for the auto-scroll toggle.

### D5 — Windowed rendering + reveal
Only the newest `NEWS_WINDOW_SIZE` (default 100) items are mounted. Two reveal paths for older items:
- An IntersectionObserver sentinel at the bottom of the columns; entering the viewport reveals the next chunk (default 100).
- A fallback "加载更早" button, shown when the sentinel fails (IO unsupported, layout edge cases) or as the deterministic path for tests.

The window applies to the *rendered* item list; the client buffer still holds everything received, so reveal is pure client-side until the buffer/ring boundary is reached.

### D6 — Snapshot cap (SNAPSHOT_MAX_ITEMS = 100)
`/news/stream` replays only the latest 100 items instead of the full ring, and sends them newest-first. Rationale: the full-500 frame can be ~300KB and is replayed on every EventSource reconnect; 100 items is enough to fill the initial window and the rest is reachable via `/news/history` (D7). A module constant in `news_broker.py` (not a config env — keep config surface stable for this UI-focused change).

### D7 — `/news/history` paging endpoint
`GET /news/history?offset=&limit=&category=` pages the ring buffer (0..500), newest-first, returning `{items, total}`. `limit` default 100, max 200; `category` is a comma-separated filter (reuses the `recent()` filter logic). Out-of-range `offset` returns an empty `items` with the current `total` (200, not 404). This makes "加载更早" work beyond the initial window without a reconnect.

**Boundary:** when `offset + len` exceeds the ring capacity (500), the client shows "已加载全部" — persistence is out of scope (Non-Goal).

### D8 — Full-content portrait cards
Cards render the complete `content` (the `line-clamp-4` is removed; the `content !== title` guard stays). Portrait shape comes from the column width; height is naturally variable (short flashes vs long briefs), which is exactly what the waterfall engine exploits. Source badge, category badge, time, and the original-article link (when `url`) are kept from v1.

### D9 — Single scroll container
The nested `max-h-[62vh] overflow-y-auto` box inside `GlobalNewsFeed` is removed; the feed flows inside `NewsCalendarView`'s existing page-level scroll container. This is the direct fix for "标题下方没有全部显示新闻列表".

## Risks / Trade-offs

| Risk | Mitigation |
|---|---|
| Text-derived card heights are non-deterministic (font loading, i18n) | Estimated placement + `ResizeObserver` measurement + threshold-gated migration (D1) |
| Rebalance/migration causes visible movement | Only migrate when imbalance exceeds a threshold; live inserts never re-columnize |
| Live flush jumps the viewport | D3 anchor-card `scrollTop` compensation |
| Large snapshot frames on every reconnect | D6 cap to 100 newest-first |
| "加载更早" needs more history than the 500-ring | Explicit boundary + "已加载全部" state; persistence deferred |
| Windowed reveal could feel abrupt | Chunked reveal (100 at a time) via sentinel; fallback button |
| Old tests assume bottom-append + auto-scroll | Rewritten `GlobalNewsFeed.test.tsx`; `globalNews.test.ts` extended for prepend/pending/window semantics |

## Migration Plan

- **Deploy:** additive backend route + payload ordering change; frontend pane rework ships as part of the 全域快讯 segment. No other route or module changes.
- **Rollback:** revert the pane rework + route additions. BlockBeats and `/news/context` are untouched in both directions.
- **Data:** none persisted; the ring refills from the first poll cycle after restart.

## Open Questions

- `NEWS_WINDOW_SIZE` / reveal chunk (100) and `SNAPSHOT_MAX_ITEMS` (100) exact values — tuning at implementation time; kept as module constants.
- Column count responsive breakpoints (2/3/4 by viewport width) — implementation detail of `useMasonry`.
- Whether the pill should also show a source-filtered count (e.g. when a topic chip is active) — deferred.
