## 1. 交易日志

- [x] 1.1 `memory.py`:`TradeRecord` dataclass(全字段)
- [x] 1.2 `TradeJournal(path)`:JSONL append/all/closed;加载往返一致

## 2. 特征与相似度

- [x] 2.1 `features_from_context(context)`:macd_sign/kdj_zone/dist_to_support/resistance/side
- [x] 2.2 `similarity(a,b)`:数值归一化距离 + 类别相等加权 → [0,1],无嵌入依赖

## 3. 记忆检索(a)

- [x] 3.1 `MemoryStore.retrieve(features, k, side=None)`:已平仓中 Top-K 相似
- [x] 3.2 方向过滤;空历史返回空列表

## 4. 反思引擎

- [x] 4.1 `Reflector.reflect(trade, complete=None)`:启发式 + 可选 LLM,失败回退
- [x] 4.2 `suggest_param_adjustments(trades, cfg)`(b):样本足够且表现差→建议;不足→空
- [x] 4.3 `distill_rules(trades)`(c):亏损模式→规则文本

## 5. 记忆整合

- [x] 5.1 `augment_context(context, memories, rules)`:加 memories/rules 字段
- [x] 5.2 无记忆时上下文仍可用(向后兼容)

## 6. CLI

- [x] 6.1 `memory` 子命令:载入日志 → 打印条数、Top 规则、参数建议

## 7. 测试

- [x] 7.1 日志追加/加载往返一致;closed 筛选
- [x] 7.2 相似度:同情境高、异情境低;检索 Top-K 与方向过滤;空历史空返回
- [x] 7.3 反思:启发式含盈亏要点;注入 LLM 抛错→回退
- [x] 7.4 参数自调:低胜率+足样本→建议;样本不足→空
- [x] 7.5 规则提炼:亏损模式→规则
- [x] 7.6 augment_context:注入字段;空记忆兼容
