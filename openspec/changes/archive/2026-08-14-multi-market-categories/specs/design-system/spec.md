## MODIFIED Requirements

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
