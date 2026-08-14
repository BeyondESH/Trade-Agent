## ADDED Requirements

### Requirement: 策略配置编辑界面

系统 SHALL 提供界面读取并编辑 provider(agent 切换)、风控参数、系统提示与手动规则,保存到后端 `/config`,并对非法输入给出提示。

#### Scenario: 加载配置

- **WHEN** 打开策略编辑器
- **THEN** SHALL 展示当前 provider/risk/system_prompt/manual_rules

#### Scenario: 保存配置

- **WHEN** 修改参数并保存
- **THEN** SHALL 调用 PUT /config 持久化
- **AND** 保存成功后重新加载显示新值

#### Scenario: 非法输入提示

- **WHEN** 提交越界参数(后端返回 400)
- **THEN** SHALL 展示错误而不静默失败
