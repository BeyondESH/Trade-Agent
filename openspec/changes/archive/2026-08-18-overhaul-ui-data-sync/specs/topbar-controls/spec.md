## REMOVED Requirements

### Requirement: 顶栏结构与按钮态
**Reason**: 独立顶栏组件(`TopNavbar`, id=`tradingview-top-header`)已删除。其承载的品种报价、Alert/Order/主题切换入口与 klinecharts-pro 原生 chrome(周期条、绘图栏、指标/时区/设置弹窗)功能重叠;品种展示与弹窗入口由 Pro 原生 chrome 及 `DesktopTitleBar`/`GlobalNavRail` 承接,不再保留自建顶栏。
**Migration**: 删除 `App.tsx` 中 `TopNavbar` 渲染与 import;周期/指标/搜索/设置等操作统一由 klinecharts-pro 原生 chrome 提供;Alert/Order 入口若需保留,迁移到其余常驻 UI(如全局导航/标题栏)。

## MODIFIED Requirements

### Requirement: 品种搜索
系统 SHALL 提供全屏品种搜索弹窗（替代小下拉）：居中 modal，含品类 tab、结果表（symbol/品类/精度）、键盘导航；数据 SHALL 来自 datafeed `searchSymbols`（`/instruments` 单一入口）。选中后 SHALL 按 `category:instId` 同步更新图表、右栏与底部状态。搜索入口由 klinecharts-pro 原生 chrome 提供（不再依赖自建顶栏按钮），快捷键 `,` SHALL 打开弹窗，Esc/遮罩 SHALL 关闭。

#### Scenario: 搜索并选中

- **WHEN** 在弹窗输入关键字并选择搜索结果
- **THEN** 图表 symbol、右栏与状态栏 SHALL 联动切换，且采用该品种的品类与精度

#### Scenario: 快捷键打开搜索

- **WHEN** 按下 `,`
- **THEN** 搜索弹窗 SHALL 打开并聚焦输入框

### Requirement: 指标与工具弹窗桥接

系统 SHALL 通过 klinecharts-pro 原生 chrome 触发指标/时区/设置功能：指标/时区/设置均由 Pro 原生弹窗提供，增删指标即时反映到图表；桥接实现 SHALL 集中在单一模块，不散落各处。截图弹窗桥接入口 SHALL 被移除（截图/发布属范围外）。

#### Scenario: 打开指标弹窗

- **WHEN** 在 Pro 原生 chrome 点击"指标"
- **THEN** SHALL 打开指标选择弹窗，增删指标即时反映到图表

#### Scenario: 打开设置/截图

- **WHEN** 在 Pro 原生 chrome 点击设置
- **THEN** SHALL 打开设置弹窗（截图入口已移除，属范围外）