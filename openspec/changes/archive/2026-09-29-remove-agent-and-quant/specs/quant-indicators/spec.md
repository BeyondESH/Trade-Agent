# quant-indicators Specification (delta)

## REMOVED Requirements

### Requirement: 因子目录适配
**Reason**: 该要求描述 `factors.py` 预设因子目录与白名单表达式 DSL 对 `indicators.py` 输出的适配；`factors.py` 属量化研究层，已随本变更删除。
**Migration**: 无替代。`indicators.py` 本身保留，作为 AI Agent 决策上下文（`build_agent_context`）的指标来源；其上不再承载因子 DSL 适配层。
