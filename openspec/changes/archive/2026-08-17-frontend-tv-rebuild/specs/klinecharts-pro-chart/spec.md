# klinecharts-pro-chart Specification

## ADDED Requirements

### Requirement: 图表引擎为 klinecharts-pro
系统 SHALL 用 `klinecharts-pro`(`frontend/vendor/klinecharts-pro`,已本地 vendored)作为唯一图表引擎;模板自绘 canvas 图表(`TradingChart.tsx`、`ChartHUD.tsx`、`ActiveDrawingToolbar.tsx`)SHALL 从渲染路径中移除。模板 `MultiChartGrid` SHALL 保留为布局外壳,每个 cell SHALL 渲染一个 `KLineChartProView`,且每个 cell SHALL 绑定独立的 `Datafeed` 实例(历史走 `/candles/recent`,实时走 `bitgetWs`)。

#### Scenario: 每格独立图表
- **WHEN** 用户切换 2x2 布局
- **THEN** SHALL 渲染 4 个 `KLineChartPro` 实例,每个绑定自己的 symbol + datafeed,数据互不串扰

#### Scenario: 移除模板自绘图表
- **WHEN** 应用渲染图表区
- **THEN** SHALL 不再挂载 `TradingChart`/`ChartHUD`,图表区完全由 klinecharts-pro 渲染

### Requirement: 模板工具栏指挥图表
系统 SHALL 采用"模板工具栏当指挥,调 klinecharts-pro API"的映射模式:
- `TopNavbar` 周期按钮 → `chart.setPeriod()`
- 图表类型切换 → `chart.setBarType()` / `setMainIndicator()`
- `DrawingToolbar` 26 种绘图工具 → klinecharts overlay 名称映射表
- `IndicatorsModal` → `chart.createIndicator()` / `removeIndicator()`
- `SymbolSearchModal` → `datafeed.searchSymbols()` → `chart.setSymbol()`
- `SnapshotModal` → pro 截图能力
klinecharts-pro 自带的绘图工具条、指标弹窗、symbol 搜索弹窗 SHALL 被禁用(`drawingBarVisible: false` 等),保证外壳观感统一。

#### Scenario: 周期切换
- **WHEN** 用户点击 TopNavbar 的周期按钮(如 1h→4h)
- **THEN** SHALL 调用活动 cell 的 `chart.setPeriod()` 并同步 datafeed 订阅

#### Scenario: 绘图工具映射
- **WHEN** 用户点击 DrawingToolbar 的水平线工具
- **THEN** SHALL 在活动 cell 的 klinecharts 实例上启用对应 overlay 创建模式

#### Scenario: 指标弹窗指挥
- **WHEN** 用户在 IndicatorsModal 增删指标
- **THEN** SHALL 在活动 cell 上调用 `createIndicator()`/`removeIndicator()`,而非模板 canvas 指标

#### Scenario: 禁用 pro 内建 chrome
- **WHEN** 渲染 klinecharts-pro 图表
- **THEN** SHALL 隐藏其自带的绘图工具条/指标弹窗/symbol 搜索,只暴露底层图表与 datafeed

### Requirement: 多图表同步保留
系统 SHALL 通过复用的 `lib/chartSyncBus`、`cellChartSetup`、`chartChromeBridge` 在 klinecharts-pro 实例间保持十字光标、可见区间、绘图同步,并保留唯一活动格高亮;同步 SHALL 作用于各 cell 暴露的底层 klinecharts 实例。

#### Scenario: 十字光标同步
- **WHEN** 用户在 2x2 布局某格移动十字光标
- **THEN** SHALL 其余格子在同一时间戳位置显示十字光标

#### Scenario: 绘图同步
- **WHEN** 用户在某格绘制一条趋势线
- **THEN** SHALL 该绘图同步出现在其他格子(按 symbol 映射),并可通过 `drawingPersistence` 持久化

### Requirement: 真实数据替换 mock
系统 SHALL 从 `App.tsx` 移除 `generateHistoricalCandles`、`INITIAL_SYMBOLS` mock 种子与 `setInterval` 模拟 tick 循环;K 线、ticker、盘口、成交 SHALL 全部来自后端(历史 `/candles/recent`,实时 `bitgetWs` `/ws`,盘口 `/books`,成交 `/trades`)。

#### Scenario: K 线真实加载
- **WHEN** 图表切换到新 symbol
- **THEN** SHALL 通过 datafeed 从 `/candles/recent` 拉取历史并订阅 `bitgetWs` 实时更新,图表不再出现模拟 tick

#### Scenario: 状态拆分
- **WHEN** 应用运行
- **THEN** `App.tsx` 的巨型 state SHALL 拆分为按 series 管理的 hooks/context(如 `useInstruments`/`useTickerList`/`useCandles(series)`/`useOrderBook`/`useAlerts`/`usePaperAccount`),每格消费各自 series 的数据
