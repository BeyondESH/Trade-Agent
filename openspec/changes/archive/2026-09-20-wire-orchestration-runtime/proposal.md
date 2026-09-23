## Why

`backend/src/market_data/orchestration.py` 的 `build_orchestrator()` 定义了增量拉取、Agent 交易循环与 DL 重训三类定时任务，并在 `run_control.can_trade()` 闸门下运行交易——但生产代码从未调用它（全仓库仅测试引用）。于是 webapi 常驻运行时：Agent 循环不会自动跑、DL 重训不会跑，且 `AgentCycle.enforce`（唯一调用 `engine.enforce_circuit_breaker` 的路径）永不执行——熔断的"建议平仓"在实际服务里从不兑现：回撤达阈值时新单被拒，但已有持仓不会被自动平掉，风控只兑现了一半。

## What Changes

- 新增 Settings 开关 `MD_AGENT_SCHEDULE_ENABLED`（默认 `false`）：定时 Agent 交易与 DL 重训任务默认关闭，只有显式开启才注册/启动；开启后 kill-switch（`RunControl.can_trade()`）闸门照旧生效。
- webapi lifespan 接入编排调度器：**始终**注册并启动熔断执行安全任务（保护性平仓、不新开仓、不受 kill-switch 阻断、幂等）；当开关为真时额外注册 Agent 循环与 DL 重训任务；应用关闭时干净 `shutdown`。
- `build_orchestrator(...)`：改为按开关条件注册；`data_pull` 可缺省（webapi 的增量落盘已由既有 `build_rest_scheduler` 负责，避免重复拉取）；保留单任务失败隔离。
- `MD_AGENT_SCHEDULE_ENABLED` 写入 `backend/.env.example` 与 README 环境变量表。
- 测试：扩展 `backend/tests/test_orchestration.py`（按开关注册/不注册、熔断任务幂等平仓、失败隔离），并在 `backend/tests/test_webapi.py` 新增 lifespan 用例断言按开关注册的任务集合。

## Capabilities

### New Capabilities
- (none)

### Modified Capabilities
- `orchestration-jobs`: 定时任务的注册改为"熔断安全任务始终注册、Agent 交易与 DL 重训按 `MD_AGENT_SCHEDULE_ENABLED` 条件注册"，并明确熔断任务不受 kill-switch 阻断。
- `circuit-breaker-enforcement`: 新增"熔断自动执行与幂等"要求——服务运行期按周期自动执行熔断、按最新价平掉触发持仓、不新开仓、幂等。

## Impact

- **代码**：`backend/src/market_data/config.py`（新设置）、`orchestration.py`（条件注册 + 熔断任务）、`webapi.py`（lifespan 接线 + `app.state` 暴露）、`backend/.env.example`、`README.md`、`backend/tests/test_orchestration.py`、`backend/tests/test_webapi.py`。
- **行为**：默认（开关关闭）服务不再半边风控——熔断执行开始自动运行；Agent 自动交易与重训在未显式开启前不会自动下单或训练，行为变更保守。
- **API**：无新增/变更端点。
- **风险**：低-中。熔断执行会真实平仓（默认纸面环境）；交易自动化默认关闭保证不会静默开启自动下单。
