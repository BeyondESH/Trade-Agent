---
system_id: trading_loop
system_name: 决策与下单闭环
layers:
  - layer: backend-engine
    src_path: backend/src
    kb_path: .codemaker/codeindex/backend/src
  - layer: backend-invariants
    src_path: backend/tests
    kb_path: .codemaker/codeindex/backend/tests
  - layer: frontend-terminal
    src_path: frontend/src
    kb_path: .codemaker/codeindex/frontend/src
  - layer: frontend-journey
    src_path: frontend/tests
    kb_path: .codemaker/codeindex/frontend/tests
---

## 系统概述

决策与下单闭环是这套系统里唯一「可能真花钱」的链路：确定性分析给出价位依据、LLM 只做结构化取舍、执行层两层闸门决定是否放行、前端只负责把用户意图转成两步确认请求。它的正确性不靠人工验收，而靠离线不变式（不预测未来、不动真钱、失败可控）与浏览器旅程（真实链路里点一遍）双向锁定。

## 跨层数据流

```
frontend/src 用户动作 → POST /order（预览，返回 PENDING_TOKEN_TTL_SECONDS=300 令牌）
  → POST /order/confirm（令牌一次性）
    → backend/src/webapi.py → ExecutionEngine.place
      → risk.py:enforce_circuit_breaker → risk.py:RiskEngine.check   ← 两层闸门
        → execution.py:PaperBroker（默认）| LiveBroker(MCP order, reduce-only 平仓)
          → events.py:EventLog / memory.py:TradeJournal → agent 上下文回注
决策侧：/agent/cycle → agent.py:build_agent_context（levels.build_levels + 新闻摘要 + MemoryStore.retrieve k=3）
  → llm.py Provider → {action, side, symbol, reference_price, reason, confidence}（默认 hold）
验证侧：backend/tests 离线不变式（无前视/闸门双确认/熔断可重复）
  ∥ frontend/tests 旅程（paper 下单、kill switch、重置资金）
```

## 各层入口速览

| 层次 | 核心入口 | 文件 | 说明 |
|------|---------|------|------|
| backend-engine | `ExecutionEngine.place/close` | `backend/src/market_data/execution.py` | 唯一合法下单出口；`size=notional/price` |
| backend-engine | `enforce_circuit_breaker` / `RiskEngine.check` | `backend/src/market_data/risk.py` | 回撤 15% 强平；margin 5% / leverage 100 / max_adds 3 |
| backend-engine | `build_levels` / `build_agent_context` | `levels.py` / `agent.py` | S/R 必须确定性，LLM 不得臆造价位 |
| backend-invariants | `test_execution.py` / `test_risk.py` | `backend/tests/` | 默认 PaperBroker、双确认、熔断平仓 |
| frontend-terminal | 两阶段下单 + kill-switch | `frontend/src/lib/*`、`components/views/**` | `/order` → `/order/confirm`；`PUT /control` |
| frontend-journey | `alerts` / `trading` spec | `frontend/tests/e2e/*.spec.ts` | 真实链路点一遍，不打真实账户 |

## 各层知识库链接

| 层次 | 概览文档 | 符号索引 |
|------|---------|---------|
| backend/src | [`backend/src/_overview.md`](../backend/src/_overview.md) | Codemap MCP |
| backend/tests | [`backend/tests/_overview.md`](../backend/tests/_overview.md) | Codemap MCP |
| frontend/src | [`frontend/src/_overview.md`](../frontend/src/_overview.md) | Codemap MCP |
| frontend/tests | [`frontend/tests/_overview.md`](../frontend/tests/_overview.md) | Codemap MCP |

> ⚠️ 跨层红线：任何新增下单入口（端点、调度任务、GM 工具）MUST 复用 `ExecutionEngine.place/close`，禁止直连 `McpDataClient.call_tool("order", …)`；实盘 MUST 同时满足 live 开关与二次确认。
