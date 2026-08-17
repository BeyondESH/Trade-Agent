# topbar-controls Specification

## Purpose
TBD - created by archiving change tradingview-ui-shell. Update Purpose after archive.
## Requirements
### Requirement: 顶栏结构与按钮态

系统 SHALL 以 38px 单行、永不换行的全局顶栏呈现，分组间用 1px 竖线分隔；按钮态为默认透明底 → hover `#2a2e39` 圆角 4px → active 文字 `#2962ff`，无边框无渐变。顶栏 MUST NOT 包含截图/发布入口（范围外功能）。

#### Scenario: 顶栏分区

- **WHEN** 打开应用
- **THEN** 顶栏 SHALL 从左到右依次呈现 品种 / 周期 / 图表类型 / 指标 / 模板·警报 / 布局·保存·设置·时区·账户 分组，并以 1px 竖线分隔；SHALL NOT 出现截图或发布按钮

#### Scenario: 按钮态

- **WHEN** 悬停或点击顶栏按钮
- **THEN** SHALL 呈现 hover 底色圆角 4px 与 active 高亮色

### Requirement: 品种搜索

系统 SHALL 提供全屏品种搜索弹窗（替代小下拉）：居中 modal，含品类 tab、结果表（symbol/品类/精度）、键盘导航；数据 SHALL 来自 datafeed `searchSymbols`（`/instruments` 单一入口）。选中后 SHALL 按 `category:instId` 同步更新顶栏、图表、右栏与底部状态。快捷键 `,` SHALL 打开弹窗，Esc/遮罩 SHALL 关闭。

#### Scenario: 搜索并选中

- **WHEN** 在弹窗输入关键字并选择搜索结果
- **THEN** 顶栏品种、图表 symbol、右栏与状态栏 SHALL 联动切换，且采用该品种的品类与精度

#### Scenario: 快捷键打开搜索

- **WHEN** 按下 `,`
- **THEN** 搜索弹窗 SHALL 打开并聚焦输入框

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

系统 SHALL 隐藏 vendor 周期条，通过自建顶栏按钮触发指标/时区/设置功能：指标按钮 SHALL 打开指标选择弹窗，设置齿轮/时区 SHALL 打开对应弹窗；桥接实现 SHALL 集中在单一模块，不散落各处。截图弹窗桥接入口 SHALL 被移除（截图/发布属范围外）。

#### Scenario: 打开指标弹窗

- **WHEN** 点击顶栏"指标"
- **THEN** SHALL 打开指标选择弹窗，增删指标即时反映到图表

#### Scenario: 打开设置/截图

- **WHEN** 点击齿轮按钮
- **THEN** SHALL 打开设置弹窗（截图入口已移除，属范围外）

