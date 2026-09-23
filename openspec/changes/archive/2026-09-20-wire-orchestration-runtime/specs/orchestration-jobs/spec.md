## MODIFIED Requirements

### Requirement: 编排定时任务

系统 SHALL 在常驻运行（webapi lifespan）中启动编排调度并复用既有 APScheduler 骨架。增量落盘沿用既有 incremental scheduler；编排调度器 SHALL **始终注册熔断执行任务**，并 SHALL 在 `MD_AGENT_SCHEDULE_ENABLED` 为 `true` 时额外注册 Agent 交易循环与 DL 重训任务——该开关 SHALL 默认 `false`（默认不自动交易、不自动训练）。Agent 交易循环任务 SHALL 受 kill-switch（`RunControl.can_trade()`）约束；熔断执行任务为保护性平仓、不新开仓，SHALL NOT 被 kill-switch 阻断。任一任务抛错 SHALL 被记录且不影响后续调度。

#### Scenario: 默认不自动交易与训练

- **WHEN** 服务启动且 `MD_AGENT_SCHEDULE_ENABLED` 未设置或为 `false`
- **THEN** 编排调度器 SHALL NOT 注册 Agent 交易循环与 DL 重训任务
- **AND** 系统 SHALL NOT 因编排而产生任何自动下单或自动训练

#### Scenario: 显式开启后注册交易与重训

- **WHEN** `MD_AGENT_SCHEDULE_ENABLED=true` 且服务启动
- **THEN** 编排调度器 SHALL 注册 Agent 交易循环与 DL 重训任务

#### Scenario: 始终注册熔断安全任务

- **WHEN** 服务启动（无论 `MD_AGENT_SCHEDULE_ENABLED` 取值）
- **THEN** 编排调度器 SHALL 注册熔断执行任务并启动

#### Scenario: kill-switch 跳过交易任务

- **WHEN** kill-switch 打开时到达 Agent 循环任务
- **THEN** 系统 SHALL 跳过交易且不下单

#### Scenario: 熔断任务不受 kill-switch 阻断

- **WHEN** kill-switch 打开时到达熔断执行任务
- **THEN** 系统 SHALL 仍执行保护性平仓，不因 kill-switch 跳过

#### Scenario: 任务失败隔离

- **WHEN** 某次任务抛错
- **THEN** 系统 SHALL 记录错误且不影响后续调度

#### Scenario: 注册任务

- **WHEN** 构建编排调度器
- **THEN** 系统 SHALL 始终注册熔断安全任务；数据拉取任务 SHALL 仅在提供 `data_pull` 时注册；Agent 循环与 DL 重训 SHALL 仅在 `MD_AGENT_SCHEDULE_ENABLED=true` 时注册
