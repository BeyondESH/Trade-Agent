# chart-shell-integrity Specification

## Purpose
TBD - created by archiving change restore-tv-shell-integrity. Update Purpose after archive.
## Requirements
### Requirement: Single live-candle data source

The datafeed SHALL drive live candle updates from the Bitget public WebSocket
client (`api/bitgetWs.ts`), not from the legacy `/ws` snapshot poll. There SHALL
be exactly one live candle stream per distinct `category:symbol:timeframe`, shared
across all subscribers, so identical data is never re-delivered on a fixed poll
interval.

#### Scenario: Live updates come from the WS client

- **WHEN** a chart subscribes to a symbol/period
- **THEN** the datafeed opens (or reuses) a Bitget WS subscription for that
  `category:symbol:timeframe` and forwards each candle update to the chart
- **AND** it does not open a periodic snapshot poll for the same series

#### Scenario: No duplicate periodic re-delivery

- **WHEN** the market is quiet and no new trade occurs
- **THEN** the datafeed does not push an identical candle to the chart on a timer
- **AND** the same candle payload is not re-emitted while its bucket is unchanged

#### Scenario: Reconnect without duplicate subscriptions

- **WHEN** the WS connection drops and reconnects
- **THEN** the client re-subscribes each active series exactly once
- **AND** stale duplicate subscriptions for the same series are not left open

#### Scenario: Replay suspends live updates

- **WHEN** replay mode calls `suspendUpdates(true)`
- **THEN** the shared datafeed stops forwarding live WS candles to cell 0
- **AND** forwarding resumes when `suspendUpdates(false)` is called on exit

### Requirement: Sync-wired multi-chart cells

Each chart cell SHALL wire into the sync fabric (`chartSyncBus`,
`chartSyncActions`, `cellChartSetup`) so that, when the corresponding sync flag is
enabled, symbol / period / crosshair / visible-range / drawing changes on the
active cell mirror to the other cells. Clicking a cell SHALL make it the active
cell.

#### Scenario: Active cell selection

- **WHEN** the user clicks a chart cell in a multi-chart layout
- **THEN** that cell becomes the active cell and top-bar actions route to it

#### Scenario: Symbol/period sync across cells

- **WHEN** the symbol or period changes on the active cell and the matching sync
  flag is on
- **THEN** the other cells update to the same symbol/period

#### Scenario: Crosshair, range, and drawing sync

- **WHEN** crosshair moves, the visible range changes, or a drawing is created/
  moved/removed on the active cell with the matching sync flag on
- **THEN** the change is mirrored to the other cells without emitting a feedback
  loop back to the source cell

### Requirement: Single symbol-search entry point

The terminal SHALL expose one working symbol-search entry point (the shell
`SearchModal`) that queries the live instrument catalog and switches the active
cell on selection. Selecting a result SHALL render the correct klines for the
chosen symbol.

#### Scenario: Search and select a symbol

- **WHEN** the user opens search and types a query
- **THEN** matching instruments from the catalog are listed
- **AND** selecting one switches the active cell's symbol and loads that symbol's
  klines

#### Scenario: No conflicting duplicate search entry

- **WHEN** the shell search modal is the search entry point
- **THEN** a second conflicting in-chart search does not leave the terminal in a
  stale or wrong-symbol state

### Requirement: Separated main and sub indicator panes

Overlay main-chart indicators SHALL render on the candle pane and sub indicators
SHALL render in their own separate pane(s); the main and sub panes SHALL NOT
visually overlap.

#### Scenario: Sub indicator gets its own pane

- **WHEN** a sub indicator (e.g. VOL as a separate study) is active
- **THEN** it renders in a distinct pane below the candle pane
- **AND** it does not overlap the main candle/price area

#### Scenario: Bottom dock does not overlap the chart

- **WHEN** the bottom dock is expanded
- **THEN** the chart area shrinks to accommodate it and the two regions do not
  overlap or intercept each other's interactions

### Requirement: Interactive shell panels

Right-sidebar rail buttons and bottom-dock tabs SHALL open their corresponding
panel with live content when clicked. A click on an already-open tab SHALL toggle
it closed.

#### Scenario: Right sidebar tab opens a panel

- **WHEN** the user clicks a right-sidebar rail button (watchlist / alerts /
  data window / DOM / broker)
- **THEN** the matching panel opens and renders live content
- **AND** clicking the same button again collapses the panel

#### Scenario: Bottom dock tab opens a panel

- **WHEN** the user clicks a bottom-dock tab (AI / backtest / screener / broker)
- **THEN** the dock expands and renders that tab's panel content
- **AND** clicking the active tab again collapses the dock

### Requirement: Shell/core version integrity

The build SHALL NOT be verified against the stale `frontend/dist` artifact.
Verification SHALL run against the dev server, and the datafeed, chart cells, and
ticker source SHALL all reference the same (WS-client) data layer so the shell and
chart core cannot drift into a mismatched state.

#### Scenario: Verify via dev server

- **WHEN** validating the restored terminal
- **THEN** verification uses `npm run dev`, not the pre-existing `frontend/dist`
  build

#### Scenario: Consistent data layer across shell and core

- **WHEN** the datafeed, `useTickerList`, and chart cells are wired
- **THEN** they all consume the Bitget WS client data layer
- **AND** none falls back to the legacy snapshot poll

