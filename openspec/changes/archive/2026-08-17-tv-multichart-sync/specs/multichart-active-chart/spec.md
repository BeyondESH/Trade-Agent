## ADDED Requirements

### Requirement: 活动图选择

系统 SHALL 在多格布局中维护唯一"活动图"（active chart）：点击任一格使其成为活动格，活动格 SHALL 有可视边框高亮；顶栏的品种/周期/图表类型/指标操作 SHALL 作用于活动格，而非固定的首格。

#### Scenario: 点击激活

- **WHEN** 用户点击某一格图表
- **THEN** 该格 SHALL 成为活动格并显示高亮边框，其余格取消高亮

#### Scenario: 顶栏操作路由到活动格

- **WHEN** 活动格为第 2 格时在顶栏切换周期或图表类型
- **THEN** 操作 SHALL 作用于第 2 格（活动格）

#### Scenario: 布局变更后的活动格

- **WHEN** 切换布局格数导致活动格不存在
- **THEN** 系统 SHALL 将活动格回退为首格
