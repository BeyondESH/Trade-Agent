## Context

`BitgetDatafeed`（`frontend/src/api/datafeed.ts`）是 klinecharts-pro 的唯一数据源。vendor 在图表左边缘越界时触发 `loadMore(timestamp)`，请求 `[leftmost-501bar, leftmost-1bar]` 区间并调用 `applyMoreData(list, list.length > 0)` 前置拼接。

现状缺陷：`getHistoryKLineData` 用 `api.candles`（读本地 parquet 库）查区间数据，当请求区间与库**零交集**时（回灌失败/慢、或已到交易所最早），返回空后落入 `api.candlesRecent(200)` 兜底——它返回**最新 200 根**。这些 bar 已在画布右侧渲染过，被 `applyMoreData` 通过 `addData(data, Forward)` 裸 `concat`（klinecharts 不做时间戳去重）前置到左侧，形成"历史区=当前数据重复"；`more=true` 又令加载保持开启，重复随拖动累积。

另一个结构性缺口：按需回灌（`backfill`）逻辑被门控在 `stored.length > 0` 分支内，恰恰在零交集（最需要回灌）时被跳过，直接落到错误兜底。

klinecharts 9.8.12 中 `loadMore`/`applyMoreData` 已废弃但可用（`applyMoreData` → `addData(Forward)` → `data.concat(_dataList)`）。后端 `/candles`、`/candles/recent`、`/candles/backfill` 行为均正确，本次不改。

## Goals / Non-Goals

**Goals:**
- 后向加载（拖右看更早）返回的数据方向正确，绝不把最新数据当历史返回。
- 后向请求零交集时按需触发回灌并重读；失败或已到最早时返回空列表使加载干净终止。
- 返回给 `applyMoreData` 的数据时间戳严格递增、无重复（防御性去重）。
- 全部改动收敛在 datafeed 层，用单测覆盖。

**Non-Goals:**
- 不改 vendor（klinecharts-pro / klinecharts），不迁移 `loadMore`/`applyMoreData` 到 `setLoadDataCallback`（9.8 废弃、v10 移除属后续专项）。
- 不加拖动 loading 提示 / "已到最早" 视觉标识（UX 增量，另行评估）。
- 不改后端 `/candles/backfill` 节流、锁与分页逻辑。
- 不改 `prefetchDeeper` 后台预热节流策略。

## Decisions

### D1: 以 `prevEarliest == null` 区分初始加载与后向加载

`this.earliest` 是 per-series 的"已知最早 bar"追踪表。首次调用前为 `null` → 初始加载；之后非 `null` → 任何后续调用都是后向（拖右）加载。

- 备选：用 `to` 距当前时间远近做启发式 → 拒绝：受周期对齐/时区/符号切换影响，脆弱。
- 备选：在 Datafeed 上另加 `isInitial` 状态机 → 拒绝：与现有 `earliest` 重复，且符号/周期切换需重置逻辑更多。

### D2: 重构 `getHistoryKLineData` 分支，零交集后向路径触发按需回灌

新控制流：

```
getHistoryKLineData(symbol, period, from, to):
  key = seriesKey; prevEarliest = earliest.get(key)
  stored = fetchStored(from, to)                  # api.candles 读本地库
  if stored 非空:
      noteEarliest(stored[0].timestamp)
      if prevEarliest != null && from < prevEarliest && !exhausted:
          await backfill(series, prevEarliest)     # 部分重叠越界：回灌更深（现状保留）
          again = fetchStored(from, to)
          if again 非空: noteEarliest; return again
      return stored
  # —— 零交集 ——
  if prevEarliest == null:
      return candlesRecent(200)                    # 仅初始加载允许最新数据打底
  if !exhausted:
      await backfill(series, to)                   # 后向按需回灌（D3 去重）
      again = fetchStored(from, to)
      if again 非空: noteEarliest; return again
  return []                                        # 干净终止：applyMoreData([], false)
```

关键点：
- **初始加载**（`prevEarliest == null`）：保留 `candlesRecent` 兜底（打底场景本就正确）。
- **后向加载 + 零交集**：先按需回灌（`before = to`，正好覆盖请求窗口），等待完成重读；仍空或 `exhausted` → 返回 `[]`。回灌异常被吞（现状语义），`[]` 使 `applyMoreData([], false)` 关闭加载。
- 返回 `[]` 会禁用该图表实例的 loadMore 直至重新初始化：符号/周期切换会 `applyNewData`（klinecharts `clear()` 重置 `_forwardMore=true`），届时可再次尝试回灌。

### D3: 复用现有 `backfill()` 去重与 exhausted 语义

不新增请求类型：`backfill(series, before)` 已按 `series:before` 去重 in-flight、成功后按 `earliest_reached` 标记 `exhausted`。后向路径直接复用，仅换 `before` 入参（`to`）。`prefetchDeeper` 与按需回灌天然共享同一 `backfill` 去重，无需额外合并逻辑。

### D4: 返回前做时间戳归一化（排序+去重）

新增纯函数 `normalizeBackwardList(bars: KLineData[]): KLineData[]`：按 `timestamp` 升序排序并剔除重复时间戳。应用于后向路径的返回（含 `again` 与 `stored`）。接缝重叠由 vendor 的 `to = leftmost-1bar` 区间结构性避免；此处是廉价防御（跨日 parquet 文件偶发重叠、candlesRecent 与 store 混用等）。

### D5: 不迁移废弃 API，控制在 datafeed 层

改动只碰 `datafeed.ts` 与测试。`loadMore`/`applyMoreData` 在 9.8.12 行为正确（已核实 `applyMoreData` → `addData(Forward)` → 前置拼接），本次不引入 vendor 重建与回归风险。废弃 API 迁移单独立项。

## Risks / Trade-offs

- [首次后向越界需等待一次回灌（≤3 页+MCP 桥），有可见延迟] → `prefetchDeeper` 已做 5s 节流后台预热，多数场景库已更深；`max_pages=3` 上限可控；后续可加 loading 提示缓解观感。
- [回灌失败静默吞错，用户拖到边界只见"无更多数据"，无法区分"失败"与"真的到最早"] → 本次先保方向正确与不产生重复；失败与到最早的区分展示列入 UX 增量（Non-Goals）。
- [`exhausted` 判定依赖后端 `earliest_reached`，误标会导致提前终止] → store 为数据源，后端已按分页空结果判定，属合理边界。
- [返回 `[]` 会禁用该图表实例的 loadMore 直至重新初始化] → 正是边界终止的预期行为；符号/周期切换会重置。
- [`normalizeBackwardList` 只防"列表内重复"，不防与画布已渲染 bar 接缝重叠] → vendor 请求区间天然避开当前左边界 bar；若未来迁移 `setLoadDataCallback`，可基于其 `data`（左边界 bar）参数做更强的裁剪。

## Migration Plan

纯前端 datafeed 行为修正，无数据模型/DB/API 变更：
1. 合并到前端主分支即可部署；后端与 vendor 零改动。
2. 回滚：`git revert` 该 commit 即恢复原行为。
3. 上线验证：拖动到本地库边界、到交易所最早、断开局促回灌失败三种场景均不再出现重复 K 线。

## Open Questions

- 后向回灌的等待策略：当前设计**等待完成后返回**（分页更顺滑，但首次越界有延迟）；备选**立即返回 `[]` + 后台回灌，下次拖动再出数据**（零阻塞但需拖动两次）。当前取前者，若实测观感差可切换。
- 是否需要把"回灌失败"与"已到最早"以不同 `more` 语义反馈给图表（当前都返回 `[]`）。属 UX 增量，另行评估。
