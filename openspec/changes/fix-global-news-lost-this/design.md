## Context

「全域快讯」面板 (`GlobalNewsFeed.tsx`) 通过 `useGlobalNewsStream()` hook 消费 `GlobalNewsClient` 实例。该 hook 返回对象中：

```ts
flushPending: client.flushPending,   // 裸方法引用 → this 丢失
loadMore: client.loadMore,           // 裸方法引用 → this 丢失
```

组件解构后裸调用（`flushPending()` / `loadMore(...)`），类方法体内的 `this._pending` / `this._loadingMore` 读到 `undefined`，抛 `TypeError`。失败路径有二：

1. **白屏（主路径）**：收到实时 `item` 且位于顶部时，`GlobalNewsFeed.tsx:105` 的 effect 调用 `flushNewItems` → `flushPending()` 抛错；`main.tsx` 无 ErrorBoundary，React 18 卸载整棵组件树 → 页面全白卡死。
2. **无法加载更早**：滚动到底部触发 `revealMore` → `loadMore(...)` 返回 rejected promise，`.then(setRenderCount)` 不执行，渲染窗口永不增长。

现有测试无法捕获：`globalNews.test.ts` 直接 `client.flushPending()` 实例调用（this 绑定正确）；`GlobalNewsFeed.test.tsx` 整体 mock 了 hook（箭头函数）。

## Goals / Non-Goals

**Goals:**
- `flushPending` / `loadMore` 在组件中裸调用时绑定到客户端实例，不再抛错。
- 新增不 mock hook 的集成测试，防止回归。
- 保持 `GlobalNewsClient` 类对外 API、现有单测、后端接口完全不变。

**Non-Goals:**
- 不改瀑布流算法（已模拟验证收敛，非本 bug 根因）。
- 不新增全局 ErrorBoundary（缓解而非根治；仅当存在其他崩溃路径时另行立项）。
- 不改后端 `/news/stream`、`/news/history`。

## Decisions

### D1: 用箭头函数包装返回值（而非构造时 bind）

在 `useGlobalNewsStream` 返回对象中改为：

```ts
flushPending: () => client.flushPending(),
loadMore: (category?: string) => client.loadMore(category),
```

- **理由**：改动最小、语义最直接；箭头函数闭包捕获 `client`，无论被谁调用 `this` 均正确。
- **备选 A**：类构造里 `this.flushPending = this.flushPending.bind(this)` —— 也可行，但类方法语义被修改，且需为每个方法显式 bind；单测直接实例调用不受影响，但侵入类实现。
- **备选 B**：类方法改为箭头函数字段 —— 同 A 的侵入性，且 `globalNews.test.ts` 的断言不受影响，但会改变类 API 的可选性（不可覆盖/子类化）。

选 A 的包装方式：单点改动、可读性最好，且不触碰类自身的测试契约。

### D2: 回归测试用真实 hook + Fake EventSource

在 `GlobalNewsFeed.test.tsx` 中新增**不 mock `useGlobalNewsStream`** 的用例：
- 全局注入 `FakeEventSource`（复用 `globalNews.test.ts` 的现有 fake 模式），让真实 client 走 `connect()`。
- 场景 a：emit `snapshot` + `item` → 断言组件不抛错、`pending` 自动 flush 后新条目出现在 DOM。
- 场景 b：模拟 `hasMore`（snapshot `total` > 缓冲）→ 滚动/按钮触发 `loadMore` → mock `api.newsHistory` 返回旧条目 → 断言条目追加渲染、无未处理 promise 拒绝。

- **理由**：只有不 mock 才能让绑定问题暴露在测试层；该用例是防回归的关键。
- **备选**：仅改 `globalNews.test.ts` 断言 hook 返回值可调用 —— 能验证绑定，但无法覆盖「effect 内调用不崩、组件不卸载」的行为级契约。

### D3: `loadMore` 失败路径补 `.catch` 兜底

`GlobalNewsFeed.tsx:123` 的 `void loadMore(...).then(...)` 无 catch，一旦 `loadMore` reject 会产生未处理 promise 拒绝（本次 bug 的表现之一）。修复绑定后 reject 不再发生，但仍补一个 `void loadMore(...).then(...).catch(() => {})`，使该路径对未来网络异常也静默安全（已有 `_loadingMore` / `_hasMore` 守卫，失败时哨兵可重试）。

## Risks / Trade-offs

- [回归测试若仍 mock hook 则绑定问题永不暴露] → D2 明确不 mock `useGlobalNewsStream`，用 Fake EventSource 走真实 client。
- [`.catch` 会吞掉真实的 loadMore 失败信号] → 现有 UI 无失败提示需求，且守卫保证可重试；如需可见错误可后续追加状态位（非本变更范围）。
- [箭头函数包装每次渲染重建引用] → `flushNewItems` 的 `useCallback` 依赖 `flushPending` 引用，包装函数每次渲染新建会导致其失效重跑；当前依赖仅在渲染时求值，且 `flushPending` 引用变化不会引发副作用循环，属可接受成本。若需稳定，可在 `useMemo`/`useCallback` 内建引用（实现时按 lint 反馈决定）。

## Migration Plan

1. 修改 `globalNews.ts` hook 返回值（2 行）。
2. `GlobalNewsFeed.tsx:123` 补 `.catch`。
3. 新增回归测试用例。
4. 跑 `cd frontend && npm run test && npm run typecheck` 验证。
5. 无部署迁移；前端热更新即生效，回滚 = revert 提交。
