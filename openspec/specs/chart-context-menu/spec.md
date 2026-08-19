# chart-context-menu Specification

## Purpose
TBD - created by archiving change chart-context-menu-price-lines. Update Purpose after archive.
## Requirements
### Requirement: 主图右键菜单

系统 SHALL 在蜡烛主图（candle pane）区域支持右键上下文菜单，菜单在光标处显示并屏蔽浏览器原生菜单；菜单提供「在此添加价格线」与「在此设置价格警报」两个动作，并展示光标处的价格。

#### Scenario: 主图空白处右键

- **WHEN** 用户在蜡烛主图空白处右键点击
- **THEN** SHALL 在光标位置显示菜单，含当前光标价格，且不弹出浏览器原生菜单

#### Scenario: 非画布区域右键

- **WHEN** 用户在周期条/工具栏等 klinecharts-pro 组件上右键
- **THEN** SHALL 不显示菜单，且不屏蔽该区域的默认行为

#### Scenario: 图表未就绪时右键

- **WHEN** 图表实例尚未就绪（chart 为 null）时右键
- **THEN** SHALL 不显示菜单

#### Scenario: 关闭菜单

- **WHEN** 菜单已打开，用户点击菜单外部或按 Escape
- **THEN** SHALL 关闭菜单

### Requirement: 右键坐标转价格

系统 SHALL 将右键像素坐标换算为蜡烛主图的价格值，换算基于 klinecharts 的 `convertFromPixel` 并使用 `candle_pane` 作为目标 pane、绝对坐标作为输入；换算失败或价格非法时 SHALL 不显示菜单。

#### Scenario: 坐标换算成功

- **WHEN** 用户在主图某 y 像素位置右键且换算成功
- **THEN** SHALL 在菜单上显示该位置的换算价格

#### Scenario: 换算失败

- **WHEN** 坐标换算返回非法价格或超出主图价格范围
- **THEN** SHALL 不显示菜单

### Requirement: 菜单动作——添加价格线

系统 SHALL 在点击「在此添加价格线」时以光标价格创建一条当前品种的参考线（非触发）。

#### Scenario: 点击添加价格线

- **WHEN** 用户点击「在此添加价格线」
- **THEN** SHALL 在当前品种创建一条价格等于光标价格的参考线并在图上绘制，菜单关闭

### Requirement: 菜单动作——设置价格警报

系统 SHALL 在点击「在此设置价格警报」时打开创建警报弹窗，并以光标价格预填价格字段。

#### Scenario: 点击设置价格警报

- **WHEN** 用户点击「在此设置价格警报」
- **THEN** SHALL 打开创建警报弹窗，价格字段预填光标价格

#### Scenario: 提交创建警报

- **WHEN** 用户在预填弹窗中确认提交
- **THEN** SHALL 创建一条当前品种的警报线（触发态）并在图上绘制

