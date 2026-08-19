## 1. vendor 预载实现

- [x] 1.1 `ChartProComponent.tsx` 从 klinecharts 导入 `VisibleRange` 类型；组件级声明 `let canLoadMore = true`
- [x] 1.2 抽取 `loadOlderData(timestamp)` 例程（现 `loadMore` 回调逻辑），开头 `if (loading || !canLoadMore) return`，完成后 `canLoadMore = list.length > 0`
- [x] 1.3 `loadMore` 保留调用 `loadOlderData` 作为硬边界兜底
- [x] 1.4 注册 `subscribeAction(ActionType.OnVisibleRangeChange)`：`from <= floor((to-from)*0.6)` 时以 `getDataList()[from]?.timestamp` 调用 `loadOlderData`
- [x] 1.5 symbol/period 切换的 `createEffect` 中重置 `canLoadMore = true`
- [x] 1.6 重建 vendor dist：`npm run build`（vendor/klinecharts-pro 目录，产物 222.54 kB）

## 2. 验证

- [x] 2.1 前端 `npm test` 通过（24 文件 / 171 测试，含 klinechartsProRace.test.ts / KLineChartProView.test.ts）
- [x] 2.2 `npm run typecheck` 无类型错误
- [x] 2.3 手动验证（可选）：拖动接近左边缘即提前加载，不再拖到空白；到达 2022-10 真边界后停止
