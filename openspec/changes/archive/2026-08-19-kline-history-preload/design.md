## Context

vendor `ChartProComponent.tsx:249` 仅注册 `widget.loadMore(cb)`：klinecharts 只在可见区左缘 `from === 0` 时回调（此时画面已无蜡烛可看），随后 `getHistoryKLineData` 内联等待回灌（最长 ~5s）。用户诉求：左边缘还有余量时就预载。

klinecharts 9.8 提供 `subscribeAction(ActionType.OnVisibleRangeChange, cb)`，回调携带 `VisibleRange { from, to, realFrom, realTo }`（`from`/`to` 为钳制后的可见数据索引），以及 `chart.getDataList()` 获取已加载 K 线。可据此在 `from` 足够小时提前触发与 `loadMore` 相同的加载例程。

## Goals / Non-Goals

**Goals:**
- 在 `from` 仍 > 0（画面左侧还有蜡烛）时提前预载 500 根历史。
- 与既有 `loadMore`、datafeed 回灌语义兼容，不产生重复/乱序。
- 仅在 vendor 内做最小改动。

**Non-Goals:**
- 不改 datafeed 的"空区间内联等待回灌"策略（预载提前后等待发生在有余量期间，观感可接受）。
- 不改后端回灌逻辑（deep-history-backfill-v2 已完成提速）。
- 不做可视"加载中"指示器。

## Decisions

### D1: 用 `OnVisibleRangeChange` 做预载触发器，`loadMore` 保留兜底

条件：`from <= floor((to - from) * 0.6)`（左缘距数据起点 ≤ 60% 视口宽）。视口自适应：放大时阈值小、缩小时阈值大。`from === 0` 时条件恒真，天然覆盖硬边界场景；`loadMore` 保留作为双保险（若 klinecharts 内部未触发 range 事件时）。

备选：固定阈值（如 `from <= 60`）→ 拒绝：缩放级别不同时观感不一致；视口相对阈值更自然。

### D2: 共享加载例程 + `canLoadMore` 状态

- 抽取 `loadOlderData(timestamp)`：与现 `loadMore` 回调完全同构（`[to]=adjustFromTo(ts,1)`、`[from]=adjustFromTo(to,500)`、`applyMoreData(list, list.length>0)`）。
- 组件级 `canLoadMore`：每次加载后置为 `list.length > 0`（与 `more` 语义一致）；symbol/period 切换的 `createEffect` 中重置为 `true`。
- 例程开头 `if (loading || !canLoadMore) return` 防并发与空结果后的无效重试。
- `timestamp` 来源：`getDataList()[range.from]?.timestamp`（`from` 钳制后 ≥ 0，安全索引）。

### D3: 保持既有加载时序不变

`applyMoreData` 前置拼接后 `from` 右移，条件自然失活，不会在同一视口反复触发；`loading` 同步置位保证 range 事件风暴期间只发一个请求。

## Risks / Trade-offs

- [range 事件在缩放/初始化时也可能触发预载] → 初始化右对齐时 `from` 大，条件不满足；数据短于视口时自动补载属期望行为。
- [预载未完成用户已拖到硬边界] → `loadMore` 兜底 + `loading` 去重保证不双发；最坏退回现状（拖到空白等一次）。
- [vendor 改动需重建 dist 且不提交 dist 源码] → dist 为构建产物，重建后由 vite 直接使用；`klinechartsProRace.test.ts` 验证 bundle 关键逻辑不回归。
- [空结果后 `canLoadMore=false` 直到重载] → 与 datafeed 的"返回 [] 关闭加载"语义一致；回灌失败场景下次 symbol/period 切换恢复。

## Migration Plan

vendor 源码 + dist 同步更新；前端无需其他改动。回滚：`git revert` 后重建 dist。

## Open Questions

- 预载比例 60% 是否合适：过大则频繁预载（每次视口移动都触发），过小则余量不足。落地后按拖动观感调整（可常量化）。
