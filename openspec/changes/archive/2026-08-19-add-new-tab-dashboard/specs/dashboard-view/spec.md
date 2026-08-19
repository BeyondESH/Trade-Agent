## ADDED Requirements

### Requirement: Dashboard 视图平铺所有界面
系统 SHALL 提供 `dashboard` 视图类型,以卡片网格形式平铺展示全部 6 类界面(SuperCharts / Markets Overview / Screener 2.0 / Market Heatmaps / Community Ideas / News & Calendar),每个界面卡片均有对应图标、标题与简短描述,并映射到对应 `DesktopViewMode`。

#### Scenario: 打开 Dashboard 浏览所有界面
- **WHEN** 用户新增 Dashboard 标签页并进入 Dashboard 视图
- **THEN** 系统 SHALL 以卡片网格展示 6 类界面卡片,每张卡片标识其界面类型与用途

### Requirement: 卡片点击升级当前标签为所选界面
在 Dashboard 视图中,点击任意界面卡片后,系统 SHALL 将当前 Dashboard 标签升级为被选界面(类型与标题改为该界面),激活状态不变(仍为当前标签),并立即渲染显示该界面视图。

#### Scenario: 从 Dashboard 进入 SuperCharts
- **WHEN** 用户在 Dashboard 点击 "SuperCharts" 卡片
- **THEN** 当前 Dashboard 标签 SHALL 升级为 chart 界面,标题变为该界面名称,且视图区 SHALL 显示图表

#### Scenario: 从 Dashboard 进入其它任意界面
- **WHEN** 用户在 Dashboard 点击任一其它界面卡片(如 Heatmaps / News)
- **THEN** 当前 Dashboard 标签 SHALL 升级为该界面,并立即渲染显示对应视图

### Requirement: Dashboard 视图滚动与布局
Dashboard 视图容器 SHALL 自身采用 `overflow-y-auto` 以便内容超高时可垂直滚动,且 SHALL NOT 在无内容溢出时引发水平/垂直滚动条;视图区主容器保持 `overflow-hidden`。

#### Scenario: 内容超过视口高度
- **WHEN** Dashboard 卡片网格高度超过工作区视口
- **THEN** 系统 SHALL 在 Dashboard 视图内部出现垂直滚动,而不改变标题栏或整体布局产生额外滚动条

#### Scenario: 内容不超视口
- **WHEN** Dashboard 卡片网格容纳于工作区视口
- **THEN** 系统 SHALL 不出现任何水平或垂直滚动条
