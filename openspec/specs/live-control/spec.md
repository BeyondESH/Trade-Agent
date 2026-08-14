# live-control Specification

## Purpose
TBD - created by archiving change web-api. Update Purpose after archive.
## Requirements
### Requirement: 运行控制

系统 SHALL 提供 kill-switch 与实盘开关(默认关);kill-switch 打开时 MUST 拒绝一切下单。

#### Scenario: kill-switch 拒单

- **WHEN** kill-switch 打开时提交下单
- **THEN** 系统 SHALL 拒绝且不执行

#### Scenario: 实盘默认关闭

- **WHEN** 未显式开启实盘
- **THEN** 下单确认 SHALL 走纸面

### Requirement: 实盘 confirm-token 两步下单

系统 SHALL 将实盘下单拆为两步:提交先做风控预检并返回一次性 token(不下单);确认携带 token 才经 #4/#3 闸门执行。风控预检不通过 MUST 不发 token。

#### Scenario: 提交返回 token

- **WHEN** 提交一个通过风控预检的订单
- **THEN** 系统 SHALL 返回一次性 token 与决策预览
- **AND** 此步不下单

#### Scenario: 确认后执行

- **WHEN** 携带有效 token 确认
- **THEN** 系统 SHALL 经执行层(纸面或实盘按开关)执行并返回结果
- **AND** 该 token 失效不可重用

#### Scenario: 风控预检失败不发 token

- **WHEN** 提交的订单被风控拒绝
- **THEN** 系统 SHALL 不返回可用 token

