# orchestration-jobs Specification

## Purpose
TBD - created by archiving change automation-orchestration. Update Purpose after archive.
## Requirements
### Requirement: 编排定时任务

系统 SHALL 注册周期性编排任务:增量拉数据、Agent 交易循环、DL 重训/回测,均复用调度骨架且**受 kill-switch 约束**。

#### Scenario: 注册任务

- **WHEN** 构建编排调度器
- **THEN** 系统 SHALL 注册数据拉取、Agent 循环与 DL 重训三类任务

#### Scenario: kill-switch 跳过交易任务

- **WHEN** kill-switch 打开时到达 Agent 循环任务
- **THEN** 系统 SHALL 跳过交易且不下单

#### Scenario: 任务失败隔离

- **WHEN** 某次任务抛错
- **THEN** 系统 SHALL 记录错误且不影响后续调度

