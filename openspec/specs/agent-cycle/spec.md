# agent-cycle Specification

## Purpose
TBD - created by archiving change automation-orchestration. Update Purpose after archive.
## Requirements
### Requirement: 记忆增强的 Agent 交易循环

系统 SHALL 提供单次 Agent 交易循环,闭合记忆-反思回路:构建上下文并**注入检索到的相似历史交易与经验规则**后再决策;开仓经风控执行;平仓时将交易与反思写入日志。循环 MUST 经风控执行层,不得绕过。

#### Scenario: 记忆注入决策

- **WHEN** 存在历史交易与规则并触发一次循环
- **THEN** 用于决策的上下文 SHALL 包含检索到的相似交易与规则

#### Scenario: 开仓经风控

- **WHEN** 决策为开仓且无同标的持仓
- **THEN** 系统 SHALL 经执行层(含风控闸门)建仓

#### Scenario: 平仓落库并反思

- **WHEN** 平掉一个持仓
- **THEN** 系统 SHALL 写入一条含盈亏与反思的已平仓交易记录
- **AND** 该记录可被后续检索命中

