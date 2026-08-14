## Context

#5 提供 `agent.build_agent_context`/`TradingAgent` 与 `llm` provider,#3/#4 提供风控执行。design D5 要求记忆-反思三层(a/b/c)且先做 a、再 c、后 b。本 change 落地记忆回路,但保持**依赖极轻**:不引入向量库/嵌入模型,用情境特征的数值相似度实现 RAG 式检索,确定性可测。参数自调只产出建议,防过拟合。

## Goals / Non-Goals

**Goals:**
- 持久化交易日志(可加载、可增量)。
- 相似历史交易检索(a),供注入决策。
- 反思生成 + 参数建议(b) + 规则提炼(c)。
- 记忆/规则注入决策上下文,与 #5 无缝衔接。

**Non-Goals:**
- 不引入向量数据库/嵌入模型(用轻量特征相似度)。
- 不自动应用参数变更(仅建议)。
- 不做 DL(#7)、自动化调度(#8)、前端(#9)。
- 不修改已归档模块的既有行为。

## Decisions

### D1:交易记录与存储
- `TradeRecord(id, symbol, timeframe, side, entry_price, exit_price, notional, margin, leverage, pnl, opened_at, closed_at, strategy, reason, reflection, features: dict)`。
- `TradeJournal(path)`:JSONL 追加/加载;`append`、`all`、`closed`(已平仓)。

### D2:情境特征与相似度
- `features_from_context(context) -> dict`:如 `macd_sign`(-1/0/1)、`kdj_zone`(low/mid/high)、`dist_to_support_pct`、`dist_to_resistance_pct`、`side`。
- `similarity(a, b) -> float`:数值特征用归一化距离转相似度,类别特征(side/zone/sign)相等加权;组合为 [0,1]。无嵌入依赖。

### D3:记忆检索(a)
- `MemoryStore(journal).retrieve(features, k=3, side=None) -> list[TradeRecord]`:在**已平仓**记录中按相似度降序取 Top-K(可按方向过滤)。

### D4:反思引擎
- `Reflector.reflect(trade, complete=None) -> str`:默认启发式(盈亏、方向、近何位、MACD 情境);若注入 `complete` 则用 LLM 生成,失败回退启发式。
- `suggest_param_adjustments(trades, cfg) -> dict`(b):据近期已平仓样本统计(如近支撑做多胜率),给出如 `min_strength +1`、`near_pct` 收窄等**建议**(不自动应用),样本不足则空。
- `distill_rules(trades) -> list[str]`(c):从亏损模式提炼规则文本(如「MACD 强负时避免做多」)。

### D5:记忆整合
- `augment_context(context, memories, rules) -> context`:向上下文加入 `memories`(相似交易摘要)与 `rules`(经验规则),供 #5 的 `LLMTextProvider` 自然纳入提示;`RuleBasedProvider` 可忽略(向后兼容)。

## Risks / Trade-offs

- **无嵌入的相似度较粗** → 情境特征针对性设计,够用且可解释;后续可换嵌入而不改接口。
- **参数自调过拟合** → 仅建议、需样本量门槛、由上层灰度应用。
- **反思质量依赖 LLM/启发式** → 启发式基线保证可用与可测,LLM 为增强。
- **日志增长** → JSONL 简单;后续可迁 Parquet/DB(接口不变)。

## Open Questions

- 相似度权重与检索 K 的默认值需实盘/回测校准。
- 参数建议的样本量门槛与应用策略(灰度/人工确认)——归上层/#8。
- 是否需要按 symbol/timeframe 分库——当前单库 + 字段过滤,后续按需拆。
