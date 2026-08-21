# fix-global-news-category-hasmore

## Why

分类视图（选中某个主题 chip）下，滚动到底部会过早显示「已加载全部」。根因是 `GlobalNewsClient.loadMore(category)` 用**全量列表长度** `_items.length` 作为 offset，并拿它与后端**按分类过滤后**的 `total` 比较：全量长度 ≥ 筛选条数时 `hasMore` 立即变 false，导致该分类剩余条目永远无法加载。

## What Changes

- `GlobalNewsClient` 新增按分类维护的缓冲计数与 `hasMore` 状态：
  - `hasMoreFor(category?)`：按分类查询是否还有更多历史；无分类时等同原 `hasMore`。
  - `loadMore(category)` 的 offset 改为「该分类在客户端缓冲中的条数」，与后端按分类切片的口径一致。
  - `handleSnapshot`（重连重放）时清空按分类的缓存标志，回退到最新的全局 `hasMore`。
- hook 返回的 `hasMore` 由 `boolean` 改为 `(category?: string) => boolean`；`GlobalNewsFeed` 以当前选中分类调用。
- **BREAKING**：`useGlobalNewsStream` 的 `hasMore` 返回值类型变化（内部 API，仅 `GlobalNewsFeed` 使用）。

## Capabilities

### New Capabilities
- `global-news-category-paging`: 全球快讯分类视图的分页口径与 `hasMore` 判定（以 delta spec 形式落在 `global-news-ui` 之上）。

### Modified Capabilities
- `global-news-ui`: 新增约束——分类筛选下的加载更多与「已加载全部」判定 SHALL 基于该分类自身的缓冲计数，不得因全量/筛选口径不一致而过早结束。

## Impact

- **代码**：`frontend/src/lib/globalNews.ts`、`frontend/src/components/views/GlobalNewsFeed.tsx`。
- **测试**：`globalNews.test.ts` 新增 3 个单测（分类 offset、分类/全局 hasMore 隔离、重连重置）；`GlobalNewsFeed.stream.test.tsx` 新增 1 个组件级回归用例（分类视图不提前 all-loaded）。
- **依赖**：无新增。
