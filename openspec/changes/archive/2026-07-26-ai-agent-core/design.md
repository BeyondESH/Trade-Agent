## Context

已有:`indicators.compute`/`levels.build_levels`(#2)、`risk.py`(#3)、`execution.py`(#4)、`mcp_client`(#1)。路线图 design D4/D10:S/R 由确定性算法产出后喂 LLM,LLM 只做取舍择时;LLM 可插拔、兼容主流供应商 + 本地 Ollama。本 change 把「思考」层接上,默认纸面、决策必过风控。

## Goals / Non-Goals

**Goals:**
- 可插拔 LLM Provider(多供应商 + Ollama),含规则基线以离线跑通与测试。
- 结构化上下文(指标+S/R+可选新闻)。
- 左侧 S/R 决策(open/close/hold + 理由 + 置信度)。
- 仅对通过风控的决策落地(经 #4,默认纸面)。

**Non-Goals:**
- 不做记忆-反思(#6)、不做 DL(#7)、不做前端(#9)。
- 不在单测中联网调用真实 LLM 或真实 `bitget-signal`(适配文档化)。
- 不做多周期/多标的组合调度(单 symbol 单次决策为主)。

## Decisions

### D1:Provider 抽象与决策契约
- `AgentDecision(action, symbol, side, reference_price, reason, confidence)`;action ∈ {open, close, hold}。
- `LLMProvider` 协议:`propose(context: dict) -> AgentDecision`。
- `ProviderConfig(kind, model, base_url, api_key, near_pct, min_strength, leverage, category)`,校验取值。

### D2:两个 Provider
- `RuleBasedProvider`:确定性左侧逻辑(离线基线 + 测试锚点)。
  - 取最近支撑(现价下方最高支撑)与最近压力(上方最低压力)。
  - 若价距支撑 ≤ `near_pct` 且强度 ≥ `min_strength` → open long @ 支撑。
  - 否则若价距压力 ≤ `near_pct` 且强度达标 → open short @ 压力。
  - 否则 hold。
- `LLMTextProvider(complete, cfg)`:注入 `complete(system,user)->str`;构造含策略说明与 JSON schema 的提示,解析返回 JSON 为 `AgentDecision`;解析失败 → hold(容错,呼应弱模型降级)。

### D3:适配器与工厂
- `make_provider(cfg, complete=None)`:`kind="rule"` → RuleBasedProvider;其余 → LLMTextProvider(complete)。
- `build_ollama_complete(cfg)` / `build_openai_complete(cfg)`:用标准库 `urllib` 的薄适配(文档化,不在单测联网)。

### D4:上下文构建
`build_agent_context(df, symbol, timeframe, news=None) -> dict`:`indicators.compute(df).iloc[-1]` 取末值、`levels.build_levels(df, top_n)`、当前价、可选新闻文本。levels 以 dict 列表放入(与 LLM 层解耦)。

### D5:执行路由与安全
`TradingAgent(provider, engine, cfg)`:
- `run(df, symbol, timeframe, news) -> AgentDecision`。
- `act(decision, price) -> ExecutionResult | float | None`:open→`engine.place`(经 #3/#4 风控闸门);close→`engine.close`;hold→None。
- **只经执行层下单**,不绕过风控;默认纸面。

## Risks / Trade-offs

- **LLM 非确定性/幻觉** → S/R 由算法出、LLM 只择时;解析失败降级为 hold;决策仍过风控闸门。
- **弱本地模型工具/长上下文不足** → 上下文精简为末值 + Top-N;JSON 解析失败容错。
- **真实新闻/信号未接** → 以接口 + 占位实现预留,后续 hook `bitget-signal`。
- **纸面无滑点/费用** → 沿用 #4 简化,标注。

## Open Questions

- 真实 LLM 的结构化输出稳定性(需 few-shot/JSON mode)——接线时按供应商调优。
- `bitget-signal` 的调用形态(独立包/CLI/MCP)——接入 #5 时确认;本 change 只留注入点。
- 日线决策频率与触发(定时/收盘)——归 #8 自动化编排。
