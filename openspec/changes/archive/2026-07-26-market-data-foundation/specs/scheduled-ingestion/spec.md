## ADDED Requirements

### Requirement: 定时增量拉取任务

系统 SHALL 提供定时任务骨架,可按可配置周期触发增量 K 线拉取。骨架 MUST 可被后续编排能力复用。

#### Scenario: 周期性触发

- **WHEN** 定时任务按配置周期到达
- **THEN** 系统 SHALL 对配置的品类/币种/级别执行增量拉取

#### Scenario: 周期可配置

- **WHEN** 用户修改任务周期配置
- **THEN** 后续调度 SHALL 按新周期执行

#### Scenario: 任务失败可观测

- **WHEN** 某次定时拉取失败
- **THEN** 系统 SHALL 记录错误日志
- **AND** 不影响下一次调度
