## 1. DB 基础

- [x] 1.1 `db.py` SCHEMA_SQL 新增 `stream_events`（`id bigserial` 游标 + `(thread_id,id)` 索引）
- [x] 1.2 新增 `proposals`（`proposal_id` PK、`produced_at`、`kind`、`record` jsonb、`id bigserial`）
- [x] 1.3 新增 `runs`（`run_id` PK、`thread_id`/`kind`/`status`/`started_at`/`finished_at`、`record` jsonb、`id bigserial`）

## 2. store 迁移（API 不变）

- [x] 2.1 `append_proposal` / `append_run` / `append_stream_event` 改为 SQL upsert/insert
- [x] 2.2 `list_proposals` / `list_runs` / `get_proposal` / `get_run` 语义不变（追加序反向、`since_ms`、`limit>0 else []`）
- [x] 2.3 `read_stream` 游标重定义为全局行 id；`read_stream(thread,0)` 表示从头
- [x] 2.4 新增 `has_stream`；退役 `stream_path`（保留 `safe_thread_component` 仅供导入脚本）
- [x] 2.5 `webapi.py` SSE 路由改用 `has_stream` + 行 id 游标（帧格式/终止/ping/轮询不变）
- [x] 2.6 `runtime.py` 的 `ProjectionStore` 改注入 `settings.postgres_dsn`

## 3. 一次性导入

- [x] 3.1 `scripts/import_agent_projections_to_pg.py`：读 `proposals.jsonl`（`model_validate` → `record` + 索引列）
- [x] 3.2 读 `runs.jsonl`（索引列）
- [x] 3.3 读 `streams/*.jsonl`；用 runs 反查真实 thread id；无匹配则告警回退
- [x] 3.4 幂等（upsert / 按 thread 先删后插）、`--dry-run`、源缺失退出 0、不删源文件

## 4. 测试

- [x] 4.1 `conftest.py`：`_DB_TABLES` 纳入三表；`live_server` 播种改为 DB 写入
- [x] 4.2 重写 `test_agent_store.py`（游标/等价语义）
- [x] 4.3 重写 `test_agent_api.py`（注入测试库；SSE 跑到 `done`）
- [x] 4.4 `test_agent_runtime.py` 注入测试库 store
- [x] 4.5 全量回归 + `ruff check` / `ruff format --check`

## 5. 规格

- [x] 5.1 `openspec/specs/strategy-proposal/spec.md`：落盘→PostgreSQL 持久化
- [x] 5.2 `openspec/specs/agent-runtime/spec.md`：worker 独占写投影表、FastAPI 只读
- [x] 5.3 本 change 的 delta specs
- [ ] 5.4 `docs/diagrams/**` 若画文件型投影则标注 stale（本次不编辑，见报告）
