## Why

`agent-runtime` 规格与实现此前使用 SQLite checkpointer（Phase 1 单 worker 足够）。Phase 2 的**跨进程恢复 / HITL** 要求 checkpointer 可被多个进程共享，文件型 SQLite 不再合适。本次把 checkpointer 迁移到独立的 `postgres` compose 服务，为 Phase 2 奠基。

## What Changes

- 新增 `postgres` compose 服务（`postgres:16`、命名卷 `trade-pgdata`、宿主端口 **5433**、`pg_isready` healthcheck），`dev` 经 `depends_on: service_healthy` 等待其就绪。
- 依赖由 `langgraph-checkpoint-sqlite` 换为 `langgraph-checkpoint-postgres`（含 `psycopg[binary]` + `psycopg-pool`）。
- `AgentRuntime.build()` 改用同步 `PostgresSaver` 并调用 `setup()`；连接在 `stop()` 显式关闭。
- 新增 `MD_POSTGRES_DSN` 配置；旧 `agent_checkpoint_path` 仅保留给一次性迁移脚本。
- 新增一次性迁移脚本（SQLite → PostgreSQL，幂等、支持 `--dry-run`、报告读写行数）。

## Impact

- `compose.yaml`、`backend/pyproject.toml`、`backend/uv.lock`。
- `backend/src/market_data/config.py`、`backend/src/market_data/agent/runtime.py`。
- `openspec/specs/agent-runtime/spec.md`。
- 旧 `backend/data/agent/checkpoints.sqlite` 保留为 legacy（不删除，供审计 / 重跑）。
- 明确排除：`alertstore.py` / `chartstore.py` / `blockbeats_cache.py` / `store.py` / `agent/store.py` 等 JSON/JSONL/Parquet 存储**不是** SQLite，不在本次范围内。
