# 引入 Deep Agents 研报层 + 确定性 LangGraph 执行层（Phase 1：纸面闭环）

## Why

上一轮已清空自研 AI Agent、执行与量化层，项目回到纯行情底座。现在以 **LangChain / LangGraph / Deep Agents** 重建 Agent 能力，并遵循一条硬边界：

> **LLM 只做"前置的深度市场研报与策略生成"（非确定性），下单执行与硬风控由零 LLM 的确定性 LangGraph 状态图接管。**

Phase 1 先打通「研究 → 结构化策略提案 → 确定性纸面执行 → 审计」的**自治闭环**（独立 worker 定时跑），并把研究产物与执行流在前端可视化，用来验证架构。实盘、人工审批闸门（HITL）与 Postgres 持久化留待 Phase 2。

Phase 2 前置风险（Python 兼容性）已在 spike 中排除：`deepagents 0.7.19 / langgraph 1.2.12 / langchain 1.4.3 / langgraph-checkpoint-sqlite 3.1.1` 在项目运行时 **Python 3.14.6** 上可安装、可导入，`StateGraph` + `SqliteSaver` + `interrupt/Command(resume)` 与 `create_deep_agent` 均实测可用。

## What Changes

- **新增依赖**：`deepagents`、`langgraph`、`langchain`、`langchain-checkpoint-sqlite`（`langgraph-checkpoint-sqlite`）。锁版本，CI 用同一 Python。
- **新增独立 worker 进程**：承载两层图与 APScheduler 自治循环；FastAPI 保持无状态 API，只读投影 + 转发/审批。
- **Tier 1 研究层（Deep Agents）**：`create_deep_agent(model, tools, subagents, middleware=[TodoListMiddleware()], backend, checkpointer, response_format=StrategyProposal)`；子代理 news / technical / macro / micro。
- **强类型契约 `StrategyProposal`**：研究层 `response_format` 产出、pydantic 校验、落盘 + 投影表。
- **Tier 2 执行层**：纯 `StateGraph(TypedDict)`，**零 LLM 节点**；风控闸门 + fail-closed；纸面 broker 撮合；每步写审计事件。
- **新增 API 端点**：研报列表/详情、研究/执行 run 的 SSE 流、执行 run 状态（本阶段只读，无实盘审批）。
- **前端**：新增「研报」浏览与「执行流」时间线（复用现有 SSE 管线）。
- **配置**：`config.py` 新增 agent/risk 段（MD_ 前缀），同步 `backend/.env.example`。

## Capabilities

### New Capabilities

- `agent-runtime`: 独立 worker 进程、LangGraph 运行时装配、SQLite checkpointer、定时自治循环、运行控制与配置。
- `research-agent`: Deep Agents 研究层（子代理、工具集、规划中间件、后端/记忆）。
- `strategy-proposal`: 研究产物的强类型契约、校验不变量与落盘/投影。
- `execution-graph`: 确定性执行状态图（校验 → 市场 → 前置检查 → 风控 → 定量 sizing → 建单 → 纸面提交 → 对账 → 审计；fail-closed）。
- `paper-broker`: 确定性纸面撮合、持仓与 PnL、权益更新。
- `research-ui`: 前端研报浏览 + 执行时间线（SSE），只读。

### Modified Capabilities

- `api-client`: 新增研报/执行/流的类型化 REST + SSE 客户端方法（现有客户端只覆盖行情/新闻/图表配置/告警）。

## Impact

**新增后端模块**（`backend/src/market_data/`）
- `agent/`（新包）：`runtime.py`（worker + 图装配 + checkpointer）、`research.py`（Tier1 create_deep_agent）、`tools.py`（把现有模块与 MCP 包成 LangChain 工具）、`execution.py`（Tier2 StateGraph）、`broker.py`（paper）、`proposal.py`（契约）、`store.py`（投影/审计读写）。
- worker 入口：`cli.py` 新增 `agent-worker` 子命令（或独立 `python -m market_data.agent.runtime`）。

**修改文件**
- `webapi.py`：新增只读/流式端点（挂到现有 app，不引入 LLM 调用）。
- `config.py` / `.env.example`：新增 agent/risk 配置。
- `pyproject.toml`：新增依赖 + 版本锁。
- `cli.py`：新增 worker 启动子命令。

**前端**
- `src/components/views/`：新增 `ResearchView` / 执行时间线组件；`api/client.ts` + `api/types.ts` 新增方法/类型；导航栏加入口。

**测试**
- Tier2（确定性）：纯单测覆盖每个节点与风控不变量（无 LLM）。
- 契约：`StrategyProposal` schema 校验测试。
- Tier1：以 fake/录制模型跑通装配（不打真实 API）；CI 不打外网。
- 新增 L2 端点用例（沿用 `live_server` fixture）。

**风险与边界**
- ⚠️ **本阶段不得有任何实盘下单路径**；broker 仅 paper，且不接入交易写工具。
- ⚠️ **Tier2 图内禁止 LLM 节点与可变外部工具**——需一条测试边界强制（否则"确定性"会腐化）。
- ⚠️ Phase 1 使用 **SQLite checkpointer**；跨进程 HITL 与 Postgres 留待 Phase 2。
- ⚠️ 研究层成本/延迟：定时 + 缓存，绝不进请求关键路径。
- 策略质量验证：本阶段不引入回测层，研报质量靠人工 review（已知取舍）。
