# ai-agent-page Specification

## Purpose
TBD - created by archiving change ai-agent-page. Update Purpose after archive.
## Requirements
### Requirement: Agent 视图与桌面导航集成

系统 SHALL 提供 `agent` 视图类型,可从全局导航栏、标签栏与命令面板进入,渲染一个双 Tab 页面(深度学习量化工作台 + AI Agent 行情分析)。

#### Scenario: 导航入口

- **WHEN** 用户点击 GlobalNavRail 中的 Agent 入口
- **THEN** 系统 SHALL 打开一个标题为 "AI Agent" 的 `agent` 类型标签
- **AND** 将 AgentView 渲染为当前工作区

#### Scenario: 双 Tab 布局

- **WHEN** AgentView 渲染完成
- **THEN** 页面 SHALL 展示「深度学习量化」与「AI Agent 分析」两个 Tab,可无刷新切换
- **AND** 切换 Tab 不得丢失对方已加载的状态

#### Scenario: 页面级标的/周期隔离

- **WHEN** 用户在 AgentView 内选择标的/周期
- **THEN** 该选择 SHALL 不影响图表标签页使用的全局 activeSymbol/timeframe

