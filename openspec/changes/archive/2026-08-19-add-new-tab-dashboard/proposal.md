## Why

点击顶部标题栏的 `+` 号按钮时,本该弹出的"新建工作区"下拉菜单没有任何反应,同时界面会出现水平与垂直滚动条。根因是下拉菜单被外层 `overflow-x-auto` 标签栏容器裁剪(绝对定位的 `top-full` 下拉块低于容器,`overflow-x:auto` 会连带将 `overflow-y` 计算为 `auto` 形成裁剪),既看不到菜单又引发滚动条。该下拉菜单方案本质脆弱,需要用一个更可靠、更直观的方式来让用户打开各界面。

## What Changes

- 移除 `DesktopTitleBar` 中 `+` 号按钮现有关联的破碎下拉菜单(`isNewTabMenuOpen`),改为:点击 `+` 新增一个 **Dashboard 标签页**并激活显示。
- 新增 `dashboard` 视图类型(`DesktopViewMode`)与对应仪表盘页面 `DashboardView`。
- Dashboard 页面以卡片网格形式**平铺展示所有 6 类界面**(SuperCharts / Markets Overview / Screener 2.0 / Market Heatmaps / Community Ideas / News & Calendar),每一张卡片对应一个 `DesktopViewMode`。
- 点击某张卡片后,**将当前 Dashboard 标签升级为所选界面**(同一标签 id,标题与类型改为被选界面)并跳过路由直接显示该界面——即"将该界面提升为所选界面然后显示"。
- 全局导航栏、命令面板等处已有的新建/选择界面入口保持语义不变(复用 `DesktopViewMode`),不受影响。

## Capabilities

### New Capabilities
- `dashboard-view`: 提供 Dashboard 视图与卡片网格,将全部 `DesktopViewMode` 界面分类平铺展示,点击卡片将当前标签升级为所选界面。

### Modified Capabilities
- `tv-template-shell`: `+` 号按钮行为由"弹出下拉菜单"改为"新增 Dashboard 标签页";新增 `dashboard` 视图类型并纳入动态工作区路由;标签栏不再出现因下拉裁剪引发的滚动条。

## Impact

- `frontend/src/types/trading.ts`: `DesktopViewMode` 增加 `'dashboard'`。
- `frontend/src/App.tsx`: 动态工作区路由增加 `activeView === 'dashboard'` 分支;`handleNewTab` 增加 dashboard 标题;新增 `handlePromoteTab`(将当前标签升级为所选类型)回调。
- `frontend/src/components/desktop/DesktopTitleBar.tsx`: 移除破碎下拉菜单,`+` 号改为 `onNewTab('dashboard')`;清理滚动条裁剪问题。
- 新增 `frontend/src/components/views/DashboardView.tsx`:卡片网格组件。
- 全局导航栏 `GlobalNavRail.tsx` 与命令面板 `CommandPaletteModal.tsx` 的 `DesktopViewMode` 引用自动受益(不入导航即可,保持 6 类)。
