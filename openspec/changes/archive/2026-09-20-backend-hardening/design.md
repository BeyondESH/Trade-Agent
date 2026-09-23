## Context

`create_app` 在闭包中维护两个纯内存字典：`jobs`（`webapi.py:272`，回测/拉取任务状态，`_run_backtest` 在 657/666/677 行写入，`/jobs/{id}` 在 682-686 读取）与 `pending`（`webapi.py:273`，确认 token → `OrderBody`，`/order` 在 913 行写入，`/order/confirm` 在 921 行 `pop`）。两者都没有任何淘汰策略。

`GET /candles`（353-358 行）签名 `limit: int = 500`，直接把 limit 透传给 `_read` → `ParquetStore.read(..., limit)`。对照 `store.read`（`store.py:72-116`）：有 limit 时会“先读最新日文件、累计到 limit 即停”（94-104 行）并对结果 `frame.tail(limit)`（115-116 行）——因此 limit 越大，读入的日文件越多，直至整段历史。`/candles/recent`（360-364 行）已有 `limit > 500 → 422` 的姊妹契约（并由 `test_live_api.py:321` 覆盖）。

`RunControl`（`orchestration.py:38-45`）有 `paper_only`/`kill_switch`/`enabled` 三字段，`can_trade()` = `enabled and not kill_switch`。`PUT /control`（896-902 行）只写 `kill_switch` 与 `paper_only`，`/health`（349-350 行）与 `/control` 响应也只回传二者；`enabled` 无任何外部入口。

`RiskEngine.check_circuit_breaker`（`risk.py:158-169`）是纯函数，返回 `(tripped, message)`；`ExecutionEngine.place`（`execution.py:171-173`）在触发时直接返回拒绝结果，`ExecutionEngine.enforce_circuit_breaker`（193-196 行）在触发时返回待平仓持仓，二者都不记录任何事件。

存储约定已有三种范式：`AlertStore`（`alertstore.py`，JSON 文档 + 锁）、`BacktestHistoryStore`（`backtest_history.py`，JSON 文档 + `MAX_RUNS` 上限 + 淘汰）、`TradeJournal`（`memory.py`，append-only JSONL）。熔断事件是带时间戳的 append-only 记录，最贴近 `TradeJournal` 的 JSONL 范式。

## Goals / Non-Goals

**Goals:**
- `jobs` 与 `pending` 的增长有确定上界，且淘汰/TTL 策略明确、可测、无需后台线程。
- `GET /candles` 的 `limit` 有明确上界，与 `/candles/recent` 契约一致，杜绝整段历史读入内存。
- `RunControl.enabled` 经 `PUT /control` 可读写，`enabled=false` 阻断下单（对齐 `run-control` 规范）。
- 熔断触发被持久化记录为可读回的事件，满足 `risk-position-model` 既有场景，且该日志自身有界。

**Non-Goals:**
- 不引入 Redis/数据库等外部状态存储；不引入后台清理线程/调度器。
- 不改 `/jobs`、`/order`、`/order/confirm`、`/control` 的既有成功响应结构（仅新增字段/新增拒绝分支）。
- 不改 `risk.py` 的纯函数签名，也不改 `paper_only`/`kill_switch` 语义。
- 不为熔断事件新增 REST 读取端点（本次仅落盘 + 单测读回）。

## Decisions

**决策 1：`jobs` 采用“数量上限 + 插入顺序最旧优先淘汰”**

定义 `MAX_JOBS = 200`。新增 job 时若 `len(jobs) >= MAX_JOBS`，弹出最早插入的键（Python dict 保序，`next(iter(jobs))` 即最旧）。`/jobs/{id}` 未命中仍返回既有 404。

- 理由：确定性上界、无后台线程、不打断客户端对近期结果的轮询；与 `BacktestHistoryStore` 的“上限 + 淘汰”思路一致。
- 备选：TTL（时间淘汰）——可能把客户端仍在轮询的任务清掉，且需时间戳比较；弃用。后台清理线程——徒增线程与生命周期管理；弃用。

**决策 2：`pending` 采用“有界 TTL + 惰性清理”**

定义 `PENDING_TOKEN_TTL_SECONDS = 300`。存储改为 `dict[str, tuple[OrderBody, float]]`（`expires_at = time.monotonic() + TTL`）。在 `/order` 写入前与 `/order/confirm` 查找时先清理所有已过期条目；确认时若条目不存在或已过期，返回既有结构化 400（`invalid or used token`）。token 仍一次性（命中即 `pop`）。

- 理由：同时约束内存与“token 泄露后可被利用的时间窗”；惰性清理避免线程；`time.monotonic()` 不受系统时钟回拨影响。
- 备选：无 TTL、仅靠一次性使用——被放弃/遗忘的 token 永久占内存；弃用。独立清理线程——同上；弃用。

**决策 3：`GET /candles` 超限 `limit` 拒绝（422）而非静默截断**

