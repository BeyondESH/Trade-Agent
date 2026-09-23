## Context

`orchestration.py:188` 的 `build_orchestrator(cycle, data_pull, store, settings, run_control)` 返回一个 `BackgroundScheduler`，注册 `data_pull` / `agent_cycle` / `retrain` 三个 interval 任务；`_agent_job()` 先检查 `run_control.can_trade()`（`orchestration.py:204`）。`AgentCycle.enforce(price)`（`orchestration.py:145`）是 `ExecutionEngine.enforce_circuit_breaker()`（`execution.py:193`）的唯一调用方：熔断触发时返回全部持仓供平仓。

问题在于接线缺失：

- 生产代码全仓库（`backend/src`）无 `build_orchestrator` 调用点，仅 `tests/test_orchestration.py` 引用。
- `webapi.py` lifespan（`webapi.py:193`）只启动 `build_rest_scheduler`（增量落盘）与 cache/stream/market/news 等，**没有**启动编排调度器。
- 因此 `AgentCycle.enforce` 永不自动运行，`execution.py` 的熔断"给出应平仓持仓"在服务里没有消费者；`AgentCycle.step` 的 kill-switch 闸门也只对手动 `/agent/cycle` 生效。

约束：`scheduled-ingestion` 已规定 webapi lifespan 启动增量落盘 scheduler（`build_rest_scheduler`），本变更 MUST NOT 与其重复拉取；`run-control` 中 kill-switch 约束针对"下单/开仓"，熔断平仓是保护性动作。

## Goals / Non-Goals

**Goals:**
- webapi 常驻运行时启动编排调度器，使熔断执行真正自动运行。
- 定时 Agent 交易与 DL 重训默认关闭，由 `MD_AGENT_SCHEDULE_ENABLED`（默认 `false`）显式开启。
- 开关开启后，Agent 交易任务仍受 `RunControl.can_trade()` 约束。
- 熔断执行按持仓逐标的以最新可得收盘价平仓，幂等、不新开仓、不受 kill-switch 阻断。
- 干净启停，失败隔离，行为可测。

**Non-Goals:**
- 不改 `build_rest_scheduler` 增量落盘实现，不新增拉取路径。
- 不新增 REST/WS 端点，不做运行时热切换开关（需重启生效）。
- 不实现实盘熔断参数（沿用 `RiskEngine.check_circuit_breaker` 现有阈值）。

## Decisions

**决策 1：新增 `Settings.agent_schedule_enabled`（默认 `false`），交易/重训任务条件注册**

`config.py` 的 `Settings` 增加 `agent_schedule_enabled: bool = False`（env_prefix `MD_` → `MD_AGENT_SCHEDULE_ENABLED`）。`build_orchestrator` 内以 `getattr(settings, "agent_schedule_enabled", True)` 读取，仅当为真才 `add_job` `agent_cycle` 与 `retrain`。

- 理由：默认关闭使行为变更保守、不会静默开启自动下单；`getattr(..., True)` 默认值保证既有测试用 `SimpleNamespace(... schedule_interval_seconds=300)`（无该字段）时仍注册三任务，向后兼容。
- 备选：默认 `true` 并靠 kill-switch 兜底——与"未经显式确认不自动交易"的产品取向冲突，弃用。

**决策 2：熔断执行任务始终注册，且不受 kill-switch 阻断**

`build_orchestrator` 无条件注册 `circuit_breaker` 任务（interval 同 `schedule_interval_seconds`）。该任务不检查 `can_trade()`。

- 理由：`run-control` 的 kill-switch 约束语义是"不下单/不开仓"；熔断平仓是保护性减仓，若被 kill-switch 阻断则风控在最需要时失效。熔断本身就是安全停机，二者不冲突。
- 备选：熔断任务同样受 kill-switch 阻断——与 `circuit-breaker-enforcement` 的"触发时应给出并执行平仓"意图相悖，弃用。

**决策 3：webapi 编排器的 `data_pull` 传 `None`，增量拉取仍归 `build_rest_scheduler`**

`build_orchestrator` 的 `data_pull` 参数改为可选（`None` → 不注册 `data_pull` 任务）。webapi lifespan 构造编排器时传 `None`，仅在开关为真时额外出现 `agent_cycle` / `retrain`。

- 理由：避免与已在 lifespan 启动的 `build_rest_scheduler` 双重拉取；保持 `scheduled-ingestion` 行为不变。`data_pull` 仍保留给测试与未来 CLI 编排使用。
- 备选：让编排器接管增量拉取并移除 `build_rest_scheduler`——改动面大、回归风险高，弃用。

**决策 4：新增 `run_circuit_breaker(cycle, store, settings)` 任务，幂等且逐标的定价**

`orchestration.py` 新增模块级任务函数：

```python
def run_circuit_breaker(cycle, store, settings) -> list[dict]:
    tripped = cycle.engine.enforce_circuit_breaker()   # 未触发 → []
    out = []
    for pos in tripped:
        price = _latest_close(store, settings, pos.symbol)  # 遍历 settings.timeframes，取可读序列最后 close
        if price is None:
            logger.warning("circuit breaker: no price for %s; skip", pos.symbol)
            continue
        pnl = cycle.close_position(pos.symbol, price, "circuit breaker")
        out.append({pos.symbol: pnl})
    return out
```

- 幂等：`close_position` 成功后持仓从 `portfolio.positions` 移除，下一轮 `enforce_circuit_breaker()` 不再返回该持仓；无法定价的持仓保留待下轮，不会被重复平仓。
- 逐标的定价修复了 `AgentCycle.enforce(price)` 用单一价格平所有持仓的局限；`enforce` 保持原样（手动/测试仍可用）。
- 平仓经 `close_position` → `Reflector.reflect` + `journal.append`，与既有回落库路径一致。

**决策 5：可测试性——`app.state` 暴露调度器**

lifespan 把编排调度器挂到 `app.state.orchestrator`（增量 scheduler 可选挂 `app.state.ingest_scheduler`）。测试用 `with TestClient(create_app(...)) as c:` 进入 lifespan 后断言 `c.app.state.orchestrator.get_jobs()` 的 id 集合。

- 理由：无需真实网络即可验证"按开关注册/不注册"；测试注入 `_FakeStream` / `_FakeMarket` / `_FakeNewsBroker` 并预置 blockbeats 缓存，`schedule_interval_seconds` 取大值使 interval 任务在用例内不触发。

**决策 6：启停与异常隔离**

编排器启动包在 try/except（best-effort，warning 不致命），与既有 scheduler 一致；lifespan `finally` 中 `orchestrator.shutdown(wait=False)`。`schedule_interval_seconds <= 0` 时既不起增量 scheduler 也不起编排调度器（测试隔离沿用现约定）。

## Risks / Trade-offs

- [熔断任务在无行情时无法定价] → 记录 warning 并跳过该标的，下轮重试；不抛错中断其他标的，也不会重复平仓。
- [手动 `/order` 建仓不在 `AgentCycle._open_meta`] → `close_position` 回退 `pos.entry_price` 产出反思记录，可接受（纸面环境）。
- [熔断响应存在调度延迟] → 复用 `schedule_interval_seconds`（默认 300s），与既有增量调度一致；后续可独立配置更短周期。
- [开关需重启生效] → 明确为 Non-Goal；避免运行中热开启自动交易的复杂度与风险。

## Open Questions

- 熔断执行是否应独立于 `schedule_interval_seconds` 使用更短周期（如 30-60s）以缩短保护延迟？当前复用以保持骨架统一。
- 是否需要在 `/control` 返回中暴露编排调度器状态（如已注册任务）供前端展示？本变更未纳入。
