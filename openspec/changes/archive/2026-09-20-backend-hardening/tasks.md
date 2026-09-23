## 1. 后台任务有界保留（jobs）

- [x] 1.1 在 `backend/src/market_data/webapi.py` 定义 `MAX_JOBS = 200`
- [x] 1.2 新增 `_register_job(job_id, state)`（或等价）：写入 `jobs` 前若 `len(jobs) >= MAX_JOBS`，按插入顺序淘汰最旧条目；将 `_run_backtest` 中的 `jobs[job_id] = {...}` 与 `/backtest` 的 `jobs[job_id] = {"status": "running"}` 改为走该入口
- [x] 1.3 保持 `GET /jobs/{job_id}` 未命中返回既有结构化 404

## 2. confirm-token TTL（pending）

- [x] 2.1 定义 `PENDING_TOKEN_TTL_SECONDS = 300`，将 `pending` 改为 `dict[str, tuple[OrderBody, float]]`（值为 `(body, expires_at)`，`expires_at` 用 `time.monotonic()`）
- [x] 2.2 新增 `_sweep_pending()`：移除所有 `expires_at <= now` 的条目；在 `/order` 写入 token 前调用
- [x] 2.3 `/order/confirm` 查找时：先 sweep，再取条目；不存在或已过期一律返回既有结构化 400（`invalid or used token`）；命中即 `pop`，保持一次性

## 3. GET /candles limit 上限

- [x] 3.1 定义 `MAX_CANDLE_LIMIT = 500`；在 `candles()` 中校验 `if limit < 1 or limit > MAX_CANDLE_LIMIT: raise HTTPException(status_code=422, detail="limit must be within 1..500")`
- [x] 3.2 确认默认 `limit=500` 与合法范围内（≤500）行为不变，`/candles/recent` 既有校验不动

## 4. PUT /control 暴露启用标志

- [x] 4.1 `ControlBody` 增加 `enabled: bool | None = None`
- [x] 4.2 `control()` 在 `body.enabled is not None` 时设置 `run_control.enabled`，响应增加 `"enabled": run_control.enabled`
- [x] 4.3 确认 `enabled=false` 时 `/order` 与 `/order/confirm` 经 `can_trade()` 返回 403

## 5. 熔断事件记录

- [x] 5.1 新增 `backend/src/market_data/events.py`，实现 `EventLog(path, max_events=200)`：`append(kind, payload)` 写入一行 JSON（含 `id`/`ts`/`kind`/`payload`），超过 `max_events` 时重写仅保留最新 N 条；`list(kind=None, limit=100)` 读回；写入加锁（对齐 `AlertStore`/`BacktestHistoryStore` 约定）
- [x] 5.2 `ExecutionEngine.__init__` 增加可选 `event_log` 参数；`place` 熔断阻断订单时记 `kind="circuit_breaker", action="blocked"`（含 `reason`/`equity`/`peak_equity`/`drawdown`）
- [x] 5.3 `enforce_circuit_breaker` 触发并返回待平仓集合时记 `action="enforced"`（含 `symbols`）
- [x] 5.4 `create_app` 构造 `EventLog(settings.data_dir / "events" / "circuit_breaker.jsonl")` 并注入 `ExecutionEngine`

## 6. 测试

- [x] 6.1 `backend/tests/test_events.py`（新增）：`EventLog` append/list 往返、超过 `max_events` 淘汰最旧、`kind` 过滤
- [x] 6.2 `backend/tests/test_execution.py`：`ExecutionEngine(portfolio=15% drawdown, event_log=EventLog(tmp))` 的 `place` 被熔断阻断后事件日志含一条 `blocked`；`enforce_circuit_breaker` 后含一条 `enforced` 且 `symbols` 正确
- [x] 6.3 `backend/tests/test_webapi.py`：`/candles` `limit > 500`（及 `limit < 1`）返回 422，`limit=10` 正常
- [x] 6.4 `backend/tests/test_webapi.py`：`PUT /control {"enabled": false}` 回传 `enabled=false`，随后 `/order` 返回 403；`{"enabled": true}` 恢复
- [x] 6.5 `backend/tests/test_webapi.py`：提交超过 `MAX_JOBS` 个 `/backtest` 后旧 `job_id` 查询返回 404、新 `job_id` 可查
- [x] 6.6 `backend/tests/test_webapi.py`：`/order` 获取 token → 通过 monkeypatch 使 `pending` 条目过期（或直接注入过期时间）→ `/order/confirm` 返回 400；有效期内 token 仍可确认且不可重用

## 7. 验证

- [x] 7.1 运行 `cd backend && python -m pytest tests/test_events.py tests/test_execution.py tests/test_webapi.py -q` 全绿
- [x] 7.2 运行 `cd backend && python -m pytest tests/test_live_api.py -q`（L2 真实 uvicorn，确认 `/candles` 上限、`/control` 与订单流程无回归）
- [x] 7.3 运行 `cd backend && python -m pytest -q` 全量回归通过
