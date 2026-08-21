## Context

后端 `/news/history?category=X` 的 `page()` 先按分类过滤、再按 ts 倒序切片（`news_broker.py:205-212`），返回 `total` = 该分类在环形缓冲中的条数。而客户端 `GlobalNewsClient` 维护的是**全量** `_items`（所有分类）。原实现 `loadMore(category)` 用 `_items.length + _pending.length` 作 offset、用 `_items.length < res.total` 判 hasMore：分类视图下全量长度必然大于等于筛选条数，导致 `hasMore` 提前 false → 底部过早显示「已加载全部」，分类剩余条目不可达。

## Goals / Non-Goals

**Goals:**
- 分类视图的 offset 与 `hasMore` 口径与后端按分类过滤后的列表一致。
- 全量视图行为不变（offset = 全量缓冲条数，total = 全量环形缓冲数）。
- 修复带回归测试，且 `fix-global-news-lost-this`（方法绑定）已保证 flush/loadMore 可正常执行，本修复可被端到端触发。

**Non-Goals:**
- 不改后端 `page()` 语义（保持后端为单一数据源口径）。
- 不处理环形缓冲旋转导致的全量视图 offset 漂移（独立问题，另议）。

## Decisions

### D1: 按分类计数驱动 offset 与 hasMore

新增 `bufferedCountFor(category)`（统计 `_pending + _items` 中该分类条数）与 `hasMoreFor(category)`：

- `loadMore(category)`：`offset = bufferedCountFor(category)`；请求后 `buffered < res.total` 写入 `_hasMoreByCategory[category]`（无分类时维持原 `_hasMore`）。
- `hasMoreFor(category)`：有缓存标志用标志；无则回退全局 `_hasMore`（全量缓冲是全集的超集，全量耗尽 ⇒ 分类必耗尽，回退安全且保守）。

- **理由**：客户端缓冲中的分类条目恰为后端该分类列表的「最新 N 条」（快照/流式都是最新在前），条数即正确切片起点，语义自洽。
- **备选 A**：让后端 `total` 恒为全量数 —— 破坏 `page()` 现有口径，且分类 UI 仍无法得知该分类是否还有更多。
- **备选 B**：前端为每个分类维护独立 item 列表 —— 改动大，与单 `_items` 的 flush/去重逻辑冲突。

### D2: 重连 snapshot 清空分类标志

`handleSnapshot` 重建 `_items` 后 `_hasMoreByCategory.clear()`，使旧标志不因环形缓冲轮转而残留错误，回退到全局判定。

### D3: hook 暴露函数式 hasMore

`useGlobalNewsStream` 返回 `hasMore: (category?: string) => boolean`，`GlobalNewsFeed` 用 `hasMore(selected ?? undefined)` 计算 `hasOlder`。仅此一个消费者，属内部 API 变更。

## Risks / Trade-offs

- [分类计数包含已从环形缓冲挤出但仍保留在客户端的条目，可能使 offset 略大] → 后端对该 offset 返回空列表、`buffered >= total` → hasMore=false，与「客户端已持有比后端更多历史」一致，不误判。
- [`hasMore` 类型由 boolean 变为函数] → 破坏性小：仅 `GlobalNewsFeed` 消费，测试 mock 同步更新即可。
- [回退到全局判定在分类首次加载前可能略乐观（真时 global=true 但该分类已耗尽）] → 触发一次加载后即被精确标志纠正，且空响应时 hasMore=false 收敛，可接受。

## Migration Plan

1. 改 `globalNews.ts`（计数/标志/loadMore/hook）。
2. 改 `GlobalNewsFeed.tsx` 调用点。
3. 更新 `GlobalNewsFeed.test.tsx` mock 为函数式。
4. 补单测与组件级回归用例。
5. `npm run test` + `npm run typecheck`。
