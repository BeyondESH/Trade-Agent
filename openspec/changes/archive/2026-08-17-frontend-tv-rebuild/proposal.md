## Why

The current hand-built frontend (`frontend/src`, ~9.3k lines) duplicated TradingView-style shell chrome that a vendored UI template (`frontend/vendor/tradingview-pro`, ~9.6k lines) already implements more completely. The user wants to inherit the template wholesale for all UI, swap in the battle-tested `klinecharts-pro` chart engine (which the codebase already integrates), delete all old UI components, and wire real backend data — including a new BlockBeats news/data integration.

## What Changes

- **Delete all old UI components** from `frontend/src` (layout shell, panels, chart grid, modals, custom charts). **BREAKING**: the old React 18 / Vite 5 / Tailwind 3 stack is removed.
- **Adopt the `tradingview-pro` template** as the new UI: desktop title bar, global nav rail, top navbar, drawing toolbar, right dock (8 panels), bottom dock, timebar, 8 full views, ~10 modals. Template deps (React 19 / Vite 6 / Tailwind 4) are promoted into the `frontend/` root; vitest + backend proxy infra is kept.
- **Chart engine = `klinecharts-pro`**: template `MultiChartGrid` cells render `KLineChartPro`; each cell owns one chart + one `Datafeed`. The template toolbar *commands* the pro chart via a mapping layer (decision A): TopNavbar period buttons → `chart.setPeriod()`, chart-type → `setBarType()`/`setMainIndicator()`, DrawingToolbar 26 tools → pro overlay names, IndicatorsModal → `createIndicator()/removeIndicator()`, SymbolSearchModal → `datafeed.searchSymbols()` → `chart.setSymbol()`.
- **Port non-UI data/sync layers from old frontend** (they are engine/API-level, not UI): `api/{client,bitgetWs,datafeed,types,transform}.ts` and `lib/{chartSyncBus,chartSyncActions,cellChartSetup,chartChromeBridge,drawingPersistence}.ts` + the `KLineChartProView.tsx` wrapper + `klinecharts-pro-theme.css`.
- **Replace all mock data** in `App.tsx` with real backend data: instruments/tickers/candles via REST, live candle via `/ws`, per-cell per-symbol series.
- **BlockBeats news + data** (new): backend proxy for `api-pro.theblockbeats.info`, News Wire re-categorized to all 10 newsflash endpoints, 11 data endpoints surfaced in Data Window "Market Pulse" + Heatmap.
- **Keep decorative views' shells** (Pine Studio / Screener / Community / News / Brokers) with mock where no real source exists; wire real sources where available (Screener→`/tickers`, Brokers→`/portfolio`+`/order`).

## Capabilities

### New Capabilities
- `tv-template-shell`: UI shell rebuilt on the `tradingview-pro` template; all chrome/components inherit template behavior and look.
- `klinecharts-pro-chart`: `klinecharts-pro` as the chart engine inside the template shell; template toolbar → pro chart API command mapping (period/type/indicators/drawings/symbol search).
- `blockbeats-news`: News Wire backed by BlockBeats; all 10 newsflash endpoints exposed as category tabs; backend proxy keeps the API key server-side.
- `blockbeats-data`: 11 BlockBeats data endpoints surfaced in the Data Window "Market Pulse" section and the Heatmap view (`top10_netflow` by network).

### Modified Capabilities
- `klinecharts-pro-integration`: scope changes from standalone Pro terminal to Pro embedded in the template shell; pro's own chrome (drawing bar / indicator modal / symbol search) is hidden in favor of template toolbar command mapping; `Datafeed` contract unchanged.
- `terminal-layout`: layout semantics change from draggable gridstack to the template's fixed layouts (`1x1`, `2x1`, `1x2`, `2x2`); active-cell selection retained via `multichart-active-chart`.

## Impact

- `frontend/`: full rewrite of `src/`; `package.json` upgraded (React 19, Vite 6, Tailwind 4, @vitejs/plugin-react, lucide-react, motion); `vitest` + `vite.config.ts` proxy retained; `vendor/klinecharts-pro` kept, `vendor/tradingview-pro` becomes the source of the new shell.
- `backend/src/market_data/webapi.py`: add `/api/blockbeats/newsflash/*` and `/api/blockbeats/data/*` proxy routes reading `BB_API_KEY` from env (`.env`, gitignored).
- Deleted: all old `frontend/src/components`, `frontend/src/layout`, old `App.tsx`, `frontend/src/App.test.tsx`, and dependent UI tests.
- Retained: `api/` data layer tests, `lib/` sync layer tests, chart theme css.
