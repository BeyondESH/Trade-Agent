## Context

- Current frontend (`frontend/src`, React 18/Vite 5/Tailwind 3) is a hand-built TradingView-style shell. Its UI layer is superseded by `frontend/vendor/tradingview-pro` (React 19/Vite 6/Tailwind 4, ~9.6k LOC) which already implements the whole desktop chrome (title bar, nav rail, top navbar, drawing toolbar, multi-chart grid, right dock ×8, bottom dock, timebar, 8 views, ~10 modals).
- The template's chart is a self-drawn canvas (`TradingChart.tsx`); all data is mock (`marketData.ts`, `setInterval` tick loop), and `MultiChartGrid` passes the same candle array to every cell (no real multi-symbol).
- `frontend/vendor/klinecharts-pro` (v0.1.1) is a vendored TradingView-grade chart component with its own drawing bar, indicator/symbol-search/screenshot/setting/timezone modals, period bar, i18n, and a `Datafeed` contract. The old frontend already integrated it (`KLineChartProView.tsx` wrapper, `datafeed.ts` implementing `Datafeed`, multi-chart sync in `lib/chartSyncBus`/`cellChartSetup`).
- Backend (`market_data/webapi.py`) exposes REST (`/instruments`, `/tickers`, `/candles`, `/backtest`, `/alerts`, `/portfolio`, `/order`, `/order/confirm`) and `/ws` (candle/ticker/books/trade/mark-price/funding-time channels).
- BlockBeats API (`api-pro.theblockbeats.info/v1`): 10 newsflash endpoints, 4 article, 1 search, 11 data endpoints; auth via `api-key` header.

## Goals / Non-Goals

**Goals:**
- UI shell fully inherits the template; zero old UI components remain.
- Chart rendering is `klinecharts-pro` in every grid cell, with template toolbar commanding it (decision A).
- Real data: candles/tickers/books via REST+WS; per-cell per-symbol series; no mock ticks in the chart path.
- BlockBeats News Wire (all 10 endpoints as tabs) + 11 data endpoints (Data Window "Market Pulse" + Heatmap) via a backend proxy; API key never reaches the browser.
- Keep `frontend/` infra: vitest, vite proxy `/api`→8000, `/ws`→8000.

**Non-Goals:**
- No new TradingView features beyond the template; no live real-money order execution (paper trading only, via existing backend flow).
- No economic-calendar backend (BlockBeats has none) — Economic Calendar tab stays mock.
- No migration of the old gridstack draggable layout; template fixed layouts replace it.

## Decisions

### D1. Template becomes the new `frontend/src`
Copy `vendor/tradingview-pro/src/*` into `frontend/src/` and promote its deps into `frontend/package.json` (react@19, vite@6, tailwind@4, @vitejs/plugin-react, lucide-react, motion, @tailwindcss/vite). Keep `frontend/vendor/` for both vendored packages (`tradingview-pro` stays as the pristine reference; `klinecharts-pro` is the chart engine). Old `frontend/src` UI is deleted; `frontend/src/api` and `frontend/src/lib` (non-UI layers) are kept and folded in.

Rationale: preserves vitest/test-setup and the backend proxy while upgrading the stack. Alternative (run the template standalone at its own port) would fork the proxy/test infra.

### D2. Chart cell = `KLineChartPro` + one `Datafeed` per cell
`MultiChartGrid` (template) is retained as the layout shell; `renderChartCell` renders `KLineChartProView` (the old wrapper, moved into `src/components/chart/`) instead of `TradingChart`. Each cell binds its own `datafeed` instance wired to `bitgetWs` (live) + `api.candlesRecent` (history). Cross-cell sync (`crosshair`/`range`/`draw`/active-cell) is reattached via the ported `lib/chartSyncBus`/`cellChartSetup` against each cell's klinecharts instance.

Rationale: reuses the existing, tested datafeed + sync bus instead of rewriting for the template's canvas chart.

### D3. Template toolbar commands the chart (decision A)
- `TopNavbar` period buttons → `chart.setPeriod()`
- chart-type select → `chart.setBarType()` / `setMainIndicator()` (Heikin-Ashi, line, area, etc. map to klinecharts bar types)
- `DrawingToolbar` 26 tools → overlay-name mapping table (template `DrawingToolType` ↔ klinecharts overlay types + pro extensions)
- `IndicatorsModal` → `createIndicator()` / `removeIndicator()`
- `SymbolSearchModal` → `datafeed.searchSymbols()` → `chart.setSymbol()`
- `SnapshotModal` → pro screenshot
- pro's own drawing bar / indicator modal / symbol-search modal are disabled (`drawingBarVisible: false`, etc.) so chrome is uniform.

