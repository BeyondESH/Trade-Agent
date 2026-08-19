## Why

顶部标签栏固定 `max-w-[620px]`，标签数超过约 5 个后，新标签位于可视区之外；且标签条使用 `no-scrollbar` 隐藏滚动条、无任何滚动入口，用户无法查看或操作被挤到右侧的新标签，表现为"最多只能添加 5 个 tab"。CDP 实测：5 个 tab 时 `scrollWidth 654 > clientWidth 620`，第 6 个及以后的 tab 落在 620px 可视窗之外。

## What Changes

- 标签条容器由 `max-w-[620px]` 改为 `flex-1 min-w-0`，占满标题栏左侧剩余空间，最大化可视区域（窄窗口下受益更大）。
- `DesktopTitleBar` 监听 `activeTabId` 变化，激活标签自动滚动到可视区（`scrollIntoView({ inline: 'nearest' })`），新添加/切换的标签始终可见——浏览器标签栏的标准行为。
- 保留 `overflow-x-auto no-scrollbar`（隐藏滚动条但保留横向滚动能力）与上一 change 的滚动条槽位修复。
- 不限制可创建的标签数量。

## Capabilities

### New Capabilities
<!-- 无新增能力 -->

### Modified Capabilities
- `tv-template-shell`: 扩展"界面顶部 + 号新增 Dashboard 标签页"要求——标签栏内容溢出时，新激活的标签 SHALL 自动滚动进入可视区，标签条 SHALL 占满左侧可用宽度，且不得限制标签数量。

## Impact

- `frontend/src/components/desktop/DesktopTitleBar.tsx`：标签条容器 className（`max-w-[620px]` → `flex-1 min-w-0`）+ 新增 `activeTabId` 联动滚动。
- 无后端 / API / 数据变更。
- 验证：`npm run typecheck`、`npm test`；Chrome headless CDP 复测（6+ 个 tab 时最后标签可见、自动滚入可视区）。
