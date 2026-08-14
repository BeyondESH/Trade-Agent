# terminal-layout Specification

## Purpose
TBD - created by archiving change frontend-okx-theme. Update Purpose after archive.
## Requirements
### Requirement: 交易终端布局

系统 SHALL 以 AppShell 呈现交易终端布局:顶栏、左侧市场列表、中间图表区、右侧下单区、底部 Tab(持仓/委托/成交日志/策略),并在窄屏下合理堆叠。

#### Scenario: 布局分区呈现

- **WHEN** 打开应用(宽屏)
- **THEN** SHALL 显示顶栏、左市场列表、中图表、右下单区、底部 Tab 五个分区

#### Scenario: 选中币种联动

- **WHEN** 在市场列表选择某币种
- **THEN** 图表、下单区与快照 SHALL 切换到该币种

