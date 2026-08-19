## Why

K 线历史懒加载只在 `loadMore`（klinecharts 左边缘 `from === 0`）触发——用户要**拖到画面彻底没有蜡烛**才触发回灌，且回灌期间停在空白屏等待（单次回灌最坏 ~5s）。理想体验是"边拖边灌"：在左边缘还剩一段可见蜡烛时就提前预取，等用户拖到边界数据已经就绪。

## What Changes

- 修改 vendor `frontend/vendor/klinecharts-pro/src/ChartProComponent.tsx`（并重建 dist）：
  - 抽取历史加载例程 `loadOlderData(timestamp)`（原 `loadMore` 回调逻辑）。
  - 注册 `subscribeAction(ActionType.OnVisibleRangeChange)`：当可见区左缘距数据起点不超过约 60% 视口宽度时，以当前最左可见 bar 的时间戳触发 `loadOlderData`，实现提前预载。
  - `canLoadMore` 状态：上一次返回空列表后停止继续预载（与 `applyMoreData(…, more)` 语义一致）；symbol/period 切换时重置。
  - `loading` 标志去重并发，`loadMore`（硬边界）保留作为兜底。
- 不改 datafeed 层语义（仍按需回灌 + 内联等待），不改后端。

## Capabilities

### New Capabilities
- `chart-history-preload`: K 线图历史预载时机——在左边缘仍有余量时提前触发后向加载，避免拖到空白屏才加载。

### Modified Capabilities
<!-- 无：history-backfill 与 chart-history-lazy-load 的既有需求不改变。 -->

## Impact

- `frontend/vendor/klinecharts-pro/src/ChartProComponent.tsx` — vendor 源码改动（唯一代码改动）。
- `frontend/vendor/klinecharts-pro/dist/klinecharts-pro.js` — 重建产物。
- `frontend/src/vendor/klinechartsProRace.test.ts`、`KLineChartProView.test.ts` — 回归验证（vendor bundle 解析测试）。
- 后端与 datafeed 层不改动。
