## Why

用户向右拖动 K 线图加载更早历史时，一旦请求区间与本地 parquet 库无交集，`BitgetDatafeed.getHistoryKLineData` 的兜底逻辑会返回**最新 200 根** K 线，被 klinecharts `applyMoreData` 裸拼接（`data.concat(_dataList)`，无去重）前置到图表左侧，导致历史区域显示与当前数据完全重复的 K 线；且 `applyMoreData(list, length>0)` 令加载保持启用，重复块随拖动不断累积。根因：datafeed 未区分初始加载与后向懒加载，且按需回灌仅在请求区间与库**部分重叠**时触发，零交集时刻（最需要回灌）被跳过。

## What Changes

- `BitgetDatafeed.getHistoryKLineData` 区分**初始加载**（首次、`prevEarliest == null`）与**后向加载**（拖动越界、`prevEarliest != null`）。
- 后向加载且本地库在请求区间无数据时：
  - 未到交易所最早 → 触发一次按需回灌（去重复用 in-flight），等待完成后重读区间并返回；
  - 回灌失败或已到最早 → 返回空列表（`applyMoreData([], false)` 令 klinecharts 关闭后续加载，图表干净停在边界），**绝不把最新数据当作历史返回**。
- 防御性时间戳去重：返回给 `applyMoreData` 的数据裁剪掉与已渲染 bar 重叠的部分，避免拼接接缝重复。
- 后端 `/candles/backfill` 与 vendor（klinecharts-pro / klinecharts）均不改动；不迁移废弃 API（loadMore/applyMoreData），仅修复 datafeed 层。
- 补充 `datafeed.test.ts` 测试：后向空库触发回灌、回灌失败返回空、已到最早返回空、返回数据不与已渲染 bar 重叠。

## Capabilities

### New Capabilities
- `chart-history-lazy-load`: K 线图后向历史加载（拖右懒加载）的 datafeed 契约——请求方向正确性、空区间按需回灌、边界终止不产生重复渲染。

### Modified Capabilities
<!-- 无：history-backfill 的既有要求已覆盖"越界触发回灌"，本次为补全实现缺口与新增前端契约。 -->

## Impact

- `frontend/src/api/datafeed.ts` — `BitgetDatafeed.getHistoryKLineData` 主路径改造（核心改动）。
- `frontend/src/api/datafeed.test.ts` — 新增/调整测试（现有 backfill 测试基建可直接复用）。
- 后端 `backend/src/market_data/webapi.py` 的 `/candles/backfill`、`/candles` 无需改动。
- vendor `frontend/vendor/klinecharts-pro/` 与 `node_modules/klinecharts` 无需改动。
