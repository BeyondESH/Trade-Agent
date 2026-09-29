# agent-runtime Specification

## Purpose

独立 worker 进程、两层 LangGraph 图的运行时装配、SQLite checkpointer 与定时自治循环。本能力是 Phase 1 的宿主层，FastAPI 保持无状态。

## ADDED Requirements

### Requirement: 独立 worker 进程

系统 SHALL 提供一个与 FastAPI 分离的 worker 进程，经 CLI 子命令启动，承载研究与执行两张图；FastAPI 进程 MUST NOT 构建或调用任何 LLM。

#### Scenario: 启动 worker

- **WHEN** 运行 `market-data agent-worker`
- **THEN** SHALL 启动独立进程并装配两张图
- **AND** 缺少模型凭据时 FastAPI 进程 SHALL NOT 因此启动失败

#### Scenario: FastAPI 无 LLM

- **WHEN** 检查 FastAPI 进程的导入图
- **THEN** MUST NOT import `deepagents` / LLM provider 或实例化任何模型

### Requirement: 定时自治循环

worker SHALL 以可配置周期运行自治闭环（研究 → 提案 → 执行）；同一 worker 内循环 SHALL 单实例、不重叠。

#### Scenario: 周期触发

- **WHEN** 到达既定周期
- **THEN** worker SHALL 依次运行研究图与（当提案有效时）执行图
- **AND** 上一轮未结束时 MUST NOT 并发启动新一轮

### Requirement: SQLite checkpointer

系统 SHALL 使用 `langgraph-checkpoint-sqlite` 的 `SqliteSaver` 作为两张图的 checkpointer，按 `thread_id` 隔离运行；worker SHALL 是 checkpointer 的唯一写者。

#### Scenario: 运行隔离

- **WHEN** 同一次循环运行研究图与执行图
- **THEN** 二者 SHALL 使用不同 `thread_id`，状态互不可见

#### Scenario: 单写者

- **WHEN** API 进程读取运行状态
- **THEN** SHALL 只读投影表，MUST NOT 写 checkpointer

### Requirement: 运行控制

系统 SHALL 提供 kill-switch（默认允许纸面执行）；关闭后 worker SHALL 停止发起新的执行图运行，但 SHALL 继续可研究。

#### Scenario: 停机

- **WHEN** kill-switch 关闭
- **THEN** worker SHALL NOT 发起新的执行图运行
- **AND** 研究图 SHALL 仍可运行

### Requirement: 运行配置

系统 SHALL 经 `Settings`（`MD_` 前缀）暴露 agent/risk 配置（模型标识、循环周期、风控上限、纸面初始权益、checkpointer 路径），并 SHALL 同步 `backend/.env.example`。

#### Scenario: 配置一致

- **WHEN** `Settings` 新增字段
- **THEN** `backend/.env.example` SHALL 在同一变更内同步
