# Tasks — 修复全域快讯瀑布流卡片拥挤与抖动

> 纯前端 bugfix。已实现并验证（下列任务均已勾选）。

## 1. 根因定位

- [x] 1.1 用 Playwright MCP 复现：资讯 → 全域快讯 → 切换分类 / 滚动加载更多，确认 console 出现 `Maximum update depth exceeded`
- [x] 1.2 定位到 `useMasonry.measure()` 的列迁移振荡（迁移 → 重挂载 → 重复上报 → 再迁移）
- [x] 1.3 定位到 `useGlobalNewsStream` 返回方法引用每渲染变化，导致消费方 effect 每渲染重跑

## 2. 实现修复

- [x] 2.1 `frontend/src/lib/useMasonry.ts`：`measure()` 在 `prev === height` 时短路（不更新/不迁移/不重渲染）
- [x] 2.2 `frontend/src/lib/globalNews.ts`：`useGlobalNewsStream` 的 `flushPending` / `hasMore` / `loadMore` 改用 `useCallback([client])`

## 3. 测试

- [x] 3.1 `frontend/src/lib/useMasonry.test.ts`：新增「重复上报同一高度不迁移（振荡守卫）」用例
- [x] 3.2 保留并回归既有瀑布流用例（初始分布 / 实测校正 / 阈值内不迁移 / 过滤剪枝）

## 4. 验证

- [x] 4.1 浏览器实测原场景：切分类 + 滚到底 + 切回「全部」→ console 0 错误（修复前 20+）
- [x] 4.2 列高均衡：三列 4811 / 4719 / 4754（差异 <2%），卡片顶部对齐、无重叠
- [x] 4.3 `npm run typecheck` 通过
- [x] 4.4 `npm run test` 通过（342 passed）
- [x] 4.5 `npm run lint` 通过（exit 0）
- [x] 4.6 `npm run build` 通过
- [x] 4.7 `openspec validate fix-global-news-masonry-thrash --strict` 通过
