# tv-template-shell Specification

## Purpose
TBD - created by archiving change frontend-tv-rebuild. Update Purpose after archive.
## Requirements
### Requirement: UI 外壳基于 tradingview-pro 模板
系统 SHALL 以 `frontend/vendor/tradingview-pro` 模板为唯一 UI 来源搭建前端外壳,包括桌面标题栏、全局导航栏、顶部图表工具栏、绘图工具栏、多图表网格、右侧停靠栏、底部停靠栏、时间栏、6 个全视图与约 10 个弹窗;模板依赖(React 19、Vite 6、Tailwind 4)SHALL 升格进 `frontend/` 根,旧前端 UI 组件全部删除。

#### Scenario: 加载模板外壳
- **WHEN** 用户打开应用
- **THEN** SHALL 渲染模板的桌面布局(标题栏/导航栏/图表区/右侧栏/底部栏),且不包含任何旧前端 UI 组件

#### Scenario: 模板依赖升格
- **WHEN** 在 `frontend/` 根执行安装与构建
- **THEN** SHALL 使用模板的 React 19 / Vite 6 / Tailwind 4 依赖,并保留 vitest 测试与 `/api`、`/ws` 后端代理

### Requirement: 装饰性视图保留壳
系统 SHALL 保留模板中 Screener、Community Ideas、News 视图的 UI 外壳;无真实数据源的视图 SHALL 继续使用 mock 数据,有真实数据源的视图 SHALL 接入后端真实数据。系统 SHALL NOT 提供 Pine Studio 与 Brokers 视图——这两个纯 mock 外壳与本项目实际能力（后端 DL 量化引擎、paper broker）不符,已整体移除。

#### Scenario: 保留无源视图
- **WHEN** 打开 Community Ideas 视图
- **THEN** SHALL 渲染模板外壳并使用 mock 数据(无后端社区数据源)

#### Scenario: 接入有源视图
- **WHEN** 打开 Screener 视图
- **THEN** SHALL 用 `/tickers` 真实行情数据渲染表格(价格/涨跌幅/成交量),缺失字段(RSI/PE/评级)保留 mock 或省略

#### Scenario: Pine Studio 与 Brokers 视图不可达
- **WHEN** 查看左侧全局导航栏、标题栏「新建标签」菜单与 ⌘K 命令面板
- **THEN** SHALL NOT 出现 Pine Studio 或 Brokers 任何入口
- **AND** 视图类型 SHALL NOT 包含 `'pine'` 与 `'brokers'`,不存在可路由到这两个视图的状态

### Requirement: 非 UI 数据层保留
系统 SHALL 保留并复用旧前端中非 UI 的数据层与图表同步层:`api/{client,bitgetWs,datafeed,types,transform}.ts`、`lib/{chartSyncBus,chartSyncActions,cellChartSetup,chartChromeBridge,drawingPersistence}.ts`、`KLineChartProView.tsx` 包装器与 `klinecharts-pro-theme.css`。

#### Scenario: 数据层复用
- **WHEN** 构建新前端
- **THEN** SHALL 能通过 `api/` 模块调用后端 REST 与 WS,且不依赖任何已删除的旧 UI 组件

### Requirement: 界面顶部 + 号新增 Dashboard 标签页
系统 SHALL 以顶栏 `+` 号作为新增标签入口:点击 `+` 号 SHALL NOT 弹出基于 `absolute` 下拉的"Open Workspace"菜单(该方案因被 `overflow-x-auto` 容器裁剪无效且引发滚动条),而是 SHALL 新增一个 `dashboard` 类型标签页并激活显示。顶栏标签栏容器保持 `overflow-x-auto`,但 SHALL NOT 因承载下拉菜单而在无溢出时产生滚动条。

#### Scenario: 点击+号新增标签
- **WHEN** 用户在顶栏点击 `+` 号
- **THEN** 系统 SHALL 新增一个 Dashboard 标签页并激活显示,且 SHALL NOT 出现水平或垂直滚动条,也 SHALL NOT 打开任何无效下拉菜单

#### Scenario: +号不被下拉裁剪
- **WHEN** 用户点击 `+` 号后查看工作区
- **THEN** 顶栏标签栏 SHALL 正常新增标签,Dashboard 视图 SHALL 完整可见,无被裁剪内容

