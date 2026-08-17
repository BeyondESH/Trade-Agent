## Why

前端当前是 OKX 风格的自由拖拽网格终端（gridstack 四面板 + Binance 色系 #0b0e11/#f0b90b），与目标 TradingView 专业图表界面存在系统性差距：布局骨架是"自由网格"而非 TV 的"固定四边框 + 中心画布"；设计 tokens 非 TV 色系；顶栏（品种搜索/周期/图表类型/指标/警报/布局）、右侧栏（Watchlist/DOM/警报）、底部抽屉（回测/筛选/交易终端）三大功能区整体缺失。

本次以"视觉 + 布局 1:1、功能保核心"为目标，将终端重构为 TradingView（Supercharts/高级图表）的布局骨架、区域结构、视觉语言与核心交互；复用 klinecharts-pro 现成的 52px 竖排绘图栏与 38px 周期条，把改动集中在壳层与自建组件。

## What Changes

- **布局壳**：`App.tsx` 从 gridstack 全屏网格改为 TV 五区壳（顶栏 38px / 左绘图栏 52px / 中心图表区 / 右图标条 44px + 面板 260-500px / 底部抽屉 30px→30-40vh / 状态栏 28px）；gridstack 降级为仅中心区多图表网格（1/2/3/4/6/8）。
- **视觉语言**：设计 tokens 换血为 TV 色表（dark #131722/#1e222d/#2a2e39/#2962ff/#089981/#f23645，light 同尺寸仅换色），CSS 变量实现一键换肤；字体栈、字号 11/12/13-14、`tabular-nums`、圆角 4/6/8、唯一阴影 `0 2px 8px rgba(0,0,0,.4)`；覆盖 klinecharts-pro 8 个 CSS 变量完成图表 chrome 换肤。
- **顶栏（自建全宽 38px）**：品种搜索下拉（复用 `useTickerList`）、周期切换（`chartRef.setPeriod`）、图表类型（`CandleType`）、指标（DOM.click 桥接 vendor 弹窗）、模板/警报/布局/保存/设置/全屏/截图/账户。
- **左绘图栏**：复用 vendor drawing-bar 重排为 TV 风格 52px 竖排；P2 补齐光标项与底部收藏区。
- **图表画布**：左上 legend 浮层（OHLC + 指标行 + hover 图标组）、价格轴当前价 pill + 虚线、%/log/auto 按钮、时间轴 28px、十字光标虚线 + 双轴标签、成交量贴底 20% 半透明叠加、水印 3-5%。
- **右栏**：44px 图标条（Watchlist/Alerts/Data Window/DOM/OrderBook/Broker）+ 可折叠 260-500px 面板；MarketList → Watchlist、OrderBook + TradesTape → DOM。
- **底部抽屉**：AI 分析（现有）/ 回测（`/backtest`）/ 筛选器（MarketList 全屏）/ 交易面板（`/order` `/portfolio`）。
- **状态栏 28px**：时区、交易所时钟、数据延迟 badge、快照、全屏、布局比例；吸收原 TickerBar 的行情信息。
- **警报**：先做本地存储版（CRUD + 最新价触发），后端 `/alerts` 留待后续变更。
- **交互**：右键上下文菜单、快捷键（`,`/Alt+T/1/5/15）、选中绘图浮动工具条（spike 后定）、"回到最新"箭头、Alt+滚轮快速缩放。
- **双语**：zh/en 文案字典，设置中切换，vendor 弹窗 locale 同步。

## Capabilities

### New Capabilities

- `topbar-controls`: 全局顶栏（品种搜索/周期/图表类型/指标桥/模板/警报/布局/保存/设置/全屏/截图）。
- `right-sidebar`: 右图标条 + 可折叠面板（Watchlist/DOM/Alerts/Data Window/News）。
- `bottom-dock`: 底部抽屉 Tab（AI 分析/回测/筛选器/交易面板）。
- `alerts-local`: 本地存储警报（CRUD + 价格触发 + 提醒）。
- `terminal-interactions`: 右键菜单、快捷键、浮动工具条、回到最新、双轴缩放。

### Modified Capabilities

- `terminal-layout`: 由"顶栏+左市场+中图表+右下单+底 Tab"的 OKX AppShell 改为 TV 五区壳（固定四边框 + 中心画布，面板可折叠、分隔线可拖拽、中心吃剩余空间）。
- `design-system`: 由 OKX 色系 tokens 改为 TV 色表双主题；字体/字号/tabular-nums/圆角/阴影规范落地；新增渐进式披露（progressive disclosure）与双语切换。
- `charting`: 在 K 线渲染基础上新增 legend 浮层、坐标轴规范、十字光标、成交量贴底半透明叠加等画布增强要求。
- `chart-theming`: 由 OKX 配色改为 TV 配色（涨 #089981/跌 #f23645/强调 #2962ff），水印由"可移除"改为"低透明度 TV 文本水印"。

## Impact

- `frontend/src/App.tsx`：重构为 TV 五区壳，移除全屏 gridstack 网格。
- 新增 `frontend/src/layout/`（TVTopBar/TVRightSidebar/TVBottomDock/TVStatusBar）与 `frontend/src/components/{topbar,sidebar,dock}/*`。
- `frontend/src/lib/gridStackLayout.tsx`：限定中心区多图表网格。
- 新增 `frontend/src/lib/chartChromeBridge.ts`（隐藏 vendor period bar + DOM click 桥）、`frontend/src/lib/i18n.ts`（双语字典）、`frontend/src/lib/alertsStore.ts`（本地警报）。
- `frontend/tailwind.config.js`、`frontend/src/index.css`：TV 色表双主题 CSS 变量，替换全部硬编码色。
- `frontend/src/components/{market,orderbook,derivative,chart}/*`：配色 token 化、`tabular-nums`、hover 渐进披露、布局适配。
- 新增 klinecharts-pro CSS 覆盖层（8 变量映射 + period bar 隐藏 + drawing bar 重排）。
- 测试：新增 topbar/right-sidebar/bottom-dock/alerts/design-system 单测；无头浏览器五区布局与交互回归。
- 不影响：后端 API、数据管道、实时 WS 通道、风控执行（仅复用现有 `/backtest`、`/order`、`/portfolio`、`/chart-config`）。
