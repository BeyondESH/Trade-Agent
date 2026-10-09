## 1. Postgres compose 服务

- [x] 1.1 `compose.yaml` 新增 `postgres` 服务：`postgres:16`、`restart: unless-stopped`、命名卷 `trade-pgdata` → `/var/lib/postgresql/data`、`POSTGRES_USER/PASSWORD/DB` 取自仓库根 `.env`（`.env.example` 提供占位符）
- [x] 1.2 宿主端口发布为 `5433:5432`（避免与宿主 Postgres 的 5432 冲突）
- [x] 1.3 `pg_isready` healthcheck；`dev` 增加 `depends_on: postgres: {condition: service_healthy}`
- [x] 1.4 镜像从 `docker.m.daocloud.io/library/postgres:16` 拉取并 retag 为 `postgres:16`（本环境 `registry-1.docker.io` 不可达）

## 2. 依赖与配置

- [x] 2.1 `pyproject.toml`：移除 `langgraph-checkpoint-sqlite`，加入 `langgraph-checkpoint-postgres` + `psycopg[binary]` + `psycopg-pool`（按仓库精确定版风格）
- [x] 2.2 重新生成 `backend/uv.lock`（`uv lock`，不手改）
- [x] 2.3 `config.py` 新增 `postgres_dsn`（env `MD_POSTGRES_DSN`，默认指向 compose 服务、无默认口令）；`agent_checkpoint_path` 标注为仅迁移脚本使用的 legacy

## 3. 切换 saver

- [x] 3.1 `runtime.py` 用同步 `PostgresSaver` 替换 `SqliteSaver`；调用 `setup()`；连接 autocommit + `dict_row`
- [x] 3.2 删除 `sqlite3` / `SqliteSaver` 导入与 `_conn` 类型；`stop()` 显式 `close()` 不泄漏连接
- [x] 3.3 保持 `execution.py` / `research.py` 的注入式 checkpointer 缝隙不变；`AgentRuntime` 增加 `checkpointer` 注入参数供单测复用
- [x] 3.4 `tests/test_agent_runtime.py` 注入 `MemorySaver`，单测不依赖真实 Postgres

## 4. 数据迁移脚本

- [x] 4.1 `backend/scripts/migrate_checkpoints_sqlite_to_pg.py`：读取 SQLite `checkpoints` + `writes`，经 `PostgresSaver.put()` 与直插 `checkpoint_writes`（保留 `idx`）写入 PG
- [x] 4.2 幂等（checkpoint upsert / write `ON CONFLICT DO NOTHING`）；支持 `--dry-run`；报告读写行数与 thread_ids
- [x] 4.3 SQLite 文件缺失时以 0 退出；文件只读打开、绝不删除

## 5. 规格与文档

- [x] 5.1 `openspec/specs/agent-runtime/spec.md`：`SQLite checkpointer` 需求改为 `Postgres checkpointer`（保留 thread_id 隔离 / 单写者 / 确定性意图）
- [x] 5.2 `docs/docker-dev.md` + `README.md`：记录 `postgres` 服务、`trade-pgdata` 卷、5433 端口、`MD_POSTGRES_DSN`、healthcheck/`depends_on`、迁移脚本用法与 legacy SQLite 文件

## 6. 验证

- [x] 6.1 `docker compose up -d --build` 两容器 Up，postgres healthy；`\dt` 见 checkpointer 表
- [x] 6.2 worker 真实写入 PG（`checkpoints`/`checkpoint_writes` 出现真实行）
- [x] 6.3 迁移脚本跑通并证明幂等；迁移后的 thread_ids 在 PG 中可见
- [x] 6.4 后端单测 288 passed；`ruff check` / `ruff format --check` 干净
- [x] 6.5 SQLite 文件与 JSON/JSONL/Parquet 存储未被改动；`/api/health`、`/api/tickers` 200 非空；`docker volume ls` 含 `trade-pgdata`
