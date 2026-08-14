## ADDED Requirements

### Requirement: 全局无衬线字体

系统 SHALL 统一全局字体为现代无衬线字体栈（含拉丁与中文回退），数字使用无衬线 + `tabular-nums` 保持对齐，替代原等宽数字字体。

#### Scenario: 全局字体为无衬线

- **WHEN** 渲染页面任意文本
- **THEN** 字体 SHALL 为配置的无衬线字体栈，中文回退可用

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
