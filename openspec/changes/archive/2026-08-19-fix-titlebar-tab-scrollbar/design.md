## Context

顶部标签栏（`DesktopTitleBar.tsx:200`）使用 `overflow-x-auto no-scrollbar max-w-[620px]`。Chrome headless CDP 实测数据：

| 标签数 | scrollWidth | clientWidth | clientHeight | vScroll |
|---|---|---|---|---|
| 3 | 400 | 400 | 35 | false |
| 4 | 527 | 527 | 35 | false |
| 5 | 654 | 610 | 25 | **true** |
| 6+ | 780 | 610 | 25 | **true** |

- 标签累计超 `max-w-[620px]`（约 5 个）触发横向滚动条槽位，槽位高 8px 占用容器底部空间 → `clientHeight` 35→25。
- `overflow-x:auto` 会将 `overflow-y` 计算为 `auto`，标签高 28px > 可用 25px → 垂直滚动条。
- 内联 `scrollbar-width: none` 后 `clientHeight` 恢复 35、`vScroll=false`、`clientWidth` 610→620——槽位释放，横向滚动保留。

根因：`index.css` 全局 `* { scrollbar-width: thin; scrollbar-color: ... }`（unlayered）优先于 Tailwind v4 `@utility no-scrollbar`（在 `@layer utilities`）生成的 `scrollbar-width: none`。CSS 规范规定 unlayered 规则永远优先于任何 layered 规则。Chromium 中 `::-webkit-scrollbar { display: none }` 只停止绘制，槽位仍占布局空间；标准 `scrollbar-width: none`（Chrome 121+ 支持）才释放槽位。

`themed-scrollbar` spec 的"完全隐藏滚动条工具类"要求本就声明 no-scrollbar 不占空间、顶部标签栏等不出现滚动条侵占可视高度——本次是修复实现与 spec 的偏差（回归）。

## Goals / Non-Goals

**Goals:**
- `no-scrollbar` 容器溢出时滚动条槽位不占布局空间（`scrollbar-width: none` 真正生效）。
- 顶部标签栏、底部 Tab 栏、新闻 chip 条等所有 `no-scrollbar` 容器修复后不再出现滚动条挤压引发的双向滚动条。
- 普通可滚动容器（未使用 `no-scrollbar`）的 `scrollbar-width: thin` 行为不变。

**Non-Goals:**
- 不改 `DesktopTitleBar` 及其他组件的 JSX/布局结构。
- 不改变横向滚动能力（标签过多仍可滚动）。
- 不引入第三方滚动条库。
- 不处理 Watchlist 重复 key 等其他无关问题。

## Decisions

**D1: 将全局 `* { scrollbar-width: thin; scrollbar-color: ... }` 移入 `@layer base`**

Tailwind v4 的 `@layer base` 是标准 CSS layer。移入后规则优先级为 `unlayered > utilities > base`，`.no-scrollbar { scrollbar-width: none }`（utilities）覆盖全局 thin（base），普通容器仍从 base 层获得 thin。仅移动规则声明位置，不改属性值，回归面最小。

- 备选 A：`.no-scrollbar { scrollbar-width: none !important }`。同样能生效，但 `!important` 会盖过内联样式与未来样式，维护性差，不选。
- 备选 B：直接删掉全局 thin 规则。会改变所有普通容器的滚动条宽度行为（thin→auto），超出本次范围，不选。

**D2: 保留 `&::-webkit-scrollbar { display: none }` 嵌套作为旧 Chromium 回退**

新版 Chromium（121+）以 `scrollbar-width: none` 释放槽位；旧的 webkit 规则对不支持标准属性的浏览器仍隐藏绘制。两条并存，互不冲突。

**D3: 修复有效性以 CDP 实测数据为验收标准**

沿用本次复现脚本指标：标签条溢出（≥5 个 tab）时 `clientHeight === 35`、`vScroll === false`、`scrollbarWidth === 'none'`、`hScroll === true`（横向滚动保留）。

## Risks / Trade-offs

- [移入 `@layer base` 后，若某处依赖 unlayered 全局 thin 覆盖 utilities 行为] → 全局 thin 仅影响滚动条宽度，组件层没有依赖 thin 覆盖 utilities 的既有样式；回归面由 npm test 与 CDP 实测覆盖。
- [`scrollbar-width: none` 在 <Chrome 121 的浏览器不生效，槽位仍占空间] → webkit `display:none` 兜底隐藏绘制；此类浏览器占比极低，且旧行为与现状一致（不劣化）。
- [`@layer base` 语法在旧构建工具不识别] → 项目使用 Tailwind v4 + Lightning CSS（支持原生 CSS layer），已由 `index.css` 中 `@theme` 等 v4 语法证实构建链路支持。

## Migration Plan

单文件 CSS 改动，无部署/数据迁移。回滚：还原 `index.css` 中规则位置即可。验证：`npm run typecheck`、`npm test`，并可用本次 CDP 脚本复测标签条指标。

## Open Questions

无。
