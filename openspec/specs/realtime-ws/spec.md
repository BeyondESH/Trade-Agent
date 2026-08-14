# realtime-ws Specification

## Purpose
TBD - created by archiving change web-api. Update Purpose after archive.
## Requirements
### Requirement: 定时快照 WebSocket

系统 SHALL 提供 WebSocket 端点,连接后按间隔推送准实时快照(最新 K 线、指标末值、Top-N S/R、当前组合/浮盈)。快照为定时刷新,非逐笔。

#### Scenario: 连接后收到快照

- **WHEN** 客户端连接 `/ws` 并订阅某 series
- **THEN** 系统 SHALL 推送包含 K 线/指标/S-R/组合 的快照消息

#### Scenario: 断开清理

- **WHEN** 客户端断开
- **THEN** 系统 SHALL 停止向其推送并释放资源

