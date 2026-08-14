## ADDED Requirements

### Requirement: Agent 决策与循环端点

系统 SHALL 提供 Agent 决策(只出建议,不下单)与一次纸面循环(记忆增强 + 经风控执行)的端点,以及组合与交易日志查询。

#### Scenario: 只出决策

- **WHEN** 请求 `agent/decide`
- **THEN** 系统 SHALL 返回结构化决策(action/side/reference_price/reason)
- **AND** 不产生任何下单

#### Scenario: 纸面循环

- **WHEN** 请求 `agent/cycle`(纸面)
- **THEN** 系统 SHALL 执行一次记忆增强循环并返回结果(经风控闸门)

#### Scenario: 组合与日志

- **WHEN** 请求 portfolio / journal
- **THEN** 系统 SHALL 返回当前持仓/权益与历史交易记录
