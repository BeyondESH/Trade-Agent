## MODIFIED Requirements

### Requirement: 定时快照 WebSocket

系统 SHALL 提供客户端驱动的 WebSocket 订阅端点，替代原定时快照推送：客户端发送 `{"op":"subscribe","args":[{"channel":"<channel>","category":"<category>","symbol":"<symbol>","timeframe":"<timeframe>"}]}` / `{"op":"unsubscribe",...}` 帧订阅或退订频道，系统按帧回推 `{"channel":..., "category":..., "symbol":..., "timeframe":..., "action":"snapshot|update", "data":...}`；订阅键 SHALL 为完整 4 元组 `(channel, category, symbol, timeframe)`，同 symbol 不同周期的订阅 SHALL 独立并存。支持行情、订单簿、成交、标记价格、资金费率等频道，并为 K 线图表保留 `snapshot`（最新 K 线 + 指标 + Top-N S/R + 组合浮盈）推送能力。K 线 `snapshot` 频道的客户端 MUST 在断线后自动重连并按原参数重订阅，且 MUST 对外暴露连接状态（实时 / 重连中 / 断开）。K 线 `update` 帧 SHALL 由实时 bar 事件驱动（~1 秒节流）推送，而非定时轮询；`update` 帧 SHALL 只携带 `last_candle` 与 `price`，指标与 Top-N S/R 由 `snapshot` 帧及低频周期快照（约每 5 秒）提供。心跳 SHALL 使用 Bitget 官方纯字符串 `ping`/`pong` 格式。

#### Scenario: 订阅协议生效

- **WHEN** 客户端发送 `subscribe` 帧指定 channel、category、symbol 与 timeframe
- **THEN** 系统 SHALL 回复确认并开始推送该 series 数据

#### Scenario: 快照优先

- **WHEN** 新订阅方首次订阅某 series
- **THEN** 系统 SHALL 先推送 `action:"snapshot"` 完整状态，后续推送 `action:"update"` 增量

#### Scenario: 定时快照兼容保留

- **WHEN** 客户端订阅 K 线快照 series
- **THEN** 系统 SHALL 按事件驱动方式推送最新 K 线（~1 秒节流），并按低频周期（约每 5 秒）推送指标末值、Top-N S/R 与组合浮盈

#### Scenario: 断连清理

- **WHEN** 客户端连接断开
- **THEN** 系统 SHALL 按完整 4 元组释放其全部订阅并停止向其推送

#### Scenario: K 线快照客户端断线重连

- **WHEN** K 线快照流连接因网络或服务端关闭而断开，且非前端主动关闭
- **THEN** 客户端 SHALL 自动重连并按原 symbol/timeframe/category/interval 重订阅
- **AND** 连接状态 SHALL 在 实时 / 重连中 / 断开 之间对外更新

## ADDED Requirements

### Requirement: 同 symbol 多周期独立路由
系统 SHALL 使同一连接内 `category/symbol` 相同但 `timeframe` 不同的 candle 订阅独立路由与推送,不得互相覆盖或串流。

#### Scenario: 多周期并存推送
- **WHEN** 连接同时持有 `BTCUSDT/5m` 与 `BTCUSDT/1h` 两个 candle 订阅
- **THEN** 各自 SHALL 收到本周期粒度的 `last_candle` 与完整帧,互不干扰

#### Scenario: 周期切换不残留
- **WHEN** 客户端从 `5m` 切换到 `1h`
- **THEN** 旧 `5m` 订阅 SHALL 被注销,仅 `1h` 订阅持续接收推送
