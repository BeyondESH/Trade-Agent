## MODIFIED Requirements

### Requirement: UI 外壳基于 tradingview-pro 模板
系统 SHALL 以 `frontend/vendor/tradingview-pro` 模板为唯一 UI 来源搭建前端外壳,包括桌面标题栏、全局导航栏、顶部图表工具栏、绘图工具栏、**单一中心图表区**、右侧停靠栏、底部停靠栏、时间栏、6 个全视图与约 10 个弹窗;模板依赖(React 19、Vite 6、Tailwind 4)SHALL 升格进 `frontend/` 根,旧前端 UI 组件全部删除。外壳 MUST NOT 包含多图表网格视图。

#### Scenario: 加载模板外壳
- **WHEN** 用户打开应用
- **THEN** SHALL 渲染模板的桌面布局(标题栏/导航栏/图表区/右侧栏/底部栏),且不包含任何旧前端 UI 组件

#### Scenario: 模板依赖升格
- **WHEN** 在 `frontend/` 根执行安装与构建
- **THEN** SHALL 使用模板的 React 19 / Vite 6 / Tailwind 4 依赖,并保留 vitest 测试与 `/api`、`/ws` 后端代理

#### Scenario: 无多图表网格
- **WHEN** 查看中心工作区
- **THEN** SHALL 呈现单个中心图表区，MUST NOT 出现多图表网格布局或网格切换入口

### Requirement: 非 UI 数据层保留
系统 SHALL 保留并复用旧前端中非 UI 的数据层与图表控制层:`api/{client,bitgetWs,datafeed,types,transform,ws}.ts`、`lib/{chartController,chartData,alertsStore,periodsStore,signalMarks,transform}.ts`、`KLineChartProView.tsx` 包装器与 `klinecharts-pro-theme.css`。旧前端的跨格同步层 `lib/{chartSyncBus,chartSyncActions,cellChartSetup,chartChromeBridge,drawingPersistence}.ts` SHALL NOT 被恢复——单图终端不存在多格同步，这些模块已不存在于代码中。

#### Scenario: 数据层复用
- **WHEN** 构建新前端
- **THEN** SHALL 能通过 `api/` 模块调用后端 REST 与 WS,且不依赖任何已删除的旧 UI 组件

#### Scenario: 不恢复已删除的同步层
- **WHEN** 检索前端数据/控制层模块
- **THEN** SHALL NOT 存在 `chartSyncBus`/`chartSyncActions`/`cellChartSetup`/`chartChromeBridge`/`drawingPersistence`，MUST NOT 为它们新建文件
