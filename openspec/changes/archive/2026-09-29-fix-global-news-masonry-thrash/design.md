# Design — 修复全域快讯瀑布流卡片拥挤与抖动

## Context

全域快讯用 JS 瀑布流（`useMasonry`）排布卡片：初始按「字数×行高」估算放入最短列，卡片挂载后由 `ResizeObserver` 上报真实高度，必要时把卡片迁移到实际最短列以避免列高失衡。

用户报告的症状是**在"滚动加载更多"和"切换分类"时卡片显示拥挤**。经浏览器复现，伴随出现 React 报错 `Maximum update depth exceeded`。

## Goals / Non-Goals

**Goals**
- 消除瀑布流列迁移的振荡与由此产生的 React 无限更新循环。
- 让实现回到既有规格「避免渲染抖动」的要求。
- 保持既有的「实测校正」「实时插入」「窗口化」等行为不变。

**Non-Goals**
- 不改卡片内容展示策略（正文仍不截断——`完整内容竖型卡片` 规格要求）。
- 不改列数、间距、主题或任何视觉样式。
- 不改后端新闻管线。

## Decisions

### 决策 1：把「迁移」收敛为**估算被实测纠正**时的一次性动作，而非每次上报都重判定

`measure()` 原先每次被 `ResizeObserver` 调用都：更新高度 → 判定是否迁移 → 无条件 `force()` 重渲染。

问题在于**迁移会导致卡片重新挂载**，新挂载立刻再上报同一高度 → 再判定。而判定不对称，导致死循环：

```
设卡高 h，旧列高 H_old = H_min + d（触发条件 d > threshold·h = 0.5h）
移到最短列后： H_old' = H_min + d − h ， H_min' = H_min + h
新最矮列 ≈ H_old'，对已迁移到 H_min' 的卡片再判定：
    H_min' − H_old' = (H_min + h) − (H_min + d − h) = 2h − d
因 d < 1.5h ⇒ 2h − d > 0.5h  ⇒  再次超阈值  ⇒  又迁回  ⇒  A↔B 无限振荡
```

**修复**：`measure()` 在 `prev === height`（上报高度与已记录值相同）时直接 `return`——不更新、不迁移、不 `force()`。重挂载的重复上报携带**零新信息**，短路即可。迁移因此只在「首次实测 ≠ 估算」时发生一次。

### 决策 2：`useGlobalNewsStream` 返回的方法必须引用稳定

原实现每次渲染返回全新箭头函数：

```ts
flushPending: () => client.flushPending(),
hasMore: (c) => client.hasMoreFor(c),
loadMore: (c) => client.loadMore(c),
```

`GlobalNewsFeed` 用它们构造 `useCallback`/`useEffect` 依赖（如 `flushNewItems = useCallback(..., [flushPending])`、`revealMore = useCallback(..., [..., loadMore])`）。引用每次变化 ⇒ 相关 effect 每渲染重跑，放大重渲染churn，并在振荡期加剧循环。

**修复**：在 hook 内用 `useCallback([client])` 固定引用。`client` 由 `useState(() => new GlobalNewsClient())` 持有，生命周期内稳定，故三个方法引用终身稳定。

### 决策 3：以单元测试锁定振荡不回归

`measure()` 的振荡在真实浏览器里由「重挂载 → 再上报」触发，单测不重挂载，因此原有用例测不出。新增用例：同一高度重复 `measure` 必须 no-op（列分布不变）。

## Risks / Trade-offs

- **权衡：迁移次数减少。** 迁移从此只纠正一次估算误差；后续若因他人高度变化导致列失衡，不再自动二次迁移。这与规格「避免渲染抖动」一致，且增量放置（按最短列）已在插入时平衡，实际影响可忽略。
- **风险：短路是否会漏掉必要的重排？** 不会。高度未变即列高未变，无重排必要。
- **验证**：浏览器实测场景 + 单元回归 + 全量前端门禁。

## Migration Plan

纯前端 bugfix，无数据迁移，无兼容性影响。

## Open Questions

无。
