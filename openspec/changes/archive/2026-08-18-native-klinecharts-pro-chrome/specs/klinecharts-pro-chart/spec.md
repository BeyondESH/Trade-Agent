## MODIFIED Requirements

### Requirement: 真实数据替换 mock
系统 SHALL 从 `App.tsx` 移除 `generateHistoricalCandles`、`INITIAL_SYMBOLS` mock 种子与 `setInterval` 模拟 tick 循环;K 线、ticker、盘口、成交 SHALL 全部来自后端(历史 `/candles/recent`,实时 `bitgetWs` `/ws`,盘口 `/books`,成交 `/trades`)。

#### Scenario: K 线真实加载
- **WHEN** 图表切换到新 symbol 或周期
- **THEN** SHALL 通过 datafeed 从 `/candles/recent` 拉取历史并订阅 `bitgetWs` 实时更新,图表不再出现模拟 tick

#### Scenario: 状态拆分
- **WHEN** 应用运行
- **THEN** `App.tsx` 的巨型 state SHALL 拆分为按 series 管理的 hooks/context(如 `useRealSymbols`/`useCandles(series)`/`useOrderBook`/`useTrades`),图表消费各自 series 的数据

## REMOVED Requirements

### Requirement: 图表引擎为 klinecharts-pro
**Reason**: 多格图表模型(每格一个 KLineChartPro)移除,改为单个原生 `KLineChartPro` 终端;原"每格独立图表"场景不再适用。
**Migration**: 由新增要求「图表引擎为 klinecharts-pro(单图)」取代,中心区渲染单个原生实例。

### Requirement: 模板工具栏指挥图表
**Reason**: 不再由模板工具栏(TopNavbar/DrawingToolbar/chartCommands)作为唯一指挥层驱动图表;klinecharts-pro 原生周期栏、绘图栏、指标/时区/设置/截图弹窗接管,原"周期切换/绘图工具映射/指标弹窗指挥/禁用 pro 内建 chrome"场景被原生 chrome 取代。
**Migration**: 由新增要求「启用 klinecharts-pro 原生 chrome」取代。

### Requirement: 多图表同步保留
**Reason**: 回退单图,放弃多格布局与跨格同步(十字光标/区间/绘图);`chartSyncBus`/`cellChartSetup`/`useCellSync` 等移除。
**Migration**: 中心区渲染单个原生 `KLineChartPro`;十字光标/缩放/绘图为单图内原生行为,无跨格同步需求。

## ADDED Requirements

### Requirement: 图表引擎为 klinecharts-pro(单图)
系统 SHALL 用 `klinecharts-pro`(`frontend/vendor/klinecharts-pro`,已本地 vendored)作为唯一图表引擎;模板自绘 canvas 图表(`TradingChart`/`ChartHUD`/`ActiveDrawingToolbar`)SHALL 从渲染路径中移除。中心图表区 SHALL 渲染**单个** `KLineChartPro` 实例(不再有多格网格),该实例绑定一个 `Datafeed`(历史走 `/candles/recent`,实时走 `bitgetWs`)。

#### Scenario: 单图渲染
- **WHEN** 用户打开图表视图
- **THEN** SHALL 渲染 1 个 `KLineChartPro` 实例,绑定当前 symbol 与 datafeed

#### Scenario: 移除模板自绘图表
- **WHEN** 应用渲染图表区
- **THEN** SHALL 不再挂载 `TradingChart`/`ChartHUD`,图表区完全由 klinecharts-pro 渲染

### Requirement: 启用 klinecharts-pro 原生 chrome
系统 SHALL 采用 klinecharts-pro 的**原生开箱 UI**:以最小参数实例化 `new KLineChartPro({ container, symbol, period, periods, datafeed, theme, locale:'zh-CN', timezone:'Asia/Shanghai', drawingBarVisible:true, watermark })`;原生绘图工具栏、周期栏、品种搜索、指标/时区/设置/截图弹窗 SHALL 全部可见可用。SHALL 不再用 CSS 隐藏原生周期栏,SHALL 不再传 `drawingBarVisible:false`。`periods` SHALL 限定为后端支持粒度 `1m,5m,15m,30m,1h,4h,12h,1d`。

#### Scenario: 原生绘图栏可见
- **WHEN** 图表加载完成
- **THEN** SHALL 显示 klinecharts-pro 原生左侧绘图工具栏,用户可直接创建 overlay

#### Scenario: 原生周期栏可见
- **WHEN** 图表加载完成
- **THEN** SHALL 显示 klinecharts-pro 原生顶部周期栏(含品种、周期、指标/时区/设置/截图入口),不再被 CSS 隐藏

#### Scenario: 原生弹窗可用
- **WHEN** 用户点击原生周期栏的指标/时区/设置/截图入口
- **THEN** SHALL 打开 klinecharts-pro 原生对应弹窗,以中文显示(`locale:'zh-CN'`)

#### Scenario: 周期限定后端粒度
- **WHEN** 用户在原生周期栏切换周期
- **THEN** 可选周期 SHALL 为 `1m,5m,15m,30m,1h,4h,12h,1d`,切换后 datafeed 按对应 timeframe 拉取

### Requirement: 品种与周期双向联动
系统 SHALL 保持图表与应用其余部分的品种/周期双向联动:外部(自选股/右侧 dock/命令面板)选品种 SHALL 驱动图表切换;原生品种搜索选品种 SHALL 触发 `onSymbolChange` → 更新应用 `activeSymbol` → 右侧盘口/成交/数据窗口跟随;原生周期栏切换 SHALL 触发 `onPeriodChange` → 更新应用 timeframe(用于状态栏/数据窗口展示)。

#### Scenario: 外部选品种驱动图表
- **WHEN** 用户在自选股点击 `ETHUSDT`
- **THEN** 图表 SHALL 切换到 `ETHUSDT` 并重载数据

#### Scenario: 原生搜索联动右侧面板
- **WHEN** 用户在原生品种搜索中选择 `SOLUSDT`
- **THEN** SHALL 触发 `onSymbolChange`,应用 `activeSymbol` 更新为 `SOLUSDT`,右侧订单簿/成交/数据窗口 SHALL 切换为该品种数据

#### Scenario: 原生周期切换回传
- **WHEN** 用户在原生周期栏从 `1h` 切到 `4h`
- **THEN** SHALL 触发 `onPeriodChange`,应用 timeframe 更新为 `4h`
