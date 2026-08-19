## Why

点击顶部标题栏的 `+` 号新建标签页后，一旦标签总数超过标签条宽度上限（约 5 个 tab，窄窗口更早触发），顶部标签行会同时出现水平与垂直滚动条、标签被双向挤压显示异常。已用 Chrome headless 实测复现并定位：`.no-scrollbar` 的 `scrollbar-width: none` 被 `index.css` 中 unlayered 的全局 `* { scrollbar-width: thin }` 覆盖（CSS 规范：unlayered 规则优先于 Tailwind utilities 层），导致 Chromium 中滚动条槽位始终占用 8px 布局空间——横向滚动条槽位把标签条可用高度从 35px 压到 25px，而标签高 28px，进而触发垂直滚动条。实测给标签条内联 `scrollbar-width: none` 后高度恢复 35px、垂直滚动条消失，修复方向已验证。

## What Changes

- 将 `frontend/src/index.css` 中全局 `* { scrollbar-width: thin; scrollbar-color: ... }` 规则移入 `@layer base`，使 Tailwind utilities 层中的 `.no-scrollbar { scrollbar-width: none }` 能够优先覆盖它。
- 保留 `.no-scrollbar` 内 `&::-webkit-scrollbar { display: none }` 作为旧版 Chromium 的回退。
- 效果：所有使用 `no-scrollbar` 的横向控件条（顶部标签栏、底部 Tab 栏、新闻分类 chip 条等）在内容溢出时可横向滚动且滚动条槽位不再占布局空间，不再引发垂直滚动条与标签挤压。
- 普通可滚动容器（非 `no-scrollbar`）的 `scrollbar-width: thin` 行为保持不变。

## Capabilities

### New Capabilities
<!-- 无新增能力 -->

### Modified Capabilities
- `themed-scrollbar`: 强化"完全隐藏滚动条工具类"要求——`no-scrollbar` 除不绘制滚动条外 MUST NOT 占用布局槽位，顶部标签栏等在溢出时 SHALL NOT 出现滚动条挤压导致的垂直滚动。

## Impact

- `frontend/src/index.css`：全局滚动条规则的 layer 归属（unlayered → `@layer base`）。
- 前端行为：顶部标签栏、底部 Tab 栏、新闻 chip 条等 `no-scrollbar` 容器不再因滚动条槽位出现双向滚动条。
- 验证方式：`npm run typecheck`、`npm test`；可用 Chrome headless CDP 脚本复测标签条（溢出时 `clientHeight` 保持 35、`vScroll=false`）。
- 无后端 / API / 数据变更。
