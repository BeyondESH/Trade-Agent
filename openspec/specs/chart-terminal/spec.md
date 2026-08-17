# chart-terminal Specification

## Purpose
TBD - created by syncing change react-klinecharts-pro.
## Requirements
### Requirement: 基于 Pro 的图表终端

系统 SHALL 以 klinecharts-pro 为图表终端基座（内置画线工具栏、周期条、指标管理、标的搜索），并在其之上提供自动层开关与 AI 决策联动。周期条提供的全部可选周期（1m/5m/15m/30m/1H/4H/12H/1D）切换后，图表 SHALL 正确加载并展示对应周期的历史数据，并持续接收该周期的实时更新。多格布局中，每个图表实例 SHALL 跟随全局主题（不得硬编码 theme），绘图 SHALL 以数据坐标 `{timestamp,value}` 表达以支持跨周期重投影与镜像。

#### Scenario: 终端 chrome 可用

- **WHEN** 打开图表终端
- **THEN** SHALL 展示画线工具栏、周期条与指标管理入口

#### Scenario: 周期切换

- **WHEN** 用户在周期条切换周期
- **THEN** 图表 SHALL 按新周期重新加载数据并触发 onPeriodChange

#### Scenario: 任意可选周期可渲染

- **WHEN** 用户切换到周期条中任一组可选周期（含 1H/4H/12H/1D）
- **THEN** 图表 SHALL 展示该周期的 K 线数据而非空白，并随实时推送更新

#### Scenario: 标的搜索联动

- **WHEN** 用户在搜索框选择标的
- **THEN** 图表 SHALL 加载新标的并触发 onSymbolChange，外部面板联动更新

#### Scenario: 每格主题跟随

- **WHEN** 多格布局下切换全局 dark/light 主题
- **THEN** 全部格的图表 chrome SHALL 随主题变化，不存在固定 dark 的格

### Requirement: AI 决策联动

系统 SHALL 在终端底部区域提供 AI 分析模块占位，展示 Agent 决策（action/side/confidence/reason）、指标摘要与 S/R 候选的能力由后续 change 实现；本期仅保留占位容器，切币种/周期时保持联动数据链路预留。

#### Scenario: 底部占位渲染

- **WHEN** 终端加载
- **THEN** 底部 SHALL 渲染 AI 分析模块占位区域而不报错

#### Scenario: 联动链路预留

- **WHEN** 切换标的或周期
- **THEN** SHALL 维持 series 上下文以支持后续 AI 面板按新 series 刷新

### Requirement: 周期数据链路一致

系统 SHALL 保证前端周期标识与后端 timeframe 解析一致：前端以 `1m/5m/15m/30m/1h/4h/12h/1d` 规范形式请求，后端 SHALL 兼容大小写与 `H/D` 后缀输入，对所有可选周期均返回数据而非 400。

#### Scenario: 小时/天周期请求成功

- **WHEN** 前端请求 `1H`、`4H`、`12H` 或 `1D` 周期的历史或最近 K 线
- **THEN** 后端 SHALL 返回对应数据（HTTP 200），不因大小写差异报错

#### Scenario: 订阅覆盖全部周期

- **WHEN** 后端启动
- **THEN** SHALL 订阅全部可选周期的实时频道，使任一周期切换均有实时数据可用

