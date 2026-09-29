# reskinned-panels Specification

## Purpose
TBD - created by archiving change frontend-okx-theme. Update Purpose after archive.
## Requirements
### Requirement: 市场列表

系统 SHALL 在左侧展示可选币种列表,支持选中高亮;无数据币种以占位显示而非报错。

#### Scenario: 选择币种

- **WHEN** 点击列表中的某币种
- **THEN** SHALL 高亮该项并联动切换当前 series

### Requirement: 底部 Tab 面板

系统 SHALL 以底部 Tab 承载筛选器与文本备注,切换 Tab 显示对应内容。原持仓/委托、成交日志与策略编辑器 Tab 已随自定义交易执行与策略能力整体移除(项目改为接入 agent harness 重建),故底部不再承载这些面板。

#### Scenario: 切换 Tab

- **WHEN** 点击某个底部 Tab
- **THEN** SHALL 显示该 Tab 的内容(如筛选器或文本备注)

#### Scenario: 策略保存保留

- **WHEN** 在底部 Tab 面板操作
- **THEN** SHALL NOT 再提供「保存策略」入口或调用 `PUT /config`；策略编辑器与 provider 配置端点已随自定义 Agent/量化层整体移除，MUST NOT 保留任何策略保存交互

