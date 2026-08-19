## Context

顶部标签栏位于 `DesktopTitleBar.tsx:200`，容器为 `flex items-center h-full gap-1 overflow-x-auto no-scrollbar max-w-[620px]`。上一 change（fix-titlebar-tab-scrollbar）已修复滚动条槽位占位问题（`scrollbar-width: none` 生效，溢出时无垂直滚动条），但标签栏可视窗仍固定 620px：

CDP 实测（1600×1000）：
- 5 个 tab：`scrollWidth 654 > clientWidth 620`，标签开始溢出
- 6~7 个 tab：`scrollWidth 780/907`，第 6+ 个标签落在可视区外

新标签添加后位于右侧溢出区，`no-scrollbar` 隐藏滚动条且无鼠标滚轮/拖拽入口（`overflow-x` 容器默认不支持鼠标滚轮横向滚动，滚轮仍触发纵向），用户无法到达新标签，体验等同"最多 5 个 tab"。

浏览器标签栏（Chrome/Edge/TradingView）的标准行为是：新标签激活时自动滚动到可视区。当前实现缺失这一联动。

## Goals / Non-Goals

**Goals:**
- 标签条占满标题栏左侧可用宽度（`flex-1 min-w-0` 替代 `max-w-[620px]`），最大化可视区。
- `activeTabId` 变化（新建、点击切换、关闭后回落）时，激活标签自动滚入可视区。
- 不限制标签数量，标签过多仍可横向滚动（隐藏滚动条）。

**Non-Goals:**
- 不引入悬浮滚动箭头/拖拽滚动等额外 UI。
- 不改变 `no-scrollbar` 行为与滚动条槽位修复。
- 不改 `App.tsx` 的 tab 状态管理逻辑。
- 不压缩标签样式（保持现有宽高与 hover 效果）。

## Decisions

**D1: 标签条 `max-w-[620px]` → `flex-1 min-w-0`，且父容器同样加 `flex-1 min-w-0`**

标签条位于标题栏左侧容器 `flex items-center gap-2 h-full`（BE 菜单 + 标签条）内。仅给标签条加 `flex-1 min-w-0` 不够：左侧容器自身宽度为 min-content（被标签内容撑破，实测 visLeft 变负溢出标题栏）。因此**两级都需约束**——左侧容器加 `flex-1 min-w-0` 占满标题栏剩余空间，标签条加 `flex-1 min-w-0` 在左侧容器内收缩并触发横向滚动。

- 备选：保留 max-w 仅放大数值——窄窗口利用率低、数值拍脑袋，不选。
- 实测：两级约束后 `clientWidth` 稳定 532px（1100 宽窗口）、`visLeft` 稳定、无溢出。

**D2: 用 `scrollIntoView({ inline: 'nearest', block: 'nearest' })` 实现激活联动**

`DesktopTitleBar` 新增 `useRef<HTMLDivElement>` 指向标签条容器；`useEffect` 监听 `activeTabId`，查询活动标签 DOM 节点并 `scrollIntoView`。`inline: 'nearest'` 语义：标签已在可视区内则不动，部分/完全在区外则就近滚入——切回旧标签时不会把整个条滚乱。

- 备选 A：手动计算 `scrollLeft = tab.offsetLeft - 容器.clientWidth + tab.width`——重复实现浏览器内置逻辑，易错，不选。
- 备选 B：`scrollIntoView({ inline: 'end' })`——每次都把标签贴到右缘，切回左侧旧标签会改变滚动位置，不选。

**D3: 滚动时机**

`useEffect` 在 render 提交后执行，React 已更新 DOM，此时活动标签节点存在。无需 `requestAnimationFrame`（单帧内查询即可），若实测有闪烁再加。

**D4: 滚动容器兼容**

标签条容器自身是可滚动元素，活动标签的祖先链中最近的 overflow 容器就是它，`scrollIntoView` 不会滚到页面其他区域。外层 `overflow-hidden` 的根容器不会受影响。

## Risks / Trade-offs

- [`flex-1` 挤压右侧搜索/工具控件] → 右侧容器 `flex items-center gap-2`（无固定宽），flex 布局会自动平衡；CDP 实测窗口 1600 与较窄宽度均需抽查标题栏无挤压。
- [scrollIntoView 滚动整个页面/祖先链] → 用 `container.scrollIntoView` 的替代方案时需限定目标为活动 tab 元素；其祖先 `overflow-hidden` 裁剪了传播，实际只滚动标签条自身。实测确认。
- [关闭标签导致 activeTabId 变化回落] → `handleCloseTab` 已 `setActiveTabId(nextTabs[0].id)`，D2 联动同样覆盖该路径。

## Migration Plan

单组件改动，无数据迁移。回滚：还原 DesktopTitleBar 两处改动即可。验证：`npm run typecheck`、`npm test`，CDP 复测 6+ tab 自动滚入可视区。

## Open Questions

无。
