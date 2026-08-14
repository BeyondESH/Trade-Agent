## ADDED Requirements

### Requirement: 多频道实时行情接入

系统 SHALL 基于现有 Bitget 公共 WS 管道接入以下频道并提供统一内存镜像：`ticker`（instId:default 全量行情）、`books`（全深订单簿快照+增量）、`trade`（最新成交）、`mark-price`（标记价格）、`funding-time`（资金费率）。

#### Scenario: 订阅 ticker 全量

- **WHEN** Hub 启动并订阅 `ticker` 频道（instId:default）
- **THEN** 系统 SHALL 维护全量合约的实时行情镜像，任一合约有更新即刷新

#### Scenario: 订阅 books 全深

- **WHEN** 有客户端订阅某 symbol 的 `books` 频道
- **THEN** 系统 SHALL 以快照+增量方式维护该 symbol 全深订单簿，`size="0"` 档位 SHALL 被移除

#### Scenario: books 丢包恢复

- **WHEN** 订单簿增量序列号（seq）出现断裂或超时无数据
- **THEN** 系统 SHALL 自动重新拉取全量快照以恢复一致状态，并向订阅方重新推送快照

#### Scenario: 订阅 trade 成交流

- **WHEN** 有客户端订阅某 symbol 的 `trade` 频道
- **THEN** 系统 SHALL 维护最近 N 笔成交的环形缓冲，并随每笔新成交推送增量

### Requirement: 引用计数订阅管理

系统 SHALL 按 symbol 维护各频道的外部订阅引用计数；引用数从 0 变为 1 时向 Bitget 发起订阅，降为 0 时向 Bitget 退订，多个订阅方共享同一路 Bitget 订阅。

#### Scenario: 首个订阅方建立连接

- **WHEN** 首个前端订阅某 symbol 的 `books`
- **THEN** 系统 SHALL 向 Bitget 订阅该频道

#### Scenario: 多个订阅方共享

- **WHEN** 多个前端同时订阅同一 symbol 的 `books`
- **THEN** 系统 SHALL 仅保持一路 Bitget 订阅并广播给所有订阅方

#### Scenario: 全部退订释放

- **WHEN** 某 symbol 的订阅引用数降为 0
- **THEN** 系统 SHALL 向 Bitget 退订该频道并释放其内存镜像

### Requirement: 类交易所 WS 订阅协议

系统 SHALL 提供客户端驱动的 WebSocket 订阅协议：客户端发送 `{"op":"subscribe","args":[{"channel":"<channel>","symbol":"<symbol>"}]}`（及 `unsubscribe`），系统按帧回推 `{"channel":..., "symbol":..., "action":"snapshot|update", "data":...}`。

#### Scenario: 订阅请求生效

- **WHEN** 客户端发送 `subscribe` 帧指定 channel 与 symbol
- **THEN** 系统 SHALL 回复确认并开始推送该 channel 数据

#### Scenario: 快照优先

- **WHEN** 新订阅方首次订阅某 channel
- **THEN** 系统 SHALL 先推送 `action:"snapshot"` 完整状态，后续推送 `action:"update"` 增量

#### Scenario: 退订停止推送

- **WHEN** 客户端发送 `unsubscribe` 帧
- **THEN** 系统 SHALL 停止向该客户端推送对应 channel 数据

#### Scenario: 断连清理

- **WHEN** 客户端连接断开
- **THEN** 系统 SHALL 释放其全部订阅并将相关 symbol 引用计数减一

### Requirement: REST 快照端点

系统 SHALL 提供 REST 端点供前端初次加载：`/tickers`（全量行情）、`/books/{symbol}`（订单簿快照）、`/trades/{symbol}`（最近成交）、`/funding`（资金费率）、`/mark-price`（标记价格）、`/instruments`（合约静态规格：价格/数量精度、状态）。

#### Scenario: 加载全量行情

- **WHEN** 请求 `GET /tickers`
- **THEN** 系统 SHALL 返回全部合约的最新行情（价格、24h 涨跌幅/成交量、买一/卖一）

#### Scenario: 加载订单簿快照

- **WHEN** 请求 `GET /books/{symbol}`
- **THEN** 系统 SHALL 返回该 symbol 当前全深订单簿与序号

#### Scenario: 加载合约静态规格

- **WHEN** 请求 `GET /instruments`
- **THEN** 系统 SHALL 返回合约列表及价格精度、数量精度、上下架状态等静态信息

#### Scenario: 未订阅数据返回空

- **WHEN** 请求未订阅 symbol 的 `/books/{symbol}` 或 `/trades/{symbol}`
- **THEN** 系统 SHALL 返回空数据结构而非报错
