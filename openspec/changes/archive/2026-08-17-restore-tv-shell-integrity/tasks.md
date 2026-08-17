# Tasks — restore-tv-shell-integrity

## 1. Restore Bitget WS data source

- [x] 1.1 Recreate `frontend/src/api/bitgetWs.ts`: public Bitget WS client with a single socket, per-`category:symbol:timeframe` subscribe/unsubscribe, candle-channel payload → `KLineData` mapping, subscription dedupe, auto-reconnect with re-subscription of all active series
- [x] 1.2 Restore `frontend/src/api/datafeed.ts` live path to use the WS client in `subscribe`/`unsubscribe` (drop legacy `connectSnapshot` from the candle path); preserve existing `suspendUpdates`, `backfill`, `prefetchDeeper`, `getHistoryKLineData`
- [x] 1.3 Confirm `suspendUpdates(true/false)` still gates cell-0 live forwarding for replay
- [x] 1.4 Restore `frontend/src/api/datafeed.test.ts` to cover: live path uses WS client (not snapshot poll), reconnect re-subscribes once, no duplicate re-delivery, suspend/resume

## 2. Restore sync-wired chart cells

- [x] 2.1 Restore sync-aware `frontend/src/components/chart/ChartCell.tsx` (participates in `cellChartSetup`/`chartSyncBus`/`chartSyncActions` via `onReady`, per-cell theme/watermark)
- [x] 2.2 Restore `frontend/src/components/chart/ChartGrid.tsx`: pass shared datafeed to cell 0 only, wire `onCellReady`/`onCellHandle`/`onActivate`, keep active-cell ring
- [x] 2.3 Verify five sync kinds (symbol/period/crosshair/range/draw) mirror per sync flag with no feedback loop; click-to-activate works
- [x] 2.4 Restore `frontend/src/components/chart/ChartGrid.test.tsx` to match

## 3. Restore ticker source

- [x] 3.1 Restore `frontend/src/hooks/useTickerList.ts` to the WS-client-backed ticker source
- [x] 3.2 Restore `frontend/src/components/market/MarketList.tsx` to match (and its test if present)
- [x] 3.3 Confirm watchlist/screener/search consume the restored ticker source (single data layer)

## 4. Verify main/sub pane + shell interactivity

- [x] 4.1 Confirm sub indicators render in a separate pane and do not overlap the candle/main pane (config verified; visual check folded into 6.1)
- [x] 4.2 Confirm right-sidebar rail buttons open/close their panels with live content (TVRightSidebar.test)
- [x] 4.3 Confirm bottom-dock tabs expand/collapse and the chart area does not overlap the dock (TVBottomDock.test)
- [x] 4.4 Confirm one working search entry (shell `SearchModal`) selects a symbol and loads correct klines (SearchModal.test)

## 5. Regression + validation

- [x] 5.1 `npm run typecheck` clean (frontend)
- [x] 5.2 `npx vitest run` green with restored tests (183 passed / 35 files)
- [x] 5.3 Backend `pytest` green (unchanged, sanity only; 155 passed via backend/.venv)
- [x] 5.4 `openspec validate restore-tv-shell-integrity` passes; the four TV changes re-validated
- [x] 5.5 Do not serve stale `frontend/dist` (built 09:44, predates restore); verification uses the dev server only

## 6. Manual verification (dev server) + safeguard

- [ ] 6.1 `npm run dev`: verify bug #1 right sidebar responds, #2 klines correct + search works, #3 bottom tabs render without overlap, #4 no periodic duplicate data, #5 main/sub panes separated
- [ ] 6.2 On green + verified, request user approval and `git add` + commit the restored files (prevent a second unrecoverable loss)
