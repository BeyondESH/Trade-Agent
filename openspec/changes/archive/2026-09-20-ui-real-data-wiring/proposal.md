## Why

前端仍残留大量"模板外壳"时代的静态假数据与无动作控件：底部筛选器直接渲染 `INITIAL_SCREENER_ITEMS` 静态数组、订单簿 DOM 面板没有资金费率/标记价、右栏宽度写死、图表右键菜单只有 2 项；与此同时，两个已实现的实时数据 hook（`useTickerList`、`useDerivative`）**零消费**。ScreenerView 的导出/自动刷新、社区视图的筛选/评论/分享、热力图周期切换、标题栏通知跳转、设置弹窗开关等按钮均无 handler 或用假内容冒充实时数据。规格（`bottom-dock`/`right-sidebar`/`terminal-interactions`）已描述目标行为，但实现与规格漂移，且假数据会误导用户。本次把这些表面接入真实数据或移除，并建立"不得渲染无动作控件、不得以静态数据冒充实时"的通用约束。

## What Changes

- 底部筛选器 `ScreenerPanel`：接入 `useTickerList`（品类 tab、搜索、按资金费率/标记价/24h 振幅/成交量额排序），并删除 `INITIAL_SCREENER_ITEMS` 静态 mock。
- 右栏 `OrderBookPanel`：接入 `useDerivative`，在 DOM 面板展示资金费率与标记价（来源 WS `funding-time` / `mark-price`），缺失时显示占位。
- 右栏 `RightDock`：面板宽度由固定 `w-[280px] sm:w-[310px]` 改为可拖拽 260–500px 并持久化。
- 图表右键菜单 `ChartContextMenu`：补全为 5 项（创建警报 / 添加指标 / 复制价格 / 设置 / 重置视图）并绑定真实行为。
- 移除或修复无动作控件：`ScreenerView` 的 Auto-Refresh 移除、Export CSV 接真实 CSV 导出；`CommunityIdeasView` 筛选 tab 改为真实本地过滤、评论/分享按钮移除；`HeatmapsView` 未使用的 24h/1w/1m 周期切换移除；`App.tsx` 的 `onAddSymbol={() => {}}` 接符号搜索；`DesktopTitleBar` 通知下拉改为真实触发警报或空态，删除 "New Pine Script Update" 假条目与 inert "Mark all read"；`DesktopSettingsModal` 删除无落地的开关与只关闭不保存的 Save。
- 清理死 mock：删除未使用的 `INITIAL_NEWS`；`INITIAL_SCREENER_ITEMS` 随筛选器接线删除。**保留**有明确依据的静态内容：`INITIAL_CALENDAR`（无上游财经日历 API）、`HEATMAP_STOCK_ASSETS`（BlockBeats 无股票数据，`blockbeats-data` spec 已允许股票区块用 mock）、`COMMUNITY_IDEAS_DATA`（`tv-template-shell` spec 已允许无源视图使用 mock）、`BROKERS_CATALOG`（源码注释明确要求保留）。
- 明确不触碰 `handleResetPaperAccount` / `handleRunStrategy`（属另一 change 的范围）。

## Capabilities

### New Capabilities
- `ui-affordance-integrity`: 规定所有可见交互控件必须绑定真实行为（否则移除）、有真实数据源的视图必须接入真实数据、无源表面必须显式降级或标注、通知与设置不得展示伪造内容。

### Modified Capabilities
- `bottom-dock`: 「筛选器面板」要求明确 SHALL 消费实时 ticker hub（`useTickerList`），MUST NOT 使用静态 mock。
- `right-sidebar`:「订单簿 DOM 面板」补充资金费率/标记价的 WS 来源与占位约束；「图标条面板与新闻入口」的宽度拖拽明确为实时 260–500px 并持久化。
- `terminal-interactions`: 「右键上下文菜单」明确 5 项动作与各自行为（替代仅 2 项的实现）。

## Impact

- **代码**：`ScreenerPanel.tsx`、`OrderBookPanel.tsx`、`RightDock.tsx`、`ChartContextMenu.tsx`、`NativeChart.tsx`/`KLineChartProView.tsx`（暴露指标/设置/重置能力）、`ScreenerView.tsx`、`CommunityIdeasView.tsx`、`HeatmapsView.tsx`、`App.tsx`、`DesktopTitleBar.tsx`、`DesktopSettingsModal.tsx`、`data/marketData.ts` 及对应单测/e2e。
- **数据/接口**：无新增后端接口；全部复用现有 `/tickers`、`/instruments`、WS `funding-time`/`mark-price`、`/config`（宽度持久化）通道。`useTickerList` 已支持 amplitude/turnover 排序，无需新增端点。
- **行为**：筛选器与 DOM 面板显示实时值；移除若干装饰性按钮；右栏宽度可调。
- **风险**：低–中。移除按钮/元素需同步调整 e2e 与单测断言；`useTickerList` 的振幅/成交额字段需要确认 hub 已提供（否则按现状显示占位）。
