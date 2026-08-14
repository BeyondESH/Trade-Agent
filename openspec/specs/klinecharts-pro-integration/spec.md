# klinecharts-pro-integration Specification

## Purpose
TBD - created by syncing change react-klinecharts-pro.

## Requirements
### Requirement: Pro 图表终端集成

系统 SHALL 基于 @klinecharts/pro（clone 至项目 vendor 本地）渲染交易所式图表终端，内置画线工具栏、周期条、指标管理、标的搜索等 chrome，并以 datafeed 契约接入后端数据。

#### Scenario: 渲染 Pro 终端

- **WHEN** React 页面挂载 KLineChartPro 包装器
- **THEN** SHALL 渲染出包含画线工具栏/周期条/指标管理的图表终端

#### Scenario: 数据接入

- **WHEN** datafeed 的 searchSymbols/getHistoryKLineData/subscribe 被调用
- **THEN** SHALL 分别对接后端端点（搜索、K 线历史、实时快照）

### Requirement: 二次开发扩展点

系统 SHALL 对 vendor 的 Pro 源码做最小改造：暴露底层 klinecharts 实例、提供 symbol/period 变更回调。

#### Scenario: 获取底层实例

- **WHEN** 外部调用 ChartPro 的 getChart()
- **THEN** SHALL 返回底层 klinecharts 实例（用于自动层/序列化）

#### Scenario: 变更回调

- **WHEN** 用户在 Pro 内切换标的或周期
- **THEN** SHALL 触发 onSymbolChange/onPeriodChange，外部可同步联动

### Requirement: 自动层叠加

系统 SHALL 通过暴露的 klinecharts 实例叠加 S/R/结构/SMC 程序化 overlay，并支持图层开关。

#### Scenario: 叠加自动层

- **WHEN** analyze/structure 数据就绪
- **THEN** SHALL 在图表上叠加 S/R 价格线、结构线段/箱体、SMC 图层

#### Scenario: 开关图层

- **WHEN** 用户切换某自动层开关
- **THEN** SHALL 对应 overlay 隐藏/显示而不影响其他图层
