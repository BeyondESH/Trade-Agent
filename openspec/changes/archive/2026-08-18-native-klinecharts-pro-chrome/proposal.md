## Why

图表区当前是"用 klinecharts-pro 内核 + 自建 TradingView 风格外壳"的重度定制:CSS 用 `display:none` 隐藏原生周期栏、`drawingBarVisible:false` 关掉原生绘图栏,再用自建 `TopNavbar`/`DrawingToolbar`/一堆弹窗 + `chartCommands`/`chartChromeBridge`(DOM click hack)去"指挥"引擎,并在其上叠加 `MultiChartGrid` 多格布局与 `chartSyncBus`/`useCellSync` 跨格同步。这层外壳带来持续的维护成本(如切周期/切币种曾因命令层丢变更失效、DOM hack 脆弱)。用户希望直接采用 klinecharts-pro **原生开箱 UI**。原生组件自带完整 chrome 与国际化(默认 `locale:'zh-CN'`),回归原生可大幅删减自建代码并让中文化"免费"。

## What Changes

- **启用原生 chrome**:图表改为最小化 `new KLineChartPro({ container, symbol, period, periods, datafeed, theme, locale:'zh-CN', timezone:'Asia/Shanghai', drawingBarVisible:true, watermark })`;显示原生绘图栏、周期栏、品种搜索、指标/时区/设置/截图弹窗。
- **BREAKING(内部)**:移除自建图表控制层与多图能力——删除 `MultiChartGrid` 多格/布局、`ChartCellPro`、`chartCommands`、`chartChromeBridge`、`lib/{chartSyncBus,cellChartSetup,useCellSync,chartSyncActions,drawingToolMap,drawingPersistence}`、`DrawingToolbar`、`ReplayBar` 与回放 state、自建 `SymbolSearchModal`/`IndicatorsModal`/`ChartSettingsModal`/`SnapshotModal`,并从 `TopNavbar` 删除图表控制段(周期/图型/指标/绘图/回放/设置/截图/布局)。
- **回退单图**:放弃 `1x1/2x1/1x2/2x2` 多格布局与跨格同步(十字光标/区间/绘图同步),中心图表区呈现单个原生 `KLineChartPro`。
- **保留品种双向联动(唯一必须的胶水)**:App 持有原生实例引用;外部(自选/右侧 dock)选品种 → `chart.setSymbol(ref)`;原生品种搜索选品种 → `onSymbolChange` → `setActiveSymbol` → 右侧 OrderBook/TradesTape/DataWindow 跟随。
- **datafeed 保留并增强**:继续用 `BitgetDatafeed`(对接后端 REST/WS);`searchSymbols` 结果补 `name`/`exchange` 字段,`market` 用真实 `inst.category`(不再写死 `USDT-FUTURES`);`periods` 限定后端支持粒度 `1m,5m,15m,30m,1h,4h,12h,1d`。
- **样式清理**:删除 `klinecharts-pro-theme.css` 中隐藏原生周期栏/logo 的规则;保留主题配色变量。

## Capabilities

### New Capabilities
（无新增能力；本变更为对现有图表集成能力的重构，全部通过修改现有 spec 表达。）

### Modified Capabilities
- `klinecharts-pro-chart`: 从"模板工具栏指挥 + 多格同步 + 隐藏原生 chrome"改为"原生 chrome 开箱 + 单图 + 移除自建控制层与多图同步"
- `klinecharts-pro-integration`: 从"禁用 Pro 内建 chrome、模板作为唯一指挥层"改为"启用 Pro 原生 chrome,应用只保留品种双向联动胶水与 datafeed 接入"
- `terminal-layout`: 中心图表区从"模板固定多格网格(1x1/2x1/1x2/2x2)+ 唯一活动格 + 可配置同步"改为"单个原生 klinecharts-pro 终端(自带绘图栏/周期栏)"

## Impact

- 前端删除/精简:`components/chart/{MultiChartGrid,ChartCellPro,DrawingToolbar,MultiChartGrid.test}.tsx`、`components/header/{TopNavbar 图表段, ReplayBar}.tsx`、`components/modals/{SymbolSearch,Indicators,ChartSettings,Snapshot}Modal.tsx`、`lib/{chartCommands,chartChromeBridge,chartSyncBus,chartSyncActions,cellChartSetup,useCellSync,drawingToolMap,drawingPersistence}.ts` 及其测试。
- 前端保留/修改:`components/chart/KLineChartProView.tsx`(简化为最小原生包装)、`api/datafeed.ts`(searchSymbols 字段补全、periods)、`App.tsx`(移除图表/回放/布局 state 与自建弹窗,保留品种联动)、`index.css`/`klinecharts-pro-theme.css`(清理隐藏规则)。
- vendor 不变:`frontend/vendor/klinecharts-pro` 作为原生引擎与 chrome 来源(默认中文)。
- 测试:更新/删除受影响的前端单测(chartSyncBus/cellChartSetup/chartChromeBridge/MultiChartGrid 等);新增/调整 datafeed 与品种联动相关测试。
- 后端不受影响。
