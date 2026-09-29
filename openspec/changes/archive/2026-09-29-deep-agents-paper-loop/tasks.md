# Tasks — Deep Agents 研报层 + 确定性 LangGraph 执行层（Phase 1：纸面闭环）

> 顺序：依赖与配置 → 契约 → Tier2（先能单测）→ Tier1 装配（fake 模型）→ worker 循环 → API/UI → 接真实模型。
> 红线：Tier2 零 LLM；本阶段无实盘；`FilesystemBackend`/`LocalShellBackend` 禁用。

## 1. 依赖与配置

- [x] 1.1 `backend/pyproject.toml`：新增并**锁版本** `deepagents` / `langgraph` / `langchain` / `langgraph-checkpoint-sqlite`（+ 选定 provider 的 `langchain-*`）
- [x] 1.2 `config.py`：新增 agent/risk 配置（模型标识、`MD_AGENT_LOOP_SECONDS`、`MD_AGENT_ENABLED`、kill-switch、最大杠杆、单标的名义敞口、组合敞口、最大回撤、纸面初始权益、checkpointer 路径）
- [x] 1.3 `backend/.env.example`：同步全部新增字段（含 model / provider key 占位）
- [x] 1.4 `docs`/README：记录 Phase 1 边界（纸面、无 HITL）

## 2. 契约（strategy-proposal）

- [x] 2.1 新增 `agent/proposal.py`：`StrategyProposal` pydantic 模型（含 `entry`、`action`、`evidence`、`provenance`、TTL）
- [x] 2.2 实现不变量校验（confidence 范围、TTL、action↔entry 一致性）
- [x] 2.3 单元测试：合法通过 / 非法（confidence=1.5、limit 缺价、过期）拒绝

## 3. Tier 2 执行层（确定性，先可单测）

- [x] 3.1 新增 `agent/broker.py`：确定性纸面撮合（开/平、持仓、PnL、权益、回撤熔断）
- [x] 3.2 `agent/broker.py` 单测：开仓/平仓/结算/回撤熔断
- [x] 3.3 新增 `agent/execution.py`：`StateGraph(TypedDict)`，节点 `ingest_intent→resolve_market→pre_trade_checks→risk_gate→size_position→build_order→submit→reconcile→audit`，含 `fail_closed`
- [x] 3.4 实现硬风控闸门（杠杆/敞口/回撤/kill-switch）与确定性 sizing
- [x] 3.5 实现审计事件（复用 `events.py` JSONL 模式）；幂等键
- [x] 3.6 单测：每节点 + 每条风控不变量 + fail-closed 路径 + 恢复不重复下单
- [x] 3.7 **确定性边界测试**：断言 `agent/execution.py` / `agent/broker.py` 不含 LLM import 或调用

## 4. Tier 1 研究层（Deep Agents）

- [x] 4.1 新增 `agent/tools.py`：把 `indicators/levels/smc/structure`、`newsfeed/news_broker/blockbeats`、行情封装为只读 LangChain 工具
- [x] 4.2 `agent/tools.py`：接入 `mcp_client.py` 的**只读/分析**类工具（写类一律不接）
- [x] 4.3 新增 `agent/research.py`：`create_deep_agent(model, tools, subagents=[news-analyst, technical-analyst], middleware=[TodoListMiddleware()], backend=StateBackend(), checkpointer, response_format=StrategyProposal)`
- [x] 4.4 装配测试：以 fake/录制模型跑通图构建与 `structured_response` 产出（不打真实 API）

## 5. 运行时与 worker

- [x] 5.1 新增 `agent/runtime.py`：装配两图 + `SqliteSaver`；worker 单写者
- [x] 5.2 `cli.py`：新增 `agent-worker` 子命令
- [x] 5.3 实现 APScheduler 自治循环（研究 → 提案 → 执行），单实例、不重叠
- [x] 5.4 实现 kill-switch（默认允许纸面执行，关闭后停止发起执行 run）
- [x] 5.5 实现投影写入（提案/run 状态），供 API 只读
- [x] 5.6 测试：循环单实例、kill-switch 生效、研究失败不影响执行图

## 6. API（只读 + 流式）

- [x] 6.1 `webapi.py`：新增 `GET /research/proposals`、`GET /research/proposals/{id}`
- [x] 6.2 `webapi.py`：新增 `GET /executions/{run_id}` 与 `GET /research/{thread_id}/stream`（SSE，`StreamingResponse` + `astream_events(v3)`；异步路由用 `AsyncSqliteSaver`）
- [x] 6.3 确认 FastAPI 进程无 LLM import（导入图断言）
- [x] 6.4 L2 用例（`live_server` fixture）覆盖新端点成功与 404 路径

## 7. 前端（research-ui）

- [x] 7.1 `api/types.ts` + `api/client.ts`：新增研报/执行/流的类型与方法
- [x] 7.2 新增 `ResearchView`：研报列表 + 详情（含证据来源）
- [x] 7.3 新增执行时间线组件：SSE 追加节点事件与终态
- [x] 7.4 导航栏接入研报入口；i18n 文案补齐
- [x] 7.5 前端测试：列表/详情渲染、SSE 追加、错误态、只读约束

## 8. 验证

- [x] 8.1 `cd backend && python -m pytest -q` 全绿；`ruff check . && ruff format --check .`
- [x] 8.2 `cd frontend && npm run typecheck && npm run test && npm run lint && npm run build`
- [x] 8.3 端到端纸面闭环冒烟：worker 跑一轮 → 产出提案 → 执行图成交（paper）→ 投影/审计可读
- [x] 8.4 全局确认无实盘/写工具残留；`openspec validate deep-agents-paper-loop --strict` 通过
