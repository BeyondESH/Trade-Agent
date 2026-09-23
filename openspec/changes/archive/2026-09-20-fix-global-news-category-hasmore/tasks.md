## 1. 客户端按分类分页

- [x] 1.1 `globalNews.ts` 新增 `_hasMoreByCategory` 字段与 `hasMoreFor(category?)`、`bufferedCountFor(category?)`
- [x] 1.2 `loadMore(category)` 使用 `bufferedCountFor` 计算 offset，并按分类/全局分别写入 `hasMore` 判定
- [x] 1.3 `handleSnapshot` 重建 items 后清空 `_hasMoreByCategory`

## 2. Hook 与组件调用点

- [x] 2.1 `useGlobalNewsStream` 返回 `hasMore: (category?: string) => boolean`
- [x] 2.2 `GlobalNewsFeed.tsx` 用 `hasMore(selected ?? undefined)` 计算 `hasOlder`
- [x] 2.3 更新 `GlobalNewsFeed.test.tsx` mock 为函数式

## 3. 回归测试

- [x] 3.1 `globalNews.test.ts`：分类 offset 按分类计数（非全量长度）
- [x] 3.2 `globalNews.test.ts`：分类加载不误伤全量视图与其他分类
- [x] 3.3 `globalNews.test.ts`：重连 snapshot 重置分类标志
- [x] 3.4 `GlobalNewsFeed.stream.test.tsx`：分类视图加载更早后不提前显示 all-loaded

## 4. 验证

- [x] 4.1 `cd frontend && npm run test` 全量通过（352/352）
- [x] 4.2 `cd frontend && npm run typecheck` 通过
