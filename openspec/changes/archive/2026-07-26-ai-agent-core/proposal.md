## Why

前四层已提供数据、指标/S/R、风控闸门与执行。本 change 把它们串成「会思考的交易」:AI Agent(日线)综合技术态势(#2 的指标+结构+S/R)与新闻/宏观面,以**左侧交易、找支撑/压力位**为主策略产出开/平仓建议,并经**风控执行层(#3/#4,默认纸面)**落地。LLM 采用**可插拔多供应商 + 本地 Ollama**抽象(design D10)。

## What Changes

- 新增**可插拔 LLM Provider**:统一接口,兼容 OpenAI/OpenAI 兼容端点/本地 Ollama;`RuleBasedProvider` 作为**离线确定性基线**(无需 LLM 即可跑通闭环并可测)。
- 新增**Agent 上下文构建**:把 K 线的指标末值、Top-N S/R 候选、当前价、可选新闻/宏观摘要组装为结构化上下文。
- 新增**Agent 决策**:输出结构化建议 `{action(open/close/hold), side, symbol, reference_price, reason, confidence}`,策略为左侧(近支撑低吸、近压力高抛/平)。
- 新增**Agent 执行路由**:仅对通过风控的决策下单(经 #4,默认纸面);hold 不动作。
- 新闻/宏观以**可注入接口 + 占位实现**接入(真实 `bitget-signal` 接线为后续 hook)。
- 纯逻辑 + 可注入 LLM 调用,离线可测;真实 LLM/HTTP 适配文档化但不在单测中联网。

## Capabilities

### New Capabilities
- `llm-provider`: 可插拔多供应商 + Ollama 抽象、配置校验、工厂;含规则基线 provider。
- `agent-context`: 指标/结构/S-R(+可选新闻)→ 结构化上下文。
- `agent-decision`: 左侧 S/R 策略的结构化开/平/持仓决策。
- `agent-execution`: 仅对通过风控的决策经执行层落地(默认纸面)。

### Modified Capabilities
<!-- 无 -->

## Impact

- **依赖**:复用 `indicators/levels/risk/execution/mcp_client`;LLM HTTP 适配用标准库 `urllib`,无新增第三方依赖。
- **代码**:`backend/src/market_data/llm.py`、`agent.py`;CLI 增加 `agent`(纸面演示)子命令。
- **对齐路线图**:实现 #5;记忆-反思(#6)、DL(#7)、前端(#9)不在本 change。
- **安全**:决策必过 #3/#4 风控闸门;默认纸面;LLM 密钥仅环境变量。
