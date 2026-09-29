# Design — Deep Agents 研报层 + 确定性 LangGraph 执行层（Phase 1）

## Context

上一轮删除后，平台是纯行情/指标/新闻底座，**没有**任何 Agent、执行或风控代码。本变更是"两条新链路 + 一条硬边界"：

```
                ┌───────── Tier 1 · 研究与策略（非确定性 / LLM）─────────┐
                │  Deep Agents (create_deep_agent) → StrategyProposal   │
                └───────────────────────────┬───────────────────────────┘
                                            │  强类型契约（pydantic）
                ┌───────────────────────────▼───────────────────────────┐
                │  Tier 2 · 执行与风控（确定性 / 零 LLM / fail-closed）  │
                │  StateGraph: validate→market→checks→risk→size→...     │
                └───────────────────────────────────────────────────────┘
```

已通过 spike 验证：`deepagents 0.7.19` 的 `create_deep_agent(...)` **返回 `CompiledStateGraph`**——即普通 LangGraph 图，checkpointer / 流式 / `Command(resume=)` 全部适用。这决定了"两层共用一套运行时"是可行的。

## Goals / Non-Goals

**Goals**
- Tier 1 能产出**结构化、可校验、可追溯**的 `StrategyProposal`。
- Tier 2 是**零 LLM 的确定性状态图**，任何异常都 fail-closed（宁可不下单）。
- 独立 worker 定时自治跑闭环；FastAPI 无状态。
- 前端可读研报与执行时间线。
- 全链路可审计（每步事件落盘）。

**Non-Goals（明确排除，留 Phase 2）**
- 实盘下单、`interrupt_on` 人工审批、Postgres checkpointer。
- 跨进程 HITL resume。
- 回测/策略质量量化层。
- 用 Agent Server（`langgraph-cli`）替代自建 worker。

## Decisions

### 决策 1：两层用同一 LangGraph 运行时，但**物理隔离**

Tier 1 与 Tier 2 是**两个独立编译的图**，不共享 state，只通过 `StrategyProposal` 契约传递：

```
research graph                     execution graph
  thread_id = research:<id>          thread_id = exec:<proposal_id>
  state: {messages, todos, files}    state: TypedDict（纯数据，无 messages）
  checkpointer: SQLite               checkpointer: SQLite（同库不同 thread）
```

理由：Tier 2 的 state 必须是**纯可校验数据 + 无对话历史**，否则 LLM 痕迹与不确定性会渗入执行层。两个图物理分开，是"确定性"最直接的保证。

### 决策 2：契约 `StrategyProposal` 是唯一跨层接口，且带 TTL

研究层经 `create_deep_agent(response_format=StrategyProposal)` 产出，落盘到 `structured_response`。字段（草案）：

```
StrategyProposal
├─ proposal_id / produced_at / expires_at      # ★ TTL：过期直接拒
├─ symbol / category / timeframe
├─ action: open_long | open_short | close | flat
├─ entry: {kind: market|limit, price?}
├─ stop_loss? / take_profit?
├─ confidence: 0..1
├─ horizon / rationale / evidence[]            # 证据引用（可追溯）
└─ provenance: model / prompt_ver / research_thread_id
```

Tier 2 **重新独立校验**：schema → 未过期 → 市场可交易 → 风控。**LLM 给的仓位/杠杆一律忽略**，由确定性 sizing 计算。

### 决策 3：Tier 2 零 LLM，且用"测试边界"强制

执行图节点只做纯计算与 I/O。为防腐化，加一条**契约测试**：扫描 `agent/execution.py` 与 `agent/broker.py`，断言不含任何 LLM/`create_agent`/`create_deep_agent` import，且图中节点集合为白名单。这是把"确定性"从口头约定变成 CI 门禁。

### 决策 4：fail-closed 是默认，不是分支

`risk_gate` 的任一条件不满足（数据缺失、价格陈旧、超杠杆、超敞口、熔断、kill-switch）→ 走 `fail_closed` 节点 → 写审计 → END。**没有"猜一个默认值继续"的路径。**

### 决策 5：worker 独立进程 + APScheduler（复用现有调度经验）

worker 复用项目已有的 APScheduler 模式，跑一个自治循环：

