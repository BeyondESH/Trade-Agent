# research-ui Specification

## Purpose

前端可视化：研报浏览与执行时间线（只读）。复用现有 SSE 管线。

## ADDED Requirements

### Requirement: 研报浏览

前端 SHALL 提供研报列表与详情视图，展示提案关键字段（标的、方向、入场、止损/止盈、置信度、理由）与证据来源；SHALL 支持按标的与时间筛选。

#### Scenario: 查看研报

- **WHEN** 用户打开研报视图
- **THEN** SHALL 展示提案列表，点击 SHALL 展示详情与证据

### Requirement: 执行时间线

前端 SHALL 以 SSE 展示一次执行 run 的时间线，呈现各节点事件与最终结果（成交或 fail-closed）；连接失败 SHALL 显示错误而非空白。

#### Scenario: 观看执行流

- **WHEN** 用户打开某执行 run
- **THEN** SHALL 实时追加节点事件直至终态
- **AND** 终态为 fail-closed 时 SHALL 明确展示原因

### Requirement: 只读

研报与执行视图 MUST 为只读，MUST NOT 提供任何下单、修改提案或修改风控的交互。

#### Scenario: 无写操作

- **WHEN** 用户浏览研报与执行视图
- **THEN** MUST NOT 触发任何下单或状态修改
