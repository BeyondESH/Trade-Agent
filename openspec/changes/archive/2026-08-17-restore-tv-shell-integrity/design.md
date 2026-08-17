## Context

A mid-session external revert left the repo in a "stitched" state: the new TV
shell (top bar, right sidebar, bottom dock, search modal, replay, alerts) sits on
top of a reverted chart core. Concretely, on disk right now:

- `api/bitgetWs.ts` is **deleted**.
- `api/datafeed.ts` fell back to the legacy `connectSnapshot` (`/ws` 5s snapshot
  poll), keeping only the later `suspendUpdates` / backfill / prefetch additions.
- `ChartCell.tsx` is the old 74-line wrapper (no sync wiring); `ChartGrid.tsx` is
  half-reverted (keeps `activeIndex` shell, dropped crosshair/range/draw wiring).
- `useTickerList.ts` / `MarketList.tsx` reverted to the snapshot-backed source.
- `datafeed.test.ts` / `ChartGrid.test.tsx` and the ticker tests reverted too, so
  `typecheck` + `vitest` are green **against the reverted tree** — the tests were
  rolled back with the code.

These changes are uncommitted; `git stash` is empty and the reflog shows no
recovery point, so git cannot restore them. The intact pieces (App shell, sync
trio `chartSyncBus`/`chartSyncActions`/`cellChartSetup`, replay, alerts, all
backend routes) already assume the WS-client data layer, which is why five bugs
surfaced: dead right sidebar, wrong klines + broken search, bottom-tab overlap,
periodic duplicate data, and main/sub pane overlap.

**Constraint:** the full content of `datafeed.ts`, `datafeed.test.ts`,
`ChartCell.tsx`, `ChartGrid.tsx`, and `ChartGrid.test.tsx` was read earlier in
this working session, so those can be reconstructed verbatim. `bitgetWs.ts` was
only referenced, not fully read, so it must be reconstructed from its consumption
contract in `datafeed.ts` + the Bitget public WS API.

## Goals / Non-Goals

**Goals:**
- Restore a single Bitget-WS-backed live candle data source and remove the
  legacy snapshot poll from the candle path.
- Restore sync-wired `ChartCell` / `ChartGrid` so multi-chart sync + active cell
  work against `chartSyncBus`/`chartSyncActions`/`cellChartSetup`.
- Restore the WS-client ticker source (`useTickerList` / `MarketList`).
- Restore the regressed tests so the suite proves conformance, not the reverted
  state.
- Confirm the five bugs are gone via the dev server; keep the intact shell,
  replay, alerts, and backend untouched.

**Non-Goals:**
- No spec-level requirement changes to `charting`, `realtime-ws`,
  `exchange-data-hub`, `multi-market-hub`, etc. — this restores conformance only.
- No new features, no backend changes, no replay/alerts changes.
- Not rebuilding or serving `frontend/dist`.

## Decisions

### D1. Reconstruct from session-read content, not from git
The reverted files were read in full earlier this session, so reconstruct
`datafeed.ts`, `datafeed.test.ts`, `ChartCell.tsx`, `ChartGrid.tsx`,
`ChartGrid.test.tsx` from that content. **Alternative considered:** `git` /
editor local-history recovery — rejected because the changes were never committed
(reflog + empty stash confirm nothing to recover).

### D2. Rebuild `bitgetWs.ts` from its consumption contract
`bitgetWs.ts` was deleted and not fully read, so rebuild it to satisfy exactly
what `datafeed.ts` calls: a WS client that subscribes/unsubscribes per
`category:symbol:timeframe`, maps Bitget candle channel payloads to `KLineData`,
dedupes subscriptions, and auto-reconnects with re-subscription. The restored
`datafeed.test.ts` is the executable spec for this surface. **Alternative:**
re-derive from klinecharts-pro Datafeed only — insufficient, since the WS framing
(channel names, arg shape, reconnect) is Bitget-specific.

### D3. Datafeed live path = WS client; keep snapshot only where still needed
Replace `connectSnapshot` in the candle `subscribe` path with the WS client.
Preserve the already-present `suspendUpdates`, `backfill`, `prefetchDeeper`, and
`getHistoryKLineData` logic verbatim. **Alternative:** keep snapshot poll and just
throttle — rejected; it violates the single-source requirement and is the root of
bug #4 (periodic duplicate data).

