## 1. LLM Provider 抽象

- [x] 1.1 `llm.py`:`AgentDecision`、`ProviderConfig`(校验)、`LLMProvider` 协议
- [x] 1.2 `RuleBasedProvider`:左侧 S/R 确定性逻辑
- [x] 1.3 `LLMTextProvider(complete, cfg)`:提示构造 + JSON 解析,失败降级 hold
- [x] 1.4 `make_provider` 工厂;`build_ollama_complete`/`build_openai_complete`(urllib,文档化)

## 2. Agent 上下文

- [x] 2.1 `agent.py`:`build_agent_context(df, symbol, timeframe, news=None)`(指标末值 + Top-N S/R + price)
- [x] 2.2 支持可注入新闻/宏观文本(可空)

## 3. Agent 决策与执行

- [x] 3.1 `TradingAgent.run(df, symbol, timeframe, news) -> AgentDecision`
- [x] 3.2 `TradingAgent.act(decision, price)`:open→engine.place;close→engine.close;hold→None
- [x] 3.3 仅经执行层(风控闸门),不绕过

## 4. CLI

- [x] 4.1 `agent` 子命令:从 Store 读数 → run 决策 → 打印 → (纸面)act

## 5. 测试

- [x] 5.1 规则基线:近支撑→open long;近压力→open short;远离→hold
- [x] 5.2 LLMTextProvider:注入返回合法 JSON→对应决策;非法→hold
- [x] 5.3 上下文:含 price/indicators/levels;新闻可空/可注入
- [x] 5.4 执行路由:open 经风控建仓;风控拒绝不建仓;hold 不动作
- [x] 5.5 配置越界报错
- [x] 5.6 用 #1 真实数据跑 `agent`(纸面)端到端
