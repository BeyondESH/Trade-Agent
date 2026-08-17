## Context

前端现状：React 18 + Vite + Tailwind + klinecharts-pro（vendor 0.1.1，SolidJS 渲染）+ gridstack 自由网格。规格来源：以 TradingView Supercharts/高级图表实测为准的四层拆解（骨架/区域/视觉/交互），数值可直接当设计 token 使用。

探索阶段已验证的关键可行性：

- vendor drawing-bar 本就是 **52px 竖排左栏**（`@drawing-bar-width: 52px`），与 TV 左绘图栏规格一致。
- vendor period-bar 高 **38px**，与 TV 顶栏高度一致；其内部即"38px 顶条 + [52px 绘图栏 | 图表]"结构。
- klinecharts `CandleType` 原生支持 `candle_solid / ohlc / area` → 图表形态切换无需自绘。
- klinecharts `YAxisType.Percentage / Log` 原生支持 → %/log/auto 按钮可直接做。
- klinecharts 轴宽 `size: 'auto'`、十字光标可配虚线与标签、`priceMark.last` 可做当前价 pill + 虚线。
- vendor 主题色集中在 8 个 CSS 变量（`.klinecharts-pro[data-theme=dark]`）→ 图表 chrome 一键换肤。
- 后端已有 `POST /backtest`、`POST /order`、`GET /portfolio`、`GET|PUT /chart-config` → 底部抽屉/交易面板/模板可接。
- klinecharts 9.8 **无 undo API**、**无全局 overlay 事件**、**无"枚举全部 overlay"API** → Ctrl+Z、浮动工具条、绘图持久化需自建（风险项）。

## Goals / Non-Goals

**Goals:**
- TV 五区壳布局 1:1：顶栏 / 左绘图栏 / 中心图表区 / 右栏 / 底部抽屉 / 状态栏；面板可折叠、分隔线可拖拽、中心图表吃掉剩余空间，无留白装饰。
- TV 设计 tokens 双主题（dark/light）CSS 变量实现一键切换；字号 11/12/13-14、`tabular-nums`、圆角 4/6/8、唯一阴影档落地。
- 顶栏功能全量自建：品种搜索、周期、图表类型、指标桥、模板、警报入口、布局、保存、设置、全屏、截图。
- 复用 vendor drawing-bar 重排为 TV 风格，不重写绘图工具集。
- 右栏 Watchlist/DOM 迁移 + 本地警报；底部抽屉 AI/回测/筛选/交易。
- 交互：右键上下文菜单、快捷键、回到最新箭头、Alt+滚轮；双轴独立缩放与浮动工具条经 spike 后定级。
- 双语 zh/en 设置切换。

**Non-Goals:**
- 不追求 TV 全量 ~100 种绘图工具（沿用 vendor ~30 种）。
- 不做真实新闻/财经日历/社交社区数据接入（右栏占位）。
- 警报仅本地存储；后端 `/alerts` 留待后续变更。
- 不改后端交易/回测逻辑，仅复用现有接口。
- 不做多图表实例间的十字光标联动（P3 起）。

## Decisions

### D1: 布局壳 = 固定五区 flex + 中心 gridstack 多图表

- `App.tsx` 从"flex-col + 全屏 gridstack"改为 TV 五区壳：`TVTopBar(38) / [左绘图栏|中心|右图标条44+面板] / TVBottomDock / TVStatusBar(28)`。
- gridstack 仅保留在中心区，供"布局"按钮切换 1/2/3/4/6/8 多图表网格；现有 `DEFAULT_LAYOUT` 改造为多图表预设。
- 面板间用 1px `#2A2E39` 分隔线，无阴影无卡片；右栏宽 260-500 可拖，底部抽屉展开 30-40vh 可拖，均自建 drag handle。
- 理由：TV 是"固定四边框 + 可折叠面板"，自由网格破坏专业终端的确定感。

### D2: vendor chrome = 隐藏周期条 + DOM click 桥

- `.klinecharts-pro-period-bar` 用 CSS `display:none` 隐藏，`.klinecharts-pro-content` 高度改为 100%。
- 自建顶栏直接调 `chartRef.setSymbol / setPeriod` 切换品种/周期。
- 指标/时区/设置/截图弹窗：程序化 `.click()` vendor 隐藏按钮，白拿现成弹窗，避免重写（vendor 弹窗在隐藏 DOM 上仍可编程触发）。
- 风险：依赖 vendor 内部 DOM 结构与类名；升级需回归桥接选择器（集中在 `lib/chartChromeBridge.ts` 单一文件）。

### D3: 视觉语言 = CSS 变量双主题

- 全部 tailwind 颜色 token 指向 `--tv-*` CSS 变量；`data-theme="dark|light"` 一键切换，尺寸/布局不变。
- klinecharts-pro 8 个 `--klinecharts-pro-*` 变量在覆盖层同步映射 TV 色；klinecharts `setTheme('light'|'dark')` + styles 跟随主题。
- 涨跌色 `#089981 / #f23645`、强调 `#2962FF` 两主题不变；组件内硬编码色（OrderBook `rgba(234,57,67,…)` 等）全部清除。
- 字体栈：`-apple-system, BlinkMacSystemFont, 'Trebuchet MS', Roboto, Ubuntu, sans-serif`；全局 `font-variant-numeric: tabular-nums` 兜底 + `.tnum` 工具类。

### D4: 图表画布增强 = klinecharts 原生能力 + 自建 DOM 浮层

- legend、状态栏、右键菜单、快捷键、%/log 按钮、回到最新箭头 = 自建 DOM 叠加层，不改 vendor SolidJS 源码。
- 成交量贴底半透明 = `createIndicator('VOL', true, { id: 'candle_pane' })` 叠加主图 + 半透明样式（PaneOptions.height 控高）。
- 当前价 pill + 虚线 = `candle.priceMark.last` styles；时间轴 28px = `xAxis.size`；价格轴自适应 = `yAxis.size: 'auto'`。
- 水印 = klinecharts 水印 styles，文本 `BTCUSDT · 15 · Bitget`，3-5% 不透明度。

### D5: 警报先本地存储

- `lib/alertsStore.ts`：localStorage CRUD（symbol/条件/阈值/触发状态），基于 `useTickerList` 最新价轮询触发，触发后高亮 + 系统通知（可选）。
- `api/client.ts` 预留 `/alerts` 接口形状；后端实现放后续变更。

### D6: 双语 i18n

- `lib/i18n.ts`：`t(key)` 字典 + 设置项切换，持久化 localStorage。
- 自建组件文案全部走 `t()`；vendor 弹窗 locale 通过 pro `setLocale('zh-CN'|'en-US')` 同步。

## Risks / Trade-offs

- **[高风险] 浮动工具条 / 绘图专属右键菜单**：klinecharts 无全局 overlay 事件，vendor 创建的 overlay 无 `onSelected/onRightClick` 回调。Spike：验证创建后改写 `overlay.onSelected` 是否在事件派发时读取生效；否则注册自定义 overlay 模板包装创建路径。
- **[中风险] DOM click 桥对 vendor 内部 DOM 的耦合**：集中在单一桥文件，升vendor 后回归。
- **[中风险] 绘图持久化**：无枚举 overlay API；自建注册表（受控 `createOverlay` 统一记录）+ localStorage 序列化，vendor 创建的 overlay 需桥接捕获。
- **[低风险] 双轴独立缩放**：无原生 API；P2 用轴区域 wheel/拖拽 + `setVisibleRange` 近似，未达标则隐藏该按钮。
