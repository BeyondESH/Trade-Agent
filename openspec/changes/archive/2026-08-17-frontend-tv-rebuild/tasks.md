## 1. 模板接管与旧 UI 清理

- [x] 1.1 将 `frontend/vendor/tradingview-pro/src/*` 复制为新的 `frontend/src/*`(保留 `api/`、`lib/`、`test-setup.ts` 中数据层/同步层文件)
- [x] 1.2 删除旧 UI 组件:`layout/`、`components/{chart,market,orderbook,panels,ai}`、旧 `App.tsx`、旧 `main.tsx`、`index.html` 及依赖它们的 UI 测试
- [x] 1.3 升级 `frontend/package.json` 至模板依赖(react@19、vite@6、tailwind@4、@tailwindcss/vite、@vitejs/plugin-react、lucide-react、motion),移除旧依赖(gridstack、klinecharts@9 若不再直接使用)
- [x] 1.4 更新 `vite.config.ts`(保留 `/api`→8000、`/ws`→8000 代理,`@tailwindcss/vite` 插件),`tsconfig.json`、`index.html`、`main.tsx` 指向模板入口
- [x] 1.5 `npm install` + `npm run lint`(tsc --noEmit)通过,确认旧 UI 引用清零(`rg "components/chart|layout/TV"` 无命中)

## 2. 图表引擎切换(klinecharts-pro)

- [x] 2.1 将旧 `KLineChartProView.tsx`、`klinecharts-pro-theme.css` 移入新 `src/components/chart/` 与 `src/styles/`
- [x] 2.2 重写模板 `MultiChartGrid.tsx`:`renderChartCell` 渲染 `KLineChartProView`(每 cell 一个 datafeed 实例),删除 `TradingChart`/`ChartHUD`/`ActiveDrawingToolbar` 引用
- [x] 2.3 删除模板 `TradingChart.tsx`、`ChartHUD.tsx`、`ActiveDrawingToolbar.tsx`、`utils/indicators.ts`(若仅被它们使用)
- [x] 2.4 确认 `datafeed.ts` 的 `Datafeed` 实现与新 `SymbolInfo`/`Period` 类型对齐,`searchSymbols` 走 `/instruments`,历史走 `/candles/recent`,实时走 `bitgetWs`
- [x] 2.5 恢复多图表同步:在 `MultiChartGrid` 上挂 `chartSyncBus`,用 `cellChartSetup` 接入每格 klinecharts 实例(十字光标/区间/绘图/活动格)

## 3. 模板工具栏指挥层映射

- [x] 3.1 `TopNavbar` 周期按钮 → 活动 cell `chart.setPeriod()`,并更新 datafeed 订阅
- [x] 3.2 图表类型(candles/line/area/heikin_ashi 等)→ `chart.setBarType()`/`setMainIndicator()`
- [x] 3.3 编写 `lib/drawingToolMap.ts`:模板 `DrawingToolType`(26 种)→ klinecharts overlay 名称映射表
- [x] 3.4 `DrawingToolbar` 点击 → 在活动 cell 启用对应 overlay 模式(含锁/隐藏/清除)
- [x] 3.5 `IndicatorsModal` → 活动 cell `createIndicator()`/`removeIndicator()`
- [x] 3.6 `SymbolSearchModal` → `datafeed.searchSymbols()` → `chart.setSymbol()` + 顶栏/状态栏联动
- [x] 3.7 `SnapshotModal` → pro 截图;`BottomTimebar` 时间范围 → datafeed 历史区间拉取
- [x] 3.8 禁用 pro 内建 chrome:`drawingBarVisible: false`,隐藏自绘指标/搜索弹窗,保持外壳统一

## 4. 真实数据接入

- [x] 4.1 编写数据 hooks:`useRealSymbols`(`/tickers`+WS ticker)、`useCandles(series)`、`useOrderBook`,替换 `App.tsx` 中 `INITIAL_SYMBOLS`/`generateHistoricalCandles`/setInterval mock(paper account 保留本地 state)
- [x] 4.2 Watchlist/RightDock:`/tickers` REST 快照 + `/ws` ticker 通配实时更新(useRealSymbols)
- [x] 4.3 OrderBookPanel 已接 `useOrderBook`(`/books`+WS books 增量);TradesTape 组件未接线(`useTrades` hook 已建)
- [x] 4.4 BottomDock TradingPanel:`/order`+`/order/confirm` 两段式下单(带 kill-switch 与风控)
- [x] 4.5 Pine Studio/StrategyTester:`/backtest` 提交 + `/jobs/{id}` 轮询,渲染真实回测结果到模板 BacktestResult 结构
- [x] 4.6 AlertsPanel:接 `/alerts` CRUD(`syncAlertsFromServer`/`mirrorAlertCreate`/`mirrorAlertDelete` 镜像)
- [x] 4.7 Screener:`/tickers` 渲染 price/change/volume;缺失字段(RSI/PE/评级)省略
- [x] 4.8 App 状态拆分验收:2x2 布局四个 cell 各展示各自 symbol 的独立 K 线(MultiChartGrid 每格 ChartCellPro)

## 5. BlockBeats News 接入

- [x] 5.1 后端 `webapi.py` 新增 `GET /api/blockbeats/newsflash/{type}` 代理(`market_data/blockbeats.py` fetch_newsflash,`api-key` 从 `BB_API_KEY` 读取),`type` 白名单 10 项
- [x] 5.2 `backend/.env.example` 补充 `BB_API_KEY=` 占位(不提交真实 key);`.gitignore` 已覆盖
- [x] 5.3 前端 `api/client.ts` 新增 `blockbeatsNews`;编写 `lib/newsfeed.ts`(create_time 双格式解析、HTML→纯文本、NEWSFLASH_TYPES 10 项)
- [x] 5.4 重写 `NewsCalendarView` News Wire tab:10 个分类 tab 一一对应端点,卡片渲染 title/summary/time/外链
- [x] 5.5 NewsCalendarView/newsfeed 测试(分类请求、HTML 剥离、时间双格式、上游错误兜底)

## 6. BlockBeats Data 接入

- [x] 6.1 后端 `GET /blockbeats/data/{endpoint}` 代理(11 端点白名单、network 参数透传、错误→400/502)
- [x] 6.2 `DataWindowPanel` 新增 "Market Pulse" 区块:`lib/marketPulse.ts` 拉取 10 个全局指标(抄底逃顶/DXY/10Y 美债/稳定币市值/BTC ETF/iBit-fBTC/交易所资产/Bitfinex 多头/合约平台/每日交易量),DXY 附 1M sparkline
- [x] 6.3 `HeatmapsView` 加密区块接 `top10_netflow?network=`(network 切换 solana/ethereum/bsc/base/arbitrum/ton),净流入正负/大小驱动颜色与方块,其余股票 mock 保留
- [x] 6.4 测试:后端 `tests/test_blockbeats.py`(代理带 key 转发、network 透传、400/502)、前端 `lib/marketPulse.test.ts`(flatten/extract/parseNetflow/请求与容错)

## 7. 集成验证与收尾

- [x] 7.1 `npm run lint` + vitest 全量通过(数据层/同步层测试保持绿)
- [x] 7.2 后端 pytest 通过(含新 blockbeats 代理测试)
- [x] 7.3 `npx vite build` 生产构建成功
- [x] 7.4 前后端启动,浏览器端到端冒烟:图表 K 线真实、多格多 symbol、下单走 `/order/confirm`、News Wire 10 分类可切换、Market Pulse/Heatmap 有真实数据
- [x] 7.5 `openspec validate` 通过;清理残留 mock 引用与死代码
