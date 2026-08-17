## MODIFIED Requirements

### Requirement: 多频道实时行情接入

系统 SHALL 基于现有 Bitget 公共 WS 管道接入以下频道并提供按品类隔离的统一内存镜像：`ticker`、`books`、`trade`、`mark-price`、`funding-time`。镜像按 `category`（`SPOT`/`MARGIN`/`USDT-FUTURES`/`USDC-FUTURES`/`COIN-FUTURES`）分别维护，各品类使用对应 `instType` 建立订阅。

#### Scenario: 订阅 ticker 全量

- **WHEN** Hub 启动并订阅某品类的 `ticker` 频道
- **THEN** 系统 SHALL 维护该品类全量交易对的实时行情镜像，任一交易对有更新即刷新

#### Scenario: 订阅 books 全深

- **WHEN** 有客户端订阅某品类某 symbol 的 `books` 频道
- **THEN** 系统 SHALL 以快照+增量方式维护该品类下该 symbol 全深订单簿，`size="0"` 档位 SHALL 被移除

#### Scenario: books 丢包恢复

- **WHEN** 订单簿增量序列号（seq）出现断裂或超时无数据
- **THEN** 系统 SHALL 自动重新拉取全量快照以恢复一致状态，并向订阅方重新推送快照

#### Scenario: 订阅 trade 成交流

- **WHEN** 有客户端订阅某品类某 symbol 的 `trade` 频道
- **THEN** 系统 SHALL 维护该品类最近 N 笔成交的环形缓冲，并随每笔新成交推送增量

#### Scenario: 品类隔离

- **WHEN** 不同品类同时推送数据
- **THEN** 各品类镜像 SHALL 相互独立，不发生串扰

### Requirement: 引用计数订阅管理

系统 SHALL 按品类与 symbol 维护各频道的外部订阅引用计数；引用数从 0 变为 1 时向 Bitget 发起订阅，降为 0 时向 Bitget 退订，多个订阅方共享同一路 Bitget 订阅。

#### Scenario: 首个订阅方建立连接

- **WHEN** 首个前端订阅某品类某 symbol 的 `books`
- **THEN** 系统 SHALL 向 Bitget 订阅该品类频道

#### Scenario: 多个订阅方共享

- **WHEN** 多个前端同时订阅同一品类同一 symbol 的 `books`
- **THEN** 系统 SHALL 仅保持一路 Bitget 订阅并广播给所有订阅方

#### Scenario: 全部退订释放

- **WHEN** 某品类某 symbol 的订阅引用数降为 0
- **THEN** 系统 SHALL 向 Bitget 退订该频道并释放其内存镜像

### Requirement: 类交易所 WS 订阅协议

系统 SHALL 维持客户端驱动的 WebSocket 订阅协议：客户端发送 `{"op":"subscribe","args":[{"channel":"<channel>","category":"<category>","symbol":"<symbol>"}]}` / `{"op":"unsubscribe",...}` 帧订阅或退订频道；帧中 category 缺省时默认 `USDT-FUTURES`；系统按帧回推 `{"category":..., "channel":..., "symbol":..., "action":"snapshot|update", "data":...}`。

#### Scenario: 订阅协议生效

- **WHEN** 客户端发送 `subscribe` 帧指定 channel、category 与 symbol
- **THEN** 系统 SHALL 回复确认并开始推送该品类该频道数据

#### Scenario: 快照优先

- **WHEN** 新订阅方首次订阅某品类某 channel
- **THEN** 系统 SHALL 先推送 `action:"snapshot"` 完整状态，后续推送 `action:"update"` 增量

#### Scenario: 品类缺省回退

- **WHEN** 客户端订阅帧未携带 category
- **THEN** 系统 SHALL 按 `USDT-FUTURES` 处理

#### Scenario: 断连清理

- **WHEN** 客户端连接断开
- **THEN** 系统 SHALL 释放其全部订阅并停止向其推送
