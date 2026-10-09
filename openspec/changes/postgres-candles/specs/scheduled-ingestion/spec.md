## MODIFIED Requirements

### Requirement: 定时增量拉取任务

系统 SHALL 提供定时任务骨架,可按可配置周期触发增量 K 线拉取。骨架 MUST 可被后续编排能力复用。

系统 SHALL 使该定时增量拉取任务既可在独立 CLI 命令中运行，也可在 webapi 常驻运行时随 lifespan 自动启动。两种运行方式 SHALL 复用同一任务实现与错误隔离策略。

#### Scenario: webapi 运行时自动落盘

- **WHEN** webapi 应用进入 lifespan 启动流程
- **THEN** 系统 SHALL 启动增量落盘 scheduler，按配置周期将实时数据写入 candle store（PostgreSQL）
