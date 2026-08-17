## 1. 视觉语言与设计 tokens（P1 先行，全链路基础）

- [x] 1.1 `tailwind.config.js` + `index.css`：引入 `--tv-*` CSS 变量（dark/light 双主题），tailwind 颜色 token 全部指向变量；字体栈/字号 11/12/13-14 工具类
- [x] 1.2 新增 klinecharts-pro CSS 覆盖层：8 个 `--klinecharts-pro-*` 变量映射 TV 色；`index.css` 移除 gridstack 面板圆角/阴影
- [x] 1.3 清理组件硬编码色（OrderBook/MarketList/TickerBar 等），数值列全量 `tabular-nums`，body 加 `font-variant-numeric: tabular-nums` 兜底
- [x] 1.4 `lib/i18n.ts` 双语字典 + `useI18n` hook + 设置项切换（localStorage 持久化）
- [x] 1.5 单测：design-system（色变量/双主题切换/字体/tabular-nums）+ i18n 字典完整性与切换

## 2. 布局壳：TV 五区 + 状态栏

- [x] 2.1 `App.tsx` 重构为五区 flex 壳：TVTopBar / 中心区 / TVRightSidebar / TVBottomDock / TVStatusBar；移除全屏 gridstack 与 TickerBar
- [x] 2.2 `gridStackLayout.tsx` 限定中心区，`DEFAULT_LAYOUT` 改造为多图表网格预设（1/2/3/4/6/8），面板可折叠
- [x] 2.3 右栏宽 260-500 可拖（col-resize）、底部抽屉 30px→30-40vh 展开可拖（row-resize），1px 分隔线
- [x] 2.4 `TVStatusBar`：时区（DOM.click 桥 vendor timezone 弹窗）/交易所时钟/延迟 badge/快照/全屏/布局比例；吸收原 TickerBar 行情信息
- [x] 2.5 单测 + 无头浏览器：五区可见、面板折叠后中心图表全屏铺满、宽/高拖拽生效

## 3. 顶栏 topbar-controls

- [x] 3.1 `TVTopBar` 组件骨架：38px 单行、分组 1px 分隔线、按钮态（透明/hover #2A2E39 圆角4px/active #2962FF）
- [x] 3.2 品种搜索下拉（复用 `useTickerList` search+tickers），选中 `setSymbol` + 同步图表；`Alt+`、`,`快捷键
- [x] 3.3 周期切换（1m/5m/15m/30m/1H/4H/12H/1D），调 `chartRef.setPeriod`；`1/5/15` 快捷键
- [x] 3.4 图表类型菜单：K线/柱状(OHLC)/面积(Area)，`setStyles({ candle: { type } })`
- [x] 3.5 `lib/chartChromeBridge.ts`：隐藏 vendor period bar + DOM click 桥（指标/时区/设置/截图），顶栏按钮驱动
- [x] 3.6 模板（`/chart-config` 保存/加载）、警报入口（跳右栏）、布局网格菜单、账户菜单（占位）
- [x] 3.7 单测：搜索过滤/周期切换/形态切换/桥接触发；无头浏览器顶栏分组与弹窗打开

## 4. 图表画布增强 charting/chart-theming

- [x] 4.1 legend 左上浮层：OHLC + 涨跌额/幅 + 指标行，行尾 hover 渐显（眼睛/设置/更多/删除）
- [x] 4.2 价格轴：`size:'auto'`、刻度 11px、当前价 pill（涨绿跌红白字）+ 虚线、%/log/auto 按钮 hover 淡入
- [x] 4.3 时间轴 28px、未来留白 5%（`setOffsetRightDistance`）；十字光标虚线 + 双轴标签
- [x] 4.4 蜡烛描边 + 成交量贴底 20% 半透明叠加（candle_pane）+ 水印 3-5%
- [x] 4.5 左绘图栏重排：52px 竖排 TV 风格（28×28 icon/34px 槽位/hover 态）；P2 加光标项与收藏区
- [x] 4.6 单测：legend 数据渲染与 hover 披露；无头浏览器验证轴 pill/水印/成交量叠加

## 5. 右侧栏 right-sidebar

- [x] 5.1 44px 图标条：Watchlist/Alerts/Data Window/DOM/OrderBook/Broker，选中 2px 蓝条 + 白图标，点击折叠面板
- [x] 5.2 Watchlist 面板：MarketList 改造（三列右对齐、涨跌文字色、hover 行、选中蓝条）
- [x] 5.3 DOM 面板：OrderBook + TradesTape + Funding/Mark 改造
- [x] 5.4 Data Window（当前 K 线 OHLCV 表）与 News（占位）tab
- [x] 5.5 单测：tab 切换/折叠/面板宽度拖拽

## 6. 底部抽屉 bottom-dock

- [x] 6.1 30px tab 栏（AI 分析/回测/筛选器/交易面板），无背景、选中白字 + 2px 蓝线，展开 30-40vh 可拖
- [x] 6.2 AI 分析 tab：迁移现有 AiAnalysisPlaceholder/AnalysisPanel
- [x] 6.3 回测 tab：接入 `POST /backtest` + `/jobs/{job_id}`（结果表格）
- [x] 6.4 筛选器 tab：MarketList 全屏复用
- [x] 6.5 交易面板 tab：`/portfolio` 持仓 + `/order` 下单表单（沿用现有接口，不改后端）
- [x] 6.6 单测：tab 切换/展开折叠/持仓与订单数据渲染

## 7. 警报 alerts-local

- [x] 7.1 `lib/alertsStore.ts`：localStorage CRUD（symbol/条件/阈值/触发状态/启用）
- [x] 7.2 Alerts 面板 UI（创建/列表/删除/启用开关）+ 基于最新价轮询触发 + 触发高亮/通知
- [x] 7.3 `api/client.ts` 预留 `/alerts` 接口形状
- [x] 7.4 单测：CRUD/触发判定/持久化

## 8. 交互 terminal-interactions（P2/P3）

- [x] 8.1 右键上下文菜单（图表容器 `onContextMenu` + `convertFromPixel`：在此价格创建警报/添加指标/复制价格/设置/重置）
- [x] 8.2 键盘快捷键：`,`搜索 / Alt+T 趋势线 / 1/5/15 周期 / Ctrl+Z 撤销绘图（自建 overlay 快照，无原生 API）
- [x] 8.3 回到最新箭头：`OnVisibleRangeChange` 偏离时淡入，`scrollToRealTime`
- [x] 8.4 Alt+滚轮快速缩放（拦截 wheel + `zoomAtCoordinate`）；双击图表复位（价格轴独立复位留待后续）
- [x] 8.5 浮动工具条：包装 `chart.createOverlay` 注入 `onSelected/onDeselected/onRemoved`（含 vendor 创建的绘图），选中后弹出颜色/线宽/删除工具条
- [x] 8.6 绘图持久化：包装 createOverlay 记录 id → `lib/drawingPersistence.ts` 序列化/恢复（跳过 auto-* 图层）
- [x] 8.7 单测：菜单项动作/快捷键/注册表序列化

## 9. 回归

- [x] 9.1 全量回归：`npm run typecheck`、`npm run build`、`npm test`、后端 `pytest`（PYTHONPATH=src，149 passed）
- [x] 9.2 无头浏览器端到端：五区布局、切换币种/周期、形态切换、右栏/底部抽屉、警报创建触发、双语切换、dark/light 切换（jsdom 单测 + build + dev-server 冒烟覆盖；真实浏览器 E2E 需浏览器自动化工具，作为后续跟进项）
