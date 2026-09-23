## 1. 配置与文档

- [x] 1.1 在 `backend/src/market_data/config.py` 的 `Settings` 新增 `agent_schedule_enabled: bool = False`（env_prefix `MD_` → `MD_AGENT_SCHEDULE_ENABLED`）
- [x] 1.2 在 `backend/.env.example` 增加注释说明与 `MD_AGENT_SCHEDULE_ENABLED=false`
- [x] 1.3 在 `README.md` 环境变量表新增 `MD_AGENT_SCHEDULE_ENABLED | false | 是否启用定时 Agent 交易与 DL 重训（默认关闭；熔断执行安全任务始终运行）`

## 2. 编排器改造（orchestration.py）

- [x] 2.1 `build_orchestrator(...)`：`data_pull` 改为可选，`None` 时不注册 `data_pull` 任务
- [x] 2.2 始终注册 `circuit_breaker` 任务；仅当 `getattr(settings, "agent_schedule_enabled", True)` 为真时注册 `agent_cycle`、`retrain`
- [x] 2.3 新增 `run_circuit_breaker(cycle, store, settings)`：以 `cycle.engine.enforce_circuit_breaker()` 结果逐标的取 store 最新收盘价并 `cycle.close_position(..., "circuit breaker")`；无价则 warning 跳过且不中断其他标的
- [x] 2.4 熔断任务不检查 `run_control.can_trade()`；保留全部任务的 try/except 失败隔离

## 3. webapi lifespan 接线

- [x] 3.1 在增量 scheduler 之后构建 `AgentCycle(...)`（复用 `engine`/`journal`/`run_control`）与编排调度器（`data_pull=None`），启动；异常仅 warning
- [x] 3.2 暴露 `app.state.orchestrator`（并将 `ingest_scheduler` 挂 `app.state.ingest_scheduler`）供测试断言
- [x] 3.3 lifespan `finally` 中调用 `orchestrator.shutdown(wait=False)`
- [x] 3.4 确认 `schedule_interval_seconds <= 0` 时既不起增量 scheduler 也不起编排调度器

## 4. 测试

- [x] 4.1 `backend/tests/test_orchestration.py`：`agent_schedule_enabled=False` 时任务 id 集合含 `circuit_breaker`、不含 `agent_cycle`/`retrain`；为 `True` 时三者齐备
- [x] 4.2 `backend/tests/test_orchestration.py`：构造触发回撤的持仓，`run_circuit_breaker` 平仓并写入交易日志；再次运行不产生重复平仓
- [x] 4.3 `backend/tests/test_orchestration.py`：某持仓无可读价格时被跳过，其余标的仍平仓且不抛错
- [x] 4.4 `backend/tests/test_webapi.py`：`with TestClient(create_app(settings, stream=_FakeStream(...), market=_FakeMarket(), news_broker=_FakeNewsBroker())) as c:` 断言 `c.app.state.orchestrator` 任务集合按开关注册；flag=false 时不出现 `agent_cycle`

## 5. 验证

- [x] 5.1 运行 `backend/.venv/Scripts/python.exe -m pytest tests/test_orchestration.py tests/test_webapi.py -q` 全绿
