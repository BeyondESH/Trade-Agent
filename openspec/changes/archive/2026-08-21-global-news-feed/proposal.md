## Why

The news flash module is entirely dependent on BlockBeats, which requires a `BB_API_KEY` and is crypto-native. There is no zero-config broad financial news source and no real-time push mechanism — the trading agent's `news` injection point (`build_agent_context`) stays unwired. AKShare is free (no API key, no registration) and aggregates 7×24 flash news from East Money, Sina, THS, and CLS, covering macro/policy/A-share/global markets — a broad multi-domain feed the crypto-only BlockBeats module cannot provide.

## What Changes

- **New independent global-news pipeline** (BlockBeats stays untouched as the crypto module):
  - Backend adds the `akshare` dependency (default install).
  - New `newsfeed.py`: thin AKShare source fetchers (`stock_info_global_em`, `stock_info_global_sina`, `stock_info_global_ths`, `stock_telegraph_cls`) + per-source column normalization into one stable item shape + topic classifier (ordered keyword rules → `macro/policy/crypto/a-share/global-market/industry/company`, first match wins, fallback `other`).
  - New `news_broker.py`: a **dedicated background polling thread** (independent of the event loop) that pulls all sources each cycle, publishes new items to asyncio subscribers via `call_soon_threadsafe` (mcp_client precedent), and keeps a ring buffer for new-connection replay. No cross-source dedup (decision D3); single-source failures are isolated with retry backoff.
  - New endpoints: `GET /news/categories` (drives frontend chips), `GET /news/stream` (SSE: backlog snapshot → live items → heartbeat), `GET /news/context?hours=&category=` (queryable buffer for the AI agent, later joined into `build_agent_context`).
  - Config: `MD_NEWS_POLL_SECONDS` (default 60) + buffer size; broker lifecycle wired into the FastAPI lifespan.
- **New "全域快讯" segment in the existing News view**:
  - `NewsCalendarView` gets a third top-level toggle (Market News Wire / Economic Calendar / 全域快讯), keeping the BlockBeats data flow (REST pagination) fully separate.
  - New `GlobalNewsFeed` component: topic chips (全部 + 7 topics, from `/news/categories`), EventSource client with auto-reconnect, client-side id dedup on replay, auto-scroll toggle, per-item source tag.
- **BREAKING**: none. BlockBeats routes, `newsfeed.ts` pagination, and the agent API are untouched.

## Capabilities

### New Capabilities
- `global-news-pipeline`: Backend ingestion & streaming — AKShare source adapters, column normalization, topic classification, dedicated polling thread, ring buffer, SSE hub, `/news/categories` `/news/stream` `/news/context` endpoints, polling/backoff config.
- `global-news-ui`: Frontend 全域快讯 segment — third toggle in `NewsCalendarView`, `GlobalNewsFeed` (topic chips + SSE rolling feed + reconnect dedup + auto-scroll), EventSource client hook, i18n.

### Modified Capabilities
<!-- none: blockbeats-news / news-infinite-scroll requirements are unchanged -->

## Impact

- **Backend dependencies**: `akshare` added to `backend/pyproject.toml` (hard dependency).
- **Backend code**: new `backend/src/market_data/newsfeed.py` and `news_broker.py`; `webapi.py` (two new routes + `/news/stream` SSE + broker lifecycle in lifespan); `config.py` (`MD_NEWS_POLL_SECONDS`, buffer size).
- **Backend tests**: new offline tests with monkeypatched AKShare DataFrames (no live network, matching `test_blockbeats.py`); SSE endpoint and `/news/context` tests.
- **Frontend code**: `NewsCalendarView.tsx` (third segment), new `lib/globalNews.ts` (EventSource hook), new `GlobalNewsFeed.tsx`, `i18n.ts` strings.
- **Frontend tests**: hook test with a FakeEventSource (following the `FakeWebSocket` precedent in `ws.test.ts`); component test for chips/filter/dedup.
- **Data**: in-memory ring buffer only (no persistence in v1); `/news/context` reads the same buffer.