### D4. Real data replaces mock in `App.tsx`
Remove `generateHistoricalCandles`, `INITIAL_SYMBOLS` seeds, and the `setInterval` tick loop. New sources:
- symbol universe: `/instruments` → `SymbolInfo` (ticker/name/digits/category/base/quote)
- watchlist/tickers: `/tickers` REST snapshot + `/ws` `ticker` wildcard
- candles: `/candles/recent` history + `bitgetWs` live updates
- orderbook/trades: `/books` `/trades` REST + `/ws` `books`/`trade` (right dock OrderBookPanel/TradesTape)
- paper trading (Brokers view + BottomDock TradingPanel): `/portfolio`, `/journal`, `/order` + `/order/confirm`
- backtest (Pine Studio/StrategyTester): `/backtest` + `/jobs/{id}` polling
- alerts: `/alerts` CRUD (RightDock AlertsPanel + CreateAlertModal)

### D5. BlockBeats via backend proxy
Add `GET /api/blockbeats/newsflash/{type}` and `GET /api/blockbeats/data/{endpoint}` routes in `webapi.py` using a small HTTP client (pattern mirrors existing Bitget REST proxying). `BB_API_KEY` read from `backend/.env` (`MD_` prefix not used; key stays server-side). Frontend calls only `/api/blockbeats/*`.
- News Wire tabs map 1:1 to the 10 endpoints: `all`(`/newsflash`), `24h`, `important`, `original`, `first`, `onchain`, `financing`, `prediction`, `ai`, `stock`.
- `create_time` parsing: accept both `"Y-m-d H:i:s"` and epoch-seconds.
- `content` is HTML → strip to text for `summary`; keep `link`/`url` for "Full Article".

### D6. 11 data endpoints placement
- Data Window panel gains a "Market Pulse" section (non-symbol global metrics): `btc_etf`, daily volume, iBit/fBTC netflow, stablecoin mcap, exchange total assets, 10y treasury, `dxy`, Bitfinex longs, contract platforms, `bottom_top_indicator`.
- Heatmap view: replace crypto mock block with `top10_netflow?network=` (network selector: solana/ethereum/etc.); other mock blocks stay.

### D7. State decomposition
`App.tsx`'s 2000-line monolithic state is split into hooks/contexts so per-cell series are managed independently: `useInstruments`, `useTickerList`, `useCandles(series)`, `useOrderBook`, `useAlerts`, `usePaperAccount`. `ChartGrid`/cells consume per-cell candles, not a single shared array. This is required for real multi-symbol 2×2 layouts.

### D8. Version alignment details
- `index.html` → template's (root `#tradingview-desktop-root`), `main.tsx` → template's
- Tailwind 4 (`@tailwindcss/vite` + `@import "tailwindcss"`) replaces Tailwind 3 config
- vitest config must handle the new stack (keep `test-setup.ts`, jsdom)

## Risks / Trade-offs

- [Chart swap drops template's canvas-chart polish (drawings/replay/scale modes) unless re-mapped] → klinecharts-pro already provides drawing bar, indicators, screenshot; overlay-type mapping table in D3 covers the toolbar; replay is re-implemented against the datafeed (`lib/replayEngine`).
- [Multi-symbol live data per cell could open many WS subscriptions] → `bitgetWs` multiplexes one socket with dedup; only active visible cells subscribe (unsubscribe on cell close).
- [Template's mock-heavy views (Pine/Screener/Community/News/Brokers) still need real hooks] → wire real sources where they exist (D4); keep mock shells elsewhere (per decision).
- [BlockBeats `create_time` format inconsistency] → tolerant parser in the proxy or frontend (`time.ts` helper).
- [Large diff: deleting ~9.3k lines of UI while keeping `api/`+`lib/`] → do the copy/delete in one commit scope; keep `api/`/`lib/` tests green throughout.
- [API key exposure if proxy is bypassed] → key only in `backend/.env`; frontend never holds it.

## Migration Plan

1. Stand up the template as `frontend/src` (copy + dep promotion), delete old UI, keep `api/`+`lib/` (D1).
2. Swap chart cells to `KLineChartProView` + datafeed (D2), delete `TradingChart.tsx`.
3. Wire template toolbar → pro chart API (D3).
4. Replace mock state with real data hooks (D4, D7).
5. Add BlockBeats proxy + frontend panels (D5, D6).
6. Run typecheck, vitest, backend pytest, build; fix regressions.

Rollback: `git revert` the change commit; `frontend/vendor/tradingview-pro` remains pristine, so the template can be re-copied if the merge breaks.

## Open Questions

- Which template views are v1 "keep shell + mock" vs "wire real data" beyond the list in D4 (e.g., Community Ideas stay fully mock)?
- Whether Screener's RSI column is computed client-side from `/candles/recent` or omitted (backend has no RSI endpoint).