校验 `if limit < 1 or limit > MAX_CANDLE_LIMIT: raise HTTPException(422, "limit must be within 1..500")`，`MAX_CANDLE_LIMIT = 500`。

- 理由：与 `/candles/recent` 完全一致的契约（同为 422/500 上限）；静默截断会掩盖客户端 bug，且仍可能读入超预期的数据量。
- 备选：clamp 到 500——调用方无法察觉参数错误，契约不一致；弃用。保持不校验仅靠 `store.read`——无法阻止大 limit 读入整段历史；弃用。
- 备注：默认值 500 与既有合法请求（≤500）行为不变，`test_live_api.py` 的 lenient 用例（未知 timeframe 返回 200/空）不受影响。

**决策 4：`PUT /control` 暴露 `enabled`**

`ControlBody` 增加 `enabled: bool | None = None`；`control()` 在非 None 时写 `run_control.enabled`，响应增加 `"enabled": run_control.enabled`（`/health` 可选同步）。`enabled=false` 时 `can_trade()` 为假，`/order` 与 `/order/confirm` 走既有 403 分支。

- 理由：`run-control` 规范已要求“启用标志 + kill-switch”，当前仅缺 API 入口；这是补齐实现而非新增语义。新字段为可选，向后兼容。
- 备选：合并到 `live_enabled`——语义不同（启用/停用 vs 纸面/实盘），会造成混淆；弃用。

**决策 5：熔断事件用独立 JSONL 事件日志，在 `ExecutionEngine` 决策点写入**

新增 `backend/src/market_data/events.py`，定义 `EventLog(path, max_events=200)`：`append(kind, payload)` 写入一行 JSON（含 `id`/`ts`/`kind`/`payload`）；超过 `max_events` 时重写文件仅保留最新 N 条；`list(kind=None, limit=100)` 读回。`ExecutionEngine` 增加可选 `event_log` 参数：`place` 中熔断阻断订单时记 `kind="circuit_breaker", action="blocked"`（含 `reason`/`equity`/`peak_equity`/`drawdown`），`enforce_circuit_breaker` 触发并返回待平仓集合时记 `action="enforced"`（含 `symbols`）。`create_app` 注入 `EventLog(settings.data_dir / "events" / "circuit_breaker.jsonl")`。

- 理由：熔断事件非交易记录，写入 `TradeJournal` 会污染 `TradeRecord`/反思链路；JSONL append-only 与 `TradeJournal` 一致，且天然支持“事件流”。`risk.py` 保持纯函数，不为 IO 破坏其可测性。
- 备选：在 `risk.check_circuit_breaker` 内写日志——破坏纯函数、且每次 place 都触发；弃用。复用 `AlertStore` 的 JSON 文档——schema/职责不符；弃用。新增 REST 读端点——超出本次范围；暂不做（列为 Open Question）。
- 事件量：`place` 在熔断期每次尝试都会产生一条 `blocked`，由 `MAX_EVENTS` 上限收敛；如需降噪可后续加“状态翻转才记”的闩锁。

## Risks / Trade-offs

- [`jobs` 淘汰可能让长轮询的旧任务变 404] → 上限 200 对单实例交互式使用远高于并发量；且任务完成后客户端通常立即读取。
- [token TTL 300s 可能让慢用户确认时遇到 400] → 5 分钟对“提交→确认”的两步操作足够；过期返回结构化 400 且可重新 `/order` 获取新 token。
- [事件日志重写可能在大目录下抖动] → 仅在超过 200 条时重写；写入加锁（与 AlertStore/BacktestHistoryStore 一致）。
- [熔断 `blocked` 事件可能高频重复] → 由 `MAX_EVENTS` 有界；必要时后续引入翻转闩锁（记录在 Open Questions）。
- [`/control` 新增字段若前端严格解析响应可能受影响] → 仅新增字段，既有字段与类型不变，JSON 消费向后兼容。

## Migration Plan

1. 新增 `events.py` 与 `EventLog`（含单测）。
2. 改 `webapi.py`：`jobs` 淘汰、`pending` TTL、`/candles` 上限、`/control` 的 `enabled`、事件日志注入。
3. 改 `execution.py`：`ExecutionEngine` 接收 `event_log` 并在两个决策点写入。
4. 回归：`cd backend && python -m pytest tests/test_webapi.py tests/test_execution.py -q`，再 `python -m pytest -q`；L2：`python -m pytest tests/test_live_api.py -q`。
5. 回滚：改动为分层小步，逐项 revert 即可；新增文件 `events.py` 独立，删除不影响既有路径。

## Open Questions

- 是否为熔断事件新增只读端点（如 `GET /risk/events`）供前端展示——本次不做，待前端需求确认。
- `blocked` 事件是否改为“仅在进入熔断态时记录一次”（翻转闩锁）以进一步降噪。
- `MAX_JOBS`/`PENDING_TOKEN_TTL_SECONDS`/`MAX_EVENTS` 是否需要暴露为 `MD_*` 可配项（当前为模块常量）。
