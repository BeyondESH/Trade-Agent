## Context

- `frontend/src` 运行时图表已 100% 由 `@klinecharts/pro`(vendored 于 `frontend/vendor/klinecharts-pro`,默认 `dist` 经 vite alias 引入)渲染,自绘 canvas(`TradingChart`/`ChartHUD`)已无残留。
- 但引擎被自建外壳包裹:`KLineChartProView` 传 `drawingBarVisible:false` 关原生绘图栏;`klinecharts-pro-theme.css` 用 `.klinecharts-pro-period-bar{display:none}` 藏原生周期栏与 logo;`chartCommands`/`chartChromeBridge` 用命令映射 + DOM click 去驱动隐藏的原生按钮;`MultiChartGrid`+`ChartCellPro`+`useCellSync`+`chartSyncBus`+`cellChartSetup` 提供多格布局与跨格同步;`ReplayBar` 提供回放。
- 原生 `KLineChartPro({container, symbol, period, datafeed, ...})` 是单图组件,内置完整 chrome(周期栏、绘图栏、品种搜索、指标/时区/设置/截图弹窗)与 i18n(`zh-CN`/`en-US`,构造默认 `locale:'zh-CN'`),但无多图/跨格同步/回放。
- `BitgetDatafeed` 实现 `Datafeed` 契约(`searchSymbols`/`getHistoryKLineData`/`subscribe`/`unsubscribe`),对接后端 `/instruments`、`/candles/recent`、`bitgetWs(/ws)`;此层与 chrome 无关,保留复用。
- 用户已明确:采用**全原生 chrome**,并**接受回退单图、放弃多格联动与回放**。

## Goals / Non-Goals

**Goals:**
- 中心图表区呈现单个原生 `KLineChartPro`,原生绘图栏/周期栏/品种搜索/指标·时区·设置·截图弹窗全部可见可用。
- UI 语言中文(依赖原生默认 `locale:'zh-CN'`),无需为图表 chrome 单独翻译。
- 保留品种双向联动:外部选品种 → 图表切换;原生搜索选品种 → 右侧盘口/成交/数据窗口跟随。
- 删除自建图表控制层与多图/同步/回放代码及其测试,显著降低维护面。
- `datafeed` 继续对接真实后端;`periods` 与后端支持粒度对齐。

**Non-Goals:**
- 不做多图表网格、跨格十字光标/区间/绘图同步、Bar 回放(明确放弃)。
- 不改动后端。
- 不修改 vendored `klinecharts-pro` 源码(仅通过构造参数与外层容器使用它;已存在的 vendor 二次开发点 `getChart()`/`onSymbolChange`/`onPeriodChange` 沿用)。
- 不引入新的图表库或升级 klinecharts 大版本。

## Decisions

### D1. 最小化原生实例化,启用全部原生 chrome
`KLineChartProView` 简化为:创建一次 `new KLineChartPro({ container, symbol, period, periods, datafeed, theme, locale:'zh-CN', timezone:'Asia/Shanghai', drawingBarVisible:true, watermark })`;保留 styles 主题配色。移除 `drawingBarVisible:false`。symbol/period 由外部通过 `setSymbol`/`setPeriod` 命令式驱动(经组件 ref),避免用 React `key` 重挂载(原生 chrome 有内部状态,重挂载会丢失用户在原生 UI 里的操作)。

备选:保留 React `key` 按 symbol+period 重挂载——放弃,因为原生 chrome 自己管理周期/绘图/指标状态,重挂载会清空这些,且原生 `onSymbolChange`/`onPeriodChange` 已能驱动数据切换。

### D2. 单图容器取代 MultiChartGrid
中心图表区渲染单个 `KLineChartProView`;删除 `MultiChartGrid`/`ChartCellPro`/`activeCell` 逻辑与布局按钮。App 直接持有唯一图表实例引用。