### D4. Cells wire through `cellChartSetup`; cell 0 gets the shared datafeed
Restore `ChartGrid` to pass the shared datafeed to cell 0 only (others own theirs)
and to invoke the sync wiring so `onReady` cells register with the bus. Keep the
active-cell ring + `onActivate`. This is what `App.tsx` already expects
(`onCellReady`, `handleCellHandle`, `handleActivate`, sync flags).

### D5. Tests restored alongside code, then full regression
Because the current green suite reflects the reverted tree, restore the tests in
the same pass and treat a passing suite as meaningful only after both code and
tests are back. Run `typecheck` + `vitest` (frontend) and `pytest` (backend), then
`openspec validate` on all changes.

### D6. Verify via dev server; quarantine stale `dist`
`frontend/dist` is a 09:44 build predating the shell work; do not serve it.
Manual bug verification happens through `npm run dev`.

## Risks / Trade-offs

- **[Reconstructed `bitgetWs.ts` diverges from the lost original]** → Pin its
  surface to `datafeed.ts` call sites and the restored `datafeed.test.ts`; if a
  behavior isn't covered by a test or a call site, it isn't required.
- **[Green tests hide the reverted state]** → Do not trust the suite until both
  code and tests are restored; add/keep an assertion that the candle path uses the
  WS client, not the snapshot poll.
- **[Partial restore reintroduces a stitch]** → Restore the whole set
  (`bitgetWs` + `datafeed` + `ChartCell` + `ChartGrid` + `useTickerList`/
  `MarketList` + tests) in one change; verify all five bugs before archiving.
- **[Windows PowerShell corrupts Unicode source]** → Edit files containing
  `· ≥ ≤ ↓` with the edit tool / .NET UTF-8 APIs, never PS `Get/Set-Content`.
- **[Another external revert recurs]** → Commit immediately after verification
  (empty stash + no reflog point means a second loss is unrecoverable).

## Migration Plan

1. Recreate `api/bitgetWs.ts`; restore `api/datafeed.ts` live path.
2. Restore `ChartCell.tsx`, `ChartGrid.tsx` (sync-wired) + `ChartGrid.test.tsx`.
3. Restore `useTickerList.ts`, `MarketList.tsx` (+ tests) and `datafeed.test.ts`.
4. `npm run typecheck` + `npx vitest run`; `pytest` backend; `openspec validate`.
5. Dev-server verification of the five bugs.
6. On green + verified: `git add` + commit (rollback = discard the branch/edits,
   since baseline is the reverted-but-consistent tree).

## Open Questions

- Does the editor's local history hold the original `bitgetWs.ts`? If yes, prefer
  it over reconstruction and diff against the restored `datafeed.test.ts`.
- Any Bitget WS channel/precision nuance (e.g. candle channel naming per category)
  that the tests must pin beyond the reconstructed contract?

## Implementation Notes (post-implementation)

- The regression scope was narrower than first feared. On inspection, only the
  **candle live path** was broken: `bitgetWs.ts` was missing and `datafeed.ts`
  fell back to the legacy `/ws` snapshot poll (`connectSnapshot`). `ChartCell`,
  `ChartGrid`, `useTickerList`, and `MarketList` were already intact and
  consistent with the new shell (sync wiring lives in `App.tsx` via
  `setupCellChart`/`chartSyncBus`, invoked through `handleCellReady`). No edits
  were needed for those; they were verified green instead.
- Fix: recreated `bitgetWs.ts` as a single multiplexed candle WS client against
  the backend `/ws` relay (`op: subscribe/unsubscribe`, `channel: candle`), with
  per-`category:symbol:timeframe` dedupe, capped-backoff reconnect that
  re-subscribes each active series once, and suppression of unchanged-candle
  re-delivery (this is what stops the "periodic duplicate data" bug). `datafeed`
  now delegates `subscribe`/`unsubscribe` to it and forwards its status, while
  keeping `suspendUpdates`/backfill/prefetch.
- Backend was untouched (needs `backend/.venv` Python; system Python lacks numpy)
  and stays green. Manual dev-server verification of the five bugs remains 6.1,
  and the git commit safeguard remains 6.2 (both user actions).
