## Context

Phase 1 的 `SqliteSaver` 只能被单个 worker 进程使用；Phase 2 需要跨进程恢复与人审（HITL），因此 checkpointer 必须能被多个进程/进程重启后共享。PostgreSQL 作为独立 compose 服务是最小改动路径。

## Goals / Non-Goals

**Goals**

- checkpointer 后端从 SQLite 文件迁到独立 Postgres 服务，保持 `thread_id` 隔离与「worker 唯一写者」语义不变。
- 依赖、配置、迁移脚本、规格、文档一并更新，旧 SQLite 文件保留可审计。

**Non-Goals**

- 不引入连接池 / 异步 saver（Phase 1 worker 是同步 APScheduler；异步 FastAPI 侧仍只读投影文件）。
- 不改动 JSON/JSONL/Parquet 存储（`alertstore` / `chartstore` / `blockbeats_cache` / `store` / `agent/store`）。
- 不做自动化的运行时双写或回滚开关。

## Decisions

### D1: 同步 `PostgresSaver`，而非 `AsyncPostgresSaver`

worker 由 APScheduler 的同步 interval job 驱动，`capture_stream` 走同步 `graph.stream`。同步 `PostgresSaver` 与现有调用路径一致；异步 saver 需要重写为 `async` 调用链，收益为零。**代价**：FastAPI 侧若将来直接读 checkpoint，需要 `AsyncPostgresSaver`——但它目前只读投影文件，故不在本次范围。

### D2: 长连接 + 显式 `close()`，不沿用 `from_conn_string` context manager

`PostgresSaver.from_conn_string()` 是 `@contextmanager`，退出即关闭连接，常驻 worker 无法在其生命周期内保持 saver。改用 `psycopg.connect(..., autocommit=True, prepare_threshold=0, row_factory=dict_row)`（复刻 `from_conn_string` 的参数）并把连接存于实例，`stop()` 显式 `close()`。

### D3: 迁移走 `put()` 而非逐列 BLOB 复制

SQLite 与 Postgres 的**物理表结构不同**：SQLite 把整个 checkpoint（含 `channel_values`）序列化进单列，Postgres 则把非原始类型拆到 `checkpoint_blobs`、原始类型内联进 `checkpoints.checkpoint` JSONB（且 `checkpoint_writes.blob` 为 BYTEA）。因此「BLOB 逐字拷贝」不可行。迁移改为：用 `JsonPlusSerializer.loads_typed` 还原会话，再经 `PostgresSaver.put()` 重写——由库自身按其规则拆分，忠实还原。`writes` 则直插 `checkpoint_writes` 以保留 `idx`（含 `WRITES_IDX_MAP` 的负值），因为按行调用 `put_writes` 会把 `idx>0` 的普通写入错误地压成 0。

### D4: 端口 5433、配置命名 `MD_POSTGRES_DSN`、口令只存在于 gitignored `.env`

宿主发布端口用 5433 以避免与宿主既有 Postgres（5432）冲突。配置沿用 `MD_` 前缀 → `MD_POSTGRES_DSN`。提交文件（`config.py` 默认值、compose、`.env.example`）一律不含真实口令；口令只在仓库根 `.env`（已加入 `.gitignore`）。

## Risks / Trade-offs

| 风险 | 影响 | 缓解 |
|---|---|---|
| `postgres:16` 无法从 docker.io 拉取 | 服务起不来 | 经 `docker.m.daocloud.io` 镜像源拉取后 retag（与既有 python 基础镜像同法） |
| 迁移脚本用 `put()` 重写后与原始字节不完全一致 | 审计困惑 | 语义（thread_id / checkpoint_id / 状态）等价；`loads_typed`→`put()` 是库的规范往返；文档记录该决策 |
| 单测需真实 Postgres | CI 变慢/易碎 | `AgentRuntime` 增加 `checkpointer` 注入缝，单测注入 `MemorySaver` |

## Migration Plan

1. 拉取并 retag `postgres:16`；写入根 `.env`。
2. `docker compose up -d --build` 起 postgres 与 dev，确认 healthy。
3. 在容器内 `uv sync` 装新依赖；重启 dev。
4. 跑 `migrate_checkpoints_sqlite_to_pg.py` 迁移旧 checkpoints，验证幂等。
5. 回滚：代码/revert 即可；Postgres 数据在 `trade-pgdata` 卷中，SQLite 原文件保留。

## Open Questions

- Phase 2 的 FastAPI 直接读 checkpoint 时是否切换到 `AsyncPostgresSaver`？（届时再定）
