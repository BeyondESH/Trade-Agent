## MODIFIED Requirements

### Requirement: 定时快照 WebSocket

系统 SHALL 提供 WebSocket 端点,连接后按间隔推送准实时快照(最新 K 线、指标末值、Top-N S/R、当前组合/浮盈)。快照为定时刷新,并包含实时 K 线增量(`last_candle`):有实时 bar 时价格取自实时收盘价,否则回退存储数据。快照非逐笔推送。

#### Scenario: 连接后收到快照

- **WHEN** 客户端连接 `/ws` 并订阅某 series
- **THEN** 系统 SHALL 推送包含 K 线/指标/S-R/组合 的快照消息

#### Scenario: 快照含实时 K 线

- **WHEN** 实时流已订阅该 series 且收到最新 bar
- **THEN** 快照 SHALL 包含 `last_candle` 字段,且价格取实时 bar 收盘价

#### Scenario: 实时缺失回退

- **WHEN** 实时流无该 series 数据或流不可用
- **THEN** 快照 SHALL 使用存储数据的价格,且不含 `last_candle`

#### Scenario: 断开清理

- **WHEN** 客户端断开
- **THEN** 系统 SHALL 停止向其推送并释放资源
