## MODIFIED Requirements

### Requirement: Postgres checkpointer

系统 SHALL 使用 `langgraph-checkpoint-postgres` 的 `PostgresSaver` 作为两张图的 checkpointer，按 `thread_id` 隔离运行；worker SHALL 是 checkpointer 的唯一写者。PostgreSQL SHALL 由独立的 `postgres` 服务提供，worker 经 `MD_POSTGRES_DSN` 连接并调用 `setup()` 建立 schema；同步 worker SHALL 使用同步 `PostgresSaver`。

#### Scenario: 运行隔离

- **WHEN** 同一次循环运行研究图与执行图
- **THEN** 二者 SHALL 使用不同 `thread_id`，状态互不可见

#### Scenario: 单写者

- **WHEN** API 进程读取运行状态
- **THEN** SHALL 只读投影表，MUST NOT 写 checkpointer

### Requirement: 运行配置

系统 SHALL 经 `Settings`（`MD_` 前缀）暴露 agent/risk 配置（模型标识、循环周期、风控上限、纸面初始权益、checkpointer DSN `MD_POSTGRES_DSN`），并 SHALL 同步 `backend/.env.example`。

#### Scenario: 配置一致

- **WHEN** `Settings` 新增字段
- **THEN** `backend/.env.example` SHALL 在同一变更内同步
