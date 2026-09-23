## REMOVED Requirements

### Requirement: Sync-wired multi-chart cells
**Reason**: 该 requirement 要求每个 chart cell 接入同步总线（`chartSyncBus`、`chartSyncActions`、`cellChartSetup`），但这些模块在代码中已不存在，且当前终端为单个 klinecharts-pro 实例（`NativeChart.tsx` 注释：single native chart，replaced the former multi-cell grid）。保留会诱导重建已移除的多格同步功能。
**Migration**: 无运行时迁移（能力从未实现）。单图终端的 symbol/period 由 props 声明式驱动（`KLineChartProView` 的 `setSymbol`/`setPeriod`），不存在跨格镜像；未来若引入多图，须另立 change 重新提案同步适配层。

## MODIFIED Requirements

### Requirement: Single live-candle data source

The datafeed SHALL drive live candle updates from the Bitget public WebSocket
client (`api/bitgetWs.ts`), not from the legacy `/ws` snapshot poll. There SHALL
be exactly one live candle stream per distinct `category:symbol:timeframe`, shared
across all subscribers, so identical data is never re-delivered on a fixed poll
interval. The terminal SHALL render exactly one chart instance consuming this
shared stream.

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
- **THEN** the shared datafeed stops forwarding live WS candles to the chart
- **AND** forwarding resumes when `suspendUpdates(false)` is called on exit

### Requirement: Single symbol-search entry point

The terminal SHALL expose one working symbol-search entry point (the shell
`SearchModal`) that queries the live instrument catalog and switches the chart's
symbol on selection. Selecting a result SHALL render the correct klines for the
chosen symbol.

#### Scenario: Search and select a symbol

- **WHEN** the user opens search and types a query
- **THEN** matching instruments from the catalog are listed
- **AND** selecting one switches the chart's symbol and loads that symbol's
  klines

#### Scenario: No conflicting duplicate search entry

- **WHEN** the shell search modal is the search entry point
- **THEN** a second conflicting in-chart search does not leave the terminal in a
  stale or wrong-symbol state
