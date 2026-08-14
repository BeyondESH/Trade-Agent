# reskinned-panels Specification

## Purpose
TBD - created by archiving change frontend-okx-theme. Update Purpose after archive.
## Requirements
### Requirement: 市场列表

系统 SHALL 在左侧展示可选币种列表,支持选中高亮;无数据币种以占位显示而非报错。

#### Scenario: 选择币种

- **WHEN** 点击列表中的某币种
- **THEN** SHALL 高亮该项并联动切换当前 series

### Requirement: 下单区与确认

系统 SHALL 在右侧提供下单区(方向/杠杆/价),下单经两步确认(拿 token→确认)。既有 Submit/Confirm 行为 MUST 保留。

#### Scenario: 两步下单

- **WHEN** 在下单区提交后确认
- **THEN** SHALL 先取得 token 再携带 token 确认执行

### Requirement: 底部 Tab 面板

系统 SHALL 以底部 Tab 承载持仓/委托、成交日志、策略编辑器,切换 Tab 显示对应内容。既有策略保存与控制行为 MUST 保留。

#### Scenario: 切换 Tab

- **WHEN** 点击某个底部 Tab
- **THEN** SHALL 显示该 Tab 的内容(如策略编辑器或交易日志)

#### Scenario: 策略保存保留

- **WHEN** 在策略 Tab 修改并保存
- **THEN** SHALL 调用 PUT /config 持久化(行为与重构前一致)

