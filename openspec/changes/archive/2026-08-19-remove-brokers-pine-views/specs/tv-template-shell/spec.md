# tv-template-shell Specification (delta)

## MODIFIED Requirements

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
