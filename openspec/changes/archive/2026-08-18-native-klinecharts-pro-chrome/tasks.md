## 1. 原生 chrome 图表包装(单图)

- [x] 1.1 简化 `KLineChartProView.tsx`:最小化 `new KLineChartPro({ container, symbol, period, periods, datafeed, theme, locale:'zh-CN', timezone:'Asia/Shanghai', drawingBarVisible:true, watermark })`,保留主题 styles;移除 `drawingBarVisible:false`
- [x] 1.2 暴露命令式 `setSymbol`/`setPeriod`(经 ref),接收 `onSymbolChange`/`onPeriodChange` 回调;移除按 `key` 重挂载的做法(改由 setSymbol/setPeriod 驱动)
- [x] 1.3 新建单图容器组件(替代 MultiChartGrid):渲染单个 `KLineChartProView`,吃满中心图表区
- [x] 1.4 `periods` 传后端支持粒度 `[1m,5m,15m,30m,1h,4h,12h,1d]`

## 2. 品种/周期双向联动

- [x] 2.1 出向:App 选品种(自选/右侧 dock/命令面板)→ `setActiveSymbol` → `NativeChart` 经 props 驱动图表 `setSymbol`
- [x] 2.2 入向:原生 SymbolSearch → `onSymbolChange` → `setActiveSymbol`;右侧 OrderBook/TradesTape/DataWindow 跟随 `activeSymbol.id`
- [x] 2.3 周期入向:原生周期栏 → `onPeriodChange` → 更新 App `timeframe`(用于状态栏/DataWindow 展示)
- [x] 2.4 前端测试:品种双向联动(NativeChart.test.tsx:外部→图表、原生搜索→回调)

## 3. datafeed 增强

- [x] 3.1 `api/datafeed.ts` `searchSymbols` 返回项补 `name`/`exchange`,`market` 用真实 `inst.category`
- [x] 3.2 确认 `periodToTimeframe`/`getHistoryKLineData` 覆盖 `1m..1d` 且与后端 `/candles/recent` 粒度对齐
- [x] 3.3 更新/新增 `datafeed.test.ts` 相关用例(searchSymbols 字段、period 映射)

## 4. 删除自建 chrome / 多图 / 同步 / 回放

- [x] 4.1 删除 `components/chart/{MultiChartGrid,ChartCellPro,DrawingToolbar,MultiChartGrid.test}.tsx`
- [x] 4.2 删除 `components/header/ReplayBar.tsx` 与 App 回放 state/handler
- [x] 4.3 删除自建 `components/modals/{SymbolSearch,Indicators,ChartSettings,Snapshot}Modal.tsx` 及 App 中对应 open/close state 与挂载
- [x] 4.4 删除 `lib/{chartCommands,chartChromeBridge,chartSyncBus,chartSyncActions,cellChartSetup,useCellSync,drawingToolMap,drawingPersistence}.ts` 及其单测
- [x] 4.5 精简 `TopNavbar.tsx`:删除图表控制段(周期/图型/指标/绘图/回放/设置/截图/布局),保留极简品种条(品种+价+涨跌+买卖+提醒+主题)
- [x] 4.6 App 移除布局/绘图/指标/回放相关 state 与 handler

## 5. 样式清理

- [x] 5.1 删除 `klinecharts-pro-theme.css` 中隐藏原生周期栏/logo 的规则;中心容器填满高度
- [x] 5.2 图表主题配色由构造 `styles` 传入,深浅色观感一致

## 6. 集成验证与收尾

- [x] 6.1 `tsc --noEmit` 通过,无死引用(确认被删模块零引用)
- [x] 6.2 vitest 全量通过(删除失效测试、新增联动/datafeed 测试)
- [x] 6.3 `npx vite build` 生产构建成功
- [x] 6.4 前后端启动冒烟:原生绘图栏/周期栏/品种搜索/指标·时区·设置·截图弹窗可见且中文;切品种→图表+右侧联动;切周期→数据按粒度刷新;水印显示 ticker
- [x] 6.5 `openspec validate` 通过;清理残留死代码与无用导入
