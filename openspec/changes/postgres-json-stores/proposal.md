## Why

`postgres-checkpointer` 已把 LangGraph checkpointer 迁到 `postgres` 服务，Phase 2 需要一致的持久化底座。目前三处仍落在本地 JSON/JSONL 文件：`alertstore`（非原子整文件写）、`chartstore`（**完全无锁，存在丢更新**）、`blockbeats_cache`（每参一文件）、`events`（有界 JSONL）。本次（phase 1）把这三处 JSON 存储 + 事件日志统一迁到 PostgreSQL，为后续 OHLCV/投影阶段打基础。

## What Changes

- 新增 `market_data/db.py`：`psycopg` + `psycopg_pool` 连接池 + 幂等 schema bootstrap（advisory-locked），**不引入 SQLAlchemy/Alembic**。
- `alertstore` / `chartstore` / `blockbeats_cache` / `events` 改为读写 PostgreSQL，**保持公共 API、返回形状、排序与校验语义不变**（绘图上限、pane 校验、缺失→空模板、告警最新在前、事件有界）。
- 借事务修复真实并发缺陷：chartstore 的丢更新、alerts 的非原子整文件写。
- 新增 4 个一次性导入脚本（幂等、`--dry-run`、不删源文件、源缺失退出 0）。
- 测试引入专用 `trade_test` 数据库 fixture；无 Postgres 时按 `db` marker 跳过（容器内实际运行）。
- 规格：`alerts-backend`、`blockbeats-data-cache` 的存储介质由文件改为 PostgreSQL（durability/行为要求保留）。

## Impact

- 新增：`backend/src/market_data/db.py`、`backend/scripts/import_*_to_pg.py`、`openspec/changes/postgres-json-stores/**`。
- 修改：`backend/src/market_data/{alertstore,chartstore,blockbeats_cache,events,webapi}.py`、`backend/tests/{conftest,test_chartstore,test_events,test_blockbeats_cache,test_blockbeats,test_webapi,test_agent_execution}.py`、`backend/pyproject.toml`（新增 `db` marker）、`openspec/specs/{alerts-backend,blockbeats-data-cache}/spec.md`。
- 排除：OHLCV/Parquet（`store.py`）、agent 投影（`agent/store.py`、SSE）及其测试留待后续阶段。
- 旧 JSON 文件全部保留（不删除），导入脚本只读。
