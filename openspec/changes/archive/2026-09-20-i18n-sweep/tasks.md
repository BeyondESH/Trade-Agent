## 1. 字典补全（`frontend/src/lib/i18n.ts`）

- [x] 1.1 新增缺失键（英文键 → 中文值）：`No news`、`Spread:`、`Positions`、`Working Orders`、`Trade History`、`Broker Summary`、`Market Close`、`Cancel`、`100x Cross Margin`、`Quick search...`、`Notifications`、`Mark all read`
  - 注：`Trade History`、`Notifications` 字典已存在，直接复用未重复新增；其余 10 个键已新增。
- [x] 1.2 新增 Heatmaps / Community 文案键：`Visualize relative market capitalization and sector performance in real-time.`、`S&P 500 Equities`、`Top Crypto Market Cap`、`S&P 500 Mega-Cap Map`、`Total Tracked Market Cap`、`Loading netflow...`、`Discover trading strategies, harmonic patterns, and price action insights published by top global traders.`
  - 注：ui-real-data-wiring 新增的净流入分支文案另补 `Top 10 Netflow`、`No netflow data — check BB_API_KEY / network availability`、`inflow`、`outflow`。
- [x] 1.3 新增 `BottomTimebar` 键：`UTC+0 (Live)`（已新增）
- [x] 1.4 核对复用键均已存在且语义匹配：`Order Book (DOM)`、`Precision: 0.01`、`Price`、`Size`、`Total`、`Day Range`、`24h Volume`、`Market Cap`、`Loading...`、`News feed unavailable:`、`All Loaded`（全部存在）
- [x] 1.5 在 `frontend/src/lib/i18n.test.ts` 增加新增键解析断言（`t(k) !== k` 且输出预期中文）

## 2. 组件文案替换（全部改走 `t()`）

- [x] 2.1 `frontend/src/components/views/NewsCalendarView.tsx`：`加载中...` → `Loading...`；`新闻获取失败:` → `News feed unavailable:`；`已加载全部` → `All Loaded`
- [x] 2.2 `frontend/src/components/sidebar/NewsPanel.tsx`：`加载中...` → `Loading...`；`暂无新闻` → `No news`
- [x] 2.3 `frontend/src/components/sidebar/OrderBookPanel.tsx`：→ `Order Book (DOM)`/`Precision: 0.01`/`Price`/`Size`/`Total`/`Spread:`
- [x] 2.4 `frontend/src/components/bottom/TradingPanel.tsx`：子标签 → `Positions`/`Working Orders`/`Trade History`/`Broker Summary`（计数客户端拼接）；`Market Close`；`Cancel`；`100x Cross Margin`（并移除原有 `as any`）
- [x] 2.5 `frontend/src/components/sidebar/WatchlistPanel.tsx`：→ `Day Range`；`24h Volume`；`Market Cap`（另将 `|| "Neutral"` 回退改为 `t("Neutral")`）
- [x] 2.6 `frontend/src/components/desktop/DesktopTitleBar.tsx`：`快速搜索...` → `Quick search...`；`Notifications` 已走 `t()`；`Mark all read` 按钮在当前文件中已不存在（不重新引入）
- [x] 2.7 `frontend/src/components/views/HeatmapsView.tsx`：审计行 88/106/117/162/166 对应当前 87/104/116/148/151 及加载文案 165 → `t()`；净流入 `inflow/outflow`、无数据提示一并走 `t()`
- [x] 2.8 `frontend/src/components/views/CommunityIdeasView.tsx`：描述 → `t()`（另将 `Open {symbol} Chart` 改为复用 `t("Open")`/`t("Chart")`）
- [x] 2.9 `frontend/src/components/timebar/BottomTimebar.tsx`：`UTC+0 (实时)` → `UTC+0 (Live)`

## 3. 测试同步

- [x] 3.1 `frontend/src/components/sidebar/NewsPanel.test.tsx:72` 断言 `暂无新闻` 仍通过（`No news` 键值为 `暂无新闻`），无需改动
- [x] 3.2 复核 `frontend/src/components/views/MarketsView.test.tsx` 与 `frontend/tests/e2e/panels.spec.ts` 断言（数据驱动/正则兼容），替换后无回归
- [x] 3.3 为替换后的组件补充/调整单测断言（`OrderBookPanel`、`TradingPanel` 子标签；新增 `WatchlistPanel.test.tsx`；`HeatmapsView` 增补中文化断言）
- [x] 3.4 确认 `frontend/src/components/views/agent/**` 未做改动（按 design 决策排除；本次未触碰）

## 4. 验证

- [x] 4.1 运行 `cd frontend && npm run test` 全部通过（57 files / 416 tests）
- [x] 4.2 运行 `cd frontend && npm run typecheck` 通过
- [x] 4.3 运行 `cd frontend && npm run test:e2e`（`panels.spec.ts`）通过（`E2E_BACKEND_PORT=8010` / `E2E_FRONTEND_PORT=5180`，5 passed）
