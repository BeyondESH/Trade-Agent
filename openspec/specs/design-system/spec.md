# design-system Specification

## Purpose
TBD - created by archiving change frontend-okx-theme. Update Purpose after archive.
## Requirements
### Requirement: Tailwind 设计系统与 UI 原子

系统 SHALL 接入 Tailwind CSS 并定义 OKX 风格设计 tokens(深色底、涨绿跌红、紧凑排版),提供一套可复用 React UI 原子组件(Panel/Button/Input/Tabs/Table/Modal/Badge)。工程 MUST 仍通过 typecheck 与生产构建。

#### Scenario: 构建通过

- **WHEN** 引入 Tailwind 与 UI 原子后运行 typecheck 与 build
- **THEN** SHALL 均无错误

#### Scenario: 涨跌配色一致

- **WHEN** 展示价格/涨跌/盈亏
- **THEN** 上涨 SHALL 用绿色 token、下跌用红色 token

### Requirement: 全局无衬线字体

系统 SHALL 统一全局字体为现代无衬线字体栈（含拉丁与中文回退），数字使用无衬线 + `tabular-nums` 保持对齐，替代原等宽数字字体。该字体栈 SHALL 同时作用于 klinecharts-pro 图表工具条（周期条、指标管理、设置/搜索弹窗），不因图表组件使用独立渲染而出现字体不一致。

#### Scenario: 全局字体为无衬线

- **WHEN** 渲染页面任意文本
- **THEN** 字体 SHALL 为配置的无衬线字体栈，中文回退可用

#### Scenario: 图表工具条字体一致

- **WHEN** 渲染 klinecharts-pro 周期条/指标弹窗/搜索弹窗
- **THEN** 其文本字体 SHALL 与全局无衬线栈一致

#### Scenario: 数字对齐保留

- **WHEN** 展示价格/成交量等数字列
- **THEN** SHALL 使用 `tabular-nums` 保持等宽对齐且字体为无衬线

### Requirement: 圆润简约视觉

系统 SHALL 采用圆角、细边框、柔和阴影与克制间距的深色设计 tokens，面板/卡片/按钮圆角与 hover/active 过渡统一。

#### Scenario: 面板圆角

- **WHEN** 渲染面板/卡片/按钮
- **THEN** SHALL 应用统一圆角 tokens 与柔和边框/阴影

#### Scenario: 交互反馈

- **WHEN** 悬停或激活可交互元素
- **THEN** SHALL 有平滑的颜色/背景过渡动画

#### Scenario: 图表与面板衔接

- **WHEN** 图表区嵌入面板布局
- **THEN** 图表容器 SHALL 与面板圆角/背景衔接一致