### D3. 品种双向联动是唯一保留的胶水
- 出向:自选股/右侧 dock/命令面板选品种 → `handleSelectSymbol` → 图表实例 `setSymbol(toProSymbol(sym))`。
- 入向:原生 SymbolSearch 选品种 → `onSymbolChange(proSymbol)` → 映射回 App `activeSymbol` → 右侧 OrderBook/TradesTape/DataWindow(依赖 `activeSymbol.id`)跟随。
- 周期入向:原生周期栏切换 → `onPeriodChange` → 更新 App `timeframe`(用于 DataWindow/状态栏展示,不再驱动自建工具栏)。

### D4. datafeed 增强
`searchSymbols` 返回项补 `name`(取 instrument 名称)与 `exchange`,`market` 用 `inst.category` 真实分类;原生搜索列表因此更完整且切到正确 category。`periods` 传 `[1m,5m,15m,30m,1h,4h,12h,1d]`(后端 `timeframe_to_granularity` 支持集),不含后端不支持的 1s/1W/1M。

### D5. 删除自建 chrome 与相关模块(死代码清理)
删除:`chartCommands.ts`、`chartChromeBridge.ts`、`lib/{chartSyncBus,chartSyncActions,cellChartSetup,useCellSync,drawingToolMap,drawingPersistence}.ts`、`components/chart/{MultiChartGrid,ChartCellPro,DrawingToolbar,MultiChartGrid.test}.tsx`、`components/header/ReplayBar.tsx`、`components/modals/{SymbolSearch,Indicators,ChartSettings,Snapshot}Modal.tsx` 及其单测;`TopNavbar` 删除图表控制段(可保留极简品种条:品种/价/涨跌)。App 中回放/布局/绘图/指标相关 state 与 handler 一并移除。

### D6. 样式清理
删除 `klinecharts-pro-theme.css` 中 `.klinecharts-pro-period-bar{display:none}`、隐藏 logo/watermark 等规则;保留 dark/light 配色变量与 candle/crosshair 主题(可通过构造 styles 或 CSS 变量保持现有配色)。

## Risks / Trade-offs

- [丢失多格布局与跨格同步、回放] → 已与用户确认接受;若未来需要,可基于原生 `getChart()` 暴露的 klinecharts 实例另起 change 重建。
- [原生 chrome 观感与现有 TradingView 风格外壳不同] → 通过 styles/CSS 变量尽量对齐配色;接受布局差异(周期/绘图栏回到原生位置)。
- [App.tsx 大范围删改,diff 大] → 分步删除并每步 `tsc --noEmit`+vitest 保绿;删除测试与被删模块同批提交。
- [原生 SymbolSearch 的 `searchSymbols` 契约与右侧联动字段映射不一致] → D3/D4 明确入出向映射与字段补全,新增联动测试覆盖。
- [i18n 依赖原生默认 zh-CN] → 显式传 `locale:'zh-CN'`,不依赖隐式默认;若需切换语言另配。
- [vendored dist 通过 vite alias 引入,`locale` 生效路径] → 构造参数 `locale` 直达 `ChartProComponent`,已验证默认即 zh-CN,风险低。

## Migration Plan

1. 简化 `KLineChartProView`(原生 chrome、locale、periods、onSymbolChange/onPeriodChange 回调),单图容器替换 MultiChartGrid。
2. 接品种双向联动;增强 datafeed searchSymbols 字段与 periods。
3. 删除自建 chrome/多图/同步/回放模块与自建弹窗,精简 TopNavbar,清理 App state。
4. 清理 CSS 隐藏规则;跑 typecheck + vitest + build,修回归。

Rollback：本 change 为一次性提交范围;`git revert` 即可恢复自建外壳。vendored `klinecharts-pro` 未改,回滚无副作用。

## Open Questions

- TopNavbar 是否完全删除,还是保留一条极简品种条(品种+价+涨跌)？（proposal 倾向保留极简品种条）
- 主题配色是走原生 styles 构造参数,还是继续用 CSS 变量覆盖？（倾向 styles 构造参数,减少对隐藏规则的依赖）
