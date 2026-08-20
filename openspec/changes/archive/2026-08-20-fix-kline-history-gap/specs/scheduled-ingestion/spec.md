## MODIFIED Requirements

### Requirement: 定时增量拉取任务
系统 SHALL 提供定时任务骨架,可按配置周期触发增量 K 线拉取。该骨架 MUST 可被后续编排能力复用。

系统 SHALL 使该定时增量拉取任务既可在独立 CLI 命令中运行，也可在 webapi 常驻运行时随 lifespan 自动启动。两种运行方式 SHALL 复用同一任务实现与错误隔离策略。

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

#### Scenario: webapi 运行时自动落盘
- **WHEN** webapi 应用进入 lifespan 启动流程
- **THEN** 系统 SHALL 启动增量落盘 scheduler，按配置周期将实时数据写入 parquet store

#### Scenario: CLI 独立运行
- **WHEN** 用户以独立 CLI 命令（`schedule`）运行增量落盘
- **THEN** 系统 SHALL 以相同任务实现启动 scheduler，行为与 webapi 内嵌一致
