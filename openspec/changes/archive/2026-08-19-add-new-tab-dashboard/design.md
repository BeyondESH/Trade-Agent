## Context

当前桌面头部标题栏(`DesktopTitleBar.tsx`)中,`+` 号按钮点击后切换 `isNewTabMenuOpen`,渲染一个 `absolute top-full` 的下拉菜单(Open Workspace 列表)。该下拉位于标签栏容器内,而标签栏容器带 `overflow-x-auto`(DesktopTitleBar.tsx:199)。CSS 中 `overflow-x:auto` 会把 `overflow-y` 计算为 `auto`(而非 `visible`),于是该容器成为裁剪盒:绝对定位的 `top-full` 下拉块向下探出容器,被直接裁剪 → 用户看不到菜单(表现为"没反应");同时 `overflow-x:auto` 开启后,一旦内容超宽/超高即触发水平与垂直滚动条。

现有 `DesktopViewMode` 有 6 类: `chart` / `markets` / `screener` / `heatmaps` / `community` / `news`。`App.tsx` 的动态工作区路由按 `activeView` 分派对应视图;`GlobalNavRail.tsx` 与 `CommandPaletteModal.tsx` 均以这 6 类为导航/命令集合。

## Goals / Non-Goals

**Goals:**
- 点击 `+` 可靠地新增一个 Dashboard 标签页并激活,不再出现"无反应"与滚动条。
- Dashboard 平铺展示全部 6 类界面卡片;点击卡片将当前 Dashboard 标签升级为所选界面并显示。
- 复用现有标签系统(`DesktopTab` / `setTabs` / `handleNewTab`)与动态路由,尽可能少改分支。

**Non-Goals:**
- 不改其它入口(全局导航栏、命令面板)的选择/跳转语义。
- 不引入新的状态管理;Dashboard 无需持有关键业务数据(仅作为跳转容器)。
- 不新增分类小标题/搜索;严格按用户所选"仅平铺 6 个界面卡片"。

## Decisions

### 1. 用隐藏 "dashboard" 类型 + 升级当前标签而非"新建目标标签"
用户要求"把该界面提升为所选界面",即在 Dashboard 标签自身完成切换,而不是另建一个目标标签(避免点击一次就多出两个标签)。设计上复用 `handleNewTab` 新建 `dashboard` 标签,新增 `handlePromoteTab(dashboardTabId, type)`:

```
+ 号点击 → handleNewTab('dashboard')           // 新增并激活 Dashboard 标签
DASHBOARD 卡片点击 → handlePromoteTab(dashboardTabId, 'chart')
   → setTabs(把 dashboard 标签的 type/title 改为 'chart')
   → setActiveTabId 不变(同一标签) → activeView 变为 'chart' → 路由直出图表
```

替代方案(点击卡片另建目标标签、Dashboard 保留)被否:同一次点击会新增两个标签,不符合"提升"语义,且 Dashboard 标签会一直在历史中造成冗余。

### 2. `DesktopViewMode` 字面量为何不加 `'dashboard'`
`DesktopViewMode` 同时驱动 `handleSelectGlobalRailView` 的去重与 `GlobalNavRail`/命令面板的导航集合。若将 `'dashboard'` 直接并入 `DesktopViewMode`,会污染"应避免重复的导航视图"与全局导航的 6 类语义。

选择:**单独布尔 + 仅 DashboardView 判定**。具体做法:
- `activeView` 仍为 `DesktopViewMode`,但新增派生布尔 `isDashboard`(由当前标签 `type === 'dashboard'` 得出,`DesktopTab.type` 现有类型放宽为 `DesktopViewMode | 'dashboard'`)。
- `App.tsx` 路由先用 `isDashboard` 短路渲染 `DashboardView`,否则走既有 `activeView` 分支。
- 现有 6 类导航/命令面板/`getTabIcon` 的 `switch` 均加一个 `dashboard` 兜底分支即可(Default 分支即可,也可单独加图标)。

权衡:比"把 dashboard 加进 DesktopViewMode 再各处 exclude"侵入更小,且 `DesktopTab.type` 需放宽字面量类型(很小的类型改动)。

### 3. `handleNewTab` 的 dashboard 分支
在 `handleNewTab` 中为 `type === 'dashboard'` 设置 `title = 'Dashboard'`(其余 6 类保持现有 title 规则)。`symbol` 为 `undefined`,避免触发符号联动。

### 4. DashboardView 卡片数据驱动
卡片元数据集中定义(`{ type, title, desc, icon, accent }`),映射 6 类:
- chart → SuperCharts / TrendingUp / #2962ff
- markets → Markets Overview / Monitor / #00bcd4
- screener → Screener 2.0 / Filter / #ff9800
- heatmaps → Market Heatmaps / Flame / #f23645
- community → Community Ideas / Users / #9c27b0
- news → News & Calendar / Newspaper / #4caf50

网格用 `grid`,既避免滚动条问题(容器自身 `overflow-y-auto`,必要时垂直滚动),也整洁平铺。卡片点击回调 `onOpen(type)` → 触发升级。

### 5. 滚动条与裁剪修复(顺带闭环)
删除 `+` 号的下拉菜单与 `isNewTabMenuOpen` 状态即消除裁剪源;标签栏 `overflow-x-auto` 保留为"标签过多时可横向滚动",不再承载下拉。ViewPort 层(路由 `<main>`)保持 `overflow-hidden`,各视图内部各自 `overflow-y-auto`——这是本仓库既有约定(Markets/Heatmaps 等均如此),DashboardView 沿用。

## Risks / Trade-offs

- [Dashboard 标签升级为所选界面后,Dashboard 卡片入口消失] → 用户可随时再点 `+` 重建 Dashboard;标签标题回流到真实界面名,符合预期。
- [`'dashboard'` 引入 `DesktopTab.type` 联合类型放宽] → 仅类型放宽,运行时无 newAPI;`getTabIcon`/路由都显式处理,避免遗漏导致的运行时未分支。
- [用户点同名卡片(如当前已开 chart 又想开 chart)] → 升级后类型仍为 chart,无副作用;若希望"若该类型标签已存在则定位到它",可作为后续增强,本轮不做。

## Migration Plan

纯前端局部改动,无数据迁移/无后端。改动集中在 `frontend/src/types/trading.ts`、`App.tsx`、`DesktopTitleBar.tsx`,并新增 `DashboardView.tsx`。可通过 `npm run typecheck` 与 `npm test` 校验。回滚即还原这几处文件。

## Open Questions

- 是否需要给 Dashboard 卡片在当前标签即 dashboard 时显示"当前"高亮?——倾向不加(Dashboard 只在新建当下是 active,样式上无需标记)。本轮不实现。
