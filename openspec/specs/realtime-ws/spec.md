# realtime-ws Specification

## Purpose
TBD - created by archiving change web-api. Update Purpose after archive.
## Requirements
### Requirement: 定时快照 WebSocket

系统 SHALL 提供客户端驱动的 WebSocket 订阅端点，替代原定时快照推送：客户端发送 `{"op":"subscribe","args":[{"channel":"<channel>","symbol":"<symbol>"}]}` / `{"op":"unsubscribe",...}` 帧订阅或退订频道，系统按帧回推 `{"channel":..., "symbol":..., "action":"snapshot|update", "data":...}`；支持行情、订单簿、成交、标记价格、资金费率等频道，并为 K 线图表保留 `snapshot`（最新 K 线 + 指标 + Top-N S/R + 组合浮盈）推送能力。K 线 `snapshot` 频道的客户端 MUST 在断线后自动重连并按原参数重订阅，且 MUST 对外暴露连接状态（实时 / 重连中 / 断开）。

#### Scenario: 订阅协议生效

- **WHEN** 客户端发送 `subscribe` 帧指定 channel 与 symbol
- **THEN** 系统 SHALL 回复确认并开始推送该 channel 数据

#### Scenario: 快照优先

- **WHEN** 新订阅方首次订阅某 channel
- **THEN** 系统 SHALL 先推送 `action:"snapshot"` 完整状态，后续推送 `action:"update"` 增量

#### Scenario: 定时快照兼容保留

- **WHEN** 客户端订阅 K 线快照 channel
- **THEN** 系统 SHALL 按原间隔推送最新 K 线、指标末值、Top-N S/R 与组合浮盈

#### Scenario: 断连清理

- **WHEN** 客户端连接断开
- **THEN** 系统 SHALL 释放其全部订阅并停止向其推送

#### Scenario: K 线快照客户端断线重连

- **WHEN** K 线快照流连接因网络或服务端关闭而断开，且非前端主动关闭
- **THEN** 客户端 SHALL 自动重连并按原 symbol/timeframe/category/interval 重订阅
- **AND** 连接状态 SHALL 在 实时 / 重连中 / 断开 之间对外更新

