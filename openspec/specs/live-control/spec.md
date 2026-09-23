# live-control Specification

## Purpose
TBD - created by archiving change web-api. Update Purpose after archive.
## Requirements
### Requirement: 运行控制

系统 SHALL 提供 kill-switch、实盘开关(默认关)与全局启用标志(默认启用);三者 SHALL 均可经控制端点读取与设置。kill-switch 打开或启用标志关闭时 MUST 拒绝一切下单。

#### Scenario: kill-switch 拒单

- **WHEN** kill-switch 打开时提交下单
- **THEN** 系统 SHALL 拒绝且不执行

#### Scenario: 实盘默认关闭

- **WHEN** 未显式开启实盘
- **THEN** 下单确认 SHALL 走纸面

#### Scenario: 停用标志阻断下单

- **WHEN** 启用标志被设为关闭后提交下单
- **THEN** 系统 SHALL 拒绝且不执行
- **AND** 控制端点 SHALL 回传当前启用标志状态

#### Scenario: 启用标志可经 API 设置

- **WHEN** 通过控制端点将启用标志设为关闭或启用
- **THEN** 系统 SHALL 持久更新运行控制状态
- **AND** 后续下单 SHALL 按新状态判定

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

### Requirement: confirm-token 有界有效期

系统 SHALL 为实盘确认 token 设定有界有效期；token 超过有效期后 MUST 视为无效，确认请求 MUST 返回结构化 400 且 MUST NOT 执行下单。token 仍 MUST 保持一次性(命中即失效)。系统 SHALL 清理已过期 token，使待确认 token 的存储不无限增长。

#### Scenario: 过期 token 被拒绝

- **WHEN** 携带一个已超过有效期的 token 确认下单
- **THEN** 系统 SHALL 返回 400 与结构化错误信息
- **AND** MUST NOT 执行下单

#### Scenario: 有效期内 token 仍可用且一次性

- **WHEN** 在有效期内携带有效 token 确认下单
- **THEN** 系统 SHALL 正常执行并按开关返回结果
- **AND** 该 token 失效不可重用