```
每 interval：
  ① 选择标的/周期
  ② 跑 research graph（thread_id=research:<ts>）→ StrategyProposal
  ③ 若 proposal 有效：跑 execution graph（thread_id=exec:<pid>）→ paper 成交
  ④ 写投影表（供 API/UI 读）
```

Phase 1 因为**只纸面**，循环可无人值守；Phase 2 开实盘时才在 execution 图插入 `interrupt_on` 审批（届时改为共享 Postgres checkpointer + 跨进程 resume）。

### 决策 6：工具集只读，且复用现有资产

Tier 1 的工具全部**只读**（行情/指标/新闻/MCP 分析），**不暴露任何交易写工具**：

| 工具组 | 来源 | 形态 |
|---|---|---|
| 技术面 | `indicators` / `levels` / `smc` / `structure` | `@tool` 薄封装（确定性） |
| 新闻/情绪 | `newsfeed` / `news_broker` / `blockbeats` | `@tool` |
| 行情 | `store` / REST（`tickers`/`books`/`funding`/`mark-price`） | `@tool` |
| Bitget 分析/交易 | `mcp_client.py`（MCP stdio） | 先只接**只读/分析**类；写类工具在 Phase 1 一律不接 |

### 决策 7：Phase 1 用 `SqliteSaver`；`FilesystemBackend` 明确不用

- checkpointer：`langgraph-checkpoint-sqlite` 的 `SqliteSaver`（开发/单机足够）。
- Deep Agents backend：`StateBackend()`（默认，thread 内）；跨运行记忆用 `memory=[...]` 文件 + `StoreBackend`（如需）。**禁用 `FilesystemBackend`/`LocalShellBackend`**——官方明确不适合 Web 服务。

### 决策 8：流式用 `stream_events(version="v3")`（新代码推荐）

LangGraph 1.2 起，typed projections（`stream.messages/values/interrupts`）是新应用推荐路径；deepagents 额外提供 `stream.subagents`，正好用于"每个子代理一节研报"的前端展示。FastAPI 侧用 `StreamingResponse` + async generator（异步路由 + `AsyncSqliteSaver`）。

## Risks / Trade-offs

- **风险：3.14 兼容性** → 已 spike 排除（装/跑/import 全通）。缓解：锁版本 + CI 同 Python。
- **风险：Tier2 被 LLM 污染** → 决策 3 的 CI 边界。
- **风险：研究层慢/贵/不稳** → 定时 + 缓存；research 图失败不影响执行图（无提案即无执行）。
- **风险：SqliteSaver 并发写**（worker 写 + API 读）→ 单写者模型：只有 worker 写 checkpoint，API 只读投影表；投影表与 checkpoint 分离。
- **权衡：Phase 1 无 HITL** → 因为是纸面，可接受；Phase 2 必须补。
- **权衡：无策略质量验证** → 接受，靠人工 review 研报。
- **未知：模型 provider** → 用 `provider:model` 字符串配置（`langchain-anthropic` 已是 deepagents 依赖；如用 OpenAI 需加 `langchain-openai`）。见 Open Questions。

## Migration Plan

纯新增，无数据迁移。上线顺序：依赖 → 契约 → Tier2（纸面，先能单测）→ Tier1 装配（fake 模型）→ worker 循环 → API/UI → 接真实模型。

## Resolved Questions（实现前已拍板）

1. **模型 provider/型号**：配置项 `MD_AGENT_MODEL`（`provider:model` 字符串），默认 `anthropic:claude-sonnet-4-6`；显式加入 `langchain-anthropic` 依赖（不依赖传递依赖）。可随时改配置切换 provider。
2. **研究循环节奏**：`MD_AGENT_LOOP_SECONDS` 默认 `900`；覆盖标的复用 `MD_SYMBOLS`，周期复用 `MD_TIMEFRAMES` 的首项。
3. **子代理划分**：Phase 1 先落 2 个——`news-analyst` 与 `technical-analyst`；macro/micro 留待后续按需加。
4. **投影表存储**：沿用 `events.py` 的 JSONL 模式 + 进程内索引，不引入新依赖（SQLite 仅用于 checkpointer）。
