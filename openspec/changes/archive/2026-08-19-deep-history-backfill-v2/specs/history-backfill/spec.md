## ADDED Requirements

### Requirement: 深度历史回灌（突破 90 天窗口）

系统 SHALL 支持通过 Bitget v2 REST 分页（`/api/v2/mix/market/candles` 与 `/api/v2/spot/market/candles`，`endTime` 向前翻页）回灌早于 90 天的历史 K 线并落库，使按需回灌不再受 MCP `history-candles` 接口 90 天访问窗口限制。

#### Scenario: 回灌越过 90 天窗口

- **WHEN** 后向回灌请求的 `before` 早于当前时间 90 天
- **THEN** 系统 SHALL 通过 v2 REST 以 `endTime` 向前逐页拉取更早 K 线
- **AND** 每页数据 SHALL 即时合并入本地 store（去重、按时间升序）
- **AND** `/candles` SHALL 能连续返回这些 90 天之前的数据

#### Scenario: futures 与 SPOT 使用对应端点

- **WHEN** 回灌的 category 为 `USDT-FUTURES` 等合约
- **THEN** 系统 SHALL 使用 `/api/v2/mix/market/candles` 并携带 `productType`
- **WHEN** category 为 `SPOT`
- **THEN** 系统 SHALL 使用 `/api/v2/spot/market/candles`

#### Scenario: REST 不可用时回退 MCP

- **WHEN** v2 REST 回灌持续失败（网络/HTTP 错误）
- **THEN** 系统 SHALL 回退到现有 MCP `backfill_before` 路径
- **AND** 回退路径 SHALL NOT 抛错中断请求

### Requirement: earliest_reached 仅表示真正到达交易所最早数据

系统 SHALL 仅在实际确认交易所无更早数据时标记 `earliest_reached`（前端据此停止加载）；临时性空页（接口抖动、频控、访问窗口边界）SHALL NOT 被误判为"已到最早"。

#### Scenario: 临时空页不触发终止

- **WHEN** 回灌某页返回空但并非真正的数据边界
- **THEN** 系统 SHALL 带退避重试一次该页
- **AND** 仍为空时才标记 `earliest_reached`，避免会话内永久停止该 series 回灌

#### Scenario: 真正到最早时终止

- **WHEN** 重试后分页仍为空且分页已推进至数据边界
- **THEN** 系统 SHALL 返回 `earliest_reached=True`
- **AND** 前端据此停止继续加载，不进入无限循环
