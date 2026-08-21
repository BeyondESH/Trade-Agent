# fix-global-news-lost-this

## Why

「全域快讯」面板在收到实时 `item` 后页面整白卡死，滚动到底部也无法加载更早历史。根因是 `useGlobalNewsStream` 返回了未绑定的类方法引用（`flushPending` / `loadMore`），组件裸调用时 `this === undefined`，在 `useEffect` 中抛 `TypeError`；React 18 在无 ErrorBoundary 时卸载整棵组件树 → 白屏。这是最近一次快讯功能提交引入的回归，导致该功能实际不可用。

## What Changes

- 修改 `GlobalNewsClient` 的 hook 封装 `useGlobalNewsStream`，将 `flushPending` / `loadMore` 以绑定 `this` 的形式返回（箭头函数包装或构造时 `bind`），保证组件解构后裸调用不丢 `this`。
- 保持 `GlobalNewsClient` 类自身 API 与现有单测不动（实例方法调用本就绑定正确）。
- 新增一个**不 mock hook** 的集成测试：用 Fake EventSource 注入 `snapshot` + 实时 `item`，断言组件不崩溃、pending 条目正确置顶 flush、`loadMore` 正常追加历史。
- **BREAKING**：无外部 API/接口变更；仅修复前端内部方法绑定。

## Capabilities

### New Capabilities
- `global-news-stream-stability`: 保证全球快讯 SSE 流的 flush 与分页加载在组件裸调用场景下不抛错、不白屏、可正常加载更多（本变更以 delta spec 形式落在 `global-news-ui` 之上，不新建独立能力）。

### Modified Capabilities
- `global-news-ui`: 其「SSE 滚动推送与防重放」「窗口化渲染与加载更早」「"N条新快讯"胶囊」「最新置顶与滚动锚定」等需求新增约束——flush 与 loadMore 不得因 `this` 丢失而抛错，收到实时条目与滚动到底部时面板必须保持可用。

## Impact

- **代码**：`frontend/src/lib/globalNews.ts`（`useGlobalNewsStream` 返回值，2 处）。
- **测试**：`frontend/src/components/views/GlobalNewsFeed.test.tsx` 新增不 mock `useGlobalNewsStream` 的集成用例；`globalNews.ts` 的 hook 可通过导出 `useGlobalNewsStream` 验证绑定行为。
- **依赖**：无新增依赖。
- **系统**：仅前端；后端 `/news/stream`、`/news/history` 不变。
