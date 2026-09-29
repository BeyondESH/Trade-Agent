# strategy-proposal Specification

## Purpose
TBD - created by archiving change deep-agents-paper-loop. Update Purpose after archive.
## Requirements
### Requirement: 强类型策略契约

系统 SHALL 定义 pydantic 模型 `StrategyProposal`，字段 SHALL 至少包含：`proposal_id`、`produced_at`、`expires_at`、`symbol`、`category`、`timeframe`、`action`（`open_long|open_short|close|flat`）、`entry`（`market|limit` 及可选价格）、可选 `stop_loss`/`take_profit`、`confidence`、`horizon`、`rationale`、`evidence[]`、`provenance`。

#### Scenario: 契约形状

- **WHEN** 校验一个合法提案
- **THEN** SHALL 通过 schema 校验并保留全部字段

### Requirement: 契约不变量

系统 SHALL 在持久化前校验：`confidence ∈ [0,1]`、`expires_at > produced_at`、`action` 与 `entry.kind` 语义一致（如 `limit` 必带 `price`）、`symbol/category` 非空。

#### Scenario: 拒绝非法提案

- **WHEN** 提案 `confidence=1.5` 或 `limit` 缺少价格
- **THEN** SHALL 拒绝且不落盘

### Requirement: 提案落盘与投影

系统 SHALL 将每个合法提案落盘，并写入可查询投影，支持按时间与标的检索；落盘 MUST 记录 `provenance`（模型、prompt 版本、研究 `thread_id`）。

#### Scenario: 可检索

- **WHEN** 按标的查询历史提案
- **THEN** SHALL 返回该标的的提案列表（含时间与出处）

### Requirement: TTL 语义

提案 SHALL 携带 `expires_at`；执行层 MUST 拒绝已过期提案。

#### Scenario: 过期拒绝

- **WHEN** 执行层收到 `expires_at` 早于当前时间的提案
- **THEN** SHALL 走 fail-closed 且不下单

