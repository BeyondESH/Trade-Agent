## 1. 修复方法绑定

- [x] 1.1 在 `frontend/src/lib/globalNews.ts` 的 `useGlobalNewsStream` 返回对象中，将 `flushPending: client.flushPending` 改为 `flushPending: () => client.flushPending()`
- [x] 1.2 将 `loadMore: client.loadMore` 改为 `loadMore: (category?: string) => client.loadMore(category)`

## 2. 消除未处理拒绝

- [x] 2.1 在 `frontend/src/components/views/GlobalNewsFeed.tsx` 中为 `void loadMore(...).then(...)` 追加 `.catch(() => {})`，使 loadMore 失败时静默可重试

## 3. 回归测试（不 mock hook）

- [x] 3.1 新增 `frontend/src/components/views/GlobalNewsFeed.stream.test.tsx`（现有 `GlobalNewsFeed.test.tsx` 顶层 hoisted `vi.mock` 了整模块，无法在同一文件混用真实 hook；独立文件复用 `globalNews.test.ts` 的 Fake EventSource 模式），不 mock `useGlobalNewsStream`
- [x] 3.2 用例一：emit `snapshot` + 实时 `item`，断言组件不抛错、pending 条目自动 flush 后出现在 DOM
- [x] 3.3 用例二：snapshot `total` > 缓冲且 mock `api.newsHistory` 返回旧条目，触发 `loadMore`，断言旧条目追加渲染且无未处理 promise 拒绝

## 4. 验证

- [x] 4.1 运行 `cd frontend && npm run test`，全部用例（含新增）通过
- [x] 4.2 运行 `cd frontend && npm run typecheck` 通过
