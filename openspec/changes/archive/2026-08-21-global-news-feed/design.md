## Context

The web API currently proxies BlockBeats news as a REST request/response (page/size pagination, `BB_API_KEY` required, crypto-native content). The frontend consumes it through `newsfeed.ts` and renders tabs per BlockBeats endpoint in `NewsCalendarView`. The trading agent exposes a `news` string injection point (`build_agent_context`) that is not wired to any source.

This change adds an independent global-news pipeline fed by AKShare (East Money / Sina / THS / CLS 7×24 flash news, no API key) and pushes it to the browser via SSE for a real-time rolling feed. BlockBeats remains the separate crypto module; the two never share data paths.

## Goals / Non-Goals

**Goals:**
- Zero-config broad financial news ingestion (no API key) with topic classification.
- Real-time push to the browser (SSE rolling feed), not poll-on-demand.
- A queryable in-memory buffer exposed via `/news/context` for the future AI-agent news context.
- Keep BlockBeats behavior and the existing News view's BlockBeats tabs byte-for-byte untouched.

**Non-Goals:**
- No cross-source content dedup on the server (explicit decision; overlapping wire stories are shown as-is).
- No per-stock news (`stock_news_em` requires a symbol param; there is no A-share watchlist concept in a crypto system) — deferred.
- No persistence/disk storage of global news in v1 (in-memory ring buffer only).
- No agent-context wiring (`/news/context` returns data; the orchestration layer joins it into `build_agent_context` in a later change).
- Not tick-level realtime — AKShare polling is minute-level.

## Decisions

### D1 — Dedicated background polling thread (not per-request threadpool)
AKShare calls are synchronous and slow (2–6s per source; a full 4-source cycle is 10–25s). Per-request `run_in_threadpool` would stall paginated REST and duplicate upstream hits on every SSE reconnect.

- A `news_broker.NewsBroker` owns one daemon `threading.Thread` that loops: fetch each source (sequential), normalize + classify, publish new items, sleep `MD_NEWS_POLL_SECONDS` (default 60).
- Started/stopped in the FastAPI lifespan (mirrors `BitgetWsStream.start()/stop()`).
- **Alternatives considered:** `run_in_threadpool` per request (rejected: slow + duplicates work); `asyncio.to_thread` in a background task (equivalent but couples the poller to the event loop; the user explicitly asked for a dedicated sync thread); APScheduler job (rejected: same coupling, harder to keep a warm buffer).

### D2 — Thread → event-loop bridge via `loop.call_soon_threadsafe`
The broker publishes into a subscriber registry of `asyncio.Queue` objects. On each poll cycle it calls `loop.call_soon_threadsafe(queue.put_nowait, item)` per subscriber — the exact pattern already used in `mcp_client.py`. No locks leak into the async side; the buffer itself is guarded by a `threading.Lock`.

### D3 — Lazy AKShare import inside the worker thread
`import akshare` takes 2–5s and pulls dozens of transitive packages. Importing it at uvicorn startup would delay every boot. The broker imports it lazily on the first poll cycle; failures surface as a per-source health state, not a startup crash.

### D4 — Topic classification: ordered single-label keyword rules
`newsfeed.py` defines `CATEGORY_RULES: list[tuple[category, tuple[keywords...]]]` in fixed order. First keyword hit wins; no hit → `other`. Priority order puts high-signal categories first: `crypto`, `macro`, `policy`, `a-share`, `global-market`, `industry`, `company`. Classification runs on `title + content`. Rules are static code in v1 (tunable later); `GET /news/categories` returns the ordered list so the frontend renders chips dynamically and never hardcodes them.

**Alternatives considered:** multi-label (rejected: chips want single-select filtering; the full text is preserved anyway); ML classifier (rejected: overkill for v1, keyword rules are auditable and adequate).

### D5 — Item schema and id (no server dedup)
Each item normalizes to:

```json
{ "id": "em_0a3f9c…", "source": "em", "category": "macro",
  "title": "…", "content": "…", "url": "…", "ts": 1755700000 }
```

- `id` = `f"{source}_{sha1(source+content)[:8]}"` — stable across polls (no dedup state needed to make reconnect-safe ids).
- Ring buffer: `deque(maxlen=MD_NEWS_BUFFER_SIZE)`, default 500.
- **Consequence:** SSE reconnect replays the backlog, so the frontend must dedup by `id` at render time (a `Set`) — this is display de-dup against replay, not content dedup.

