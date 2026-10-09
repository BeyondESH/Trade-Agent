## 1. DB 基础

- [x] 1.1 新增 `backend/src/market_data/db.py`：`Database`（`psycopg_pool`，`autocommit`+`dict_row`+`prepare_threshold=0`）、`DatabaseUnavailable`、`get_database`/`reset_databases`
- [x] 1.2 幂等 schema bootstrap：一个事务内 `pg_advisory_xact_lock` + `CREATE TABLE IF NOT EXISTS`（alerts/chart_config/blockbeats_cache/events），DDL 以 `prepare=False` 执行
- [x] 1.3 连接失败抛 `DatabaseUnavailable`（清晰失败，不静默空数据）
- [x] 1.4 复用 `MD_POSTGRES_DSN`；不新增依赖（`psycopg`/`psycopg-pool` 已在 lock）

## 2. store 迁移

- [x] 2.1 `alertstore.py`：`list/create/update/delete` 迁移到 `alerts` 表，`ORDER BY seq DESC`，校验不变
- [x] 2.2 `chartstore.py`：`load/get/save` 迁移到 `chart_config`，`state` 为 jsonb，校验/上限/key 不规范化不变；每行 upsert 原子化
- [x] 2.3 `blockbeats_cache.py`：`has_cache/load_cache/save_cache/refresh_all` 迁移到 `blockbeats_cache` 表，`cache_key`=文件名 stem
- [x] 2.4 `events.py`：`EventLog` 迁移到 `events` 表，`(source, seq)` 主键 + 每源上限
- [x] 2.5 `webapi.py`：`create_app(database=...)`、lifespan `bootstrap()`、`DatabaseUnavailable`→503、blockbeats 绑定同一 `Database`

## 3. 一次性导入脚本

- [x] 3.1 `scripts/import_alerts_to_pg.py`（`seq` 由下标反推 + `setval`）
- [x] 3.2 `scripts/import_chart_to_pg.py`（key `split("/",2)`）
- [x] 3.3 `scripts/import_blockbeats_to_pg.py`（stem→`cache_key`，保留 `fetched_at`）
- [x] 3.4 `scripts/import_events_to_pg.py`（无生产文件则报告、退出 0）
- [x] 3.5 全部幂等、`ON CONFLICT DO UPDATE`、支持 `--dry-run`、不删源文件

## 4. 测试

- [x] 4.1 `conftest.py`：派生/创建 `trade_test` 库、`pg_database`/`pg_db` fixture、`TRUNCATE RESTART IDENTITY` 隔离、无 Postgres 时 skip
- [x] 4.2 `pyproject.toml` 注册 `db` marker
- [x] 4.3 重写 `test_chartstore.py`（含并发不丢更新）、`test_events.py`（含每源上限）、`test_blockbeats_cache.py`
- [x] 4.4 更新 `test_webapi.py`（alerts/chart/news/lifespan）与 `test_blockbeats.py` 注入测试库
- [x] 4.5 `test_agent_execution.py` 的 `EventLog` 改用测试库
- [x] 4.6 `live_server` fixture 注入测试 DSN（L2 不触生产库）
- [x] 4.7 全量回归：`pytest -q -m "not integrity and not live and not online"`（288 → 291 passed）；`ruff check`/`ruff format --check` 干净

## 5. 规格

- [x] 5.1 `openspec/specs/alerts-backend/spec.md`：存储介质改为 PostgreSQL
- [x] 5.2 `openspec/specs/blockbeats-data-cache/spec.md`：分文件→按参数组合记录；持久化介质改 PostgreSQL
- [x] 5.3 新增本 change 的 delta specs（alerts-backend / blockbeats-data-cache）
- [ ] 5.4 `docs/diagrams/**` 若仍画文件型存储则标注为 stale（本次不编辑，见报告）
