## Why

`ui-i18n-zh` 规格要求"不再存在硬编码英文 UI 文案"，但多处组件仍直接硬编码中文字符串、且这些字符串的 `t()` 键在 `frontend/src/lib/i18n.ts` 中已存在（如 `Loading...`、`News feed unavailable:`、`All Loaded`、`Price`、`Size`、`Precision: 0.01`、`Order Book (DOM)`、`Day Range`、`24h Volume`），另有视图仍硬编码英文标题（Heatmaps / Community / TradingPanel 子标签），导致界面文案绕过统一字典、中英混杂、无法集中维护。

## What Changes

- 逐一把下列组件中硬编码的用户可见字符串替换为 `t()` 查找；**已存在的键直接复用**，缺失的按现有"英文键 → 中文值"字典结构新增：
  - `frontend/src/components/views/NewsCalendarView.tsx`：`加载中...`（183、229）、`新闻获取失败:`（187）、`已加载全部`（231）→ 复用 `Loading...`、`News feed unavailable:`、`All Loaded`。
  - `frontend/src/components/sidebar/NewsPanel.tsx`：`加载中...`（95）→ `Loading...`；`暂无新闻`（141）→ 复用/新增键（如 `No news`）。
  - `frontend/src/components/sidebar/OrderBookPanel.tsx`：`订单簿 (DOM)`（27）→ `Order Book (DOM)`；`精度: 0.01`（29）→ `Precision: 0.01`；`价格`（34）→ `Price`；`数量`（36）→ `Size`；`合计`（36 附近）→ `Total`；`价差:`（65）→ 复用 `Spread: 0.02 (0.01%)` 语义键或新增 `Spread:`。
  - `frontend/src/components/bottom/TradingPanel.tsx`：子标签 `Positions/Working Orders/Trade History/Broker Summary`（89-92）、`Market Close`（157）、`Cancel`（202）、`100x Cross Margin`（224）→ `t()` 键（新增缺失键）。
  - `frontend/src/components/sidebar/WatchlistPanel.tsx`：`日内区间`（145）→ `Day Range`；`24小时成交量`（171）→ `24h Volume`；`市值`（177）→ `Market Cap`。
  - `frontend/src/components/desktop/DesktopTitleBar.tsx`：`快速搜索...`（274）→ `t()`（新增键）；`Notifications`（305）→ `t()`（新增键）。
  - `frontend/src/components/views/HeatmapsView.tsx`：硬编码英文（88、106、117、162、166）→ `t()`（新增键）。
  - `frontend/src/components/views/CommunityIdeasView.tsx`：硬编码英文（57-58）→ `t()`（新增键）。
  - `frontend/src/components/timebar/BottomTimebar.tsx`：`UTC+0 (实时)`（72）→ `t()`。
- 更新受影响测试中的字符串断言（如 `NewsPanel.test.tsx`、`MarketsView.test.tsx`）。
- **范围决策**：`frontend/src/components/views/agent/**` 的硬编码中文**排除**本次扫除，理由见 design.md（目标语种即中文、无对应英文键、改动收益为零）。

## Capabilities

### New Capabilities
- (none)

### Modified Capabilities
- `ui-i18n-zh`: "全界面中文文案"需求补充上述组件必须走 `t()` 字典（不得硬编码），并明确"英文键 → 中文值"字典的键复用优先、缺失才新增的规则；同时界定 agent 子树的处理边界。

## Impact

- **代码**：上述 9 个组件 + `frontend/src/lib/i18n.ts`（新增少量键）+ 相关测试文件。
- **API**：无。
- **行为**：文案不再随字典漂移；界面在中文语境下保持一致；agent 子树行为不变（已为中文）。
- **风险**：低。主要为测试断言需同步更新；`t()` 未命中时回退原键（英文），故每个替换点必须确认键已存在或已新增。
