# agent-analysis-ui Specification

## Purpose
TBD - created by archiving change ai-agent-page. Update Purpose after archive.
## Requirements
### Requirement: 决策面板

Tab2 SHALL 允许用户经 POST /agent/decide 请求一次结构化决策,并展示 action/side/reference_price/reason/confidence。

#### Scenario: 只出建议

- **WHEN** 用户点击 Ask Agent
- **THEN** 系统 SHALL 调用 /agent/decide 并渲染决策卡片
- **AND** 不产生任何下单

### Requirement: 纸面循环面板

Tab2 SHALL 允许用户经 POST /agent/cycle 运行一次记忆增强的纸面循环,并展示执行结果。

#### Scenario: 运行循环

- **WHEN** 用户点击 Run Cycle
- **THEN** 系统 SHALL 调用 /agent/cycle 并渲染结果(决策、风控闸门结果、持仓变化)

### Requirement: 组合与日志

Tab2 SHALL 展示 GET /portfolio 的组合状态(权益/持仓)与 GET /journal 的交易日志。

#### Scenario: 刷新组合

- **WHEN** 用户进入 Tab2 或点击刷新
- **THEN** 系统 SHALL 拉取并展示 equity、peak_equity 与持仓列表

#### Scenario: 交易日志

- **WHEN** /journal 返回交易记录
- **THEN** 系统 SHALL 以表格渲染,含盈亏与平仓原因

### Requirement: Agent 配置

Tab2 SHALL 提供绑定 /config 的表单,编辑 provider、风控参数、system_prompt 与 manual_rules。

#### Scenario: 保存配置

- **WHEN** 用户编辑上述字段并保存
- **THEN** 系统 SHALL PUT 完整配置并展示响应确认

