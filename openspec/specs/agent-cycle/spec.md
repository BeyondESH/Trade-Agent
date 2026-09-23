# agent-cycle Specification

## Purpose
TBD - created by archiving change automation-orchestration. Update Purpose after archive.
## Requirements
### Requirement: 记忆增强的 Agent 交易循环

系统 SHALL 提供单次 Agent 交易循环，闭合记忆-反思回路：构建上下文并**注入检索到的相似历史交易与经验规则**后再决策；上下文 SHALL 自动注入来自新闻管线的新闻摘要（新闻为空时上下文仍可用）；开仓经风控执行；平仓时将交易与反思写入日志，且在配置的 provider 支持文本补全时 SHALL 使用该补全生成反思（不可用或失败时 SHALL 回退启发式）。循环 MUST 经风控执行层，不得绕过。

#### Scenario: 记忆注入决策

- **WHEN** 存在历史交易与规则并触发一次循环
- **THEN** 用于决策的上下文 SHALL 包含检索到的相似交易与规则

#### Scenario: 新闻注入决策

- **WHEN** 新闻环形缓冲存在可注入条目并触发一次循环
- **THEN** 用于决策的上下文 SHALL 包含新闻摘要

#### Scenario: LLM 反思注入

- **WHEN** provider 支持文本补全且平掉一个持仓
- **THEN** 系统 SHALL 以注入的补全生成反思文本
- **AND** 补全调用失败时 SHALL 回退启发式反思

#### Scenario: 开仓经风控

- **WHEN** 决策为开仓且无同标的持仓
- **THEN** 系统 SHALL 经执行层(含风控闸门)建仓

#### Scenario: 平仓落库并反思

- **WHEN** 平掉一个持仓
- **THEN** 系统 SHALL 写入一条含盈亏与反思的已平仓交易记录
- **AND** 该记录可被后续检索命中

