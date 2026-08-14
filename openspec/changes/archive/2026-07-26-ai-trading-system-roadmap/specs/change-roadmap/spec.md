## ADDED Requirements

### Requirement: 后续 Change 序列与依赖

系统建设 SHALL 拆分为按依赖排序的独立 change:`market-data-foundation`(1)、`indicator-structure-engine`(2)、`risk-position-management`(3)、`execution-engine`(4)、`ai-agent-core`(5)、`trade-memory-reflection`(6)、`dl-quant-engine`(7)、`automation-orchestration`(8)、`web-frontend`(9)。每个 change MUST 独立立项、独立实现与验证。

#### Scenario: 依赖顺序推进

- **WHEN** 立项某个后续 change
- **THEN** 其依赖列出的前置 change SHALL 已存在其规格与设计
- **AND** 不跳过依赖直接实现下游 change

#### Scenario: 数据地基先行

- **WHEN** 开始系统实现
- **THEN** 首个实现型 change SHALL 为 `market-data-foundation`
- **AND** 用于验证 Python↔MCP 拉数据与 Excel 导出的技术假设

### Requirement: Change 范围边界

每个后续 change SHALL 有明确的范围边界,不越界实现其它 change 的能力。

#### Scenario: 越界检测

- **WHEN** 某 change 的任务试图实现属于另一 change 范围的能力
- **THEN** 该能力 SHALL 被移出当前 change,归入其所属 change
