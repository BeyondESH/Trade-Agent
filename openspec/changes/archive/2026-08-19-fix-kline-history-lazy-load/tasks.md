## 1. 后向懒加载修复（datafeed 核心改造）

- [x] 1.1 在 `frontend/src/api/datafeed.ts` 新增纯函数 `normalizeBackwardList(bars)`：按 `timestamp` 升序排序并剔除重复时间戳
- [x] 1.2 重构 `BitgetDatafeed.getHistoryKLineData`：以 `prevEarliest == null` 区分初始加载与后向加载，仅初始加载允许 `candlesRecent` 兜底
- [x] 1.3 后向加载 + 本地库零交集 + 未 `exhausted`：触发 `backfill(series, to)`（复用 in-flight 去重）并等待，完成后 `fetchStored(from, to)` 重读并 `noteEarliest`
- [x] 1.4 后向加载 + 零交集 + 回灌失败或已 `exhausted`：返回 `[]`（不调用 `candlesRecent`），使 `applyMoreData([], false)` 关闭加载
- [x] 1.5 对后向路径返回值（`stored`/`again`）应用 `normalizeBackwardList` 归一化
- [x] 1.6 保留现有"部分重叠越界 → 回灌更深"分支与 `prefetchDeeper`、`exhausted` 语义不变

## 2. 单元测试

- [x] 2.1 在 `frontend/src/api/datafeed.test.ts` 新增：后向加载 + 空库 + 未到最早 → 调用 `backfill`（入参 `to`）并返回重读后的更早数据
- [x] 2.2 新增：后向加载 + 空库 + 回灌失败 → 返回 `[]` 且不调用 `candlesRecent`
- [x] 2.3 新增：后向加载 + 空库 + 已 `exhausted` → 不触发回灌，返回 `[]`
- [x] 2.4 新增：后向加载 + 空库 + 回灌成功但重读仍空 → 返回 `[]`
- [x] 2.5 新增：初始加载 + 空库 → 仍走 `candlesRecent` 兜底（回归保护）
- [x] 2.6 新增：`normalizeBackwardList` 对乱序/重复时间戳的排序去重行为
- [x] 2.7 新增：后向加载返回数据不包含 `open_time > to` 的 bar（方向正确性断言）

## 3. 验证

- [x] 3.1 运行 `npm test`（frontend 目录）通过全部单测
- [x] 3.2 运行 `npm run typecheck`（frontend 目录）无类型错误
- [x] 3.3 手动验证（可选）：拖动到本地库边界、到交易所最早、断开回灌依赖三种场景均不再出现重复 K 线
