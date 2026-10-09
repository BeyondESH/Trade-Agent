## Context

Phase 1（`postgres-json-stores`）与 Phase 2（`postgres-candles`）已把 JSON/JSONL/Parquet 存储统一到 `db.py` 的连接池 + 幂等 bootstrap。agent 投影是唯一未迁移的持久化：`ProjectionStore` 写 JSONL，FastAPI 只读同一批文件。文件型设计带来三处问题：① `research:123` 等 thread id 含 `:`，需**有损**的 `safe_thread_component`；② SSE 游标是单个 HTTP 连接内的局部计数，重连即从头重放，且**无服务端游标**；③ 跨进程可见性依赖文件系统时序。

## Goals / Non-Goals

**Goals**

- agent 投影（proposals / runs / stream events）迁到 PostgreSQL，公共 API 与可观察行为不变。
- SSE 游标确定性化并落到 DB 全局单调序列；保持帧格式与终止契约不变。
- 幂等、可重跑、不删源文件的一次性导入脚本；用 `runs.jsonl` 修复有损 thread id 映射。
- 复用既有 `<db>_test` fixture 策略与 `db` marker。

**Non-Goals**

- 不引入 `Last-Event-ID` / 断线续传 / HITL（Phase 2 特性）。
- 不改 SSE 帧格式，不加 `id:` 帧，不改 `done`/`error` 终止语义、15s ping、0.2s 轮询。
- 不迁移/清理 `checkpoints.sqlite`（legacy，已由 checkpointer 阶段处理）。
- 不改 candle store 与其余五个已迁移 store；不引入 ORM/Alembic/新依赖。

## Decisions

### D1: `stream_events.id` 为全局游标，`seq` 仅作载荷保真

`capture_stream` 每个 run 从 0 重置 `seq`，且 `error` 帧无 `seq`；`seq` 无法跨 run 排序。故 `stream_events` 用 `id bigserial PRIMARY KEY` 作游标列，`seq` 原样存入 `payload` 并额外落列（保真/可审计）。`read_stream` 用 `WHERE thread_id=$1 AND id > $cursor ORDER BY id ASC`，返回最后投递行的 `id` 为下一游标；`0` 表示从头。`webapi` SSE 生成器把局部 `offset` 换成这个游标即可，逻辑不变。

### D2: 保持列表语义（追加序反向 + 时间过滤 + 限量）

`proposals` / `runs` 各带非唯一 `id bigserial` 记录追加序；列表 `ORDER BY id DESC [LIMIT n]` 精确复刻旧的 `items[-limit:]` 再 `reversed()`。`limit<=0` 直接返回 `[]`。`since_ms` 旧逻辑把 `produced_at` ISO 串（naive 视作 UTC）转整数毫秒再比 `>=`；SQL 用 `COALESCE(floor(EXTRACT(EPOCH FROM produced_at)*1000),0) >= %s` 复刻（`floor` 对齐旧的 `int(ts*1000)` 截断，`COALESCE` 对齐旧 `_produced_ms` 的 0 兜底）。`produced_at` 落 timestamptz（Python 解析时 naive→UTC，与旧一致）。

### D3: 幂等键

`proposals.proposal_id` / `runs.run_id` 为 PRIMARY KEY，`append_*` 与导入均 `ON CONFLICT ... DO UPDATE`（保留原 `id`，即保留首次追加位次）。`stream_events` 无自然键，导入按 thread **先删后插**（单事务），重跑不重复；`append_stream_event` 为纯追加（worker 唯一写者）。**已知偏差**：若同一 `proposal_id`/`run_id` 被重复 `append`，旧 JSONL 会产生第二行、列表出现两次；DB 折叠为一行。`proposal_id`/`run_id` 是契约内唯一标识，此路径为病态输入，已记录。

### D4: 有损文件名映射的修复

`safe_thread_component` 把 `:`→`_` 且有 `strip("_")`/折叠，不可逆（`research:1` 与 `research_1` 同 stem）。`runs.jsonl` 的每条记录含 `thread_id`，故导入脚本以 `safe_thread_component(thread_id) -> thread_id` 反查真实 id；无匹配的流文件退回 stem 并**打印告警**（其 `:` 无法恢复）。实测线上 `streams/research_1790665791743-BTCUSDT.jsonl` 可由 runs 精确还原为 `research:1790665791743-BTCUSDT`。

### D5: 跨进程可见性

worker 是唯一写者且逐帧同步提交（autocommit 单语句），FastAPI 读同一 PostgreSQL，故 API **立即可见** worker 新写入的帧（相比文件 tail 更确定）。

## Risks / Trade-offs

| 风险 | 影响 | 缓解 |
|---|---|---|
| `stream_events` 无自然键，重跑导入重复 | 数据重复 | 按 thread 先删后插（单事务） |
| 同一 proposal/run id 重复追加被折叠 | 病态输入列表少一行 | 记录于 D3；契约内 id 唯一 |
| jsonb round-trip 不保留对象键序 | SSE 文本键序与旧略异 | JSON 对象键序无语义；前端 `JSON.parse`；值/顺序不变 |
| 无 Postgres 环境 | 硬失败 | 复用 `db` marker + fixture skip；容器内实跑 |

## Migration Plan

1. `db.py` 加三表 DDL；实现 PG `ProjectionStore`（API 不变）。
2. `webapi.py` / `runtime.py` 注入 `Database` / `settings.postgres_dsn`。
3. 跑导入脚本灌旧 JSONL（幂等、可重跑），对照旧实现验证等价。
4. 重写投影相关测试，容器内全量回归 + ruff。
5. 回滚：revert 代码；旧 JSONL 保留，数据在 `trade-pgdata` 卷。

## Open Questions

- **可提议但本次不实现**：加 SSE `id:` 帧 + `Last-Event-ID` 续传可让重连从 DB 游标续读（`stream_events.id` 天然支持）。这属 Phase 2（HITL/跨进程恢复），且会改动前端契约，故仅记录为提案。
- 镜像/备份：`stream_events` 会无界增长（每 run 一帧行）；如需保留窗口可在后续阶段加裁剪（当前不裁剪，保持审计完整）。
