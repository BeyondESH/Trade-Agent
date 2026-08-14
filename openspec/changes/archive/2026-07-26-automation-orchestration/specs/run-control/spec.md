## ADDED Requirements

### Requirement: 运行控制与默认纸面

系统 SHALL 提供全局运行控制(启用标志 + kill-switch),默认纸面。kill-switch 打开或未启用时,自动化交易 MUST 不下单。

#### Scenario: kill-switch 阻断

- **WHEN** kill-switch 打开时触发交易循环
- **THEN** 系统 SHALL 不下单并返回停机状态

#### Scenario: 默认纸面

- **WHEN** 未显式配置
- **THEN** 运行控制 SHALL 默认纸面(paper_only)