### D6 — SSE protocol
`GET /news/stream` returns `StreamingResponse(media_type="text/event-stream")`:

- `event: snapshot` → first frame carries the ring-buffer backlog (recent 500).
- `event: item` → one JSON item per new item, as the broker publishes.
- `: ping` comment frame every 15s to keep proxies from killing the connection.
- Each subscriber gets its own `asyncio.Queue`; disconnect cancels the generator and drops the queue.
- If akshare is unavailable (broker failed), the endpoint still opens and sends an empty snapshot plus a `source` status frame, so the UI can show a graceful unavailable state.

### D7 — `/news/context`
`GET /news/context?hours=2&category=macro,crypto` scans the ring buffer and returns `{"items": [...]}` filtered by `ts >= now - hours` and (optionally) a comma-separated category list. Structured items, not pre-formatted text — the orchestration layer will format a digest for `build_agent_context(..., news=...)` in a later change.

### D8 — Polling cadence and failure isolation
- Poll interval is a config setting (`MD_NEWS_POLL_SECONDS`), so the "minute-level realtime" expectation is tunable.
- Each source fetcher is wrapped in try/except; a single failing source logs and is skipped (mirrors `blockbeats_cache._write_for`). Consecutive failures per source trigger a backoff multiplier (×1, ×2, ×4 … cap 5×interval) so a dead upstream doesn't cause hot-looping.
- A `GET /news/health` (cheap, optional) exposes last-poll time and per-source last-error for debuggability.

### D9 — Frontend placement: third toggle segment
`NewsCalendarView` gets a third segment in the existing top toggle: `Market News Wire | Economic Calendar | 全域快讯`. The 全域快讯 pane is a separate component (`GlobalNewsFeed`) that owns its own EventSource hook and topic-chip state; the BlockBeats chips/list path is untouched.

- `lib/globalNews.ts`: EventSource wrapper with browser-native auto-reconnect + client-side `id` dedup on replay + connection state.
- Topic chips come from `/news/categories` (single-select + 全部).
- Auto-scroll toggle on new items; per-item source badge + category badge + external link when `url` present.

### D10 — akshare as a hard dependency
`akshare>=…` is added to `backend/pyproject.toml` (D4 decision: default install). Pinning a minimum version guards against upstream function renames (`stock_info_global_em`, etc.). The four fetcher adapters isolate akshare's column naming inside `newsfeed.py` so a breakage is contained to one file.

## Risks / Trade-offs

| Risk | Mitigation |
|---|---|
| AKShare function signatures/columns change between versions (it moves fast) | Pin minimum version; isolate all akshare access inside the four adapter functions in `newsfeed.py`; per-source try/except means one broken source degrades to the other three |
| Upstream sources rate-limit or block scraping | Configurable poll interval; per-source backoff; graceful UI state via `/news/stream` status frame |
| Heavy dependency (akshare pulls many transitive packages) | Accepted trade-off (D4 default install); lazy import keeps boot fast |
| SSE connections dropped by proxies on idle | 15s heartbeat comment frames + browser-native EventSource reconnect |
| Reconnect replay duplicates items on screen | Client-side `id` Set dedup at render |
| Chinese sources unreachable in some networks | Same environment reality as BlockBeats (already handled via proxy env in this repo's context); failure is visible and non-fatal |
| Agent context flooding with low-signal A股 noise | `/news/context` takes `hours` + `category` filters; agent-side trimming is a later change |

## Migration Plan

- **Deploy:** additive — new modules, new endpoints, new dependency; no existing route or payload changes. Frontend ships the third segment alongside the existing two.
- **Rollback:** remove the third segment / revert the two commits. BlockBeats path is untouched in both directions, so old behavior is preserved automatically.
- **Data:** none persisted, no migration needed. Buffer restarts cold and refills on the first poll cycle (~60s).

## Open Questions

- Whether to add a `source` chip filter (in addition to topic) — deferred to v1 feedback; per-item source badges already convey it.
- Exact minimum `akshare` version pin — decided at implementation time by installing latest and locking.
