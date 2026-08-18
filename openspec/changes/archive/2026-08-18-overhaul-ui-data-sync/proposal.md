## Why

三个相关的前端缺陷需要一次性治理:

1. **冗余顶栏**:`TopNavbar`(id=`tradingview-top-header`)与 klinecharts-pro 原生 chrome 功能重叠(周期/指标/搜索/截图等已由 Pro 提供),其展示的 symbol 报价/Alert/Order/主题按钮与图表外组件重复,应删除。
2. **图表外组件数据是死数据**:watchlist/screener 等依赖的 `ticker` 通配订阅,后端 `/ws` 只发一次 REST 快照、从不建立 Bitget WS 增量订阅;且前端 `useExchangeSocket` 按精确 key 匹配,通配订阅 `ticker/default` 与后端按 instId 推送的帧不匹配 → 前端永远收不到后续 update。`books`/`trade` 已实测正常,`ticker` 全频道 update=0。
3. **整体卡顿**:`useRealSymbols` 每次 rAF flush 全量重建 `byKey` map → `symbols`/`priceMap` 新引用 → watchlist 等消费方全树重渲染;`useOrderBook` 每帧增量也全量重建 asks/bids。

## What Changes

- **删除 `TopNavbar`**:移除 `App.tsx` 中 `TopNavbar` 的渲染与 import;其专属功能(Alert/Order 弹窗开关、主题切换)迁移/收敛到其余入口(如 `DesktopTitleBar`/`GlobalNavRail` 已有能力),报价条不再单独显示。
- **后端通配 ticker 建立增量源**:
  - `streamhub.py` 的 `_refresh_tickers` 由"启动时一次"改为周期刷新(约每 5s),并在刷新后向订阅方 emit `action:"update"` 全市场 ticker 帧;
  - `webapi.py` 通配 ticker 订阅(`symbol=default/*`)不再只发一次快照,而是登记订阅并周期接收 `market` 的全市场更新帧转发;通配订阅 SHALL 建立增量流。
- **前端通配订阅 key 匹配修复**:`useExchangeSocket` 的帧分发改为支持通配——订阅 `ticker/default` 时,后端推送的任意 `ticker/<instId>` 帧都投递给该订阅者(category 需一致);或后端对通配订阅统一按 `symbol=default` 转发。
- **性能优化**:
  - `useRealSymbols`:rAF 合并保留,但 `setByKey` 改为按需增量(仅更新变化的 instId),`symbols`/`priceMap` 仅在确实变化时产生新引用;
  - `useOrderBook`:增量合并后仅在 best-bid/ask 变化时 setState,减少全量重建;
  - 高频帧的消费组件(watchlist/RightDock)以 memo 隔离,价格更新不触发非价格 UI 重渲染。

## Capabilities

### New Capabilities
- `ui-live-data-sync`: 图表外组件实时数据同步——通配 ticker 增量订阅、前端通配 key 匹配、周期刷新推送。

### Modified Capabilities
- `realtime-ws`: 通配 ticker 订阅从"一次性 REST 快照"升级为"周期增量推送";前端 `useExchangeSocket` 帧分发支持通配匹配。
- `topbar-controls`: 移除独立顶栏组件(`TopNavbar`),顶栏相关能力(搜索/周期/指标)收敛到 klinecharts-pro 原生 chrome。

## Impact

- `frontend/src/App.tsx`:删除 `TopNavbar` 渲染与 import;关联功能入口迁移。
- `frontend/src/components/header/TopNavbar.tsx`:删除文件(或保留为未引用)。
- `frontend/src/hooks/useExchangeSocket.ts`:帧分发支持通配订阅匹配。
- `frontend/src/hooks/useRealSymbols.ts`、`useOrderBook.ts`:增量更新、避免全量重建。
- `backend/src/market_data/streamhub.py`:`_refresh_tickers` 周期化 + 刷新后 emit。
- `backend/src/market_data/webapi.py`:通配 ticker 订阅建立增量转发。
- 测试:后端 `test_streamhub.py`/`test_webapi.py` 新增通配 ticker 增量用例;前端 `useRealSymbols`/`useOrderBook`/`useExchangeSocket` 测试更新。
- 不涉及:K 线蜡烛实时链路(已修复)、数据存储、指标算法。
