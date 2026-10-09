## Why

`postgres-checkpointer`（checkpointer）、`postgres-json-stores`（告警/图表/BlockBeats/事件）、`postgres-candles`（OHLCV）已把几乎所有持久化迁到独立的 `postgres` 服务，迁移的**最后一块**是 **agent 投影存储**：`agent/store.py` 的 `ProjectionStore` 仍以 append-only JSONL 落在 `data_dir/agent`（`proposals.jsonl` / `runs.jsonl` / `streams/<safe_thread>.jsonl`），SSE 游标是**单连接内**的一个计数变量。JSONL 依赖 `safe_thread_component` 把 `research:123` 这类含 `:` 的 thread id 压成 Windows 合法文件名（**有损**），且 API 进程读取 worker 写入的文件存在可见性/一致性问题。

## What Changes

- `db.py` 幂等 schema bootstrap 新增 `stream_events` / `proposals` / `runs` 三张表（+ `(thread_id, id)` 与 `id DESC` 索引）。
- `agent/store.py` 的 `ProjectionStore` 改为 PostgreSQL 实现：**公共 API 与语义不变**（`append_*`、`list_proposals`/`list_runs` 的"追加序反向、`since_ms` 过滤、`limit>0 else []`"、`get_*`），仅更换介质。
- `read_stream(thread_id, cursor)` **重新定义游标**：由"已投递有效记录**计数**"改为**全局单调行 id**（`stream_events.id` bigserial）——`read_stream(thread, 0)` 表示从头，返回最后投递行的 `id` 作为下一游标。原因：每个 run 的 `seq` 在 `capture_stream` 中**重置为 0**，且 `error` 帧**无 `seq`**，不能作为游标。
- 404 存在性判定由 `stream_path(...).exists()` 改为 `has_stream(thread_id)` 查询；`stream_path` 助手退役（`safe_thread_component` 保留，仅供一次性导入脚本使用）。
- `webapi.py` 的 SSE 路由仅改存在性判定与游标变量，**帧格式 / `data:` 格式 / `done`|`error` 终止契约 / 15s ping / 0.2s 轮询不变**；不引入 `id:` 帧、不引入 `Last-Event-ID`（留待 Phase 2 HITL/跨进程恢复）。
- `runtime.py`：worker 的 `ProjectionStore` 由 `settings.agent_dir` 改为 `settings.postgres_dsn`。
- 新增一次性导入脚本 `scripts/import_agent_projections_to_pg.py`（幂等、`--dry-run`、不删源文件、源缺失退出 0）；用 `runs.jsonl` 的 `thread_id` 反查有损文件名映射。
- 测试改用 conftest 既有的 `<db>_test` fixture：重写 `test_agent_store.py`（游标语义重设计）、`test_agent_api.py`、`test_agent_runtime.py`、`conftest.py` 的投影播种。
- 规格：`strategy-proposal` 的"落盘"改为 PostgreSQL 持久化；`agent-runtime` 的"只读投影表"明确 worker 独占写、FastAPI 只读。

## Impact

- 新增：`backend/scripts/import_agent_projections_to_pg.py`、`openspec/changes/postgres-agent-projections/**`。
- 修改：`backend/src/market_data/{db,webapi}.py`、`backend/src/market_data/agent/{store,runtime}.py`、`backend/tests/{conftest,test_agent_store,test_agent_api,test_agent_runtime}.py`、`openspec/specs/{strategy-proposal,agent-runtime}/spec.md`。
- 排除（本阶段不动）：`frontend/**`、SSE 帧契约、`docs/diagrams/**`（如画文件型投影则标注 stale）、老的 `checkpoints.sqlite`。
- 旧 JSONL 文件全部保留（不删除），导入脚本只读；`data/` 源不动。
- 不引入 ORM / Alembic / 新依赖。
