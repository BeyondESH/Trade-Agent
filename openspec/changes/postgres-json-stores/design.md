## Context

Phase 1 的 store 用本地文件：JSON 整文件写（alerts）、无锁 JSON（chart）、每参一文件（blockbeats）、有界 JSONL（events）。它们各自开文件、各自加锁（或不加），在并发/跨进程下不可靠。`postgres` 服务与 `MD_POSTGRES_DSN` 已由 `postgres-checkpointer` 建立，复用它是改动最小的路径。

## Goals / Non-Goals

**Goals**

- JSON/JSONL 存储迁到 PostgreSQL，公共 API 与可观察行为不变。
- 用数据库事务消除既有并发缺陷（丢更新、非原子整文件写），不新增依赖。
- 幂等 schema bootstrap，多个进程同时启动安全。
- 一次性、可重跑、不删源文件的导入脚本。

**Non-Goals**

- 不迁移 OHLCV/Parquet、agent 投影/SSE（后续阶段）。
- 不引入 SQLAlchemy/Alembic/ORM。
- 不改 API 契约、不规范化 chart key。

## Decisions

### D1: `psycopg` + `psycopg_pool`，进程级共享连接池

FastAPI 的同步路由由 anyio worker 线程执行，需要线程安全的池而非单连接；池同时避免每请求建连。`get_database(dsn)` 按 DSN 缓存一个 `Database`（`open=False`，首次使用才开池），worker 是独立进程、自然获得自己的池。连接参数复刻 checkpointer 惯用法（`autocommit=True`、`prepare_threshold=0`、`row_factory=dict_row`）。

### D2: bootstrap 用事务级 advisory lock

`CREATE TABLE IF NOT EXISTS` 在并发下仍可能 `duplicate_table`。bootstrap 在一个事务内先 `pg_advisory_xact_lock(<固定 key>)` 再执行整段 DDL，FastAPI/worker/脚本同时启动时串行化；`pg_advisory_xact_lock` 随事务结束自动释放。DDL 以 `prepare=False`（简单协议）执行，因为 `prepare_threshold=0` 会把多语句脚本当预备语句而报错。

### D3: Postgres 不可达 = 清晰失败，绝不静默空数据

`bootstrap()`/`connection()` 在失败时抛 `DatabaseUnavailable`。FastAPI 启动时 `bootstrap()` 失败即中止启动（compose 的 `depends_on: service_healthy` 保证正常路径不会发生）；运行期 store 失败经全局异常处理映射为 HTTP 503 + 明确 detail。绝不退化成"返回空列表"。

### D4: 测试用专用 `trade_test` 数据库，无 Postgres 时跳过

测试从 `MD_POSTGRES_DSN` 派生 ` <dbname>_test`（必要时 `CREATE DATABASE`），session 内 bootstrap 一次、每个用例 `TRUNCATE ... RESTART IDENTITY` 隔离。**生产库绝不触碰**。Postgres 不可达时 fixture `skip`（并注册 `db` marker），故 `pytest -q` 在无 Postgres 的机器上不会硬失败；在容器内（Postgres 在线）这些用例真实运行。

### D5: 语义保持不变，仅修并发

- alerts：`seq bigserial`，列表 `ORDER BY seq DESC` 复刻"插到最前"；创建时在 Python 生成 `id`（同旧 `uuid4().hex[:12]`）。
- chart：`state` 存 `jsonb`，key `(category,symbol,timeframe)`，**不做大小写规范化**；每行 upsert 原子化，不同 series 并发写不再互相覆盖。
- blockbeats：`cache_key` = 旧文件名 stem；`fetched_at` 存并回读为 UTC ISO。
- events：`(source, seq)` 主键，`max_events` 为**每 source** 上限（比旧的全局上限更紧，防止一个噪声源挤掉其它源历史）。

### D6: 导入用 `ON CONFLICT DO UPDATE`，`seq` 由数组下标反推

alerts 以 `seq = len - index` 复原"最新在前"，并 `setval` 复位序列；chart 以 `split("/", 2)` 还原三元组；blockbeats 以 stem 为 `cache_key` 并保留原始 `fetched_at`；events 仅当存在历史 JSONL 时导入，否则报告不存在。

## Risks / Trade-offs

| 风险 | 影响 | 缓解 |
|---|---|---|
| 既有文件型测试与新介质耦合 | 回归 | 重写 store 相关测试；`test_store.py`/`test_data_integrity.py`（OHLCV 阶段）不动 |
| 无 Postgres 环境跑全量 | 硬失败 | `db` marker + fixture skip；容器内实跑 |
| 多语句 DDL 被预备 | 启动失败 | `execute(SCHEMA_SQL, prepare=False)` |
| events 由全局上限改为每源上限 | 语义微调 | 记录于 D5；重写对应测试 |

## Migration Plan

1. 编写 `db.py` 与四个 store 的 PG 实现（API 不变）。
2. `webapi.create_app` 注入 `Database`、lifespan bootstrap、503 处理。
3. 运行导入脚本灌入旧 JSON 数据（幂等、可重跑）。
4. 重写/新增测试，容器内全量回归。
5. 回滚：revert 代码即可；旧 JSON 文件保留，Postgres 数据在 `trade-pgdata` 卷。

## Open Questions

- 后续阶段（OHLCV/投影）是否也纳入同一 `db.py` 池？（届时再定）
