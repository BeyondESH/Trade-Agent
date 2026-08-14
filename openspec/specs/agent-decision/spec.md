# agent-decision Specification

## Purpose
TBD - created by archiving change ai-agent-core. Update Purpose after archive.
## Requirements
### Requirement: 左侧 S/R 决策

系统 SHALL 产出结构化决策 `{action, side, symbol, reference_price, reason, confidence}`,策略为左侧:靠近强支撑时倾向做多、靠近强压力时倾向做空/平,否则持仓不动。

#### Scenario: 近支撑做多

- **WHEN** 当前价接近一个强支撑位(在阈值内且强度达标)
- **THEN** 系统 SHALL 输出 open long,reference_price 为该支撑位,并附理由

#### Scenario: 近压力做空

- **WHEN** 当前价接近一个强压力位(在阈值内且强度达标)
- **THEN** 系统 SHALL 输出 open short,reference_price 为该压力位

#### Scenario: 无明确机会持仓不动

- **WHEN** 价格离所有强位都较远
- **THEN** 系统 SHALL 输出 hold

