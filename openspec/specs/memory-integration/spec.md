# memory-integration Specification

## Purpose
TBD - created by archiving change trade-memory-reflection. Update Purpose after archive.
## Requirements
### Requirement: 记忆与规则注入决策上下文

系统 SHALL 将检索到的相似交易与经验规则注入 Agent 决策上下文,且在无记忆/规则时保持上下文可用(向后兼容)。

#### Scenario: 注入记忆与规则

- **WHEN** 提供相似交易与规则
- **THEN** 增强后的上下文 SHALL 包含 memories 与 rules 字段

#### Scenario: 无记忆时兼容

- **WHEN** 无相似交易与规则
- **THEN** 上下文 SHALL 仍可用(memories/rules 为空)
- **AND** 不影响既有决策流程

