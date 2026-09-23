## ADDED Requirements

### Requirement: 实盘平仓 reduce-only 与成交价结算

系统 SHALL 在实盘平仓时通过 MCP `order` 工具提交 reduce-only 市价单（多头持仓 `side=sell`、空头持仓 `side=buy`，`size = notional / price`），并在下单成功后按执行层统一公式结算已实现 PnL 与更新权益。结算价 SHALL 优先取 MCP 下单响应中可解析到的实际成交价；当响应不暴露成交价或无法解析时，系统 SHALL 回退使用传入的平仓价。当 MCP 平仓调用失败时，系统 SHALL NOT 移除该持仓或改动权益，并 SHALL 抛出可判别的执行层错误供调用方重试。

#### Scenario: reduce-only 平仓经 MCP 下单

- **WHEN** 实盘开启且确认通过后平掉一个存在的持仓
- **THEN** 系统 SHALL 提交 reduce-only 的 MCP `order` 市价单（多头平仓为 sell、空头平仓为 buy）
- **AND** SHALL 在下单成功后结算 PnL 并更新权益与权益峰值

#### Scenario: 优先使用 MCP 成交价

- **WHEN** MCP `order` 响应中包含可解析的实际成交价
- **THEN** 系统 SHALL 以该成交价作为平仓结算价计算 PnL

#### Scenario: 无成交价时回退传入价

- **WHEN** MCP `order` 响应不包含可解析的成交价
- **THEN** 系统 SHALL 以调用传入的平仓价作为结算价计算 PnL
- **AND** MUST NOT 因缺少成交价而失败

#### Scenario: MCP 平仓失败保留持仓

- **WHEN** 实盘平仓的 MCP `order` 调用失败
- **THEN** 系统 SHALL 保留该组合持仓且不改动 `equity`/`peak_equity`
- **AND** SHALL 抛出可判别的执行层错误
