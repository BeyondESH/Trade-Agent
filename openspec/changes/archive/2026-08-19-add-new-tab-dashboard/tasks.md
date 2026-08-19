## 1. 类型与新建逻辑扩展

- [x] 1.1 在 `frontend/src/types/trading.ts` 中扩展 `DesktopTab.type` 为 `DesktopViewMode | 'dashboard'`(类型放宽)
- [x] 1.2 在 `frontend/src/App.tsx` 的 `handleNewTab` 中为 `type === 'dashboard'` 设置标题 `'Dashboard'` 且 `symbol` 为 `undefined`
- [x] 1.3 在 `App.tsx` 中新增 `handlePromoteTab(dashboardTabId: string, type: DesktopViewMode)`:将指定标签的 `type`/`title` 更新为目标界面,`activeTabId` 保持不变

## 2. +号按钮改为新增 Dashboard 标签

- [x] 2.1 在 `DesktopTitleBar.tsx` 中删除 `isNewTabMenuOpen` 状态与其关联的"Open Workspace"下拉菜单 JSX
- [x] 2.2 将 `+` 号按钮的 `onClick` 改为调用 `onNewTab('dashboard')`
- [x] 2.3 在 `DesktopTitleBar.tsx` 的 `getTabIcon` 中为 `dashboard` 类型补充图标分支(或确认落到 default 兜底)
- [x] 2.4 确认标签栏裁剪源移除:无新的绝对定位下拉在后,`overflow-x-auto` 不再引发无溢出滚动条

## 3. Dashboard 视图组件

- [x] 3.1 新建 `frontend/src/components/views/DashboardView.tsx`,定义 6 类界面卡片元数据(type/title/desc/icon/accent:chart/markets/screener/heatmaps/community/news)
- [x] 3.2 实现卡片网格布局:容器自身 `overflow-y-auto` 允许超高垂直滚动,卡片 grid 平铺,无内容溢出时不产生滚动条
- [x] 3.3 卡片 `onClick` 触发由 props 传入的 `onOpen(type: DesktopViewMode)` 回调

## 4. App 路由接线

- [x] 4.1 在 `App.tsx` 中由当前标签 `type === 'dashboard'` 派生 `isDashboard`
- [x] 4.2 在动态工作区路由 `<main>` 中,`isDashboard` 时渲染 `<DashboardView onOpen={(t) => handlePromoteTab(activeTab.id, t)} theme={theme} />`,否则走既有 `activeView` 分支

## 5. 校验

- [x] 5.1 运行 `npm run typecheck` 通过
- [x] 5.2 运行 `npm test` 通过
