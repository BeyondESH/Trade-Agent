## ADDED Requirements

### Requirement: 顶栏结构与按钮态

系统 SHALL 以 38px 单行、永不换行的全局顶栏呈现，分组间用 1px 竖线分隔；按钮态为默认透明底 → hover `#2a2e39` 圆角 4px → active 文字 `#2962ff`，无边框无渐变。

#### Scenario: 顶栏分区

- **WHEN** 打开应用
- **THEN** 顶栏 SHALL 从左到右依次呈现 品种 / 周期 / 图表类型 / 指标 / 模板·警报 / 布局·保存·设置·全屏·截图·账户 分组，并以 1px 竖线分隔

#### Scenario: 按钮态

- **WHEN** 悬停或点击顶栏按钮
- **THEN** SHALL 呈现 hover 底色圆角 4px 与 active 高亮色

### Requirement: 品种搜索

系统 SHALL 提供品种搜索下拉（复用现有 ticker 列表），支持按 instId/名称过滤；选中后 SHALL 同步更新顶栏、图表、右栏与底部状态。快捷键 `,` SHALL 打开搜索框。

#### Scenario: 搜索并选中

- **WHEN** 输入关键字并选择搜索结果
- **THEN** 顶栏品种、图表 symbol、右栏与状态栏 SHALL 联动切换

#### Scenario: 快捷键打开搜索

- **WHEN** 按下 `,`
- **THEN** 搜索下拉 SHALL 打开并聚焦输入框

### Requirement: 周期切换

系统 SHALL 提供周期切换（1m/5m/15m/30m/1H/4H/12H/1D + 更多下拉），选中周期 SHALL 通过底层实例切换并高亮；快捷键 `1/5/15` SHALL 快速切到对应分钟周期。

#### Scenario: 周期联动

- **WHEN** 点击某个周期
- **THEN** 图表数据与 legend 周期 SHALL 切换，该周期按钮 SHALL 高亮

### Requirement: 图表类型切换

系统 SHALL 提供图表类型菜单（K线/柱状 OHLC/面积），切换 SHALL 通过 `setStyles({ candle: { type } })` 实现且不改变数据。

#### Scenario: 形态切换

- **WHEN** 选择 面积/柱状
- **THEN** 主图 SHALL 以面积/OHLC 柱状呈现，数据与指标不受影响

### Requirement: 指标与工具弹窗桥接

系统 SHALL 隐藏 vendor 周期条，通过自建顶栏按钮触发指标/时区/设置/截图功能：指标按钮 SHALL 打开指标选择弹窗，设置齿轮/截图/时区 SHALL 打开对应弹窗；桥接实现 SHALL 集中在单一模块，不散落各处。

#### Scenario: 打开指标弹窗

- **WHEN** 点击顶栏"指标"
- **THEN** SHALL 打开指标选择弹窗，增删指标即时反映到图表

#### Scenario: 打开设置/截图

- **WHEN** 点击齿轮或截图按钮
- **THEN** SHALL 打开对应设置弹窗或截图结果预览
