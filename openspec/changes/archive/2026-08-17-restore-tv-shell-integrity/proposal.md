## Why

Mid-session, the chart data/rendering layer was externally reverted while the new
application shell (top bar, right sidebar, bottom dock, search modal, replay,
alerts) was kept. The result is a "stitched" tree: a new shell running on an old
chart core. `api/bitgetWs.ts` was deleted, `api/datafeed.ts` fell back to the
legacy `/ws` snapshot stream, and `ChartCell`/`ChartGrid` lost their multi-chart
sync wiring. These regressions are uncommitted, so git cannot recover them. This
change restores full conformance with the already-shipped `bitget-connectivity`,
`tv-parity-cleanup-shell`, `tv-multichart-sync`, and `tv-replay-and-alerts`
specs, which will resolve five user-visible bugs at once.

## What Changes

- Restore `api/bitgetWs.ts` (Bitget public WebSocket client: per-period candle
  subscription, dedupe, reconnect) — currently deleted.
- Restore `api/datafeed.ts` to drive live candles from the Bitget WS client
  instead of the legacy 5s `/ws` snapshot poll, keeping the already-present
  `suspendUpdates`/backfill/prefetch additions.
- Restore the sync-aware `ChartCell.tsx` and `ChartGrid.tsx` so cells wire into
  `chartSyncBus`/`chartSyncActions`/`cellChartSetup` (crosshair/period/symbol/
  range/draw sync, active cell, per-cell theme).
- Restore `hooks/useTickerList.ts` and `components/market/MarketList.tsx` to the
  WS-client-backed ticker source.
- Restore the corresponding regressed tests (`datafeed.test.ts`,
  `ChartGrid.test.tsx`, `useTickerList`/`MarketList` tests) to match.
- Verify main/sub indicator pane separation and single-source live updates so the
  five reported bugs (dead right sidebar, wrong klines + broken search, bottom-tab
  overlap, periodic duplicate data, main/sub pane overlap) are gone.
- Mark the stale `frontend/dist` build as not-to-be-served; verification is via
  `npm run dev`.

## Capabilities

### New Capabilities
- `chart-shell-integrity`: Integration invariants that keep the new terminal
  shell and the chart core mutually consistent — a single live-candle data
  source (Bitget WS), sync-wired multi-chart cells, one symbol-search entry
  point, and separated main/sub indicator panes. Guards against a shell/core
  version mismatch reintroducing these regressions.

### Modified Capabilities
<!-- None. This change restores code conformance to existing specs
     (charting, klinecharts-pro-integration, realtime-ws, exchange-data-hub,
     multi-market-hub, tv-multichart-sync); no spec-level requirements change. -->

## Impact

- **Frontend code**: `src/api/bitgetWs.ts` (recreate), `src/api/datafeed.ts`,
  `src/api/datafeed.test.ts`, `src/components/chart/ChartCell.tsx`,
  `src/components/chart/ChartGrid.tsx`, `src/components/chart/ChartGrid.test.tsx`,
  `src/hooks/useTickerList.ts`, `src/components/market/MarketList.tsx` (+ tests).
- **Unaffected (verified intact)**: `App.tsx`, top bar / right sidebar / bottom
  dock / search modal / icons, replay engine, alerts full chain, sync trio
  (`chartSyncBus`/`chartSyncActions`/`cellChartSetup`), all backend routes.
- **Build artifacts**: `frontend/dist` is stale (09:44 build); do not serve it —
  verify through the dev server.
- **Risk**: recreated `bitgetWs.ts` has no git or test snapshot to diff against;
  it must be reconstructed from the WS subscription contract and covered by
  restored `datafeed.test.ts`.
