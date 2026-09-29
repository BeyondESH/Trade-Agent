# 修复全域快讯瀑布流卡片在加载更多 / 切换分类时的显示拥挤与抖动

## Why

全域快讯（`GlobalNewsFeed`）的瀑布流卡片在**向下滚动加载更多**与**切换主题分类**时出现显示拥挤/抖动，同时浏览器控制台刷出 20+ 次 `Maximum update depth exceeded`（React 无限更新循环）。

根因是 `useMasonry` 的列迁移判定**会来回振荡**：卡片迁移后必然重新挂载，新挂载的 `ResizeObserver` 立即再次上报**同一高度**并再次触发迁移判定；而该判定不对称——卡片被移到最短列后，该列随即变高、相对新的最矮列再次超阈值，于是又迁回，形成 A↔B 死循环。循环期间瀑布流被反复重排，表现为用户看到的「拥挤」。既有 `global-news-ui` 规格本就要求「仅当列高差超过阈值时 SHALL 迁移卡片,**避免渲染抖动**」——实现违反了该要求。

## What Changes

- **`useMasonry.measure()` 幂等化**：当上报高度与已记录高度**相同**时直接短路——迁移只在「实测值真正纠正了估算」时发生，重挂载的重复上报不再触发迁移与重渲染，切断振荡链。
- **`useGlobalNewsStream` 方法标识稳定化**：该 hook 每次渲染返回**全新内联函数**（`flushPending` / `hasMore` / `loadMore`），使下游 `useCallback` / `useEffect` 依赖每渲染都变（effect 每渲染重跑）。改为 `useCallback([client])` 稳定引用。
- **新增回归测试**：同一高度重复上报必须 no-op（锁定振荡不会复现）。

## Capabilities

### Modified Capabilities

- `global-news-ui`:
  - 「瀑布流布局」：补充**实测上报幂等、迁移不得振荡**的约束（迁移仅由"高度实测纠正估算"触发，重复上报同一高度 MUST NOT 再次迁移或重渲染），并新增对应场景。
  - 「流操作方法绑定安全」：补充**返回方法标识稳定**（跨渲染引用稳定）的约束，避免下游 effect 每渲染重跑，并新增对应场景。

## Impact

**修改文件**
- `frontend/src/lib/useMasonry.ts`：`measure()` 增加幂等短路（+9 行）。
- `frontend/src/lib/globalNews.ts`：`useGlobalNewsStream` 返回的三个方法改用 `useCallback`（+11/−4）。

**新增/修改测试**
- `frontend/src/lib/useMasonry.test.ts`：新增「重复上报同一高度不迁移（振荡守卫）」用例（+20）。

**行为**
- 无 API、无数据、无后端改动；纯前端修复，无破坏性变更。

**验证**
- 浏览器实测（Playwright）：复现原场景（切分类 → 滚到底加载更多 → 切回「全部」）后 console **0 错误**（修复前 20+ 次 `Maximum update depth exceeded`）；三列高度 **4811 / 4719 / 4754**（差异 <2%），卡片顶部对齐、间距一致、无重叠。
- `npm run typecheck` ✓、`npm run test`（**342 passed**，含新增回归）✓、`npm run lint`（exit 0）✓、`npm run build` ✓。
