# live-safety Specification

## Purpose
TBD - created by archiving change execution-engine. Update Purpose after archive.
## Requirements
### Requirement: 默认纸面

系统 SHALL 默认以纸面交易运行;未显式开启实盘时,所有订单 MUST 走纸面撮合,不触及真实账户。

#### Scenario: 默认走纸面

- **WHEN** 未开启实盘即下单
- **THEN** 系统 SHALL 在纸面执行
- **AND** 不调用交易所下单

### Requirement: 实盘需显式开启与二次确认

系统 SHALL 要求实盘执行同时满足「显式开启实盘」与「二次确认通过」;任一不满足 MUST 拒绝执行且不下单。实盘下单 MUST 经由 `bitget-agent-mcp` 的 `order` 工具。

#### Scenario: 未确认拒绝

- **WHEN** 开启了实盘但二次确认未通过
- **THEN** 系统 SHALL 拒绝执行
- **AND** 不调用 MCP 下单

#### Scenario: 确认后经 MCP 下单

- **WHEN** 实盘开启且确认通过
- **THEN** 系统 SHALL 通过 MCP `order` place 提交订单(long→buy,short→sell)

