# chart-terminal Specification

## Purpose
TBD - created by syncing change react-klinecharts-pro.

## Requirements
### Requirement: 基于 Pro 的图表终端

系统 SHALL 以 klinecharts-pro 为图表终端基座（内置画线工具栏、周期条、指标管理、标的搜索），并在其之上提供自动层开关与 AI 决策联动。

#### Scenario: 终端 chrome 可用

- **WHEN** 打开图表终端
- **THEN** SHALL 展示画线工具栏、周期条与指标管理入口

#### Scenario: 周期切换

- **WHEN** 用户在周期条切换周期
- **THEN** 图表 SHALL 按新周期重新加载数据并触发 onPeriodChange

#### Scenario: 标的搜索联动

- **WHEN** 用户在搜索框选择标的
- **THEN** 图表 SHALL 加载新标的并触发 onSymbolChange，外部面板联动更新

### Requirement: AI 决策联动

系统 SHALL 在终端底部区域提供 AI 分析模块占位，展示 Agent 决策（action/side/confidence/reason）、指标摘要与 S/R 候选的能力由后续 change 实现；本期仅保留占位容器，切币种/周期时保持联动数据链路预留。

#### Scenario: 底部占位渲染

- **WHEN** 终端加载
- **THEN** 底部 SHALL 渲染 AI 分析模块占位区域而不报错

#### Scenario: 联动链路预留

- **WHEN** 切换标的或周期
- **THEN** SHALL 维持 series 上下文以支持后续 AI 面板按新 series 刷新
