## Why

后端存在四处有界性/合规性缺口（均已核实）：

1. **内存无界增长**：`webapi.py:272` 的 `jobs: dict[str, dict] = {}` 只增不删；`webapi.py:273` 的 `pending: dict[str, OrderBody] = {}` 仅在确认时 `pop`（`webapi.py:913` 写入、`:921` 弹出），无 TTL。长跑进程下二者随回测次数与未确认下单次数单调增长。
2. **`GET /candles` 无 limit 上限**：`webapi.py:353-358` 取 `limit: int = 500` 且不校验，而姊妹端点 `GET /candles/recent`（`:360-364`）明确 `if limit > 500: raise HTTPException(422)`。过量 limit 会让 `ParquetStore.read(..., limit)` 把整段历史读入内存。
3. **启用标志不可经 API 设置**：`PUT /control`（`webapi.py:896-902`）只暴露 `kill_switch` 与 `live_enabled`；`RunControl.enabled` 字段（`orchestration.py:42`）存在且被 `can_trade()`（`:44-45`）使用，但没有任何 API 可切换它，与 `run-control` 规范“全局运行控制(启用标志 + kill-switch)”不符。
4. **熔断事件未记录**：`risk.check_circuit_breaker`（`risk.py:158-169`）只返回 `(bool, str)`，全链路没有任何落库/落盘动作；而 `risk-position-model` 规范“最大回撤熔断”的场景明确要求“触发组合回撤熔断 → 系统 SHALL 平掉相关仓位 **AND 记录一次熔断事件**”。

## What Changes

- **`jobs` 有界保留**：为 `jobs` 设定数量上限（`MAX_JOBS`，取 200）并采用按插入顺序的“最旧优先淘汰”策略；每次写入新 job 时执行淘汰，`GET /jobs/{id}` 命中已淘汰条目仍返回结构化 404。淘汰策略为纯内存、确定性，无需后台线程。
- **`pending` token TTL**：确认 token 增加有效期（`PENDING_TOKEN_TTL_SECONDS`，取 300 秒）。存储由 `dict[str, OrderBody]` 改为带过期时间的时间戳条目；在写入新 token 与确认时惰性清理过期项；`POST /order/confirm` 对过期 token 视同无效/已用，返回结构化 400。token 仍保持一次性。
- **`GET /candles` limit 上限**：对 `limit` 增加边界校验，`limit < 1` 或 `limit > 500` 一律返回 422（选择“拒绝”而非“静默截断”，与 `/candles/recent` 契约一致）；默认值保持 500，正常请求行为不变。
- **`PUT /control` 暴露启用标志**：`ControlBody` 增加 `enabled`，`PUT /control` 设置 `RunControl.enabled` 并在响应中回传（`kill_switch`/`live_enabled`/`enabled`）。`enabled=false` 时 `can_trade()` 为假，下单返回 403。
- **记录熔断事件**：新增轻量事件日志（JSONL，跟随 `TradeJournal` 的 append-only JSONL 约定），在 `ExecutionEngine` 的熔断决策点写入事件（订单被熔断阻断时记 `blocked`；执行熔断平仓时记 `enforced`，含权益/回撤/涉及标的），并在 `create_app` 中注入日志路径 `settings.data_dir/events/circuit_breaker.jsonl`。事件日志设有条目上限并做淘汰，避免自身成为新的无界增长源。
- 新增针对性测试：`backend/tests/test_webapi.py`（jobs 淘汰、token 过期、/candles limit 上限、/control enabled）与 `backend/tests/test_execution.py`（熔断事件写入）或新增 `backend/tests/test_events.py`。

## Capabilities

### New Capabilities
- (none)

### Modified Capabilities
- `market-endpoints`: 新增“K 线读取量上限”要求；新增“后台任务有界保留”要求。
- `live-control`: 运行控制要求补充“启用标志经 API 可读写”；confirm-token 要求补充“token 有界有效期”。
- `risk-position-model`: 最大回撤熔断要求补充“熔断事件 MUST 持久化记录并可读回”。

## Impact

- **代码**：`backend/src/market_data/webapi.py`（jobs 淘汰、pending TTL、`/candles` 上限、`/control` 的 `enabled`、事件日志注入）、`backend/src/market_data/execution.py`（熔断决策点写入事件）；新增 `backend/src/market_data/events.py`（事件日志存储）或等价实现。
- **测试**：`backend/tests/test_webapi.py`、`backend/tests/test_execution.py`（或新增 `backend/tests/test_events.py`）。
- **API**：`PUT /control` 响应新增 `enabled` 字段（向后兼容）；`GET /candles` 对超限 `limit` 由 200 变为 422；`POST /order/confirm` 对过期 token 由 400 `invalid or used token` 语义扩展为“无效/已用/已过期”。
- **数据**：新增 `data_dir/events/circuit_breaker.jsonl`（有上限）。
- **风险**：低。均为防御性加固与合规补齐；`jobs` 淘汰与 token TTL 对正常短时使用无感知；`_extract`-free，无外部依赖变更。
