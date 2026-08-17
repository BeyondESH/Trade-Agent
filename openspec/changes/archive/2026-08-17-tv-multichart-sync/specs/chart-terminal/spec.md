## MODIFIED Requirements

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
