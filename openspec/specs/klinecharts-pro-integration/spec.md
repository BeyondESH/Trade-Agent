# klinecharts-pro-integration Specification

## Purpose
TBD - created by syncing change react-klinecharts-pro.
## Requirements
### Requirement: Pro 图表终端集成
系统 SHALL 基于 @klinecharts/pro(clone 至项目 vendor 本地)渲染交易所式图表终端,采用其**原生开箱 UI**:Pro 内置的绘图工具条、周期条、指标管理、标的搜索、时区/设置/截图弹窗 SHALL 全部启用可见,由 Pro 自身作为图表操作的唯一 chrome;应用层 SHALL 仅保留品种/周期双向联动胶水与 datafeed 数据接入,不再提供自建指挥层(`chartCommands`/`chartChromeBridge` 已移除)。默认 `locale:'zh-CN'`,UI 中文显示。

#### Scenario: 渲染 Pro 终端
- **WHEN** React 页面挂载 KLineChartPro 包装器
- **THEN** SHALL 渲染出包含 Pro **原生**绘图工具条、周期条、指标管理的图表终端
- **AND** chrome 由 Pro 原生提供(绘图栏在左、周期栏在顶),不再隐藏其周期栏/绘图栏,也不再由模板外壳替代

#### Scenario: 数据接入
- **WHEN** datafeed 的 searchSymbols/getHistoryKLineData/subscribe 被调用
- **THEN** SHALL 分别对接后端端点(搜索、K线历史、实时快照)

#### Scenario: 中文界面
- **WHEN** 图表实例化
- **THEN** SHALL 传入 `locale:'zh-CN'`,Pro 原生 chrome 与弹窗按中文显示

### Requirement: 二次开发扩展点
系统 SHALL 对 vendor 的 Pro 源码做最小改造:暴露底层 klinecharts 实例、提供 symbol/period 变更回调;应用 SHALL 通过 `onSymbolChange`/`onPeriodChange` 实现与右侧面板/状态栏的联动。

#### Scenario: 获取底层实例
- **WHEN** 外部调用 ChartPro 的 getChart()
- **THEN** SHALL 返回底层 klinecharts 实例(用于自动化/序列化/程序化 overlay)

#### Scenario: 变更回调
- **WHEN** 用户在 Pro 原生 chrome 内切换标的或周期
- **THEN** SHALL 触发 onSymbolChange/onPeriodChange,应用据此更新 activeSymbol/timeframe 并联动右侧面板

### Requirement: 自动层叠加
系统 SHALL 通过暴露的 klinecharts 实例叠加 S/R/结构/SMC 程序化 overlay,并支持图层开关。

#### Scenario: 叠加自动层
- **WHEN** analyze/structure 数据就绪
- **THEN** SHALL 在图表上叠加 S/R 价格线、结构线段/箱体、SMC 图层

#### Scenario: 开关图层
- **WHEN** 用户切换某自动层开关
- **THEN** SHALL 对应 overlay 隐藏/显示而不影响其他图层

